"""Build-order step 1: calibrate the sandbox against KNOWN inputs.

No AI. Both the solution and the tests are hardcoded here, so the sandbox is
the ONLY moving part. If the verdict isn't what we already know it should be,
the bug is in the sandbox — nowhere else.

Usage:
    uv run python scripts/run_step1.py                  # calibration (expect 3/3 green)
    uv run python scripts/run_step1.py --break loop     # infinite loop  -> must TIME OUT
    uv run python scripts/run_step1.py --break memory   # memory bomb    -> must be KILLED
    uv run python scripts/run_step1.py --break network  # network call   -> must be BLOCKED
    uv run python scripts/run_step1.py --break fail      # a real failing test -> clean 1-fail verdict
"""

import os
import sys

# Make the repo root importable so `sandbox` resolves regardless of cwd.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sandbox import run_in_sandbox

# ---- The known-good pair -----------------------------------------------------
GOOD_SOLUTION = '''\
def add(a, b):
    print(f"add({a}, {b}) -> {a + b}")   # code prints; we should SEE this
    return a + b


def is_even(n):
    return n % 2 == 0
'''

GOOD_TESTS = '''\
from solution import add, is_even


def test_add_positive():
    assert add(2, 3) == 5


def test_add_negative():
    assert add(-1, -1) == -2


def test_is_even():
    assert is_even(4) is True
    assert is_even(7) is False
'''

# ---- Hostile inputs for the deliberate-break step ---------------------------
BREAK_CASES = {
    # Infinite loop: the container never exits on its own. The host-side
    # wall-clock timeout must kill it. Expect: timed_out=True.
    "loop": (
        "def add(a, b):\n    return a + b\n",
        "from solution import add\n\ndef test_hang():\n    while True:\n        pass\n",
    ),
    # Memory bomb: allocate far past mem_limit. Expect: killed, no clean report.
    "memory": (
        "def add(a, b):\n    return a + b\n",
        "from solution import add\n\ndef test_bomb():\n    x = [0] * (10 ** 10)\n    assert x\n",
    ),
    # Network call: with network_mode='none' this must fail to connect.
    # Expect: the test errors out (no network), proving isolation.
    "network": (
        "def add(a, b):\n    return a + b\n",
        (
            "import urllib.request\n"
            "from solution import add\n\n"
            "def test_exfiltrate():\n"
            "    urllib.request.urlopen('http://example.com', timeout=5)\n"
        ),
    ),
    # A genuinely failing assertion: proves we get a clean 'failed' verdict in
    # structured JSON, not a runner crash.
    "fail": (
        "def add(a, b):\n    return a - b  # deliberately wrong\n",
        "from solution import add\n\ndef test_add():\n    assert add(2, 3) == 5\n",
    ),
}


def show(result) -> None:
    print("\n=== SandboxResult ===")
    print(f"  ok={result.ok}  timed_out={result.timed_out}  exit_code={result.exit_code}")
    print(
        f"  passed={result.passed} failed={result.failed} "
        f"errors={result.errors} total={result.total}  ({result.duration_ms} ms)"
    )
    print("  tests:")
    for t in result.tests:
        print(f"    [{t['outcome']:>7}] {t['name']}  ({t['duration_ms']} ms)")
        for line in t["stdout"].rstrip().splitlines():
            print(f"          out| {line}")
        for line in t["stderr"].rstrip().splitlines():
            print(f"          err| {line}")
        if t["message"]:
            # pytest puts the actual assertion error on lines starting with "E".
            lines = t["message"].strip().splitlines()
            err = next((ln for ln in lines if ln.lstrip().startswith("E ")), lines[-1])
            print(f"          FAIL: {err.strip()}")
    if result.captured_stdout.strip():
        print("  --- captured stdout (the Console) ---")
        for line in result.captured_stdout.rstrip().splitlines():
            print(f"    {line}")
    print(f"  all_passed: {result.all_passed}")
    print("=====================\n")


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "--break":
        name = sys.argv[2]
        if name not in BREAK_CASES:
            sys.exit(f"unknown break case {name!r}; choose from {list(BREAK_CASES)}")
        sol, tests = BREAK_CASES[name]
        print(f"Running BREAK case: {name} (a guard must fire) ...")
        # A hostile case must never hang the harness longer than a few seconds —
        # that's exactly what we're testing.
        result = run_in_sandbox(sol, tests, timeout_seconds=5)
        show(result)
        return

    print("Running CALIBRATION case (expect 3/3 passed) ...")
    result = run_in_sandbox(GOOD_SOLUTION, GOOD_TESTS)
    show(result)
    if not result.all_passed or result.total != 3:
        sys.exit("CALIBRATION FAILED — the instrument is not reading correctly.")
    print("Calibration OK: sandbox reads a known-good pair correctly.")


if __name__ == "__main__":
    main()
