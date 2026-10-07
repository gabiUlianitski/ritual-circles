const PENDING_KEY = "ritual_pending_circle_invite";
const INVITE_PATH = /^\/invite\/([0-9a-fA-F-]{36})\/?$/;

export function circleInviteUrl(circleId: string): string {
  return `${window.location.origin}/invite/${circleId}`;
}

/** Remember a /invite/{circleId} link across sign-in. The circle id is the only identifier. */
export function captureCircleInviteFromLocation(): string | null {
  const fromPath = window.location.pathname.match(INVITE_PATH)?.[1] ?? null;
  if (fromPath) {
    try {
      sessionStorage.setItem(PENDING_KEY, fromPath);
    } catch {
      /* storage can be blocked */
    }
    return fromPath;
  }
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearCircleInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage can be blocked */
  }
  if (INVITE_PATH.test(window.location.pathname)) {
    window.history.replaceState({}, "", "/");
  }
}
