"""CodeRace persistence — the data layer behind the race.

Framework-agnostic on purpose: nothing here imports FastAPI, the frontend, or
the agent/sandbox code. It's a plain repository over Postgres that the
orchestration layer (the CLI today, an API later) calls to record a race and to
replay one. The seam is these functions; the storage behind them can change
without touching the race.

A race NEVER depends on the DB: persistence is a side effect recorded after the
sandbox has spoken, never a step the verdict waits on.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

# Default points at the local dev container (see README / brick 5 commit). A real
# deployment overrides it via the environment; we never hardcode prod creds.
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://coderace:coderace@localhost:5432/coderace"
)

_SCHEMA = Path(__file__).with_name("schema.sql")


def connect() -> psycopg.Connection:
    """One connection, returning dict rows so callers read columns by name."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db() -> None:
    """Create the tables if they don't exist. Idempotent — safe every startup."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(_SCHEMA.read_text())
        conn.commit()


# --------------------------------------------------------------------------
# Writes
# --------------------------------------------------------------------------

def create_session(title: str, user_id: str = "local") -> str:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (title, user_id) VALUES (%s, %s) RETURNING session_id",
            (title, user_id),
        )
        conn.commit()
        return str(cur.fetchone()["session_id"])


def add_message(
    session_id: str,
    user_prompt: str,
    user_specifications: str,
    approved_blueprint: dict[str, Any],
    generated_tests: str,
) -> str:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO messages
                 (session_id, user_prompt, user_specifications, approved_blueprint, generated_tests)
               VALUES (%s, %s, %s, %s, %s) RETURNING message_id""",
            (session_id, user_prompt, user_specifications, Jsonb(approved_blueprint), generated_tests),
        )
        conn.commit()
        return str(cur.fetchone()["message_id"])


def record_run(
    message_id: str,
    model_name: str,
    generated_code: str,
    test_results: dict[str, Any] | list[Any],
    accuracy: float | None,
    execution_time_ms: float | None,
    edge_cases_passed: int | None,
    is_winner: bool,
    lint_violations: dict[str, Any] | list[Any] | None = None,
) -> str:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO model_runs
                 (message_id, model_name, generated_code, test_results, accuracy,
                  execution_time_ms, edge_cases_passed, lint_violations, is_winner)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING run_id""",
            (
                message_id, model_name, generated_code,
                Jsonb(test_results), accuracy, execution_time_ms, edge_cases_passed,
                Jsonb(lint_violations) if lint_violations is not None else None,
                is_winner,
            ),
        )
        conn.commit()
        return str(cur.fetchone()["run_id"])


# --------------------------------------------------------------------------
# Reads (session replay + sidebar)
# --------------------------------------------------------------------------

def list_sessions(limit: int = 20) -> list[dict[str, Any]]:
    """The sidebar: recent sessions, newest first."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT session_id, title, created_at FROM sessions ORDER BY created_at DESC LIMIT %s",
            (limit,),
        )
        return cur.fetchall()


def load_session(session_id: str) -> dict[str, Any] | None:
    """Everything needed to replay a session: each turn, its locked blueprint and
    test suite, and every model run (the historical leaderboard) under it."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM sessions WHERE session_id = %s", (session_id,))
        session = cur.fetchone()
        if session is None:
            return None

        cur.execute(
            "SELECT * FROM messages WHERE session_id = %s ORDER BY created_at",
            (session_id,),
        )
        messages = cur.fetchall()

        for msg in messages:
            cur.execute(
                """SELECT * FROM model_runs WHERE message_id = %s
                   ORDER BY is_winner DESC, accuracy DESC NULLS LAST, execution_time_ms ASC""",
                (msg["message_id"],),
            )
            msg["runs"] = cur.fetchall()

        session["messages"] = messages
        return session
