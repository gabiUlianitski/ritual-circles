# Current product inventory

Inspection only. No application code was changed for this document.

The approved blueprint file `Ritual_Circles_Full_Site_Map_Updated.docx` is **not in this repository** and was not found beside the project. The Home versus My Activity comparison later in these notes uses the direction stated in the inspection request, not a parsed copy of that document.

The web app is a working single-page client. It does not use URL routes. Screens are an in-memory `stage` in `web/src/ui/App.tsx`. Vercel rewrites every path to `index.html`, and the app does not read `pathname`.

## 1. Technology inventory

Confirmed from the repository, not from assumptions about a typical stack.

| Area | What the repo actually uses |
| --- | --- |
| Frontend | React `^19.1.0` and React DOM `^19.1.0` (`web/package.json`). TypeScript `^5.9.0`. Entry: `web/src/main.tsx`. |
| Frontend build | Vite `^7.1.0` with `@vitejs/plugin-react` `^4.7.0`. Scripts: `dev`, `typecheck` (`tsc --noEmit`), `build`, `preview`. Dev server port 5173 (`web/vite.config.ts`). |
| Backend | FastAPI, declared in `backend/requirements.txt` **without a pinned version**. Process: `uvicorn app.main:app`. Render sets Python `3.12` (`render.yaml`). |
| Backend extras | Pydantic, asyncpg, python-dotenv, PyJWT, passlib, httpx, pycountry, pyspellchecker. Also unpinned. |
| Routing | **No routing library.** No React Router, no `pathname` / hash handling in `web/src`. Navigation is `useState<AppStage>` in `App.tsx`. |
| Styling | Hand-written CSS: `web/src/ui/styles.css` (app) and `web/src/ui/welcome.css` (login and guest welcome). CSS variables live at the top of `welcome.css` (`.welcome-page`). The rest of the app mostly uses raw color values. |
| Component library | MUI Material `^9.1.0`, Emotion, and MUI X Date Pickers `^9.4.0` are dependencies. They are used in `CircleScheduledTab.tsx` and `circleAdjustTheme.ts` only. Login, Home, Circles, Profile, and Notifications are custom markup plus CSS. |
| State | React `useState` / `useEffect` / `useMemo` / `useCallback` in `App` and page components. No Redux, Zustand, or React Query. |
| Persistence in the browser | `localStorage`: `auth_token`, `app_language`, `dev_user_id`, onboarding step and checklist keys, chat last-seen, notification inbox (`ritual_notif_inbox_v1:`). |
| Authentication | Email and password: `POST /auth/start` (register) and `POST /auth/verify` (login). Google: `POST /auth/google` then optional `POST /auth/google/complete`. Server issues a JWT (`PyJWT`, `backend/app/auth/jwt.py`). Client sends `Authorization: Bearer`. Dev fallback: `X-User-Id` (`backend/app/deps.py`). There is no auth-guard library. `App` starts on `dashboard` if a token exists, otherwise `login`. A 401 with a token clears it (`web/src/api/client.ts`). |
| Google client | `@react-oauth/google` `^0.12.2`, `useGoogleLogin` in `Login.tsx`. Client id from `VITE_GOOGLE_CLIENT_ID` or `GET /auth/config`. |
| Database access | asyncpg connection pool in `backend/app/db.py`. SQL is written in services, not an ORM. Default URL if unset: `postgresql://postgres@localhost:5432/Circles`. Production expects `DATABASE_URL` (Supabase, TLS). |
| API layer | One `api` object in `web/src/api/client.ts` calling FastAPI. Routers are included from `backend/app/main.py`. |
| Localization | i18next `^25.5.2` and react-i18next `^15.7.3`. Bundled `web/src/locales/en.json` and `he.json`. `web/src/i18n/index.ts` sets `lang` and `dir` (`he` is RTL). API calls send `Accept-Language`. Hobby catalogue translations use `hobies.i18n_json` plus `web/src/hobyI18n/localizeHoby.ts`. |
| Responsive layout | CSS media queries, not a layout framework. App column: 420px, then 600px at 640px, 940px at 900px, 1016px at 1200px. Home overrides this with a full-viewport background and a 1100px content column (`.app--home`). Welcome page uses 768px and 1024px. |
| Icons | Hobby icons are a text/emoji field from the `hobies` table (`icon`), copied onto circle and home payloads as `hobyIcon`. Navigation icons are inline SVGs in `App.tsx`. Welcome feature icons are inline SVGs in `WelcomeUIKit.tsx`. Profile rows use `profileFbIcons.tsx`. No icon-font or icon-package dependency. |
| Dates | `dayjs` `^1.11.21` is a dependency (used with MUI date pickers on the scheduled-circle tab). Most home dates use `Date` and `toLocaleDateString`. |
| Testing | No pytest, Vitest, Playwright, Jest, or GitHub Actions workflow in the repo. `npm run typecheck` / `npm run build` is the only automated check. |
| Deploy | Web: Vercel. Root `vercel.json` builds `web/` and SPA-rewrites to `index.html`. API: Render (`render.yaml`), `backend` root, health check `/docs`. Database: PostgreSQL, intended to be Supabase. Migrations are SQL files applied manually (`db/schema.sql`, `db/migrations/`). |

## 2. What this product is today

Ritual Circles is a signed-in coordination app plus a guest “look around” welcome. Membership is not a members table. A person is in a circle when they have future `attendance` rows. `circles.created_by` is the owner. Capacity is `circles."maxSize"` (1–6), optionally described by `group_size_json`.

There is no password-recovery flow, no URL for a circle, no server-side notification feed, and no join-request table. “Request to join” opens the invite-code form.

Home, Circles, hobbies, design tokens, and inspiration readiness are in the sections below. Routes, components, the data model, navigation gaps, risks, and the first safe change are in the sibling files in `docs/`.

## 3. Home page today

Signed-in Home is `Dashboard.tsx`. Guests never see it. `shouldShowWelcomeTutorial` is true only for guests, and they get `OnboardingFlow` instead.

| Block | Component | Data | Actions |
| --- | --- | --- | --- |
| Greeting | `HomeWelcomeHeader` | First name from `GET /me` (held in `App`). Context line from `calendarSessions`. | None |
| Upcoming event | `HomeNextActivityCard` | First future `calendarSessions` row: `hobyIcon`, title, `dateTime`, `memberCount`, `maxSize`, `myAttendance` | Open circle details. `PUT` attendance. Empty state goes to find or create. |
| Calendar strip | `HomeWeekStrip` | Same sessions, grouped by local day | Select a day. Previous or next week. |
| Full calendar | `HomeCalendar` | Same sessions | Hidden until “View full calendar”. |
| Selected day | `HomeSessionEvents` or `HomeEmptyDayPrompt` | Sessions on that day | Attendance, open circle, or find/create for an empty day. |
| My Circles | `HomeCirclesList` | `myCircles`. Member count is taken from the matching `calendarSessions` row. | Expand: next session, attendance, details, modify (owner), leave or delete. |

Layout: `.app--home` fills the viewport and centers a 1100px column. The next card is horizontal and wraps under 720px. The week strip scrolls. Navigation does not change between desktop and mobile.

### Move later to My Activity

Week strip, full calendar, selected-day events, empty-day prompt, and the attendance actions on those blocks. They only use `GET /home` and `PUT /sessions/{id}/attendance`.

### Keep on Home for the approved split

Greeting, and one compact upcoming card (`HomeNextActivityCard`) that points at the schedule. Discovery blocks (inspiration, recommended, people needed, almost ready, new near you) do not exist. Do not add them with hardcoded hobbies or counts.

`HomeCirclesList` overlaps the Circles tabs. Moving it is a product cut: leave, delete, and attendance live in the expanded row.

### Dependencies if the calendar block moves

- `App` must still call `GET /home` on load. Unread state and the compact card use that payload.
- `selectedDay`, empty-day find/create (`onGoFindCircles(dateIso)`), and day attendance must move together.
- Circle details currently unmount the whole Dashboard via `detailsCircleId`. The new screen has to own that or lift it.
- Guests must keep seeing `OnboardingFlow`.

### Approved direction versus today

| Approved Home | Today |
| --- | --- |
| Discovery and momentum | Not on Home. Discover is a tab on Circles. |
| Personalized daily inspiration | No component. No recently-viewed store. |
| Recommended for you | Guest onboarding has `RecommendedCircles`. Signed-in Home does not. |
| People needed this week | No such query. `memberCount` and `maxSize` exist for sessions the user already belongs to. |
| Almost-ready groups | Not implemented. |
| New near you | `circles.created_at` and city fields exist. Home does not query them. No distance field. |
| Compact upcoming activity | `HomeNextActivityCard` already does this. |

| Approved My Activity | Today |
| --- | --- |
| Upcoming | Next card, week strip, and day list on Home |
| Invitations and requests | No inbox. Invite code is typed. “Request to join” does not save a request. |
| Calendar | Home only |
| Past activity | Home keeps future sessions only (`getUpcomingSessions`). |
| Attendance and scheduling | Attendance on Home. Schedule changes go through chat suggestions and the owner’s scheduled tab. |

## 4. Circles area today

One stage, `circles`. Tabs and embedded panels, not routes.

| Job | Where | Rule |
| --- | --- | --- |
| Discover | Tab `discover` | `GET /circles`. Join with `POST /circles/join-open` only when `inviteOnly` is false and the circle is under `maxSize`. |
| Created / owned | Tab `mine` | `isCreator` (`created_by`) |
| Circles I’m in | Tab `joined` | Listed, not creator |
| Create | Inline `CreateJoinCircle` or stage `createJoin` | `POST /circles` also writes sessions and the owner’s attendance |
| Details | `CircleDetails` | `GET /circles/me?circleId=` requires membership |
| Chat | Inside details | Member. `GET/POST /circles/{id}/messages`. |
| Manage | Scheduled tab | Creator only. `PATCH /circles/{id}`. |

Services: `circles_service.py`, `home_query.py`, `circle_chat_service.py`, `circle_suggestions.py`.

Invite-only “Request to join” opens the invite-code form. It does not write a request. Capacity is `"maxSize"` (1–6), with `group_size_json` as the owner’s policy. Meetup time is `sessions.dateTime` plus `circles.recurringTime`.

Duplicated UI: `HomeCirclesList`, the mine/joined cards, and `DiscoverCircleCard`. Attendance can be set from the next card, the day list, and the expanded home circle row.

## 5. Hobbies and icons

Table `hobies`. Primary key `id` UUID. Name: `display_name`, with translations in `i18n_json`. Icon: nullable text `icon` (usually an emoji). Subtypes: `types_json` and `circles.ritual_subtype`. Levels: `levels_json` and `circles.ritual_level` or the user’s hobby JSON. API: `GET /hobies`.

Home does not call `/hobies` for icons. `GET /home` and `GET /circles` already send `hobyIcon` from `hobies.icon`.

Do not replace that string with a generic icon, and do not hardcode slug-to-emoji maps. If `icon` is null, Home shows an empty badge and other screens omit the glyph.

Rendered in: Home next card, day events, my-circles rows, `circleDisplay.tsx`, discover filters, Profile hobbies, guest chips, guest hobby detail, and the `Hobies.tsx` editor.

## 6. Design system (Login is the reference)

Tokens live on `.welcome-page` in `web/src/ui/welcome.css`.

| Token | Value |
| --- | --- |
| Background | `#101b33` to `#0b1325` to `#080e1b`, plus a blue radial glow |
| Surface | `rgba(17, 28, 50, 0.78)`, solid `#111c32` |
| Primary blue | `#4f7df3`, hover `#426de0`, active `#365fcb` |
| Text | `#f8fafc`, secondary `#cbd5e1`, muted `#94a3b8` |
| Borders | `rgba(148, 163, 184, 0.2)` and `0.38` |
| Radius | 10px, buttons 14px, surfaces 18px and 22px, pills 999px |
| Shadow | Surface `0 28px 80px rgba(2, 6, 23, 0.30)`. Primary button `0 8px 24px rgba(37, 99, 235, 0.22)`. |
| Type | `system-ui` stack on `body` in `styles.css`. Welcome title about 32–36px, weight 750. |
| Spacing | 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64 |
| Focus | `2px solid rgba(79, 125, 243, 0.36)` |
| Breakpoints | 359, 768, 1024, 1440, plus short-height 719 and 619 |

Home copies some of those numbers in `styles.css` (glow, card `rgba(9, 22, 53, 0.85)`, radius 24px, button `#4f7df3`) but does not use the welcome variables.

Circles, Create, Details, Notifications, Profile, and Menu still use the older sheet: page `#0b1220`, card `#111827`, radius 14px, primary `#3b82f6`, focus `var(--accent-warm)` (`#c9a87c`). The scheduled tab uses a separate MUI theme (`circleAdjustTheme.ts`). Login inputs use `.welcome-field-*`. Other inputs use the global rule in `styles.css` (radius 10px, background `#0b0f14`).

## 7. Personalized inspiration readiness

Use only real rows. Do not invent circles, counts, places, dates, or health claims.

| Signal | Available now? |
| --- | --- |
| Profile hobbies | Yes. `users.user_hobies_json` on `GET /me`. |
| Joined or owned circles | Yes. `GET /home` → `myCircles` and `isCreator`. |
| Recently viewed categories | No. No log, table, or localStorage history. |
| Nearby open circles | Partial. Discover and `GET /community/preview` return circles. User city and circle city exist. No distance or “near me” query on Home. |
| Participant progress | Partial, and only for circles the user is already in (`memberCount`, `maxSize`, attendance). Open circles are not on the Home payload. |
| Upcoming joined activities | Yes. `calendarSessions`. |

There is no consent flag for recommendations. Profile fields are optional. Do not infer anything beyond the hobby level the user saved.

CTAs that already exist: open Circles discover, open create, open a circle the user is in, or filter discover by a slug they saved.

Fallback when nothing matches: the current empty copy (find a circle or create one). No fabricated card.

## 8. Tests

There is no automated suite. Manual checks for the first later change are in `recommended-first-change.md`.

