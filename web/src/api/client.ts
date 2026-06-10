import { API_BASE_URL } from "./config";
import { getOrCreateDevUserId } from "./devUserId";
import type {
  AttendanceResponse,
  AttendanceStatus,
  AuthConfigResponse,
  GoogleAuthResponse,
  CircleCreateRequest,
  CircleListItem,
  CircleMeResponse,
  CirclePatchRequest,
  CircleResponse,
  CountryItem,
  CitySuggestItem,
  LanguageItem,
  Hoby,
  HobyCreateRequest,
  HobyPrecheckResponse,
  HobySpellSuggestResponse,
  HobyUpdateRequest,
  HomeResponse,
  JoinCircleResponse,
  ReverseLocateResponse,
  MapsLinkResolveResponse,
  CircleMessage,
  CircleMessageCreateRequest,
  UserMeResponse,
  UserUpdateRequest,
  VenueSuggestionsResponse,
} from "./types";

const TOKEN_KEY = "auth_token";

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
  const userId = getOrCreateDevUserId();
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal: fetchOptions?.signal,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && body !== null
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "text/plain" }),
      ...(token ? { Authorization: `Bearer ${token}` } : { "X-User-Id": userId }),
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
    user_name: string;
    first_name: string;
    last_name: string;
    city?: string | null;
    availability_day: string;
    availability_time: string;
  }) => request<{ token: string }>("POST", "/auth/start", payload),
  login: (payload: { email: string; password: string }) => request<{ token: string }>("POST", "/auth/verify", payload),
  getAuthConfig: () => request<AuthConfigResponse>("GET", "/auth/config"),
  googleAuth: (payload: { idToken: string }) => request<GoogleAuthResponse>("POST", "/auth/google", payload),
  googleAuthComplete: (payload: {
    registrationToken: string;
    user_name: string;
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

  listCircles: () => request<CircleListItem[]>("GET", "/circles"),
  venueSuggestions: (
    payload: {
      address: string;
      ritualType: string;
      ritualSubtype?: string | null;
      ritualLevel?: string | number | null;
    },
    fetchOptions?: { signal?: AbortSignal },
  ) => request<VenueSuggestionsResponse>("POST", "/circles/venue-suggestions", payload, fetchOptions),
  createCircle: (payload: CircleCreateRequest) => request<CircleResponse>("POST", "/circles", payload),
  patchCircle: (circleId: string, payload: CirclePatchRequest) =>
    request<CircleResponse>("PATCH", `/circles/${encodeURIComponent(circleId)}`, payload),
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
    payload: {
      action: "accept" | "decline";
      firstSessionAt?: string;
      recurringTime?: string;
      isRecurring?: boolean;
    },
  ) =>
    request<CircleResponse>(
      "POST",
      `/circles/${encodeURIComponent(circleId)}/messages/${encodeURIComponent(messageId)}/suggestion`,
      payload,
    ),

  putAttendance: (sessionId: string, status: AttendanceStatus) =>
    request<AttendanceResponse>("PUT", `/sessions/${sessionId}/attendance`, { status }),

  getHobies: () => request<Hoby[]>("GET", "/hobies"),
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
};

