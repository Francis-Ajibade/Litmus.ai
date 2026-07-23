# PRD — Litmus (v0, ship build)

| | |
|---|---|
| **Author** | Frankie |
| **Status** | v0 — shipping this month |
| **Deadline** | End of month |
| **Full vision** | `PRD-vision-archive.md` (the 600-line version — reference only, do not build from it) |

> **Read this first.** Litmus proves code works before you trust it. It runs code — yours or a model's — against real tests in a safe sandbox, and only shows what passed; when something fails, it explains *why*. Generation is a commodity; **proof and explanation are the product.** Everything below is scoped to what ships this month. Everything else is in the archive and is explicitly out.

---

## 1. What v0 actually is

A **verified debugging helper**. The user brings code and tests (or Litmus generates the tests). It runs them in a sandbox. For each failure it explains *why it failed and the concept behind it* — and offers to help debug rather than just dumping the fix.

That's it. No race, no leaderboard, no three-model comparison, no reasoning-agent UI, no persistence, no walkthrough. Those are real and documented in the archive — they are **not this month**.

**One line:** everyone else gives you an answer; Litmus gives you the receipt, then explains what the receipt means.

---

## 2. The one change from earlier plans

**The race is cut from v0.** Earlier drafts raced three models (Claude, GPT-4o, Gemini) and ranked them. Dropped because:
- It triples API cost and latency for a student who wants one correct answer.
- The value was never the race — it was the **verification** (the sandbox) and the **explanation**. The race was decoration on those.
- One good model + verification + a clear explanation of failures is the whole product for v0.

**Practical note for the existing codebase:** code generation is already wired for 3 models. **Collapse it to one.** You can keep the multi-model path behind a flag if it's cheap to keep, but the default and shipped path is a single model. Don't spend deadline time ranking models; spend it on the sandbox.

---

## 3. The core loop (v0)

```
user provides code + tests            (or: Litmus generates tests from a description)
            |
            v
   run_in_sandbox(code, tests)         <- the irreplaceable piece
            |
            v
      structured pass/fail (SandboxResult)
            |
      +-----+-----+
   all pass    something failed
      |              |
   "done"     explain WHY it failed + the concept
                     |
               ask the user:
               - debug it together  (hints, they write the fix)  <- the default
               - just show me the fix  (the exit, framed as giving up)
```

---

## 4. Components (v0 only)

1. **The Sandbox** — runs untrusted code in a disposable, network-less, resource-capped Docker container; returns structured pass/fail. *This is the only irreplaceable piece. If nothing else ships, this shipping is still a real result.*
2. **The Test Generator** *(optional in v0)* — if the user has no tests, one model writes a pytest suite from their description. If they bring their own tests, skip this entirely.
3. **One code/explanation model** — a single LLM call. Either generates a solution (if the user wants code) or, more importantly for v0, explains why a test failed and what concept it points to.
4. **The Explainer behaviour** — on failure, explain the concept, offer to debug together (hints, not the answer) or reveal the fix (framed as the exit, not the default). If lecture notes are ever added they ground the explanation — but notes/RAG are **not v0**.

Everything is one language: **Python only.**

---

## 5. Build order (the deadline plan)

Each step is independently testable. Do not start a step until the previous one runs.

1. **Sandbox in isolation (days 1-3).** `run_in_sandbox(code, tests)` -> Docker -> structured JSON. Hardcoded strings, no AI. **Not done until:** (a) a known-good pair returns the right pass count; (b) `while True: pass` is killed by the timeout, not the host; (c) `urllib.request.urlopen(...)` inside raises a network error. If (c) succeeds, the sandbox isn't real.
2. **One model -> sandbox (days 4-6).** Single LiteLLM call produces code (or you paste code); feed it to step 1. Collapse the existing 3-model path to one here.
3. **Failure explanation (days 4-6, same window).** On a failing result, send code + failing test + error to one model; get back the why + the concept. This is the product's heart.
4. **Thinnest UI (days 7-10).** Single page: code box, tests box, run button, results below (pass/fail + explanation). Ugly is fine. Functional beats pretty.
5. **Make it not-embarrassing (days 11-14).** Apply styling from the mockups, deploy (Vercel + a backend host), fix obvious breakage.
6. **Buffer (remaining days).** Everything takes 2x as long. The sandbox especially will fight you. Not optional slack — it's where the real schedule lives.

---

## 6. Explicitly OUT of v0 (all in the archive)

The race / multi-model ranking - the leaderboard - reasoning-agent review UI (Phase 1/2 stepper) - sessions & persistence (Postgres) - the Lovable landing page - the waitlist page - style extractor - walkthrough / tutor mode - syllabus RAG - judge/explainer as a separate ranking step - JS/Java - payments - global stats. None ship this month. Do not build them. If a request touches one, point at `PRD-vision-archive.md` and move on.

---

## 7. The sandbox — how it actually runs

(The one part worth full detail, because it's the irreplaceable piece.)

**Three nouns, kept separate:** *image* = frozen template built once (Python + pytest, nothing else); *container* = disposable instance, one per run, destroyed after seconds; *`solution.py` / `test_solution.py`* = data, mounted in at run time, never baked into the image.

**Docker is a safety wrapper, not part of the AI pipeline.** LLM calls happen on the host — text from an API is inert. Docker appears only when untrusted code must be **executed**. pytest does the testing; Docker only guarantees the room has no exit.

**Sandbox Dockerfile (four lines — the simplicity is the security property):**
```dockerfile
FROM python:3.12-slim
RUN pip install --no-cache-dir pytest pytest-json-report
WORKDIR /sandbox
USER nobody
```
- **No `COPY` of solution code** — it doesn't exist at build time and changes every run; `COPY` would force a rebuild per request. Use a **bind mount**.
- **No `CMD`** — the runner supplies the command per execution.
- **`WORKDIR` must equal the mount target** or pytest collects zero tests.
- **ARM64-native base** (`python:3.12-slim` is multi-arch) — never force `--platform linux/amd64` on the Mac; it drags in Rosetta.

**Per-run loop (`run_in_sandbox(code, tests) -> SandboxResult`):**
1. `mkdtemp()` -> temp dir; write `solution.py` + `test_solution.py` (both before the container starts — pytest won't see files added mid-run).
2. `chmod 777` the temp dir (so the `nobody` user can write the report).
3. `containers.run(image, command="pytest --json-report --json-report-file=/tmp/report.json ...", volumes={tmp:{"bind":"/sandbox","mode":"rw"}}, network_mode="none", mem_limit=..., ...)`.
4. `wait(timeout=N)` -> exit code; `logs()` -> stdout/stderr; `remove(force=True)` -> destroy.
5. Parse the JSON report -> structured result.

**The bind mount is a window, not a copy.** Container `/sandbox` *is* the host temp dir — same bytes. The report written inside lands on the host instantly; that's how results get out. There is no "copy back" step.

**Mandatory security flags (running AI-written code — non-negotiable):** `network_mode="none"` - `mem_limit` + CPU cap - wall-clock timeout enforced from the host - `read_only=True` root FS + `tmpfs` scratch - `USER nobody` - `cap_drop=["ALL"]` - `no-new-privileges` - **no secrets mounted, never mount `.env`**.

**`SandboxResult` (the contract, mirrors `pytest --json-report`):** `ok`, `timed_out`, `exit_code`, `passed`, `failed`, `errors`, `total`, `duration_ms`, `tests[]`, `stdout`, `stderr`, and a computed `all_passed` (= ok AND not timed_out AND total>0 AND failed==0 AND errors==0). `pytest-json-report` **omits** keys for outcomes that didn't occur, so read every count with `.get(key, 0)`. The `total > 0` check matters: zero tests collected (bad mount / wrong WORKDIR) exits 5 and would otherwise read as "no failures" = false pass.

**Isolation ceiling (be honest):** Docker shares the host kernel. Fine for local dev and a first ship. Not "hostile code from strangers at scale" safe — that's the E2B/Modal swap, later. Keep `run_in_sandbox()` a clean seam so that swap is a shell change, not a rewrite.

---

## 8. Stack

- **Sandbox:** local Docker via the `docker` Python SDK.
- **Backend:** Python + FastAPI.
- **Model calls:** LiteLLM (one model in v0; the multi-model path collapses to one).
- **Test results:** `pytest --json-report` (structured JSON, never regex terminal text).
- **Frontend:** the thinnest thing that works — plain React/HTML. Styling from the mockups comes late, not first.
- **Python deps:** `uv` only.
- **No database in v0.** Persistence is post-ship.

---

## 9. Definition of done (what "shipped" means this month)

A deployed page where a user pastes Python code and a test (or a problem description), clicks run, and gets back: a real pass/fail from a real sandbox, and — on failure — a plain explanation of why it failed and the concept behind it, with the option to debug together or see the fix.

If the sandbox runs safely and the explanation is useful, **that is a shipped product.** The race, the leaderboard, the landing page, and everything in the archive can come after.
