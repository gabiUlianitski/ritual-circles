# Ritual Circles Android (Jetpack Compose) — Skeleton

Minimal Android client mirroring the same V1 loop:
- Home is driven by `GET /home`
- Dev auth: generates/stores a UUID and sends `X-User-Id`
- Minimal screens: Onboarding, Home, Circle Details, Report User

## How to use
1. Create a new Android Studio project (Empty Activity, Jetpack Compose).
2. Copy `app/src/main/java/com/ritualcircles/` files from this folder into your project.
3. Update `ApiConfig.BASE_URL` to point to your backend (LAN IP for device).

