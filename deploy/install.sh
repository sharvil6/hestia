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
chown -R "$HESTIA_USER:$HESTIA_USER" /srv/hestia

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "==> cloning repo"
  sudo -u "$HESTIA_USER" git clone https://github.com/sharvil6/hestia.git "$REPO_DIR"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> creating $ENV_FILE template (FILL IN SECRETS BEFORE FIRST DEPLOY)"
  cat > "$ENV_FILE" <<'EOF'
# Secrets for Hestia services. Loaded by hestia-backend.service via EnvironmentFile.
GEMINI_API_KEY=
# Add any auth signing keys / other secrets here.
EOF
  chmod 640 "$ENV_FILE"
  chown root:"$HESTIA_USER" "$ENV_FILE"
fi

echo "==> installing systemd units"
install -m 644 "$REPO_DIR/deploy/hestia-backend.service"  /etc/systemd/system/hestia-backend.service
install -m 644 "$REPO_DIR/deploy/hestia-frontend.service" /etc/systemd/system/hestia-frontend.service
systemctl daemon-reload
systemctl enable hestia-backend.service hestia-frontend.service

echo "==> installing sudoers drop-in for gh-runner"
install -m 440 -o root -g root "$REPO_DIR/deploy/gh-runner.sudoers" /etc/sudoers.d/hestia-gh-runner
visudo -cf /etc/sudoers.d/hestia-gh-runner   # syntax check, aborts install on failure

echo
echo "==> NEXT STEPS"
echo "  1. Edit $ENV_FILE with your secrets (GEMINI_API_KEY, etc.)"
echo "  2. Register cloudflared with your tunnel token:"
echo "       sudo cloudflared service install <TUNNEL_TOKEN_FROM_CF_DASHBOARD>"
echo "  3. Configure public hostnames in Cloudflare Zero Trust dashboard:"
echo "       hestia.sharvilpatel.dev      -> http://localhost:3000"
echo "       api.hestia.sharvilpatel.dev  -> http://localhost:8000"
echo "  4. Run the first deploy manually: sudo -u $HESTIA_USER bash $REPO_DIR/deploy/deploy.sh"
echo "     Then: sudo systemctl start hestia-backend.service hestia-frontend.service"
echo "  5. Register the GitHub Actions self-hosted runner as the gh-runner user:"
echo "       sudo -u gh-runner -i"
echo "       # follow the registration commands from GitHub Settings -> Actions -> Runners"
echo "       sudo ./svc.sh install gh-runner && sudo ./svc.sh start"
