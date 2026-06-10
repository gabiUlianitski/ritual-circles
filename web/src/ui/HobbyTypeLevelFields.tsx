import React, { useEffect, useMemo } from "react";
import type { Hoby } from "../api/types";
import { levelKeyToString } from "./hobyLevelKey";
import { levelsForSelectedType, parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";

export function HobbyTypeLevelFields(props: {
  catalogue: Hoby | undefined;
  subtype: string;
  level: string;
  onSubtypeChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  disabled?: boolean;
  levelLabel?: string;
  typeLabel?: string;
}) {
  const hobyLevelsFlat = useMemo(() => parseHobyLevelsFlat(props.catalogue?.levels), [props.catalogue]);
  const types = useMemo(() => parseHobyTypesNested(props.catalogue?.types), [props.catalogue]);
  const levelOptions = useMemo(
    () => levelsForSelectedType(hobyLevelsFlat, types, props.subtype),
    [hobyLevelsFlat, types, props.subtype],
  );

  useEffect(() => {
    if (types.length && !types.some((t) => t.key === props.subtype)) {
      const first = types[0].key;
      props.onSubtypeChange(first);
      const lvs = levelsForSelectedType(hobyLevelsFlat, types, first);
      if (lvs.length) props.onLevelChange(lvs[0].key);
    }
  }, [types, props.subtype, hobyLevelsFlat]);

  useEffect(() => {
    if (levelOptions.length && !levelOptions.some((l) => l.key === props.level)) {
      props.onLevelChange(levelOptions[0].key);
    }
  }, [levelOptions, props.level]);

  return (
    <>
      {types.length > 0 ? (
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
            {props.typeLabel ?? "Type"}
          </span>
          <select
            value={props.subtype}
            disabled={props.disabled}
            onChange={(e) => {
              const k = e.target.value;
              props.onSubtypeChange(k);
              const lvs = levelsForSelectedType(hobyLevelsFlat, types, k);
              props.onLevelChange(lvs.length ? lvs[0].key : "");
            }}
          >
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label ?? t.key}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {levelOptions.length > 0 ? (
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
            {props.levelLabel ?? "Level"}
          </span>
          <select value={props.level} disabled={props.disabled} onChange={(e) => props.onLevelChange(e.target.value)}>
            {levelOptions.map((lv) => (
              <option key={lv.key} value={lv.key}>
                {lv.label ?? lv.key}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

export function hobbyTypeLevelCanSave(
  catalogue: Hoby | undefined,
  subtype: string,
  level: string,
): boolean {
  const types = parseHobyTypesNested(catalogue?.types);
  const hobyLevelsFlat = parseHobyLevelsFlat(catalogue?.levels);
  const levelOptions = levelsForSelectedType(hobyLevelsFlat, types, subtype);
  return (
    (!types.length || Boolean(subtype.trim())) && (!levelOptions.length || Boolean(level.trim()))
  );
}

export function initialLevelForEntry(level: unknown): string {
  return levelKeyToString(level as string | number | null | undefined);
}
