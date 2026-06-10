# Ritual Circles iOS (SwiftUI) — V1 Skeleton

This folder contains **Swift source files** for a minimal V1 iOS app matching the Ritual Circles rules:

- Stack navigation only (no tabs)
- Minimal screens: Onboarding, Home, Circle Details, Report User
- One main contract: `GET /home`
- Dev auth: send `X-User-Id: <uuid>` on every request (stored locally on device)

## How to use in Xcode
1. Create a new iOS App project in Xcode (SwiftUI, iOS 17+ recommended).
2. Copy the contents of `RitualCircles/` (the Swift files) into your Xcode project target.
3. Update `APIConfig.baseURL` in `Networking/APIConfig.swift` to point to your backend.

## Dev backend notes
- Backend expects `X-User-Id` header (UUID).
- On first run, the app generates and persists a UUID in `UserDefaults`.

