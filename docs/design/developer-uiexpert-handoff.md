# UIExpert → Developer handoff: accessibility, mobile patterns, consistency

**Purpose:** Turn UIExpert review goals into **implementable checks** so the web app stays **easy for all computer and mobile literacy levels**, and patterns stay **portable to Android and iOS**—without expanding product scope (see `.cursor/rules/ritual-circles-v1.mdc`).

**Companion doc:** `docs/design/developer-ui-polish-handoff.md` (Designer-led copy/navigation/warmth). Many items overlap; this file emphasizes **interaction, accessibility, density, and cross-platform UI habits**.

---

## 1. Navigation density (small screens)

**Goal:** On **~320px** width, users should not see a **long row of equal-weight chrome buttons** before the main content.

**Instructions:**

- Prefer **one entry** (e.g. **Menu**) for secondary destinations, overflow actions (refresh, log out), and optional “Home”.
- If you add new global actions, **add them inside the menu** (or a single overflow), not as new top-level buttons.

**Acceptance:** With the keyboard, user can reach **Menu → first item → activate** without tabbing through five unrelated destinations first.

**Status:** Addressed in current web shell (`App.tsx` menu). **Do not regress** by re-adding a horizontal button bar.

---

## 2. Forms: time, dates, and “power user” inputs

**Goal:** People who do not think in **24-hour strings with seconds** should still succeed; **API format** can stay strict while **labels and help** carry the load.

**Instructions:**

- For any **free-text time** field: show **plain-language help** (e.g. “18:00 means 6 pm”) and **examples** in labels or helper text, not only `HH:MM:SS` placeholders.
- Prefer **native pickers** (`type="time"`, `datetime-local`) where they reduce typing errors; keep server payload mapping unchanged.
- **Validation messages** must sound like **human guidance**, not schema errors (see `Login.tsx` / `Profile.tsx` patterns).

**Acceptance:** A first-time user can complete register/profile **without** understanding what “V1” or “server” means.

---

## 3. Long flows: progressive disclosure (Create circle)

**Goal:** Many decisions on **one long scroll** increase abandonment; **grouping** and **optional depth** reduce perceived complexity.

**Instructions:**

- Keep **one screen** if product requires it, but use **clear section headings**, **visual separators** (border/spacing), and **`<details>`** (or accordions) for **optional** or **troubleshooting** content—not for required fields users must see to submit.
- Do not hide **required** steps inside collapsed regions unless an explicit “Show more” makes the requirement obvious.
- When adding fields to create/join flows, ask: “Does this belong in the default path or under **Having trouble?** / **Advanced**?”

**Acceptance:** A user can scan **headings only** and know **order of tasks** (when → what → where → who can join).

**Status:** Create flow partially restructured in `CreateJoinCircle.tsx`; **extend the same pattern** if the form grows.

---

## 4. Errors: visible, readable, announced

**Goal:** Errors after **async** or **submit** actions must not be **easy to miss** or **silent** for assistive tech.

**Instructions:**

- Use a shared component (e.g. **`FormError`**) that includes at minimum:
  - `role="alert"`
  - `aria-live="polite"` (reserve `assertive` for rare urgent cases)
- Keep error text at least **~13px** with comfortable **line-height** on mobile.
- Place errors **near the control or primary action** that failed when possible; global errors stay under the header.

**Acceptance:** Turning on VoiceOver / TalkBack and triggering a failed save **announces** the new message.

**Status:** `FormError` added; use it for **new** error surfaces—do not reintroduce raw `<div className="error">` for dynamic failures.

---

## 5. Full-page reload vs in-app state

**Goal:** Avoid **`location.reload()`** for normal flows; it feels like a bug and resets scroll, focus, and SPA context.

**Instructions:**

- After **leave circle**, **join**, or **create** where the tree changes, use **callbacks** from the child to the parent: parent calls **refresh** (`getHome` / list reload) and **updates local navigation state**.
- Preserve **focus management** where reasonable (e.g. return focus to “Back” or main heading after closing a sub-view).

**Acceptance:** Leaving a circle updates the UI **without** a full document reload.

**Status:** Implemented via `onLeftCircle` on `CircleDetails`; **reuse this pattern** for similar mutations.

---

## 6. Visual consistency (tokens and surfaces)

**Goal:** Dropdowns, overlays, and cards should share **one background/border language** so the app does not feel patched together—especially when skinning for **Android/iOS** later.

**Instructions:**

- Prefer **shared CSS variables** or classes (e.g. same **card background** as `.card`) for popovers, suggestion lists, and menus—not one-off hex values scattered in inline styles—unless there is a documented exception.
- When introducing a new surface, **match border-radius, shadow, and border** to existing cards.

**Acceptance:** City/venue suggestion panels visually match **card** surfaces in light/dark review.

**Status:** **CSS variables** (`--page-bg`, `--card-bg`, `--card-border`, etc.) drive `.card`, inputs, menu, and **`.popover-list`** (city suggestions). Inline hex for those surfaces should stay rare.

---

## 7. Touch targets and tap order (mobile-first web → native)

**Goal:** Layouts that work on **narrow web** should map to **large tap targets** and **predictable back** on native shells.

**Instructions:**

- Primary actions: full-width or **≥44×44px** effective touch area where the design system allows.
- Every full-screen or pushed sub-view needs an explicit **Back** (or system back) that returns to a **known parent** state.
- Avoid **only** icon-only critical actions without `aria-label` (when you add icons).

**Acceptance:** No critical action relies on a hit target smaller than about **44×44px** (or full-width buttons) or hover-only affordance.

---

## 8. Porting checklist (when building Android / iOS)

**Instructions (for the native developer):**

- Mirror **one-column** layouts and **single primary CTA** per step.
- Replace web **Menu** with **platform-appropriate** overflow (e.g. toolbar menu / more sheet)—same **information architecture**, not necessarily the same widget.
- Reuse **copy** and **section order** from web unless platform HIG forces a minor reorder.
- Implement **same live-region / error announcement** behavior using platform accessibility APIs.

---

## 9. Out of scope

- New feeds, tabs-as-main-navigation, chat-first UX, or discovery features unless product scope changes.
- Pixel-perfect parity with third-party apps; goal is **clarity and accessibility**, not cloning Facebook.

---

## Definition of done (UIExpert checklist)

- [x] Global chrome stays **low-density** on 320px (menu pattern preserved).
- [x] Time/date fields have **human-readable** help; validation copy stays non-technical (`Login`, `Profile`).
- [x] Long forms use **sections + disclosure** for optional/troubleshooting content only (`CreateJoinCircle`).
- [x] Dynamic errors use **`FormError`** (or equivalent `alert` + `aria-live`).
- [x] No **`location.reload()`** for normal post-mutation flows; use **callbacks + refresh** (`CircleDetails` leave).
- [x] Floating surfaces use **shared tokens** + **`.popover-list`** for city suggestions; app menu uses **card**-aligned tokens.
- [x] Menu items / primary actions meet **~44px** minimum height where styled (`app-menu-trigger`, `app-nav-item`, `button.primary`); Escape / outside click returns focus to **Menu**.
- [ ] Touch targets and **Back** behavior documented for any **new** full-screen flow (ongoing when adding screens).

---

## Reference files

| Topic | Files |
|-------|--------|
| Menu / shell | `web/src/ui/App.tsx` |
| Form errors | `web/src/ui/FormError.tsx`, consumers across `web/src/ui/*.tsx` |
| Auth / time help | `web/src/ui/Login.tsx`, `web/src/ui/Profile.tsx` |
| Long create flow | `web/src/ui/CreateJoinCircle.tsx` |
| Leave / state | `web/src/ui/CircleDetails.tsx`, `Dashboard.tsx`, `Circles.tsx` |
| Tokens / focus | `web/src/ui/styles.css` |

If UIExpert instructions conflict with **Ritual Circles V1 rules**, the rules file wins.
