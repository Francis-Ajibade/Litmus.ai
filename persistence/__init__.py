"""CodeRace persistence layer (Postgres). Framework-agnostic repository."""

from persistence.db import (
    connect,
    init_db,
    create_session,
    create_style,
    update_style,
    create_run,
    list_sessions,
    list_styles,
    get_style,
    save_session_state,
    load_session_state,
)

__all__ = [
    "connect",
    "init_db",
    "create_session",
    "create_style",
    "update_style",
    "create_run",
    "list_sessions",
    "list_styles",
    "get_style",
    "save_session_state",
    "load_session_state",
]
