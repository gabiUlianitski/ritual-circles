import type { CircleMessage } from "../api/types";
import { parsePlaceSuggestMessage } from "./circleChatPlaceSuggest";
import { parseTimeSuggestMessage } from "./circleChatTimeSuggest";

/** About-tab chat: plain messages + latest time/place suggestion only (no edit history spam). */
export function filterAboutChatMessages(
  messages: CircleMessage[],
  excludeSuggestionUserId?: string | null,
): CircleMessage[] {
  let latestTimeId: string | null = null;
  let latestPlaceId: string | null = null;

  for (const m of messages) {
    if (excludeSuggestionUserId && m.userId === excludeSuggestionUserId) continue;
    if (parseTimeSuggestMessage(m.body)) latestTimeId = m.id;
    else if (parsePlaceSuggestMessage(m.body)) latestPlaceId = m.id;
  }

  const keepSuggestIds = new Set([latestTimeId, latestPlaceId].filter(Boolean) as string[]);

  return messages.filter((m) => {
    if (excludeSuggestionUserId && m.userId === excludeSuggestionUserId) {
      if (parseTimeSuggestMessage(m.body) || parsePlaceSuggestMessage(m.body)) return false;
    }
    if (parseTimeSuggestMessage(m.body) || parsePlaceSuggestMessage(m.body)) {
      return keepSuggestIds.has(m.id);
    }
    return true;
  });
}
