"""Framework-agnostic execution sandbox.

No FastAPI, no frontend, no LLM imports live here — this package is a pure
function from (solution_code, test_code) to a structured result. That keeps the
sandbox provider (Docker today, E2B/Modal later) swappable without touching
anything downstream.
"""

from sandbox.runner import SandboxResult, run_in_sandbox

__all__ = ["run_in_sandbox", "SandboxResult"]
