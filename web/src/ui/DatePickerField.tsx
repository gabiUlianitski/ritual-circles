import React, { useRef } from "react";

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
    </svg>
  );
}

export function DatePickerField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  min?: string;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openCalendar() {
    const el = inputRef.current;
    if (!el || props.disabled) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
    el.click();
  }

  return (
    <label className="stack date-picker-field" style={{ gap: 4 }} htmlFor={props.id}>
      {props.label ? (
        <span className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
          {props.label}
        </span>
      ) : null}
      <div className="date-picker-row">
        <input
          ref={inputRef}
          id={props.id}
          type="date"
          className="date-picker-input grow"
          value={props.value}
          min={props.min}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.value)}
          onClick={() => {
            if (!props.disabled && typeof inputRef.current?.showPicker === "function") {
              try {
                inputRef.current.showPicker();
              } catch {
                /* ignore */
              }
            }
          }}
        />
        <button
          type="button"
          className="icon-btn date-picker-open-btn"
          disabled={props.disabled}
          aria-label="Open calendar"
          title="Open calendar"
          onClick={openCalendar}
        >
          <IconCalendar />
        </button>
      </div>
    </label>
  );
}
