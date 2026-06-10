# Ritual Circles Web (mobile-first)

Minimal mobile-first web client that mirrors the V1 loop (`GET /home` drives the UI).

## Run locally

```bash
cd web
npm install
npm run dev
```

API defaults to `http://localhost:8001` (see `src/api/config.ts`). Override with `VITE_API_BASE_URL` in `.env`.

## Production build

```bash
npm install
npm run build
```

Output: **`dist/`** (used by Vercel).

## Deploy (Vercel)

See [DEPLOYMENT.md](../DEPLOYMENT.md) at the repo root. Set Vercel **Root Directory** to `web`.

