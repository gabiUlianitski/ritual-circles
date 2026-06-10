import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var state: AppState

    @State private var userName: String = ""
    @State private var firstName: String = ""
    @State private var lastName: String = ""
    @State private var city: String = ""
    @State private var availabilityDay: String = "Mon"
    @State private var availabilityTime: String = "18:00:00"
    @State private var modality: Modality = .online
    @State private var ritualType: String = "coffee"

    @State private var inviteCode: String = ""
    @State private var isSubmitting: Bool = false
    @State private var error: String?

    private let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        VStack(spacing: 16) {
            Text("Set up your profile")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 12) {
                TextField("Username (unique)", text: $userName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                TextField("First name", text: $firstName)
                    .textInputAutocapitalization(.words)
                    .textFieldStyle(.roundedBorder)
                TextField("Last name", text: $lastName)
                    .textInputAutocapitalization(.words)
                    .textFieldStyle(.roundedBorder)

                TextField("City (optional)", text: $city)
                    .textInputAutocapitalization(.words)
                    .textFieldStyle(.roundedBorder)

                HStack {
                    Picker("Day", selection: $availabilityDay) {
                        ForEach(days, id: \.self) { Text($0) }
                    }
                    .pickerStyle(.menu)

                    TextField("Time (HH:MM:SS)", text: $availabilityTime)
                        .keyboardType(.numbersAndPunctuation)
                        .textFieldStyle(.roundedBorder)
                }

                Picker("Modality", selection: $modality) {
                    Text("Online").tag(Modality.online)
                    Text("Offline").tag(Modality.offline)
                }
                .pickerStyle(.segmented)

                TextField("Ritual type (e.g. coffee)", text: $ritualType)
                    .textInputAutocapitalization(.never)
                    .textFieldStyle(.roundedBorder)
            }

            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            VStack(spacing: 10) {
                Button {
                    Task { await submitProfileOnly() }
                } label: {
                    Text(isSubmitting ? "Saving..." : "Save profile")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSubmitting || !profileReady)

                Button {
                    Task { await createCircle() }
                } label: {
                    Text("Create circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isSubmitting || !profileReady)

                HStack(spacing: 8) {
                    TextField("Invite code", text: $inviteCode)
                        .textInputAutocapitalization(.never)
                        .textFieldStyle(.roundedBorder)

                    Button("Join") {
                        Task { await joinCircle() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isSubmitting || inviteCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }

            Spacer()
        }
        .padding()
    }

    private var profileReady: Bool {
        !userName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submitProfileOnly() async {
        await patchMe()
        await state.refreshHome()
    }

    private func patchMe() async {
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }

        do {
            _ = try await APIClient.shared.patchMe(
                UserUpdateRequest(
                    user_name: userName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                    first_name: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                    last_name: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                    city: city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : city,
                    availability_day: availabilityDay,
                    availability_time: availabilityTime
                )
            )
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func createCircle() async {
        await patchMe()
        guard error == nil else { return }

        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let circle = try await APIClient.shared.createCircle(
                CircleCreateRequest(
                    ritualType: ritualType.trimmingCharacters(in: .whitespacesAndNewlines),
                    modality: modality,
                    recurringTime: "\(availabilityDay) \(String(availabilityTime.prefix(5)))",
                    city: modality == .offline ? (city.isEmpty ? nil : city) : nil,
                    countryCode: nil,
                    cityName: nil,
                    meetingPlace: nil,
                    inviteOnly: true
                )
            )
            _ = circle
            await state.refreshHome()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func joinCircle() async {
        await patchMe()
        guard error == nil else { return }

        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await APIClient.shared.joinCircle(inviteCode: inviteCode.trimmingCharacters(in: .whitespacesAndNewlines))
            await state.refreshHome()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

