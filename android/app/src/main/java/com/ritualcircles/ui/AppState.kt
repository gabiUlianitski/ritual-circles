package com.ritualcircles.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ritualcircles.models.HomeResponse
import com.ritualcircles.network.ApiClient

class AppState(context: Context) {
    private val api = ApiClient(context)

    var home: HomeResponse? by mutableStateOf(null)
        private set
    var loading: Boolean by mutableStateOf(false)
        private set
    var error: String? by mutableStateOf(null)
        private set

    suspend fun refreshHome() {
        loading = true
        error = null
        try {
            home = api.getHome()
        } catch (t: Throwable) {
            error = t.message ?: "Error"
        } finally {
            loading = false
        }
    }

    fun api(): ApiClient = api
}

