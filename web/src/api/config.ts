// Production: set VITE_API_BASE_URL in Vercel. Local dev defaults to port 8001.
const raw = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = raw ? raw.replace(/\/$/, "") : "http://localhost:8001";

