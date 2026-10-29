import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityLocationField } from "./ActivityLocationField";
import { DatePickerField } from "./DatePickerField";
import { FormError } from "./FormError";
import { QuarterHourTimePicker } from "./QuarterHourTimePicker";
import {
  ACTIVITY_CURRENCIES,
  WEEKDAY_CODES,
  type ActivityDraft,
  type ActivityIssueCode,
  type WeekdayCode,
} from "./activityForm";

function issueText(code: ActivityIssueCode, t: (key: string) => string): string {
  if (code === "title") return t("activityForm.titleRequired");
  if (code === "date") return t("activityForm.dateRequired");
  if (code === "end") return t("activityForm.endAfterStart");
  if (code === "groupSize") return t("activityForm.groupRequired");
  if (code === "minParticipants") return t("activityForm.minimumRequired");
  if (code === "amount") return t("activityForm.amountRequired");
  return t("activityForm.currencyRequired");
}

export function ActivityFormFields(props: {
  formId: string;
  titleId: string;
  draft: ActivityDraft;
  onChange: (patch: Partial<ActivityDraft>) => void;
  issues: ActivityIssueCode[];
  formError: string | null;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Circle city, used only to scope place search. */
  circleCity?: string;
  countryCode?: string;
  /** The current place was the Circle default when this new Activity opened. */
  locationFromCircle?: boolean;
}) {
  const { t } = useTranslation();
  const draft = props.draft;
  const shownIssues = new Set(props.issues);
  const endEnabled = draft.endTime.trim().length > 0;
  const currencies =
    draft.currency && !ACTIVITY_CURRENCIES.some((item) => item.code === draft.currency)
      ? [...ACTIVITY_CURRENCIES, { code: draft.currency, label: draft.currency }]
      : ACTIVITY_CURRENCIES;

  return (
    <>
      <label className="activity-form-field" htmlFor={props.titleId}>
        <span>{t("activityForm.nameLabel")}</span>
        <input
          id={props.titleId}
          className="create-circle-input"
          value={draft.title}
          placeholder={t("activityForm.namePlaceholder")}
          aria-invalid={shownIssues.has("title")}
          aria-describedby={shownIssues.has("title") ? `${props.titleId}-error` : undefined}
          onChange={(event) => props.onChange({ title: event.target.value })}
        />
      </label>
      {shownIssues.has("title") ? (
        <p id={`${props.titleId}-error`} className="activity-form-field-error" role="alert">
          {issueText("title", t)}
        </p>
      ) : null}

      <fieldset className="activity-form-section" id={`${props.formId}-when`}>
        <legend>{t("activityForm.when")}</legend>
        <div className="activity-form-choice" role="group" aria-label={t("activityForm.when")}>
          <button
            type="button"
            aria-pressed={draft.when === "one_time"}
            onClick={() => props.onChange({ when: "one_time" })}
          >
            {t("activityForm.oneTime")}
          </button>
          <button
            type="button"
            aria-pressed={draft.when === "recurring"}
            onClick={() => props.onChange({ when: "recurring" })}
          >
            {t("activityForm.recurring")}
          </button>
        </div>
        {draft.when === "one_time" ? (
          <div className="stack">
            <DatePickerField
              id={`${props.formId}-date`}
              label={t("activityForm.date")}
              value={draft.date}
              onChange={(date) => props.onChange({ date })}
            />
            <QuarterHourTimePicker
              value={draft.startTime}
              onChange={(startTime) => props.onChange({ startTime })}
              hourLabel={t("activityForm.start")}
              minuteLabel={t("activityForm.minutes")}
              hourId={`${props.formId}-start-hour`}
              minuteId={`${props.formId}-start-minute`}
            />
            <label className="activity-form-check">
              <input
                type="checkbox"
                checked={endEnabled}
                onChange={(event) => props.onChange({ endTime: event.target.checked ? draft.endTime || "12:00" : "" })}
              />
              <span>{t("activityForm.addEnd")}</span>
            </label>
            {endEnabled ? (
              <QuarterHourTimePicker
                value={draft.endTime}
                onChange={(endTime) => props.onChange({ endTime })}
                hourLabel={t("activityForm.end")}
                minuteLabel={t("activityForm.minutes")}
                hourId={`${props.formId}-end-hour`}
                minuteId={`${props.formId}-end-minute`}
              />
            ) : null}
          </div>
        ) : (
          <div className="stack">
            <p className="activity-form-repeat">
              <span className="muted">{t("activityForm.repeat")}</span> {t("activityForm.repeatWeekly")}
            </p>
            <label className="activity-form-field" htmlFor={`${props.formId}-day`}>
              <span>{t("activityForm.day")}</span>
              <select
                id={`${props.formId}-day`}
                value={draft.weekday}
                onChange={(event) => props.onChange({ weekday: event.target.value as WeekdayCode })}
              >
                {WEEKDAY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {t(`activityForm.day${code}`)}
                  </option>
                ))}
              </select>
            </label>
            <QuarterHourTimePicker
              value={draft.startTime}
              onChange={(startTime) => props.onChange({ startTime })}
              hourLabel={t("activityForm.start")}
              minuteLabel={t("activityForm.minutes")}
              hourId={`${props.formId}-weekly-hour`}
              minuteId={`${props.formId}-weekly-minute`}
            />
          </div>
        )}
      </fieldset>
      {shownIssues.has("date") ? (
        <p className="activity-form-field-error" role="alert">
          {issueText("date", t)}
        </p>
      ) : null}
      {shownIssues.has("end") ? (
        <p className="activity-form-field-error" role="alert">
          {issueText("end", t)}
        </p>
      ) : null}

      <fieldset className="activity-form-section activity-location-section">
        <legend>{t("activityForm.where")}</legend>
        <p className="muted activity-form-help">{t("activityForm.locationHelp")}</p>
        {props.circleCity?.trim() ? (
          <p className="activity-location-city">
            {t("activityForm.locationCityContext", { city: props.circleCity.trim() })}
          </p>
        ) : null}
        <ActivityLocationField
          id={`${props.formId}-place`}
          city={props.circleCity ?? ""}
          countryCode={props.countryCode}
          name={draft.locationName}
          address={draft.locationAddress}
          inherited={Boolean(props.locationFromCircle)}
          disabled={props.submitting}
          onChange={props.onChange}
        />
        {!draft.locationName.trim() ? <p className="muted activity-form-help">{t("activityForm.locationLater")}</p> : null}
      </fieldset>

      <fieldset className="activity-form-section">
        <legend id={`${props.formId}-size`}>{t("activityForm.minParticipants")}</legend>
        <div className="activity-form-stepper" role="group" aria-labelledby={`${props.formId}-size`}>
          <button
            type="button"
            aria-label={t("activityForm.decrease")}
            disabled={draft.minParticipants == null || draft.minParticipants <= 1}
            onClick={() =>
              props.onChange({
                minParticipants: draft.minParticipants == null ? null : Math.max(1, draft.minParticipants - 1),
              })
            }
          >
            −
          </button>
          <span className="activity-form-stepper-value" aria-live="polite">
            {draft.minParticipants ?? "–"}
          </span>
          <button
            type="button"
            aria-label={t("activityForm.increase")}
            onClick={() =>
              props.onChange({
                minParticipants:
                  draft.minParticipants == null
                    ? 1
                    : Math.min(draft.groupSize ?? draft.minParticipants + 1, draft.minParticipants + 1),
              })
            }
          >
            +
          </button>
        </div>
        <p className="muted activity-form-help">{t("activityForm.minParticipantsHelp")}</p>
      </fieldset>
      {shownIssues.has("minParticipants") ? (
        <p className="activity-form-field-error" role="alert">
          {issueText("minParticipants", t)}
        </p>
      ) : null}
      <fieldset className="activity-form-section">
        <legend id={`${props.formId}-group-size`}>{t("activityForm.groupSize")}</legend>
        <div className="activity-form-stepper" role="group" aria-labelledby={`${props.formId}-group-size`}>
          <button
            type="button"
            aria-label={t("activityForm.decrease")}
            disabled={draft.groupSize == null || draft.groupSize <= 1}
            onClick={() =>
              props.onChange({
                groupSize: draft.groupSize == null ? null : Math.max(1, draft.groupSize - 1),
                minParticipants:
                  draft.minParticipants != null && draft.groupSize != null && draft.minParticipants > draft.groupSize - 1
                    ? Math.max(1, draft.groupSize - 1)
                    : draft.minParticipants,
              })
            }
          >
            −
          </button>
          <span className="activity-form-stepper-value" aria-live="polite">{draft.groupSize ?? "–"}</span>
          <button
            type="button"
            aria-label={t("activityForm.increase")}
            onClick={() => props.onChange({ groupSize: draft.groupSize == null ? 1 : draft.groupSize + 1 })}
          >
            +
          </button>
        </div>
        <p className="muted activity-form-help">{t("activityForm.groupSizeHelp")}</p>
      </fieldset>
      {shownIssues.has("groupSize") ? (
        <p className="activity-form-field-error" role="alert">{issueText("groupSize", t)}</p>
      ) : null}

      <fieldset className="activity-form-section">
        <legend>{t("activityForm.cost")}</legend>
        <div className="activity-form-choice" role="group" aria-label={t("activityForm.cost")}>
          <button type="button" aria-pressed={draft.cost === "free"} onClick={() => props.onChange({ cost: "free" })}>
            {t("activityForm.free")}
          </button>
          <button type="button" aria-pressed={draft.cost === "paid"} onClick={() => props.onChange({ cost: "paid" })}>
            {t("activityForm.paid")}
          </button>
        </div>
        {draft.cost === "paid" ? (
          <div className="activity-form-paid">
            <label className="activity-form-field" htmlFor={`${props.formId}-amount`}>
              <span>{t("activityForm.amount")}</span>
              <input
                id={`${props.formId}-amount`}
                className="create-circle-input"
                inputMode="decimal"
                value={draft.amount}
                aria-invalid={shownIssues.has("amount")}
                onChange={(event) => props.onChange({ amount: event.target.value })}
              />
            </label>
            <label className="activity-form-field" htmlFor={`${props.formId}-currency`}>
              <span>{t("activityForm.currency")}</span>
              <select
                id={`${props.formId}-currency`}
                value={draft.currency}
                onChange={(event) => props.onChange({ currency: event.target.value })}
              >
                {currencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </fieldset>
      {shownIssues.has("amount") ? (
        <p className="activity-form-field-error" role="alert">
          {issueText("amount", t)}
        </p>
      ) : null}

      <label className="activity-form-field" htmlFor={`${props.formId}-description`}>
        <span>{t("activityForm.description")}</span>
        <textarea
          id={`${props.formId}-description`}
          className="create-circle-input"
          rows={3}
          value={draft.description}
          placeholder={t("activityForm.descriptionPlaceholder")}
          onChange={(event) => props.onChange({ description: event.target.value })}
        />
      </label>

      {props.formError ? <FormError>{props.formError}</FormError> : null}

      <div className="activity-form-submit">
        <button type="submit" className="circle-details-primary" disabled={props.submitting}>
          {props.submitting ? props.submittingLabel : props.submitLabel}
        </button>
        {props.secondaryLabel && props.onSecondary ? (
          <button type="button" className="circle-details-secondary" disabled={props.submitting} onClick={props.onSecondary}>
            {props.secondaryLabel}
          </button>
        ) : null}
      </div>
    </>
  );
}
