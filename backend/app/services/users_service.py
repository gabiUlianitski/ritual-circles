from __future__ import annotations

from datetime import time
from uuid import UUID

import asyncpg
from fastapi import HTTPException

import json

from app.schemas import DeviceTokenRequest, UserHobyPreference, UserUpdateRequest
from app.user_fields import assert_user_name_available, validate_user_name
from app.user_hobbies import (
    normalize_user_hobies,
    sync_legacy_preferred_columns,
    user_hobies_from_row,
    user_hobies_to_json,
)
from app.user_availability_windows import normalize_availability_windows
from app.user_languages import UserLanguage, normalize_user_languages


def _parse_time(s: str) -> time:
    parts = s.strip().split(":")
    if len(parts) not in (2, 3):
        raise ValueError("availability_time must be HH:MM or HH:MM:SS")
    hh = int(parts[0])
    mm = int(parts[1])
    ss = int(parts[2]) if len(parts) == 3 else 0
    return time(hour=hh, minute=mm, second=ss)


async def get_user(conn: asyncpg.Connection, *, user_id: UUID):
    row = await conn.fetchrow(
        """
        SELECT
          id,
          user_name,
          first_name,
          last_name,
          email,
          phone,
          city,
          hometown,
          birth_date,
          work_summary,
          education_summary,
          languages_json,
          availability_windows_json,
          availability_day,
          availability_time,
          device_token,
          preferred_hoby_slug,
          preferred_hoby_level,
          preferred_hoby_subtype,
          user_hobies_json,
          created_at,
          (password_hash IS NOT NULL) AS password_set
        FROM users
        WHERE id = $1
        """,
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="user not found")
    return row


async def upsert_user(conn: asyncpg.Connection, *, user_id: UUID, payload: UserUpdateRequest):
    existing = await conn.fetchrow("SELECT 1 FROM users WHERE id = $1", user_id)

    if not existing:
        if (
            not payload.user_name
            or not payload.first_name
            or not payload.last_name
            or not payload.availability_day
            or not payload.availability_time
        ):
            raise HTTPException(
                status_code=400,
                detail="user_name, first_name, last_name, availability_day, availability_time required",
            )
        try:
            uname = validate_user_name(payload.user_name)
            availability_time = _parse_time(payload.availability_time)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        await assert_user_name_available(conn, uname)
        await conn.execute(
            """
            INSERT INTO users (
              id, user_name, first_name, last_name, city, availability_day, availability_time, device_token
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
            """,
            user_id,
            uname,
            payload.first_name.strip(),
            payload.last_name.strip(),
            payload.city,
            payload.availability_day,
            availability_time,
        )
    else:
        dump = payload.model_dump(exclude_unset=True)
        sets: list[str] = []
        params: list[object] = [user_id]

        if "user_name" in dump and dump["user_name"] is not None:
            raise HTTPException(
                status_code=400,
                detail="user_name cannot be changed after registration",
            )
        if "first_name" in dump and dump["first_name"] is not None:
            fn = str(dump["first_name"]).strip()
            if not fn:
                raise HTTPException(status_code=400, detail="first_name is required")
            sets.append(f"first_name = ${len(params) + 1}")
            params.append(fn)
        if "last_name" in dump and dump["last_name"] is not None:
            ln = str(dump["last_name"]).strip()
            sets.append(f"last_name = ${len(params) + 1}")
            params.append(ln)
        if "city" in dump:
            sets.append(f"city = ${len(params) + 1}")
            params.append(dump["city"])
        if "hometown" in dump:
            h = dump["hometown"]
            sets.append(f"hometown = ${len(params) + 1}")
            params.append(h.strip() if isinstance(h, str) and h.strip() else None)
        if "birthDate" in dump:
            bd = dump["birthDate"]
            sets.append(f"birth_date = ${len(params) + 1}")
            params.append(bd.strip() if isinstance(bd, str) and bd.strip() else None)
        if "workSummary" in dump:
            w = dump["workSummary"]
            sets.append(f"work_summary = ${len(params) + 1}")
            params.append(w.strip() if isinstance(w, str) and w.strip() else None)
        if "educationSummary" in dump:
            e = dump["educationSummary"]
            sets.append(f"education_summary = ${len(params) + 1}")
            params.append(e.strip() if isinstance(e, str) and e.strip() else None)
        if "languages" in dump and dump["languages"] is not None:
            raw_list = dump["languages"]
            langs_in: list[UserLanguage] = []
            if isinstance(raw_list, list):
                for x in raw_list:
                    if isinstance(x, UserLanguage):
                        langs_in.append(x)
                    else:
                        langs_in.append(UserLanguage.model_validate(x))
            json_rows = normalize_user_languages(langs_in)
            sets.append(f"languages_json = ${len(params) + 1}::jsonb")
            params.append(json.dumps(json_rows))
        if "phone" in dump:
            sets.append(f"phone = ${len(params) + 1}")
            params.append(dump["phone"])
        if "availabilityWindows" in dump and dump["availabilityWindows"] is not None:
            raw_list = dump["availabilityWindows"]
            keys: list[str] = []
            if isinstance(raw_list, list):
                keys = [str(x) for x in raw_list]
            normalized = normalize_availability_windows(keys)
            sets.append(f"availability_windows_json = ${len(params) + 1}::jsonb")
            params.append(json.dumps(normalized))
        if "preferred_hoby_slug" in dump:
            slug = dump["preferred_hoby_slug"]
            sets.append(f"preferred_hoby_slug = ${len(params) + 1}")
            params.append(slug.strip() if isinstance(slug, str) and slug.strip() else None)
        if "preferred_hoby_level" in dump:
            sets.append(f"preferred_hoby_level = ${len(params) + 1}")
            params.append(dump["preferred_hoby_level"])
        if "preferred_hoby_subtype" in dump:
            st = dump["preferred_hoby_subtype"]
            sets.append(f"preferred_hoby_subtype = ${len(params) + 1}")
            params.append(st.strip() if isinstance(st, str) and st.strip() else None)
        if "userHobies" in dump and dump["userHobies"] is not None:
            raw_list = dump["userHobies"]
            prefs_in: list[UserHobyPreference] = []
            if isinstance(raw_list, list):
                for x in raw_list:
                    if isinstance(x, UserHobyPreference):
                        prefs_in.append(x)
                    else:
                        prefs_in.append(UserHobyPreference.model_validate(x))
            prefs = normalize_user_hobies(prefs_in)
            json_rows = user_hobies_to_json(prefs)
            sets.append(f"user_hobies_json = ${len(params) + 1}::jsonb")
            params.append(json.dumps(json_rows))
            slug, subtype, level = sync_legacy_preferred_columns(json_rows)
            sets.append(f"preferred_hoby_slug = ${len(params) + 1}")
            params.append(slug)
            sets.append(f"preferred_hoby_level = ${len(params) + 1}")
            params.append(level)
            sets.append(f"preferred_hoby_subtype = ${len(params) + 1}")
            params.append(subtype)
        if "availability_day" in dump and dump["availability_day"] is not None:
            sets.append(f"availability_day = ${len(params) + 1}")
            params.append(dump["availability_day"])
        if "availability_time" in dump and dump["availability_time"] is not None:
            try:
                at = _parse_time(str(dump["availability_time"]))
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            sets.append(f"availability_time = ${len(params) + 1}")
            params.append(at)

        if sets:
            sql = f"UPDATE users SET {', '.join(sets)} WHERE id = $1"
            await conn.execute(sql, *params)

    return await get_user(conn, user_id=user_id)


async def update_device_token(conn: asyncpg.Connection, *, user_id: UUID, payload: DeviceTokenRequest) -> None:
    updated = await conn.execute(
        """
        UPDATE users
        SET device_token = $2
        WHERE id = $1
        """,
        user_id,
        payload.deviceToken,
    )
    if updated.endswith("0"):
        raise HTTPException(status_code=404, detail="user not found")
