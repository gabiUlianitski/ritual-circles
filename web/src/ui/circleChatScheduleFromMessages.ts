import type { CircleMessage, CircleNextSessionRoster, CircleResponse } from "../api/types";
import { meetingPlaceReviewParts } from "../venueCardDisplay";
import { parsePlaceSuggestMessage } from "./circleChatPlaceSuggest";
import { parseTimeSuggestMessage } from "./circleChatTimeSuggest";

export type ChatSuggestedWhen = {
  when: Date;
  label: string;
  authorName: string;
  suggestedAt: string;
  /** True when shown from circle/session setup, not a chat suggestion. */
  fromCircle?: boolean;
};

export type ChatSuggestedWhere = {
  name: string;
  city: string;
  address: string;
  mapsUrl: string | null;
  headline: string;
  hobyRelation?: string;
  authorName: string;
  suggestedAt: string;
  fromCircle?: boolean;
};

export type ChatScheduleSnapshot = {
  when: ChatSuggestedWhen | null;
  where: ChatSuggestedWhere | null;
};

/** Latest time/place suggestions from circle chat (newest message wins per type). */
export function latestScheduleFromMessages(messages: CircleMessage[]): ChatScheduleSnapshot {
  let when: ChatSuggestedWhen | null = null;
  let where: ChatSuggestedWhere | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!when) {
      const t = parseTimeSuggestMessage(m.body);
      if (t) {
        when = { when: t.when, label: t.label, authorName: m.authorName, suggestedAt: m.createdAt };
      }
    }
    if (!where) {
      const p = parsePlaceSuggestMessage(m.body);
      if (p) {
        where = {
          name: p.name,
          city: p.city,
          address: p.address,
          mapsUrl: p.mapsUrl ?? null,
          headline: p.headline,
          hobyRelation: p.hobyRelation,
          authorName: m.authorName,
          suggestedAt: m.createdAt,
        };
      }
    }
    if (when && where) break;
  }

  return { when, where };
}

function formatWhenLabel(when: Date): string {
  return when.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function whenFromCircle(
  circle: CircleResponse | null,
  roster: CircleNextSessionRoster | null,
): ChatSuggestedWhen | null {
  if (roster?.dateTime) {
    const when = new Date(roster.dateTime);
    if (!Number.isNaN(when.getTime())) {
      return {
        when,
        label: formatWhenLabel(when),
        authorName: "Your circle",
        suggestedAt: roster.dateTime,
        fromCircle: true,
      };
    }
  }
  const recurring = circle?.recurringTime?.trim();
  if (!recurring) return null;
  const label =
    circle?.isRecurring === false ? `Once · ${recurring}` : `Weekly · ${recurring}`;
  return {
    when: new Date(),
    label,
    authorName: "Your circle",
    suggestedAt: "",
    fromCircle: true,
  };
}

function whereFromCircle(circle: CircleResponse | null): ChatSuggestedWhere | null {
  if (!circle) return null;
  const meetingPlace = circle.meetingPlace?.trim();
  if (meetingPlace) {
    const { placeName, addressLine } = meetingPlaceReviewParts(meetingPlace);
    const city =
      [circle.cityName, circle.countryCode].filter(Boolean).join(", ") ||
      circle.city?.trim() ||
      "";
    return {
      name: placeName || meetingPlace,
      city,
      address: addressLine || "",
      mapsUrl: null,
      headline: placeName || meetingPlace,
      authorName: "Your circle",
      suggestedAt: "",
      fromCircle: true,
    };
  }
  const cityOnly = circle.city?.trim();
  if (cityOnly) {
    return {
      name: cityOnly,
      city: cityOnly,
      address: "",
      mapsUrl: null,
      headline: cityOnly,
      authorName: "Your circle",
      suggestedAt: "",
      fromCircle: true,
    };
  }
  return null;
}

/** Chat suggestions win; otherwise fall back to circle + next session fields. */
export function resolveScheduleForTab(
  messages: CircleMessage[],
  circle: CircleResponse | null,
  roster: CircleNextSessionRoster | null,
): ChatScheduleSnapshot {
  const chat = latestScheduleFromMessages(messages);
  return {
    when: chat.when ?? whenFromCircle(circle, roster),
    where: chat.where ?? whereFromCircle(circle),
  };
}
