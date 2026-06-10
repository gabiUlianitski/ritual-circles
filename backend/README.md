# Ritual Circles Backend (V1)

Minimal FastAPI skeleton matching the V1 rules.

## Run

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
# Option A (recommended): create backend/.env (see backend/.env.example)
# Option B: PowerShell env var:
#   $env:DATABASE_URL="postgresql://postgres:<PASSWORD>@localhost:5432/Circles"
uvicorn app.main:app --reload --port 8001 --reload-dir app
```

**If the server seems stuck on “Reloading…”**

1. Press **Ctrl+C** once and wait a few seconds.
2. Confirm **PostgreSQL** is running and `DATABASE_URL` in `backend/.env` is correct.
3. Start again (limit reload to `app/` only):

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --port 8001 --reload --reload-dir app
```

You should see `Connecting to database…` then `Database pool ready` then `Application startup complete`.
Without `--reload` is faster while debugging: `uvicorn app.main:app --port 8001`

The mobile-first web client (`web/src/api/config.ts`) expects the API at **http://localhost:8001**. If you use another port, change `API_BASE_URL` in the web app or pass `--port` to match.

