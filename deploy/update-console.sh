#!/bin/bash
# Paste into Hostinger VPS → Console Web to pull latest UI/API and rebuild.
# Does NOT reseed the database (keeps live edits).
set -euo pipefail

APP_DIR=/opt/bbc-school
REPO=https://github.com/yahyaMMD/bbc-school-admin.git

cd "$APP_DIR"
if [ -d .git ]; then
  git fetch --all
  git reset --hard origin/main
else
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

docker compose up -d --build
docker compose ps
echo
echo "Updated. Open http://72.62.42.122/ → Admin door → Manage"
curl -sS -m 5 -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:8080/ || true
