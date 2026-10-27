from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.circle_identity import (
    CIRCLE_DESCRIPTION_MAX,
    CIRCLE_NAME_MAX,
    description_too_long,
    name_too_long,
    normalize_circle_description,
    normalize_circle_name,
)


def _validate_circle_name(value: str | None) -> str | None:
    name = normalize_circle_name(value)
    if name_too_long(name):
        raise ValueError(f"Circle name must be {CIRCLE_NAME_MAX} characters or fewer.")
    return name


def _validate_circle_description(value: str | None) -> str | None:
    text = normalize_circle_description(value)
    if description_too_long(text):
        raise ValueError(f"Circle description must be {CIRCLE_DESCRIPTION_MAX} characters or fewer.")
    return text


Modality = Literal["online", "offline"]

class AuthStartRequest(BaseModel):
    # Minimal V1 auth: email + password
    email: str
    password: str
    user_name: str | None = None
    first_name: str
    last_name: str
    availability_day: str
    availability_time: str
    city: str | None = None


class AuthVerifyRequest(BaseModel):
    email: str
    password: str


class AuthTokenResponse(BaseModel):
    token: str


class AuthConfigResponse(BaseModel):
    googleClientId: str | None = None


class GoogleAuthRequest(BaseModel):
    accessToken: str = Field(..., min_length=10)


class GoogleAuthResponse(BaseModel):
    status: Literal["authenticated", "needs_profile"]
    token: str | None = None
    registrationToken: str | None = None
    email: str | None = None
    firstName: str | None = None
    lastName: str | None = None


class GoogleAuthCompleteRequest(BaseModel):
    registrationToken: str = Field(..., min_length=10)
    user_name: str | None = None
    first_name: str
    last_name: str | None = None
    city: str | None = None
    availability_day: str = "Mon"
    availability_time: str = "18:00:00"


class UserHobyPreference(BaseModel):
    slug: str
    subtype: str | None = None
    level: str | int | None = None
    """Type keys chosen from this hobby. Category stays on the hobby and is not a user choice."""
    types: list[str] = []
    category: str | None = None
    """beginner | intermediate | advanced | expert. Not the catalogue level key."""
    experienceLevel: str | None = None


class UserLanguageItem(BaseModel):
    code: str
    name: str
    preferred: bool = False


class UserMeResponse(BaseModel):
    id: str
    hobbyAdmin: bool = False
    user_name: str
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    city: str | None = None
    hometown: str | None = None
    birthDate: str | None = None
    workSummary: str | None = None
    educationSummary: str | None = None
    languages: list[UserLanguageItem] = []
    availabilityWindows: list[str] = []
    availability_day: str
    availability_time: str
    deviceToken: str | None = None
    userHobies: list[UserHobyPreference] = []
    preferred_hoby_slug: str | None = None
    preferred_hoby_level: str | int | None = None
    preferred_hoby_subtype: str | None = None
    createdAt: datetime | None = None
    passwordSet: bool = False
    onboardingCompleted: bool = False
    avatarUrl: str | None = None


class UserUpdateRequest(BaseModel):
    user_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    userHobies: list[UserHobyPreference] | None = None
    preferred_hoby_slug: str | None = None
    preferred_hoby_level: str | int | None = None
    preferred_hoby_subtype: str | None = None
    city: str | None = None
    hometown: str | None = None
    birthDate: str | None = None
    workSummary: str | None = None
    educationSummary: str | None = None
    languages: list[UserLanguageItem] | None = None
    phone: str | None = None
    availabilityWindows: list[str] | None = None
    availability_day: str | None = None
    availability_time: str | None = None
    onboardingCompleted: bool | None = None
    avatarUrl: str | None = None


class PasswordChangeRequest(BaseModel):
    currentPassword: str = Field(..., min_length=1)
    newPassword: str = Field(..., min_length=6)


class DeviceTokenRequest(BaseModel):
    deviceToken: str


GroupSizeType = Literal["fixed", "max", "min", "range"]


class GroupSizeSpec(BaseModel):
    type: GroupSizeType
    min: int | None = None
    max: int | None = None

    @field_validator("min", "max")
    @classmethod
    def positive_int(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if not isinstance(v, int) or v <= 0:
            raise ValueError("Please enter a valid number")
        return v

    @model_validator(mode="after")
    def validate_spec(self) -> "GroupSizeSpec":
        if self.type == "fixed":
            if self.min is None and self.max is None:
                raise ValueError("Please enter a valid number")
            n = self.min if self.min is not None else self.max
            self.min = n
            self.max = n
        elif self.type == "max":
            if self.max is None:
                raise ValueError("Please enter a valid number")
        elif self.type == "min":
            if self.min is None:
                raise ValueError("Please enter a valid number")
        elif self.type == "range":
            if self.min is None or self.max is None:
                raise ValueError("Please enter a valid number")
            if self.min > self.max:
                raise ValueError("Minimum must be less than maximum")
        return self


CostPaymentType = Literal["free", "split", "per_person"]
CostCurrency = Literal["USD", "EUR", "ILS"]


class CirclePaymentSpec(BaseModel):
    type: CostPaymentType
    totalCost: float | None = None
    pricePerPerson: float | None = None
    currency: CostCurrency = "USD"
    paymentNote: str | None = None

    @field_validator("totalCost", "pricePerPerson")
    @classmethod
    def positive_amount(cls, v: float | None) -> float | None:
        if v is None:
            return v
        if not isinstance(v, (int, float)) or v <= 0:
            raise ValueError("Please enter a valid amount")
        return float(v)

    @model_validator(mode="after")
    def validate_spec(self) -> "CirclePaymentSpec":
        note = self.paymentNote.strip() if self.paymentNote else None
        self.paymentNote = note or None
        if self.type == "free":
            return self
        if self.type == "split":
            if self.totalCost is None:
                raise ValueError("Please enter a valid amount")
        elif self.type == "per_person":
            if self.pricePerPerson is None:
                raise ValueError("Please enter a valid amount")
        return self


class CircleResponse(BaseModel):
    id: str
    ritualType: str
    modality: Modality
    recurringTime: str
    isRecurring: bool = True
    city: str | None = None
    countryCode: str | None = None
    cityName: str | None = None
    meetingPlace: str | None = None
    maxSize: int = 6
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None
    inviteCode: str
    inviteOnly: bool = True
    ritualLevel: str | int | None = None
    ritualSubtype: str | None = None
    hobyDisplayName: str | None = None
    hobyIcon: str | None = None
    description: str | None = None
    name: str | None = None
    displayTitle: str = ""
    hasCustomName: bool = False


class CircleMemberResponse(BaseModel):
    id: str
    user_name: str
    first_name: str
    last_name: str
    city: str | None = None
    availabilityWindows: list[str] = []
    availability_day: str | None = None
    availability_time: str | None = None
    """Saved level for this circle's hobby (from user profile hobbies)."""
    hobby_subtype: str | None = None
    hobby_level: str | int | None = None
    avatarUrl: str | None = None


class CircleMeResponse(BaseModel):
    circle: CircleResponse | None = None
    members: list[CircleMemberResponse] = Field(default_factory=list)
    isCreator: bool = False
    creatorUserId: str | None = None


class CircleNextActivity(BaseModel):
    """When the circle's earliest upcoming gathering happens: a one-time Activity or a recurring date.

    Sent to guests, non-members and invitees, so it has no title, place, address, ids or headcount.
    Members get those from the Activity APIs.
    """

    startAt: datetime
    endAt: datetime | None = None
    isRecurring: bool = False


class CircleListItemResponse(BaseModel):
    """Public catalog row: invite code omitted; join may be open or invite-only."""

    id: str
    ritualType: str
    recurringTime: str
    isRecurring: bool = True
    city: str | None = None
    countryCode: str | None = None
    cityName: str | None = None
    meetingPlace: str | None = None
    maxSize: int = 6
    memberCount: int = 0
    isYours: bool = False
    isCreator: bool = False
    inviteOnly: bool = True
    ritualLevel: str | int | None = None
    ritualSubtype: str | None = None
    hobyDisplayName: str | None = None
    hobyIcon: str | None = None
    description: str | None = None
    name: str | None = None
    displayTitle: str = ""
    hasCustomName: bool = False
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None
    nextActivity: CircleNextActivity | None = None
    messagesLastWeek: int = 0
    messagesToday: int = 0


class CommunityStatsResponse(BaseModel):
    members: int = 0
    activeCircles: int = 0
    meetupsThisWeek: int = 0


class CommunityCirclePreview(BaseModel):
    id: str
    ritualType: str
    recurringTime: str
    city: str | None = None
    countryCode: str | None = None
    cityName: str | None = None
    meetingPlace: str | None = None
    memberCount: int = 0
    hobyDisplayName: str | None = None
    hobyIcon: str | None = None
    name: str | None = None
    displayTitle: str = ""
    hasCustomName: bool = False
    nextActivity: CircleNextActivity | None = None


class CommunityPreviewResponse(BaseModel):
    stats: CommunityStatsResponse
    featuredCircles: list[CommunityCirclePreview]


class CircleCreateRequest(BaseModel):
    ritualType: str
    ritualLevel: str | int | None = None
    ritualSubtype: str | None = None
    modality: Modality
    recurringTime: str
    isRecurring: bool = True
    city: str | None = None
    countryCode: str | None = None
    cityName: str | None = None
    meetingPlace: str | None = None
    inviteOnly: bool = False
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None
    description: str | None = None
    name: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return _validate_circle_name(value)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return _validate_circle_description(value)


class MeetingPlacePatch(BaseModel):
    name: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    address: str | None = None


class CirclePatchRequest(BaseModel):
    inviteOnly: bool | None = None
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None
    meetingPlaceUpdate: MeetingPlacePatch | None = None
    description: str | None = None
    name: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return _validate_circle_name(value)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return _validate_circle_description(value)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "CirclePatchRequest":
        has_any = (
            self.inviteOnly is not None
            or self.groupSize is not None
            or self.costPayment is not None
            or self.meetingPlaceUpdate is not None
            or "description" in self.model_fields_set
            or "name" in self.model_fields_set
        )
        if not has_any:
            raise ValueError("at least one field required")
        return self


class CircleSuggestionActionRequest(BaseModel):
    action: Literal["accept", "decline"]


class CircleJoinByIdRequest(BaseModel):
    circleId: str


class VenueSuggestionItem(BaseModel):
    name: str
    address: str
    mapsUrl: str | None = None
    hobyRelation: str = ""
    displayName: str | None = None
    category: str | None = None
    distanceLabel: str | None = None
    distanceKm: float | None = None
    hint: str | None = None
    lat: float | None = None
    lon: float | None = None


class MapCenter(BaseModel):
    lat: float
    lon: float


class VenueSuggestionsRequest(BaseModel):
    """Find real places near a free-text address for an offline ritual (Google Places or OSM)."""

    address: str
    ritualType: str
    ritualSubtype: str | None = None
    ritualLevel: str | int | None = None


class VenueSuggestionsResponse(BaseModel):
    suggestions: list[VenueSuggestionItem] = Field(default_factory=list)
    geocodedNear: str | None = None
    mapCenter: MapCenter | None = None


class CountryItem(BaseModel):
    code: str
    name: str


class LanguageItem(BaseModel):
    code: str
    name: str


class CitySuggestItem(BaseModel):
    """Nominatim search hit — use displayName as the geocode string for venue search."""

    shortName: str
    displayName: str
    lat: float | None = None
    lon: float | None = None
    countryCode: str | None = None


class ReverseLocateResponse(BaseModel):
    """Browser geolocation → country + city defaults (Nominatim reverse)."""

    countryCode: str
    cityShortName: str
    displayName: str


class MapsLinkResolveResponse(BaseModel):
    """Google Maps share link → place name + address."""

    name: str
    address: str
    lat: float | None = None
    lon: float | None = None
    mapsUrl: str


class JoinCircleResponse(BaseModel):
    circle: CircleResponse


class CircleLeaveRequest(BaseModel):
    circleId: str


class HomeCircleItem(BaseModel):
    """One circle the user is an active member of."""

    circle: CircleResponse
    isCreator: bool = False
    memberCount: int = 0


class HomeResponse(BaseModel):
    circle: CircleResponse | None
    myCircles: list[HomeCircleItem] = []
    upcomingActivities: list["HomeActivityItem"] = []


class HobyResponse(BaseModel):
    id: str
    slug: str
    displayName: str
    shortDescription: str | None = None
    discoveryDescription: str | None = None
    """English catalogue name. Present even when displayName is localized."""
    canonicalDisplayName: str | None = None
    canonicalShortDescription: str | None = None
    heDisplayName: str | None = None
    heShortDescription: str | None = None
    icon: str | None = None
    levels: Any | None = None
    types: Any | None = None
    """Stable id: sports | arts | games | learning | social."""
    interestCategory: str | None = None
    groupSize: GroupSizeSpec | None = None
    archived: bool = False


class HobyCreateRequest(BaseModel):
    displayName: str
    shortDescription: str | None = None
    icon: str | None = None
    levels: Any | None = None
    types: Any | None = None
    interestCategory: str | None = None
    groupSize: GroupSizeSpec | None = None


class HobyUpdateRequest(BaseModel):
    displayName: str | None = None
    shortDescription: str | None = None
    heDisplayName: str | None = None
    heShortDescription: str | None = None
    icon: str | None = None
    levels: Any | None = None
    types: Any | None = None
    interestCategory: str | None = None
    groupSize: GroupSizeSpec | None = None


HobyRegenField = Literal["description", "icon", "category", "types", "levels", "groupSize"]


class HobyBulkRequest(BaseModel):
    action: Literal["delete", "archive", "regenerate"]
    slugs: list[str] = Field(default_factory=list)


class HobyBulkResponse(BaseModel):
    deleted: list[str] = Field(default_factory=list)
    archived: list[str] = Field(default_factory=list)
    regenerated: list[str] = Field(default_factory=list)
    blocked: list[str] = Field(default_factory=list)
    failed: list[str] = Field(default_factory=list)


class HobyRegenerateRequest(BaseModel):
    fields: list[HobyRegenField] = Field(default_factory=list)
    onlyMissing: bool = False


class HobyRegeneratePreview(BaseModel):
    """Generated values for review. Nothing is saved until the client patches the hobby."""

    shortDescription: str | None = None
    icon: str | None = None
    interestCategory: str | None = None
    levels: Any | None = None
    types: Any | None = None
    groupSize: GroupSizeSpec | None = None
    fields: list[str] = Field(default_factory=list)


class HobyPrecheckRequest(BaseModel):
    displayName: str


class HobyPrecheckSimilarItem(BaseModel):
    slug: str
    displayName: str
    note: str | None = None


class HobyPrecheckResponse(BaseModel):
    proposedSlug: str
    blockedReason: str | None = None
    stepSummary: str | None = None
    message: str | None = None
    duplicateDetail: str | None = None
    similarExisting: list[HobyPrecheckSimilarItem] = Field(default_factory=list)
    validity: str = "valid"
    suggestedNames: list[str] = Field(default_factory=list)
    aiPerformed: bool = False
    aiNote: str | None = None


class HobySpellSuggestRequest(BaseModel):
    slug: str | None = None
    displayName: str | None = None


class HobySpellSuggestResponse(BaseModel):
    slugSuggestions: list[str] = Field(default_factory=list)
    displayNameSuggestions: list[str] = Field(default_factory=list)


class CircleMessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class CircleMessageResponse(BaseModel):
    id: str
    circleId: str
    userId: str
    authorName: str
    body: str
    createdAt: datetime


InvitationStatus = Literal["pending", "accepted", "declined", "canceled"]


class InvitationCandidateResponse(BaseModel):
    id: str
    displayName: str
    city: str | None = None
    avatarUrl: str | None = None
    reasonLabel: str | None = None


class CircleInvitationResponse(BaseModel):
    id: str
    circleId: str
    status: InvitationStatus
    createdAt: datetime
    circleTitle: str
    inviterName: str
    inviteeId: str
    inviteeName: str


class CircleInvitationCreateRequest(BaseModel):
    inviteeUserId: str


class SharedCircleLinkResponse(BaseModel):
    """Result of opening a shared circle link. No invite code."""

    circleId: str
    invitationId: str | None = None
    alreadyMember: bool = False


class CircleInvitationPreviewResponse(BaseModel):
    """Read-only circle facts for the invited person. No invite code and no member identities."""

    id: str
    circleId: str
    status: InvitationStatus
    inviterName: str
    title: str
    name: str | None = None
    hasCustomName: bool = False
    ritualType: str
    hobyDisplayName: str | None = None
    hobyIcon: str | None = None
    description: str | None = None
    recurringTime: str
    isRecurring: bool = True
    nextActivity: CircleNextActivity | None = None
    modality: str
    city: str | None = None
    cityName: str | None = None
    meetingPlace: str | None = None
    memberCount: int
    maxSize: int
    matchedHobbyName: str | None = None


class DiscoveryRequest(BaseModel):
    displayName: str = Field(..., min_length=1, max_length=80)
    category: str | None = None
    lang: str | None = None


class DiscoveryResponse(BaseModel):
    title: str
    body: str
    imagePrompt: str


class DailyInsightResponse(BaseModel):
    slug: str
    category: str
    text: str
    day: str


class GenerateInsightLibraryRequest(BaseModel):
    hobbyId: UUID


class InsightLibraryPreview(BaseModel):
    type: str
    contentEn: str
    contentHe: str | None = None


class GenerateInsightLibraryResponse(BaseModel):
    hobbyId: str
    hobbyName: str
    activeCount: int
    batchId: str
    preview: list[InsightLibraryPreview]


class InsightCount(BaseModel):
    hobbyId: str
    activeCount: int
    generatedAt: datetime | None = None
    discovery: int = 0
    motivation: int = 0
    social: int = 0
    fact: int = 0


class InsightLibrarySummary(BaseModel):
    counts: list[InsightCount]


class DailyLibraryInsight(BaseModel):
    hobbyId: str
    insightType: str
    text: str
    day: str


class ForYouIntroResponse(BaseModel):
    text: str | None = None
    day: str


ActivityStatusName = Literal["draft", "open", "confirmed", "cancelled", "completed"]
ActivityParticipantStatusName = Literal["going", "cancelled"]
ActivityRecurrenceName = Literal["one_time", "recurring"]
ActivityPaymentName = Literal["free", "paid"]


ActivityNotificationType = Literal[
    "activity_cancelled",
    "activity_confirmed",
    "activity_changed",
    "reconfirmation_required",
    "upcoming_activity",
    "suggestion_accepted",
    "suggestion_declined",
    "suggestion_created",
]


class ActivityNotification(BaseModel):
    """One in-app Activity notification. A new suggestion names who suggested it. No place or note is included."""

    id: str
    type: ActivityNotificationType
    activityId: str
    occurrenceId: str | None = None
    circleId: str
    circleName: str
    activityTitle: str
    recurring: bool = False
    startAt: datetime
    suggestionType: Literal["time", "location"] | None = None
    suggestedByName: str | None = None
    cancellationNote: str | None = None
    """Reconfirmation only: the person has already answered (still going or left)."""
    resolved: bool = False
    createdAt: datetime


class ActivityDefaultsResponse(BaseModel):
    """Starting values for planning an activity. The activity keeps its own copy after creation."""

    locationName: str | None = None
    locationAddress: str | None = None
    preferredGroupSize: int


class ActivityCreateRequest(BaseModel):
    title: str
    description: str | None = None
    startAt: datetime
    endAt: datetime | None = None
    recurrenceType: ActivityRecurrenceName = "one_time"
    recurrenceRule: str | None = None
    locationName: str | None = None
    locationAddress: str | None = None
    groupSize: int | None = None
    minParticipants: int | None = None
    paymentType: ActivityPaymentName = "free"
    priceAmount: Decimal | None = None
    currency: str | None = None
    status: ActivityStatusName = "draft"

    @model_validator(mode="after")
    def check_activity(self) -> "ActivityCreateRequest":
        from app.services.activity_rules import prepare_activity_fields

        try:
            prepare_activity_fields(
                title=self.title,
                description=self.description,
                start_at=self.startAt,
                end_at=self.endAt,
                recurrence_type=self.recurrenceType,
                recurrence_rule=self.recurrenceRule,
                location_name=self.locationName,
                location_address=self.locationAddress,
                group_size=self.groupSize,
                min_participants=self.minParticipants,
                payment_type=self.paymentType,
                price_amount=self.priceAmount,
                currency=self.currency,
                status=self.status,
                require_group_size=False,
            )
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return self


class ActivityUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    startAt: datetime | None = None
    endAt: datetime | None = None
    recurrenceType: ActivityRecurrenceName | None = None
    recurrenceRule: str | None = None
    locationName: str | None = None
    locationAddress: str | None = None
    groupSize: int | None = None
    minParticipants: int | None = None
    paymentType: ActivityPaymentName | None = None
    priceAmount: Decimal | None = None
    currency: str | None = None
    status: ActivityStatusName | None = None

    @field_validator("groupSize")
    @classmethod
    def group_size_positive(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("Group size must be greater than zero")
        return value

    @field_validator("minParticipants")
    @classmethod
    def min_participants_positive(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("Minimum participants must be greater than zero")
        return value


class ActivityActions(BaseModel):
    canJoin: bool = False
    canLeave: bool = False
    canEdit: bool = False
    canPublish: bool = False
    canConfirm: bool = False
    canComplete: bool = False
    canCancel: bool = False
    canSuggest: bool = False
    hasStarted: bool = False
    hasEnded: bool = False


ActivitySuggestionType = Literal["time", "location"]
ActivitySuggestionStatus = Literal["open", "accepted", "declined", "withdrawn"]


class ActivitySuggestionCreate(BaseModel):
    type: ActivitySuggestionType
    proposedStartAt: datetime | None = None
    proposedEndAt: datetime | None = None
    proposedLocationName: str | None = None
    proposedLocationAddress: str | None = None
    note: str | None = None


class ActivitySuggestion(BaseModel):
    id: str
    activityId: str
    occurrenceId: str | None = None
    type: ActivitySuggestionType
    proposedStartAt: datetime | None = None
    proposedEndAt: datetime | None = None
    proposedLocationName: str | None = None
    proposedLocationAddress: str | None = None
    note: str | None = None
    status: ActivitySuggestionStatus
    suggestedByName: str
    suggestedByAvatarUrl: str | None = None
    supportCount: int
    supportedByMe: bool
    canSupport: bool
    canWithdraw: bool
    canDecide: bool
    actionable: bool
    createdAt: datetime


class ActivityGoingPerson(BaseModel):
    name: str
    avatarUrl: str | None = None


ActivityAttendanceStatusName = Literal["pending", "attended", "no_show"]


class ActivityAttendanceEntry(BaseModel):
    """One going participant's outcome after an Activity or date ended. Sent only to its organizers."""

    participantId: str
    name: str
    avatarUrl: str | None = None
    attendanceStatus: ActivityAttendanceStatusName


class ActivityAttendanceRequest(BaseModel):
    attendanceStatus: Literal["attended", "no_show"]


class ActivityParticipation(BaseModel):
    goingCount: int
    groupSize: int
    minParticipants: int
    remainingNeeded: int
    isReady: bool
    remainingPlaces: int
    isFull: bool
    currentUserStatus: ActivityParticipantStatusName | None = None
    confirmationRequired: bool = False
    going: list[ActivityGoingPerson] = Field(default_factory=list)


class ActivityOccurrence(BaseModel):
    id: str
    startAt: datetime
    endAt: datetime | None = None
    status: ActivityStatusName
    cancellationReason: str | None = None
    locationName: str | None = None
    locationAddress: str | None = None
    hasStarted: bool = False
    hasEnded: bool = False
    actions: ActivityActions
    participation: ActivityParticipation | None = None
    suggestions: list[ActivitySuggestion] = Field(default_factory=list)
    attendance: list[ActivityAttendanceEntry] | None = None


class ActivityCancelRequest(BaseModel):
    occurrenceId: str | None = None
    cancellationReason: str | None = None


class ActivityOccurrenceRequest(BaseModel):
    occurrenceId: str | None = None


class ActivityResponse(BaseModel):
    id: str
    circleId: str
    title: str
    description: str | None = None
    startAt: datetime
    endAt: datetime | None = None
    recurrenceType: ActivityRecurrenceName
    recurrenceRule: str | None = None
    locationName: str | None = None
    locationAddress: str | None = None
    groupSize: int
    minParticipants: int
    paymentType: ActivityPaymentName
    priceAmount: Decimal | None = None
    currency: str | None = None
    status: ActivityStatusName
    createdBy: str
    createdAt: datetime
    updatedAt: datetime
    cancellationReason: str | None = None
    hasStarted: bool = False
    hasEnded: bool = False
    actions: ActivityActions | None = None
    occurrences: list[ActivityOccurrence] = Field(default_factory=list)
    nextOccurrence: ActivityOccurrence | None = None
    participation: ActivityParticipation | None = None
    suggestions: list[ActivitySuggestion] = Field(default_factory=list)
    attendance: list[ActivityAttendanceEntry] | None = None


class HomeActivityItem(BaseModel):
    """One upcoming Activity date the user joined. Recurring Activities give one item per joined date."""

    activityId: str
    occurrenceId: str | None = None
    circleId: str
    circleName: str
    title: str
    ritualType: str
    hobyDisplayName: str | None = None
    hobyIcon: str | None = None
    isRecurring: bool = False
    startAt: datetime
    endAt: datetime | None = None
    locationName: str | None = None
    locationAddress: str | None = None
    paymentType: ActivityPaymentName
    priceAmount: Decimal | None = None
    currency: str | None = None
    status: ActivityStatusName
    participation: ActivityParticipation


HomeResponse.model_rebuild()

