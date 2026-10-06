# Recommended first change

Do not rebuild Home. Do not add discovery sections. Do not add My Activity as a new stage yet.

## Smallest safe step

On the existing signed-in Home screen only, group the controls that the later My Activity screen will own, without moving their data or their handlers.

In `Dashboard.tsx`, wrap the existing block that already renders together:

- `HomeWeekStrip`
- the full-calendar toggle and `HomeCalendar`
- `HomeEmptyDayPrompt`
- `HomeSessionEvents`

Put that wrap in one `<section>` with an `aria-label` taken from new locale strings (English and Hebrew) such as “Your schedule”. Do not remove the compact `HomeNextActivityCard`, the greeting, or `HomeCirclesList`. Do not change what those components call.

No new stage, no header icon, no endpoint, no query, no hobby list, no recommendation card.

Why this is first: the risky part of My Activity is the shared `selectedDay` state and the attendance handlers. A labeled section proves the boundary in the real tree. A later change can move that section only after this grouping is still passing the checks below.

## Files that would change

- `web/src/ui/Dashboard.tsx` (section wrapper only)
- `web/src/locales/en.json`
- `web/src/locales/he.json`
- `web/src/ui/styles.css` (spacing for that one section, using existing home tokens)

## Files that stay untouched

- `web/src/ui/App.tsx` (stages, header, guest gate, deep links)
- `web/src/ui/HomeNextActivityCard.tsx`, `HomeWeekStrip.tsx`, `HomeCalendar.tsx`, `HomeSessionEvents.tsx`, `HomeCirclesList.tsx`, `HomeWelcomeHeader.tsx`
- `web/src/ui/Circles.tsx`, `CircleDetails.tsx`, `CircleChat.tsx`, `CreateJoinCircle.tsx`, `Login.tsx`
- `web/src/api/client.ts` and `web/src/api/types.ts`
- `backend/**`
- `db/**`
- Hobby icon rendering

## What the user should see

Home looks the same, with the week strip and the selected day clearly under one “Your schedule” heading. Greeting, next session, I’m in / Not now, My Circles, and Discover are unchanged. Guest “Look around” is unchanged.

## Risks

**Low** if the wrapper does not move state or buttons.

**Medium** if the new heading is mistaken for a new product area and people look for past meetups or invitations that are not there. Keep the heading honest (“Your schedule”), not “My Activity”, until that screen exists.

Do not include join, leave, chat, or navigation in this step.

## Regression checks

There is no automated suite. Run through these by hand on a real account (not seeded fake rows):

1. Sign in. Home still loads from `GET /home`. Greeting shows the account’s first name.
2. Next card still shows the hobby icon from the circle’s hobby, the next time, and I’m in / Not now. Attendance still updates after refresh.
3. Pick a day on the strip. Sessions for that day still list. An empty day still offers find and create.
4. Open a session’s circle and come back. The same day is still selected.
5. My Circles still expands, and leave or delete still returns to an updated home.
6. Guest “Look around first” still shows the explore welcome, not this schedule section.
7. Hebrew still flips direction. The new heading is translated.
8. `npm run typecheck` in `web/`.

## Rollback

Revert the four files above. No migration and no data write, so production data does not need a rollback. If the change was already deployed, redeploy the previous Vercel build. Render does not need a redeploy if the API was not touched.
