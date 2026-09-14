"""Working state for conversations in progress.

Memory in front, the session row behind it. The dict keeps a turn fast and keeps
a clarification exchange alive before it has earned a database row; the row is
what survives a restart or a redeploy.

Nothing outside this file touches _states or the state column: change where a
conversation lives and only these three functions move.
"""

from main.new_code import RunState
from persistence import load_session_state, save_session_state

_states: dict[str, RunState] = {}


def get_state(session_id: str) -> RunState | None:
    """The conversation for this id, or None if nothing anywhere has it."""
    state = _states.get(session_id)
    if state is not None:
        return state

    # Missed in this process — a restart, or a worker that never saw this one.
    raw = load_session_state(session_id)
    if raw is None:
        return None

    state = RunState.model_validate(raw)
    _states[session_id] = state
    return state


def save_state(state: RunState) -> None:
    """Store the state under its own session_id.

    Takes the whole object rather than an (id, state) pair — the state already
    carries its id, and passing both is a way for them to disagree.
    """
    if state.session_id is None:
        raise ValueError("Cannot store a RunState with no session_id.")

    _states[state.session_id] = state
    # mode="json" — the blob goes to Postgres, not back into Python.
    save_session_state(state.session_id, state.model_dump(mode="json"))


def drop_state(session_id: str) -> None:
    """Forget this process's copy. The row is left alone."""
    _states.pop(session_id, None)
