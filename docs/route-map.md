# Route map

There are **no URL routes** in the web app. `AppStage` in `web/src/ui/App.tsx` is the only navigation model. Refresh always loads `/` (or whatever path Vercel rewrote to `index.html`) and then chooses `login` or `dashboard` from `localStorage` key `auth_token`. Deep links are in-memory only (`CirclesDeepLink`) and are lost on refresh.

Layout for every signed-in stage except guest welcome: the header row in `App.tsx` (title, icon buttons, Menu). Login and the guest welcome use `WelcomePageShell` and hide that header (`app--login`).

Status values: **active** (reachable in the current UI), **embedded** (not its own stage), **absent** (requested by the blueprint direction but not implemented), **uncertain** (code exists but is easy to miss).

| Current route (stage or mode) | Page component | Layout | Auth | Main data source | Main actions | Leaves via | Desktop / mobile | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `login` mode `choose` | `LandingChoose` inside `Login.tsx` | `WelcomePageShell` | Public | None | Sign in, Create account, Look around first | Sets login mode, or `startGuest()` | Same card, welcome CSS breakpoints | Active |
| `login` mode `login` | `Login.tsx` | `WelcomePageShell` | Public | `POST /auth/verify`, optional `POST /auth/google` | Email sign-in, Google | Success → `dashboard` and `GET /home` | Same | Active |
| `login` mode `register` | `Login.tsx` | `WelcomePageShell` | Public | `POST /auth/start` | Name, email, password, optional city (`GET /geo/city-suggest`) | Success → `dashboard` | Same; city field is a combobox | Active |
| `login` mode `google-setup` | `Login.tsx` | `WelcomePageShell` | Public, holds `registrationToken` | `POST /auth/google/complete` | Finish profile after Google | Success → `dashboard` | Same | Active |
| Password recovery | — | — | — | — | — | — | — | **Absent.** Signed-in password change is on Profile → Security (`POST /me/password`). |
| Guest / Look around | `OnboardingFlow` → `GuestExploreWelcome` while `guest` and `shouldShowWelcomeTutorial` | Welcome shell, Menu from `WelcomePageMenu` | Guest, no token. `GET /home` is not called. `GUEST_HOME` is empty. | `GET /hobies`, `GET /community/preview` | See circles, start a circle (both gated), hobby chips | Hobby detail stage, or auth gate, or back to sign-in | Welcome layout | Active |
| `hobbyDetail` | `GuestHobbyDetail.tsx` | Welcome-style page | Guest | `GET /hobies` | See circles for that hobby | Back to guest dashboard; “see circles” sets hobby filter and opens `circles` | Stack | Active for guests |
| `dashboard` (signed-in Home) | `Dashboard.tsx` | App header | JWT. Initial stage when a token exists. | `GET /home` in `App.refresh`. `GET /me` inside Dashboard. | Attendance, open circle, find/create circle, calendar day select | `createJoin`, `circles`, or embedded `CircleDetails` | `.app--home` centers content at 1100px. Week strip scrolls horizontally. | Active |
| Onboarding checklist on Home | `OnboardingChecklist.tsx` | Inside Dashboard | Signed-in, not dismissed, checklist incomplete | `GET /home` + `GET /me` hobbies | Dismiss (localStorage) | Stays on Home | Same | Active, easy to miss |
| `circles` | `Circles.tsx` | App header | Signed-in, or guest after a gated action | `GET /circles`, `GET /hobies` | Tabs, join, create, open details | Back to dashboard. Create opens inline `CreateJoinCircle`. | Card list; tabs wrap | Active |
| Discover tab | Same file, `pageTab === "discover"` | Same | Same. Guest can browse; join calls `onRegisterRequest`. | `GET /circles` (open catalogue) | Join open circle `POST /circles/join-open`, or “Request to join” which only opens the invite form | Circle detail overlay | Same | Active. Not a separate route. |
| Show my circles / Created | `pageTab === "mine"` | Same | Signed-in | Same list, filtered by `isCreator` | Manage, drop | `CircleDetails` tab `scheduled` | Same | Active tab, not a route |
| Circles I’m in | `pageTab === "joined"` | Same | Signed-in | Same list, member and not creator | Open, leave | `CircleDetails` | Same | Active tab, not a route |
| Circle details | `CircleDetails.tsx` embedded in `Circles` or `Dashboard` | Replaces the parent page until Back | Must already be a member (`GET /circles/me`) | `GET /circles/me?circleId=` | Back, leave/drop, attendance context, open chat | Back restores the parent. Leave refreshes home. | Stack | **Embedded.** `initialTab: "chat"` is normalized to details and then scrolls to chat. |
| Circle chat | `CircleChat.tsx` inside Circle Details | Details page, not a stage | Member | `GET/POST /circles/{id}/messages` | Send message, accept/decline schedule or place suggestion | Stays on details | Stack | **Embedded** |
| Circle management | `CircleScheduledTab.tsx` | Details, **creator only** | Owner (`created_by`) | `PATCH /circles/{id}` | Group size, cost, recurrence, meeting place | Stays on details | Uses MUI; denser than the rest of the app | **Embedded** |
| `createJoin` | `CreateJoinCircle.tsx` → `CreateCircleWizard.tsx` | App header | Signed-in. Guests are intercepted and sent to register. | `GET /hobies`, `POST /circles`, `POST /circles/join/{inviteCode}`, venue endpoints | Create wizard or join with invite code | Done → `GET /home` → dashboard | Wizard is a vertical stack | Active. One stage, two jobs (create and join). |
| `notifications` | `Notifications.tsx` | App header | Signed-in. Hidden for guests. | **Browser inbox** built from `GET /circles` and message fetches (`notificationInbox.ts`). No notifications API. | Mark read, open chat or details, delete locally | Return stage stored in `returnStageAfterNotif` | List | Active |
| `profile` | `Profile.tsx` plus `ProfilePersonalTab`, `ProfileHobbiesTab` | App header | Signed-in | `GET /me`, `PATCH /me`, `POST /me/password`, `DELETE /me` | Edit profile, hobbies, security, logout, delete account | Back → dashboard. Delete/logout → login | Tabs: About, Hobbies, Security | Active |
| `hobies` | `Hobies.tsx` | App header | Signed-in. Menu only, not an icon. | `GET /hobies`, `POST /hobies`, `PATCH /hobies/{slug}` | Browse and edit catalogue rows, including the icon string | Back → dashboard | Long catalogue page | Active |
| Menu | Dropdown in `App.tsx` | Header | Language: all signed-in screens. Hobbies and Log out: signed-in. Guest welcome has its own menu. | None | Language, hobbies, logout | Closes and sets stage | Dropdown, not a page | Active control, not a route |
| Calendar / upcoming | `HomeWeekStrip`, `HomeCalendar`, `HomeSessionEvents`, `HomeNextActivityCard` | Inside Dashboard only | Signed-in (guest home is the welcome, not this calendar) | `home.calendarSessions` from `GET /home` | Select day, I’m coming / Not now | Opens `CircleDetails` | Week strip scrolls; full calendar is collapsed | **Embedded.** Not its own stage. |
| Guest register gate | `GuestRegisterPrompt.tsx` | Overlay | Guest | Copy only | Create account or dismiss | `login` mode register, or stay browsing | Dialog | Active overlay |
| Error / fallback route | — | Inline `FormError` | — | Failed `fetch` or API `detail` | Retry by using the control again | — | — | **Absent** as a route. API 401 drops the token. Unknown URL paths still show login or home; they are not a 404 page. |

## Redirects

| Event | Where the user lands |
| --- | --- |
| Token present on load | `dashboard`, then `GET /home` and `GET /me` |
| No token on load | `login` / choose. Guest flag is not restored. |
| Login, register, or Google success | `dashboard` |
| Guest “Look around first” | `dashboard` stage, but `OnboardingFlow` replaces Home |
| Guest tries to join, create, or save interests | `GuestRegisterPrompt`, then `login` in register mode |
| Create or join circle finished | `GET /home`, then `dashboard` |
| Leave circle from details opened on Home | `GET /home`, details close |
| Notification open | `circles` stage with `circlesDeepLink` (`details` or `chat`) |
| Log out or delete account | Token cleared, `dev_user_id` cleared, `login` |
| Browser refresh on any screen | Token decides login vs dashboard only. Tab, circle id, and chat are forgotten. |
