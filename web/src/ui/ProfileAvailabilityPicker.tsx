import React from "react";
import {
  AVAILABILITY_WINDOW_OPTIONS,
  formatAvailabilityWindows,
  normalizeAvailabilityWindows,
  type AvailabilityWindowKey,
} from "../availabilityWindows";

export function ProfileAvailabilityPicker(props: {
  value: AvailabilityWindowKey[];
  onChange: (value: AvailabilityWindowKey[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(normalizeAvailabilityWindows(props.value));

  function toggle(key: AvailabilityWindowKey) {
    if (props.disabled) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    props.onChange(
      AVAILABILITY_WINDOW_OPTIONS.map((o) => o.key).filter((k) => next.has(k)),
    );
  }

  const summary = formatAvailabilityWindows([...selected]);
  const rows = [
    AVAILABILITY_WINDOW_OPTIONS.slice(0, 2),
    AVAILABILITY_WINDOW_OPTIONS.slice(2, 4),
  ];

  return (
    <div className="profile-availability-picker">
      <div className="profile-availability-grid" role="group" aria-label="Availability">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="profile-availability-row">
            {row.map((opt) => {
              const isOn = selected.has(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`profile-availability-chip${isOn ? " is-selected" : ""}`}
                  aria-pressed={isOn}
                  disabled={props.disabled}
                  onClick={() => toggle(opt.key)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {summary ? (
        <div className="profile-fb-about-secondary">{summary}</div>
      ) : (
        <div className="profile-fb-about-secondary muted">Tap when you&apos;re usually free</div>
      )}
    </div>
  );
}
