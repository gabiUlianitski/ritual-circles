const KEY = "guest_mode";

/** Guest = browsing without an account (read-only, no membership). */
export function isGuestMode(): boolean {
  return localStorage.getItem(KEY) === "1";
}

export function setGuestMode(on: boolean) {
  if (on) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
}
