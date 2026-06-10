package com.ritualcircles.network

import android.content.Context
import com.ritualcircles.ApiConfig
import com.ritualcircles.DevUserId
import com.ritualcircles.models.*
import java.net.URLEncoder
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class ApiClient(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val client = HttpClient(CIO) {
        install(ContentNegotiation) { json(json) }
    }

    private fun userId(): String = DevUserId.getOrCreate(context)

    suspend fun getHome(): HomeResponse =
        client.get("${ApiConfig.BASE_URL}/home") {
            header("X-User-Id", userId())
        }.body()

    suspend fun patchMe(payload: UserUpdateRequest) =
        client.patch("${ApiConfig.BASE_URL}/me") {
            header("X-User-Id", userId())
            contentType(ContentType.Application.Json)
            setBody(payload)
        }.body<Any?>()

    suspend fun createCircle(payload: CircleCreateRequest): CircleResponse =
        client.post("${ApiConfig.BASE_URL}/circles") {
            header("X-User-Id", userId())
            contentType(ContentType.Application.Json)
            setBody(payload)
        }.body()

    suspend fun joinCircle(inviteCode: String): JoinCircleResponse =
        client.post("${ApiConfig.BASE_URL}/circles/join/$inviteCode") {
            header("X-User-Id", userId())
        }.body()

    suspend fun leaveCircle(circleId: String) =
        client.post("${ApiConfig.BASE_URL}/circles/leave") {
            header("X-User-Id", userId())
            contentType(ContentType.Application.Json)
            setBody(CircleLeaveRequest(circleId = circleId))
        }.body<Any?>()

    suspend fun getMyCircle(circleId: String? = null): CircleMeResponse {
        val id = circleId?.trim().orEmpty()
        val url =
            if (id.isEmpty()) "${ApiConfig.BASE_URL}/circles/me"
            else "${ApiConfig.BASE_URL}/circles/me?circleId=${URLEncoder.encode(id, Charsets.UTF_8)}"
        return client.get(url) {
            header("X-User-Id", userId())
        }.body()
    }

    suspend fun putAttendance(sessionId: String, status: String): AttendanceResponse =
        client.put("${ApiConfig.BASE_URL}/sessions/$sessionId/attendance") {
            header("X-User-Id", userId())
            contentType(ContentType.Application.Json)
            setBody(AttendanceUpsertRequest(status = status))
        }.body()

}

