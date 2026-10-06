# Component map

Pages are stages or embedded panels, not URL routes. See `route-map.md`.

## Page inventory

### Login (`web/src/ui/Login.tsx`, `LandingChoose.tsx`)

- Purpose: choose sign-in, registration, Google, or guest browsing.
- Shared: `WelcomePageShell`, `PrimaryButton`, `SecondaryButton`, `FeatureRow`, `FormError`, `CityAutocompleteField`.
- Specific: `GoogleWelcomeButton`, `FieldBlock`.
- Load: `GET /auth/config` from `main.tsx` for the Google client id.
- Mutations: `POST /auth/verify`, `POST /auth/start`, `POST /auth/google`, `POST /auth/google/complete`.
- Empty: Google button hidden when no client id.
- Loading: buttons disabled while `loading`.
- Error: `FormError` under the form.
- Roles: public. Notice prop when a guest was sent here to register.
- Layout: welcome card, same structure at phone and desktop widths.

### Guest explore (`GuestExploreWelcome.tsx`, `OnboardingFlow.tsx`)

- Purpose: look around without an account.
- Shared: welcome shell, `FeatureRow`, `WelcomeHobbyChips`.
- Specific: guest copy and hobby chips.
- Load: hobbies and `GET /community/preview`.
- Mutations: none. Join/create call `onRegisterRequest`.
- Empty: preview can be empty; chips depend on catalogue.
- Roles: guest only (`shouldShowWelcomeTutorial` is true only when `guest` is true).

### Guest hobby detail (`GuestHobbyDetail.tsx`)

- Purpose: one catalogue hobby before sign-in.
- Load: `GET /hobies`, then find the slug.
- Icon: `hoby.icon` from the catalogue. If missing, the icon slot is omitted.
- Actions: back, or “see circles” which sets a discover filter.

### Home (`Dashboard.tsx`)

- Purpose: greeting, next session, week strip, optional month calendar, selected-day attendance, my circles.
- Shared: `FormError`, `BidiText`, hobby icon text from API.
- Specific: `HomeWelcomeHeader`, `HomeNextActivityCard`, `HomeWeekStrip`, `HomeCalendar`, `HomeSessionEvents`, `HomeEmptyDayPrompt`, `HomeCirclesList`, `OnboardingChecklist`. Can swap itself for `CircleDetails` or `OnboardingFlow`.
- Load: parent already fetched `GET /home`. Dashboard also calls `GET /me`.
- Mutations: `PUT /sessions/{id}/attendance` from the next card, day events, and expanded circle rows.
- Empty: no sessions → empty next card plus find/create. Empty day → `HomeEmptyDayPrompt`. No circles → find/create empty copy.
- Loading: no page skeleton. Parent shows `common.loading` only when `home === null`. Attendance buttons show a saving label.
- Error: `FormError` on the card that failed.
- Roles: signed-in member data only. This screen does not list circles the user has not joined. Guest never sees this body; they see onboarding.
- Layout: `.app--home` background and 1100px column. Event card stacks actions under the text below 720px. Week strip scrolls.

### Circles (`Circles.tsx`)

- Purpose: discover open circles, circles I created, circles I joined.
- Shared: `DiscoverCircleCard`, `FormError`, `CreateJoinCircle` when the form is open, `CircleDetails` when a card is open.
- Specific: tab bar, filters, join-state helper.
- Load: `GET /circles`, `GET /hobies`.
- Mutations: `POST /circles/join-open`, and create/join/leave/drop through child components.
- Empty: separate empty copy per tab.
- Roles: guest can open discover; join and create ask for an account. `isCreator` splits mine vs joined. Full circles disable join. `inviteOnly` does not create a request; it opens the invite-code form.
- Layout: one column. Tabs are buttons, not routes.

### Create / join (`CreateJoinCircle.tsx`, `CreateCircleWizard.tsx`)

- Purpose: create a circle or join with an invite code. Also opened inline from Circles.
- Specific steps: hobby, group size, cost/payment, venue, schedule.
- Load: `GET /hobies`. Venue: `POST /circles/venue-suggestions`, geo resolve endpoints.
- Mutations: `POST /circles`, `POST /circles/join/{inviteCode}`.
- Empty / error: step validation and `FormError`.
- Roles: signed-in only. Guest is redirected to register before this stage.

### Circle details (`CircleDetails.tsx`)

- Purpose: one circle the user already belongs to.
- Shared: `CircleDetailsSummary`, `CircleDetailsMembersSection`, `CircleParticipationDisplay`, `CircleChat`, `CircleScheduledTab` (owner).
- Load: `GET /circles/me?circleId=`.
- Mutations: leave `POST /circles/leave`, drop `POST /circles/drop`, chat posts, `PATCH /circles/{id}` on the scheduled tab.
- Empty: missing circle shows an error string.
- Roles: non-members do not get this page from discover until they join. Owner sees Details and Scheduled tabs. Members see details (chat included). Passing `initialTab="chat"` still lands on details and scrolls to chat.

### Notifications (`Notifications.tsx`)

- Purpose: local inbox of chat, new members, dropped circles, and schedule/place suggestions.
- Load: `syncNotificationInbox` reads circles and messages, then `localStorage`.
- Mutations: local read/delete flags. Accepting a suggestion calls the circle suggestion endpoint.
- Empty: empty inbox copy.
- Roles: signed-in. Destinations are circle details or chat via `openCircleFromNotification`.

### Profile (`Profile.tsx`)

- Purpose: about you, hobbies, security.
- Specific: `ProfilePersonalTab`, `ProfileHobbiesTab`, `ProfileLanguagesPicker`, `ProfileAvailabilityPicker`, `ProfilePlaceAutocomplete`.
- Load: `GET /me`.
- Mutations: `PATCH /me`, `POST /me/password`, `DELETE /me`.
- Empty: password “not set” for Google-only accounts. Hobbies list can be empty.
- Roles: the signed-in user only.

### Hobbies catalogue (`Hobies.tsx`)

- Purpose: browse and edit hobby rows, including the icon string stored in `hobies.icon`.
- Load / mutations: `GET /hobies`, `POST /hobies`, `PATCH /hobies/{slug}`, precheck and spell-suggest.
- This is the admin-style catalogue screen, reached from Menu. It is not the user’s “my hobbies” list (that is Profile → Hobbies, stored on `users.user_hobies_json`).

## Reuse map for the future screens

Do not build these yet. This is what already exists.

| Needed piece | Reuse now | Gap |
| --- | --- | --- |
| Global navigation | Header icon buttons and Menu in `App.tsx` | No Circles sub-nav. No My Activity control. Active state is `stage === ...` only. Guest welcome uses a different menu. |
| Mobile navigation | Same header. No bottom bar. | Icons are 44px. Menu is a word, not an icon. No way back to a circle after refresh. |
| Page header | App title is a static `h1` (`nav.appTitle`). Welcome has `WelcomeHeadline`. Home greeting is `HomeWelcomeHeader`. | Three different header systems. |
| Hobby icon | Text from `hobies.icon`, delivered as `hobyIcon` or `hoby.icon`. Rendered in `circleDisplay.tsx`, home cards, discover filters, profile hobbies, guest chips, `Hobies.tsx`. Badge chrome is `.home-hobby-badge`. | Badge class is home-specific. Other screens use raw font-size. Empty icon renders an empty badge or nothing, depending on the screen. No image URL pipeline; the field is a short string, usually an emoji. |
| Circle card | `DiscoverCircleCard` for catalogue cards. `HomeCirclesList` compact rows for Home. | Two card designs. Home card expands in place; discover card opens details. |
| Opportunity card | `DiscoverCircleCard` is the closest. Community preview on the guest page is a separate, smaller preview. | No “people needed”, “almost ready”, or “new near you” card. Do not invent those counts. |
| Status badge | `.home-status-badge` (`pending`, `confirmed`, `full`) | Colors differ slightly by screen (home gold pending vs older green borders on details). |
| Group-progress indicator | `CircleParticipationDisplay` and `circleParticipation.ts` (joined vs `maxSize`, spots left) | Not a shared progress bar. Copy differs from the home one-line summary (`formatJoinedLine`). |
| Empty state | `onboarding-empty-guidance` on Home; per-tab empty blocks on Circles; welcome reassurance | Not one component. |
| Primary / secondary buttons | Welcome: `.welcome-btn--primary` / `--secondary`. Home: `.home-hero-primary` / `.home-hero-secondary` and `.dashboard-home button.primary`. Everywhere else: global `button` / `button.primary` in `styles.css`. | Three button systems. |
| Compact upcoming-activity card | `HomeNextActivityCard` | Already compact and horizontal. It still owns attendance mutations, so moving it means moving those handlers too. |
| Personalized inspiration card | **No component.** Guest chips and community preview are not personalized to the signed-in user. | Needs a new query decision before any UI. See `current-product-inventory.md` section 10 in the companion risk notes. |

## Shared foundations worth keeping

- `web/src/api/client.ts` `api` object and types in `web/src/api/types.ts`
- `GET /home` as the Home payload (`circle`, `nextSession`, `myAttendance`, `myCircles`, `calendarSessions`)
- `circleDisplay.tsx` for hobby title + icon
- `homeDashboardUtils.ts` for upcoming sort, date labels, joined line
- `FormError`, `BidiText`
- Welcome tokens in `welcome.css` as the visual reference, without copying welcome layout onto every page
