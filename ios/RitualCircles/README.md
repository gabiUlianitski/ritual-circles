# Ritual Circles iOS (SwiftUI) — V1 Skeleton

> **STALE — not compatible with the current API.** This skeleton is not built or shipped. It still calls the retired Session API (`GET /sessions/next`, `PUT /sessions/{id}/attendance`) and reads `nextSession` / `myAttendance` from `GET /home`. Those endpoints and fields no longer exist. The current model is Circle → Activity (see `docs/data-model-map.md`); the web client in `web/` is the reference. Port it to the Activity API before using it. Do not restore Session endpoints for it.

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

