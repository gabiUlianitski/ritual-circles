import type { VenueSuggestionItem } from "./api/types";
import { isGenericPlaceName, placeNameFromMapsUrl } from "./parseCustomPlaceInput";

export type VenueCardView = {
  displayName: string;
  category: string | null;
  distanceLabel: string | null;
  hint: string | null;
  lat: number | null;
  lon: number | null;
};

const GENERIC = new Set([
  "coffee shop",
  "cafe",
  "café",
  "park",
  "restaurant",
  "bar",
  "tennis court",
  "tennis courts",
  "library",
  "community centre",
  "community center",
]);

function titleCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function streetHint(address: string): string {
  const first = address.split(",")[0]?.trim() ?? "";
  if (!first) return "";
  const parts = first.split(/\s+/);
  if (parts.length >= 2 && /^\d+$/.test(parts[0] ?? "")) {
    return parts.slice(1).join(" ");
  }
  return first;
}

function normalizeName(name: string, address: string): string {
  const raw = name.trim() || "Place";
  const key = raw.toLowerCase();
  if (!GENERIC.has(key)) return raw;
  const street = streetHint(address);
  if (street && street.toLowerCase() !== key) return `${titleCase(raw)} – ${street}`;
  return titleCase(raw);
}

function parseDistanceLabel(hobyRelation: string | undefined): string | null {
  if (!hobyRelation?.trim()) return null;
  const km = hobyRelation.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (km) return `${Number.parseFloat(km[1]).toFixed(km[1].includes(".") ? 1 : 0)} km`;
  if (/very close|nearby/i.test(hobyRelation)) return "Nearby";
  return null;
}

function guessCategory(name: string, hobyRelation?: string): string | null {
  const blob = `${name} ${hobyRelation ?? ""}`.toLowerCase();
  if (blob.includes("tennis")) return "Tennis court";
  if (blob.includes("coffee") || blob.includes("cafe") || blob.includes("café")) return "Cafe";
  if (blob.includes("park")) return "Park";
  if (blob.includes("library")) return "Library";
  if (blob.includes("bike") || blob.includes("cycle")) return "Bike path";
  return null;
}

function hintForCategory(category: string | null): string | null {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c === "cafe" || c === "library" || c.includes("community")) return "Good for small groups";
  if (c === "park") return "Easy to spot each other";
  if (c.includes("tennis")) return "Check court booking if needed";
  return null;
}

export function venueCardFromItem(v: VenueSuggestionItem): VenueCardView {
  const displayName = v.displayName?.trim() || normalizeName(v.name, v.address);
  const category = v.category?.trim() || guessCategory(v.name, v.hobyRelation);
  return {
    displayName,
    category,
    distanceLabel: v.distanceLabel?.trim() || parseDistanceLabel(v.hobyRelation),
    hint: v.hint?.trim() || hintForCategory(category),
    lat: v.lat ?? null,
    lon: v.lon ?? null,
  };
}

export function venuePlaceIcon(category: string | null, name: string): string {
  const blob = `${category ?? ""} ${name}`.toLowerCase();
  if (blob.includes("tennis") || blob.includes("court") || blob.includes("טניס")) return "🎾";
  if (blob.includes("coffee") || blob.includes("cafe") || blob.includes("café")) return "☕";
  if (blob.includes("bike") || blob.includes("cycle") || blob.includes("bicycle")) return "🚴";
  if (blob.includes("park")) return "🌳";
  if (blob.includes("library")) return "📚";
  if (blob.includes("danc")) return "💃";
  if (blob.includes("chess")) return "♟️";
  return "📍";
}

export function meetingPlaceValue(v: VenueSuggestionItem): string {
  return [v.name.trim(), v.address?.trim()].filter(Boolean).join(" — ");
}

export function splitMeetingPlace(stored: string): { name: string; address: string } {
  const t = stored.trim();
  if (!t) return { name: "", address: "" };
  const sep = " — ";
  if (t.includes(sep)) {
    const i = t.indexOf(sep);
    return { name: t.slice(0, i).trim(), address: t.slice(i + sep.length).trim() };
  }
  return { name: t, address: "" };
}

function dedupeAddressParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function isAdminAddressPart(part: string): boolean {
  const t = part.trim();
  if (!t) return true;
  if (/^\d{5,7}$/.test(t)) return true;
  return /district|subdistrict|region|county|israel|ישראל|מחוז|נפת|state|country|מדינה|central|center/i.test(
    t,
  );
}

/** Trim verbose geocoder strings to street + city (drops POI name when known). */
export function compactAddressLabel(address: string | undefined | null, placeName?: string): string {
  let parts = dedupeAddressParts(
    (address ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => !isAdminAddressPart(p)),
  );

  const normalizedName = placeName?.trim().toLowerCase() ?? "";
  if (normalizedName) {
    if (parts[0]?.toLowerCase() === normalizedName) {
      parts = parts.slice(1);
    }
    parts = parts.filter((p) => p.toLowerCase() !== normalizedName);
  }

  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

function stripLeadingPlaceName(name: string, compactAddress: string): string {
  const parts = compactAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts[0]?.toLowerCase() === name.trim().toLowerCase()) {
    return parts.slice(1).join(", ").trim();
  }
  return compactAddress;
}

function normalizeMeetingPlaceFields(
  meetingPlace: string,
): { placeName: string; addressRaw: string } {
  const { name: rawName, address: rawAddress } = splitMeetingPlace(meetingPlace);
  if (!rawName && !rawAddress) return { placeName: "", addressRaw: "" };

  let placeName = rawName;
  let addressRaw = rawAddress;

  if (isGenericPlaceName(placeName)) {
    const fromUrl = placeNameFromMapsUrl(addressRaw || placeName);
    if (fromUrl) placeName = fromUrl;
  }

  const addressIsUrl = /^https?:\/\//i.test(addressRaw);
  if (addressIsUrl && isGenericPlaceName(placeName)) {
    const fromUrl = placeNameFromMapsUrl(addressRaw);
    return { placeName: fromUrl || "Pinned location", addressRaw: "" };
  }

  if (addressIsUrl && placeName && !isGenericPlaceName(placeName)) {
    addressRaw = "";
  } else if (addressIsUrl) {
    const fromUrl = placeNameFromMapsUrl(addressRaw);
    if (fromUrl) {
      placeName = fromUrl;
      addressRaw = "";
    }
  }

  return { placeName: placeName.trim(), addressRaw: addressRaw.trim() };
}

/** Two-line review: place name + short address (never joined — safe for Hebrew/RTL). */
export function meetingPlaceReviewParts(meetingPlace: string): {
  placeName: string;
  addressLine: string | null;
} {
  const { placeName, addressRaw } = normalizeMeetingPlaceFields(meetingPlace);
  const addressLine = compactAddressLabel(addressRaw, placeName);
  const cleanedAddress = stripLeadingPlaceName(placeName, addressLine);

  if (!placeName) {
    return { placeName: cleanedAddress || addressLine, addressLine: null };
  }
  if (!cleanedAddress || cleanedAddress.toLowerCase() === placeName.toLowerCase()) {
    return { placeName, addressLine: null };
  }
  return { placeName, addressLine: cleanedAddress };
}

export function formatMeetingPlaceReview(meetingPlace: string): string {
  const { placeName, addressLine } = meetingPlaceReviewParts(meetingPlace);
  if (!placeName) return "";
  if (!addressLine) return placeName;
  return `${placeName}\n${addressLine}`;
}

/** One-line location for Discover circle cards: place name + city (no districts/country). */
const STREET_HINT_RE =
  /\b(street|st\.?|str\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|רחוב|שדרות)\b/i;

function titleCasePlace(s: string): string {
  const t = s.trim();
  if (!t || t !== t.toLowerCase()) return t;
  return t.replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function clampLocationLine(s: string, maxLen = 72): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

function formatPlaceCityLine(placeName: string, city: string, compact: string): string {
  const place = titleCasePlace(placeName);
  const cityClean = city.trim();
  if (!place && cityClean) return clampLocationLine(cityClean);
  if (place && !cityClean) return clampLocationLine(place);
  if (place.toLowerCase() === cityClean.toLowerCase()) return clampLocationLine(place);

  const compactParts = compact
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  let street: string | null = null;
  if (compactParts.length >= 2) {
    const detail = compactParts.slice(0, -1).join(", ");
    if (
      detail &&
      detail.toLowerCase() !== place.toLowerCase() &&
      STREET_HINT_RE.test(detail)
    ) {
      street = detail;
    }
  }

  if (street) return clampLocationLine(`${place}, ${cityClean} (${street})`);
  return clampLocationLine(`${place}, ${cityClean}`);
}

export function formatDiscoverCardLocation(opts: {
  meetingPlace?: string | null;
  cityName?: string | null;
  city?: string | null;
  countryCode?: string | null;
}): string {
  const mp = opts.meetingPlace?.trim() ?? "";
  const cityHint = opts.cityName?.trim() || opts.city?.trim() || "";

  if (mp && /^https?:\/\//i.test(mp)) return "Online";

  if (mp) {
    let { name, address } = splitMeetingPlace(mp);
    if (!address && name.includes(",")) {
      const parts = name
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      name = parts[0] ?? "";
      address = parts.slice(1).join(", ");
    }

    const placeName = name.trim();
    const compact = compactAddressLabel(address, placeName);

    let city = cityHint && !cityHint.includes(",") ? cityHint : "";
    if (!city && compact) {
      const cp = compact
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      city = cp[cp.length - 1] ?? compact;
    }
    if (!city && address) {
      const ap = dedupeAddressParts(
        address
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .filter((p) => !isAdminAddressPart(p)),
      );
      city = pickCityFromParts(ap, cityHint) || ap[ap.length - 1] || "";
    }
    if (!city) city = shortLocationLabel(address || mp);

    if (placeName && city && placeName.toLowerCase() !== city.toLowerCase()) {
      return formatPlaceCityLine(placeName, city, compact);
    }
    if (placeName) return clampLocationLine(titleCasePlace(placeName));
    if (compact) return clampLocationLine(compact);
  }

  if (cityHint) {
    if (cityHint.includes(",")) {
      const parts = dedupeAddressParts(
        cityHint
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .filter((p) => !isAdminAddressPart(p)),
      );
      if (parts.length >= 2) {
        const place = parts[0];
        const city = pickCityFromParts(parts.slice(1), "") || parts[parts.length - 1];
        if (place.toLowerCase() !== city.toLowerCase()) {
          return formatPlaceCityLine(place, city, compactAddressLabel(cityHint, place));
        }
        return clampLocationLine(city);
      }
      return clampLocationLine(compactAddressLabel(cityHint) || parts[0] || cityHint);
    }
    return clampLocationLine(cityHint);
  }

  return "Location TBD";
}

export function venueSelectionKey(v: VenueSuggestionItem, index: number): string {
  return `${v.mapsUrl ?? v.name}-${index}`;
}

export function buildOsmMapEmbedUrl(
  center: { lat: number; lon: number } | null,
  pins: { lat: number; lon: number }[],
  highlightPin?: { lat: number; lon: number } | null,
): string | null {
  const points = pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (
    highlightPin &&
    Number.isFinite(highlightPin.lat) &&
    Number.isFinite(highlightPin.lon)
  ) {
    const pad = 0.006;
    const { lat, lon } = highlightPin;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - pad}%2C${lat - pad}%2C${lon + pad}%2C${lat + pad}&layer=mapnik&marker=${lat}%2C${lon}`;
  }

  const all = center ? [...points, center] : points;
  if (!all.length) return null;
  const lats = all.map((p) => p.lat);
  const lons = all.map((p) => p.lon);
  const pad = 0.018;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLon = Math.min(...lons) - pad;
  const maxLon = Math.max(...lons) + pad;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik`;
}

export function formatVenueAddress(address: string | undefined | null): string {
  return address?.trim() ?? "";
}

function buildStreetSegment(parts: string[]): string {
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const second = parts[1];
  if (/^\d+[a-zA-Z]?$/.test(first) && second && !/^\d+[a-zA-Z]?$/.test(second)) {
    return `${second} ${first}`;
  }
  if (/^\d+[a-zA-Z]?$/.test(second) && !/^\d+[a-zA-Z]?$/.test(first)) {
    return `${first} ${second}`;
  }
  return first;
}

const KNOWN_MUNICIPALITIES = new Set(
  [
    "tel aviv",
    "tel aviv-yafo",
    "tel aviv yafo",
    "holon",
    "bat yam",
    "בת ים",
    "ramat gan",
    "ramat-gan",
    "or yehuda",
    "אור יהודה",
    "rishon lezion",
    "ראשון לציון",
    "savyon",
    "סביון",
    "yehud",
    "יהוד",
    "yehud-monosson",
    "יהוד-מונוסון",
    "yehud monosson",
    "petah tikva",
    "bnei brak",
    "givatayim",
    "lod",
    "ramla",
    "beer yaakov",
    "be'er yaakov",
    "be er yaakov",
  ].map((s) => s.toLowerCase()),
);

function isKnownMunicipality(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (KNOWN_MUNICIPALITIES.has(t)) return true;
  return KNOWN_MUNICIPALITIES.has(t.replace(/\s+/g, " "));
}

function isLikelyNeighborhood(label: string): boolean {
  const t = label.trim();
  if (!t || isKnownMunicipality(t)) return false;
  if (/^tel aviv/i.test(t)) return false;
  if (/\d/.test(t) && !isKnownMunicipality(t)) return false;

  return (
    /^(neve|schunat|shchunat|emek ha|geha|tel hashomer|bar ilan)/i.test(t) ||
    (/^ramat/i.test(t) && !/^ramat gan/i.test(t)) ||
    /rasko alef|rasko bet|שכונ|שכונה/i.test(t)
  );
}

function isMostlyHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/** Drop duplicate segments (e.g. בת ים + Bat Yam). */
function dedupeEquivalentLocalityParts(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const key = part.trim().toLowerCase();
    const duplicate = out.some((existing) => {
      const ek = existing.trim().toLowerCase();
      if (ek === key) return true;
      const heb = isMostlyHebrew(existing);
      const hebPart = isMostlyHebrew(part);
      return heb !== hebPart && (ek.includes(key) || key.includes(ek));
    });
    if (!duplicate) out.push(part);
  }
  return out;
}

function isLikelyStreetPart(part: string): boolean {
  const t = part.trim();
  if (!t || isKnownMunicipality(t)) return false;
  return /\d/.test(t);
}

function pickCityFromParts(parts: string[], searchCity: string): string {
  const searchLower = searchCity.trim().toLowerCase();
  const known: string[] = [];
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (isKnownMunicipality(parts[i])) known.push(parts[i]);
  }
  if (known.length === 1) return known[0];
  if (known.length >= 2) {
    const notSearch = known.filter((c) => c.trim().toLowerCase() !== searchLower);
    if (notSearch.length) return notSearch[notSearch.length - 1];
    return known[0];
  }
  if (searchCity.trim()) return searchCity.trim();
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (!isLikelyStreetPart(parts[i])) return parts[i];
  }
  return "";
}

/** Street / area + city for suggested venue cards. */
export function venueCardAddressLabel(
  address: string | undefined | null,
  placeName?: string,
  searchCity?: string,
): string {
  let parts = dedupeAddressParts(
    (address ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => !isAdminAddressPart(p)),
  );

  const normalizedName = placeName?.trim().toLowerCase() ?? "";
  if (normalizedName) {
    if (parts[0]?.toLowerCase() === normalizedName) {
      parts = parts.slice(1);
    }
    parts = parts.filter((p) => p.toLowerCase() !== normalizedName);
  }

  parts = dedupeEquivalentLocalityParts(parts);

  const search = searchCity?.trim() ?? "";
  if (!parts.length) return search;

  const city = pickCityFromParts(parts, search);
  const cityLower = city.trim().toLowerCase();

  const detailParts = parts.filter((p) => {
    const pl = p.trim().toLowerCase();
    if (pl === cityLower) return false;
    if (isKnownMunicipality(p)) return false;
    return true;
  });

  const detail = detailParts.slice(-2).join(", ").trim();

  if (!detail) return city;
  if (city && !detail.toLowerCase().includes(cityLower)) {
    return `${detail}, ${city}`;
  }
  return detail;
}

/** City / locality only — no full street address on cards. */
export function shortLocationLabel(address: string | undefined | null): string {
  const parts = (address ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  const skip = /district|subdistrict|region|county|israel|ישראל|מחוז|נפת|state|country/i;
  for (let i = 1; i < Math.min(parts.length, 5); i++) {
    const p = parts[i];
    if (p.length <= 40 && !skip.test(p)) return p;
  }
  return parts[1] ?? parts[0];
}
