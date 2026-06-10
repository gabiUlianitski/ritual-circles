import React, { useMemo } from "react";
import { QUARTER_MINUTES, buildTimeHm, parseTimeHm } from "./quarterHourTime";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

export function QuarterHourTimePicker(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hourLabel?: string;
  minuteLabel?: string;
  hourId?: string;
  minuteId?: string;
}) {
  const { hour, minute } = parseTimeHm(props.value);
  const minuteOptions = useMemo(() => [...QUARTER_MINUTES], []);

  return (
    <div className="quarter-hour-time-picker row" style={{ alignItems: "flex-end", gap: 8 }}>
      <label className="stack grow" style={{ gap: 4, minWidth: 0 }}>
        {props.hourLabel ? (
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
            {props.hourLabel}
          </span>
        ) : null}
        <select
          id={props.hourId}
          value={hour}
          disabled={props.disabled}
          aria-label={props.hourLabel ?? "Hour"}
          onChange={(e) => props.onChange(buildTimeHm(e.target.value, minute))}
        >
          {HOURS_24.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <span className="muted quarter-hour-time-colon" aria-hidden>
        :
      </span>
      <label className="stack" style={{ gap: 4, minWidth: 72, flexShrink: 0 }}>
        {props.minuteLabel ? (
          <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
            {props.minuteLabel}
          </span>
        ) : null}
        <select
          id={props.minuteId}
          value={minute}
          disabled={props.disabled}
          aria-label={props.minuteLabel ?? "Minute"}
          onChange={(e) => props.onChange(buildTimeHm(hour, e.target.value))}
        >
          {minuteOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
