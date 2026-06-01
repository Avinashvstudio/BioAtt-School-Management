# Deploy BioAtt School Management

Your app has two parts:

| Part | Technology | Where to host |
|------|------------|---------------|
| **Web UI** | HTML/JS + Firebase Auth/Firestore | Firebase Hosting or same server as Flask |
| **Backend API** | Flask (email, admin writes) | Render, Railway, or Cloud Run |

**Recommended:** Deploy everything on **Render** (one URL, simplest for demos).

---

## Option A — Render (recommended, full app)

### 1. Push code to GitHub

Create a repo and push the `admin_panal` folder (or whole project).

### 2. Create Render Web Service

1. Go to [https://render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root directory:** `admin_panal` (if repo is whole project)
   - **Runtime:** Python
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
   - **Plan:** Free (or paid for always-on)

Or use the included `render.yaml` blueprint.

### 3. Environment variables (Render dashboard)

| Key | Value |
|-----|--------|
| `GMAIL_USER` | Your Gmail address (for attendance emails) |
| `GMAIL_PASS` | Gmail [App Password](https://myaccount.google.com/apppasswords) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full contents of `bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json` (one line JSON) |
| `FLASK_DEBUG` | `false` |

**Do not** commit the service account JSON to GitHub. Paste it only in Render secrets.

### 4. Firebase Console (required)

1. [Firebase Console](https://console.firebase.google.com/) → project **bioatt-attendance-25d06**
2. **Authentication** → **Settings** → **Authorized domains** → Add your Render URL  
   e.g. `bioatt-school.onrender.com`
3. **Firestore** → **Rules** → Paste from `firebase-rules-updated.txt` → **Publish**

### 5. Live URLs (after deploy)

Replace `YOUR-APP` with your Render service name:

| Portal | URL |
|--------|-----|
| Landing | `https://YOUR-APP.onrender.com/` |
| Login | `https://YOUR-APP.onrender.com/admin_panal/common/login.html` |
| Admin | `https://YOUR-APP.onrender.com/admin_panal/admin/` |
| Teacher | `https://YOUR-APP.onrender.com/admin_panal/teacher/` |
| Parent | `https://YOUR-APP.onrender.com/admin_panal/parent/` |

Demo logins: see `DEMO_CREDENTIALS.md`

---

## Option B — Firebase Hosting (frontend) + Render (API)

Use this if you want a fast CDN for static files.

### 1. Deploy backend to Render (steps above)

Note your Render URL: `https://YOUR-APP.onrender.com`

### 2. Deploy frontend to Firebase Hosting

```powershell
cd admin_panal
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

Default site: `https://bioatt-attendance-25d06.web.app`

### 3. Point frontend to API

In `common/login.html` (and other portal pages), add **before** other scripts:

```html
<script>window.BIOATT_API_URL = 'https://YOUR-APP.onrender.com';</script>
```

### 4. Firebase authorized domains

Add both:

- `bioatt-attendance-25d06.web.app`
- `bioatt-attendance-25d06.firebaseapp.com`

---

## Option C — Firebase Hosting only (no email API)

```powershell
cd admin_panal
firebase deploy --only hosting
```

- Login, admin, teacher, parent UIs work via Firestore
- **Email notifications** and **admin API fallback** need the Flask server on Render

---

## Pre-deploy checklist

- [ ] Publish Firestore rules (`firebase-rules-updated.txt`)
- [ ] Run demo seed: `python seed_client_demo.py`
- [ ] Add production domain to Firebase **Authorized domains**
- [ ] Set `GMAIL_USER` / `GMAIL_PASS` if using email features
- [ ] Set `FIREBASE_SERVICE_ACCOUNT_JSON` on Render for admin save API
- [ ] Never commit `*.json` service account or `.env` to Git

---

## Local production test

```powershell
cd admin_panal
pip install -r requirements.txt
$env:FLASK_DEBUG="false"
gunicorn app:app --bind 0.0.0.0:5001
```

Open http://127.0.0.1:5001

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login works locally, not on deploy | Add deploy URL to Firebase Authorized domains |
| Permission denied on Firestore | Publish `firebase-rules-updated.txt` (teachers need read on `attendance`, `timetable`, `students`) |
| Teacher attendance stuck on “Loading students…” | Publish rules above **and** redeploy Render so `/api/teacher/students` and `/api/teacher/attendance` are available |
| Parent portal “Error loading student data” | Publish rules (parent reads via `studentId` on attendance/marks) **and** redeploy for `/api/parent/*` |
| Admin save fails | Set `FIREBASE_SERVICE_ACCOUNT_JSON` on Render |
| Emails not sent | Set Gmail app password; check `GMAIL_*` env vars |
| Render sleeps on free tier | First visit may take ~30s to wake up |

---

## Android APK

The Android app uses Firebase directly. Deploying the web panel does not change the APK. Distribute `app-release.apk` separately.
