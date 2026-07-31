"""Litmus — the model pipeline: blueprint -> tests -> one-model codegen -> sandbox -> explain.

A reasoning model turns a problem into a strict-JSON blueprint (definition, traps,
steps, interface, test cases); the user can lightly edit it. A cheap model authors
the pytest suite from it. ONE code model ("Litmus") generates the solution from the
blueprint + style. The sandbox runs it; on failure, explain_failure says WHY it
failed + the concept, WITHOUT handing over the fix.

Model roles:
  MODELS       — model -> client registry (which provider hosts each code model)
  LITMUS_MODEL — the single code model that generates solutions
  TEST_MODEL   — cheap, reliable author of the pytest suite

Generation is the commodity. Proof and the explanation are the product.
"""


from dataclasses import dataclass
from typing import Any
import json
import re
import os
import sys

from dotenv import load_dotenv
from openai import OpenAI

# Repo root on the path so `from sandbox import ...` resolves when this is run
# as `python main/new_code.py` from a subdirectory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sandbox import SandboxResult, run_in_sandbox

load_dotenv(override=True)


# --------------------------------------------------------------------------
# Clients. Anthropic, Google, and OpenRouter all expose OpenAI-compatible
# endpoints, so one SDK reaches every provider — only the base_url changes.
# --------------------------------------------------------------------------

openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
anthropic = OpenAI(
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    base_url="https://api.anthropic.com/v1/",
)
openrouter = OpenAI(
    api_key  = os.getenv('OPENROUTER_API_KEY'),
    base_url= "https://openrouter.ai/api/v1",
)
# --------------------------------------------------------------------------
# Model → client registry: which provider hosts each code model. `generate_solution`
# resolves the client from here. One model ships in v0 (LITMUS_MODEL); a second is
# kept only as an alternate. Every id verified against the provider's live endpoint —
# an unknown id is a 404, not a graceful fallback.
# --------------------------------------------------------------------------

MODELS: dict[str, OpenAI] = {
    "o3-mini": openai,
    "claude-opus-4-8": anthropic,
    # OpenRouter namespaces every id as <org>/<model> — a bare "kimi-k3" is a 404.
    "moonshotai/kimi-k3" : openrouter,
    "google/gemini-3.5-flash-lite" : openrouter

}

# Model tiering (CLAUDE.md): a cheap, fast model authors the tests; the
# expensive models are spent on code candidates. The test suite is the
# scoreboard — a wrong test silently invalidates every result — so this is the
# one "cheap" slot where reliability still matters more than price.
TEST_MODEL = "o3-mini"
THINKING_MODEL = "o3-mini"
LITMUS_MODEL = "moonshotai/kimi-k3"
# the explainer writes 1-2 sentences — a flash-lite tier is the right size, and
# ~6x cheaper per output token than the code model.
EXPLAIN_MODEL = "google/gemini-3.5-flash-lite"
MAX_ATTEMPTS = 2

@dataclass
class Result:
    # SandboxResult is a stdlib dataclass with an @property (all_passed) that
    # pydantic would drop if it re-parsed it — arbitrary_types_allowed keeps the
    # real object, property and all.
    code : str
    sandbox_result : SandboxResult
    explain_failure : str | None = None



def _completion_kwargs(model: str) -> dict:
    """`reasoning_effort` is an OpenAI reasoning-model parameter. Sending it to
    another provider's compat endpoint is a 400 — and sending `None` explicitly
    still sends the key. So we add it only where it belongs."""
    if model.startswith(("gpt-5", "o1", "o3", "o4")):
        return {"reasoning_effort": "high"}
    return {}


def call_model(client: Any, model: str, system: str, user: str) -> str:
    """One streamed chat completion, returned as a plain string."""
    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        stream=True,
        **_completion_kwargs(model),
    )
    response = ""
    for chunk in stream:
        if chunk.choices:  # some providers emit a final usage-only chunk
            response += chunk.choices[0].delta.content or ""
    return response


REPAIR_SYSTEM_PROMPT = """You are a senior engineer fixing a bug. Code you wrote failed one or more tests.

Your job: fix the underlying LOGIC so the code is correct, then return the complete corrected file.

HARD RULES:
- Fix the actual cause. NEVER special-case or hardcode a value to make a specific
  test pass (e.g. `if input == [the test's input]: return [expected]`). That's
  cheating the test, not fixing the code, and it makes the code worse. If you
  catch yourself matching the test's exact inputs, stop and fix the real logic.
- Don't break passing tests to fix failing ones. The whole suite must still pass.
  Re-read the tests that were already green and make sure your change preserves them.
- Change only what the failure requires. Don't rewrite working code or add features.
- Keep the original style and constraints (naming, no banned libraries, type hints
  — whatever the original followed).
- If the failure is caused by a wrong TEST rather than wrong code, say so in one
  line at the top as a comment, then fix the code to match the clearly-intended
  behaviour — do not edit the test.

Output ONLY the complete corrected Python file. No prose, no markdown fences, no explanation. Just the file."""


EXPLAIN_FAILURE1 = """ Code just failed some tests. In 1-2 sentences, tell the user plainly WHAT failed 
and WHY in reagrds to the problem the code is trying to solve  — the actual cause, not just "a test failed." State it as fact, don't quiz, 
no code, no fences.

You're given: 
    the code 
    a list of test cases and tracebacks objects (failing tests) 
    problem  

"""

# EXPLAIN_FAILURE2= """ You repaired code across versions. Given the facts below, write 1-2 plain 
# sentences telling the user what improved and what still fails. State facts; 
# don't quiz. No code.

# v2 fixed these tests that v1 failed: {fixed}
# v2 still fails: {still_broken}
# v2 newly broke (were passing in v1):     <- if any, lead with this

#  """

def explain_failure1(code: str, failures: list[dict], problem: str = "") -> str:
    """On failing tests, ask ONE model why they failed + the concept — WITHOUT revealing the fix.

    `failures` is a list of failed-test objects: [{"test_name": ..., "error": ...}, ...],
    so a run with several failures is explained in ONE call (the model can spot a shared
    root cause). Reuses call_model; the tutor discipline lives in EXPLAIN_SYSTEM_PROMPT.
    Generation is the commodity; the explanation is the product.
    """
    block = "\n\n".join(
        f"FAILING TEST: {f['test_name']}\nERROR:\n{f['error']}" for f in failures
    )
    user = (
        f"PROBLEM:\n{problem or '(not given)'}\n\n"
        f"CODE:\n{code}\n\n"
        f"{len(failures)} TEST(S) FAILED:\n\n{block}"
    )
    return call_model(MODELS[EXPLAIN_MODEL], EXPLAIN_MODEL, EXPLAIN_FAILURE1, user)

# def explain_failure2(code: str, failures: list[dict], problem: str = "") -> str:
#     """On failing tests, ask ONE model why they failed + the concept — WITHOUT revealing the fix.

#     `failures` is a list of failed-test objects: [{"test_name": ..., "error": ...}, ...],
#     so a run with several failures is explained in ONE call (the model can spot a shared
#     root cause). Reuses call_model; the tutor discipline lives in EXPLAIN_SYSTEM_PROMPT.
#     Generation is the commodity; the explanation is the product.
#     """
#     block = "\n\n".join(
#         f"FAILING TEST: {f['test_name']}\nERROR:\n{f['error']}" for f in failures
#     )
#     user = (
#         f"PROBLEM:\n{problem or '(not given)'}\n\n"
#         f"CODE:\n{code}\n\n"
#         f"{len(failures)} TEST(S) FAILED:\n\n{block}"
#     )
#     return call_model(anthropic, LITMUS_MODEL, EXPLAIN_FAILURE2, user)


# --------------------------------------------------------------------------
# Phase 1 — the reasoning agent (blueprint author). No code emitted here.
# --------------------------------------------------------------------------

BLUEPRINT_SYSTEM_PROMPT = """You are a senior software architect running the ANALYSIS phase.
You deconstruct a coding problem into a precise blueprint that a code model
will implement. You do NOT write solution code in this phase.

Output STRICT JSON and nothing else — no prose, no markdown fences. Exactly this shape:

{
  "problem_definition": "one-paragraph plain-English restatement of the task",
  "entry_point": "JUST the callable's name, no signature — e.g. 'solve' or 'BoundedStack'. Must match interface_contract.",
  "interface_contract": "the EXACT function name + signature every solution must expose, e.g. 'def solve(data: str) -> str:'. Pin the pure-logic function so pytest can import it. Console I/O (input()/print()) must be confined to `if __name__ == \\"__main__\\":`.",
  "lecturer_traps": ["the specific gotchas a grader would test — the non-obvious edge cases, off-by-ones, format rules"],
  "algorithmic_steps": ["ordered steps to implement the core function"],
  "required_test_cases": [
    {"description": "what this case checks", "input": "the ARGUMENTS exactly as they would appear inside the call parentheses, so that entry_point(<input>) is valid Python. For one argument that is just the value: \\\"'abc'\\\" or \\\"[1,2]\\\". For several, comma-separate them: \\\"{'a':1}, {'b':2}\\\" — do NOT wrap multiple arguments in a list.", "call": "runnable Python that exercises THIS case against the entry point, assuming it is already imported. A plain function is one expression: \\\"solve('100,150,180')\\\". Anything needing setup is several lines ending in the expression under test: \\\"s = BoundedStack(2)\\\\ns.push(1)\\\\ns.push(2)\\\\ns.pop()\\\". Never include imports.", "expected": "the exact expected return value"}
  ],
  "clarifying_question": "the single most important ambiguity for the human to resolve, or empty string if none"
}

Rules:
- Base test cases ONLY on the stated problem. Do not invent requirements the
  problem never states — a fabricated case marks correct code as failing.
- BUT be thorough within those bounds: propose enough cases (aim for 8+) to
  cover every trap you listed. For each lecturer_trap there should be at least
  one required_test_case that exercises it. Cover the happy path, boundary
  values, empty input, and the exact output-format rules the problem states.
- A trap you name but never test is a hole in the scoreboard. Close it.
- interface_contract is mandatory and must match what required_test_cases assume.
- If the user gives a refinement, revise the WHOLE blueprint accordingly."""

TUTOR_SYSTEM_PROMPT = """ 
    You are Litmus, a debugging tutor for a student learning to code. A test just 
failed on their code. Your job is to help them understand WHY it failed and 
work out the fix THEMSELVES — not to hand them a corrected version.

You will be given: their code, the failing test, the error/traceback, and your 
prior conversation about this specific failure.

HOW YOU HELP — escalate only as they stay stuck:
1. First, point at the concept the failure reveals, as a question. 
   ("The test expected an error on an empty stack but got None back — what 
   should pop do when there's nothing to remove?") Never name the fixed line.
2. If they're still stuck, get more concrete about WHERE, still not the fix. 
   ("Look at what pop returns when self._items is empty.")
3. If they guess wrong, don't correct with the answer — ask what they expected 
   their code to do, and let them find the gap between that and what happened.
4. Explain concepts freely — what a pointer is, why an index is off by one, what 
   an exception does. Concepts are always fair game. The specific solution is not.

HARD RULES:
- NEVER write the corrected code, or the specific line they're stuck on, even if 
  asked directly. Writing it for them is a failure of your job.
- One idea per reply. Short. A stuck student doesn't read paragraphs.
- Match their level from how they write and comment. Don't teach above where they are.
- Stay on THIS failure. Don't wander to unrelated improvements.
- If they're genuinely blocked after several exchanges, give a bigger hint — but 
  still stop short of the final answer. Frustration ("just tell me") is not a 
  reason to hand it over; it's the moment teaching matters most.

Your tone is calm, encouraging, and curious — a good TA sitting next to them, 
not a manual.
"""


def _blueprint_user_content(problem: str, style: str, prior: dict | None, feedback: str) -> str:
    parts = [f"PROBLEM:\n{problem}", f"\nSTYLE GUIDELINES:\n{style or '(none — default to PEP 8)'}"]
    if prior is not None and feedback:
        parts.append("\nYOUR PREVIOUS BLUEPRINT:\n" + json.dumps(prior, indent=2))
        parts.append(f"\nHUMAN REFINEMENT (revise the blueprint to honor this):\n{feedback}")
    return "\n".join(parts)


def parse_blueprint(raw: str) -> dict | None:
    """The reasoning model is told to emit bare JSON, but models still wrap it in
    fences or add a stray sentence. Strip fences, then try to isolate the JSON
    object. Returns None if nothing parses — the caller retries."""
    text = strip_code_fences(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
        return None


def generate_blueprint(
    client: OpenAI, model: str, problem: str, style: str,
    prior: dict | None = None, feedback: str = "",
) -> dict:
    """One reasoning call -> a parsed blueprint dict. One repair retry if the
    model returns un-parseable JSON, because a blueprint is upstream of the whole
    race and a hard failure here wastes everything downstream."""
    user = _blueprint_user_content(problem, style, prior, feedback)
    raw = call_model(client, model, BLUEPRINT_SYSTEM_PROMPT, user)
    bp = parse_blueprint(raw)
    if bp is None:
        raw = call_model(
            client, model, BLUEPRINT_SYSTEM_PROMPT,
            user + "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object.",
        )
        bp = parse_blueprint(raw)
    if bp is None:
        raise ValueError(f"{model} did not return a parseable blueprint.")
    return bp


# --------------------------------------------------------------------------
# Phase 2 — human review (terminal stand-in for the Brick 6 stepper UI).
# --------------------------------------------------------------------------

def print_blueprint(bp: dict) -> None:
    print("\n" + "=" * 62)
    print("BLUEPRINT")
    print("=" * 62)
    print(f"\nDefinition:\n  {bp.get('problem_definition', '')}")
    print(f"\nInterface contract:\n  {bp.get('interface_contract', '')}")
    print("\nLecturer traps ⚠️")
    for t in bp.get("lecturer_traps", []):
        print(f"  - {t}")
    print("\nAlgorithmic steps")
    for i, s in enumerate(bp.get("algorithmic_steps", []), start=1):
        print(f"  {i}. {s}")
    print("\nRequired test cases")
    for c in bp.get("required_test_cases", []):
        print(f"  - {c.get('description','')}: solve({c.get('input','')!r}) == {c.get('expected','')!r}")


def review_blueprint(client: OpenAI, model: str, problem: str, style: str) -> dict:
    """Show → refine → approve loop. Blank input approves and LOCKS the blueprint;
    any text is a refinement that regenerates it. This is the human-in-the-loop
    gate that stops a hallucinated requirement from reaching the race."""
    print(f"\nAnalyzing the problem with {model} ...")
    bp = generate_blueprint(client, model, problem, style)
    while True:
        print_blueprint(bp)
        q = bp.get("clarifying_question", "")
        if q:
            print(f"\n❓ The agent asks: {q}")
        resp = input(
            "\n[Enter] to approve & lock, or type a refinement to adjust the blueprint"
            "\n(e.g. 'add a test for empty input', 'the traps miss negative D'): "
        ).strip()
        if not resp:
            return bp
        print(f"\nRevising the blueprint with {model} ...")
        bp = generate_blueprint(client, model, problem, style, prior=bp, feedback=resp)


# --------------------------------------------------------------------------
# Rendering the locked blueprint for the code model.
# --------------------------------------------------------------------------

def blueprint_to_text(bp: dict) -> str:
    """Flatten the JSON blueprint into the readable spec the codegen models see,
    inside <blueprint> tags (delimiters the model can't confuse with its own
    output). Note: required_test_cases are deliberately WITHHELD here — the
    racers must not see the exact answers they'll be graded against."""
    lines = [
        f"PROBLEM: {bp.get('problem_definition', '')}",
        "",
        f"INTERFACE CONTRACT (mandatory, overrides everything): {bp.get('interface_contract', '')}",
        "",
        "TRAPS TO HANDLE:",
    ]
    lines += [f"- {t}" for t in bp.get("lecturer_traps", [])]
    lines += ["", "ALGORITHM:"]
    lines += [f"{i}. {s}" for i, s in enumerate(bp.get("algorithmic_steps", []), start=1)]
    return "\n".join(lines)


def try_expression(code: str, snippet: str) -> SandboxResult:
    """Run ONE user-written expression against already-generated code.

    This is NOT verification — nothing is asserted and nothing can pass or fail.
    It answers 'what does this return', not 'is this correct'. The proof is the
    real suite; this is a REPL against the same sealed container.

    The driver imports INSIDE the test function on purpose: a module-level import
    executes solution.py during pytest's collection phase, and output captured
    there is not attributed to any test, so it never reaches captured_stdout.

    We run the snippet against `vars(solution)` — the module's own namespace —
    rather than importing one name. That way every top-level name is in scope
    (functions, classes, custom exceptions), so a class contract like
    BoundedStack works without us having to guess what to import.

    eval first, exec on fallback: `solve("x")` should print its result without
    the user wrapping it in print(), which is how the Python prompt behaves.
    eval raises SyntaxError on statements, and that's the signal to exec instead
    so multi-step snippets work. The `is not None` guard stops `print(...)` —
    an expression returning None — from echoing a stray None afterwards.

    The snippet is embedded with !r so quotes and newlines survive intact.
    """
    driver = (
        "def test_try():\n"
        "    import ast, solution\n"
        "    ns = vars(solution)\n"
        f"    snippet = {snippet!r}\n"
        "    tree = ast.parse(snippet)\n"
        "    last = tree.body[-1] if tree.body else None\n"
        "    if isinstance(last, ast.Expr):\n"
        "        exec(compile(ast.Module(tree.body[:-1], []), '<try>', 'exec'), ns)\n"
        "        value = eval(compile(ast.Expression(last.value), '<try>', 'eval'), ns)\n"
        "        if value is not None:\n"
        "            print(value)\n"
        "    else:\n"
        "        exec(snippet, ns)\n"
    )
    return run_in_sandbox(solution_code=code, test_code=driver)


def test_spec_from_blueprint(bp: dict) -> tuple[list[dict], str]:
    """Two views of the SAME cases, for two different consumers.

    The string is what the test model implements verbatim — the human approved
    exactly these cases in Phase 2. The list is those cases untouched, so the UI
    can read description/input as fields instead of parsing them back out of the
    formatted text. `lines` is derived from `cases`, so the two can't disagree.
    """
    contract = bp.get("interface_contract", "")
    cases = bp.get("required_test_cases", [])
    if not cases:
        # The suite IS the scoreboard. With no spec the test model invents its own
        # cases, and "verified" silently stops meaning anything — the worst kind of
        # failure, because everything still goes green. An empty list is a blueprint
        # failure, so say so here rather than improvising downstream.
        raise ValueError(
            "Blueprint produced no required_test_cases — refusing to let the test "
            "model invent the suite."
        )
    lines = [
        f"- {c.get('description','')}: input={c.get('input','')!r}, expected={c.get('expected','')!r}"
        for c in cases
    ]
    return cases, f"INTERFACE: {contract}\n\nCASES (implement exactly these):\n" + "\n".join(lines)


# --------------------------------------------------------------------------
# Prompts for codegen + test authoring.
# --------------------------------------------------------------------------

def solution_system_prompt(blueprint_text: str, style: str) -> str:
    return f"""You are Litmus, an elite Python code generation engine. Your code is mounted \
into an isolated Linux Docker sandbox and run against a strict pytest suite.

CRITICAL CONSTRAINTS:
- Output ONLY raw, functional Python. No markdown fences, no prose, no usage examples.
- The sandbox imports your module with NO stdin attached. ALL console I/O (input()/print())
  MUST live under `if __name__ == "__main__":`. A top-level input() will block the import
  forever and the sandbox will kill the run — you will score zero.
- Match the EXACT function name and signature the blueprint's interface contract demands so
  pytest can import it.
- Follow the style guidelines if given; otherwise adhere to PEP 8.

<blueprint>
{blueprint_text}
</blueprint>

[STYLE & FORMATTING GUIDELINES]:
{style or "Default PEP 8."}
"""


TEST_SYSTEM_PROMPT = """You are a meticulous senior QA automation engineer. You write pytest test
suites. You do NOT write solution code, and you never see the code that will
be tested — you test against the specification only.

You will receive:
- PROBLEM: what the code must do
- TEST_SPEC: the specific cases to cover. This may be user-written, agent-
  proposed, or empty.

Rules:
- If TEST_SPEC lists cases, implement exactly those — no more, no fewer. Do
  not invent requirements the spec doesn't state.
- If TEST_SPEC is empty, derive a thorough suite from PROBLEM alone: the happy
  path, boundary values, empty/null inputs, and the error conditions the
  problem implies.
- Test only explicit, stated behavior. Never assume an implementation detail
  (method names beyond those given, internal structure, ordering the spec
  didn't require).
- The module under test is ALWAYS importable as `solution`. Import from it
  directly, e.g. `from solution import solve`.
- Output ONLY a complete Python file. No prose, no markdown fences.

Return the raw contents of test_solution.py."""


def test_user_prompt(problem: str, test_spec: str) -> str:
    return f"PROBLEM:\n{problem}\n\nTEST_SPEC:\n{test_spec}"


DEFAULT_PROBLEM = """Write a program that calculates and prints the value according to the given formula: \
Q = Square root of [(2 * C * D)/H]. Fixed values: C is 50, H is 30. D is the variable, input as a \
comma-separated sequence. Example: input '100,150,180' -> output '18,22,24'. If the output is a \
decimal it should be rounded to the nearest integer. Input is a console input."""

DEFAULT_STYLE = ""


def strip_code_fences(text: str) -> str:
    """Models routinely wrap output in ```python ... ``` despite being told not
    to. A stray fence is a SyntaxError the instant the sandbox imports it (and a
    JSON-parse failure for a blueprint), so we peel one leading/trailing fence
    off before trusting the string."""
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    lines = lines[1:]  # drop the opening ``` / ```python line
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]  # drop the closing fence
    return "\n".join(lines).strip()


# --------------------------------------------------------------------------
# Codegen + test authoring
# --------------------------------------------------------------------------

def generate_tests(problem: str, test_spec: str) -> str:
    """One cheap model turns an approved TEST_SPEC into the pytest file every
    candidate is judged against. The SPEC comes from the human-approved blueprint
    (or the user's own cases) — Haiku implements it, it doesn't invent it."""
    raw = call_model(MODELS[TEST_MODEL], TEST_MODEL, TEST_SYSTEM_PROMPT, test_user_prompt(problem, test_spec))
    return strip_code_fences(raw)


def generate_solution(model: str, blueprint_text: str, style: str) -> str:
    """One model call: blueprint in, raw Python solution string out."""
    raw = call_model(
        MODELS[model], model, solution_system_prompt(blueprint_text, style), "Write the solution now.",
    )
    return strip_code_fences(raw)

def repair_code(problem, prev_code : str, tests : str, results : SandboxResult) -> str:
    # problem     → what "correct" means (anti-special-casing anchor)
    # prev_code   → the thing being fixed
    # test_suite  → ALL tests, so it preserves the green ones
    # failures    → per-test tracebacks of the red ones (the .message fields)) -> SandboxResult :

    block = "\n\n".join(
        f"test_name : {f['name']}\n outcome : {f['outcome']}\n stdout:{f['stdout']}\n traceback :\n{f['message']}" for f in results.tests
    )

    user = (
        f"PROBLEM:\n{problem}\n\n"
        f"CODE:\n{prev_code}\n\n"
        f"THE ENTIRE TEST SUITE (keep the passing tests passing):\n{tests}\n\n"
        f"RESULTS — {results.passed}/{results.total} passed:\n\n{block}"
    )

    repaired_code = call_model(MODELS[LITMUS_MODEL], LITMUS_MODEL, REPAIR_SYSTEM_PROMPT, user)
    return strip_code_fences(repaired_code)



# NOTE: the Litmus loop (blueprint -> tests -> one-model codegen -> sandbox ->
# explain) goes here next as run_litmus(). No race, no leaderboard, no DB.

#interface for the web app 
def run_engine(problem: str , style : str, blueprint : dict) -> tuple[str, list[dict], list[Result]]:

    solution = generate_solution(LITMUS_MODEL, blueprint_to_text(blueprint), style)
    # `cases` is the list the UI renders; `test_spec` is the flattened prompt text.
    cases, test_spec =  test_spec_from_blueprint(blueprint)
    tests = generate_tests(problem, test_spec)

    # 3. Run in sandbox with repair loop 
        #1 define the loop 
        # first attempot tun the code 
    original_result = run_in_sandbox(solution_code=solution, test_code=tests)
    attempts = 0
    # record v1 up front — so a clean first pass still returns a Result, not []
    results = [Result(code=solution, sandbox_result=original_result)]
        # if result.all passed retun the result class else repair 
    while not original_result.all_passed and attempts < MAX_ATTEMPTS - 1:
        #explain result 
        failed_tests = [
                {"test_name":t['name'], "error" : t['message']
                } for t in original_result.tests if t['outcome']!= "passed" ]
        # explain WHY this version failed, attached to the version that failed
        results[-1].explain_failure = explain_failure1(solution, failures=failed_tests, problem=problem)
        # repair — aware of the whole suite so it keeps the green tests green
        solution = repair_code(problem=problem, prev_code=solution, tests=tests, results=original_result)
        original_result = run_in_sandbox(solution_code=solution, test_code=tests)
        results.append(Result(code=solution, sandbox_result=original_result))
        attempts += 1

    # the final version still failing? explain it too (the earlier version was
    # explained inside the loop, before it got repaired).
    if not original_result.all_passed:
        final_failed = [
            {"test_name": t['name'], "error": t['message']}
            for t in original_result.tests if t['outcome'] != "passed"
        ]
        results[-1].explain_failure = explain_failure1(solution, failures=final_failed, problem=problem)

    return (tests, cases, results)
    
# interface for the terminal side 
def run_litmus(problem: str = DEFAULT_PROBLEM, style: str = DEFAULT_STYLE) -> tuple[str, list[Result]]:
    """The v0 core loop: blueprint â tests â one-model codege

    Prints progress and the verdict to the terminal; returns
    so a future API caller can render it. One model (LITMUS_MODEL) throughout.
    """

    # 1. Analyze + human-approve a locked blueprint (Phase 1+2 already do this).
    bp = review_blueprint(client=MODELS[THINKING_MODEL], model = THINKING_MODEL, problem=problem, style=style )
    return run_engine(problem, style, bp)

    


if __name__ == "__main__":
    print(run_litmus())