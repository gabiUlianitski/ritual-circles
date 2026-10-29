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

export type HomeCircleItem = {
  circle: CircleResponse;
  isCreator?: boolean;
  /** Active circle members. */
  memberCount: number;
};

export type HomeResponse = {
  circle: CircleResponse | null;
  myCircles?: HomeCircleItem[];
  /** Joined Activities that have not ended, earliest first. Recurring Activities give one item per joined date. */
  upcomingActivities?: HomeActivityItem[];
};

export type HomeActivityItem = {
  activityId: string;
  occurrenceId?: string | null;
  circleId: string;
  circleName: string;
  title: string;
  ritualType: string;
  hobyDisplayName?: string | null;
  hobyIcon?: string | null;
  isRecurring: boolean;
  startAt: string;
  endAt?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  paymentType: "free" | "paid";
  priceAmount?: string | number | null;
  currency?: string | null;
  status: "open" | "confirmed";
  participation: ActivityParticipation;
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
  hobbyAdmin: boolean;
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

export type ActivityDefaults = {
  locationName: string | null;
  locationAddress: string | null;
  preferredGroupSize: number;
  /** Circle city used to scope a place search. Not a venue. */
  cityName?: string | null;
};

export type ActivityCreatePayload = {
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  recurrenceType: "one_time" | "recurring";
  recurrenceRule?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  groupSize: number;
  minParticipants: number;
  paymentType: "free" | "paid";
  priceAmount?: string | null;
  currency?: string | null;
};

export type ActivityActions = {
  canJoin: boolean;
  canLeave: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canConfirm: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canSuggest?: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
};

export type ActivitySuggestion = {
  id: string;
  activityId: string;
  occurrenceId?: string | null;
  type: "time" | "location";
  proposedStartAt?: string | null;
  proposedEndAt?: string | null;
  proposedLocationName?: string | null;
  proposedLocationAddress?: string | null;
  note?: string | null;
  status: "open" | "accepted" | "declined" | "withdrawn";
  suggestedByName: string;
  suggestedByAvatarUrl?: string | null;
  supportCount: number;
  supportedByMe: boolean;
  canSupport: boolean;
  canWithdraw: boolean;
  canDecide: boolean;
  actionable: boolean;
  createdAt: string;
};

export type ActivityOccurrence = {
  id: string;
  startAt: string;
  endAt?: string | null;
  status: "draft" | "open" | "confirmed" | "cancelled" | "completed";
  cancellationReason?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  hasStarted: boolean;
  hasEnded: boolean;
  actions: ActivityActions;
  participation?: ActivityParticipation | null;
  suggestions?: ActivitySuggestion[];
  attendance?: ActivityAttendanceEntry[] | null;
};

/** What actually happened after an Activity or date ended. Separate from the going/cancelled RSVP. */
export type ActivityAttendanceStatus = "pending" | "attended" | "no_show";

/** Sent only to the Activity creator and Circle owner, only once the gathering has ended. */
export type ActivityAttendanceEntry = {
  participantId: string;
  name: string;
  avatarUrl?: string | null;
  attendanceStatus: ActivityAttendanceStatus;
};

export type ActivityGoingPerson = {
  name: string;
  avatarUrl?: string | null;
};

export type ActivityParticipation = {
  goingCount: number;
  groupSize: number;
  minParticipants: number;
  remainingNeeded: number;
  isReady: boolean;
  remainingPlaces: number;
  isFull: boolean;
  currentUserStatus?: "going" | "cancelled" | null;
  confirmationRequired?: boolean;
  going?: ActivityGoingPerson[];
};

export type Activity = {
  id: string;
  circleId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  recurrenceType: "one_time" | "recurring";
  recurrenceRule?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  groupSize: number;
  minParticipants: number;
  paymentType: "free" | "paid";
  priceAmount?: string | number | null;
  currency?: string | null;
  status: "draft" | "open" | "confirmed" | "cancelled" | "completed";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  cancellationReason?: string | null;
  hasStarted?: boolean;
  hasEnded?: boolean;
  actions?: ActivityActions | null;
  occurrences?: ActivityOccurrence[];
  nextOccurrence?: ActivityOccurrence | null;
  participation?: ActivityParticipation | null;
  suggestions?: ActivitySuggestion[];
  attendance?: ActivityAttendanceEntry[] | null;
};

export type ActivityCreated = Activity;

export type ActivityUpdatePayload = Partial<Omit<ActivityCreatePayload, "paymentType" | "recurrenceType">> & {
  recurrenceType?: ActivityCreatePayload["recurrenceType"];
  paymentType?: ActivityCreatePayload["paymentType"];
  status?: "open";
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
  placeCategory?: PlaceCategory;
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

/** Categories are assigned by the backend; unknown values render as a generic pin. */
export type PlaceCategory = "sports" | "park" | "cafe" | "community" | "transit" | "generic";

/** GET /geo/place-suggest — one normalized place inside the selected city. */
export type PlaceSuggestion = {
  kind: "place";
  category: PlaceCategory;
  name: string;
  cityName?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  shortAddress?: string | null;
  fullAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

/**
 * When a circle's next Activity (or recurring date) happens, as shown to guests, non-members and invitees.
 * Title, place, address and headcount are not sent; members read them from the Activity APIs.
 */
export type CircleNextActivity = {
  startAt: string;
  endAt?: string | null;
  isRecurring: boolean;
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
  nextActivity?: CircleNextActivity | null;
};

export type DiscoveryResponse = {
  title: string;
  body: string;
  imagePrompt: string;
};

export type DailyInsightResponse = {
  slug: string;
  category: string;
  text: string;
  day: string;
};

export type InsightLibraryPreview = {
  type: string;
  contentEn: string;
  contentHe: string | null;
};

export type GenerateInsightLibraryResponse = {
  hobbyId: string;
  hobbyName: string;
  activeCount: number;
  batchId: string;
  preview: InsightLibraryPreview[];
};

export type InsightLibrarySummary = {
  counts: {
    hobbyId: string;
    activeCount: number;
    generatedAt?: string | null;
    discovery?: number;
    motivation?: number;
    social?: number;
    fact?: number;
  }[];
};

export type ForYouIntro = {
  text: string | null;
  day: string;
};

export type DailyLibraryInsight = {
  hobbyId: string;
  insightType: string;
  text: string;
  day: string;
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
  nextActivity?: CircleNextActivity | null;
  messagesLastWeek?: number;
  messagesToday?: number;
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
export type CircleMeResponse = {
  circle: CircleResponse | null;
  members: CircleMemberResponse[];
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

export type ActivityNotificationType =
  | "activity_cancelled"
  | "activity_confirmed"
  | "activity_changed"
  | "reconfirmation_required"
  | "upcoming_activity"
  | "suggestion_accepted"
  | "suggestion_declined"
  | "suggestion_created";

/** In-app only. Identifiers and display basics; wording is localized on the client. */
export type ActivityNotification = {
  id: string;
  type: ActivityNotificationType;
  activityId: string;
  occurrenceId?: string | null;
  circleId: string;
  circleName: string;
  activityTitle: string;
  recurring: boolean;
  startAt: string;
  suggestionType?: "time" | "location" | null;
  suggestedByName?: string | null;
  cancellationNote?: string | null;
  resolved: boolean;
  createdAt: string;
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
  nextActivity?: CircleNextActivity | null;
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
  /** Inspiring hobby story. Not shown on Home recommendation cards. */
  discoveryDescription?: string | null;
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

