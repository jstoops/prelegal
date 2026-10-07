#!/usr/bin/env sh
# Build the Prelegal image and (re)start it at http://localhost:8000.
# Each start is a new container, so the database starts empty.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME=prelegal

docker build -t "$NAME" "$ROOT"
docker rm -f "$NAME" >/dev/null 2>&1 || true  # replace any previous run

# Pass secrets such as OPENROUTER_API_KEY from the repo's .env, if present.
if [ -f "$ROOT/.env" ]; then
  set -- --env-file "$ROOT/.env"
else
  set --
fi
docker run -d --name "$NAME" -p 8000:8000 "$@" "$NAME" >/dev/null

printf 'Waiting for Prelegal to start'
for _ in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ]; then
    echo
    echo "Prelegal is running at http://localhost:8000"
    exit 0
  fi
  printf '.'
  sleep 1
done
echo
echo "Prelegal did not become healthy. Logs:" >&2
docker logs "$NAME" >&2
exit 1
