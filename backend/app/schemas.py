from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Modality = Literal["online", "offline"]
AttendanceStatus = Literal["attending", "not_attending"]


class AuthStartRequest(BaseModel):
    # Minimal V1 auth: email + password
    email: str
    password: str
    user_name: str
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
    idToken: str = Field(..., min_length=10)


class GoogleAuthResponse(BaseModel):
    status: Literal["authenticated", "needs_profile"]
    token: str | None = None
    registrationToken: str | None = None
    email: str | None = None
    firstName: str | None = None
    lastName: str | None = None


class GoogleAuthCompleteRequest(BaseModel):
    registrationToken: str = Field(..., min_length=10)
    user_name: str
    first_name: str
    last_name: str | None = None
    city: str | None = None
    availability_day: str = "Mon"
    availability_time: str = "18:00:00"


class UserHobyPreference(BaseModel):
    slug: str
    subtype: str | None = None
    level: str | int | None = None


class UserLanguageItem(BaseModel):
    code: str
    name: str
    preferred: bool = False


class UserMeResponse(BaseModel):
    id: str
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


class CircleMemberAttendanceItem(BaseModel):
    userId: str
    user_name: str
    first_name: str
    last_name: str
    status: AttendanceStatus


class CircleNextSessionRoster(BaseModel):
    sessionId: str
    dateTime: datetime
    members: list[CircleMemberAttendanceItem] = Field(default_factory=list)


class CircleMeResponse(BaseModel):
    circle: CircleResponse | None = None
    members: list[CircleMemberResponse] = Field(default_factory=list)
    nextSessionRoster: CircleNextSessionRoster | None = None
    isCreator: bool = False
    creatorUserId: str | None = None


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
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None
    nextSessionAt: datetime | None = None
    messagesLastWeek: int = 0
    messagesToday: int = 0


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
    firstSessionAt: datetime | None = None
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None


class MeetingPlacePatch(BaseModel):
    name: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    address: str | None = None


class CirclePatchRequest(BaseModel):
    inviteOnly: bool | None = None
    groupSize: GroupSizeSpec | None = None
    costPayment: CirclePaymentSpec | None = None
    firstSessionAt: datetime | None = None
    recurringTime: str | None = None
    isRecurring: bool | None = None
    meetingPlaceUpdate: MeetingPlacePatch | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "CirclePatchRequest":
        schedule_fields = (
            self.firstSessionAt is not None,
            self.recurringTime is not None,
            self.isRecurring is not None,
        )
        if any(schedule_fields) and not all(schedule_fields):
            raise ValueError("firstSessionAt, recurringTime, and isRecurring must be sent together")
        has_any = (
            self.inviteOnly is not None
            or self.groupSize is not None
            or self.costPayment is not None
            or all(schedule_fields)
            or self.meetingPlaceUpdate is not None
        )
        if not has_any:
            raise ValueError("at least one field required")
        return self


class CircleSuggestionActionRequest(BaseModel):
    action: Literal["accept", "decline"]
    firstSessionAt: datetime | None = None
    recurringTime: str | None = None
    isRecurring: bool | None = None


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


class SessionResponse(BaseModel):
    id: str
    circleId: str
    dateTime: datetime
    locationOrLink: str


class AttendanceResponse(BaseModel):
    userId: str
    sessionId: str
    status: AttendanceStatus


class AttendanceUpsertRequest(BaseModel):
    status: AttendanceStatus


class HomeCircleItem(BaseModel):
    """One circle the user belongs to (future attendance), with its next session."""

    circle: CircleResponse
    nextSession: SessionResponse | None
    myAttendance: AttendanceResponse | None
    pendingConfirmation: bool = False
    isCreator: bool = False


class HomeCalendarSession(BaseModel):
    """A future session on the home calendar (all circles)."""

    session: SessionResponse
    circleId: str
    ritualType: str
    hobyDisplayName: str | None = None
    hobyIcon: str | None = None
    myAttendance: AttendanceResponse | None
    attendingCount: int = 0
    memberCount: int = 0
    maxSize: int = 6


class HomeResponse(BaseModel):
    circle: CircleResponse | None
    nextSession: SessionResponse | None
    myAttendance: AttendanceResponse | None
    myCircles: list[HomeCircleItem] = []
    calendarSessions: list[HomeCalendarSession] = []


class HobyResponse(BaseModel):
    id: str
    slug: str
    displayName: str
    shortDescription: str | None = None
    icon: str | None = None
    levels: Any | None = None
    types: Any | None = None
    interestCategory: str | None = None
    groupSize: GroupSizeSpec | None = None


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
    icon: str | None = None
    levels: Any | None = None
    types: Any | None = None
    interestCategory: str | None = None
    groupSize: GroupSizeSpec | None = None


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

