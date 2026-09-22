# BBC School — Live VPS deploy

## Access (after deploy)
- URL: `http://72.62.42.122:8080`
- **Director** password (default): `Director2026`
- **Admin** password (default): `AdminBBC2026`
- Change them in `/opt/bbc-school/.env` then `docker compose up -d`

## Hostinger firewall (required)
Add **Accept TCP 8080 / Any**, then **Synchroniser**.
Keep 22, 80, 443 as you already have.

## Install via Console Web (SSH blocked from Cursor network)
1. Hostinger → VPS → **Console Web**
2. Paste:

```bash
curl -fsSL https://raw.githubusercontent.com/yahyaMMD/bbc-school-admin/main/deploy/bootstrap-console.sh | bash
```

3. Open `http://72.62.42.122:8080`

## Security
Reset the VPS **root password** in Hostinger (it was shared in chat).
