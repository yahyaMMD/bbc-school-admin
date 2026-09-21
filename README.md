# BBC School — Administration Interface

Local, presentation-ready admin interface for **BBC School** (Cheraga, Alger).  
No remote database — all data is generated and stored in the project.

## Quick start

Open `index.html` in a browser, or serve locally:

```bash
cd ~/Desktop/bbc-school-admin
python3 -m http.server 5173
```

Then visit: http://localhost:5173

## Access

| Field | Value |
|--------|--------|
| Password | `BBCSchool2026` |

Session stays active for 8 hours (browser session storage).

## Navigation

1. **Login** → password gate  
2. **Departments** → Primary / Middle School  
3. **Primary** → 5 floors → 10 classes each  
4. **Middle School** → 3 floors → 6 / 5 / 5 classes  
5. **Class** → student count + teachers list  
6. **Teacher** → name, phone, wilaya, commune, modules, assigned classes  

## Brand

- Logo: `assets/logo.png`  
- Colors: orange `#F26522`, black, white  
- School site reference: https://www.bbcschool-dz.com  

## Structure

**Primary:** 5 floors · 50 classes (10 per floor)  
**Middle School:** 3 floors · 16 classes (6 + 5 + 5)  
Local Algerian teacher names, wilayas & communes  

## Notes

- Suitable for datashow / parent presentations  
- Fast static files — no build step required  
- Change the password in `js/auth.js` (`ADMIN_PASSWORD`)
