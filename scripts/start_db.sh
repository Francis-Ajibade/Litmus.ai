#!/usr/bin/env bash
# Start the local CodeRace Postgres (Brick 5). Idempotent: reuses the container
# if it already exists. The app reads DATABASE_URL, defaulting to this instance.
set -euo pipefail

NAME=coderace-pg

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
    docker start "$NAME" >/dev/null
    echo "started existing container: $NAME"
else
    docker run -d --name "$NAME" \
        -e POSTGRES_USER=codenow race \
        -e POSTGRES_PASSWORD=coderace \
        -e POSTGRES_DB=coderace \
        -p 5432:5432 postgres:16 >/dev/null
    echo "created container: $NAME"
fi

# Wait until it accepts connections before returning.
for _ in $(seq 1 30); do
    if docker exec "$NAME" pg_isready -U coderace >/dev/null 2>&1; then
        echo "postgres ready on localhost:5432 (db=coderace)"
        exit 0
    fi
    sleep 1
done
echo "postgres did not become ready in time" >&2
exit 1
