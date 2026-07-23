"""FastAPI shell for CodeRace.

This is the ONLY place FastAPI is allowed to appear. It's a thin HTTP layer over
the framework-agnostic pieces (persistence now, the agent pipeline later). The
web rules live here; the storage rules live in persistence/. Neither imports the
other's framework — that's the seam that lets either side change independently.

Run it in dev with:  uv run uvicorn api.app:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager




from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from persistence import add_to_waitlist, init_db
from dataclasses import asdict
from sandbox import SandboxResult, run_in_sandbox
from main import LITMUS_MODEL, MODELS, blueprint_to_text, explain_failure, generate_blueprint, generate_solution, generate_tests, test_spec_from_blueprint


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once on startup: make sure the tables exist so a fresh clone just
    # works. (This is the modern replacement for the old @app.on_event startup.)
    init_db()
    yield


app = FastAPI(title="CodeRace API", lifespan=lifespan)

# The React dev server (Vite) runs on a DIFFERENT origin (http://localhost:5173)
# than this API (http://localhost:8000). Browsers block cross-origin requests
# unless the server explicitly opts in — that mechanism is CORS. In dev we allow
# the Vite origin. (We'll tighten this to the real domain in production.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Waitlist  —  YOUR EXERCISE is the two pieces below.
# ---------------------------------------------------------------------------

#BaseModel: This is a blueprint provided by Pydantic. It tells FastAPI, 
# "Expect an incoming JSON object that looks exactly like this class."
#the base model gives us access to pyndatic models like EmailStr 
class WaitlistSignup(BaseModel):
    """The JSON body of a POST /api/waitlist request.

    TODO(you): declare a single field — `email` — of type `EmailStr`.

    That one line does a surprising amount of work: FastAPI parses the incoming
    JSON body into this model, and if `email` is missing or isn't a valid address,
    it rejects the request with a 422 error *before your handler ever runs*. You
    never hand-write "if not valid email" — the type IS the validation.
    """
    # TODO(you): email: EmailStr
    email : EmailStr


class BlueprintRequest(BaseModel):
    problem: str
    style: str = ""
    prior: dict | None = None   # the blueprint the browser is holding, echoed back
    feedback: str = ""          # "" on the first turn; a refinement on later turns


class RunRequest(BaseModel):
    problem: str
    style: str = ""
    blueprint: dict             # the approved blueprint the browser locked



def serialize_result(result : SandboxResult) -> dict:

    new_result = asdict(result)
    new_result.update({'all_passed': result.all_passed})
    return new_result
    
    # asdict(result), then set ["all_passed"] = result.all_passed

@app.post("/api/blueprint")
def make_blueprint(req: BlueprintRequest) -> dict:
    """One turn of the blueprint conversation. First call: prior=None, feedback="".
    Refinement calls: prior=<the bp>, feedback=<what to change>. Returns the bp dict.
    """
    # TODO: which client hosts LITMUS_MODEL? (MODELS[...] resolves it)
    client = MODELS[LITMUS_MODEL]
    # TODO: generate_blueprint(client, LITMUS_MODEL, req.problem, req.style,
    #                          prior=req.prior, feedback=req.feedback)
    bp = generate_blueprint(client,LITMUS_MODEL, req.problem, req.style, prior = req.prior, feedback= req.feedback)
    # TODO: return it — FastAPI serializes the dict to JSON
    ...
    return bp

@app.post("/api/run")
def run(req: RunRequest) -> dict :
  # """ Approved blueprint -> tests + solution -> sandbox -> explain-on-failure.
  #   This is run_litmus() WITHOUT the terminal input()/print() — do NOT call
  #   run_litmus() itself; it blocks on stdin. Call the pieces directly. """
    blueprint_text = blueprint_to_text(req.blueprint)
    test_spec = test_spec_from_blueprint(req.blueprint)
    generated_tests = generate_tests(req.problem,test_spec)
    solution = generate_solution(LITMUS_MODEL,blueprint_text=blueprint_text, style=req.style)
    result = run_in_sandbox(solution_code=solution, test_code=generated_tests)
    payload = serialize_result(result)
    if not result.all_passed :
      failed_tests = [{"test_name":t['name'], "error" : t['message']} for t in result.tests if t['outcome']!= "passed" ] 
      payload["explanation"] = explain_failure(solution , failures=failed_tests, problem=req.problem)
    return payload


@app.post("/api/waitlist")
def join_waitlist(signup: WaitlistSignup) -> dict:
    """Add an email to the waitlist.

    FastAPI has already validated `signup.email` (see the model above), so here
    you only handle the *outcomes*:

      1. Call add_to_waitlist(signup.email). It returns True for a brand-new
         signup, False if the email was already on the list.

      2. Return a small JSON dict the frontend can branch on. Both outcomes are a
         SUCCESS from the user's side (they're on the list either way) — so do
         NOT raise an error when the email already exists. Return something like
         {"status": "added"} vs {"status": "already_on_list"}.

      3. If the DB call raises (database down, etc.), the caller should get a
         clean 503 — not a raw 500 with a stack trace. Wrap the call in
         try/except and, in the except, `raise HTTPException(status_code=503,
         detail="Could not reach the waitlist right now, try again shortly.")`.
         Never let internal error text leak to the client.

    Notes:
      - Returning a plain dict IS the response — FastAPI serializes it to JSON and
        sends 200 by default.
      - This handler is a normal `def` (not `async def`) on purpose: add_to_waitlist
        makes a *blocking* DB call, and FastAPI runs sync handlers in a threadpool,
        so that blocking call won't freeze the whole server.
    """
    try:
        if add_to_waitlist(signup.email) :
          return {"status" : "added"}
        else :
           return {"status" : "already_on_list"}
    except  Exception as e:
        print (f" internal DB Error logged safely: {e}")
        raise HTTPException(status_code=503, detail= " Could not reach the waitlist right now , try again later ")

 
