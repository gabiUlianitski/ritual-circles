from uuid import UUID

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException

from app.deps import CurrentUser, conn_dep, get_current_user, get_request_lang
from app.schemas import (
    ActivityAttendanceRequest,
    ActivityCancelRequest,
    ActivityCreateRequest,
    ActivityDefaultsResponse,
    ActivityNotification,
    ActivityOccurrenceRequest,
    ActivityParticipation,
    ActivityResponse,
    ActivitySuggestionCreate,
    ActivityUpdateRequest,
)
from app.services.activities_service import (
    cancel_activity,
    complete_activity,
    confirm_activity,
    create_activity,
    get_activity,
    get_activity_defaults,
    list_activities_for_circle,
    publish_activity,
    update_activity,
)
from app.services.activity_attendance import record_attendance, record_date_attendance
from app.services.activity_notifications import list_activity_notifications
from app.services.activity_participants import (
    join_activity,
    join_occurrence,
    leave_activity,
    leave_occurrence,
    reconfirm_activity,
    reconfirm_occurrence,
)
from app.services.activity_suggestions import (
    accept_suggestion,
    create_occurrence_suggestion,
    create_suggestion,
    decline_suggestion,
    remove_support,
    support_suggestion,
    withdraw_suggestion,
)

router = APIRouter(tags=["activities"])


@router.get("/me/activity-notifications", response_model=list[ActivityNotification])
async def get_my_activity_notifications(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
    lang: str = Depends(get_request_lang),
) -> list[ActivityNotification]:
    return await list_activity_notifications(conn, user_id=user.id, lang=lang)


@router.post("/circles/{circleId}/activities", response_model=ActivityResponse)
async def post_activity(
    circleId: UUID,
    payload: ActivityCreateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await create_activity(conn, user_id=user.id, circle_id=circleId, payload=payload)


@router.get("/circles/{circleId}/activity-defaults", response_model=ActivityDefaultsResponse)
async def get_circle_activity_defaults(
    circleId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityDefaultsResponse:
    return await get_activity_defaults(conn, user_id=user.id, circle_id=circleId)


@router.get("/circles/{circleId}/activities", response_model=list[ActivityResponse])
async def get_circle_activities(
    circleId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> list[ActivityResponse]:
    return await list_activities_for_circle(conn, user_id=user.id, circle_id=circleId)


@router.get("/activities/{activityId}", response_model=ActivityResponse)
async def get_one_activity(
    activityId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await get_activity(conn, user_id=user.id, activity_id=activityId)


@router.patch("/activities/{activityId}", response_model=ActivityResponse)
async def patch_activity(
    activityId: UUID,
    payload: ActivityUpdateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await update_activity(conn, user_id=user.id, activity_id=activityId, payload=payload)


def _occurrence_id(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Choose a date.") from e


@router.post("/activities/{activityId}/publish", response_model=ActivityResponse)
async def post_publish_activity(
    activityId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await publish_activity(conn, user_id=user.id, activity_id=activityId)


@router.post("/activities/{activityId}/confirm", response_model=ActivityResponse)
async def post_confirm_activity(
    activityId: UUID,
    payload: ActivityOccurrenceRequest = Body(default_factory=ActivityOccurrenceRequest),
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await confirm_activity(
        conn,
        user_id=user.id,
        activity_id=activityId,
        occurrence_id=_occurrence_id(payload.occurrenceId),
    )


@router.post("/activities/{activityId}/complete", response_model=ActivityResponse)
async def post_complete_activity(
    activityId: UUID,
    payload: ActivityOccurrenceRequest = Body(default_factory=ActivityOccurrenceRequest),
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await complete_activity(
        conn,
        user_id=user.id,
        activity_id=activityId,
        occurrence_id=_occurrence_id(payload.occurrenceId),
    )


@router.post(
    "/activities/{activityId}/occurrences/{occurrenceId}/join",
    response_model=ActivityResponse,
)
async def post_join_occurrence(
    activityId: UUID,
    occurrenceId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await join_occurrence(
        conn, user_id=user.id, activity_id=activityId, occurrence_id=occurrenceId
    )


@router.post(
    "/activities/{activityId}/occurrences/{occurrenceId}/leave",
    response_model=ActivityResponse,
)
async def post_leave_occurrence(
    activityId: UUID,
    occurrenceId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await leave_occurrence(
        conn, user_id=user.id, activity_id=activityId, occurrence_id=occurrenceId
    )


@router.post("/activities/{activityId}/join", response_model=ActivityParticipation)
async def post_join_activity(
    activityId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityParticipation:
    return await join_activity(conn, user_id=user.id, activity_id=activityId)


@router.post("/activities/{activityId}/leave", response_model=ActivityParticipation)
async def post_leave_activity(
    activityId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityParticipation:
    return await leave_activity(conn, user_id=user.id, activity_id=activityId)


@router.post("/activities/{activityId}/cancel", response_model=ActivityResponse)
async def post_cancel_activity(
    activityId: UUID,
    payload: ActivityCancelRequest = Body(default_factory=ActivityCancelRequest),
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await cancel_activity(
        conn,
        user_id=user.id,
        activity_id=activityId,
        occurrence_id=_occurrence_id(payload.occurrenceId),
        reason=payload.cancellationReason,
    )


@router.post("/activities/{activityId}/suggestions", response_model=ActivityResponse)
async def post_activity_suggestion(
    activityId: UUID,
    payload: ActivitySuggestionCreate,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await create_suggestion(conn, user_id=user.id, activity_id=activityId, payload=payload)


@router.post("/activities/{activityId}/occurrences/{occurrenceId}/suggestions", response_model=ActivityResponse)
async def post_occurrence_suggestion(
    activityId: UUID,
    occurrenceId: UUID,
    payload: ActivitySuggestionCreate,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await create_occurrence_suggestion(
        conn,
        user_id=user.id,
        activity_id=activityId,
        occurrence_id=occurrenceId,
        payload=payload,
    )


@router.post("/activity-suggestions/{suggestionId}/support", response_model=ActivityResponse)
async def post_suggestion_support(
    suggestionId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await support_suggestion(conn, user_id=user.id, suggestion_id=suggestionId)


@router.post("/activity-suggestions/{suggestionId}/support/remove", response_model=ActivityResponse)
async def post_suggestion_support_remove(
    suggestionId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await remove_support(conn, user_id=user.id, suggestion_id=suggestionId)


@router.post("/activity-suggestions/{suggestionId}/withdraw", response_model=ActivityResponse)
async def post_suggestion_withdraw(
    suggestionId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await withdraw_suggestion(conn, user_id=user.id, suggestion_id=suggestionId)


@router.post("/activity-suggestions/{suggestionId}/accept", response_model=ActivityResponse)
async def post_suggestion_accept(
    suggestionId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await accept_suggestion(conn, user_id=user.id, suggestion_id=suggestionId)


@router.post("/activity-suggestions/{suggestionId}/decline", response_model=ActivityResponse)
async def post_suggestion_decline(
    suggestionId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await decline_suggestion(conn, user_id=user.id, suggestion_id=suggestionId)


@router.post("/activities/{activityId}/reconfirm", response_model=ActivityResponse)
async def post_reconfirm_activity(
    activityId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await reconfirm_activity(conn, user_id=user.id, activity_id=activityId)


@router.post("/activities/{activityId}/occurrences/{occurrenceId}/reconfirm", response_model=ActivityResponse)
async def post_reconfirm_occurrence(
    activityId: UUID,
    occurrenceId: UUID,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await reconfirm_occurrence(
        conn, user_id=user.id, activity_id=activityId, occurrence_id=occurrenceId
    )


@router.post("/activities/{activityId}/participants/{participantId}/attendance", response_model=ActivityResponse)
async def post_attendance(
    activityId: UUID,
    participantId: UUID,
    payload: ActivityAttendanceRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await record_attendance(
        conn,
        user_id=user.id,
        activity_id=activityId,
        participant_id=participantId,
        attendance_status=payload.attendanceStatus,
    )


@router.post(
    "/activities/{activityId}/occurrences/{occurrenceId}/participants/{participantId}/attendance",
    response_model=ActivityResponse,
)
async def post_date_attendance(
    activityId: UUID,
    occurrenceId: UUID,
    participantId: UUID,
    payload: ActivityAttendanceRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ActivityResponse:
    return await record_date_attendance(
        conn,
        user_id=user.id,
        activity_id=activityId,
        occurrence_id=occurrenceId,
        participant_id=participantId,
        attendance_status=payload.attendanceStatus,
    )
