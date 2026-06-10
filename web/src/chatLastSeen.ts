const CHAT_PREFIX = "ritual_chat_seen_v2:";

function chatKey(userId: string | null | undefined, circleId: string): string | null {
  if (!userId?.trim()) return null;
  return `${CHAT_PREFIX}${userId}:${circleId}`;
}

export function messageTimeMs(createdAt: string): number {
  const t = new Date(createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function getChatSeenAt(userId: string | null | undefined, circleId: string): string | null {
  const key = chatKey(userId, circleId);
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setChatSeenAt(userId: string | null | undefined, circleId: string, iso: string) {
  const key = chatKey(userId, circleId);
  if (!key) return;
  try {
    localStorage.setItem(key, iso);
  } catch {
    /* private mode / quota */
  }
}

/** Latest `createdAt` in the list (messages are ordered ascending by server). */
export function latestCreatedAt(messages: readonly { createdAt: string }[]): string | null {
  if (!messages.length) return null;
  let best = messages[0].createdAt;
  for (let i = 1; i < messages.length; i++) {
    const t = messages[i].createdAt;
    if (messageTimeMs(t) > messageTimeMs(best)) best = t;
  }
  return best;
}

export function markChatFullySeen(
  userId: string | null | undefined,
  circleId: string,
  messages: readonly { createdAt: string }[],
) {
  const latest = latestCreatedAt(messages);
  if (latest) setChatSeenAt(userId, circleId, latest);
}

export function sameUserId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
