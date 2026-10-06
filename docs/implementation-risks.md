# Implementation risks

No code was changed. Ratings are for a later redesign that splits Home and My Activity and separates Discover from membership.

| Risk | Level | Why |
| --- | --- | --- |
| Moving the calendar off Home | **High** | Week strip, month grid, selected day, empty-day find/create, and day attendance are one `selectedDay` state inside `Dashboard.tsx`. Details unmount the whole dashboard. Splitting the JSX without moving that state drops attendance or opens the wrong circle. `GET /home` must still run on login even if the calendar is not on the first screen. |
| Introducing My Activity | **High** | There is no stage, no header slot, and no URL. A new stage that forgets `returnStageAfterNotif`, guest gating, or `onRefresh` will strand Back and notifications. Past sessions are not in the home query, so a “past activity” panel cannot be filled from current data. |
| Separating Discover and My Circles | **Medium** | They are tabs in one component that shares one `GET /circles` fetch and one details overlay. Splitting files is safe if the fetch and `isCreator` filter stay. Changing join rules while splitting is not. Home already shows a third membership list. |
| Changing global navigation | **High** | Header visibility is tied to `onboardingMode` and `guest`. Home stays “active” while circle details are open. Guest welcome uses a different menu. A new icon that is shown to guests will expose Profile or join actions. |
| Preserving deep links | **High** | There are no URL deep links. The only deep link is in-memory `CirclesDeepLink`. Refresh already loses circle id, tab, and chat. Adding screens without URLs makes that worse. Adding URLs later must not rename the stage strings callers already use. |
| Owner / member / non-member | **High** | Owner is `created_by`. Member is future attendance. Non-members can see discover cards but `GET /circles/me` is for members. Scheduled tab is owner-only. Chat suggestion accept is owner-only. A shared card that always shows Manage or Chat will leak actions. |
| Joining and leaving | **High** | Join capacity is a transaction on attendance rows, not a members table. Leave deletes future attendance. `POST /circles/drop` deletes a circle the user created. “Request to join” does not persist anything. Reworking that button into a real request needs a new table, which this pass must not sneak in. |
| Chat access | **Medium** | Chat is mounted inside details and assumes membership. Notification code passes `initialTab: "chat"`, which the details page rewrites to `details` and then scrolls. Moving chat to its own stage must keep that entry path. |
| Notification destinations | **Medium** | Inbox is `localStorage` keyed by user id, rebuilt from circle and message APIs. Destinations call `setStage("circles")` plus a deep link. If My Activity becomes the attendance home, notification “open details” must still land on the circle, not on a calendar. |
| Authentication redirects | **Medium** | Token presence chooses login vs dashboard only. Guest actions use `GuestRegisterPrompt` and then register mode. After auth, the app does not return to the hobby or circle the guest was viewing. A new gate that calls join before `onRegisterRequest` will 401 or create a membership by mistake. |
| Mobile layout | **Medium** | One header row, no bottom nav. Home cards wrap under 720px. Discover tabs are already tight. Adding icons without removing the word Menu will overflow 360px widths. RTL (`he`) flips the header dropdown; new absolute menus must keep the existing `[dir="rtl"]` rules. |
| Hobbies table icons | **High** | Icons are `hobies.icon` strings on the payload (`hobyIcon`). Replacing them with a shared generic SVG, or a hardcoded map, breaks the product rule and languages that rely on the stored glyph. Empty icon must stay an empty badge, not a substitute symbol. |
| Data-model gaps | **Medium** | No join-request table, no notification table, no recently-viewed store, no distance, no past-activity query, no `POST /reports`. Building those screens by inventing rows is a data bug, not a UI task. Membership must stay attendance-derived. |
| Tests | **High** | No pytest, Vitest, Playwright, or CI. A navigation split can ship while join-when-full, leave, or attendance is broken. The first change has to include a written manual script because nothing else will catch it. |
| Styling drift | **Low** | Login tokens and the older app sheet disagree (`#4f7df3` vs `#3b82f6`, radius 14 vs 24, warm focus ring). Visual work can proceed screen by screen. Do not retoken the whole app in the same change as an information-architecture move. |
| Production data | **High** if a migration runs | This redesign does not need a migration for the first step. Applying SQL, seed files, or account-reset scripts against Supabase would change live rows. Do not. |

## Do not treat as blockers yet

- MUI on the scheduled tab. Leave it until that tab is in scope.
- FastAPI and asyncpg versions are unpinned. Pinning them is a release task, not part of the Home split.
- `X-User-Id` dev auth. Do not remove it while local scripts still depend on it, and do not enable it as a production client path.
