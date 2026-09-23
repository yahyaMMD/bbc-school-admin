# BBC School — Live VPS deploy

## Access (after deploy)
- URL: `http://72.62.42.122/` (nginx → localhost:8080)
- **Director** password (default): `Director2026`
- **Admin** password (default): `AdminBBC2026`
- Change them in `/opt/bbc-school/.env` then `docker compose up -d`

## Update UI / Admin console (Console Web)
Hostinger → VPS → **Console Web**, paste:

```bash
curl -fsSL https://raw.githubusercontent.com/yahyaMMD/bbc-school-admin/main/deploy/update-console.sh | bash
```

This rebuilds the app image without wiping the database.

## Hostinger firewall (required)
Keep 22, 80, 443. Port 8080 can stay localhost-only when nginx proxies :80.

## Install via Console Web (first time)
1. Hostinger → VPS → **Console Web**
2. Paste:

```bash
curl -fsSL https://raw.githubusercontent.com/yahyaMMD/bbc-school-admin/main/deploy/bootstrap-console.sh | bash
```

3. Open `http://72.62.42.122/`

## Security
Reset the VPS **root password** in Hostinger (it was shared in chat).
