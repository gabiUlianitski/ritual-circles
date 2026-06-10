# Designer → Developer handoff: web UI polish (Ritual Circles)

**Purpose:** Implement the UI/UX recommendations from the Designer + UIExpert review so the app feels **warmer**, **easier for non-technical users**, and **less like internal tooling**—without changing approved product scope (see `.cursor/rules/ritual-circles-v1.mdc`).

**Primary surfaces:** `web/src/ui/*` and `web/src/ui/styles.css`.

---

## 1. Global header navigation (`App.tsx`)

**Problem:** Many equal-weight buttons (Dashboard, Hobies, Circles, Profile, Logout, Refresh) crowd a **420px-wide** layout; they wrap awkwardly on phones and overwhelm users before they read the main content.

**Instruction:**

- Treat **Dashboard (home)** as the default anchor after login. Keep a **single obvious way back** to it from deeper screens (many child screens already have “Back”).
- Collapse secondary destinations into **one control**, e.g.:
  - A **“Menu”** or **“More”** button that opens a **simple panel or native `<details>`** listing: Hobies, Circles, Profile, Logout, Refresh; **or**
  - A compact **overflow pattern** (icon button “⋯” with the same list).
- **Logout** and **Refresh** do not need equal visual weight as Dashboard; they belong in the menu/overflow.
- **Acceptance:** On a 320px-wide viewport, the header shows **at most two** primary chrome controls besides the app title (e.g. **Menu** + optional **Home** if not redundant). No horizontal row of five+ text buttons.
- **Acceptance:** Focus order and keyboard: menu is reachable and dismissible (Escape closes if using a popover pattern).

---

## 2. Login and register copy (`Login.tsx`)

**Problem:** Copy references “minimal V1 auth”, “required by the server”—cold and implementation-focused.

**Instruction:**

- Replace intro copy with **short, benefit-oriented** language, e.g. why email/password exists and what happens next (one sentence each).
- Remove phrases like “V1”, “server”, “schema” from user-visible strings.
- For **availability time** on register:
  - Keep whatever format the API requires; improve **labels and help** only if the API is unchanged (e.g. helper: “Use 24-hour time, e.g. 18:00 for 6 pm” instead of only `HH:MM:SS` placeholder).
  - If product allows a **single time picker** that still submits `HH:MM` or `HH:MM:SS` to the API, prefer that later; **minimum** for this task: clearer helper + friendlier validation messages (no jargon).

**Acceptance:** A non-developer can read the register screen and understand **why** name and weekly availability are asked, without seeing engineering terms.

---

## 3. Create / join circle — tone and progressive disclosure (`CreateJoinCircle.tsx`)

**Problem:** Long scroll of decisions; blocks of text mention `GOOGLE_MAPS_API_KEY`, `backend/config/...`, Nominatim, Overpass, rate limits—appropriate for **developers**, not end users.

**Instruction:**

- **Default path:** Only user-relevant copy visible, e.g. “We suggest places near your city. Search can take up to a minute on slow connections.”
- Move **all** configuration keys, file paths, and third-party service names into a **collapsed `<details>`** section titled something like **“Having trouble with place search?”** or link to **`README`** / internal wiki—**not** in the default flow.
- Optionally group the create form into **clear sections** with short headings (already partly there): **When** → **What you do together** (hobby / type / level) → **Where** → **Who can join** (invite-only). Use **one sentence** of reassurance under each heading where helpful.
- Keep behavior and API payloads **unchanged** unless a bug fix is required; this task is **copy + layout + disclosure**.

**Acceptance:** A user who never reads the collapsed section can complete **create circle** without seeing env vars, JSON filenames, or provider names.

---

## 4. Errors and notices — visibility and accessibility

**Problem:** `.error` is small red text; easy to miss after scrolling; screen readers may not announce updates.

**Instruction:**

- For **dynamic** error messages that appear after user action (submit, join, save profile, attendance, venue search), ensure the container uses **`role="alert"`** and/or **`aria-live="polite"`** (use `assertive` only if legally/safety critical—usually not here).
- Consider a shared small component, e.g. `FormError({ children })`, to avoid repeating attributes.
- Optionally increase **minimum font size / line-height** for `.error` in `styles.css` so errors are readable at arm’s length on mobile.

**Apply at least to:** `App.tsx` (global fetch error), `Login.tsx`, `Dashboard.tsx`, `CreateJoinCircle.tsx`, `Profile.tsx`, `Circles.tsx`, `Hobies.tsx`, `CircleDetails.tsx`, `ReportUser.tsx`—wherever `.error` is set from async or validation failures.

**Acceptance:** Submitting an invalid form on mobile surfaces the message **without** requiring hunt; VoiceOver / TalkBack announces new errors when they appear.

---

## 5. Leave circle — avoid full page reload (`CircleDetails.tsx` + callers)

**Problem:** `location.reload()` after leave feels broken and loses SPA state.

**Instruction:**

- Add an optional callback prop, e.g. `onLeftCircle?: () => void` (or `onCircleMembershipChanged`), invoked after successful leave **instead of** `location.reload()`.
- **Parents** (`Dashboard` flow, `Circles` flow) must pass a handler that:
  - Calls the same **home refresh** logic you already use (`api.getHome` / parent `refresh`), and
  - Navigates the UI back to a sensible screen (e.g. dashboard list, circles list) **without** full document reload.

**Acceptance:** After leave, the user sees updated data and navigation with **no** full browser reload.

---

## 6. Visual warmth (token-level, minimal scope)

**Problem:** UI is calm but can feel clinical for people seeking connection.

**Instruction (small, reversible):**

- In `styles.css`, introduce **one secondary accent** (e.g. soft teal or warm amber) used **sparingly**: section subtitles, links, or focus rings—not competing with primary blue for main CTAs.
- Optionally add **8–12px extra padding** on primary cards on the dashboard only, if it improves breathing room without redesigning every screen.

**Acceptance:** Primary actions remain **clearly** primary (`button.primary`); new accent does not reduce contrast below **WCAG AA** for text on backgrounds.

---

## 7. Dashboard empty state (optional copy pass)

**Instruction:** One line of warmer, still honest copy under “You’re not in a circle yet” (e.g. orientation toward the next step without promising discovery feeds). Keep **one** primary button.

**Acceptance:** Still a single primary CTA; no extra screens.

---

## 8. Out of scope (do **not** implement as part of this handoff)

- New product features (chat, feeds, matching, public discovery beyond what already exists).
- New API endpoints or tables unless required for a bug uncovered during work.
- Replacing the entire design system.

---

## Definition of done (checklist)

- [x] Header navigation meets **320px** acceptance (section 1).
- [x] Login/register strings contain **no** internal engineering jargon (section 2).
- [x] Create circle hides technical/config copy by default (section 3).
- [x] Error regions for async/submit flows use **live region / alert** pattern (section 4).
- [x] Leave circle uses **callbacks + refresh**, not `location.reload()` (section 5).
- [x] Secondary accent + dashboard empty-state copy (sections 6–7).
- [x] `npm run build` passes; no new linter errors in touched files.

---

## Reference files (starting points)

| Area | Files |
|------|--------|
| Shell / nav | `web/src/ui/App.tsx` |
| Auth copy | `web/src/ui/Login.tsx` |
| Create/join | `web/src/ui/CreateJoinCircle.tsx` |
| Home | `web/src/ui/Dashboard.tsx` |
| Leave / details | `web/src/ui/CircleDetails.tsx`, callers in `Dashboard.tsx`, `Circles.tsx` |
| Styles | `web/src/ui/styles.css` |

If anything in this document conflicts with **Ritual Circles V1 rules**, the rules file wins; capture Designer intent as **future** work instead.
