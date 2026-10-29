import { API_BASE_URL } from "./config";
import { getAppLanguageCode } from "../i18n";
import { localizeHobies } from "../hobyI18n/localizeHoby";
import { getOrCreateDevUserId } from "./devUserId";
import type {
  AuthConfigResponse,
  GoogleAuthResponse,
  ActivityCreatePayload,
  Activity,
  ActivityDefaults,
  ActivityNotification,
  ActivityParticipation,
  ActivityUpdatePayload,
  CircleCreateRequest,
  CircleInvitation,
  CircleInvitationPreview,
  SharedCircleLink,
  CircleListItem,
  CircleMeResponse,
  CirclePatchRequest,
  CircleResponse,
  CountryItem,
  CitySuggestItem,
  PlaceSuggestion,
  LanguageItem,
  Hoby,
  HobyBulkResponse,
  HobyCreateRequest,
  HobyPrecheckResponse,
  HobyRegeneratePreview,
  HobyRegenField,
  HobySpellSuggestResponse,
  HobyUpdateRequest,
  InvitationCandidate,
  ForYouIntro,
  HomeResponse,
  JoinCircleResponse,
  ReverseLocateResponse,
  MapsLinkResolveResponse,
  CircleMessage,
  CircleMessageCreateRequest,
  UserMeResponse,
  UserUpdateRequest,
  VenueSuggestionsResponse,
  CommunityPreviewResponse,
  DiscoveryResponse,
  DailyInsightResponse,
  DailyLibraryInsight,
  GenerateInsightLibraryResponse,
  InsightLibrarySummary,
} from "./types";

const TOKEN_KEY = "auth_token";
const ALLOW_DEV_USER_HEADER =
  String(import.meta.env.VITE_ALLOW_DEV_USER_HEADER ?? "").trim().toLowerCase() === "true";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  fetchOptions?: { signal?: AbortSignal },
): Promise<T> {
  const token = getAuthToken();
  const userId = ALLOW_DEV_USER_HEADER ? getOrCreateDevUserId() : null;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal: fetchOptions?.signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": getAppLanguageCode(),
      ...(body !== undefined && body !== null
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "text/plain" }),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : userId
          ? { "X-User-Id": userId }
          : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Stale JWT (e.g. after JWT_SECRET change): drop token so app can fall back to login.
    if (res.status === 401 && token) {
      setAuthToken(null);
    }
    let message = `${res.status} ${text}`;
    try {
      const j = JSON.parse(text) as { detail?: string | { msg?: string }[] };
      if (typeof j.detail === "string") {
        if (
          res.status === 409 &&
          typeof j.detail === "string" &&
          j.detail.toLowerCase().includes("email") &&
          j.detail.toLowerCase().includes("registered")
        ) {
          message =
            "An account with this email already exists. Use “Login” with this email and password, or choose a different email to create a new account.";
        } else {
          message = `${res.status}: ${j.detail}`;
        }
      } else if (Array.isArray(j.detail))
        message = `${res.status}: ${j.detail.map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : String(x))).join("; ")}`;
    } catch {
      /* keep message */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  register: (payload: {
    email: string;
    password: string;
    user_name?: string;
    first_name: string;
    last_name: string;
    city?: string | null;
    availability_day: string;
    availability_time: string;
  }) => request<{ token: string }>("POST", "/auth/start", payload),
  login: (payload: { email: string; password: string }) => request<{ token: string }>("POST", "/auth/verify", payload),
  getAuthConfig: () => request<AuthConfigResponse>("GET", "/auth/config"),
  googleAuth: (payload: { accessToken: string }) => request<GoogleAuthResponse>("POST", "/auth/google", payload),
  googleAuthComplete: (payload: {
    registrationToken: string;
    user_name?: string;
    first_name: string;
    last_name?: string | null;
    city?: string | null;
    availability_day?: string;
    availability_time?: string;
  }) => request<{ token: string }>("POST", "/auth/google/complete", payload),

  getHome: () => request<HomeResponse>("GET", "/home"),

  getMe: () => request<UserMeResponse>("GET", "/me"),
  patchMe: (payload: UserUpdateRequest) => request<UserMeResponse>("PATCH", "/me", payload),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>("POST", "/me/password", payload),
  deleteMe: () => request<void>("DELETE", "/me"),

  listCircles: () => request<CircleListItem[]>("GET", "/circles"),
  venueSuggestions: (
    payload: {
      address: string;
      ritualType: string;
      ritualSubtype?: string | null;
      ritualLevel?: string | number | null;
      countryCode?: string | null;
    },
    fetchOptions?: { signal?: AbortSignal },
  ) => request<VenueSuggestionsResponse>("POST", "/circles/venue-suggestions", payload, fetchOptions),
  createCircle: (payload: CircleCreateRequest) => request<CircleResponse>("POST", "/circles", payload),
  patchCircle: (circleId: string, payload: CirclePatchRequest) =>
    request<CircleResponse>("PATCH", `/circles/${encodeURIComponent(circleId)}`, payload),
  searchInvitationCandidates: (circleId: string, q: string, sameCity: boolean) =>
    request<InvitationCandidate[]>(
      "GET",
      `/circles/${encodeURIComponent(circleId)}/invitation-candidates?q=${encodeURIComponent(q)}&sameCity=${sameCity ? "true" : "false"}`,
    ),
  listCircleInvitations: (circleId: string) =>
    request<CircleInvitation[]>(
      "GET",
      `/circles/${encodeURIComponent(circleId)}/invitations`,
    ),
  createCircleInvitation: (circleId: string, inviteeUserId: string) =>
    request<CircleInvitation>("POST", `/circles/${encodeURIComponent(circleId)}/invitations`, {
      inviteeUserId,
    }),
  cancelCircleInvitation: (circleId: string, invitationId: string) =>
    request<CircleInvitation>(
      "POST",
      `/circles/${encodeURIComponent(circleId)}/invitations/${encodeURIComponent(invitationId)}/cancel`,
    ),
  openSharedCircleLink: (circleId: string) =>
    request<SharedCircleLink>("POST", `/circles/${encodeURIComponent(circleId)}/shared-link`),
  listMyInvitations: () => request<CircleInvitation[]>("GET", "/me/invitations"),
  listActivityNotifications: () => request<ActivityNotification[]>("GET", "/me/activity-notifications"),
  getInvitationPreview: (invitationId: string) =>
    request<CircleInvitationPreview>("GET", `/me/invitations/${encodeURIComponent(invitationId)}`),
  acceptInvitation: (invitationId: string) =>
    request<CircleInvitation>("POST", `/me/invitations/${encodeURIComponent(invitationId)}/accept`),
  declineInvitation: (invitationId: string) =>
    request<CircleInvitation>("POST", `/me/invitations/${encodeURIComponent(invitationId)}/decline`),
  joinCircle: (inviteCode: string) => request<JoinCircleResponse>("POST", `/circles/join/${inviteCode}`),
  joinCircleOpen: (circleId: string) =>
    request<JoinCircleResponse>("POST", "/circles/join-open", { circleId }),
  leaveCircle: (circleId: string) => request<{ ok: boolean }>("POST", "/circles/leave", { circleId }),
  dropCircle: (circleId: string) => request<{ ok: boolean }>("POST", "/circles/drop", { circleId }),
  getMyCircle: (circleId?: string) =>
    request<CircleMeResponse>(
      "GET",
      circleId ? `/circles/me?circleId=${encodeURIComponent(circleId)}` : "/circles/me",
    ),
  getActivityDefaults: (circleId: string) =>
    request<ActivityDefaults>("GET", `/circles/${encodeURIComponent(circleId)}/activity-defaults`),
  listActivities: (circleId: string) =>
    request<Activity[]>("GET", `/circles/${encodeURIComponent(circleId)}/activities`),
  createActivity: (circleId: string, payload: ActivityCreatePayload) =>
    request<Activity>("POST", `/circles/${encodeURIComponent(circleId)}/activities`, payload),
  getActivity: (activityId: string) =>
    request<Activity>("GET", `/activities/${encodeURIComponent(activityId)}`),
  updateActivity: (activityId: string, payload: ActivityUpdatePayload) =>
    request<Activity>("PATCH", `/activities/${encodeURIComponent(activityId)}`, payload),
  cancelActivity: (activityId: string, payload?: { occurrenceId?: string | null; cancellationReason?: string | null }) =>
    request<Activity>("POST", `/activities/${encodeURIComponent(activityId)}/cancel`, payload ?? {}),
  publishActivity: (activityId: string) =>
    request<Activity>("POST", `/activities/${encodeURIComponent(activityId)}/publish`),
  confirmActivity: (activityId: string, occurrenceId?: string | null) =>
    request<Activity>("POST", `/activities/${encodeURIComponent(activityId)}/confirm`, {
      occurrenceId: occurrenceId ?? null,
    }),
  completeActivity: (activityId: string, occurrenceId?: string | null) =>
    request<Activity>("POST", `/activities/${encodeURIComponent(activityId)}/complete`, {
      occurrenceId: occurrenceId ?? null,
    }),
  joinActivity: (activityId: string) =>
    request<ActivityParticipation>("POST", `/activities/${encodeURIComponent(activityId)}/join`),
  leaveActivity: (activityId: string) =>
    request<ActivityParticipation>("POST", `/activities/${encodeURIComponent(activityId)}/leave`),
  joinOccurrence: (activityId: string, occurrenceId: string) =>
    request<Activity>(
      "POST",
      `/activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/join`,
    ),
  leaveOccurrence: (activityId: string, occurrenceId: string) =>
    request<Activity>(
      "POST",
      `/activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/leave`,
    ),
  suggestActivity: (
    activityId: string,
    payload: {
      type: "time" | "location";
      proposedStartAt?: string | null;
      proposedEndAt?: string | null;
      proposedLocationName?: string | null;
      proposedLocationAddress?: string | null;
      note?: string | null;
    },
  ) => request<Activity>("POST", `/activities/${encodeURIComponent(activityId)}/suggestions`, payload),
  suggestOccurrence: (
    activityId: string,
    occurrenceId: string,
    payload: {
      type: "time" | "location";
      proposedStartAt?: string | null;
      proposedEndAt?: string | null;
      proposedLocationName?: string | null;
      proposedLocationAddress?: string | null;
      note?: string | null;
    },
  ) =>
    request<Activity>(
      "POST",
      `/activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/suggestions`,
      payload,
    ),
  supportSuggestion: (suggestionId: string) =>
    request<Activity>("POST", `/activity-suggestions/${encodeURIComponent(suggestionId)}/support`),
  removeSuggestionSupport: (suggestionId: string) =>
    request<Activity>("POST", `/activity-suggestions/${encodeURIComponent(suggestionId)}/support/remove`),
  withdrawSuggestion: (suggestionId: string) =>
    request<Activity>("POST", `/activity-suggestions/${encodeURIComponent(suggestionId)}/withdraw`),
  acceptSuggestion: (suggestionId: string) =>
    request<Activity>("POST", `/activity-suggestions/${encodeURIComponent(suggestionId)}/accept`),
  declineSuggestion: (suggestionId: string) =>
    request<Activity>("POST", `/activity-suggestions/${encodeURIComponent(suggestionId)}/decline`),
  reconfirmActivity: (activityId: string) =>
    request<Activity>("POST", `/activities/${encodeURIComponent(activityId)}/reconfirm`),
  reconfirmOccurrence: (activityId: string, occurrenceId: string) =>
    request<Activity>(
      "POST",
      `/activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/reconfirm`,
    ),
  recordAttendance: (activityId: string, participantId: string, attendanceStatus: "attended" | "no_show") =>
    request<Activity>(
      "POST",
      `/activities/${encodeURIComponent(activityId)}/participants/${encodeURIComponent(participantId)}/attendance`,
      { attendanceStatus },
    ),
  recordDateAttendance: (
    activityId: string,
    occurrenceId: string,
    participantId: string,
    attendanceStatus: "attended" | "no_show",
  ) =>
    request<Activity>(
      "POST",
      `/activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/participants/${encodeURIComponent(participantId)}/attendance`,
      { attendanceStatus },
    ),

  getCircleMessages: (circleId: string, opts?: { limit?: number }) => {
    const lim = opts?.limit ?? 200;
    return request<CircleMessage[]>(
      "GET",
      `/circles/${encodeURIComponent(circleId)}/messages?limit=${encodeURIComponent(String(lim))}`,
    );
  },
  postCircleMessage: (circleId: string, payload: CircleMessageCreateRequest) =>
    request<CircleMessage>("POST", `/circles/${encodeURIComponent(circleId)}/messages`, payload),
  respondToCircleSuggestion: (
    circleId: string,
    messageId: string,
    payload: { action: "accept" | "decline" },
  ) =>
    request<CircleResponse>(
      "POST",
      `/circles/${encodeURIComponent(circleId)}/messages/${encodeURIComponent(messageId)}/suggestion`,
      payload,
    ),

  getHobies: async () =>
    localizeHobies(await request<Hoby[]>("GET", "/hobies"), getAppLanguageCode()),
  /** Catalogue rows people already saved, including incomplete ones. Archived stay out. */
  getHobiesSaved: async () => {
    const list = localizeHobies(
      await request<Hoby[]>("GET", "/hobies?includeIncomplete=1"),
      getAppLanguageCode(),
    );
    return list.filter((hoby) => !hoby.archived);
  },
  /** English source fields for catalogue editing. Skips client-side localization. */
  getHobiesCanonical: () => request<Hoby[]>("GET", "/hobies?canonical=1&includeIncomplete=1"),
  regenerateHoby: (slug: string, payload: { fields: HobyRegenField[]; onlyMissing?: boolean }) =>
    request<HobyRegeneratePreview>("POST", `/hobies/${encodeURIComponent(slug)}/regenerate`, payload),
  hobyUsage: (slug: string) => request<{ circleCount: number }>("GET", `/hobies/${encodeURIComponent(slug)}/usage`),
  deleteHoby: (slug: string) => request<void>("DELETE", `/hobies/${encodeURIComponent(slug)}`),
  archiveHoby: (slug: string) => request<Hoby>("POST", `/hobies/${encodeURIComponent(slug)}/archive`),
  restoreHoby: (slug: string) => request<Hoby>("POST", `/hobies/${encodeURIComponent(slug)}/restore`),
  bulkHobies: (payload: { action: "delete" | "archive" | "regenerate"; slugs: string[] }) =>
    request<HobyBulkResponse>("POST", "/hobies/bulk", payload),
  precheckNewHoby: (payload: { displayName: string }) =>
    request<HobyPrecheckResponse>("POST", "/hobies/precheck", payload),
  getCountries: () => request<CountryItem[]>("GET", "/geo/countries"),
  citySuggest: (
    params: { q: string; country?: string },
    fetchOptions?: { signal?: AbortSignal },
  ) => {
    const sp = new URLSearchParams({ q: params.q });
    if (params.country?.trim()) sp.set("country", params.country.trim());
    return request<CitySuggestItem[]>("GET", `/geo/city-suggest?${sp.toString()}`, undefined, fetchOptions);
  },
  placeSuggest: (
    params: { q: string; city: string; country?: string; limit?: number; lat?: number | null; lon?: number | null },
    fetchOptions?: { signal?: AbortSignal },
  ) => {
    const sp = new URLSearchParams({ q: params.q, city: params.city });
    if (params.country?.trim()) sp.set("country", params.country.trim());
    if (params.limit) sp.set("limit", String(params.limit));
    if (params.lat != null && params.lon != null) {
      sp.set("lat", String(params.lat));
      sp.set("lon", String(params.lon));
    }
    return request<PlaceSuggestion[]>("GET", `/geo/place-suggest?${sp.toString()}`, undefined, fetchOptions);
  },
  languageSuggest: (params: { q: string }) =>
    request<LanguageItem[]>("GET", `/geo/language-suggest?q=${encodeURIComponent(params.q)}`),
  reverseLocate: (params: { lat: number; lon: number }) =>
    request<ReverseLocateResponse>(
      "GET",
      `/geo/reverse-locate?lat=${encodeURIComponent(String(params.lat))}&lon=${encodeURIComponent(String(params.lon))}`,
    ),
  resolveMapsLink: (params: { url: string }) =>
    request<MapsLinkResolveResponse>(
      "GET",
      `/geo/resolve-maps-link?url=${encodeURIComponent(params.url.trim())}`,
    ),
  createHoby: (payload: HobyCreateRequest) => request<Hoby>("POST", "/hobies", payload),
  updateHoby: (slug: string, payload: HobyUpdateRequest) =>
    request<Hoby>("PATCH", `/hobies/${encodeURIComponent(slug)}`, payload),
  spellSuggestHobies: (payload: { slug?: string | null; displayName?: string | null }) =>
    request<HobySpellSuggestResponse>("POST", "/hobies/spell-suggest", payload),

  getCommunityPreview: () => request<CommunityPreviewResponse>("GET", "/community/preview"),
  todaysDiscovery: (payload: { displayName: string; category?: string; lang?: string }) =>
    request<DiscoveryResponse>("POST", "/discoveries/today", payload),
  /** Stored daily insight. The server generates it once per hobby per language per day. */
  dailyInsight: (slug: string) =>
    request<DailyInsightResponse>("GET", `/discoveries/today?slug=${encodeURIComponent(slug)}`),
  generateInsightLibrary: (hobbyId: string) =>
    request<GenerateInsightLibraryResponse>("POST", "/hobby-insights/generate", { hobbyId }),
  insightSummary: () => request<InsightLibrarySummary>("GET", "/hobby-insights/summary"),
  forYouIntro: (day: string) =>
    request<ForYouIntro>("GET", `/me/for-you?day=${encodeURIComponent(day)}`),
  dailyLibraryInsight: (slug: string, day: string) =>
    request<DailyLibraryInsight>(
      "GET",
      `/hobby-insights/daily?slug=${encodeURIComponent(slug)}&day=${encodeURIComponent(day)}`,
    ),
};
