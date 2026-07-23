"""Run untrusted Python against a pytest suite in a throwaway, locked-down
Docker container, and return a structured verdict.

This is the one genuinely new skill in CodeRace: safely executing code we did
not write, and getting a result we can trust. Everything here is deliberately
explicit — the security posture IS the product.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass, field
from typing import Any

import docker
from requests.exceptions import ConnectionError as ReqConnectionError
from requests.exceptions import ReadTimeout

# The pre-built image from sandbox/Dockerfile. Built once; never pip-installs at
# run time (it can't — the container has no network).
DEFAULT_IMAGE = "coderace-sandbox:latest"

# Where pytest writes its JSON report INSIDE the container. It lives on the
# tmpfs scratch mount (in-memory, disposable) because the root filesystem is
# read-only. tmpfs is destroyed the instant the container stops, so we can't
# fish the file out afterward — instead the container `cat`s it to stdout as its
# last act, and Docker's logs preserve that output until we remove the box.
REPORT_PATH = "/tmp/report.json"


@dataclass
class SandboxResult:
    """The structured verdict — a contract, not a screen-scrape. This maps
    cleanly onto the future `model_runs.test_results` column."""

    ok: bool                 # did the suite run to completion at all?
    timed_out: bool          # did we have to kill it on the wall clock?
    exit_code: int | None    # pytest exit code (0 = all passed, 1 = failures)
    passed: int
    failed: int
    errors: int
    total: int
    duration_ms: float
    tests: list[dict[str, Any]] = field(default_factory=list)
    captured_stdout: str = ""   # what the code under test printed to stdout (the "Console")
    captured_stderr: str = ""   # what the code under test printed to stderr
    log: str = ""               # pytest's own human output (for debugging timeouts / OOM)

    @property
    def all_passed(self) -> bool:
        return (
            self.ok
            and not self.timed_out
            and self.total > 0
            and self.failed == 0
            and self.errors == 0
        )


def run_in_sandbox(
    solution_code: str,
    test_code: str,
    *,
    image: str = DEFAULT_IMAGE,
    timeout_seconds: int = 10,
    mem_limit: str = "256m",
    cpu_count: float = 1.0,
    client: docker.DockerClient | None = None,
) -> SandboxResult:
    """Execute `test_code` against `solution_code` in an isolated container.

    Both inputs are plain strings. We write them to a host temp dir, mount it
    read-only into a fresh container, run pytest, read the JSON verdict off
    stdout, and destroy the container — no matter what the code inside tried.
    """
    client = client or docker.from_env()

    # A private host dir holding exactly two files. We make it world-readable
    # (dir 0755 / files 0644) on purpose: the container runs as `nobody`
    # (uid 65534), a different uid than the host user, and must be able to read
    # a mount owned by someone else. The code isn't secret, so this is safe.
    with tempfile.TemporaryDirectory(prefix="coderace-") as workdir:
        _write_file(os.path.join(workdir, "solution.py"), solution_code)
        _write_file(os.path.join(workdir, "test_solution.py"), test_code)
        os.chmod(workdir, 0o755)

        container = client.containers.create(
            image,
            # Run pytest with its human output sent to STDERR (1>&2), then dump
            # the JSON report to STDOUT. Result: container stdout is pure JSON,
            # container stderr is the human log. If pytest is killed before
            # writing the report, `cat` finds nothing -> empty stdout -> we
            # report "did not complete" instead of guessing.
            command=[
                "sh", "-c",
                "python -m pytest /app -q -p no:cacheprovider "
                f"--json-report --json-report-file={REPORT_PATH} 1>&2; "
                f"cat {REPORT_PATH} 2>/dev/null || true",
            ],
            working_dir="/app",

            # ---- The mandatory security posture. Each flag blocks one attack. ----
            network_mode="none",                        # no exfiltration, no callbacks, no payload download
            mem_limit=mem_limit,                        # a memory bomb can't take the host down...
            memswap_limit=mem_limit,                    # ...and can't cheat via swap (swap == mem => none)
            nano_cpus=int(cpu_count * 1_000_000_000),   # cap CPU so a busy loop can't peg every core
            pids_limit=128,                             # cap processes so a fork bomb can't spawn forever
            read_only=True,                             # immutable root fs; code can't rewrite its runtime
            tmpfs={"/tmp": "rw,size=64m,mode=1777"},    # the only writable space: in-memory, vanishes with the box
            cap_drop=["ALL"],                           # strip every Linux capability
            security_opt=["no-new-privileges"],         # can't escalate via setuid binaries
            user="nobody",                              # unprivileged; small blast radius on breakout
            environment={"PYTHONDONTWRITEBYTECODE": "1"},  # config, NOT secrets — no keys ever mounted here
            volumes={workdir: {"bind": "/app", "mode": "ro"}},  # code goes in read-only
        )

        timed_out = False
        exit_code: int | None = None
        try:
            container.start()
            try:
                # The wall-clock kill switch is enforced from OUTSIDE the
                # container — we never trust untrusted code to time itself out.
                # If wait() exceeds the deadline, we kill the box ourselves.
                result = container.wait(timeout=timeout_seconds)
                exit_code = result.get("StatusCode")
            except (ReadTimeout, ReqConnectionError):
                timed_out = True
                container.kill()

            # container stdout = the JSON report (or empty); container stderr =
            # pytest's own human log. The code-under-test's own prints are NOT
            # here — pytest captures those and tucks them inside the report.
            report_json = container.logs(stdout=True, stderr=False).decode("utf-8", "replace")
            log = container.logs(stdout=False, stderr=True).decode("utf-8", "replace")
            report = _parse_report(report_json)
        finally:
            # Incinerate the container no matter what happened above.
            container.remove(force=True)

    return _build_result(report, timed_out, exit_code, log)


def _write_file(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o644)  # world-readable so the `nobody` user can read it


def _parse_report(stdout: str) -> dict[str, Any] | None:
    """Parse the JSON report the container `cat`ed to stdout. Returns None when
    stdout carries no valid report — exactly what we want when pytest was killed
    on timeout or died before writing anything."""
    text = stdout.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _build_result(
    report: dict[str, Any] | None,
    timed_out: bool,
    exit_code: int | None,
    log: str,
) -> SandboxResult:
    if report is None:
        # No structured report => the run did not complete cleanly (timeout /
        # OOM-kill / crash before writing). Report that honestly.
        return SandboxResult(
            ok=False, timed_out=timed_out, exit_code=exit_code,
            passed=0, failed=0, errors=0, total=0, duration_ms=0.0,
            tests=[], log=log,
        )

    summary = report.get("summary", {})
    tests = [_build_test(t) for t in report.get("tests", [])]

    # The "Console": everything the code under test printed, in test order.
    captured_stdout = "".join(t["stdout"] for t in tests)
    captured_stderr = "".join(t["stderr"] for t in tests)

    return SandboxResult(
        ok=True,
        timed_out=timed_out,
        exit_code=exit_code,
        passed=summary.get("passed", 0),
        failed=summary.get("failed", 0),
        errors=summary.get("error", 0),
        total=summary.get("total", 0),
        duration_ms=round(report.get("duration", 0.0) * 1000, 1),
        tests=tests,
        captured_stdout=captured_stdout,
        captured_stderr=captured_stderr,
        log=log,
    )


def _build_test(t: dict[str, Any]) -> dict[str, Any]:
    """Flatten one pytest-json-report test object. Captured output lives on each
    stage (setup/call/teardown), so we concatenate across stages to lose
    nothing. The failure message, when present, sits on whichever stage failed."""
    outcome = t.get("outcome", "unknown")
    stages = [t.get("setup") or {}, t.get("call") or {}, t.get("teardown") or {}]
    stdout = "".join(s.get("stdout", "") for s in stages)
    stderr = "".join(s.get("stderr", "") for s in stages)
    message = ""
    if outcome != "passed":
        for s in stages:
            if s.get("longrepr"):
                message = s["longrepr"]
                break
    call = t.get("call") or {}
    return {
        "name": t.get("nodeid", ""),
        "outcome": outcome,
        "duration_ms": round(call.get("duration", 0.0) * 1000, 1),
        "stdout": stdout,
        "stderr": stderr,
        "message": message,
    }
