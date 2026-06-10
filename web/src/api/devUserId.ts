const KEY = "dev_user_id";

export function getOrCreateDevUserId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing && /^[0-9a-fA-F-]{36}$/.test(existing)) return existing;
  // Simple UUID v4
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}

