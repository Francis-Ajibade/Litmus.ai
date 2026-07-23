# CodeRace sandbox image — the sealed environment untrusted code runs inside.
#
# Built ONCE, reused for every test run. Nothing is installed at run time,
# because at run time the container has no network (runner.py sets
# network_mode="none"). So every tool the sandbox needs must be baked in HERE.

FROM python:3.12-slim

# pytest runs the suite; pytest-json-report turns the result into structured
# JSON — a contract we can parse — instead of scrape-able terminal text.
# Versions are pinned so a test verdict is reproducible. --no-cache-dir keeps
# the image small (we never pip-install again after build).
RUN pip install --no-cache-dir \
        pytest==8.3.4 \
        pytest-json-report==1.5.0

# Where the solution + tests get mounted (read-only) at run time.
WORKDIR /app

# Drop root. If untrusted code escapes the Python process, it lands as an
# unprivileged user, not root — a much smaller blast radius. `nobody` is
# uid/gid 65534 and already exists in the base image.
USER nobody
