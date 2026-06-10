import SwiftUI

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @State private var stage: Stage = .login

    enum Stage {
        case login
        case onboarding
        case home
    }

    var body: some View {
        NavigationStack {
            Group {
                if stage == .login {
                    LoginView(isLoading: state.isLoading) {
                        if state.home?.circle == nil {
                            stage = .onboarding
                        } else {
                            stage = .home
                        }
                    }
                } else if state.home == nil {
                    ProgressView()
                } else if stage == .onboarding {
                    OnboardingView()
                } else {
                    HomeView()
                }
            }
            .navigationTitle("Ritual Circles")
        }
    }
}

