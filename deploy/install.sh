#!/usr/bin/env bash
# Install / update BBC School on this VPS (does not touch other projects).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bbc-school}"
REPO_URL="${REPO_URL:-}"
HOST_PORT="${HOST_PORT:-8080}"

echo "==> BBC School deploy into ${APP_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

mkdir -p "$(dirname "$APP_DIR")"

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Pulling latest..."
  git -C "$APP_DIR" pull --ff-only || true
elif [ -n "$REPO_URL" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "ERROR: $APP_DIR missing and REPO_URL not set."
  echo "Copy the project files to $APP_DIR first, or set REPO_URL."
  exit 1
fi

cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  # generate secrets
  POSTGRES_PASSWORD=$(openssl rand -hex 12)
  JWT_SECRET=$(openssl rand -hex 24)
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${POSTGRES_PASSWORD}/" .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
  sed -i "s/^HOST_PORT=.*/HOST_PORT=${HOST_PORT}/" .env
  echo "==> Created .env (change DIRECTOR_PASSWORD / ADMIN_PASSWORD)"
fi

echo "==> Building and starting (port ${HOST_PORT})..."
docker compose pull || true
docker compose up -d --build

# Open host firewall if ufw exists (Hostinger panel firewall may still need 8080)
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${HOST_PORT}/tcp" || true
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

echo
echo "==> Done."
echo "Open: http://$(curl -s ifconfig.me 2>/dev/null || echo YOUR_VPS_IP):${HOST_PORT}"
echo "Director password: see DIRECTOR_PASSWORD in ${APP_DIR}/.env"
echo "Admin password:    see ADMIN_PASSWORD in ${APP_DIR}/.env"
echo
echo "IMPORTANT: In Hostinger Firewall, also Allow TCP ${HOST_PORT} (Any), then Synchronize."
docker compose ps
