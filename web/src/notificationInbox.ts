import { api } from "./api/client";
import type { CircleListItem, CircleMessage } from "./api/types";
import { circleHobyTitle } from "./ui/circleDisplay";
import { parsePlaceSuggestMessage } from "./ui/circleChatPlaceSuggest";
import { parseTimeSuggestMessage } from "./ui/circleChatTimeSuggest";
import { getChatSeenAt, messageTimeMs, sameUserId } from "./chatLastSeen";

export type NotificationKind =
  | "chat"
  | "member_joined"
  | "circle_dropped"
  | "time_suggest"
  | "place_suggest";

export type SuggestionDecision = "pending" | "accepted" | "declined";

export type StoredNotification = {
  id: string;
  kind: NotificationKind;
  read: boolean;
  createdAt: string;
  circleId: string;
  circleName: string;
  authorName?: string;
  body?: string;
  memberCount?: number;
  messageId?: string;
  suggestLabel?: string;
  messageBody?: string;
  decision?: SuggestionDecision;
};

const INBOX_PREFIX = "ritual_notif_inbox_v1:";
const DELETED_PREFIX = "ritual_notif_deleted_v1:";
const MAX_INBOX = 200;

function inboxKey(userId: string): string {
  return `${INBOX_PREFIX}${userId}`;
}

function loadInbox(userId: string): StoredNotification[] {
  try {
    const raw = localStorage.getItem(inboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StoredNotification =>
        typeof x === "object" &&
        x != null &&
        typeof (x as StoredNotification).id === "string" &&
        typeof (x as StoredNotification).kind === "string",
    );
  } catch {
    return [];
  }
}

function saveInbox(userId: string, items: StoredNotification[]) {
  const trimmed = [...items]
    .sort((a, b) => messageTimeMs(b.createdAt) - messageTimeMs(a.createdAt))
    .slice(0, MAX_INBOX);
  try {
    localStorage.setItem(inboxKey(userId), JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

function deletedKey(userId: string): string {
  return `${DELETED_PREFIX}${userId}`;
}

function loadDeletedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(deletedKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveDeletedIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(deletedKey(userId), JSON.stringify([...ids].slice(-500)));
  } catch {
    /* quota */
  }
}

function upsertInbox(userId: string, incoming: StoredNotification) {
  const items = loadInbox(userId);
  const idx = items.findIndex((n) => n.id === incoming.id);
  if (idx >= 0) {
    const prev = items[idx];
    items[idx] = {
      ...incoming,
      read: prev.read || incoming.read,
    };
  } else {
    items.push(incoming);
  }
  saveInbox(userId, items);
}

const MEMBER_SNAPSHOT_PREFIX = "ritual_member_count_v2:";
const CIRCLE_MEMBERSHIP_SNAPSHOT_PREFIX = "ritual_circles_snapshot_v1:";
const CIRCLE_LEFT_SELF_PREFIX = "ritual_circles_left_self_v1:";

function memberKey(userId: string, circleId: string): string {
  return `${MEMBER_SNAPSHOT_PREFIX}${userId}:${circleId}`;
}

function getMemberSnapshot(userId: string, circleId: string): number | null {
  try {
    const raw = localStorage.getItem(memberKey(userId, circleId));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function acknowledgeMemberCount(userId: string | null | undefined, circleId: string, memberCount: number) {
  if (!userId?.trim()) return;
  try {
    localStorage.setItem(memberKey(userId, circleId), String(memberCount));
  } catch {
    /* ignore */
  }
}

function ensureMemberSnapshot(userId: string, circleId: string, memberCount: number) {
  if (getMemberSnapshot(userId, circleId) === null) {
    acknowledgeMemberCount(userId, circleId, memberCount);
  }
}

function memberCircleIds(catalog: CircleListItem[], homeCircleId: string | null | undefined): string[] {
  const ids = new Set<string>();
  for (const c of catalog) {
    if (c.isYours) ids.add(c.id);
  }
  if (homeCircleId) ids.add(homeCircleId);
  return [...ids];
}

function chatNotificationId(messageId: string): string {
  return `chat:${messageId}`;
}

function timeSuggestNotificationId(messageId: string): string {
  return `time-suggest:${messageId}`;
}

function placeSuggestNotificationId(messageId: string): string {
  return `place-suggest:${messageId}`;
}

function formatChatNotificationBody(m: CircleMessage): string {
  const time = parseTimeSuggestMessage(m.body);
  if (time) return `${m.authorName} suggested a meeting time: ${time.label}`;
  const place = parsePlaceSuggestMessage(m.body);
  if (place) return `${m.authorName} suggested a meeting place: ${place.headline}`;
  return `${m.authorName}: ${m.body}`;
}

function memberNotificationId(circleId: string, memberCount: number): string {
  return `member:${circleId}:${memberCount}`;
}

function droppedNotificationId(circleId: string): string {
  return `dropped:${circleId}`;
}

type CircleMembershipSnapshot = { id: string; name: string };

function loadCircleMembershipSnapshot(userId: string): CircleMembershipSnapshot[] {
  try {
    const raw = localStorage.getItem(`${CIRCLE_MEMBERSHIP_SNAPSHOT_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CircleMembershipSnapshot =>
        typeof x === "object" &&
        x != null &&
        typeof (x as CircleMembershipSnapshot).id === "string" &&
        typeof (x as CircleMembershipSnapshot).name === "string",
    );
  } catch {
    return [];
  }
}

function saveCircleMembershipSnapshot(userId: string, items: CircleMembershipSnapshot[]) {
  try {
    localStorage.setItem(`${CIRCLE_MEMBERSHIP_SNAPSHOT_PREFIX}${userId}`, JSON.stringify(items));
  } catch {
    /* quota */
  }
}

function loadLeftSelfCircleIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${CIRCLE_LEFT_SELF_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveLeftSelfCircleIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${CIRCLE_LEFT_SELF_PREFIX}${userId}`, JSON.stringify([...ids]));
  } catch {
    /* quota */
  }
}

/** Call when you leave or delete a circle so sync does not show a false "dropped" alert. */
export function markCircleLeftBySelf(userId: string | null | undefined, circleId: string) {
  if (!userId?.trim() || !circleId.trim()) return;
  const ids = loadLeftSelfCircleIds(userId);
  ids.add(circleId);
  saveLeftSelfCircleIds(userId, ids);
  const snap = loadCircleMembershipSnapshot(userId).filter((c) => c.id !== circleId);
  saveCircleMembershipSnapshot(userId, snap);
}

function syncDroppedCircleNotifications(
  userId: string,
  catalog: CircleListItem[],
  circleIds: string[],
  existingIds: Set<string>,
  deletedIds: Set<string>,
) {
  const leftSelf = loadLeftSelfCircleIds(userId);
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const current: CircleMembershipSnapshot[] = circleIds.map((id) => {
    const c = catalogById.get(id);
    return { id, name: c ? circleHobyTitle(c) : "Your circle" };
  });
  const currentIds = new Set(current.map((c) => c.id));
  const previous = loadCircleMembershipSnapshot(userId);

  for (const p of previous) {
    if (currentIds.has(p.id) || leftSelf.has(p.id)) continue;
    const id = droppedNotificationId(p.id);
    if (existingIds.has(id)) continue;
    if (deletedIds.has(id)) continue;
    upsertInbox(userId, {
      id,
      kind: "circle_dropped",
      read: false,
      createdAt: new Date().toISOString(),
      circleId: p.id,
      circleName: p.name,
      body: "The organizer ended this circle.",
    });
    existingIds.add(id);
  }

  saveCircleMembershipSnapshot(userId, current);
}

function isChatMessageUnread(userId: string, circleId: string, message: CircleMessage): boolean {
  const seen = getChatSeenAt(userId, circleId);
  const seenMs = seen ? messageTimeMs(seen) : null;
  if (seenMs == null) return true;
  return messageTimeMs(message.createdAt) > seenMs;
}

/** Pull new events from the server into the local inbox (does not remove read items). */
export async function syncNotificationInbox(
  userId: string | null,
  homeCircleId?: string | null,
): Promise<void> {
  if (!userId) return;

  const existing = loadInbox(userId);
  const existingIds = new Set(existing.map((n) => n.id));
  const deletedIds = loadDeletedIds(userId);

  const list = await api.listCircles();
  const catalog = Array.isArray(list) ? list : [];
  const circleIds = memberCircleIds(catalog, homeCircleId);
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  syncDroppedCircleNotifications(userId, catalog, circleIds, existingIds, deletedIds);

  await Promise.all(
    circleIds.map(async (circleId) => {
      const c = catalogById.get(circleId);
      const circleName = c ? circleHobyTitle(c) : "Your circle";
      const memberCount = c?.memberCount ?? 0;

      if (c) {
        ensureMemberSnapshot(userId, circleId, memberCount);
        const snapshot = getMemberSnapshot(userId, circleId);
        if (snapshot != null && memberCount > snapshot) {
          const id = memberNotificationId(circleId, memberCount);
          if (!existingIds.has(id) && !deletedIds.has(id)) {
            upsertInbox(userId, {
              id,
              kind: "member_joined",
              read: false,
              createdAt: new Date().toISOString(),
              circleId,
              circleName,
              memberCount,
            });
            existingIds.add(id);
          }
        }
      }

      try {
        const messages = await api.getCircleMessages(circleId);
        const arr = Array.isArray(messages) ? messages : [];
        for (const m of arr) {
          if (sameUserId(m.userId, userId)) continue;
          const timeSuggest = parseTimeSuggestMessage(m.body);
          const placeSuggest = !timeSuggest ? parsePlaceSuggestMessage(m.body) : null;

          if (timeSuggest || placeSuggest) {
            const isCreator = Boolean(c?.isCreator);
            if (isCreator) {
              const id = timeSuggest
                ? timeSuggestNotificationId(m.id)
                : placeSuggestNotificationId(m.id);
              if (existingIds.has(id) || deletedIds.has(id)) continue;
              const prev = loadInbox(userId).find((n) => n.id === id);
              const unread = isChatMessageUnread(userId, circleId, m);
              upsertInbox(userId, {
                id,
                kind: timeSuggest ? "time_suggest" : "place_suggest",
                read: prev?.decision && prev.decision !== "pending" ? true : !unread,
                createdAt: m.createdAt,
                circleId,
                circleName,
                authorName: m.authorName,
                messageId: m.id,
                messageBody: m.body,
                suggestLabel: timeSuggest?.label ?? placeSuggest?.headline,
                decision: prev?.decision ?? "pending",
              });
              existingIds.add(id);
            } else {
              const id = chatNotificationId(m.id);
              if (existingIds.has(id) || deletedIds.has(id)) continue;
              const unread = isChatMessageUnread(userId, circleId, m);
              upsertInbox(userId, {
                id,
                kind: "chat",
                read: !unread,
                createdAt: m.createdAt,
                circleId,
                circleName,
                authorName: m.authorName,
                body: formatChatNotificationBody(m),
                messageId: m.id,
              });
              existingIds.add(id);
            }
            continue;
          }

          const id = chatNotificationId(m.id);
          if (existingIds.has(id) || deletedIds.has(id)) continue;
          const unread = isChatMessageUnread(userId, circleId, m);
          upsertInbox(userId, {
            id,
            kind: "chat",
            read: !unread,
            createdAt: m.createdAt,
            circleId,
            circleName,
            authorName: m.authorName,
            body: formatChatNotificationBody(m),
            messageId: m.id,
          });
          existingIds.add(id);
        }
      } catch {
        /* not a member or chat unavailable */
      }
    }),
  );
}

export function listNotificationInbox(userId: string | null): StoredNotification[] {
  if (!userId) return [];
  return loadInbox(userId).sort((a, b) => messageTimeMs(b.createdAt) - messageTimeMs(a.createdAt));
}

export function markNotificationRead(userId: string | null, notificationId: string) {
  if (!userId) return;
  const items = loadInbox(userId);
  const idx = items.findIndex((n) => n.id === notificationId);
  if (idx < 0) return;
  items[idx] = { ...items[idx], read: true };
  saveInbox(userId, items);
}

export function markSuggestionDecision(
  userId: string | null,
  notificationId: string,
  decision: SuggestionDecision,
) {
  if (!userId) return;
  const items = loadInbox(userId);
  const idx = items.findIndex((n) => n.id === notificationId);
  if (idx < 0) return;
  items[idx] = { ...items[idx], decision, read: true };
  saveInbox(userId, items);
}

export function deleteNotification(userId: string | null, notificationId: string) {
  if (!userId) return;
  const items = loadInbox(userId).filter((n) => n.id !== notificationId);
  saveInbox(userId, items);
  const deleted = loadDeletedIds(userId);
  deleted.add(notificationId);
  saveDeletedIds(userId, deleted);
}

export function markCircleChatNotificationsRead(userId: string | null, circleId: string) {
  if (!userId) return;
  const items = loadInbox(userId);
  let changed = false;
  for (let i = 0; i < items.length; i++) {
    if (
      (items[i].kind === "chat" ||
        items[i].kind === "time_suggest" ||
        items[i].kind === "place_suggest") &&
      items[i].circleId === circleId &&
      !items[i].read
    ) {
      items[i] = { ...items[i], read: true };
      changed = true;
    }
  }
  if (changed) saveInbox(userId, items);
}

export function hasUnreadInbox(userId: string | null): boolean {
  if (!userId) return false;
  return loadInbox(userId).some((n) => !n.read);
}

export async function syncAndHasUnread(
  userId: string | null,
  homeCircleId?: string | null,
): Promise<boolean> {
  if (!userId) return false;
  await syncNotificationInbox(userId, homeCircleId);
  return hasUnreadInbox(userId);
}
