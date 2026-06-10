import SwiftUI

struct LoginView: View {
    let isLoading: Bool
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("Welcome")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text("This is a simple weekly coordination tool. Continue to see your next session or set up your circle.")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                onContinue()
            } label: {
                Text(isLoading ? "Loading..." : "Continue")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoading)

            Spacer()
        }
        .padding()
    }
}

