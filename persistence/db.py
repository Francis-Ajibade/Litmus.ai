
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from dotenv import load_dotenv
from psycopg.errors import UniqueViolation

load_dotenv(override=True)

_SCHEMA = Path(__file__).with_name("schema.sql")

def connect() -> psycopg.Connection:
    """One connection, returning dict rows so callers read columns by name."""
    # Read at call time, not import time. A module-level check makes importing this
    # package require a configured database, so nothing here can be imported for a
    # test or a type check without one.
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set — the database cannot be reached.")
    return psycopg.connect(url, row_factory=dict_row, prepare_threshold=None)

def init_db() -> None:
    """Create the tables if they don't exist. Idempotent — safe every startup."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(_SCHEMA.read_text())
        conn.commit()

def create_session(session_id: str, user_id: str, problem: str, title: str, course_id: str | None = None) -> None:
    """Write the session row. The id is supplied, not generated.

    gen_random_uuid() is only the column DEFAULT — naming session_id in the insert
    overrides it. The caller mints the id on the first message so the in-memory
    store has a key immediately, and this row is written later, once the problem
    is known to be real. Nothing to return: the caller already has the id.
    """
    query = """
    INSERT INTO session (session_id, user_id, problem, title, course_id)
    VALUES (%s, %s, %s, %s, %s)
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (session_id, user_id, problem, title, course_id))

def create_style(
    user_id: str,
    title: str,
    description: str,
    sample_code: str,
    created_in_run: str | None = None,
) -> tuple[bool, dict]:
    """Save a style. Returns (created, payload) — payload always carries a style_id.

    Both outcomes hand back an id, so the caller has one thing to store whichever
    way this went: the new row's id when it saved, the EXISTING row's id when the
    title was taken. That second id is what makes the "update it?" prompt possible
    — it is the row update_style will overwrite if the user says yes.

    The id comes from Postgres, not from the caller. A style has no reason to be
    named before it exists (unlike a session, whose id keys the in-memory store
    from the first message), and RETURNING hands it back for free.
    """
    insert = """
    INSERT INTO style (user_id, title, description, sample_code, created_in_run)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING style_id
    """

    # Only reached on a conflict. It cannot run on the connection that raised:
    # Postgres aborts the whole transaction on error, so every later statement
    # there fails until a rollback. Exiting the `with` above closes that one, and
    # this opens a fresh one.
    existing = """
    SELECT style_id FROM style WHERE user_id = %s AND title = %s
    """

    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(insert, (user_id, title, description, sample_code, created_in_run))

            style_id = str(cur.fetchone()["style_id"])
            return True, {"style_id": style_id, "message": "Style created"}

    except UniqueViolation as e:
        if e.diag.constraint_name != "idx_style_user_title":
            raise

        with connect() as conn, conn.cursor() as cur:
            cur.execute(existing, (user_id, title))
            row = cur.fetchone()

        # The row was deleted between the insert and this lookup — a real race, and
        # one we cannot answer with a style_id. Let the original error surface.
        if row is None:
            raise

        return False, {
            "style_id": str(row["style_id"]),
            "error": "You already have a style with this title.",
        }


def update_style(
    style_id: str,
    user_id: str,
    description: str,
    sample_code: str,
) -> bool:
    """Overwrite a saved style in place. True if a row was actually updated.

    user_id is in the WHERE clause, not trusted from the caller — the same
    ownership check /api/chat does before handing back a session. A style_id
    guessed or replayed by someone else matches nothing rather than editing a
    stranger's library.

    title is deliberately not updatable here: it is what identified this row in
    the first place, and renaming a style is a different operation with its own
    collision question.

    created_at and created_in_run are left alone. They record where the style was
    born, and that stays true no matter how often it is revised.
    """
    query = """
    UPDATE style
    SET description = %s,
        sample_code = %s,
        updated_at = NOW()
    WHERE style_id = %s AND user_id = %s
    RETURNING style_id
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (description, sample_code, style_id, user_id))
        return cur.fetchone() is not None


def save_session_state(session_id: str, state: dict) -> None:
    # Matches nothing until create_session has written the row. That no-op IS the
    # guard — a clarification exchange has no session to save against yet.
    query = """
    UPDATE session
    SET state = %s,
        updated_at = NOW()
    WHERE session_id = %s
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (Jsonb(state), session_id))


def load_session_state(session_id: str) -> dict | None:
    # None for both "no such session" and "row saved no state yet".
    query = """
    SELECT state FROM session WHERE session_id = %s
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (session_id,))
        row = cur.fetchone()

    return row["state"] if row else None


def list_styles(user_id: str) -> list[dict]:
    # No sample_code — that only comes back when one style is opened.
    # user_id in the WHERE is the access control; RLS never applies here.
    query = """
    SELECT style_id, title, description, updated_at
    FROM style
    WHERE user_id = %s
    ORDER BY updated_at DESC
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (user_id,))
        # str() because every style_id downstream is a str, not a uuid.UUID.
        return [{**r, "style_id": str(r["style_id"])} for r in cur.fetchall()]


def get_style(style_id: str, user_id: str) -> dict | None:
    """One saved style, or None. user_id is in the WHERE, not checked after —
    a guessed style_id must match nothing rather than read a stranger's row."""
    query = """
    SELECT style_id, title, description, sample_code, updated_at
    FROM style
    WHERE style_id = %s AND user_id = %s
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (style_id, user_id))
        row = cur.fetchone()

    if row is None:
        return None
    return {**row, "style_id": str(row["style_id"])}


def create_run(
    session_id: str,
    mode: str,
    *,
    blueprint: dict | None = None,
    tests_used: str | None = None,
    style_used: str | None = None,
    transcript: list | dict | None = None,
    attempts: list | dict | None = None,
    student_code: str | None = None,
    final_code: str | None = None,
    mistakes: list | dict | None = None,
    outcome: str | None = None,
    tests_passed: int | None = None,
    tests_total: int | None = None,
) -> str:
    """Record a finished run and move its session to the top of the sidebar.

    Keyword-only after session_id/mode: thirteen positional arguments is where
    "passed student_code into final_code" bugs live.
    """
    insert = """
        INSERT INTO run (
            session_id, mode, blueprint, tests_used, style_used,
            transcript, attempts, student_code, final_code, mistakes,
            outcome, tests_passed, tests_total
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING run_id
    """

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            insert,
            (
                session_id,
                mode,
                Jsonb(blueprint) if blueprint is not None else None,
                tests_used,
                style_used,
                Jsonb(transcript) if transcript is not None else None,
                Jsonb(attempts) if attempts is not None else None,
                student_code,
                final_code,
                Jsonb(mistakes) if mistakes is not None else None,
                outcome,
                tests_passed,
                tests_total,
            ),
        )
        run_id = str(cur.fetchone()["run_id"])

        cur.execute(
            "UPDATE session SET updated_at = NOW() WHERE session_id = %s",
            (session_id,),
        )
        return run_id

def list_sessions(user_id, limit)-> list[str] :
    """The sidebar: this user's sessions, most recently touched first.

    Ordered by updated_at, not created_at — a session worked on today belongs at
    the top even if it was started last week. This is the query idx_session_user
    exists for.
    """
    query = """
        SELECT session_id, title
        FROM session
        WHERE user_id = %s
        ORDER BY updated_at DESC
        LIMIT %s
    """
    with connect() as conn, conn.cursor() as cur:
        cur.execute(query, (user_id, limit))
        return cur.fetchall()

def count_sessions(user_id:str) -> int :
    query = """SELECT COUNT(*) FROM session WHERE user_id = %s"""

    with connect() as conn, conn.cursor() as cur:
        cur.execute(query,(user_id,))
        session_count = cur.fetchone()['count']

    return session_count