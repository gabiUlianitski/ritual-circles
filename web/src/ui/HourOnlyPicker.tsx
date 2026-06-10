import React from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function HourOnlyPicker(props: {
  value: string;
  onChange: (hour: string) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  const hour = Math.min(23, Math.max(0, parseInt(props.value, 10) || 0));

  return (
    <label className="create-circle-field stack" htmlFor={props.id}>
      {props.label ? <span className="create-circle-label">{props.label}</span> : null}
      <select
        id={props.id}
        className="create-circle-input"
        value={String(hour)}
        disabled={props.disabled}
        aria-label={props.label ?? "Hour"}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {HOURS.map((h) => (
          <option key={h} value={String(h)}>
            {formatHourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function formatHourOnlyDisplay(hour: string): string {
  const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
  return formatHourLabel(h);
}
