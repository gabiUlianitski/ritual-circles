package com.ritualcircles.ui.views

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ritualcircles.ui.AppState
import kotlinx.coroutines.launch

@Composable
fun CircleDetailsView(
    state: AppState,
    onBack: () -> Unit,
    onLeft: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var membersText by remember { mutableStateOf<List<String>>(emptyList()) }

    LaunchedEffect(Unit) {
        try {
            val circleMe = state.api().getMyCircle()
            membersText = circleMe.members.map { m ->
                val full = "${m.first_name} ${m.last_name}".trim()
                if (full.isNotBlank()) "$full (@${m.user_name})" else "@${m.user_name}"
            }
        } catch (t: Throwable) {
            error = t.message
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = onBack) { Text("Back") }

        val invite = state.home?.circle?.inviteCode ?: ""
        Text("Invite code", style = MaterialTheme.typography.titleMedium)
        Text(invite, style = MaterialTheme.typography.bodySmall)

        Text("Members", style = MaterialTheme.typography.titleMedium)
        if (membersText.isEmpty()) Text("…", style = MaterialTheme.typography.bodySmall)
        membersText.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        val circleId = state.home?.circle?.id
        Button(
            enabled = !working && circleId != null,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer),
            onClick = {
                scope.launch {
                    working = true; error = null
                    try {
                        val id = circleId ?: return@launch
                        state.api().leaveCircle(id)
                        onLeft()
                    } catch (t: Throwable) { error = t.message }
                    working = false
                }
            }
        ) { Text("Leave circle") }
    }
}

