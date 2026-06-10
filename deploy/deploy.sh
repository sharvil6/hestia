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

# Guard against systemd unit drift. The CI/CD path deliberately can't install
# unit files (gh-runner has no sudo for /etc/systemd/system/), so any diff
# between deploy/*.service in the repo and what's installed on the VM means
# the next `systemctl restart` will re-read a stale unit and silently ignore
# your env-var / hardening changes. Fail loudly here so it's caught at deploy
# time, not while chasing a ghost in prod three hours later.
echo "==> Verifying systemd unit files are in sync"
unit_drift=false
for unit in hestia-backend.service hestia-frontend.service; do
  repo_file="$REPO_DIR/deploy/$unit"
  installed_file="/etc/systemd/system/$unit"
  if [[ ! -f "$installed_file" ]]; then
    echo "    !! /etc/systemd/system/$unit is missing on this host"
    unit_drift=true
    continue
  fi
  if ! cmp -s "$repo_file" "$installed_file"; then
    echo "    !! $unit differs from the installed copy:"
    diff -u "$installed_file" "$repo_file" || true
    unit_drift=true
  fi
done
if [[ "$unit_drift" == "true" ]]; then
  cat >&2 <<EOF

  ==> Refusing to deploy: systemd unit files in this repo do not match
      what's installed in /etc/systemd/system/. Restarting the services now
      would re-read the stale units and silently drop any env-var or
      hardening changes in this commit.

      Fix on the VM (idempotent — only re-installs units + daemon-reload):

        sudo bash $REPO_DIR/deploy/install.sh

      Then re-run this deploy.

EOF
  exit 1
fi

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
  # Single-level subdomain — Cloudflare's free Universal SSL only covers one level deep.
  NEXT_PUBLIC_API_URL="https://hestia-api.sharvilpatel.dev" npm run build -w frontend

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
