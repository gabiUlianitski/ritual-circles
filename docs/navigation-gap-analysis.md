# Navigation gap analysis

Current global chrome is the header in `web/src/ui/App.tsx`. It is hidden when `stage === "login"` or when the guest welcome is showing. There is no bottom navigation and no URL.

Icons for Home, Circles, Profile, and Notifications are inline SVGs in `App.tsx` (22×22, `fill="currentColor"`). They are not hobby icons and not from a library. The Menu control is the translated word `nav.menu`, not an icon.

Active state: class `is-active` when `stage` equals that button’s stage. Embedded circle details, create-circle, and hobbies do not light a matching icon except by the stage underneath (create uses no extra stage highlight beyond leaving dashboard; details stay on `dashboard` or `circles`).

## Controls

| Control | Destination | Handler | Label | Visible when | Auth | Mobile |
| --- | --- | --- | --- | --- | --- | --- |
| Home | `stage = dashboard` | `navigate("dashboard")` | `aria-label` / `title` = `nav.home`. No visible text. | Signed-in header, hidden during `onboardingMode` | Token expected. Guests do not see this header while the welcome is up. | 44×44 button. Same row as the other icons; it can wrap because the header is `flex-start`. |
| Circles | `stage = circles` | `navigate("circles")` increments `circlesVisitKey` | `nav.discoverCircles` as aria-label only | Same as Home | Same | Same. Opens Discover tab by default unless a deep link or date/hobby filter is set. |
| Profile | `stage = profile` | `navigate("profile")` | `nav.profile` aria-label only | Signed-in, not guest, not onboarding mode | JWT | Same |
| Notifications | `stage = notifications`, remembers previous stage | `openNotifications()` | `nav.notifications`. Dot when `hasUnread`. | Same as Profile | JWT. Unread comes from local inbox sync, not a server feed. | Same. Back returns to `returnStageAfterNotif`. |
| Menu | Opens `#app-nav-menu` | `setMenuOpen` | Visible text `nav.menu` | Signed-in header. Guest welcome uses `WelcomePageMenu` instead (sign in / register, language). | Language works signed-in. Hobbies and Log out are signed-in only. Guest header menu does not list hobbies. | Word button, height 44px, width hugs the label. Dropdown is `position: absolute` and is the only “settings” UI. |
| Back | Parent callback, not history | Each page’s `onBack` | Per screen (`Back`, welcome back link, discover back) | Details, profile, hobbies, notifications, create, circles | Depends on the screen | Stack only. Browser Back does not follow it. |

## Deep links and redirects

| Path | Behavior | Gap |
| --- | --- | --- |
| Any URL path | Ignored. Token → Home, else Login. | A shared circle link cannot open that circle. Only `inviteCode` typed into the join form works. |
| After login / register / Google | `authed()` → dashboard + `GET /home` | No return to the guest hobby or circle the person was viewing. |
| After create or join | `GET /home` then dashboard | Does not open the new circle’s details. |
| Notification → circle | In-memory `CirclesDeepLink` `{circleId, initialTab}` | Lost on refresh. Chat tab is implemented as “details + scroll to chat”. |
| Guest “see circles for hobby” | `discoverHobbyFilter` + `circles` stage | Filter is memory-only. |

## Inconsistencies (not fixed)

1. **Circles icon is one destination with three jobs.** Discover, circles I created, and circles I joined are tabs inside `Circles.tsx`. The header never shows which tab is active.
2. **Home also has “My Circles”.** That list is a second membership UI (`HomeCirclesList`) beside the Circles tabs. Actions overlap (open details, attendance, leave/drop on expand) but the layouts differ.
3. **Create circle has two entrances:** header path `createJoin`, and an inline form on the Circles page. Both mount `CreateJoinCircle`.
4. **Chat is not a destination.** Notifications and some buttons pass `initialTab: "chat"`, but `CircleDetails` converts that to the details tab and then scrolls. Owners get a Scheduled tab; members do not.
5. **Menu hides Hobbies.** The catalogue screen is real and editable, but it is not in the icon bar. Profile → Hobbies is a different screen (the user’s list, not the catalogue).
6. **Guest and member headers differ.** Guest welcome has no Home / Circles / Profile icons. After a guest opens Circles, the signed-in header appears only if they are no longer in `guestWelcomeActive`. Guest on `circles` sees the app header without Profile and Notifications.
7. **Active icon lies during details.** Opening a circle from Home leaves `stage === "dashboard"`, so Home stays active while the user is in details or chat.
8. **No My Activity item.** Calendar, attendance, and upcoming sessions live only on Home. The approved direction wants those on My Activity. Nothing in the header can point there yet.
9. **No password-recovery or settings route.** Security is a Profile tab. Language is only inside Menu.
10. **Refresh resets navigation** except login vs home. That will get worse if My Activity, Discover, and a circle id become separate places without a URL.

## What a later navigation change must preserve

- Stage names already used in code (`dashboard`, `circles`, `profile`, `notifications`, `createJoin`, `hobies`, `hobbyDetail`, `login`) unless a deliberate compatibility pass is planned. This inspection does not rename them.
- `navigate("circles")` and `CirclesDeepLink`.
- Guest gate: join and create must still call `onRegisterRequest` instead of hitting join APIs.
- Back from details must still refresh home when the user left the circle.
