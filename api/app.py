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

from fastapi import FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sandbox import SandboxResult
from main import MODELS, THINKING_MODEL, run_engine, generate_blueprint, try_expression

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

# Registering the rate-limit-exceeded handler. Without it, a breached limit
# raises RateLimitExceeded, nothing catches it, and Starlette turns it into a
# generic 500 ("the server is broken") instead of a 429 ("you've done too much,
# here's when to come back"). The limits themselves are on the decorators below.
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    # Cross-origin JS can only read a small safelist of response headers by
    # default, and Retry-After is not on it — without this the browser strips it
    # and headers.get("Retry-After") is null even though devtools shows it. The
    # 429 handler sets it; this is what lets the frontend actually read it.
    expose_headers=["Retry-After"],
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


# @app.post must stay ABOVE @limiter.limit: decorators apply bottom-up, so the
# limiter wraps the function first and app.post then registers the wrapped
# version. Flip them and FastAPI registers the bare function — the limit silently
# never fires. `request: Request` is not optional either: slowapi finds the
# caller's IP by looking up a parameter with that exact NAME on the signature.
@app.post("/api/blueprint")
@limiter.limit("5/hour")
def make_blueprint(request: Request, req: BlueprintRequest) -> dict:
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
# The heaviest endpoint on the box: test generation, solution generation, and a
# Docker container per attempt (possibly twice, with the repair pass). The model
# is free, so the ceiling here is the droplet's CPU and memory, not tokens.
@limiter.limit("20/hour")
def run(request: Request, req: RunRequest) -> dict :
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
# Zero tokens, but it still executes arbitrary user code in a container — which
# is exactly why an unmetered /api/try is the endpoint an abuser reaches for.
# The limit is generous because poking at your code is the point of the feature.
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

    # A traceback lives on the failing test; stdout carries a successful print.
    failed = [t for t in result.tests if t["outcome"] != "passed"]
    return {
        "expression": expression,
        "output": result.captured_stdout or (failed[0]["message"] if failed else ""),
        "ok": result.all_passed,
        "timed_out": result.timed_out,
        "duration_ms": result.duration_ms,
    }



