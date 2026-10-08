#!/bin/bash
# Paste into Hostinger → VPS → Console Web
# 1) Restart if needed from Hostinger UI first (Redémarrer)
# 2) Paste this whole block
set -euo pipefail
cd /opt/bbc-school || { echo "MISSING /opt/bbc-school"; exit 1; }

echo "== restart stack =="
docker compose up -d
sleep 6
docker compose ps

echo "== reset year-manager passwords to Floor2026 (no forced change) =="
docker compose exec -T api node --input-type=module - <<'NODE'
import bcrypt from "bcryptjs";
import { query, pool } from "./src/db.js";
const pass = process.env.FLOOR_PASSWORD || "Floor2026";
const hash = await bcrypt.hash(pass, 10);
const r = await query(
  `UPDATE floor_managers
   SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
   RETURNING login_code, department_id, (floor_number + 1) AS year`,
  [hash]
);
console.log("reset", r.rows.length, "managers →", pass);
for (const row of r.rows) console.log(row.login_code, row.department_id, "Y"+row.year);
await pool.end();
NODE

echo "== re-seed staff passwords from .env =="
docker compose exec -T api node --input-type=module - <<'NODE'
import bcrypt from "bcryptjs";
import { query, pool } from "./src/db.js";
const pairs = [
  ["director", process.env.DIRECTOR_PASSWORD || "Director2026"],
  ["admin", process.env.ADMIN_PASSWORD || "AdminBBC2026"],
  ["whatsapp", process.env.WHATSAPP_PASSWORD || "WhatsApp2026"],
];
for (const [role, pass] of pairs) {
  const hash = await bcrypt.hash(pass, 10);
  await query(
    `INSERT INTO app_users (role, password_hash) VALUES ($1, $2)
     ON CONFLICT (role) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    [role, hash]
  );
  console.log("ok", role);
}
await pool.end();
NODE

echo "== health =="
curl -sS -m 8 http://127.0.0.1:8080/api/health || true
echo
curl -sS -m 8 -o /dev/null -w "local8080:%{http_code}\n" http://127.0.0.1:8080/ || true
curl -sS -m 8 -o /dev/null -w "nginx80:%{http_code}\n" http://127.0.0.1/ || true

echo "== login smoke =="
for pair in "director:Director2026" "admin:AdminBBC2026" "whatsapp:WhatsApp2026"; do
  role="${pair%%:*}"; pass="${pair##*:}"
  code=$(curl -sS -m 8 -o /tmp/login.json -w "%{http_code}" -X POST http://127.0.0.1:8080/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"password\":\"$pass\",\"role\":\"$role\"}" || echo fail)
  echo "$role → HTTP $code $(head -c 80 /tmp/login.json 2>/dev/null)"
done
for id in FLOOR001 MID001; do
  code=$(curl -sS -m 8 -o /tmp/flogin.json -w "%{http_code}" -X POST http://127.0.0.1:8080/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"password\":\"Floor2026\",\"loginCode\":\"$id\"}" || echo fail)
  echo "$id → HTTP $code $(head -c 100 /tmp/flogin.json 2>/dev/null)"
done

echo
echo "RECOVERY_OK — open https://quality-education-algerie.duckdns.org/"
