#!/bin/bash
# FIX NOW — paste into Hostinger → VPS → Console Web
# Do NOT use --build (rebuilds can freeze a small VPS).
set +e
echo "=== FIX START ==="
# Bring network / docker / nginx back without rebuilding images
systemctl start docker 2>/dev/null
systemctl start nginx 2>/dev/null
systemctl restart nginx 2>/dev/null

cd /opt/bbc-school || cd /root/bbc-school || { echo "NO PROJECT DIR"; ls /opt /root; exit 1; }

# Start existing containers only (fast, low RAM)
docker compose up -d --no-build 2>/dev/null || docker compose up -d
sleep 8
docker compose ps
echo "--- health ---"
curl -sS -m 5 http://127.0.0.1:8080/api/health; echo
curl -sS -m 5 -o /dev/null -w "nginx:%{http_code}\n" http://127.0.0.1/
ss -lntp | grep -E ':22|:80|:443|:8080' || netstat -lntp 2>/dev/null | grep -E ':22|:80|:443|:8080'
echo "=== FIX DONE — open https://quality-education-algerie.duckdns.org/ ==="
