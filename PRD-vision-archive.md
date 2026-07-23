# PRD — CodeRace (working title)

**Multi-Model Code Generation with Automated Test Filtering**

| | |
|---|---|
| **Author** | Frankie |
| **Status** | Draft v0.2 |
| **Last updated** | July 6, 2026 |
| **Doc type** | Product Requirements Document |

> **Read this first.** CodeRace is **not** a code generator competing on generation quality — every tool does that. It is a **verification layer**: it refuses to show the user code until that code has provably passed a test suite. Generation is the commodity; *proof* is the product. Every scope decision in this document flows from that one sentence.

---

## 1. Overview

CodeRace races multiple frontier LLMs (Claude, GPT, Gemini) against each other on the same coding problem, validates every candidate against an AI-generated test suite inside a secure sandbox, and delivers only the code that provably works — ranked on a live leaderboard.

**The core insight:** the biggest problem with AI-generated code is that you can't trust it without reviewing it yourself. Every competing tool (Bolt, Replit Agent, Cursor) shows you code and *then* discovers it's broken when you run it. CodeRace inverts that — code must go green against tests *before* it ever reaches the screen. The "AI confidently says it fixed something that's still broken" failure mode is **architecturally impossible** here, because nothing is marked done unless the tests pass.

**One-liner:** "Three AIs write your code. Only the one that passes the tests wins."

---

## 2. Problem Statement

1. **AI code can't be trusted blindly.** Hallucinated functions, subtle logic errors, and non-functional snippets force review time that often exceeds the time saved.
2. **Nobody knows which model is best *today*.** Model quality shifts every release. Users shouldn't have to track the model wars to get the best output.
3. **Students have a unique, underserved pain point.** Lecturers enforce strict style guides (PEP 8, naming conventions, "no built-in sort") and plant deliberate traps (1-based indexing, edge cases). Generic AI tools ignore both.
4. **The market gap is verification, not generation.** See §3.

---

## 3. Market Position — the gap we fill

Every review of Bolt.new, Replit Agent, Cursor, and Lovable surfaces the *same four complaints*, and all four are verification failures, not generation failures:

| Complaint (from user reviews) | Root cause | How CodeRace closes it |
|---|---|---|
| "AI says it fixed the bug, but it's still broken" | No ground-truth check before display | Tests must pass before code is shown — impossible to falsely report success |
| Error loops burn tokens (fix breaks something else) | No regression gate | Winner must pass the *whole* suite, not just the new case |
| The "70% wall" — last stretch needs debugging the AI can't do | Complexity outgrows the model's reliability | Bounded, testable problems where correctness is machine-checkable |
| "Can the AI verify auth/data actually work?" | Generation ≠ verification | Verification *is* the product |

> **Honest correction — do not oversell this.** "Competitors show you code and *then* discover it's broken" was true in 2024 and is **soft now**. Cursor and Claude Code in agent mode already write code, run your tests, read failures, and iterate before handing anything over. Pitch "we verify and they don't" to a daily Cursor user and they will correct you. The defensible claim is narrower: **they iterate one model until it passes; we select across three.** RoBoN says selection beats iteration-on-one. That's the real differentiator — and it's invisible to the user until the leaderboard shows it, which is why the leaderboard *is* the product, not a feature.

**Adjacent tools and why none of them are this:**
- *Multi-model comparison* (LMArena, Talkory, Krater) — the **human** is the judge; they show text side-by-side and you eyeball the winner. No execution, no tests.
- *Agentic IDEs* (Cursor, Claude Code, Copilot) — have the execution half **and now the iterate-until-tests-pass half**, but run **one model at a time**. Auto-routing picks a model; it doesn't race them. Selection across models is the gap.
- *Test generators* (Qodo, Diffblue) — test *existing* code. Inverse of our flow.
- *Full-stack builders* (Bolt, Replit, Lovable) — own the **visual preview** lane (WebContainers, live iframes, deployment). We deliberately do **not** compete here (see §6, §12).

**Research grounding (the mechanic is proven, the product is novel):**
- *Best-of-N* — sampling multiple candidate programs and selecting one is an established selection method.
- *CodeT / SRank* — using auxiliary generated tests to select among candidates via behavioral agreement is published and effective.
- *RoBoN (Routed Best-of-N)* — routing generations across *multiple* LLMs consistently beats best-of-N on any single model. This is peer-reviewed evidence that our "race value" metric (§13) should come back positive.

**Honest caveat:** the window is closing, not opening — Copilot Auto-routing and Bolt's "98% fewer error loops" show the majors circling reliability. Our edge is making verification the *visible, central promise* and owning the student niche where it demonstrably works, before someone bolts "run the tests" on as a checkbox.

**Uniqueness, stated honestly.** Every ingredient is commodity: multi-model fan-out is ~10 lines of LiteLLM, sandboxing is *rentable* from E2B, test generation is table stakes. There is no technology here a competent team couldn't rebuild in a month. What's uncontested is the **bundle** — nobody ships race → auto-test → verified winner as one consumer product. **A bundle is a head start, not a moat.** Three things actually hold up: (1) selection-across-models vs iteration-within-one (research-backed); (2) the student vertical (lecturer style + trap detection — unserved because it's unglamorous and the market looks small, which is exactly what makes it available); (3) **Walkthrough + syllabus fence + race-as-scoreboard (§18)** — the genuinely novel one, because Code.org and Rosche's tutor *teach but can't verify at scale* (Rosche's needs an instructor hand-supplying reference solutions per task), while CodeRace *verifies but doesn't teach*. Nobody combines them.

**The moat question.** LMArena has a real moat: accumulated human preference data the labs pay for. CodeRace accumulates *nothing* — no network effects, no data flywheel, no switching costs. A student can leave after any session and lose nothing. **Except in one scenario:** if their style profile (§17) and a semester of course notes (§18) live in the system, leaving costs them. That accumulated *student context* — not the race — is the only durable moat in this design, and it's a side effect of two features filed under v1 and v2. Worth noticing that v0 is a well-built product with weak differentiation, and v2 is a new category. That is not an argument to skip to v2 — unbuilt engines power nothing — but it should shape how the project is *talked about*.

---

## 4. Target Users

**Primary (MVP): CS Students / Junior Developers.** Need code matching lecturer-specific style constraints; benefit from the pre-code "Thinking Phase" that surfaces traps (pedagogical value, not just answers); price-sensitive.

**Secondary (v2+): Professional Developers.** Treat the tool as an Automated QA Safeguard (zero-trust AI coding). Demand destructive edge-case testing, performance benchmarks, coverage reports, BYOK privacy, IDE integration.

A single **Experience Level toggle** (Student/Junior vs Pro/Senior) switches which metrics and features surface — one product, two audiences, no UI bloat.

---

## 5. Core User Flow (Three-Phase Workflow)

```
[Phase 1: Analysis] ──> [Phase 2: Blueprint Review] ──> [Phase 3: Code Race]
 Reasoning agent         User approves / edits           Models compete;
 deconstructs problem,   the logic + edit the            tests filter;
 flags traps             edge-case list                  leaderboard ranks
```

### Phase 1 — Analysis (Reasoning Agent)
User submits prompt + optional style guidelines. A reasoning model outputs a **strict JSON blueprint**: `problem_definition`, `lecturer_traps`, `algorithmic_steps[]`, `required_test_cases[]`, and a confirmation question. **No code emitted in this phase.**

### Phase 2 — Blueprint Review (Human-in-the-Loop) — *this is our "Lovable/Claude-Design validate-before-build" step*
Stepper UI shows the analysis; traps highlighted as ⚠️ alerts. The user can:
- **Edit the edge-case / test list directly** — add ("test empty input"), remove, or let the agent decide.
- **Answer clarifying questions** the agent raises ("should `peek` on an empty stack raise, or return `None`?").
- **[Proceed]** or **[Adjust Logic]** (free-text refinement loop until approved).

On proceed, the blueprint is **locked** and becomes shared context for all competing models — every model builds on the same logical foundation, which makes the race fair.

### Phase 3 — The Code Race
1. Prompt + locked blueprint fan out in parallel to 3+ models via LiteLLM.
2. A fast/cheap model generates the test suite from `required_test_cases` (tests **only explicit requirements** — no assumptions).
3. Each candidate runs against the suite in an isolated, disposable sandbox.
4. Leaderboard ranks: tests passed → accuracy → exec time → edge cases passed → formatting compliance.
5. Winner delivered, formatted to the user's guidelines. User can manually override the winner.

---

## 6. MVP Scope

### In (v0)
- Web app, single-page, stepper UI
- **One language: Python only** (pytest ecosystem = simplest sandbox story)
- 3 competing models via LiteLLM (Claude Sonnet, GPT-4o, Gemini Pro)
- Reasoning agent (Phase 1/2) with strict JSON output + editable edge cases + clarifying-question loop
- Test generation via a fast/cheap model (GPT-4o-mini or Haiku)
- Docker-based ephemeral sandbox with pytest + pytest-json-report
- **SSE streaming** so the race is watchable live (see §7)
- Leaderboard: tests passed, accuracy, exec time, edge cases passed, winner flag
- Custom guidelines textbox (falls back to PEP 8 if blank)
- Session history with full leaderboard replay (see §8)
- UI tabs: **Leaderboard · Code · Console · Tests** (Preview tab present but disabled, labelled v3)
- **Starter templates (5, hardcoded)** — the empty state. A blank prompt box is a cold-start problem; a seeded template carries `{prompt, blueprint, tests}` so a first-time user sees a full race in one click without typing. This is the demo, the onboarding, and the "what does this thing do" answer in one feature. ~30 lines: an array rendered as chips. *Browsable gallery is v1.*
- **`ttft_ms` logged (not displayed)** — timestamp the first SSE chunk per model. Trivial once streaming exists; useful for cost/ops. **Must live in a separate column from `execution_time_ms`** and never share a label — see the metric-hygiene rule in §14.
- **Private thumbs-up/down on the blueprint** — internal telemetry only, never rendered as a ranking. This is how we learn whether the reasoning agent is any good at this stage, and it feeds prompt iteration. Costs nothing. (See the ratings row in the deferred table for why it stays private.)

### Out (deferred) — captured, not lost
| Feature | Deferred to | Why it's deferrable |
|---|---|---|
| **Live visual Preview pane** (games, full-stack) | v3 | Python has no visual output; the Console tab *is* the preview. Building a preview pane = entering Bolt's lane where we have no edge. |
| JS / Java / C++ support | v1.x | Each language = another test-runner + sandbox image. Same engine, new target. **Pattern when we get there:** separate per-language Dockerfiles (`python.Dockerfile` `FROM python:3.12-slim`, `java.Dockerfile` `FROM openjdk:21-slim`), each pre-built into its own image; the **host** orchestrator maps `language → image_name` and swaps the image at container-run time. *Not* a mega-image with every toolchain baked in (3GB, one broken compiler breaks all languages, 15-min rebuilds). Also *not* Docker Compose — Compose orchestrates long-running services that talk to each other; our container lives ~4s and talks to nobody. Two traps in the naive version: (a) the per-language container must run *that language's* command (`javac`/`gcc`), not a Python runner — the orchestration stays on the host; (b) the mount must stay `rw` or the report can't be written. This is a ~10-line `image_map` dict added to a *working* sandbox — not a design problem. |
| Live Dev-Console polish (multi-pane terminal) | v2 | Data already produced by v0; this is display polish. First item off the deferred pile. |
| RAG (syllabus/rubric upload, live docs) | v2 | v0 user pastes guidelines directly — nothing to retrieve yet. |
| **MCP context selection** (user picks connectors to inject context) | v2 | Same category as RAG — external context injection. Not needed to prove the race. |
| Integration tests + ephemeral DBs (full-stack) | v3 | "Aim the engine at harder targets." Gated behind a working v0. |
| Headless game-logic race + perf stress tests | v3 | Same — engine reuse on a harder target. |
| Multi-file regression protection | v3 | Real subsystem; needs the core loop solid first. |
| Fine-tuned test-generator model | v3 | Needs labeled data + a validated product first; blocked until v0 generates that data. |
| BYOK / local sandbox privacy mode | v2 | Enterprise concern, not the student MVP. |
| Coverage %, memory profiling, Big-O estimate | v2 (Pro mode) | Tie-breaker polish, not the core loop. |
| **Style-extractor + editable style profile** | v1 | The Phase-2 review pattern applied to *style*: user drops a code sample, an agent proposes observable conventions, user edits, profile locks + persists. Reuses the propose→edit→lock loop and a Postgres column. See §17. |
| **Walkthrough mode** (tutor that withholds answers) | v2 | A second product philosophy (user writes, AI teaches). Needs a stateful multi-turn loop v0 doesn't have. Reframes the race as a *scoreboard for the student's own code*. See §18. |
| **Syllabus-RAG as knowledge fence** | v2 | Powers Walkthrough. RAG's real use here isn't nicer explanations — it's *bounding* the AI to the concepts the student has actually been taught, killing the "from the future" tell. See §18. |
| **Global Stats page** (all-time model rankings, win streaks, win-rate by task type) | v1 | Not hard — a `GROUP BY model_name` over `model_runs`, which v0 already populates. **The problem is that it's empty, not that it's expensive.** Day one = zero completed races; you'd ship a page that renders "no data yet" for its entire useful life. It's also gated on brick 5 (persistence), i.e. the end of v0 anyway. **Data accrues from the first race whether the page exists or not** — ship v0, run 200 races, then build it and it opens with content. Frame it as **race-value (§14) made visible**: if one model wins ~90% all-time, that's either your best content or evidence the multi-model thesis is weaker than RoBoN predicts. |
| **Template gallery** (browsable, seeded blueprints + test cases) | v1 | v0 ships 5 hardcoded chips (that's the load-bearing part). A browsable, categorised, searchable library is a content problem, not an engine problem. |
| **Benchmark report export** (correctness/efficiency/style reports) | v2 (Pro) | The feature says it out loud: *"for research and engineering teams."* That's not a student. Also a report of zero races, for teams you don't have. Positioning drift toward benchmark-platform scope. |
| **TTFT / latency as a headline metric** | v2 (Pro) | Logged in v0, displayed later. A student does not care that Claude took 2.1s and Gemini 3.4s to *type*. Metric for a product whose subject is models — ours is the student's code. |
| **Spectator mode** (invite team to watch live, discuss) | v3+ | "Replay past races" is free (session history). "Invite your team to watch live and discuss" is a whole collaboration subsystem: presence, share permissions, real-time multi-client, comment threads. And *"your team"* isn't a student. Most seductive card on the board, most expensive. |
| **Reasoning-model picker + PERSONAL ratings** | v1 | *This one is approved — with one constraint.* User picks their reasoning model from ~5 options per session and rates it afterward. **Sequential, not parallel** — one call, one blueprint, zero extra thinking-token spend (a parallel reasoning race would triple the most expensive model class on every prompt; this doesn't). The rating is legitimate here because **"tests decide" does not extend to reasoning** — a blueprint has no test suite, so there's no green check for "spotted the 1-indexing trap." A vote isn't vibes-replacing-evidence; it's the only signal available. **The constraint: the resulting leaderboard must be PERSONAL, not public.** *"Your reasoning models — 8 sessions: Claude ★4.6 (5), GPT-4o ★3.2 (2)."* A **public aggregate** would be invalid on two counts: (a) **selection bias** — users choose their model, so the students picking o3 aren't the same students on the same problems as those picking 4o-mini; a higher rating can't be separated from self-selection; (b) **brand halo** — the user knows they picked Claude, so the rating measures satisfaction with a prior belief. Fixing both means blind, random assignment = rebuilding LMArena's methodology at 0.001% of their volume. A chart that *looks* authoritative on data that can't support it is worse than no chart. Personal is honest (explicitly n=1, claims nothing objective), more useful to that student, and still aggregable **privately** to pick our defaults. |
| **Public user ratings / votes on models** | ❌ **never** | Not a scope call — a **thesis contradiction**. The first line of this PRD is *proof is the product; tests decide, not vibes*. A vote button is vibes. It is also **literally LMArena's business**, whose moat is vote data at a scale we will never approach — competing on their strength with 0.001% of their volume, using the mechanism this product exists to replace. Blueprints have no test to verify against, so ranking reasoning models can *only* be voting. **Allowed:** a private thumbs-up/down on blueprint quality as internal telemetry feeding prompt iteration. **Never:** a public model ranking. *The line: our leaderboard ranks models by what the tests proved. The moment it ranks them by what users felt, we're in the wrong business.* |
| Payments / subscriptions | post-validation | Ship the free loop first. |

**The deferral principle:** every deferred feature *reuses* v0's core loop (generate → test → filter → rank) aimed at a harder target or enriched with more context. None of them replace the core. That's what makes them clean deferrals rather than a different product.

---

## 7. System Architecture

```
┌─────────────┐   HTTP + SSE   ┌──────────────────┐     ┌────────────────────┐
│  Frontend    │◀──────────────▶│  Backend (API)    │────▶│  Reasoning Agent    │
│  React/Next  │                │  Python FastAPI   │     │  (JSON blueprint)   │
└─────────────┘                └──────┬───────────┘     └────────┬───────────┘
                                       │                           │ locked blueprint
                                       │            ┌──────────────┴──────────────┐
                                       │            ▼                              ▼
                                       │   ┌────────────────┐          ┌───────────────────┐
                                       │   │ Test Generator  │          │ Code Race (xN)     │
                                       │   │ (fast model)    │          │ via LiteLLM        │
                                       │   └───────┬────────┘          └────────┬──────────┘
                                       │           │ test_solution.py            │ candidates
                                       │           ▼                             ▼
                                       │   ┌─────────────────────────────────────────┐
                                       │   │  Execution Sandbox (Docker, ephemeral)   │
                                       │   │  pytest --json-report + linter + timing  │
                                       │   └───────────────────┬─────────────────────┘
                                       ▼                       ▼
                                ┌─────────────┐        ┌──────────────┐
                                │ PostgreSQL   │◀───────│  Leaderboard  │
                                └─────────────┘        └──────────────┘
```

### Stack decisions
- **Backend:** Python + FastAPI (orchestration)
- **LLM orchestration:** LiteLLM — one standardized interface across providers; racing = swapping a model string
- **Sandbox:** local Docker Engine API (via `docker` Python SDK) for v0 → E2B or Modal at scale
- **Frontend:** React/Next.js (Gradio acceptable only as a throwaway backend-proving spike)
- **DB:** PostgreSQL
- **Live updates:** Server-Sent Events (SSE) — server→client only, which is exactly the race case; far simpler than WebSockets in FastAPI

### Architecture principle
The agent/orchestration layer stays **framework-agnostic** — no FastAPI or frontend imports in agent code — so the sandbox provider (Docker → E2B) or the UI shell can be swapped without rewrites.

### How the sandbox actually runs

**Mental model — three nouns, kept strictly separate:**
- **Image** = frozen template. Built *once* (`docker build`). Contains Python + pytest + pytest-json-report and **nothing else**. No solution code, no tests, no secrets, no `CMD` we rely on.
- **Container** = a live, disposable instance of that image. Created *per candidate*, destroyed after ~seconds.
- **`solution.py` / `test_solution.py`** = **data**, not part of the image. They arrive at run time via bind mount.

**Docker is not part of the AI pipeline — it is a safety wrapper around one step of it.** Generation (LLM API calls) and test *authoring* (a fast LLM writes `test_solution.py`) happen on the host with no container involved; text from an API is inert. Docker appears at exactly one moment: when untrusted code must be **executed**. pytest does the testing; Docker only guarantees the room has no exit.

#### Sandbox Dockerfile (four lines — the simplicity is the security property)
```dockerfile
FROM python:3.12-slim
RUN pip install --no-cache-dir pytest pytest-json-report
WORKDIR /sandbox
USER nobody
```
- **No `COPY` of solution code.** `solution.py` does not exist at build time — it exists seconds before the container starts and differs every request. `COPY`ing it would force an image rebuild per prompt (sequencing impossibility + absurd cost). *This is the opposite of the standard app-image pattern (`COPY pyproject.toml` → `RUN uv sync` → `COPY . .`), which IS correct for the FastAPI backend image later — but wrong here.*
- **No `CMD`.** The runner supplies a different command per execution. (Note: `python:3.12-slim` bequeaths an inherited `CMD` of `python3`; we always override it by passing a command after the image name.)
- **`WORKDIR` must equal the mount target** (`/sandbox`), or bare `pytest` finds no tests. Most common wiring mistake.
- Base image must be **ARM64-native** (`python:3.12-slim` is multi-arch) so it runs natively on Apple silicon. Do not force `--platform linux/amd64`; that pulls in Rosetta emulation unnecessarily.

#### Per-candidate execution loop (`run_in_sandbox(code, tests) -> dict`)
1. **Host:** `mkdtemp()` → temp dir.
2. **Host:** write `solution.py` + `test_solution.py` into it. **Both files must be written before the container starts** — pytest's collection phase won't pick up files that appear mid-run.
3. **Host:** `chmod 777` the temp dir (see permissions gotcha below).
4. **Docker:** `containers.run(image, command="pytest --json-report --json-report-file=/sandbox/report.json", volumes={tmp: {"bind": "/sandbox", "mode": "rw"}}, network_mode="none", ...)`.
5. **Container:** pytest imports and executes `solution.py`, writes `/sandbox/report.json`.
6. **Host:** `container.wait(timeout=N)` → exit code.
7. **Host:** `container.logs()` → stdout/stderr.
8. **Host:** `container.remove(force=True)` → jail destroyed.
9. **Host:** `json.load(tmp/report.json)` → structured results.

N models ⇒ **N temp dirs, N containers**, the same test file written into each. They run in parallel, cannot see each other, and one candidate's infinite loop cannot hang another's evaluation.

#### The bind mount is a window, not a copy
`-v /tmp/xyz:/sandbox` does not copy anything. The container's `/sandbox` path *points at* the host's `/tmp/xyz` — same bytes, two names.

Consequences:
- Editing a file on the host changes what the container sees. No rebuild.
- When pytest writes `/sandbox/report.json` **inside** the container, that file is written **to the host disk**, and appears the instant pytest closes it.
- **This is how results get out.** There is no "mirror back" step. The report was never inside the container; only the *process* was. The container is destroyed; the report survives because it was always on the host.

Three file-crossing mechanisms, for clarity:

| | When | Direction | Use here? |
|---|---|---|---|
| `COPY` (Dockerfile) | Build time | Host → image, frozen | ❌ rebuild per request |
| **Bind mount `-v`** | Run time | Both ways, same bytes | ✅ **this one** |
| `docker cp` | Any time | Explicit copy in/out | ❌ 3 round-trips vs 0 |

#### Three result channels (use all three)
- **Exit code** — coarse signal. pytest: `0` all passed · `1` some failed · `2` collection error · `5` no tests found.
- **stdout/stderr** — human-readable tracebacks. Prints to terminal by default; `container.logs()` in Python.
- **`report.json`** — the structured truth, consumed by the leaderboard. **Never regex-parse terminal text.** Drops straight into `model_runs.test_results`.

#### Mandatory security flags (running AI-written code — non-negotiable)
- `network_mode="none"` — no internet; kills exfiltration and most malicious payloads
- `mem_limit` + `nano_cpus` / `cpu_quota` — an infinite loop or memory bomb can't take the host down
- wall-clock `timeout` enforced by the backend (kill container after N seconds)
- `read_only=True` root filesystem + small `tmpfs` scratch; **non-root user** (`USER nobody`)
- **No env vars / secrets mounted.** Never mount `.env` — API keys must not exist in a room where untrusted code runs.
- **`.dockerignore`** must exclude `.venv/`, `__pycache__/`, `.env`, `.git/` so host artifacts can't leak into the image. The host `uv` venv is macOS/ARM binaries and is irrelevant to the container; the image installs its own deps via `RUN pip install`.

#### Known gotchas (hit these before Claude Code does)
- **`USER nobody` + `report.json` permission denied.** A non-root container user cannot write into a root-owned host temp dir. Fix: `chmod 777` the throwaway temp dir on the host before running. Symptom: confusing "file not found" at step 9 with no obvious cause.
- **Mount must be `rw`, not `ro`.** `pytest --json-report` writes its report into the mounted dir. A read-only mount silently breaks result retrieval.
- **`WORKDIR` ≠ mount target** ⇒ pytest collects zero tests and exits `5`.

#### Verification (build-order step 1 is not done until all three pass)
```bash
# 1. it runs and prints
docker run --rm --network none -v "$PWD/workdir:/sandbox" coderace-sandbox python solution.py
# 2. infinite loop is killed, not the host
echo 'while True: pass' > workdir/solution.py   # + timeout wrapper → container dies
# 3. the jail holds
echo 'import urllib.request; urllib.request.urlopen("http://example.com")' > workdir/solution.py
# ^ must raise a network error. If it succeeds, the sandbox is not real.
```

#### Isolation ceiling (be honest about this)
Docker containers **share the host kernel** (namespaces + cgroups, not separate kernels). A kernel vulnerability breaks the isolation. This is acceptable for local development and a first demo; it is *not* "run hostile code from strangers at scale" safe. That is precisely why the `run_in_sandbox()` seam exists — see the E2B/Modal (Firecracker/gVisor-class, separate kernels) swap path above. Do not let a tutorial convince you plain Docker is the final answer.

### How the live race streams (SSE event flow)
- `blueprint_ready` → frontend renders Phase 2 review
- `code_ready` (per model) → that model's card streams in its generated code
- `test_result` (per model) → the card flips to a status strip (`✓ 5/5` / `✗ 3/5 — test #3 IndexError`)
- `race_complete` → view collapses from live cards into the ranked leaderboard

---

## 8. Data Model (PostgreSQL)

**You do not track sandboxes.** A sandbox has no persistent identity — it lives ~4s and is incinerated. There is no `sandboxes` table. What persists is the *result* of a run: **each `model_runs` row is the fossil record of one dead container.**

```sql
CREATE TABLE users (
    user_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one problem thread = one sidebar entry
CREATE TABLE sessions (
    session_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one turn within a session ("write a Stack" / "now add peek")
CREATE TABLE messages (
    message_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    turn_index          INT  NOT NULL,            -- explicit ordering; created_at alone is fragile
    user_prompt         TEXT NOT NULL,
    user_specifications TEXT,                     -- the guidelines textbox
    approved_blueprint  JSONB,                    -- the locked Phase-2 reasoning
    generated_tests     TEXT,                     -- the test_solution.py string
    blueprint_feedback  SMALLINT,                 -- private thumbs +1/-1, telemetry only, never ranked
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, turn_index)
);

-- one row per model per turn = the leaderboard = one dead container's verdict
CREATE TABLE model_runs (
    run_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    model_name        TEXT NOT NULL,              -- 'claude-sonnet-4-6'
    generated_code    TEXT NOT NULL,              -- the solution.py string
    test_results      JSONB NOT NULL,             -- SandboxResult.tests
    passed            INT  NOT NULL DEFAULT 0,
    failed            INT  NOT NULL DEFAULT 0,
    errors            INT  NOT NULL DEFAULT 0,
    total             INT  NOT NULL DEFAULT 0,
    all_passed        BOOLEAN NOT NULL DEFAULT FALSE,
    timed_out         BOOLEAN NOT NULL DEFAULT FALSE,
    exit_code         INT,
    execution_time_ms REAL,                       -- how fast the CODE RAN  (evidence)
    ttft_ms           REAL,                       -- how fast the MODEL TYPED (ops only — never conflate)
    stderr            TEXT,                       -- the Console tab
    lint_violations   JSONB,
    is_winner         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON sessions   (user_id, created_at DESC);   -- sidebar
CREATE INDEX ON messages   (session_id, turn_index);     -- replay a thread
CREATE INDEX ON model_runs (message_id);                 -- one turn's leaderboard

-- the winner is the one field the whole product's claim rests on:
-- let the DB make a double-winner impossible.
CREATE UNIQUE INDEX ON model_runs (message_id) WHERE is_winner;
```

**Why this shape.** `model_runs` is a near-direct mirror of the `SandboxResult` dataclass — runner returns a verdict, we persist the verdict, the leaderboard reads the verdict. One shape through three layers, no translation. `test_results` stays JSONB because per-test detail is variable-length and only ever read whole to render the Tests tab; normalising it into a `tests` table you'd never query across buys nothing.

**`all_passed` is a stored column here but a computed property on the dataclass.** That's deliberate — you want `WHERE all_passed` in SQL without recomputing five conditions. But it means it must always be written **from** `result.all_passed` and never hand-set, or the flag drifts from the counts it summarises.

**Cardinality:** `users 1─∞ sessions 1─∞ messages 1─∞ model_runs`, with exactly one `is_winner = TRUE` per message. Three models racing one turn = three rows sharing a `message_id`. That *is* the leaderboard.

Reloading a session replays exactly what each model produced, the test suite, and the historical winner. The sidebar is a view over `sessions`; each session's main pane is a stack of turn-blocks ordered by `turn_index`.

### Multi-turn context recovery (FR-6)
On a follow-up ("now add a peek method"), reconstruct context as a **clean single-model chat history** using **only the winning code** from prior turns — never the full leaderboard. The test generator reads history + new prompt and *updates* the suite (adds a `.peek()` test); the full race loop repeats.

---

## 9. UI / Information Architecture

### The reframe: this is not a chat app — it's a CI dashboard fed by LLMs
Everything in the product — pass/fail, per-test breakdowns, exec time, logs, run history — belongs to the **test-runner** genre, not the chatbot genre. The positioning says verification is the product; the UI must say it too. Chat UIs signal *"I generate things."* Dashboards signal *"I prove things."* A verification tool that looks playful undercuts its own claim.

### Four surfaces, four genres, four reference classes
There is no single app to copy — that's why every inspiration feels half-right. The product has **four distinct surfaces**, each in a different genre:

| Surface | Its one job | Version | Genre | Steal from |
|---|---|---|---|---|
| **Workspace** | run a race, show the verdict | v0 | CI run view | **GitHub Actions run view** (the big one), Vercel deploys, CircleCI |
| **Blueprint review** | approve/edit a proposal before it locks | v0 | editable checklist / review form | Linear issue editor, GitHub PR review, Claude Design's clarify step |
| **Empty state → Templates** | "give me something to run right now" | v0 (5 chips) → v1 (gallery) | starter gallery | Bolt prompt chips, Vercel/Replit templates, LeetCode problem list |
| **Stats** | which model actually wins, over time | v1 | data leaderboard | LMArena, OpenRouter rankings, Artificial Analysis |
| **Tutor** | teach without telling | v2 | editor + guided chat | Python Tutor, Code.org AI Tutor, Rosche's Socratic Tutor |

**GitHub Actions is the structural cousin, not arena.** Parallel jobs listed vertically, green check / red X per job, expand any one for its logs, timing per job, run history down the side. **Swap "jobs" for "models" and that is the leaderboard exactly.** They solved this layout years ago — steal it rather than reinvent it.

**Linear is the aesthetic register** — density, restraint, keyboard-driven, monospace where it earns it. Note what Linear *doesn't* do: no gradients, no illustrations, no personality in the chrome. The data is the interface.

**From LMArena take the race moment only** (session rail, "watch it build" streaming). Leave the 2-up split — we have 3+ models and vertical ranking beats cramped columns.

**Do NOT copy Bolt/Lovable's chat-left / live-canvas-right split.** That layout exists to showcase a *preview*; reaching for it drags us toward deferred v3 scope. Their canvas is a rendered app; ours is test output. Different genre, different layout.

### Layout (Workspace surface)
**Layout:** left rail (sessions) + main workspace.
- **Left rail:** session list grouped Today / Yesterday (arena-style). Click = replay stored leaderboard.
- **Top:** three-phase stepper (Analysis → Blueprint → Race), making the pre-validation flow visible.
- **Prompt summary bar:** the request + guideline chips (`PEP 8`, `explicit types`).
- **Tab bar:** `Leaderboard · Code · Console · Tests` — plus a greyed-out `Preview (v3)` so the scope boundary is visible in the product itself.

**Two states of one race view:**
- **During race** — a row/column of model cards, each streaming code then flipping to a pass/fail strip (arena's "watch it build" energy, via SSE).
- **After race** — collapses into a **leaderboard-primary** layout: 3+ models ranked **vertically** (not arena's cramped 2-up side-by-side), winner expanded with code + per-test breakdown, others collapsed and expandable.

**Why not a visual preview pane in v0:** a `Stack` class doesn't render. The Console (test output) and Leaderboard *are* the preview — watching tests go green is the thing arena/Bolt can't show. Preview only earns a tab in v3 when visual output (games, full-stack) exists.

*(Reference mockup: `coderace-ui-mockup.html`.)*

---

## 10. Functional Requirements

- **FR-1 Prompt & Guidelines.** Prompt (required) + optional guidelines panel. Backend assembles the final prompt: system prompt → guidelines (or defaults) → few-shot good/bad examples → user request.
- **FR-2 Reasoning Agent.** Valid JSON only (`problem_definition`, `lecturer_traps`, `algorithmic_steps[]`, `required_test_cases[]`); no code in Phase 1; refinement loop persists edits until approval; edge-case list is user-editable.
- **FR-3 Parallel Generation.** Fan out via LiteLLM to N models. Each coding agent receives prompt + `algorithmic_steps` + `lecturer_traps` in its system prompt. Stream progress via SSE.
- **FR-4 Test Generation & Execution.** Fast model; strict "explicit requirements only" prompt. Tests written to `test_solution.py` in the sandbox. Isolated, ephemeral, no network. Capture stdout/stderr, per-test pass/fail, exec time.
- **FR-5 Leaderboard & Delivery.** Rank tests passed → accuracy → speed → edge cases → formatting. Winner formatted to guidelines. Manual override stored as preference.
- **FR-6 Session History & Recovery.** Persist every turn; reconstruct clean winning-code-only history on follow-ups; test suite updates per new requirement.
- **FR-7 Agent Tool Loop (self-correction).** Coding agents get sandbox tool access: generate → execute → read errors → self-correct → resubmit (bounded retries). Linter (Flake8/Black) enforces style mechanically; violations fed back for auto-fix.

---

## 11. Non-Functional Requirements

**Security (highest-risk area).** Never execute generated code on the host. Disposable, network-isolated containers with CPU/memory/wall-clock caps; no secrets mounted. (Full flags in §7.)

**Cost & latency.** Model-tier by job: fast/cheap (4o-mini, Haiku) for test generation + Free-tier reasoning; expensive models reserved for code candidates. `max_completion_tokens` caps on reasoning models. Prompt caching (Anthropic/OpenAI) for iterative sessions (~up to 50% savings on repeat turns). SSE streaming keeps perceived latency low.

**Reliability — the "Broken Test" problem.** Flawed AI tests can fail good code. Mitigations: structured JSON test output, strict explicit-requirements-only prompting, and (v1.x) a test-sanity pass where a reference solution must pass the suite before it's used as a filter.

---

## 12. Monetization (post-validation)

| Tier | Reasoning Agent | Race Models | Target |
|---|---|---|---|
| **Free** | GPT-4o-mini class | Haiku / Flash / 4o-mini | Homework, syntax help |
| **Pro** | o3-mini class | Sonnet / GPT-4o / Gemini Pro | Assignments, strict guidelines, trap detection |
| **Elite** | Full heavy reasoning | Max parallel race + perf tests, BYOK, coverage | Production code, pro devs |

Payments deferred until the free loop is validated. Gateway TBD (Stripe vs Lemon Squeezy).

---

## 13. Roadmap

- **Phase 1 (v0) — Prototype (prompting + tools).** Python-only web app, 3-model race, Docker sandbox, pytest runner, SSE streaming, session history, the four tabs. **v0 agents: (1) reasoning agent that breaks down the problem → (2) test-generator agent → (3) three coding agents racing.** No judge agent, no style extractor, no walkthrough. *Goal: prove the loop end-to-end.*
- **Phase 2 (v1) — Student depth.** Style-extractor + editable style profile (§17); JS support; test-sanity pass (broken-test mitigation); winner-explainer (judge) agent.
- **Phase 3 (v2) — Learning platform + Pro seams.** Walkthrough mode + syllabus-RAG knowledge fence (§18); rubric/syllabus upload; MCP context selection; Pro-mode metrics (coverage, edge-case depth); BYOK + local sandbox; bring-your-own-tests; Live Dev-Console polish.
- **Phase 4 (v3) — Scale + developer delivery.** Full-stack integration tests w/ ephemeral DBs; headless game-logic race + perf stress tests; multi-file regression protection; visual Preview pane; fine-tuned test generator; **terminal-native developer tier** (Claude-Code-style in-repo agent that races models against the repo's own tests and opens PRs — gated on BYOK + multi-file sandboxing); IDE extension; PR bot.

**Market expansion (student → developer), for reference — all v2+:** developers don't want a different product, they want the same engine with the *trust dial* turned up. Every student feature has a professional twin over the *same machinery*: lecturer style → team lint config; trap detection → security/edge fuzzing; pass/fail → perf benchmarks; generated tests → **bring-your-own-tests** (they trust theirs); syllabus-RAG → codebase-RAG. The two features that actually unlock the developer market are **BYOK** (proprietary code never leaves their machine) and **bring-your-own-tests** (races against their trusted ground truth, sidestepping the broken-test problem). Delivery is terminal-native (§ Phase 4), not a second product.

---

## 13b. Value by Version — problem / value / pitch

> The version to read aloud in an interview or to an accelerator. Includes the honest reads, because knowing which version is thin is more useful than pretending they're all strong.

**The core insight underneath all four:** for an easy assignment we have **no value prop** — a student writing FizzBuzz opens ChatGPT, gets working code, and moves on. Free, instant, good enough. We will never win that user. Our value exists only at **the moment of doubt**: 1am, weird constraints, ChatGPT gave them something that *looks* right, and they cannot tell. **Every AI coding tool asks students to trust. We're the only one that offers proof.** Their alternative gives a *feeling*; we give *evidence*.

### v0 — The Receipt
- **Problem:** *"ChatGPT gave me code. I don't know if it's right and I can't tell."*
- **Value:** Evidence instead of faith — code that arrives with a test suite already passed and two rival models' failures shown beside it.
- **Pitch:** *"Everyone else gives you an answer. We give you the receipt."*
- **Honest read:** the **weakest** version — expect that. Loses to free ChatGPT on speed for easy work. Its job is not to win users; it's to prove the engine runs. Ship it, get five students on it, don't be shocked when the pitch lands softly.

### v1 — In Your Voice
- **Problem:** *"The code works, but my lecturer will know I didn't write it — and I don't know why one model beat the others."*
- **Value:** Verified code matching the student's own conventions, plus a judge that explains the verdict via the specific test each loser failed.
- **Pitch:** *"Code that passes — written the way you write."*
- **Honest read:** the **judge is the quiet star** — it converts a leaderboard into a lesson. The style profile is the risky half: it's the feature most likely to read as *"helps you disguise AI work."* Decide which side of that line you're on before building it.

### v2 — The Category
- **Problem:** *"I actually need to learn this, and every AI either does it for me or teaches me things my course hasn't covered — which is exactly how professors spot AI."*
- **Value:** The only tutor **fenced to your syllabus** that can also **verify at scale**, then races three frontier models against *your* solution to show where you stand.
- **Pitch:** *"You write the code. Three AIs try to beat you. Find out if they did."*
- **Honest read:** **this is the real product.** The only version with a claim nobody can casually copy and the only one with a moat (§3). Everything before it is scaffolding for it.

### v3 — Proof in the PR
- **Problem:** *"I don't trust AI-written PRs, and I'm not pasting proprietary code into a web app."*
- **Value:** Races models against **their** tests, in **their** repo, on **their** machine, with **their** keys. Cursor iterates one model; we select across three, and nothing is proposed that didn't pass their ground truth.
- **Pitch:** *"The PR already passed your suite."*
- **Honest read:** biggest market, furthest away, gated on multi-file sandboxing that doesn't exist.

### The throughline
| | v0 | v1 | v2 | v3 |
|---|---|---|---|---|
| Who writes the code | AI | AI | **the student** | AI |
| What the race proves | the code works | which model fits *you* | **how good you are** | it's safe to merge |
| Trust dial | ↑ | ↑↑ | ↑↑↑ | ↑↑↑↑ |

**One engine — generate, test, filter, rank — pointed at four escalating definitions of *trust*.** That's the pitch in one sentence: *the same verification loop, aimed at harder and harder questions about whether you can believe what's on your screen.*

---

## 14. Success Metrics

- **Correctness rate** — % of delivered winners accepted without modification.
- **Race value** — % of sessions where the winning model differs across prompts. *If one model wins ~95% of races, the multi-model premise collapses — this is the number that validates or kills the core idea.* (RoBoN literature predicts positive.)
- **Phase 2 engagement** — % of users who edit the blueprint/edge cases before proceeding (pedagogical-value signal).
- **Cost per completed race** — must trend toward tier margins.
- **Session return rate** — users continuing multi-turn sessions.
- **Judge integrity check (v1+)** — if the explainer agent ever names a winner different from the test ranking, that's a **bug, not a feature**.

### Metric hygiene (non-negotiable)
- **`execution_time_ms` = how fast the CODE RAN.** Evidence about code quality. Rank on it.
- **`ttft_ms` = how fast the MODEL TYPED.** An ops/cost number. **Never** share a column, a label, or a leaderboard position with the above. Conflating them is benchmark-brain: a student does not care that Claude took 2.1s and Gemini 3.4s to type. Our subject is the student's code, not the models.
- **Ratings are never evidence.** Tests are evidence. See the ratings rows in §6.

---

## 15. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| AI-generated tests reject correct code | Structured schema, explicit-requirements-only prompting, reference-solution sanity check |
| Cost blowout from parallel frontier calls | Tiered models, token caps, caching, Free-tier downgrade |
| Sandbox escape / malicious generated code | Ephemeral isolated containers, no network, resource limits; managed provider at scale |
| Academic-integrity optics | Thinking Phase positions it as a tutor (logic-before-code), not an answer machine |
| Ties at 100% pass | Tie-breaker ladder: speed → conciseness → formatting → coverage |
| Majors add "run the tests" first | Own the student niche + make verification the visible promise now |

**Open questions**
1. Product name (CodeRace is a placeholder).
2. Phase 2 blueprint display: plain text vs generated flowchart?
3. Sandbox hosting: self-hosted Docker vs E2B/Modal from day one?
4. PostgreSQL confirmed, or is document-store flexibility worth MongoDB?

---

## 16. Build Order (first bricks)

1. **Sandbox in isolation** — one hardcoded Python string run against one hardcoded pytest file in an ephemeral Docker container, returning structured JSON. *No AI, no UI yet.* This is the one genuinely new skill; prove it alone first.
2. **Single-model generate → test** — one LiteLLM call produces code; feed it to the sandbox from step 1.
3. **The race** — fan out to 3 models; rank the results.
4. **Reasoning agent (Phase 1/2)** — blueprint JSON + review step.
5. **Persistence** — the three tables; session replay.
6. **Frontend** — stepper + four tabs + SSE live race.

Each brick is independently testable and deliberately broken before moving on.

---

## 17. Style-Extractor + Editable Style Profile (v1 — NOT v0)

> **Scope guard:** this is a v1 feature. v0 ships without it. It's documented here so the design is settled before it's built, not so it's built early.

**What it is.** Instead of asking the user to describe a style in words, the user **drops a code sample they wrote themselves** (comments included). An extractor agent reads it, proposes a list of *observable* conventions, and the user **edits the list** (add / remove / toggle) before it locks. This is the Phase-2 review pattern (AI proposes → user edits → lock) applied to style — one consistent interaction across the product.

**Why an editable list, not silent imitation.** Silent style-matching is un-auditable: if the model misreads the sample, you find out only when the output looks wrong. Surfacing the interpretation as a confirmable list moves the model's understanding into the open *before* code is written. The user catches "always single-letter variables" and deletes it. This is the safety mechanism, not a nicety.

**Why it's few-shot, not RAG.** Style is a pattern demonstrated, not a fact retrieved. A confirmed profile is short and structured — inject it directly into the coding agents' prompt. RAG only re-enters if matching a *whole corpus* of the student's past code (v2+).

**The extracted list must be specific and checkable, never vibes.** Good items are observable and (often) lint-verifiable:
```
Observed conventions (edit as needed):
✓ snake_case for variables and functions
✓ type hints on all function signatures
✓ terse inline comments, only on non-obvious lines
✓ guard clauses over nested if/else
✓ prefers explicit loops over comprehensions
```
"Clean, readable code" is banned — un-actionable, invites hallucination.

**Anti-hallucination guards (baked into the agent):**
- Extract ONLY conventions visible in the sample. If a convention isn't demonstrated, don't list it — use standard defaults, don't guess.
- **Thin-sample floor:** under ~15 lines / one full function, return few conventions and say so ("Limited sample; detected 3. Drop more code for a fuller profile."). Padding the list *is* the hallucination.
- The sample is a STYLE reference, not a template: never copy its variable names, values, or logic into solutions.
- Correctness first, style second — style never overrides the blueprint's logic.
- Where a convention maps to a lint rule, the **linter verifies** the output instead of trusting the model's self-report.

**Persistence.** A confirmed profile stores as `user_id → style_profile` (new column / table). Future sessions start pre-loaded; the student doesn't re-drop code each time. This is what turns a gimmick into "the tool that knows how I code."

**Integrity caveat (decide before building).** "AI writes in my style" is useful for learning but can also disguise AI code as the student's own. Know which side of the tutor-vs-cheating-machine line this sits on. The Walkthrough direction (§18) is the honest counterweight.

---

## 18. Walkthrough Mode + Syllabus-RAG Knowledge Fence (v2 — NOT v0)

> **Scope guard:** v2, and possibly its own product. v0 builds none of this. Documented so the vision is coherent on paper and correctly walled off.

**The fork.** When a user drops code (or a problem), two options: **[Code]** (the CodeRace race — AI writes it) or **[Walk me through]** (a tutor mode where *the student writes it* and the AI teaches). Two opposite philosophies sharing one engine:

| | Code mode | Walkthrough mode |
|---|---|---|
| Who writes the code | AI | The student |
| AI's job | generate + verify | teach, withhold, question |
| Speed | fastest path to working code | deliberately slow |
| Serves | "I need this done" | "I need to learn this" |

**Why it matters strategically.** Every AI coding tool has a cheating-machine problem hiding in it. Walkthrough flips CodeRace from "three AIs write your assignment" into a tutor — and **reuses the race as the *reward*, not the product**: after the student finishes their own solution, run it against three frontier models and show how they did. The leaderboard becomes a scoreboard for the student's own code. Same engine, opposite intent.

**The hard part: a tutor that refuses to hand over the answer.** The entire pedagogical value is the AI *not* writing the stuck line and instead asking the question that unblocks the student. Every model is trained to be helpful (= just tell you), so withholding is the core prompt-engineering challenge and the make-or-break of the feature. Guardrails:
- NEVER write the solution or the line the student is stuck on — even if asked directly. Writing it is a failure.
- When stuck: ask ONE question that moves them one step — point at the concept, not the code ("what happens to the top pointer when you pop the last element?" not "add a null check").
- When they guess wrong: don't correct with the answer — ask what they expected, let them find the gap.
- Concepts are fair game (what a pointer *is*); solutions are not.
- Match the language: C → pointers, memory, off-by-one; Python → mutability, references.
- Only after they have a working solution, run the race and show the comparison.

*Test this like the sandbox: build a deliberately-stuck fake student and confirm the agent refuses to cave under direct pressure. If it hands over the answer, the prompt isn't done.*

### Prior art — read before building (this has been done; learn from it)
- **Ben Rosche's Socratic Tutor** (VS Code extension, open source: `github.com/benrosche/socratic-tutor-public`) — **our exact design, already built.** Key mechanism worth stealing: the tutor is **given the reference solution privately** (fetched from an instructor-controlled private repo) and the system prompt *forbids reproducing it*. The model uses it only as ground truth for diagnosing what the student is missing and choosing how strong a hint to give. This answers a question our §18 doesn't: **how does the tutor know what's wrong without solving it itself?** Answer: give it the answer privately and forbid the leak. More reliable than hoping it diagnoses from scratch. Go read the system prompt.
- **The hint ladder** — mature tutors don't have one withholding rule; they use a **graduated ladder (levels 0–4)** that escalates only as the student keeps struggling: question → nudge → concept → worked analogy → (maybe) more. Rosche's responses get progressively more concrete across turns. Our rules above are currently binary ("never write the stuck line"); **a ladder is better**. Also: frustration alone is NOT grounds for exiting tutor mode — a single "just tell me" is frustration, not a mode-change request.
- **The failure mode has a name: *answer over-disclosure*** (SafeTutors benchmark) — tutors that appear useful but short-circuit reasoning and learner agency. **A correct answer can still be bad teaching.** Left untouched, the model's default helpfulness will rush to solve. This is our "deliberately-stuck fake student" test, formalised.
- **CodeAid** (CHI '24) — strongest academic reference; an LLM programming assistant actually deployed in a classroom with real data.
- **Code.org AI Tutor** — the production example. Socratic questioning, tuned per-task for the right scaffolding level. Notably, in Web Lab it *can* generate code directly when that best supports the learning goal — **even they don't withhold absolutely.**
- **Claude Learning Mode** — pauses mid-task and inserts `#TODO` comments prompting the student to write 5–10 lines themselves. Worth stealing.

**Honest read on efficacy — this is not automatically good.** A European K-12 trial found richer dialogue but *no measurable test-score improvement*, with many students finding the AI "less helpful." University-level studies found real gains in self-reflection and critical thinking. And effects vary by capability: **low-performing students can be harmed by interactions that benefit high-performers.** Walkthrough works *if designed well and aimed at the right learners* — our university-student target is the population where it tends to work.

**Context intake.** The student states level + topic up front ("I'm learning C, this is about stacks"). Sets teaching level AND tells the agent which concepts to surface. Same "context up front" pattern as the style profile.

**Syllabus-RAG as a knowledge FENCE (this is RAG's real job here).** The student uploads lecture notes / textbook chapters; embed them. Retrieval does double duty:
1. **Grounding** — explain in the course's own terminology and notation, not the internet's average.
2. **Fencing** — do NOT introduce concepts absent from the covered material. A student four weeks in hasn't learned recursion; an AI that reaches for it writes code "from the future," which is *the single greatest tell of AI in an assignment*. Real learning is bounded by the syllabus; unfenced AI is not. That gap is the tell RAG closes.

Fence prompt rules:
- Teach ONLY within the provided material's boundary; match its framing.
- If the proper solution needs a concept NOT in the material, do NOT introduce it — a correct-but-out-of-syllabus technique is a wrong answer here.
- The honest exit: if the student is truly blocked and the only path needs off-syllabus material, name it and point to the instructor ("this usually uses recursion, which isn't in your notes yet — check with your instructor") rather than quietly teaching future material.

**Honest cautions.**
- *Ingestion is the hard 60%.* "Drop your textbook" = parsing messy PDFs, slide images, handwritten notes (PyMuPDF + vision doc-reading already in the stack). Corpus quality caps feature quality.
- *Fencing is soft, not hard.* RAG biases toward the corpus; it doesn't lock the model out of its training knowledge. It reduces the "from the future" tell; it doesn't eliminate it. Don't oversell "the AI only knows what you know."

**Open strategic question (don't answer yet).** Is Walkthrough a feature *inside* CodeRace, or is it the actual product with CodeRace's race demoted to a "check your work" feature inside *it*? A learning platform and a code-verification tool are different businesses. Flag: don't let Walkthrough quietly become the main thing while v0 is still unbuilt. If Walkthrough is the destination, the success metric shifts from "winner accepted" to "did the student improve."
