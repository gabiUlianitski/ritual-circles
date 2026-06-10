import {
  buildFirstSessionIso,
  recurringFromDateAndHour,
  weekdayFromIsoDate,
} from "./createCircleSchedule";
import { parseTimeSuggestMessage } from "./circleChatTimeSuggest";

export type SuggestionAcceptPayload = {
  firstSessionAt: string;
  recurringTime: string;
};

/** Build schedule fields from a time-suggestion chat message body. */
export function suggestionAcceptPayloadFromBody(body: string): SuggestionAcceptPayload | null {
  const parsed = parseTimeSuggestMessage(body);
  if (!parsed) return null;
  const when = parsed.when;
  const meetDate = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
  const meetHour = String(when.getHours());
  return {
    firstSessionAt: buildFirstSessionIso(meetDate, meetHour),
    recurringTime: recurringFromDateAndHour(meetDate, meetHour),
  };
}

export { weekdayFromIsoDate };
