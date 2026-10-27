# Free-tier deployment: Vercel (frontend) + Supabase (PostgreSQL) + Render (API)

Ritual Circles uses a **React (Vite)** web app, a **FastAPI** API, and **PostgreSQL**. On free tiers:

| Layer | Service | Role |
|-------|---------|------|
| Frontend | [Vercel](https://vercel.com) | Hosts the React app (mobile-friendly PWA-style web) |
| Database | [Supabase](https://supabase.com) | Managed PostgreSQL |
| API | [Render](https://render.com) | Runs FastAPI (Supabase does not host Python APIs) |

---

## 1. Frontend (Vercel)

### Verify build locally

```powershell
cd web
npm install
npm run build
```

You should see a **`dist/`** folder with `index.html` and `assets/`.

### Deploy to Vercel

1. Push this repo to GitHub (if not already).
2. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Set **Root Directory** to **`web`**.
4. Framework preset: **Vite** (or use existing `web/vercel.json`).
5. **Environment variables** (Production):

   | Name | Value |
   |------|--------|
   | `VITE_API_BASE_URL` | Your Render API URL, e.g. `https://ritual-circles-api.onrender.com` (no trailing slash) |
   | `VITE_GOOGLE_CLIENT_ID` | Same as backend `GOOGLE_OAUTH_CLIENT_ID` (if using Google login) |

6. Deploy. Note your URL, e.g. `https://ritual-circles.vercel.app`.

`vercel.json` already configures SPA routing (all paths → `index.html`) and output directory `dist`.

---

## 2. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. **Project Settings → Database → Connection string → URI**  
   Copy the **Session mode** URI (port **5432**) for Render (long-running server).
3. **SQL Editor → New query**, run in order:
   - Paste and run `db/schema.sql`
   - Then each file in `db/migrations/` in numeric order (`003` … `046`)

   Or from your machine (with `psql` installed):

   ```powershell
   $env:DATABASE_URL = "postgresql://postgres.[ref]:[password]@...supabase.com:5432/postgres"
   psql $env:DATABASE_URL -f db/schema.sql
   Get-ChildItem db/migrations/*.sql | Sort-Object Name | ForEach-Object { psql $env:DATABASE_URL -f $_.FullName }
   ```

4. Keep the connection string secret; use it only as `DATABASE_URL` on Render.

---

## 3. API (Render — free tier)

Supabase provides **PostgreSQL only**. The FastAPI app must run elsewhere; Render’s free web service works well with Supabase.

1. [render.com](https://render.com) → **New → Web Service** → connect the same GitHub repo.
2. **Root Directory**: `backend`
3. **Runtime**: Python 3
4. **Build command**: `pip install -r requirements.txt`
5. **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Environment variables**:

   | Name | Value |
   |------|--------|
   | `DATABASE_URL` | Supabase Session URI (from step 2) |
   | `DATABASE_SSL` | `require` |
   | `ENVIRONMENT` | `production` |
   | `JWT_SECRET` | Long random string (32+ chars) |
   | `ALLOW_DEV_USER_HEADER` | `false` (or leave unset) |
   | `HOBBY_ADMIN_USER_IDS` | Comma-separated UUIDs allowed to administer the Hobby catalogue; empty denies everyone |
   | `ALLOWED_ORIGINS` | Your Vercel URL(s), comma-separated, e.g. `https://ritual-circles.vercel.app` |
   | `GOOGLE_OAUTH_CLIENT_ID` | Optional; match `VITE_GOOGLE_CLIENT_ID` |

7. **Health check path**: `/health`. It runs `SELECT 1` and returns `{"status": "ok", "database": "ok"}`, or HTTP 503 with `{"status": "error", "database": "unavailable"}`. It needs no login and reveals nothing about the database. (`render.yaml` sets this; a service created by hand must be changed in the Render dashboard from `/docs` to `/health`.)
8. Deploy and copy the service URL (e.g. `https://ritual-circles-api.onrender.com`).
9. Set **`VITE_API_BASE_URL`** on Vercel to that URL and **redeploy** the frontend.

Alternatively, use the included **`render.yaml`** blueprint at the repo root (Render → **New → Blueprint**).

**Note:** Render free tier sleeps after inactivity; first request may take ~30s to wake.

---

## 4. Google OAuth (optional)

In [Google Cloud Console](https://console.cloud.google.com) → OAuth Web client:

- **Authorized JavaScript origins**: add `https://your-app.vercel.app`
- Keep localhost origins for local dev

---

## 5. Smoke test (mobile)

1. Open the Vercel URL on your phone.
2. Confirm the app loads (no CORS errors in browser dev tools).
3. Create account / use dev flow; confirm `GET /home` works.

If the API is cold on Render, wait for the first request to finish.

---

## 6. Activities release (migrations 031–047)

This release moves meetups from legacy Sessions to Circle Activities. A push to `main` deploys immediately, so **the production schema must be updated before the push**. `scripts/deploy-production.ps1` runs its steps in this order and only the ones you pass.

| # | Step | Command / action |
|---|------|------------------|
| 1 | Validate the repo and see the release manifest (no staging) | `.\scripts\deploy-production.ps1 -Prepare` |
| 2 | Check production config names (values never shown) | `.\scripts\deploy-production.ps1 -CheckConfig -EnvFile <file with production values>` |
| 3 | Commit locally after review (type `COMMIT`) | `.\scripts\deploy-production.ps1 -Commit` |
| 4 | Back up production | Supabase dashboard → Database → Backups. **The script cannot verify this.** |
| 5 | Apply migrations, then the read-only schema check (type `BACKUP-TAKEN`) | Point `backend/.env` at production, then `.\scripts\deploy-production.ps1 -Migrate` |
| 6 | Push (re-runs the schema check first; type `PUSH`) and wait for API health | `.\scripts\deploy-production.ps1 -Push -ApiUrl https://<render-api-host>` |
| 7 | Let Vercel finish deploying the web app | Vercel dashboard |
| 8 | Re-run the idempotent migrations (038 adds members who joined during the deploy) | `.\scripts\deploy-production.ps1 -Migrate` |
| 9 | Signed-in smoke test | Checklist below |

**Migration runner** (`backend/scripts/apply_production_migrations.py`): refuses localhost (unless `ALLOW_LOCAL_MIGRATE=1`), never prints the connection string, prints each file before running it, stops at the first failed statement with the file name and statement number, exits non-zero, and prints a summary. Statements run one at a time in autocommit mode — **a file is not atomic**: statements before a failure stay applied. Every statement uses `IF NOT EXISTS` (or drops and re-adds a superset check), so fixing the cause and re-running is safe.

**Read-only schema check** (`backend/scripts/check_production_schema.py`): there is no migration ledger, so it inspects real objects — tables, required columns, `NOT NULL` slots, unique keys, the partial unique indexes, and the status/attendance/readiness checks from 031–047. The session is `READ ONLY`; it never creates, alters, inserts, updates or deletes. Run it alone with `-CheckSchema`.

**Config check** (`backend/scripts/check_release_config.py`): reports `ENVIRONMENT`, `JWT_SECRET`, `ALLOW_DEV_USER_HEADER`, `HOBBY_ADMIN_USER_IDS`, `DATABASE_URL`, `DATABASE_SSL`, `ALLOWED_ORIGINS` as configured / missing / unsafe. It does not read `backend/.env` unless you pass it with `--env-file`, and it does not contact Render.

### Smoke checklist (production, signed in)

1. `GET /health` returns `{"status":"ok","database":"ok"}`.
2. Log in; Home loads with no errors.
3. Create a Circle: the creator is a member; no Activity is created.
4. A second account joins by invite link. Joining works at any member count.
5. Plan a one-time Activity, publish it, join with one tap; Home shows it. Leave with one tap.
6. With `groupSize` reached, the next person sees the Activity as full.
7. Plan a recurring Activity; join one date; Home shows that date.
8. Suggest a time, accept it; going people see "Still going / Leave"; a notification appears.
9. Cancel an Activity; members get the in-app notification.
10. Complete an Activity and record attendance.
11. Discover shows no Activity title or place.
12. Switch to Hebrew; check the right-to-left layout.
13. A non-admin does not see Hobby management and gets 403 from the Hobby write API.
14. Leave the Circle; it is silent and Home returns to the empty state.

### Rollback

- Redeploy the previous Render and Vercel builds.
- Migrations are forward-only and additive. The previous code ignores the new tables and columns, so do not drop anything.
- Restore the Supabase backup only for data corruption.
- Legacy `sessions` / `attendance` are read-only history: never dropped, migrated, or written.

### Known limitations (accepted for V1)

- **Daylight saving time — ACCEPTED V1 LIMITATION.** Recurring Activities keep a fixed UTC weekly rhythm. No IANA time zone is stored, so the displayed local time can shift by one hour across daylight-saving changes. This is not local-time recurrence.
- Legacy Sessions are not converted into Activities. Existing Circles show no upcoming Activity until a member plans one.
- Push and email delivery are not implemented; Activity notifications are in-app only.
- The diagnostics `test_create_circle.py`, `repro_create_http.py` and `diag_supabase_create.py` still delete legacy rows; they refuse to run unless `ALLOW_LEGACY_SCRIPT=1` and must never run against production. `seed_demo_data.py` writes legacy attendance and is excluded from the release.

### Cutover copy (proposed — not sent or published)

For existing Circles, wherever the team chooses to show it:

> **Activities are here.**
> Your Circle is ready. Plan your next Activity to bring everyone together.

Hebrew draft:

> **הפעילויות כאן.**
> המעגל שלכם מוכן. תכננו את הפעילות הבאה כדי להפגיש את כולם.

---

## Local development (unchanged)

```powershell
# Terminal 1 — API
cd backend
.\.venv\Scripts\Activate.ps1
# backend/.env must contain an explicit JWT_SECRET. To use the local X-User-Id
# shortcut, also set ENVIRONMENT=development and ALLOW_DEV_USER_HEADER=true.
uvicorn app.main:app --port 8001 --reload --reload-dir app

# Terminal 2 — Web (uses localhost:8001 when VITE_API_BASE_URL is unset)
cd web
# Set VITE_ALLOW_DEV_USER_HEADER=true only when the backend flag is enabled and
# the generated development user ID already exists in the local users table.
npm run dev
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS error in browser | Add exact Vercel origin to `ALLOWED_ORIGINS` on Render; redeploy API |
| API 500 / DB errors | Check `DATABASE_URL`, `DATABASE_SSL=require`, migrations applied on Supabase |
| Blank page on refresh | Ensure `web/vercel.json` rewrites are deployed (SPA) |
| Google login fails | Add production Vercel URL to OAuth authorized origins |
