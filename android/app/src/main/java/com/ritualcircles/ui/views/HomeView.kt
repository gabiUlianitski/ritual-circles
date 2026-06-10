package com.ritualcircles.ui.views

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ritualcircles.ui.AppState
import kotlinx.coroutines.launch

@Composable
fun HomeView(state: AppState, onCircleDetails: () -> Unit) {
    val home = state.home
    val circle = home?.circle
    val session = home?.nextSession
    val my = home?.myAttendance
    val scope = rememberCoroutineScope()

    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (circle != null) {
            Text("Your circle", style = MaterialTheme.typography.titleMedium)
            Text("${circle.ritualType} • ${circle.modality} • Weekly ${circle.recurringTime}", style = MaterialTheme.typography.bodySmall)
        }

        Text("Next session", style = MaterialTheme.typography.titleMedium)
        if (session != null) {
            Text(session.dateTime, style = MaterialTheme.typography.bodySmall)
            Text(session.locationOrLink, style = MaterialTheme.typography.bodySmall)

            Text(
                when (my?.status) {
                    "attending" -> "You’re coming."
                    "not_attending" -> "You haven’t committed yet."
                    else -> "Set your attendance."
                },
                style = MaterialTheme.typography.bodySmall
            )

            Button(
                enabled = !working,
                onClick = {
                    scope.launch {
                        working = true; error = null
                        try {
                            state.api().putAttendance(session.id, "attending")
                            state.refreshHome()
                        } catch (t: Throwable) { error = t.message }
                        working = false
                    }
                }
            ) { Text("I’m coming") }

            OutlinedButton(
                enabled = !working,
                onClick = {
                    scope.launch {
                        working = true; error = null
                        try {
                            state.api().putAttendance(session.id, "not_attending")
                            state.refreshHome()
                        } catch (t: Throwable) { error = t.message }
                        working = false
                    }
                }
            ) { Text("Not coming") }
        } else {
            Text("No upcoming session.", style = MaterialTheme.typography.bodySmall)
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(enabled = circle != null, onClick = onCircleDetails) { Text("Circle details") }
    }
}

