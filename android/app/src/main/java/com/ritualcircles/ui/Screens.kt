package com.ritualcircles.ui

sealed class Screen {
    data object Onboarding : Screen()
    data object Home : Screen()
    data object CircleDetails : Screen()
}

