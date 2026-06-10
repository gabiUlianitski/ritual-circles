import { api } from "./api/client";
import type { VenueSuggestionsResponse } from "./api/types";

export const VENUE_SUGGEST_TIMEOUT_MS = 120_000;

export function venueSearchAddress(
  citySelected: string,
  cityQuery: string,
  countryName: string,
): string {
  const picked = citySelected.trim();
  if (picked) return picked;
  const cq = cityQuery.trim();
  if (cq.length >= 2 && countryName.trim()) return `${cq}, ${countryName.trim()}`;
  return "";
}

export async function findVenueSuggestionsForHobby(
  params: {
    address: string;
    ritualType: string;
    ritualSubtype?: string | null;
    ritualLevel?: string | number | null;
  },
  options?: { signal?: AbortSignal },
): Promise<VenueSuggestionsResponse> {
  return api.venueSuggestions(
    {
      address: params.address.trim(),
      ritualType: params.ritualType.trim(),
      ritualSubtype: params.ritualSubtype?.trim() || null,
      ritualLevel: params.ritualLevel ?? null,
    },
    options,
  );
}

export function venueSuggestErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return "Search took too long. Wait a minute and try again, or add your meeting place manually below.";
  }
  const text = String(error);
  if (text.includes("503") || text.toLowerCase().includes("longer than usual")) {
    return "Place search is slow right now. Try again in a minute, or paste a Google Maps link / add a place manually below.";
  }
  return text;
}
