#!/bin/bash
# Paste this entire script into Hostinger VPS → Console Web
# It installs Docker and deploys BBC School on port 8080 without touching other sites.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
APP_DIR=/opt/bbc-school
REPO=https://github.com/yahyaMMD/bbc-school-admin.git

echo "[1/5] Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

echo "[2/5] Clone / update app..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "[3/5] Env file..."
if [ ! -f .env ]; then
  cp .env.example .env
  POSTGRES_PASSWORD=$(openssl rand -hex 12)
  JWT_SECRET=$(openssl rand -hex 24)
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${POSTGRES_PASSWORD}/" .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
  # Keep default door passwords from .env.example unless already customized
fi
grep -E '^(DIRECTOR_PASSWORD|ADMIN_PASSWORD|HOST_PORT)=' .env || true

echo "[4/5] Start stack..."
docker compose up -d --build

echo "[5/5] Local firewall (optional)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8080/tcp || true
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "============================================"
echo "BBC School should be at: http://${IP}:8080"
echo "Also try: http://72.62.42.122:8080"
echo
echo "Director password:  (see DIRECTOR_PASSWORD in $APP_DIR/.env)"
echo "Admin password:     (see ADMIN_PASSWORD in $APP_DIR/.env)"
echo "Default if unchanged: Director2026 / AdminBBC2026"
echo
echo "Hostinger panel firewall MUST Allow TCP 8080 (Any) + Synchronize"
echo "Client site on :80/:443 was not modified."
echo "============================================"
docker compose ps
curl -sS -m 5 http://127.0.0.1:8080/api/health || true
echo
