import React from "react";

export function openCircleLabel(open: boolean): string {
  return open ? "Open circle — anyone can join" : "Invite only — join code required";
}

export function OpenCircleToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="create-circle-repeat-row row create-circle-open-row">
      <input
        type="checkbox"
        className="create-circle-repeat-checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        disabled={props.disabled}
      />
      <span className="create-circle-helper">
        <strong>Open circle</strong>
        <span className="muted create-circle-open-hint">
          {" "}
          — anyone on Discover can join with one tap. Turn off to require an invite code.
        </span>
      </span>
    </label>
  );
}

export function OpenCircleStatus(props: { open: boolean }) {
  return (
    <div className="circle-open-status">
      <span className="circle-open-status-icon" aria-hidden>
        {props.open ? "🌐" : "🔒"}
      </span>
      <span>{openCircleLabel(props.open)}</span>
    </div>
  );
}
