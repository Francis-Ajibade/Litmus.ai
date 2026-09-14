"""FastAPI shell for Litmus.

This is the ONLY place FastAPI is allowed to appear. It's a thin HTTP layer over
the framework-agnostic pieces: the engine in main/ and the sandbox in sandbox/.
The web rules live here; neither of those imports FastAPI — that's the seam that
lets either side change independently.

Conversation state lives on the server: main.store holds the RunState between
requests and the database holds what happened once a run finishes. The browser
carries only a session_id.

Run it in dev with:  uv run uvicorn api.app:app --reload --port 8000
"""

from __future__ import annotations
from email.policy import default
from optparse import Option
from random import choices
from datetime import datetime, timezone
from typing import List, Literal, Optional

# Before any project import: persistence and main both read env vars while they
# are being imported, and import order should not decide whether that works.
from dotenv import load_dotenv
load_dotenv(override=True)

from dataclasses import asdict
from uuid import UUID, uuid4
import json

from agents import Runner
from fastapi import Body, Depends, FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from persistence import create_session, create_style, update_style, list_styles, get_style
from sandbox import SandboxResult
from main.samples import PEP8_SAMPLE
from main import Blueprint, RunState, classify_input, get_state, save_state, litmus, run_engine, generate_blueprint, try_expression
from api.deps import CurrentUser, get_current_user

def client_ip(request:Request) -> str:
    """The caller's real IP address.

    Behind the tunnel, request.client.host is ALWAYS 127.0.0.1 — cloudflared is
    what connects to uvicorn, so every request on earth looks like the same
    client. Limiting on that would put the whole internet in one bucket and lock
    everybody out at the 5th run of the day. Cloudflare puts the true client IP
    in CF-Connecting-IP.
    
       Trusting a header is only safe because uvicorn is NOT on a public port: the
    tunnel is the sole way in, and Cloudflare sets this header itself, replacing
    anything a caller tried to send. On the droplet, where uvicorn binds a public
    interface, this becomes forgeable and must be re-thought.
    """

    return(
        request.headers.get("CF-Connecting-IP")
        or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown"))
        

limiter = Limiter(key_func=client_ip)

app = FastAPI(title="Litmus API")

app.state.limiter = limiter

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
         "https://litmus-ai.org",
          "https://litmus-ai-ruby.vercel.app"
        
        ],
        
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

class BlueprintRequest(BaseModel):
    problem: str
    style: str = ""
    prior: Blueprint | None = None   # the blueprint the browser is holding, echoed back
    feedback: str = ""          # "" on the first turn; a refinement on later turns

class RunRequest(BaseModel):
    problem: str
    style: str = ""
    blueprint: Blueprint        # the approved blueprint the browser locked

class CheckRequest(BaseModel):
    """Just the problem. The style question has not been asked yet at this point —
    the whole reason this endpoint exists is to run BEFORE it."""
    problem: str

class TryRequest(BaseModel):
    """One REPL-style poke at code that has ALREADY been generated and verified.

    `code` is sent from the browser rather than regenerated, so what the user
    runs is byte-identical to what they're looking at in the code panel.
    """
    code: str
    expression: str


class StyleChoiceItem(BaseModel):
    id: str
    label: str
    hint: str
    off: bool = False

# class ButtonChoiceItem(BaseModel):
#     id: str
#     hint : str


def ago(when: datetime) -> str:
    days = (datetime.now(timezone.utc) - when).days
    if days <= 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 30:
        return f"{days} days ago"
    months = days // 30
    return "a month ago" if months == 1 else f"{months} months ago"


def saved_style_options(user_id: str) -> list[StyleChoiceItem]:
    """The saved styles as menu rows. The date is the hint, not the description —
    a style is titled from its own description, so showing both reads as a stutter."""
    return [
        StyleChoiceItem(id=row["style_id"], label=row["title"], hint=ago(row["updated_at"]))
        for row in list_styles(user_id)
    ]


def style_choices(user_id: str) -> list[StyleChoiceItem]:
    """The style menu. "Choose style" stays off until this user has saved one."""
    saved = list_styles(user_id)
    return [
        StyleChoiceItem(
            id="default",
            label="Default",
            hint="PEP 8  snake_case, docstrings, type hints",
        ),
        StyleChoiceItem(
            id="describe or paste code",
            label="Describe or paste code",
            hint="name the rules you want, or paste code to copy the style from",
        ),
        StyleChoiceItem(
            id="choose style",
            label="Choose style",
            hint=f"{len(saved)} saved" if saved else "nothing saved yet",
            off=not saved,
        ),
    ]


STYLE_QUESTION = "For the next step, choose how you would like your code formatted."

OPTIONS = "default \n Describe or paste Code \n Choose from list of styles" 


class Session(BaseModel):
    stage: str = "idle"          

class Event(BaseModel):
    kind: str = "text"
    text: str
    type: Optional[str] = None          # 💡 Added = None to make it safe against undefined fields
    code_pasted: Optional[str] = None   # 💡 Added = None to make it safe against undefined fields


class Msg(BaseModel):
    
    role: Literal['user', 'litmus']
    text: str
    pasted: str | None = None
    # None on an ordinary reply. Options are the exception, not the rule — a
    # default here would hang a style menu off every text in the thread.
    options: list[StyleChoiceItem] | None = None
    choices : list[str] | None = None
    hint : str | None  = None


class SavedStyle(BaseModel):
    """A row in the style menu. No code — that arrives when one is opened."""
    style_id: str
    title: str
    description: str | None = None
    updated_at: datetime


class SavedStyleDetail(SavedStyle):
    sample_code: str | None = None


class ChatResponse(BaseModel):
    msgs: list[Msg]
    session_id: str | None = None
    stage: str
    code: str | None = None
    diff: str | None = None

def get_picked(picked : str ) -> list[str]:
    if picked == "default" :
        return ["Restyle", "Continue"]
    return ["Restyle", "Save & Continue", "Continue"]

def serialize_result(result : SandboxResult) -> dict:

    new_result = asdict(result)
    new_result.update({'all_passed': result.all_passed})
    return new_result
    

DECLINE = (
    "I help with coding problems — try pasting a coding question, "
    "an assignment, or the code that's breaking."
)

# Only used when nothing else set a style — a described style is never replaced.
DEFAULT_STYLE = (
    "PEP 8: snake_case names, four-space indent, a short docstring on each "
    "public function or class, and type hints on parameters and return values."
)

ACTION_REPLIES = {
    "continue": (
        "Locked in. Reading the problem and drafting the contract before I "
        "write anything."
    ),
}

def save_current_style(state: RunState, user_id: str) -> str:
    """Save the style now in force, and return the sentence to say about it."""
    # Titled from the style itself — there is nowhere to ask for a name yet, and
    # the same style saved twice should update one row rather than make two.
    title = (state.style or DEFAULT_STYLE)[:40].strip()
    sample = state.style_sample or PEP8_SAMPLE

    created, payload = create_style(user_id, title, state.style, sample)
    if not created:
        update_style(payload["style_id"], user_id, state.style, sample)

    state.style_id = payload["style_id"]
    verb = "Saved" if created else "Updated"
    return f'{verb} this style as "{title}". ' + ACTION_REPLIES["continue"]


def saved_style_note(row: dict) -> str:
    # What Litmus reads in place of the button press. The style is already in
    # force, so it should describe it — restyling here would redo a finished job.
    return (
        f'[The user picked "{row["title"]}" from their saved styles. It is already '
        "applied: the code in the right pane is that style. Describe it in a sentence "
        "or two. Do not call restyle_code unless they ask for a change.]\n\n"
        f'Saved description: {row["description"] or "(none)"}'
    )


async def run_litmus(content: str, state: RunState) -> str:
    """Run one Litmus turn against `state`, mutate it in place, return the reply.

    `state` is not returned: the tools write through wrapper.context to this same
    object, so the caller's reference is already up to date when this returns.
    """
    before = state.style_sample

    history = state.transcript + [{"role": "user", "content": content}]
    result = await Runner.run(litmus, history, context=state)

    state.transcript = result.to_input_list()
    if state.style_sample != before:
        state.style = result.final_output

    return result.final_output

def set_transcript(
    state: RunState,
    user_content: str | None = None,
    litmus_content: str | None = None,
) -> None:
    
    turns = []
    if user_content is not None:
        turns.append({"role": "user", "content": user_content})
    if litmus_content is not None:
        turns.append({"role": "assistant", "content": litmus_content})

    state.transcript = state.transcript + turns


def is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except ValueError:
        return False


def require_uuid(value: str, detail: str) -> str:
    # Postgres raises on a bad uuid cast rather than matching nothing, so a
    # malformed id has to be turned away before it reaches a query.
    if not is_uuid(value):
        raise HTTPException(status_code=404, detail=detail)
    return value


def load_owned_state(session_id: str, user: CurrentUser) -> RunState:
    require_uuid(session_id, "Session not found.")

    # 404 rather than 403 for someone else's session — a wrong owner should not
    # confirm the id exists.
    state = get_state(session_id)
    if state is None or state.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Session not found.")
    return state


def add_msgs(state: RunState, msgs: list[Msg]) -> None:
    state.msgs.extend(m.model_dump() for m in msgs)


def chat_response(
    state: RunState,
    msgs: list[Msg],
    session_id: str | None,
) -> ChatResponse:
    """Build the response from the state, so the derived fields are derived once.

    session_id is passed rather than read off the state: the decline path hands
    back the id it was GIVEN, which is None on a first turn, because nothing was
    saved and the minted id would 404 forever.
    """
    return ChatResponse(
        msgs=msgs,
        session_id=session_id,
        stage=state.stage,
        code=state.style_sample or (PEP8_SAMPLE if state.stage != "idle" else None),
        diff=state.style_diff,
    )


@app.post("/api/chat")
async def litmus_chat(
    event: Event,
    session_id: str | None = Body(default=None),
    user: CurrentUser = Depends(get_current_user),
) -> ChatResponse:
    content = event.text
    entering_styling = False
        
    if session_id is None:
        # The id is minted here, not by Postgres, so save_state has a key from the
        # very first turn — the transcript survives a clarification exchange that
        # never earns a database row.
        state = RunState(session_id=str(uuid4()), user_id=user.user_id)
    else:
        state = load_owned_state(session_id, user)

    if event.kind == "action" and state.stage == "styling":
        # Normalised so a button id and a hand-sent string can't diverge.
        action = event.text.strip().lower()

        if action in ("continue", "save & continue"):
            if not state.style:
                state.style = DEFAULT_STYLE
            reply = (
                save_current_style(state, user.user_id)
                if action == "save & continue"
                else ACTION_REPLIES["continue"]
            )
            state.stage = "accepted"
            msgs = [Msg(role="user", text=event.text), Msg(role="litmus", text=reply)]

        # A bare style id — Accept in the saved-style overlay.
        elif is_uuid(action):
            row = get_style(action, user.user_id)

            if row is None:
                reply = "That style isn't saved any more — pick another."
                msgs = [
                    Msg(role="user", text="Use a saved style"),
                    Msg(role="litmus", text=reply, options=style_choices(user.user_id)),
                ]
                set_transcript(state, user_content="Use a saved style", litmus_content=reply)
            else:
                state.style = row["description"] or ""
                state.style_sample = row["sample_code"]
                state.style_id = row["style_id"]
                state.style_diff = None
                # run_litmus writes the transcript itself, so no set_transcript here —
                # the turn would otherwise land twice.
                reply = await run_litmus(saved_style_note(row), state)
                msgs = [
                    Msg(role="user", text=f"Use my saved style: {row['title']}"),
                    Msg(role="litmus", text=reply, choices=["Restyle", "Continue"]),
                ]

            add_msgs(state, msgs)
            save_state(state)
            return chat_response(state, msgs, session_id)

        elif action == "describe or paste code":
            reply = "in the composer below write down the description or paste how you would like your code to be formatted"
            msgs = [Msg(role="user", text=event.text), Msg(role="litmus", text=reply)]

        else:
            picked = get_picked(event.text)
            # one string for both, so the thread and the transcript can't drift
            reply = f"Would you like to {' or '.join(picked)}?"
            msgs = [Msg(role="user", text=event.text), Msg(role="litmus", text=reply, choices=picked)]

        set_transcript(state, user_content=event.text, litmus_content=reply)
        add_msgs(state, msgs)
        save_state(state)
        return chat_response(state, msgs, session_id)

    if state.stage == "idle" and event.kind == "message":
        verdict = await classify_input(event.text)

        if verdict == "not_coding":
            msg = [Msg(role="user", text=event.text)]
            msg.append(Msg(role="litmus", text= DECLINE))
            return chat_response(state, msg, session_id)

        if verdict == "too_vague":
            content = f"{event.text}\n\n[Note: nothing testable in this yet.]"
        else:
            state.problem = event.text
            state.title = event.text[:60]
            create_session(
                state.session_id, user.user_id, state.problem, state.title, course_id=None
            )
            state.stage = "styling"
            entering_styling = True

    reply = await run_litmus(content, state)
    pasted = event.code_pasted if event.code_pasted else None
    msgs = [Msg(role="user", text=event.text, pasted=pasted)]
    choices = get_picked("Restyle") if event.type else None
    msgs.append(Msg(role="litmus", text=reply, choices=choices))

    if entering_styling:
        # Sent on the turn the question is ASKED, not on every styling turn — a
        # menu resent each turn stacks a fresh copy in the thread and a fresh
        # assistant turn in the transcript.
        set_transcript(state, litmus_content=STYLE_QUESTION + OPTIONS)
        msgs.append(Msg(role="litmus", text=STYLE_QUESTION, options=style_choices(user.user_id)))

    add_msgs(state, msgs)
    save_state(state)
    return chat_response(state, msgs, state.session_id)
    

@app.get("/api/session/{session_id}")
def get_session(
    session_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> ChatResponse:
    state = load_owned_state(session_id, user)
    # Msg lives here, so the dicts only become models on the way out.
    msgs = [Msg.model_validate(m) for m in state.msgs]
    return chat_response(state, msgs, session_id)


@app.get("/api/styles")
def get_styles(user: CurrentUser = Depends(get_current_user)) -> list[SavedStyle]:
    return [SavedStyle(**row) for row in list_styles(user.user_id)]


@app.get("/api/styles/{style_id}")
def get_one_style(
    style_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> SavedStyleDetail:
    # Opening a style is a read, not a turn: no transcript, no Msg, no state.
    require_uuid(style_id, "Style not found.")
    row = get_style(style_id, user.user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Style not found.")
    return SavedStyleDetail(**row)


@app.post("/api/try")
@limiter.limit("30/hour")
def try_input(request: Request, req: TryRequest) -> dict:
    """Run one expression against existing code. NO model call — this is a
    sandbox run only, so it costs a couple of seconds and zero tokens.

    Errors are returned as data, not raised: a SyntaxError in the user's
    expression is the most useful thing we can show them, so it comes back in
    `output` rather than as a 500.
    """
    expression = req.expression.strip()
    if not expression:
        raise HTTPException(status_code=422, detail="Expression is empty.")
    if len(expression) > 2000:
        raise HTTPException(status_code=422, detail="Expression is too long.")

    try:
        result = try_expression(req.code, expression)
    except Exception as e:
        print(f"sandbox error logged safely: {e}")
        raise HTTPException(status_code=503, detail="Could not reach the sandbox right now.")

    failed = [t for t in result.tests if t["outcome"] != "passed"]
    return {
        "expression": expression,
        "output": result.captured_stdout or (failed[0]["text"] if failed else ""),
        "ok": result.all_passed,
        "timed_out": result.timed_out,
        "duration_ms": result.duration_ms,
    }

