import React from "react";
import { useTranslation } from "react-i18next";
import { CIRCLE_DESCRIPTION_MAX } from "./circleDisplay";

export function circleDescriptionPayload(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function circleDescriptionIsValid(value: string): boolean {
  return value.trim().length <= CIRCLE_DESCRIPTION_MAX;
}

export function CircleDescriptionField(props: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const trimmedLength = props.value.trim().length;
  const tooLong = !circleDescriptionIsValid(props.value);
  const hintId = `${props.id}-hint`;
  const countId = `${props.id}-count`;
  const errorId = `${props.id}-error`;
  return (
    <label className="stack circle-name-field" htmlFor={props.id}>
      <span className="circle-name-field-label">
        {props.label ?? t("circleDetails.circleDescription")}
        <span className="muted"> · {t("circleDetails.optional")}</span>
      </span>
      <textarea
        id={props.id}
        className="create-circle-input"
        dir="auto"
        rows={4}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder ?? t("circleDetails.circleDescriptionPlaceholder")}
        aria-invalid={tooLong}
        aria-describedby={[hintId, countId, tooLong ? errorId : ""].filter(Boolean).join(" ")}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <span id={hintId} className="create-circle-helper muted">
        {props.hint ?? t("circleDetails.circleDescriptionHint")}
      </span>
      <span id={countId} className="create-circle-helper muted">
        {t("circleDetails.circleDescriptionCount", { count: trimmedLength, max: CIRCLE_DESCRIPTION_MAX })}
      </span>
      {tooLong ? (
        <span id={errorId} className="form-field-error" role="alert">
          {t("circleDetails.circleDescriptionTooLong", { max: CIRCLE_DESCRIPTION_MAX })}
        </span>
      ) : null}
    </label>
  );
}
