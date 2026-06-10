import SwiftUI

@main
struct RitualCirclesApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .task {
                    await state.refreshHome()
                }
        }
    }
}

