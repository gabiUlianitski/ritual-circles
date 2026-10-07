import React from "react";
import { useTranslation } from "react-i18next";
import { CIRCLE_NAME_MAX } from "./circleDisplay";

export function circleNamePayload(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function circleNameIsValid(value: string): boolean {
  return value.trim().length <= CIRCLE_NAME_MAX;
}

export function CircleNameField(props: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  /** Pass null to hide the hint. Omit to use the default hint. */
  hint?: string | null;
}) {
  const { t } = useTranslation();
  const tooLong = !circleNameIsValid(props.value);
  const hint = props.hint === undefined ? t("circleDetails.circleNameHint") : props.hint;
  return (
    <label className="stack circle-name-field" htmlFor={props.id}>
      <span className="circle-name-field-label">
        {props.label ?? t("circleDetails.circleName")}
        <span className="muted"> · {t("circleDetails.optional")}</span>
      </span>
      <input
        id={props.id}
        type="text"
        dir="auto"
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder ?? t("circleDetails.circleNamePlaceholder")}
        aria-invalid={tooLong}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {hint ? <span className="create-circle-helper muted">{hint}</span> : null}
      {tooLong ? (
        <span className="form-field-error" role="alert">
          {t("circleDetails.circleNameTooLong", { max: CIRCLE_NAME_MAX })}
        </span>
      ) : null}
    </label>
  );
}
