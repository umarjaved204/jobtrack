#!/usr/bin/env bash
# Smoke test of the built images (the CI `docker` job; also runs locally).
#
#   docker build -t jobtrack-backend:smoke backend
#   docker build --target prod -t jobtrack-frontend:smoke frontend
#   bash .github/scripts/docker-smoke.sh
#
# Needs Postgres on the host's port 5432 (CI's service container, or `docker compose up -d
# db`). The backend container reaches it through host.docker.internal, mapped to the host
# on Linux too. Its CMD runs `alembic upgrade head` before serving, so /health/ready
# answering means the image migrates and connects. Ports 18000/18080 keep clear of the
# dev stack.
set -euo pipefail

DB_URL=${SMOKE_DATABASE_URL:-postgresql+psycopg://jobtrack:jobtrack@host.docker.internal:5432/jobtrack}
API=http://localhost:18000
WEB=http://localhost:18080
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

cleanup() { docker rm -f jobtrack-smoke-api jobtrack-smoke-web >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  echo "--- backend logs" >&2
  docker logs jobtrack-smoke-api 2>&1 | tail -30 >&2 || true
  exit 1
}

# Status code and headers of a GET (curl -I would be a HEAD).
fetch() { curl -s -o /dev/null -D - "$1"; }
status_of() { curl -s -o /dev/null -w '%{http_code}' "$1"; }

docker run -d --name jobtrack-smoke-api -p 18000:8000 \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL="$DB_URL" jobtrack-backend:smoke >/dev/null
docker run -d --name jobtrack-smoke-web -p 18080:80 jobtrack-frontend:smoke >/dev/null

echo "Waiting for the API (migrations, then /health/ready)..."
for _ in $(seq 1 45); do
  [ "$(status_of "$API/api/v1/health/ready")" = 200 ] && break
  sleep 2
done
[ "$(status_of "$API/api/v1/health/ready")" = 200 ] || fail "API not ready after 90 s"
echo "ok   backend: migrated and ready"

headers=$(fetch "$WEB/")
grep -q '^HTTP/[0-9.]* 200' <<<"$headers" || fail "frontend / is not 200"
grep -qi '^cross-origin-opener-policy: same-origin' <<<"$headers" || fail "no COOP header"
grep -qi '^cross-origin-embedder-policy: require-corp' <<<"$headers" || fail "no COEP header"
echo "ok   frontend: / is 200 with COOP same-origin and COEP require-corp"

[ "$(status_of "$WEB/applications/board")" = 200 ] || fail "SPA fallback: a client route is not 200"
echo "ok   frontend: client routes fall back to index.html"

# Relative to the repo root: Node on Windows can't resolve Git Bash's /c/... paths.
model_dir=$(cd "$ROOT" && node -p "const m = require('./frontend/scripts/model-manifest.json'); 'models/' + m.id + '/' + m.revision")
[ "$(status_of "$WEB/$model_dir/config.json")" = 200 ] || fail "model files are not in the image ($model_dir)"
[ "$(status_of "$WEB/$model_dir/no-such-file.json")" = 404 ] || fail "a missing model file is not a 404"
echo "ok   frontend: model served from the image; a missing model file is a 404"

echo "Images pass the smoke test."
