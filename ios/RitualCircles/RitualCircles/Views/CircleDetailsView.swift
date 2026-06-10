import SwiftUI

struct CircleDetailsView: View {
    @EnvironmentObject private var state: AppState
    @State private var circleMe: CircleMeResponse?
    @State private var isWorking: Bool = false
    @State private var error: String?

    var body: some View {
        let circle = state.home?.circle

        VStack(spacing: 16) {
            if let circle {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(circle.ritualType)")
                        .font(.headline)
                    Text("\(circle.modality.rawValue) • Weekly \(circle.recurringTime)")
                        .foregroundStyle(.secondary)
                    if circle.modality == .offline, let city = circle.city {
                        Text(city).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Invite code")
                        .font(.headline)
                    Text(circle.inviteCode)
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let members = circleMe?.members, !members.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Members")
                        .font(.headline)
                    ForEach(members) { m in
                        Text("\(m.first_name) \(m.last_name) (@\(m.user_name))")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(role: .destructive) {
                Task { await leave() }
            } label: {
                Text(isWorking ? "Leaving..." : "Leave circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(isWorking)

            Spacer()
        }
        .padding()
        .task { await load() }
    }

    private func load() async {
        error = nil
        do {
            circleMe = try await APIClient.shared.getMyCircle()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func leave() async {
        guard let circleId = state.home?.circle?.id else {
            error = "No circle to leave"
            return
        }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            try await APIClient.shared.leaveCircle(circleId: circleId)
            await state.refreshHome()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

