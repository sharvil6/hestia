#!/usr/bin/env bash
# One-time host setup for the Hestia self-hosted VM (Ubuntu 24.04).
# Run as root: sudo bash deploy/install.sh
#
# Idempotent — safe to re-run after upstream changes.

set -euo pipefail

REPO_DIR="/srv/hestia/repo"
DATA_DIR="/srv/hestia/data"
ENV_FILE="/srv/hestia/.env"
HESTIA_USER="hestia"
REPO_SSH_URL="git@github.com:sharvil6/hestia.git"
HESTIA_SSH_DIR="/home/$HESTIA_USER/.ssh"
HESTIA_SSH_KEY="$HESTIA_SSH_DIR/id_ed25519"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo bash deploy/install.sh)" >&2
  exit 1
fi

echo "==> apt update + base packages"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git \
  python3 python3-venv python3-pip \
  sqlite3 \
  build-essential

echo "==> Node.js 20 LTS via NodeSource"
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v20'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> cloudflared via Cloudflare apt repo"
if ! command -v cloudflared >/dev/null 2>&1; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(. /etc/os-release && echo $VERSION_CODENAME) main" \
    | tee /etc/apt/sources.list.d/cloudflared.list
  apt-get update
  apt-get install -y cloudflared
fi

echo "==> hestia + gh-runner system users + directories"
id -u "$HESTIA_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$HESTIA_USER"
id -u gh-runner      >/dev/null 2>&1 || useradd --create-home --shell /bin/bash gh-runner
mkdir -p "$DATA_DIR/db" "$DATA_DIR/uploads" /srv/hestia/frontend-runtime
# Public demo lives alongside prod with its own data dir + frontend runtime.
mkdir -p /srv/hestia/demo/data/db /srv/hestia/demo/data/uploads /srv/hestia/demo/frontend-runtime
chown -R "$HESTIA_USER:$HESTIA_USER" /srv/hestia

echo "==> ensuring SSH deploy key for $HESTIA_USER"
if [[ ! -f "$HESTIA_SSH_KEY" ]]; then
  sudo -u "$HESTIA_USER" -H mkdir -p "$HESTIA_SSH_DIR"
  sudo -u "$HESTIA_USER" -H chmod 700 "$HESTIA_SSH_DIR"
  sudo -u "$HESTIA_USER" -H ssh-keygen -t ed25519 -f "$HESTIA_SSH_KEY" -N "" -C "hestia-deploy@$(hostname)"
fi

# Pre-trust github.com so the first clone doesn't prompt on stdin.
if ! sudo -u "$HESTIA_USER" -H grep -q '^github\.com ' "$HESTIA_SSH_DIR/known_hosts" 2>/dev/null; then
  sudo -u "$HESTIA_USER" -H bash -c "ssh-keyscan -t ed25519,rsa github.com >> '$HESTIA_SSH_DIR/known_hosts'"
fi

# Verify the deploy key actually authenticates against GitHub before attempting to clone.
# `ssh -T git@github.com` returns exit 1 on success (GitHub closes the session) — anything else is a failure.
if ! sudo -u "$HESTIA_USER" -H ssh -o BatchMode=yes -o ConnectTimeout=10 -T git@github.com 2>&1 | grep -qE "successfully authenticated"; then
  echo
  echo "  !! GitHub deploy key is NOT registered yet."
  echo "  !! Add the following PUBLIC key to:"
  echo "  !!     https://github.com/sharvil6/hestia/settings/keys"
  echo "  !! (Add deploy key, title 'optiplex', leave 'Allow write access' UNCHECKED.)"
  echo
  echo "  -------- PUBLIC KEY --------"
  sudo cat "$HESTIA_SSH_KEY.pub"
  echo "  ----------------------------"
  echo
  echo "  Then re-run this script: sudo bash $0"
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> cloning repo via SSH"
  sudo -u "$HESTIA_USER" -H git clone "$REPO_SSH_URL" "$REPO_DIR"
elif sudo -u "$HESTIA_USER" -H git -C "$REPO_DIR" remote get-url origin | grep -q '^https://'; then
  echo "==> migrating existing repo origin from HTTPS to SSH"
  sudo -u "$HESTIA_USER" -H git -C "$REPO_DIR" remote set-url origin "$REPO_SSH_URL"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> creating $ENV_FILE template (FILL IN SECRETS BEFORE FIRST DEPLOY)"
  cat > "$ENV_FILE" <<'EOF'
# Secrets for Hestia services. Loaded by hestia-backend.service via EnvironmentFile.
GEMINI_API_KEY=
# Optional: override the Gemini model used for image recipe extraction
# GEMINI_VISION_MODEL=gemini-2.5-flash-lite
# Add any auth signing keys / other secrets here.
EOF
  chmod 640 "$ENV_FILE"
  chown root:"$HESTIA_USER" "$ENV_FILE"
fi

echo "==> installing systemd units"
install -m 644 "$REPO_DIR/deploy/hestia-backend.service"       /etc/systemd/system/hestia-backend.service
install -m 644 "$REPO_DIR/deploy/hestia-frontend.service"      /etc/systemd/system/hestia-frontend.service
install -m 644 "$REPO_DIR/deploy/hestia-demo-backend.service"  /etc/systemd/system/hestia-demo-backend.service
install -m 644 "$REPO_DIR/deploy/hestia-demo-frontend.service" /etc/systemd/system/hestia-demo-frontend.service
install -m 644 "$REPO_DIR/deploy/hestia-demo-reset.service"    /etc/systemd/system/hestia-demo-reset.service
install -m 644 "$REPO_DIR/deploy/hestia-demo-reset.timer"      /etc/systemd/system/hestia-demo-reset.timer
systemctl daemon-reload
systemctl enable hestia-backend.service hestia-frontend.service
systemctl enable hestia-demo-backend.service hestia-demo-frontend.service
systemctl enable --now hestia-demo-reset.timer

echo "==> installing sudoers drop-in for gh-runner"
install -m 440 -o root -g root "$REPO_DIR/deploy/gh-runner.sudoers" /etc/sudoers.d/hestia-gh-runner
visudo -cf /etc/sudoers.d/hestia-gh-runner   # syntax check, aborts install on failure

echo
echo "==> NEXT STEPS"
echo "  1. Edit $ENV_FILE with your secrets (GEMINI_API_KEY, etc.)"
echo "  2. Register cloudflared with your tunnel token:"
echo "       sudo cloudflared service install <TUNNEL_TOKEN_FROM_CF_DASHBOARD>"
echo "  3. Configure public hostnames in Cloudflare Zero Trust dashboard:"
echo "       hestia.sharvilpatel.dev          -> http://localhost:3000"
echo "       hestia-api.sharvilpatel.dev      -> http://localhost:8000"
echo "       hestia-demo.sharvilpatel.dev     -> http://localhost:3001   (public demo)"
echo "       hestia-demo-api.sharvilpatel.dev -> http://localhost:8001   (public demo API)"
echo "  4. Run the first deploy manually: sudo -u $HESTIA_USER bash $REPO_DIR/deploy/deploy.sh"
echo "     Then: sudo systemctl start hestia-backend.service hestia-frontend.service"
echo "           sudo systemctl start hestia-demo-backend.service hestia-demo-frontend.service"
echo "  4b. Seed the demo DB (one-time; the timer keeps it fresh thereafter)."
echo "      Run from backend/ so 'python -m scripts.*' resolves:"
echo "       sudo -u $HESTIA_USER bash -c 'cd $REPO_DIR/backend && \\"
echo "         HESTIA_DEMO_MODE=1 DB_DIR=/srv/hestia/demo/data/db UPLOAD_DIR=/srv/hestia/demo/data/uploads \\"
echo "         .venv/bin/python -m scripts.create_demo && \\"
echo "         HESTIA_DEMO_MODE=1 DB_DIR=/srv/hestia/demo/data/db UPLOAD_DIR=/srv/hestia/demo/data/uploads \\"
echo "         .venv/bin/python -m scripts.seed_demo_recipes'"
echo "  5. Register the GitHub Actions self-hosted runner as the gh-runner user:"
echo "       sudo -u gh-runner -i"
echo "       # follow the registration commands from GitHub Settings -> Actions -> Runners"
echo "       sudo ./svc.sh install gh-runner && sudo ./svc.sh start"
