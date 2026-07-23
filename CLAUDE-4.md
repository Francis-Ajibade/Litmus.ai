# CLAUDE.md — Litmus (v0, shipping this month)

Read this file and `PRD.md` before doing anything. `PRD.md` is the lean ship spec. `PRD-vision-archive.md` is the full long-term vision — **reference only, do not build from it.** There is a deadline: end of month. Scope is ruthless on purpose.

## What this is (one sentence)
Litmus proves code works before you trust it: it runs code (yours or a model's) against tests in a safe sandbox, shows only what passed, and when something fails, explains **why** and the concept behind it. Proof + explanation are the product. Generation is a commodity.

## v0 is verified single-model codegen + explanation — NOT a race
- **One model, not three.** The existing code is wired for a 3-model race. Collapse it to a single code model (called "Litmus"). Keep the multi-model path behind a flag only if that's free; the shipped default is one model. Do not spend deadline time ranking models.
- **The flow is: reasoning model breaks the problem into a blueprint + test cases (user can edit) -> one model generates a Python solution from the blueprint + style -> run solution + tests in the sandbox -> show pass/fail -> on failure, explain why + the concept -> offer to debug together (hints) or reveal the fix (the exit, not the default).**
- **The blueprint step IS in (kept lean).** Show it, allow light edits, one "generate" button — NOT an elaborate multi-step wizard. Reuse the existing `generate_blueprint` / `review_blueprint`; don't rebuild them.
- **Python only.**

## Non-negotiable scope rules (v0) — everything here is OUT
Point at `PRD-vision-archive.md` if asked for any of these; do not build them this month:
- the race / multi-model ranking, the leaderboard
- an elaborate multi-step blueprint *wizard* (a LEAN blueprint review IS in v0 — one panel + a generate button; see above)
- sessions & persistence / Postgres (no database in v0)
- the Lovable landing page, the waitlist page
- style extractor / style profiles
- walkthrough / tutor mode, syllabus upload, RAG
- a separate judge/explainer ranking agent
- JS/Java, payments, global stats
When in doubt, prefer the narrow interpretation and ask.

## Build order — do NOT skip ahead
Build one brick, get it working, deliberately break it to test the guards, then move on. Never scaffold the whole app at once.

1. **Sandbox in isolation — ALREADY BUILT (`sandbox/runner.py`).** The irreplaceable piece is done and passes its 3 guards. Do NOT rebuild it — re-run the guards to confirm, then move on. This frees days 1-3 for the explanation + UI.
2. **One model -> sandbox (days 4-6).** A single **OpenAI-SDK** call (the shipped `call_model`) produces code (or paste code); feed it to step 1. This is where you collapse the existing 3-model path to one. Reuse `generate_blueprint` / `generate_tests` / `generate_solution`.
3. **Failure explanation (days 4-6).** On a failing result, send code + failing test + error to one model; return why + the concept. The heart of the product.
4. **Thinnest UI (days 7-10).** Single page: code box, tests box, run button, results below. Ugly is fine.
5. **Make it not-embarrassing (days 11-14).** Apply mockup styling, deploy, fix breakage.
6. **Buffer (rest of month).** Everything takes 2x as long. Not optional.

**Step 1 is not done until all three pass:** (a) a known-good pair returns the right pass count; (b) `while True: pass` is killed by the timeout, not the host; (c) `urllib.request.urlopen(...)` inside the sandbox raises a network error. If (c) succeeds, the sandbox is not real.

## Architecture rules
- **`run_in_sandbox(code, tests) -> SandboxResult` is the seam.** Strings in, structured verdict out. Nothing outside this function knows about Docker, so swapping local Docker -> E2B later is a shell change, not a rewrite. No FastAPI or frontend imports inside it.
- **Live results / test data come from `pytest --json-report`** as structured JSON — never regex terminal text.
- **One model via the bare OpenAI SDK** (per-provider `base_url` — the shipped `call_model`; the PRD's "LiteLLM" is done with the bare SDK, one fewer dep). Cheap/fast model for test generation if used; keep it simple.

## Sandbox mechanics — read before writing any Docker code
Settled decisions. Do not re-derive; flag it if I ask for something that contradicts these.

- **Three nouns:** *image* = frozen template built once (Python + pytest, nothing else). *container* = disposable, one per run, destroyed after seconds. *`solution.py`/`test_solution.py`* = data, mounted in at run time, never in the image.
- **Docker is a safety wrapper, not part of the AI pipeline.** LLM calls happen on the host (text is inert). Docker appears only to execute untrusted code. pytest tests; Docker only guarantees no exit from the room.
- **NEVER `COPY` solution code into the sandbox image** — it doesn't exist at build time and changes every run; `COPY` forces a rebuild per request. Use a **read-only bind mount** (`volumes={workdir:{"bind":"/app","mode":"ro"}}`).
- **Code goes IN read-only at `/app`; results come OUT over stdout.** An `rw` mount is a writable channel from untrusted code onto your host FS — the sandbox doesn't need one. The report is written to an in-memory **tmpfs** (`/tmp/report.json`), and the container `cat`s it to **stdout** as its last act; `container.logs(stdout=True)` retrieves it. Pure JSON on stdout by construction.
- **`WORKDIR` must equal the mount target** (`/app`) or pytest collects 0 tests, exits 5.
- **No `CMD` in the sandbox Dockerfile.** The runner supplies the command per run.
- **Host temp dir world-*readable*, not writable** (dir `0755`, files `0644`). The container runs as `nobody` (uid 65534, a different uid than you), so it must *read* the mount; it never writes there. `chmod 777` would grant write access you don't want.
- **This is what `sandbox/runner.py` already does** — don't rebuild it to a weaker (`rw` / `chmod 777`) spec.
- **Write both files before starting the container.** pytest's collection won't see files added mid-run.
- **Mandatory security flags:** `network_mode="none"`, `mem_limit` + CPU cap, host-enforced wall-clock timeout, `read_only=True` + `tmpfs` scratch, `USER nobody`, `cap_drop=["ALL"]`, `no-new-privileges`. **Never mount `.env` or pass API keys into a sandbox.**
- **ARM64-native base** (`python:3.12-slim` is multi-arch). Never force `--platform linux/amd64` — drags in Rosetta on this Mac.
- **`.dockerignore`** excludes `.venv/`, `__pycache__/`, `.env`, `.git/`. The image installs its own deps via `RUN pip install`; the host `uv` venv is irrelevant to it.
- **`pytest-json-report` omits keys for outcomes that didn't happen** — read every count with `.get(key, 0)`. `all_passed` must also check `total > 0` (zero tests collected = false pass otherwise).
- **Honest ceiling:** containers share the host kernel. Fine for local dev + first ship; not hostile-code-at-scale safe. That's the E2B/Modal swap the seam exists for.

## Environment & conventions
- **Python deps: `uv` only.** `uv add <pkg>`; never `pip install` on the host.
- Machine: MacBook (Apple silicon), macOS. Docker Desktop must be running for the sandbox.
- Git: commit after each working brick. Small, frequent commits.
- Secrets in `.env` (gitignored): model API keys. Never commit; never mount into sandboxes.
- **No database in v0.** SandboxResult lives in memory / the response.

## How I want you to work with me
- Explain the *why* behind each decision, not just the *what*. I'm learning this to rebuild it, not copy-paste.
- Confident recommendations over long option lists.
- One working step at a time. Confirm it runs before adding complexity.
- If I ask for something in the OUT list, remind me it's deferred and why — don't build it. The deadline is real; scope creep is the enemy.

## Reference files
- `PRD.md` — lean v0 ship spec (source of truth for this month).
- `PRD-vision-archive.md` — full long-term vision (reference only; do not build from it).
- `coderace-ui-mockup.html`, `coderace-landing-lovable.html` — styling reference for step 5, not step 1.
