export type PlaceSuggestPayload = {
  city: string;
  name: string;
  address: string;
  mapsUrl?: string | null;
  hobyRelation?: string;
};

const PLACE_SUGGEST_PREFIX = "[PLACE_SUGGEST]";

export function buildPlaceSuggestMessage(payload: PlaceSuggestPayload): string {
  return PLACE_SUGGEST_PREFIX + JSON.stringify(payload);
}

export function parsePlaceSuggestMessage(
  body: string,
): (PlaceSuggestPayload & { headline: string }) | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith(PLACE_SUGGEST_PREFIX)) return null;
  const raw = trimmed.slice(PLACE_SUGGEST_PREFIX.length);
  try {
    const data = JSON.parse(raw) as PlaceSuggestPayload;
    if (!data?.name?.trim()) return null;
    const city = (data.city ?? "").trim();
    const headline = city ? `${data.name.trim()} · ${city}` : data.name.trim();
    return {
      city,
      name: data.name.trim(),
      address: (data.address ?? "").trim(),
      mapsUrl: data.mapsUrl ?? null,
      hobyRelation: data.hobyRelation?.trim() || undefined,
      headline,
    };
  } catch {
    return null;
  }
}
