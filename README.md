# BBC School — Administration Interface

Local, presentation-ready admin interface for **BBC School** (Cheraga, Alger).  
No remote database — all data is generated and stored in the project.

## Quick start (local)

```bash
cd ~/Desktop/bbc-school-admin
python3 -m http.server 5173
```

Then visit: http://localhost:5173

## GitHub Pages

This is a static site (no build). After push to `main`, Pages serves from the repository root.

1. Repo **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**
2. Open the published URL (shown in Settings → Pages)

## Access

| Field | Value |
|--------|--------|
| Password | `BBCSchool2026` |

Session stays active for 8 hours (browser session storage).

> Client-side password only — do not treat a public Pages URL as secure storage for confidential student data.

## Navigation

1. **Login** → password gate  
2. **Departments** → Primary / Middle School  
3. **Years** → Classes → Students / Teachers  
4. **Student** → profile + prior-year details (More details)  
5. Global student search in the top bar  

## Brand

- Logo: `assets/logo.png`  
- Colors: orange `#F26522`, black, white  
- School site reference: https://www.bbcschool-dz.com  

## Notes

- Suitable for datashow / staff presentations  
- Fast static files — no build step required  
- Change the password in `js/auth.js` (`ADMIN_PASSWORD`)
