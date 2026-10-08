/** Same rotation as the API, used only when a hobby has no stored library. */

export const LIBRARY_TYPES = ["discovery", "motivation", "social_connection", "interesting_fact"] as const;
export type LibraryInsightType = (typeof LIBRARY_TYPES)[number];

export function stableHash(key: string): number {
  let total = 0;
  for (let i = 0; i < key.length; i++) total = (total + key.charCodeAt(i)) >>> 0;
  return total;
}

export function insightTypeFor(hobbyKey: string, day: string): LibraryInsightType {
  return LIBRARY_TYPES[stableHash(`${hobbyKey}:${day}`) % LIBRARY_TYPES.length];
}

const INSIGHT_KEY: Record<LibraryInsightType, string> = {
  discovery: "homeFeed.insight_discovery",
  motivation: "homeFeed.insight_motivation",
  social_connection: "homeFeed.insight_social",
  interesting_fact: "homeFeed.insight_funFact",
};

export function insightFallbackKey(hobbyKey: string, day: string): string {
  return INSIGHT_KEY[insightTypeFor(hobbyKey, day)];
}
