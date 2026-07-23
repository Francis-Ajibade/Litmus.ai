"""Waitlist repository — capture pre-launch email signups.

Framework-agnostic, exactly like db.py: NO FastAPI imports here. The API layer
(api/app.py) will call add_to_waitlist(); this module only ever talks to Postgres.
That separation is the whole point — the storage rules live here, the HTTP rules
live there, and neither knows about the other.
"""

from __future__ import annotations

from persistence.db import connect


def add_to_waitlist(email: str, source: str = "waitlist-landing") -> bool:

    """Insert one email into the waitlist, idempotently.

    The caller (the API layer) has already checked that `email` is a
    syntactically valid address. THIS function owns the *storage* edge cases:

      1. Normalize before storing. Strip surrounding whitespace and lowercase the
         address, so "Me@X.com " and "me@x.com" become the SAME row, not two.

      2. Insert without blowing up on a repeat. A second signup with the same
         email must NOT raise, and must NOT create a duplicate. Use Postgres'
         native idempotent insert rather than a "check then insert":

             INSERT INTO waitlist (email, source) VALUES (%s, %s)
             ON CONFLICT (email) DO NOTHING

         Why ON CONFLICT instead of catching a UniqueViolation? It's atomic —
         there's no gap between "does it exist?" and the insert where a second
         request could sneak in — and it keeps the happy path exception-free.

    Returns
    -------
    bool
        True  if this call inserted a brand-new signup.
        False if the email was already on the list (the conflict skipped it).
        Hint: after the insert, `cur.rowcount` is 1 when a row went in and 0 when
        the ON CONFLICT skipped it — that's your True/False.

    Reminders (all demonstrated in db.py):
      - Parameterize: pass values as the 2nd arg to cur.execute, never f-string
        them into the SQL (that's how SQL injection happens).
      - `connect()` gives you a connection; use it as a context manager and take
        a cursor, e.g.  `with connect() as conn, conn.cursor() as cur:`
      - Commit before you return, or the row won't actually persist.
    """
    raw_email = email
    normalized_email = raw_email.strip().lower()

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
          """
          INSERT INTO waitlist (email, source) VALUES (%s, %s)
          ON CONFLICT (email) DO NOTHING
           """,
          (normalized_email, source)
        )
        conn.commit()
        return cur.rowcount > 0
