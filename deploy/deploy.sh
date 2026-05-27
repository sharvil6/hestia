#!/usr/bin/env bash
# Build step of the deploy. Runs as the `hestia` user (invoked via sudo from gh-runner).
# Does NOT restart services or sudo — keep blast radius small.
#   - pulls latest main
#   - syncs Python deps into the venv only if requirements.txt changed
#   - rebuilds the Next.js frontend only if frontend/, shared/, or package-lock.json changed
#   - restages the standalone runtime
#
# Restart + health check happen separately in the GitHub Actions workflow.

set -euo pipefail

REPO_DIR="/srv/hestia/repo"
RUNTIME_DIR="/srv/hestia/frontend-runtime"
VENV="$REPO_DIR/backend/.venv"

cd "$REPO_DIR"

prev_sha="$(git rev-parse HEAD)"

echo "==> Pulling latest main"
git fetch origin main
git reset --hard origin/main
new_sha="$(git rev-parse HEAD)"

changed_paths=""
if [[ "$prev_sha" != "$new_sha" ]]; then
  changed_paths="$(git diff --name-only "$prev_sha" "$new_sha")"
else
  echo "    (already at $new_sha — re-running steps idempotently)"
fi

backend_changed=true
frontend_changed=true
if [[ -n "$changed_paths" ]]; then
  backend_changed=false; frontend_changed=false
  grep -q '^backend/'            <<<"$changed_paths" && backend_changed=true  || true
  grep -q '^shared/'             <<<"$changed_paths" && frontend_changed=true || true
  grep -q '^frontend/'           <<<"$changed_paths" && frontend_changed=true || true
  grep -q '^package\.json$'      <<<"$changed_paths" && frontend_changed=true || true
  grep -q '^package-lock\.json$' <<<"$changed_paths" && frontend_changed=true || true
  grep -q '^deploy/'             <<<"$changed_paths" && { backend_changed=true; frontend_changed=true; } || true
fi

# -------- Backend --------
if $backend_changed || [[ ! -d "$VENV" ]]; then
  echo "==> Syncing backend Python deps"
  if [[ ! -d "$VENV" ]]; then
    python3 -m venv "$VENV"
  fi
  "$VENV/bin/pip" install --upgrade pip wheel
  "$VENV/bin/pip" install -r backend/requirements.txt
else
  echo "==> Backend unchanged, skipping pip install"
fi

# -------- Frontend --------
if $frontend_changed || [[ ! -d "$RUNTIME_DIR/frontend" ]]; then
  echo "==> Building frontend"
  npm ci
  # NEXT_PUBLIC_* must be set at build time (Next inlines them into the bundle).
  NEXT_PUBLIC_API_URL="https://api.hestia.sharvilpatel.dev" npm run build -w frontend

  echo "==> Staging standalone runtime at $RUNTIME_DIR"
  mkdir -p "$RUNTIME_DIR"
  rsync -a --delete frontend/.next/standalone/ "$RUNTIME_DIR/"
  mkdir -p "$RUNTIME_DIR/frontend/.next"
  rsync -a --delete frontend/.next/static/ "$RUNTIME_DIR/frontend/.next/static/"
  rsync -a --delete frontend/public/       "$RUNTIME_DIR/frontend/public/"
else
  echo "==> Frontend unchanged, skipping build"
fi

echo "==> Build complete: $new_sha"
