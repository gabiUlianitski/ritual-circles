package com.ritualcircles.ui.views

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ritualcircles.models.CircleCreateRequest
import com.ritualcircles.models.UserUpdateRequest
import com.ritualcircles.ui.AppState
import kotlinx.coroutines.launch

@Composable
fun OnboardingView(state: AppState, onDone: () -> Unit) {
    var userName by remember { mutableStateOf("") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var day by remember { mutableStateOf("Mon") }
    var time by remember { mutableStateOf("18:00:00") }
    var modality by remember { mutableStateOf("online") }
    var ritualType by remember { mutableStateOf("coffee") }
    var inviteCode by remember { mutableStateOf("") }

    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun recurringTime(): String = "$day ${time.take(5)}"

    fun profileReady(): Boolean =
        userName.isNotBlank() && firstName.isNotBlank() && lastName.isNotBlank()

    fun profilePatch() = UserUpdateRequest(
        user_name = userName.trim().lowercase(),
        first_name = firstName.trim(),
        last_name = lastName.trim(),
        city = city.trim().ifBlank { null },
        availability_day = day,
        availability_time = time,
    )

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Onboarding", style = MaterialTheme.typography.titleMedium)
        Text("Set your profile, then create or join a circle.", style = MaterialTheme.typography.bodySmall)

        OutlinedTextField(value = userName, onValueChange = { userName = it }, label = { Text("Username (unique)") })
        OutlinedTextField(value = firstName, onValueChange = { firstName = it }, label = { Text("First name") })
        OutlinedTextField(value = lastName, onValueChange = { lastName = it }, label = { Text("Last name") })
        OutlinedTextField(value = city, onValueChange = { city = it }, label = { Text("City (optional)") })

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(modifier = Modifier.weight(1f), value = day, onValueChange = { day = it }, label = { Text("Day") })
            OutlinedTextField(modifier = Modifier.weight(1f), value = time, onValueChange = { time = it }, label = { Text("Time HH:MM:SS") })
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(modifier = Modifier.weight(1f), value = modality, onValueChange = { modality = it }, label = { Text("Modality") })
            OutlinedTextField(modifier = Modifier.weight(1f), value = ritualType, onValueChange = { ritualType = it }, label = { Text("Ritual type") })
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(
            enabled = !working && profileReady(),
            onClick = {
                scope.launch {
                    working = true; error = null
                    try {
                        state.api().patchMe(profilePatch())
                        onDone()
                    } catch (t: Throwable) { error = t.message }
                    working = false
                }
            }
        ) { Text("Save profile") }

        OutlinedButton(
            enabled = !working && profileReady(),
            onClick = {
                scope.launch {
                    working = true; error = null
                    try {
                        state.api().patchMe(profilePatch())
                        state.api().createCircle(CircleCreateRequest(ritualType = ritualType.trim(), modality = modality, recurringTime = recurringTime(), city = if (modality == "offline") city.trim().ifBlank { null } else null))
                        onDone()
                    } catch (t: Throwable) { error = t.message }
                    working = false
                }
            }
        ) { Text("Create circle") }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(modifier = Modifier.weight(1f), value = inviteCode, onValueChange = { inviteCode = it }, label = { Text("Invite code") })
            Button(
                enabled = !working && inviteCode.isNotBlank() && profileReady(),
                onClick = {
                    scope.launch {
                        working = true; error = null
                        try {
                            state.api().patchMe(profilePatch())
                            state.api().joinCircle(inviteCode.trim())
                            onDone()
                        } catch (t: Throwable) { error = t.message }
                        working = false
                    }
                }
            ) { Text("Join") }
        }
    }
}
