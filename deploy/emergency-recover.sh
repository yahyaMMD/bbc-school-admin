#!/bin/bash
# Paste into Hostinger → VPS → Console Web if the site is down.
# Restarts Docker stack and shows health.
set -euo pipefail
cd /opt/bbc-school || cd /root/bbc-school || { echo "Project folder not found"; ls /opt /root; exit 1; }
echo "== disk =="
df -h / | tail -1
echo "== memory =="
free -h || true
echo "== docker =="
docker ps -a || true
echo "== restart stack =="
docker compose up -d --build
sleep 8
docker compose ps
echo "== health =="
curl -sS -m 5 http://127.0.0.1:8080/api/health || true
echo
curl -sS -m 5 -o /dev/null -w "nginx_http:%{http_code}\n" http://127.0.0.1/ || true
echo "RECOVERY_OK — try https://quality-education-algerie.duckdns.org/"
