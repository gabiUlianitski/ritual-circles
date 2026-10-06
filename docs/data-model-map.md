# Data-model map

Source of truth: `db/schema.sql` plus `db/migrations/` through `029`. Access is asyncpg SQL in `backend/app/services/` and routers. There is no ORM.

Membership is **not** a table. Future `attendance` rows are the membership list. Do not add a members table unless product scope explicitly changes.

No migration is proposed here. Gaps are missing concepts, not unused columns.

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
- `city`, `country_code`, `city_name`, `meeting_place` (007)
- `"maxSize"` integer 1–6, join cap
- `group_size_json` fixed / max / min / range policy (022). `"maxSize"` is still what join enforces.
- `cost_payment_json` (023)
- `"inviteCode"` unique
- `invite_only` default true (006). False allows `POST /circles/join-open`.
- `ritual_level`, `ritual_subtype`
- `created_by` → `users.id` `ON DELETE RESTRICT` (ownership)
- `created_at`

There is **no status column** (no draft / active / archived). There is **no join-request table**. “Request to join” is UI copy that opens the invite-code form.

Pages: create wizard, discover, home my-circles, circle details, chat.

API: `POST /circles`, `GET /circles`, `PATCH /circles/{id}`, `GET /circles/me`, join, leave, drop.

### Circle membership

Derived. Join inserts `attendance` rows for future sessions in one transaction and rejects when distinct future members `>= maxSize` (`circles_service`). Leave deletes future attendance rows. Home member list is distinct `userId` on future attendance (`home_query.py`).

`isCreator` is `created_by == current user`, returned on home circle items and circle list items.

### `sessions` (meetups)

Primary key: `id`. `circleId` → circles `ON DELETE CASCADE`. `dateTime`. `locationOrLink` (URL when online, plain text when offline).

Created in a batch when a circle is created (about six weeks) and replenished when home is fetched (`session_replenish.py`). Recurrence is `circles.recurringTime` + `is_recurring`, not a separate schedule table.

Pages: Home calendar and next card, circle details, attendance.

API: `GET /sessions/next`, `GET /sessions`, and the sessions embedded in `GET /home`.

### `attendance`

Primary key: (`userId`, `sessionId`). `status` `attending` | `not_attending`, default `not_attending`, never null in the schema contract.

API: `PUT /sessions/{sessionId}/attendance`.

Pages: Home next card, day events, expanded my-circle row.

### Invitations

Only `circles."inviteCode"`. No invitee list, no email invite record, no pending-request row.

### Notifications

No table. The bell reads circles and chat, then stores `ritual_notif_inbox_v1:{userId}` in `localStorage`. Another browser does not see the same read state. `users.device_token` is unused by a sender.

### Chat

`circle_messages`: `id`, `circle_id` cascade, `user_id` cascade, `body` (1–4000 chars), `created_at`.

API: `GET/POST /circles/{id}/messages`. Suggestion accept/decline: `POST /circles/{id}/messages/{messageId}/suggestion` (creator only in `circle_suggestions.py`).

Page: `CircleChat` inside circle details. Notifications deep-link here.

### Locations

Circle columns above, plus session `locationOrLink`. City autocomplete uses external geocoders through `/geo/*`, not a cities table.

### Availability

User columns above. Not matched to circles by a server query today. Create-circle schedule is chosen in the wizard, not computed from member availability.

## API surface (prefix list)

| Prefix | Role |
| --- | --- |
| `/auth/*` | Register, login, Google, public config |
| `/home` | Signed-in home aggregate |
| `/me` | Profile, password, delete, device token |
| `/hobies` | Catalogue |
| `/circles` | List, create, patch, join, leave, drop, me, messages, suggestions, venue suggestions |
| `/sessions` | Next, list, attendance |
| `/community/preview` | Guest/landing counts and preview cards |
| `/geo/*` | Countries, city and language suggest, reverse locate, maps link |

`POST /reports` from the original product rules is **not implemented**.

## Pages that depend on `GET /home`

`App.refresh` loads it for every signed-in session. `Dashboard` reads `calendarSessions` and `myCircles`. Attendance and leave call `onRefresh`, which calls `GET /home` again. Notifications unread check uses the primary circle id from that payload. Moving calendar UI off Home without still calling `GET /home` on login would drop member counts, next session, and the unread check.
