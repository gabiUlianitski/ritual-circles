package com.ritualcircles

import android.content.Context
import java.util.UUID

object DevUserId {
    private const val KEY = "dev_user_id"

    fun getOrCreate(context: Context): String {
        val prefs = context.getSharedPreferences("ritual_circles", Context.MODE_PRIVATE)
        val existing = prefs.getString(KEY, null)
        if (existing != null) return existing
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY, id).apply()
        return id
    }
}

