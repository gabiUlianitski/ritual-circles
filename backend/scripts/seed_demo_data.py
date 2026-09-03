"""
Seed demo users and circles so Discover / onboarding feels live.

Usage (from backend/ with venv active):

  cd backend
  python scripts/seed_demo_data.py

Options:
  --users 24          Number of demo users (min 20)
  --circles 45        Number of demo circles (min 40)
  --cleanup           Remove previous seed data (emails *@ritualcircles.dev) first
  --dry-run           Print plan only, no writes

Requires DATABASE_URL in backend/.env (local Postgres or Supabase).
All seed accounts use password: 123123
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime, timedelta, time, timezone
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

SEED_PASSWORD = "123123"
SEED_EMAIL_SUFFIX = "@ritualcircles.dev"
SEED_USER_PREFIX = "seed_user_"  # legacy cleanup only

# Human-looking demo accounts (matches db/seed_demo_data.sql)
SEED_PROFILES: list[tuple[str, str, str, str]] = [
    ("Noa", "Cohen", "noa_cohen", "noa.cohen@ritualcircles.dev"),
    ("Yael", "Levi", "yael_levi", "yael.levi92@ritualcircles.dev"),
    ("Maya", "Mizrahi", "maya_mizrahi", "maya.mizrahi@ritualcircles.dev"),
    ("Daniel", "Peretz", "daniel_peretz", "daniel.peretz@ritualcircles.dev"),
    ("Omer", "Biton", "omer_biton", "omer.biton@ritualcircles.dev"),
    ("Avi", "Azoulay", "avi_azoulay", "avi.azoulay@ritualcircles.dev"),
    ("Shira", "Friedman", "shira_friedman", "shira.friedman@ritualcircles.dev"),
    ("Eitan", "Katz", "eitan_katz", "eitan.katz@ritualcircles.dev"),
    ("Lior", "Dahan", "lior_dahan", "lior.dahan@ritualcircles.dev"),
    ("Tamar", "Shapiro", "tamar_shapiro", "tamar.shapiro@ritualcircles.dev"),
    ("Ido", "Bar", "ido_bar", "ido.bar@ritualcircles.dev"),
    ("Ron", "Golan", "ron_golan", "ron.golan@ritualcircles.dev"),
    ("Gal", "Weiss", "gal_weiss", "gal.weiss@ritualcircles.dev"),
    ("Neta", "Cohen", "neta_cohen", "neta.cohen@ritualcircles.dev"),
    ("Amir", "Levi", "amir_levi", "amir.levi@ritualcircles.dev"),
    ("Hila", "Mizrahi", "hila_mizrahi", "hila.mizrahi@ritualcircles.dev"),
    ("Tom", "Peretz", "tom_peretz", "tom.peretz@ritualcircles.dev"),
    ("Roni", "Biton", "roni_biton", "roni.biton@ritualcircles.dev"),
    ("Ben", "Azoulay", "ben_azoulay", "ben.azoulay@ritualcircles.dev"),
    ("Dana", "Friedman", "dana_friedman", "dana.friedman@ritualcircles.dev"),
    ("Gil", "Katz", "gil_katz", "gil.katz@ritualcircles.dev"),
    ("Maayan", "Dahan", "maayan_dahan", "maayan.dahan@ritualcircles.dev"),
    ("Yuval", "Shapiro", "yuval_shapiro", "yuval.shapiro@ritualcircles.dev"),
    ("Adi", "Bar", "adi_bar", "adi.bar@ritualcircles.dev"),
]

FIRST_NAMES = [
    "Noa", "Yael", "Maya", "Daniel", "Omer", "Avi", "Shira", "Eitan",
    "Lior", "Tamar", "Ido", "Ron", "Gal", "Neta", "Amir", "Hila",
    "Tom", "Roni", "Ben", "Dana", "Gil", "Maayan", "Yuval", "Adi",
    "Nicole", "Gabi", "Sarah", "David", "Rachel", "Michael",
]

LAST_NAMES = [
    "Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Azoulay", "Friedman",
    "Katz", "Dahan", "Shapiro", "Ulianitski", "Bar", "Golan", "Weiss",
]

CITIES = [
    ("IL", "Tel Aviv", "Tel Aviv-Yafo"),
    ("IL", "Jerusalem", "Jerusalem"),
    ("IL", "Haifa", "Haifa"),
    ("IL", "Rishon LeZion", "Rishon LeZion"),
    ("IL", "Raanana", "Raanana"),
    ("IL", "Herzliya", "Herzliya"),
    ("IL", "Beer Sheva", "Beer Sheva"),
    ("IL", "Netanya", "Netanya"),
]

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
HOURS = [8, 9, 10, 11, 17, 18, 19, 20]
LEVELS = ["beginner", "intermediate", "advanced"]

VENUES = [
    "Community center",
    "Park meeting point",
    "Local café",
    "Sports club",
    "Municipal court",
    "Riverside path",
]


async def fetch_hobby_slugs(conn: asyncpg.Connection) -> list[str]:
    rows = await conn.fetch("SELECT slug FROM hobies ORDER BY slug")
    slugs = [str(r["slug"]).strip() for r in rows if r["slug"]]
    if slugs:
        return slugs
    return ["tennis", "chess", "padel", "coffee", "cooking", "dancing", "bicycle", "yoga"]


async def cleanup_seed(conn: asyncpg.Connection) -> int:
    rows = await conn.fetch(
        """
        SELECT id FROM users
        WHERE email LIKE $1 OR user_name LIKE $2
        """,
        f"%{SEED_EMAIL_SUFFIX}",
        f"{SEED_USER_PREFIX}%",
    )
    user_ids = [r["id"] for r in rows]
    if not user_ids:
        return 0

    circle_rows = await conn.fetch(
        "SELECT id FROM circles WHERE created_by = ANY($1::uuid[])",
        user_ids,
    )
    circle_ids = [r["id"] for r in circle_rows]

    if circle_ids:
        await conn.execute(
            'DELETE FROM circle_messages WHERE circle_id = ANY($1::uuid[])',
            circle_ids,
        )
        await conn.execute(
            """
            DELETE FROM attendance
            WHERE "sessionId" IN (SELECT id FROM sessions WHERE "circleId" = ANY($1::uuid[]))
            """,
            circle_ids,
        )
        await conn.execute(
            'DELETE FROM sessions WHERE "circleId" = ANY($1::uuid[])',
            circle_ids,
        )
        await conn.execute("DELETE FROM circles WHERE id = ANY($1::uuid[])", circle_ids)

    await conn.execute("DELETE FROM users WHERE id = ANY($1::uuid[])", user_ids)
    return len(user_ids)



async def create_seed_users(conn: asyncpg.Connection, count: int, hobby_slugs: list[str]) -> list[UUID]:
    from app.auth.passwords import hash_password
    from app.user_fields import assert_user_name_available
    from app.user_hobbies import sync_legacy_preferred_columns

    pw_hash = hash_password(SEED_PASSWORD)
    user_ids: list[UUID] = []
    used_names: set[str] = set()

    for i in range(1, count + 1):
        if i <= len(SEED_PROFILES):
            fn, ln, uname, email = SEED_PROFILES[i - 1]
        else:
            fn = FIRST_NAMES[(i - 1) % len(FIRST_NAMES)]
            ln = random.choice(LAST_NAMES)
            uname = f"{fn.lower()}_{ln.lower()}_{i}"
            email = f"{fn.lower()}.{ln.lower()}{i}{SEED_EMAIL_SUFFIX}"

        if uname in used_names:
            uname = f"{uname}_{uuid4().hex[:4]}"
        used_names.add(uname)
        await assert_user_name_available(conn, uname)

        city_tuple = random.choice(CITIES)
        city_label = city_tuple[2]
        day = WEEKDAYS[i % len(WEEKDAYS)]
        hour = HOURS[i % len(HOURS)]
        at = time(hour=hour, minute=0, second=0)

        n_hobbies = random.randint(2, min(4, len(hobby_slugs)))
        user_hobbies = random.sample(hobby_slugs, n_hobbies)
        hobbies_rows = [{"slug": s, "level": random.choice(LEVELS)} for s in user_hobbies]
        hobbies_json = json.dumps(hobbies_rows)
        pref_slug, pref_subtype, pref_level = sync_legacy_preferred_columns(hobbies_rows)

        user_id = uuid4()
        await conn.execute(
            """
            INSERT INTO users (
              id, user_name, first_name, last_name, email, password_hash,
              city, availability_day, availability_time,
              user_hobies_json, preferred_hoby_slug, preferred_hoby_level
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
            """,
            user_id,
            uname,
            fn,
            ln,
            email,
            pw_hash,
            city_label,
            day,
            at,
            hobbies_json,
            pref_slug,
            pref_level,
        )
        user_ids.append(user_id)

    return user_ids


async def create_seed_circles(
    conn: asyncpg.Connection,
    user_ids: list[UUID],
    target_count: int,
) -> list[UUID]:
    from app.schemas import CircleCreateRequest, CirclePaymentSpec, GroupSizeSpec
    from app.services.circles_service import create_circle

    circle_ids: list[UUID] = []
    creators = user_ids.copy()
    random.shuffle(creators)

    idx = 0
    attempts = 0
    max_attempts = target_count * 3

    while len(circle_ids) < target_count and attempts < max_attempts:
        attempts += 1
        creator_id = creators[idx % len(creators)]
        idx += 1

        row = await conn.fetchrow(
            "SELECT user_hobies_json FROM users WHERE id = $1",
            creator_id,
        )
        if not row or not row["user_hobies_json"]:
            continue
        hobbies = json.loads(row["user_hobies_json"]) if isinstance(row["user_hobies_json"], str) else row["user_hobies_json"]
        if not hobbies:
            continue
        hobby = random.choice(hobbies)
        slug = str(hobby.get("slug") or "").strip()
        level = hobby.get("level") or random.choice(LEVELS)
        if not slug:
            continue

        cc, city_name, city_display = random.choice(CITIES)
        day = random.choice(WEEKDAYS)
        hour = random.choice(HOURS)
        recurring = f"{day} {hour:02d}:00"
        modality = "online" if random.random() < 0.25 else "offline"
        venue = random.choice(VENUES)

        first_session = datetime.now(timezone.utc) + timedelta(days=random.randint(3, 21), hours=random.randint(0, 5))
        first_session = first_session.replace(minute=0, second=0, microsecond=0)

        group_types = [
            GroupSizeSpec(type="max", max=6),
            GroupSizeSpec(type="min", min=3),
            GroupSizeSpec(type="fixed", min=4, max=4),
            GroupSizeSpec(type="range", min=3, max=6),
        ]

        payload = CircleCreateRequest(
            ritualType=slug,
            ritualLevel=level,
            ritualSubtype=None,
            modality=modality,
            recurringTime=recurring,
            isRecurring=True,
            countryCode=cc if modality == "offline" else None,
            cityName=city_display if modality == "offline" else None,
            meetingPlace=f"{venue}, {city_display}" if modality == "offline" else None,
            inviteOnly=False,
            firstSessionAt=first_session,
            groupSize=random.choice(group_types),
            costPayment=CirclePaymentSpec(type="free"),
        )

        try:
            result = await create_circle(conn, user_id=creator_id, payload=payload)
            circle_ids.append(UUID(result.id))
        except Exception as e:
            print(f"  skip circle ({slug}): {e}")
            continue

    return circle_ids


async def add_circle_members(conn: asyncpg.Connection, circle_ids: list[UUID], user_ids: list[UUID]) -> int:
    from app.services.circles_service import join_circle_open

    joins = 0
    for circle_id in circle_ids:
        circle = await conn.fetchrow("SELECT id, \"ritualType\", \"maxSize\" FROM circles WHERE id = $1", circle_id)
        if not circle:
            continue
        slug = str(circle["ritualType"]).lower()
        max_size = int(circle["maxSize"] or 6)
        target_members = random.randint(2, min(max_size, 5))

        candidates = []
        for uid in user_ids:
            row = await conn.fetchrow("SELECT user_hobies_json FROM users WHERE id = $1", uid)
            if not row:
                continue
            raw = row["user_hobies_json"]
            hobbies = json.loads(raw) if isinstance(raw, str) else raw
            if any(str(h.get("slug", "")).lower() == slug for h in (hobbies or [])):
                candidates.append(uid)

        random.shuffle(candidates)
        added = 0
        for uid in candidates:
            if added >= target_members - 1:
                break
            try:
                await join_circle_open(conn, user_id=uid, circle_id=circle_id)
                joins += 1
                added += 1
            except Exception:
                continue

    return joins


async def sprinkle_attendance(conn: asyncpg.Connection) -> int:
    rows = await conn.fetch(
        """
        SELECT a."userId", a."sessionId"
        FROM attendance a
        JOIN sessions s ON s.id = a."sessionId"
        WHERE s."dateTime" >= NOW()
        ORDER BY random()
        LIMIT 120
        """
    )
    updated = 0
    for row in rows:
        if random.random() > 0.45:
            continue
        await conn.execute(
            """
            UPDATE attendance SET status = 'attending'
            WHERE "userId" = $1 AND "sessionId" = $2
            """,
            row["userId"],
            row["sessionId"],
        )
        updated += 1
    return updated


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo users and circles")
    parser.add_argument("--users", type=int, default=24, help="Number of users (min 20)")
    parser.add_argument("--circles", type=int, default=45, help="Number of circles (min 40)")
    parser.add_argument("--cleanup", action="store_true", help="Remove old seed data first")
    parser.add_argument("--dry-run", action="store_true", help="Print plan only")
    args = parser.parse_args()

    num_users = max(20, args.users)
    num_circles = max(40, args.circles)

    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in backend/.env")
        sys.exit(1)

    if args.dry_run:
        print(f"Would create {num_users} users and {num_circles} circles on {url.split('@')[-1]}")
        print(f"Seed login: noa.cohen{SEED_EMAIL_SUFFIX} / {SEED_PASSWORD}")
        return

    conn = await asyncpg.connect(url)
    try:
        if args.cleanup:
            removed = await cleanup_seed(conn)
            print(f"Removed {removed} previous seed users (and their circles)")

        hobby_slugs = await fetch_hobby_slugs(conn)
        print(f"Using {len(hobby_slugs)} hobbies from catalogue")

        print(f"Creating {num_users} users…")
        user_ids = await create_seed_users(conn, num_users, hobby_slugs)
        print(f"  Created {len(user_ids)} users")

        print(f"Creating {num_circles} circles…")
        circle_ids = await create_seed_circles(conn, user_ids, num_circles)
        print(f"  Created {len(circle_ids)} circles")

        print("Adding members to circles…")
        join_count = await add_circle_members(conn, circle_ids, user_ids)
        print(f"  Added {join_count} member joins")

        attending = await sprinkle_attendance(conn)
        print(f"  Set {attending} attending RSVPs")

        print("\nDone.")
        print(f"Sample login: noa.cohen{SEED_EMAIL_SUFFIX} / {SEED_PASSWORD}")
        print(f"Users: {len(user_ids)} | Circles: {len(circle_ids)}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
