import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var home: HomeResponse?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    func refreshHome() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            home = try await APIClient.shared.getHome()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

