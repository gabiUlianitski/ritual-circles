export type AuthConfigResponse = {
  googleClientId: string | null;
};

export type GoogleAuthResponse = {
  status: "authenticated" | "needs_profile";
  token?: string | null;
  registrationToken?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type Modality = "online" | "offline";
export type AttendanceStatus = "attending" | "not_attending";

export type HomeCircleItem = {
  circle: CircleResponse;
  nextSession: SessionResponse | null;
  myAttendance: AttendanceResponse | null;
  pendingConfirmation: boolean;
  isCreator?: boolean;
};

export type HomeCalendarSession = {
  session: SessionResponse;
  circleId: string;
  ritualType: string;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  displayTitle?: string | null;
  hasCustomName?: boolean;
  myAttendance: AttendanceResponse | null;
  /** Members who tapped "I'm coming" for this session. */
  attendingCount?: number;
  /** People in the circle (attendance rows for this session). */
  memberCount?: number;
  /** Maximum people allowed in the circle (from group size). */
  maxSize?: number;
};

export type HomeResponse = {
  circle: CircleResponse | null;
  nextSession: SessionResponse | null;
  myAttendance: AttendanceResponse | null;
  myCircles?: HomeCircleItem[];
  calendarSessions?: HomeCalendarSession[];
};

export type UserHobyPreference = {
  slug: string;
  subtype?: string | null;
  /** Catalogue level key — numeric (1, 2) or textual. Used when joining a circle. */
  level?: string | number | null;
  /** Type keys chosen from this hobby. */
  types?: string[] | null;
  /** Internal only. Not shown in Profile. */
  category?: string | null;
  /** beginner | intermediate | advanced | expert. */
  experienceLevel?: string | null;
};

export type UserLanguageItem = {
  code: string;
  name: string;
  preferred?: boolean;
};

export type UserMeResponse = {
  id: string;
  user_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  hometown?: string | null;
  birthDate?: string | null;
  workSummary?: string | null;
  educationSummary?: string | null;
  languages?: UserLanguageItem[];
  availabilityWindows?: string[];
  availability_day: string;
  availability_time: string;
  deviceToken: string | null;
  userHobies: UserHobyPreference[];
  /** @deprecated first entry mirrored from userHobies */
  preferred_hoby_slug?: string | null;
  preferred_hoby_level?: string | number | null;
  preferred_hoby_subtype?: string | null;
  /** ISO timestamp from server */
  createdAt: string | null;
  passwordSet: boolean;
  onboardingCompleted?: boolean;
  avatarUrl?: string | null;
};

export type UserUpdateRequest = Partial<
  Pick<
    UserMeResponse,
    | "first_name"
    | "last_name"
    | "userHobies"
    | "city"
    | "hometown"
    | "birthDate"
    | "workSummary"
    | "educationSummary"
    | "languages"
    | "phone"
    | "availabilityWindows"
    | "availability_day"
    | "availability_time"
    | "onboardingCompleted"
    | "avatarUrl"
  >
>;

export type CircleResponse = {
  id: string;
  ritualType: string;
  modality: Modality;
  recurringTime: string;
  isRecurring?: boolean;
  city: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  meetingPlace?: string | null;
  maxSize: number;
  groupSize?: GroupSizePayload | null;
  costPayment?: CostPaymentPayload | null;
  inviteCode: string;
  inviteOnly?: boolean;
  ritualLevel?: string | number | null;
  ritualSubtype?: string | null;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  description?: string | null;
  name?: string | null;
  displayTitle?: string | null;
  hasCustomName?: boolean;
};

export type MeetingPlacePatch = {
  name: string;
  city: string;
  address?: string;
};

export type CirclePatchRequest = {
  inviteOnly?: boolean;
  groupSize?: GroupSizePayload;
  costPayment?: CostPaymentPayload;
  firstSessionAt?: string;
  recurringTime?: string;
  isRecurring?: boolean;
  meetingPlaceUpdate?: MeetingPlacePatch;
  description?: string | null;
  name?: string | null;
};

export type GroupSizeType = "fixed" | "max" | "min" | "range";

export type GroupSizePayload = {
  type: GroupSizeType;
  min?: number;
  max?: number;
};

export type CostCurrency = "USD" | "EUR" | "ILS";
export type CostPaymentType = "free" | "split" | "per_person";

export type CostPaymentPayload = {
  type: CostPaymentType;
  totalCost?: number;
  pricePerPerson?: number;
  currency: CostCurrency;
  paymentNote?: string;
};

export type CircleCreateRequest = {
  ritualType: string;
  ritualLevel?: string | number | null;
  ritualSubtype?: string | null;
  modality: Modality;
  recurringTime: string;
  isRecurring?: boolean;
  /** @deprecated use meetingPlace — still accepted for older clients */
  city?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  meetingPlace?: string | null;
  description?: string | null;
  name?: string | null;
  inviteOnly?: boolean;
  /** Exact first meeting time (local browser time sent as ISO UTC). */
  firstSessionAt?: string | null;
  groupSize?: GroupSizePayload;
  costPayment?: CostPaymentPayload;
};

export type VenueSuggestionItem = {
  name: string;
  address: string;
  hobyRelation?: string;
  mapsUrl?: string | null;
  displayName?: string | null;
  category?: string | null;
  distanceLabel?: string | null;
  distanceKm?: number | null;
  hint?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type VenueSuggestionsResponse = {
  suggestions: VenueSuggestionItem[];
  geocodedNear?: string | null;
  mapCenter?: { lat: number; lon: number } | null;
};

export type CountryItem = { code: string; name: string };
export type LanguageItem = { code: string; name: string };
export type CitySuggestItem = {
  shortName: string;
  displayName: string;
  lat?: number | null;
  lon?: number | null;
  countryCode?: string | null;
};

/** GET /geo/reverse-locate — browser coords → country + locality hints (Nominatim). */
export type ReverseLocateResponse = {
  countryCode: string;
  cityShortName: string;
  displayName: string;
};

/** GET /geo/resolve-maps-link — Google Maps share link → place label. */
export type MapsLinkResolveResponse = {
  name: string;
  address: string;
  lat?: number | null;
  lon?: number | null;
  mapsUrl: string;
};

export type CommunityStats = {
  members: number;
  activeCircles: number;
  meetupsThisWeek: number;
};

export type CommunityCirclePreview = {
  id: string;
  ritualType: string;
  recurringTime: string;
  city?: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  meetingPlace?: string | null;
  memberCount: number;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  name?: string | null;
  displayTitle?: string | null;
  hasCustomName?: boolean;
  nextSessionAt?: string | null;
};

export type DiscoveryResponse = {
  title: string;
  body: string;
  imagePrompt: string;
};

export type CommunityPreviewResponse = {
  stats: CommunityStats;
  featuredCircles: CommunityCirclePreview[];
};

/** Public catalog entry from GET /circles (no invite code). */
export type CircleListItem = {
  id: string;
  ritualType: string;
  recurringTime: string;
  isRecurring?: boolean;
  city: string | null;
  countryCode?: string | null;
  cityName?: string | null;
  meetingPlace?: string | null;
  maxSize: number;
  memberCount: number;
  isYours: boolean;
  isCreator?: boolean;
  inviteOnly?: boolean;
  ritualLevel?: string | number | null;
  ritualSubtype?: string | null;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  description?: string | null;
  name?: string | null;
  displayTitle?: string | null;
  hasCustomName?: boolean;
  groupSize?: GroupSizePayload | null;
  costPayment?: CostPaymentPayload | null;
  nextSessionAt?: string | null;
  messagesLastWeek?: number;
  messagesToday?: number;
};

export type SessionResponse = {
  id: string;
  circleId: string;
  dateTime: string; // ISO string
  locationOrLink: string;
};

export type AttendanceResponse = {
  userId: string;
  sessionId: string;
  status: AttendanceStatus;
};

export type AttendanceUpsertRequest = {
  status: AttendanceStatus;
};

export type CircleMemberResponse = {
  id: string;
  user_name: string;
  first_name: string;
  last_name: string;
  city?: string | null;
  availabilityWindows?: string[];
  availability_day?: string | null;
  availability_time?: string | null;
  hobby_subtype?: string | null;
  hobby_level?: string | number | null;
  avatarUrl?: string | null;
};
export type CircleMemberAttendanceItem = {
  userId: string;
  user_name: string;
  first_name: string;
  last_name: string;
  status: AttendanceStatus;
};

export type CircleNextSessionRoster = {
  sessionId: string;
  dateTime: string;
  locationOrLink?: string | null;
  members: CircleMemberAttendanceItem[];
};

export type CircleMeResponse = {
  circle: CircleResponse | null;
  members: CircleMemberResponse[];
  nextSessionRoster?: CircleNextSessionRoster | null;
  isCreator?: boolean;
  creatorUserId?: string | null;
};

export type JoinCircleResponse = { circle: CircleResponse };

export type CircleMessage = {
  id: string;
  circleId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type CircleMessageCreateRequest = { body: string };

export type InvitationStatus = "pending" | "accepted" | "declined" | "canceled";

export type InvitationCandidate = {
  id: string;
  displayName: string;
  city?: string | null;
  avatarUrl?: string | null;
  reasonLabel?: string | null;
};

export type SharedCircleLink = {
  circleId: string;
  invitationId?: string | null;
  alreadyMember: boolean;
};

export type CircleInvitation = {
  id: string;
  circleId: string;
  status: InvitationStatus;
  createdAt: string;
  circleTitle: string;
  inviterName: string;
  inviteeId: string;
  inviteeName: string;
};

/** Pending-invitee read. Counts only — no invite code and no member identities. */
export type CircleInvitationPreview = {
  id: string;
  circleId: string;
  status: InvitationStatus;
  inviterName: string;
  title: string;
  name?: string | null;
  hasCustomName?: boolean;
  ritualType: string;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  description?: string | null;
  recurringTime: string;
  isRecurring?: boolean;
  nextSessionAt?: string | null;
  modality: string;
  city?: string | null;
  cityName?: string | null;
  meetingPlace?: string | null;
  memberCount: number;
  maxSize: number;
  matchedHobbyName?: string | null;
};

export type Hoby = {
  id: string;
  slug: string;
  displayName: string;
  shortDescription?: string | null;
  /** English catalogue name, even when displayName is localized. */
  canonicalDisplayName?: string | null;
  canonicalShortDescription?: string | null;
  heDisplayName?: string | null;
  heShortDescription?: string | null;
  icon?: string | null;
  levels: unknown;
  types: unknown;
  /** Stable Discover bucket: sports | arts | games | learning | social */
  interestCategory?: string | null;
  /** Suggested group size when creating circles for this hoby */
  groupSize?: GroupSizePayload | null;
  archived?: boolean;
};

export type HobyBulkResponse = {
  deleted: string[];
  archived: string[];
  regenerated: string[];
  blocked: string[];
  failed: string[];
};

export type HobyRegenField = "description" | "icon" | "category" | "types" | "levels" | "groupSize";

export type HobyRegeneratePreview = {
  shortDescription?: string | null;
  icon?: string | null;
  interestCategory?: string | null;
  levels?: unknown;
  types?: unknown;
  groupSize?: GroupSizePayload | null;
  fields: string[];
};

export type HobyCreateRequest = {
  displayName: string;
  shortDescription?: string | null;
  icon?: string | null;
  levels?: unknown;
  types?: unknown;
  interestCategory?: string | null;
  groupSize?: GroupSizePayload | null;
};

export type HobyUpdateRequest = {
  displayName?: string;
  shortDescription?: string | null;
  heDisplayName?: string | null;
  heShortDescription?: string | null;
  icon?: string | null;
  levels?: unknown;
  types?: unknown;
  interestCategory?: string | null;
  groupSize?: GroupSizePayload | null;
};

export type HobyPrecheckSimilarItem = {
  slug: string;
  displayName: string;
  note?: string | null;
};

export type HobyPrecheckResponse = {
  proposedSlug: string;
  blockedReason: "duplicate" | "similar_existing" | "invalid_name" | null;
  stepSummary: string | null;
  message: string | null;
  duplicateDetail: string | null;
  similarExisting: HobyPrecheckSimilarItem[];
  validity: string;
  suggestedNames: string[];
  aiPerformed: boolean;
  aiNote: string | null;
};

export type HobySpellSuggestResponse = {
  slugSuggestions: string[];
  displayNameSuggestions: string[];
};

