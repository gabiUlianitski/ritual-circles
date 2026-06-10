import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CircleListItem, Hoby, UserHobyPreference } from "../api/types";
import { levelKeyIsSet, parseHobyLevelKey } from "./hobyLevelKey";
import { levelsForSelectedType, parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";
import { defaultHobbyDraftForCircle } from "./circleJoinHobby";
import { circleHobyTitle } from "./circleDisplay";
import { FormError } from "./FormError";
import { userHobyEntryKey } from "./userHobbyDisplay";

export function AddCircleHobbyForm(props: {
  circle: CircleListItem;
  hobies: Hoby[];
  savedHobbies: UserHobyPreference[];
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const draft = defaultHobbyDraftForCircle(props.circle);
  const [hobySubtype, setHobySubtype] = useState(draft.subtype ?? "");
  const [hobyLevel, setHobyLevel] = useState(draft.level != null ? String(draft.level) : "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogue = useMemo(
    () =>
      props.hobies.find(
        (h) => h.slug.trim().toLowerCase() === (props.circle.ritualType ?? "").trim().toLowerCase(),
      ),
    [props.hobies, props.circle.ritualType],
  );
  const hobyLevelsFlat = useMemo(() => parseHobyLevelsFlat(catalogue?.levels), [catalogue]);
  const types = useMemo(() => parseHobyTypesNested(catalogue?.types), [catalogue]);
  const levelOptions = useMemo(
    () => levelsForSelectedType(hobyLevelsFlat, types, hobySubtype),
    [hobyLevelsFlat, types, hobySubtype],
  );

  useEffect(() => {
    const incomplete = props.savedHobbies.find(
      (s) =>
        s.slug.trim().toLowerCase() === (props.circle.ritualType ?? "").trim().toLowerCase() &&
        !levelKeyIsSet(s.level),
    );
    if (incomplete?.subtype?.trim()) {
      setHobySubtype(incomplete.subtype.trim());
    }
  }, [props.savedHobbies, props.circle.ritualType]);

  useEffect(() => {
    if (types.length && draft.subtype && types.some((t) => t.key === draft.subtype)) {
      setHobySubtype(draft.subtype);
      const lvs = levelsForSelectedType(hobyLevelsFlat, types, draft.subtype);
      if (lvs.length && !hobyLevel) setHobyLevel(lvs[0].key);
      return;
    }
    if (types.length && !types.some((t) => t.key === hobySubtype)) {
      const first = types[0].key;
      setHobySubtype(first);
      const lvs = levelsForSelectedType(hobyLevelsFlat, types, first);
      if (!hobyLevel && lvs.length) setHobyLevel(lvs[0].key);
    }
  }, [types, hobySubtype, hobyLevelsFlat, hobyLevel, draft.subtype]);

  useEffect(() => {
    if (levelOptions.length && !levelOptions.some((l) => l.key === hobyLevel)) {
      setHobyLevel(levelOptions[0].key);
    }
  }, [levelOptions, hobyLevel]);

  const canSave =
    (!types.length || Boolean(hobySubtype.trim())) && (!levelOptions.length || Boolean(hobyLevel.trim()));

  const circleSlug = (props.circle.ritualType ?? "").trim().toLowerCase();
  const existingIncomplete = props.savedHobbies.find(
    (s) =>
      s.slug.trim().toLowerCase() === circleSlug &&
      (s.subtype?.trim() || "") === (hobySubtype.trim() || "") &&
      !levelKeyIsSet(s.level),
  );
  const existingSameSlug = props.savedHobbies.find(
    (s) => s.slug.trim().toLowerCase() === circleSlug && !levelKeyIsSet(s.level),
  );
  const isUpdate = Boolean(existingIncomplete ?? existingSameSlug);
  const updateTarget = existingIncomplete ?? existingSameSlug;

  async function save() {
    if (!canSave) {
      setError("Choose a type and level for this hobby.");
      return;
    }
    const entry: UserHobyPreference = {
      slug: (props.circle.ritualType ?? "").trim(),
      subtype: hobySubtype.trim() || null,
      level: parseHobyLevelKey(hobyLevel),
    };
    if (!levelKeyIsSet(entry.level)) {
      setError("Choose your level for this hobby.");
      return;
    }
    const key = userHobyEntryKey(entry);
    if (!isUpdate && props.savedHobbies.some((s) => userHobyEntryKey(s) === key)) {
      setError("You already have this hobby with the same type and level.");
      return;
    }
    const next = isUpdate && updateTarget
      ? props.savedHobbies.map((s) => (s === updateTarget ? entry : s))
      : [...props.savedHobbies, entry];
    setWorking(true);
    setError(null);
    try {
      await api.patchMe({ userHobies: next });
      await props.onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="add-circle-hobby-form stack" style={{ gap: 10 }}>
      <p className="muted" style={{ margin: 0, fontSize: "0.92em" }}>
        {isUpdate ? (
          <>
            Set your level for <strong>{circleHobyTitle(props.circle)}</strong> so you can join this circle.
          </>
        ) : (
          <>
            Add <strong>{circleHobyTitle(props.circle)}</strong> to your hobbies with a type and level. This does not
            change your main hobby — you can join after you save.
          </>
        )}
      </p>
      {types.length > 0 ? (
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
            Type
          </span>
          <select value={hobySubtype} disabled={working} onChange={(e) => setHobySubtype(e.target.value)}>
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label ?? t.key}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {levelOptions.length > 0 ? (
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
            Your level
          </span>
          <select value={hobyLevel} disabled={working} onChange={(e) => setHobyLevel(e.target.value)}>
            {levelOptions.map((lv) => (
              <option key={lv.key} value={lv.key}>
                {lv.label ?? lv.key}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <FormError>This hobby has no levels in the catalogue — contact support.</FormError>
      )}
      {error ? <FormError>{error}</FormError> : null}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="primary" style={{ width: "auto" }} disabled={working || !canSave} onClick={() => void save()}>
          {working ? "Saving…" : isUpdate ? "Save level" : "Add hobby"}
        </button>
        <button type="button" style={{ width: "auto" }} disabled={working} onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
