# Data-model map

Source of truth: `db/schema.sql` plus `db/migrations/` through `044`. Access is asyncpg SQL in `backend/app/services/` and routers. There is no ORM.

## Current architecture

```
Hobby
  └── Circle
       ├── CircleMember
       └── Activity
            ├── ActivityParticipant
            ├── ActivityOccurrence
            │    └── ActivityOccurrenceParticipant
            └── ActivitySuggestion
                 └── ActivitySuggestionSupport
```

- **Circle** = the persistent community around a hobby.
- **Activity** = a real-world gathering a Circle organizes (one date, or recurring weekly).
- **ActivityOccurrence** = one date of a recurring Activity. Users see "this date", never "occurrence".
- **Circle membership ≠ Activity participation.** Joining a Circle joins no Activity. Going to an Activity is `activity_participants` (one-time) or `activity_occurrence_participants` (one date of a recurring Activity).

"Activity" is the technical name and the user-facing name. "Plan" appears in copy only as a verb ("Plan an Activity").

Legacy `sessions` and `attendance` are read-only history (see below). No code path reads or writes them.

## Tables

### `users`

Primary key: `id` UUID.

Fields used by the product:

- Identity: `user_name`, `first_name`, `last_name`, `email` (nullable, unique when set), `password_hash` (nullable), `google_sub` (migration 017)
- Place and contact: `city`, `phone`, `hometown`, `birth_date`, `work_summary`, `education_summary` (014)
- Languages: `languages_json` (015)
- Availability: `availability_day`, `availability_time` (required in schema), `availability_windows_json` (018)
- Device: `device_token` nullable. `POST /me/device-token` stores it. No push sender is implemented.
- Hobbies: `preferred_hoby_slug`, `preferred_hoby_level`, `preferred_hoby_subtype`, `user_hobies_json` (array of `{slug, subtype, level}`)
- `onboarding_completed` (029)
- `created_at`

Relationships: owns circles via `circles.created_by`. Attendance and messages reference `users.id` with `ON DELETE CASCADE`. Deleting a user reassigns or deletes circles they created (`users_service.delete_account`).

Pages: login/register, Profile, Home checklist, hobby preferences on create-circle and discover filters.

API: `GET/PATCH /me`, `POST /me/password`, `DELETE /me`, `POST /me/device-token`, auth routes.

### `hobies` (renamed from `habits` in migration 005)

Primary key: `id` UUID. Natural key: `slug` UNIQUE.

| Field | Role |
| --- | --- |
| `display_name` | Hobby name (default language) |
| `icon` | Short text, typically one emoji. Nullable. This is the only icon source for circles and home. |
| `short_description` | Catalogue blurb |
| `levels_json` | Skill levels for that hobby. Not a separate table. |
| `types_json` | Subtypes / subcategories. Not a separate table. |
| `interest_category` | Coarse category (migration 021) |
| `group_size_json` | Default size hint when creating a circle (025) |
| `i18n_json` | Per-language name, description, types, and levels (026, 027, 028) |

API: `GET/POST /hobies`, `PATCH /hobies/{slug}`, `POST /hobies/precheck`, `POST /hobies/spell-suggest`.

Frontend: `api.getHobies()` then `localizeHobies`. Icons are passed through as strings. Nothing in the client maps a slug to a built-in icon.

Fallback when `icon` is null: Home still renders an empty `.home-hobby-badge`. Discover filters and profile rows omit the glyph. `circleDisplay.tsx` omits the icon node. There is no generic replacement icon.

### User hobbies

Not a table. `users.user_hobies_json`, with legacy `preferred_hoby_*` kept in sync by `backend/app/user_hobbies.py`.

Pages: Profile → Hobbies, onboarding interests (guest), create-circle hobby choice, discover hobby filter.

### Subcategories and skill levels

Not tables. `hobies.types_json` and `hobies.levels_json`. A circle stores the chosen values on `circles.ritual_subtype` and `circles.ritual_level` (text, migration 020). A user’s choice is inside `user_hobies_json`.

### `circles`

Primary key: `id` UUID.

Fields:

- `ritualType` (hobby slug string, not a foreign key in the original schema)
- `modality` `online` | `offline`
- `recurringTime` (text schedule)
- `is_recurring` (019)
- `city`, `country_code`, `city_name`, `meeting_place` (007). `meeting_place` is one text line: `<place name> — <address>`, or only the name. The city is where the Circle is based. It is not a venue, and a new Activity does not copy it into `location_name` when no preferred place is set.

  Future structured place fields (not built; no migration): preferred place name, address, latitude, longitude, and a provider id. Those would support distance-based discovery, nearby Activities, deduplication, and a map, without geocoding the text again.

  Changing the city while a preferred place is selected still uses the browser confirm dialog. There is no shared confirmation component to replace it.
- `"maxSize"` integer 1–6, kept in step with `group_size_json`; a fallback for the default Activity size. Not a membership cap.
- `group_size_json` fixed / max / min / range policy (022): the Circle's typical group size. Descriptive only; it pre-fills a new Activity's maximum `group_size`. A new Activity's `min_participants` starts equal to that maximum.
- `cost_payment_json` (023)
- `"inviteCode"` unique
- `invite_only` default true (006). False allows `POST /circles/join-open`.
- `ritual_level`, `ritual_subtype`
- `created_by` → `users.id` `ON DELETE RESTRICT` (ownership)
- `created_at`

There is **no status column** (no draft / active / archived). There is **no join-request table**. “Request to join” is UI copy that opens the invite-code form.

Pages: create wizard, discover, home my-circles, circle details, chat.

API: `POST /circles`, `GET /circles`, `PATCH /circles/{id}`, `GET /circles/me`, join, leave, drop.

### `circle_members` (migration 038)

One row per user and circle, `status` `active` | `left`. Join inserts or reactivates the row in one transaction (`circles_service`, `circle_members.py`). Membership is unlimited: join never consults `maxSize`, `group_size_json`, or the member count. Only an Activity's `group_size` limits going participants. Leave sets `left`. Home `myCircles` and `memberCount` come from active rows (`home_query.py`).

`isCreator` is `created_by == current user`, returned on home circle items and circle list items.

### Activities (migrations 039–047)

| Table | Role |
| --- | --- |
| `activities` | The gathering: title, start/end, place, payment, `recurrence_type` (`one_time` / `recurring`) + `recurrence_rule`, lifecycle `status` (`draft`, `open`, `confirmed`, `completed`, `cancelled`). `min_participants` is the readiness threshold and `group_size` is the capacity. Ready and Full are calculated from going participants; neither is stored or used as a lifecycle status. The creator is a normal going participant. |
| `activity_participants` | Who is going to a one-time Activity. `attendance_status` (`pending` \| `attended` \| `no_show`) records afterwards whether a going person came; it is separate from the RSVP `status`, set only by the creator or Circle owner, and shown only to them |
| `activity_occurrences` | Dates of a recurring Activity. Topped up to a rolling window by `ensure_future_activity_occurrences` (`activities_service.py`, rules in `activity_recurrence.py`) |
| `activity_occurrence_participants` | Who is going to one date, with that date's own `attendance_status` |
| `activity_suggestions` / `activity_suggestion_support` | Member time/place suggestions and their support. Accepting one changes the Activity and may ask participants to reconfirm |
| `activity_notifications` | In-app Activity notifications: one row per recipient and event, written in the same transaction as the change, unique per `(user_id, dedup_key)`. Identifiers only; read/dismiss state stays in the client inbox. Push is not implemented |

API: `POST/GET /circles/{circleId}/activities`, `GET /circles/{circleId}/activity-defaults`, `GET/PATCH /activities/{activityId}`, `/activities/{activityId}/publish|confirm|complete|cancel|join|leave|reconfirm|suggestions`, `/activities/{activityId}/occurrences/{occurrenceId}/join|leave|reconfirm|suggestions`, `/activity-suggestions/{suggestionId}/support|support/remove|withdraw|accept|decline`.

Pages: Circle Details activities list, Create / Edit Activity (shared form), Activity Details, Home upcoming activities, Discover "Next activity".

### `sessions` (meetups)

Primary key: `id`. `circleId` → circles `ON DELETE CASCADE`. `dateTime`. `locationOrLink` (URL when online, plain text when offline).

Retired. Read-only history: no runtime code creates, replenishes, or reads Sessions, and no API exposes them. Meetups are Activities (`activities`, `activity_occurrences`).

### `attendance`

Primary key: (`userId`, `sessionId`). `status` `attending` | `not_attending`, default `not_attending`, never null in the schema contract.

Retired. Read-only history: no runtime code writes or reads Attendance, and no API exposes it. Participation is `activity_participants` / `activity_occurrence_participants`.

### Invitations

`circles."inviteCode"` for share links, plus `circle_invitations` (migration 034) for direct invitations with `pending` / `accepted` / `declined` / `canceled` status. Accepting joins the Circle through the same join transaction.

### Notifications

No table. The bell reads circles and chat, then stores `ritual_notif_inbox_v1:{userId}` in `localStorage`. Another browser does not see the same read state. `users.device_token` is unused by a sender.

### Chat

`circle_messages`: `id`, `circle_id` cascade, `user_id` cascade, `body` (1–4000 chars), `created_at`.

API: `GET/POST /circles/{id}/messages`. Suggestion accept/decline: `POST /circles/{id}/messages/{messageId}/suggestion` (creator only in `circle_suggestions.py`).

Page: `CircleChat` inside circle details. Notifications deep-link here.

### Locations

Circle columns above, plus each Activity's own place (and per-date overrides on `activity_occurrences`). City autocomplete uses external geocoders through `/geo/*`, not a cities table.

### Availability

User columns above. Not matched to circles by a server query today. Create-circle schedule is chosen in the wizard, not computed from member availability.

## API surface (prefix list)

| Prefix | Role |
| --- | --- |
| `/auth/*` | Register, login, Google, public config |
| `/home` | Signed-in home aggregate |
| `/me` | Profile, password, delete, device token |
| `/hobies` | Catalogue |
| `/circles` | List, create, patch, join, leave, drop, me, messages, suggestions, venue suggestions, invitations, a circle's activities |
| `/activities`, `/activity-suggestions` | Activity details, lifecycle, participation, dates, suggestions, reconfirmation |
| `/community/preview` | Guest/landing counts and preview cards |
| `/geo/*` | Countries, city and language suggest, reverse locate, maps link |

`POST /reports` from the original product rules is **not implemented**.

## Pages that depend on `GET /home`

`App.refresh` loads it for every signed-in session. `Dashboard` reads `upcomingActivities` and `myCircles` (member counts come from active `circle_members`). Leave calls `onRefresh`, which calls `GET /home` again. Notifications unread check uses the primary circle id from that payload.
