# Ritual Circles Android (Jetpack Compose) — Skeleton

> **STALE — not compatible with the current API.** This skeleton is not built or shipped. It still calls the retired Attendance API (`PUT /sessions/{id}/attendance`) and reads `nextSession` / `myAttendance` from `GET /home`. Those endpoints and fields no longer exist. The current model is Circle → Activity (see `docs/data-model-map.md`); the web client in `web/` is the reference. Port it to the Activity API before using it. Do not restore Session endpoints for it.

Minimal Android client mirroring the same V1 loop:
- Home is driven by `GET /home`
- Dev auth: generates/stores a UUID and sends `X-User-Id`
- Minimal screens: Onboarding, Home, Circle Details, Report User

## How to use
1. Create a new Android Studio project (Empty Activity, Jetpack Compose).
2. Copy `app/src/main/java/com/ritualcircles/` files from this folder into your project.
3. Update `ApiConfig.BASE_URL` to point to your backend (LAN IP for device).

