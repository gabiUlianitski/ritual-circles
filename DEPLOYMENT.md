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
   - Then each file in `db/migrations/` in numeric order (`003` … `025`)

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
   | `JWT_SECRET` | Long random string (32+ chars) |
   | `ALLOWED_ORIGINS` | Your Vercel URL(s), comma-separated, e.g. `https://ritual-circles.vercel.app` |
   | `GOOGLE_OAUTH_CLIENT_ID` | Optional; match `VITE_GOOGLE_CLIENT_ID` |

7. Deploy and copy the service URL (e.g. `https://ritual-circles-api.onrender.com`).
8. Set **`VITE_API_BASE_URL`** on Vercel to that URL and **redeploy** the frontend.

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

## Local development (unchanged)

```powershell
# Terminal 1 — API
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8001 --reload --reload-dir app

# Terminal 2 — Web (uses localhost:8001 when VITE_API_BASE_URL is unset)
cd web
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
