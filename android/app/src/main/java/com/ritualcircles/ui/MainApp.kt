package com.ritualcircles.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.ritualcircles.ui.views.CircleDetailsView
import com.ritualcircles.ui.views.HomeView
import com.ritualcircles.ui.views.OnboardingView
import kotlinx.coroutines.launch

@Composable
fun MainApp() {
    val context = LocalContext.current
    val state = remember { AppState(context) }
    val scope = rememberCoroutineScope()

    var screen by remember { mutableStateOf<Screen>(Screen.Home) }

    LaunchedEffect(Unit) {
        state.refreshHome()
        screen = if (state.home?.circle == null) Screen.Onboarding else Screen.Home
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ritual Circles") },
                actions = {
                    TextButton(onClick = { scope.launch { state.refreshHome() } }) { Text("Refresh") }
                }
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            when (screen) {
                Screen.Onboarding -> OnboardingView(
                    state = state,
                    onDone = {
                        scope.launch {
                            state.refreshHome()
                            screen = if (state.home?.circle == null) Screen.Onboarding else Screen.Home
                        }
                    }
                )

                Screen.Home -> HomeView(
                    state = state,
                    onCircleDetails = { screen = Screen.CircleDetails }
                )

                Screen.CircleDetails -> CircleDetailsView(
                    state = state,
                    onBack = { screen = Screen.Home },
                    onLeft = {
                        scope.launch {
                            state.refreshHome()
                            screen = Screen.Onboarding
                        }
                    }
                )
            }
        }
    }
}

