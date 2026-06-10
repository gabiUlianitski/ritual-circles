import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var state: AppState
    @State private var isWorking: Bool = false
    @State private var error: String?

    var body: some View {
        let home = state.home
        let circle = home?.circle
        let nextSession = home?.nextSession
        let myAttendance = home?.myAttendance

        VStack(spacing: 16) {
            if let circle {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your circle")
                        .font(.headline)
                    Text("\(circle.ritualType) • \(circle.modality.rawValue)")
                        .foregroundStyle(.secondary)
                    Text("Weekly: \(circle.recurringTime)")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let nextSession {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Next session")
                        .font(.headline)
                    Text(nextSession.dateTime.formatted(date: .abbreviated, time: .shortened))
                    Text(nextSession.locationOrLink)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("No upcoming session yet.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let nextSession {
                // One clear action: set attendance (one tap)
                VStack(spacing: 10) {
                    if myAttendance?.status == .attending {
                        Text("You’re coming.")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else if myAttendance?.status == .not_attending {
                        Text("You haven’t committed yet.")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        Text("Set your attendance")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        Task { await setAttendance(sessionId: nextSession.id, status: .attending) }
                    } label: {
                        Text(isWorking ? "Saving..." : "I’m coming")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isWorking)

                    Button {
                        Task { await setAttendance(sessionId: nextSession.id, status: .not_attending) }
                    } label: {
                        Text("Not coming")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(isWorking)
                }
            }

            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if circle != nil {
                NavigationLink("Circle details") {
                    CircleDetailsView()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer()
        }
        .padding()
        .refreshable {
            await state.refreshHome()
        }
    }

    private func setAttendance(sessionId: String, status: AttendanceStatus) async {
        isWorking = true
        error = nil
        defer { isWorking = false }

        do {
            _ = try await APIClient.shared.putAttendance(sessionId: sessionId, status: status)
            await state.refreshHome()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

