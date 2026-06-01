# BioAtt School Management

School attendance and management platform by **Vaar Digital Innovation** — Android app + web admin/teacher/parent portals powered by Firebase.

## What's included

| Component | Description |
|-----------|-------------|
| **`app/`** | Android app (photo attendance, Room DB) |
| **`admin_panal/`** | Web portals: Admin, Teacher, Parent, Driver + Flask API |
| **`admin_panal/DEPLOY.md`** | Deploy to Render / Firebase Hosting |
| **`admin_panal/DEMO_CREDENTIALS.md`** | Demo logins for client presentations |

## Quick start (local)

### Web admin panel

```powershell
cd admin_panal
pip install -r requirements.txt
copy .env.example .env
# Edit .env with GMAIL_USER, GMAIL_PASS
python app.py
```

Open http://127.0.0.1:5001/admin_panal/common/login.html

### Demo data

```powershell
cd admin_panal
python seed_client_demo.py
```

- Teachers password: `123456`
- Parents password: `1234567890`
- Admin: `admin@demo.com` / `admin123`

### Android

Open `app/` in Android Studio, configure `local.properties` with SDK path, build release APK.

## Deploy

See **[admin_panal/DEPLOY.md](admin_panal/DEPLOY.md)** for Render and Firebase Hosting steps.

## Firebase project

- Project ID: `bioatt-attendance-25d06`
- Publish Firestore rules from `admin_panal/firebase-rules-updated.txt`

## License

Proprietary — Vaar Digital Innovation.
