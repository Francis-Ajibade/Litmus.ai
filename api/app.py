"""FastAPI shell for Litmus.

This is the ONLY place FastAPI is allowed to appear. It's a thin HTTP layer over
the framework-agnostic pieces: the engine in main/ and the sandbox in sandbox/.
The web rules live here; neither of those imports FastAPI — that's the seam that
lets either side change independently.

Stateless by design: there is no database. Every request carries everything it
needs (the problem, the style, the blueprint the browser is holding), so the
server keeps nothing between calls.

Run it in dev with:  uv run uvicorn api.app:app --reload --port 8000
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sandbox import SandboxResult
from main import MODELS, THINKING_MODEL, run_engine, generate_blueprint, try_expression


app = FastAPI(title="Litmus API")

# The React dev server (Vite) runs on a DIFFERENT origin (http://localhost:5173)
# than this API (http://localhost:8000). Browsers block cross-origin requests
# unless the server explicitly opts in — that mechanism is CORS. In dev we allow
# the Vite origin. (We'll tighten this to the real domain in production.)
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
)


# ---------------------------------------------------------------------------
# Request bodies. Each is a BaseModel, so FastAPI parses and validates the
# incoming JSON before the handler ever runs — a bad body is a 422, not a crash.
# ---------------------------------------------------------------------------

class BlueprintRequest(BaseModel):
    problem: str
    style: str = ""
    prior: dict | None = None   # the blueprint the browser is holding, echoed back
    feedback: str = ""          # "" on the first turn; a refinement on later turns


class RunRequest(BaseModel):
    problem: str
    style: str = ""
    blueprint: dict             # the approved blueprint the browser locked


class TryRequest(BaseModel):
    """One REPL-style poke at code that has ALREADY been generated and verified.

    `code` is sent from the browser rather than regenerated, so what the user
    runs is byte-identical to what they're looking at in the code panel.
    """
    code: str
    # any Python: a single expression prints its value automatically, or several
    # statements where you do your own printing. The sandbox is the validator —
    # a SyntaxError comes back as output, not as a 500.
    expression: str



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
    # The blueprint is the REASONING job, so it runs on THINKING_MODEL — not the
    # code model. MODELS[...] resolves which provider hosts it, so the client and
    # the model id can never drift apart.
    client = MODELS[THINKING_MODEL]
    bp = generate_blueprint(client, THINKING_MODEL, req.problem, req.style, prior = req.prior, feedback= req.feedback)
    return bp

@app.post("/api/run")
def run(req: RunRequest) -> dict :
  # """ Approved blueprint -> tests + solution -> sandbox -> explain-on-failure.
  #   This is run_litmus() WITHOUT the terminal input()/print() — do NOT call
  #   run_litmus() itself; it blocks on stdin. Call the pieces directly. """
    
    try:
        test, test_spec, attempts = run_engine(req.problem, req.style, req.blueprint)
    except ValueError as e:
        # a blueprint with no test cases — a legible 422 beats a raw stack trace
        raise HTTPException(status_code=422, detail=str(e))

    dict_per_attempt = {
      "tests" : test,
      "test_spec" : test_spec,
      "attempts" : [
        {
            "code" : r.code,
            "explanation" : r.explain_failure,
            "result" : serialize_result(r.sandbox_result)
            }
            for r in (attempts)
      ]
        
      }



    return dict_per_attempt


@app.post("/api/try")
def try_input(req: TryRequest) -> dict:
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

    # A traceback lives on the failing test; stdout carries a successful print.
    failed = [t for t in result.tests if t["outcome"] != "passed"]
    return {
        "expression": expression,
        "output": result.captured_stdout or (failed[0]["message"] if failed else ""),
        "ok": result.all_passed,
        "timed_out": result.timed_out,
        "duration_ms": result.duration_ms,
    }



