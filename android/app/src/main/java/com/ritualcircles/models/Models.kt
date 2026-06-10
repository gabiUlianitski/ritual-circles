package com.ritualcircles.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class HomeResponse(
    val circle: CircleResponse? = null,
    val nextSession: SessionResponse? = null,
    val myAttendance: AttendanceResponse? = null,
)

@Serializable
data class CircleResponse(
    val id: String,
    val ritualType: String,
    val modality: String,
    val recurringTime: String,
    val city: String? = null,
    val countryCode: String? = null,
    val cityName: String? = null,
    val meetingPlace: String? = null,
    val maxSize: Int,
    val inviteCode: String,
    val inviteOnly: Boolean = true,
)

@Serializable
data class SessionResponse(
    val id: String,
    val circleId: String,
    val dateTime: String,
    val locationOrLink: String,
)

@Serializable
data class AttendanceResponse(
    val userId: String,
    val sessionId: String,
    val status: String,
)

@Serializable
data class UserUpdateRequest(
    val user_name: String? = null,
    val first_name: String? = null,
    val last_name: String? = null,
    val city: String? = null,
    val availability_day: String? = null,
    val availability_time: String? = null,
)

@Serializable
data class CircleCreateRequest(
    val ritualType: String,
    val modality: String,
    val recurringTime: String,
    val city: String? = null,
    val countryCode: String? = null,
    val cityName: String? = null,
    val meetingPlace: String? = null,
    val inviteOnly: Boolean = true,
)

@Serializable
data class JoinCircleResponse(
    val circle: CircleResponse
)

@Serializable
data class CircleLeaveRequest(
    val circleId: String,
)

@Serializable
data class AttendanceUpsertRequest(
    val status: String
)

@Serializable
data class CircleMemberResponse(
    val id: String,
    val user_name: String,
    val first_name: String,
    val last_name: String,
)

@Serializable
data class CircleMeResponse(
    val circle: CircleResponse? = null,
    val members: List<CircleMemberResponse> = emptyList(),
)

