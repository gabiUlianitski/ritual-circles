export type ManualPlaceSource = "search" | "google_link";

export type ParsedCustomPlace = {
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  mapsUrl: string | null;
  source: ManualPlaceSource;
};

function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " ")).trim();
  } catch {
    return s.replace(/\+/g, " ").trim();
  }
}

const GENERIC_PLACE_NAMES = new Set(
  ["custom place", "pinned location", "selected place", "place", "meeting place"].map((s) =>
    s.toLowerCase(),
  ),
);

export function isGenericPlaceName(name: string): boolean {
  return GENERIC_PLACE_NAMES.has(name.trim().toLowerCase());
}

function parseCoordsPair(q: string): { lat: number; lon: number } | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number.parseFloat(m[1]);
  const lon = Number.parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function isMapsUrl(text: string): boolean {
  return /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text);
}

export function placeNameFromMapsUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const place = u.match(/\/place\/([^/?@]+)/);
  if (place) return decodeSegment(place[1]);
  const search = u.match(/\/maps\/search\/([^/?]+)/);
  if (search) return decodeSegment(search[1]);
  for (const param of ["q", "query"]) {
    const m = u.match(new RegExp(`[?&]${param}=([^&]+)`));
    if (!m) continue;
    const decoded = decodeSegment(m[1]);
    if (decoded && !parseCoordsPair(decoded)) return decoded;
  }
  return null;
}

export function enrichCustomPlace(parsed: ParsedCustomPlace): ParsedCustomPlace {
  if (!isGenericPlaceName(parsed.name)) {
    return parsed;
  }
  const fromUrl = placeNameFromMapsUrl(parsed.mapsUrl ?? parsed.address);
  if (fromUrl) {
    return {
      ...parsed,
      name: fromUrl,
      address: parsed.address && parsed.address !== parsed.mapsUrl ? parsed.address : fromUrl,
    };
  }
  return parsed;
}

function normalizeMapsUrl(raw: string): string {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/\//, "")}`;
}

function parseGoogleMapsUrl(fullUrl: string): ParsedCustomPlace {
  const atMatch = fullUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const preciseMatch = fullUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (atMatch || preciseMatch) {
    const lat = Number.parseFloat((preciseMatch ?? atMatch)![1]);
    const lon = Number.parseFloat((preciseMatch ?? atMatch)![2]);
    const placeMatch = fullUrl.match(/\/place\/([^/@?]+)/);
    const name = placeMatch ? decodeSegment(placeMatch[1]) : "Pinned location";
    return {
      name,
      address: name,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      mapsUrl: fullUrl,
      source: "google_link",
    };
  }

  for (const param of ["q", "query", "ll"]) {
    const m = fullUrl.match(new RegExp(`[?&]${param}=([^&]+)`));
    if (!m) continue;
    const decoded = decodeSegment(m[1]);
    const coords = parseCoordsPair(decoded);
    if (coords) {
      return {
        name: "Pinned location",
        address: `${coords.lat}, ${coords.lon}`,
        lat: coords.lat,
        lon: coords.lon,
        mapsUrl: fullUrl,
        source: "google_link",
      };
    }
    if (decoded) {
      return {
        name: decoded,
        address: decoded,
        lat: null,
        lon: null,
        mapsUrl: fullUrl,
        source: "google_link",
      };
    }
  }

  const placeMatch = fullUrl.match(/\/place\/([^/@?]+)/);
  if (placeMatch) {
    const name = decodeSegment(placeMatch[1]);
    return { name, address: name, lat: null, lon: null, mapsUrl: fullUrl, source: "google_link" };
  }

  const searchMatch = fullUrl.match(/\/maps\/search\/([^/?]+)/);
  if (searchMatch) {
    const name = decodeSegment(searchMatch[1]);
    return { name, address: name, lat: null, lon: null, mapsUrl: fullUrl, source: "google_link" };
  }

  const fromUrl = placeNameFromMapsUrl(fullUrl);
  if (fromUrl) {
    return {
      name: fromUrl,
      address: fromUrl,
      lat: null,
      lon: null,
      mapsUrl: fullUrl,
      source: "google_link",
    };
  }

  return {
    name: "Custom place",
    address: fullUrl,
    lat: null,
    lon: null,
    mapsUrl: fullUrl,
    source: "google_link",
  };
}

export function parseSearchPlace(raw: string): ParsedCustomPlace {
  const t = raw.trim();
  if (!t) {
    throw new Error("Enter a place name.");
  }
  if (isMapsUrl(t) || /^https?:\/\//i.test(t)) {
    throw new Error("Paste Google Maps links in the link field below.");
  }
  return {
    name: t,
    address: t,
    lat: null,
    lon: null,
    mapsUrl: null,
    source: "search",
  };
}

export function parseGoogleMapsLink(raw: string): ParsedCustomPlace {
  const t = raw.trim();
  if (!t) {
    throw new Error("Paste a Google Maps link.");
  }
  if (!isMapsUrl(t) && !/^https?:\/\//i.test(t)) {
    throw new Error("That doesn’t look like a Google Maps link.");
  }
  return enrichCustomPlace(parseGoogleMapsUrl(normalizeMapsUrl(t)));
}

export function needsMapsLinkResolve(parsed: ParsedCustomPlace, raw: string): boolean {
  if (parsed.source !== "google_link") return false;
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(raw.trim())) return true;
  if (isGenericPlaceName(parsed.name)) return true;
  return /^https?:\/\//i.test(parsed.address);
}

export function parsedFromMapsResolve(
  resolved: {
    name: string;
    address: string;
    lat?: number | null;
    lon?: number | null;
    mapsUrl: string;
  },
): ParsedCustomPlace {
  return {
    name: resolved.name.trim(),
    address: resolved.address.trim() || resolved.name.trim(),
    lat: resolved.lat ?? null,
    lon: resolved.lon ?? null,
    mapsUrl: resolved.mapsUrl,
    source: "google_link",
  };
}

/** @deprecated use parseSearchPlace or parseGoogleMapsLink */
export function parseCustomPlaceInput(raw: string): ParsedCustomPlace {
  const t = raw.trim();
  if (!t) {
    throw new Error("Enter a place name or Google Maps link.");
  }
  if (isMapsUrl(t) || /^https?:\/\//i.test(t)) {
    return parseGoogleMapsLink(t);
  }
  return parseSearchPlace(t);
}

export function customPlaceToVenueItem(p: ParsedCustomPlace) {
  const readableAddress =
    p.address?.trim() && !/^https?:\/\//i.test(p.address.trim()) ? p.address.trim() : p.name.trim();
  return {
    name: p.name,
    address: readableAddress || p.name,
    mapsUrl: p.mapsUrl,
    lat: p.lat,
    lon: p.lon,
    hint: p.source === "google_link" ? "From Google Maps" : undefined,
  };
}

export function manualPlaceCardLocation(
  venue: { name: string; address?: string; hint?: string | null; mapsUrl?: string | null },
  citySelected: string,
): string {
  if (!isGenericPlaceName(venue.name)) {
    const fromAddress = shortLocationLabelFromAddress(venue.address);
    if (fromAddress) return fromAddress;
  }
  if (venue.hint?.trim() && isGenericPlaceName(venue.name)) return venue.hint.trim();
  if (venue.mapsUrl && isGenericPlaceName(venue.name)) return "From Google Maps";
  return (
    shortLocationLabelFromAddress(venue.address) ||
    shortLocationLabelFromAddress(citySelected) ||
    "Your place"
  );
}

function shortLocationLabelFromAddress(address: string | undefined | null): string {
  const parts = (address ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) {
    const one = parts[0];
    if (/^https?:\/\//i.test(one)) return "";
    return one;
  }
  const skip = /district|subdistrict|region|county|israel|ישראל|מחוז|נפת|state|country/i;
  for (let i = 1; i < Math.min(parts.length, 5); i++) {
    const p = parts[i];
    if (p.length <= 40 && !skip.test(p)) return p;
  }
  return parts[1] ?? parts[0];
}

export function customPlaceSelectionKey(p: ParsedCustomPlace): string {
  return `custom:${p.source}:${p.mapsUrl ?? p.name}:${p.lat ?? ""}:${p.lon ?? ""}`;
}

export const GOOGLE_MAPS_OPEN_URL = "https://www.google.com/maps";
