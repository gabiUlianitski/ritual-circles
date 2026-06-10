/** @deprecated Use notificationInbox.ts — re-exports for existing imports. */
export {
  acknowledgeMemberCount,
  syncNotificationInbox,
  listNotificationInbox,
  markNotificationRead,
  markSuggestionDecision,
  deleteNotification,
  markCircleChatNotificationsRead,
  hasUnreadInbox,
  syncAndHasUnread,
  type StoredNotification,
  type SuggestionDecision,
} from "./notificationInbox";

import { syncAndHasUnread } from "./notificationInbox";

export async function hasAnyNotifications(
  myUserId: string | null,
  homeCircleId?: string | null,
): Promise<boolean> {
  return syncAndHasUnread(myUserId, homeCircleId);
}
