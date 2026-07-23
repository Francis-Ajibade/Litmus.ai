-- CodeRace persistence — the three tables from PRD §8.
--
-- Idempotent (IF NOT EXISTS) so init_db() is safe to call every startup.
-- gen_random_uuid() is built into Postgres 13+; no pgcrypto extension needed.

-- One problem thread = one sidebar entry.
CREATE TABLE IF NOT EXISTS sessions (
    session_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- No users table in v0 (single-user, local, no auth), so this is a plain
    -- label, not a real FK. It becomes an FK when accounts land.
    user_id     TEXT NOT NULL DEFAULT 'local',
    title       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per user turn within a session. approved_blueprint is the LOCKED
-- Phase 2 reasoning — the single source of truth the race was run against.
CREATE TABLE IF NOT EXISTS messages (
    message_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    user_prompt         TEXT NOT NULL,
    user_specifications TEXT,
    approved_blueprint  JSONB NOT NULL,
    generated_tests     TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The leaderboard rows: one per model per turn. test_results is the structured
-- verdict straight from the sandbox (never regex-parsed text).
CREATE TABLE IF NOT EXISTS model_runs (
    run_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    model_name        TEXT NOT NULL,
    generated_code    TEXT NOT NULL,
    test_results      JSONB NOT NULL,
    accuracy          REAL,           -- passed / total, in [0, 1]
    execution_time_ms REAL,
    -- Placeholder in v0: we don't yet tag which cases are "edge" vs core, so
    -- this mirrors passed-count for now. Real edge-case tagging is later.
    edge_cases_passed INTEGER,
    -- Placeholder in v0: no linter in the loop yet (that's FR-7). NULL until then.
    lint_violations   JSONB,
    is_winner         BOOLEAN NOT NULL DEFAULT FALSE
);

-- Replay and the sidebar both read newest-first; index the common sorts.
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_model_runs_message ON model_runs(message_id);

-- Pre-launch waitlist. Deliberately standalone — it is NOT tied to sessions or
-- users; it's just captured interest before the product exists.
CREATE TABLE IF NOT EXISTS waitlist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stored already-normalized (trimmed + lowercased) by the app layer, so
    -- "Me@X.com " and "me@x.com" collapse to one signup. UNIQUE is the backstop:
    -- even if two requests race, the DB refuses the second identical email.
    email       TEXT UNIQUE NOT NULL,
    -- Where the signup came from (attribution later, if we run more than one page).
    source      TEXT NOT NULL DEFAULT 'waitlist-landing',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
