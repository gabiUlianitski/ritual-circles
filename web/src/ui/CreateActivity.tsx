import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleResponse, Hoby } from "../api/types";
import { BidiText } from "./BidiText";
import { ActivityFormFields } from "./ActivityFormFields";
import { COST_CURRENCIES } from "./circlePayment";
import { circleDisplayTitle, discoverSubtitleParts } from "./circleDisplay";
import { defaultMeetDateIso } from "./calendarMonth";
import { FormError } from "./FormError";
import {
  activityPayload,
  activityIssues,
  weekdayCodeFromDate,
  type ActivityDraft,
  type ActivityIssueCode,
  type WeekdayCode,
} from "./activityForm";

export function CreateActivity(props: {
  circleId: string;
  circle: CircleResponse;
  hobby?: Hoby;
  onBack: () => void;
  onPlanned: (result: "draft" | "published") => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const titleId = `${formId}-title`;
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [defaultsFailed, setDefaultsFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ActivityIssueCode[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState<ActivityDraft["when"]>("one_time");
  const [date, setDate] = useState(defaultMeetDateIso);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("");
  const [weekday, setWeekday] = useState<WeekdayCode>(() => weekdayCodeFromDate(defaultMeetDateIso()));
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [groupSize, setGroupSize] = useState<number | null>(null);
  const [minParticipants, setMinParticipants] = useState<number | null>(null);
  const [cost, setCost] = useState<ActivityDraft["cost"]>("free");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(COST_CURRENCIES[0].code);

  useEffect(() => {
    let cancelled = false;
    setLoadingDefaults(true);
    setDefaultsFailed(false);
    void api
      .getActivityDefaults(props.circleId)
      .then((defaults) => {
        if (cancelled) return;
        setLocationName(defaults.locationName?.trim() ?? "");
        setLocationAddress(defaults.locationAddress?.trim() ?? "");
        const size = defaults.preferredGroupSize;
        setGroupSize(Number.isInteger(size) && size > 0 ? size : null);
        setMinParticipants(Number.isInteger(size) && size > 0 ? size : null);
      })
      .catch(() => {
        if (!cancelled) setDefaultsFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingDefaults(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.circleId]);

  const context = discoverSubtitleParts(props.circle, props.hobby).join(" · ");

  function applyDraft(patch: Partial<ActivityDraft>) {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.description !== undefined) setDescription(patch.description);
    if (patch.when !== undefined) setWhen(patch.when);
    if (patch.date !== undefined) setDate(patch.date);
    if (patch.startTime !== undefined) setStartTime(patch.startTime);
    if (patch.endTime !== undefined) setEndTime(patch.endTime);
    if (patch.weekday !== undefined) setWeekday(patch.weekday);
    if (patch.locationName !== undefined) setLocationName(patch.locationName);
    if (patch.locationAddress !== undefined) setLocationAddress(patch.locationAddress);
    if (patch.groupSize !== undefined) setGroupSize(patch.groupSize);
    if (patch.minParticipants !== undefined) setMinParticipants(patch.minParticipants);
    if (patch.cost !== undefined) setCost(patch.cost);
    if (patch.amount !== undefined) setAmount(patch.amount);
    if (patch.currency !== undefined) setCurrency(patch.currency);
  }

  function draft(): ActivityDraft {
    return {
      title,
      description,
      when,
      date,
      startTime,
      endTime: when === "one_time" ? endTime : "",
      weekday,
      locationName,
      locationAddress,
      groupSize,
      minParticipants,
      cost,
      amount,
      currency,
    };
  }

  async function save(publish: boolean) {
    const current = draft();
    const found = activityIssues(current);
    setIssues(found);
    setFormError(null);
    if (found.length > 0) {
      const first = found[0];
      const target =
        first === "title"
          ? titleId
          : first === "groupSize" || first === "minParticipants"
            ? `${formId}-size`
            : first === "amount"
              ? `${formId}-amount`
              : `${formId}-when`;
      document.getElementById(target)?.focus();
      return;
    }
    const payload = activityPayload(current);
    if (!payload) return;
    setSubmitting(true);
    try {
      const created = await api.createActivity(props.circleId, payload);
      if (!publish) {
        props.onPlanned("draft");
        return;
      }
      try {
        await api.publishActivity(created.id);
        props.onPlanned("published");
      } catch {
        props.onPlanned("draft");
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setFormError(raw.includes("403") ? t("activityForm.forbidden") : t("activityForm.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="activity-form stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save(true);
      }}
      noValidate
    >
      <button type="button" className="circle-details-back" onClick={props.onBack}>
        {t("activityForm.back")}
      </button>
      <header className="activity-form-head">
        <h1>{t("activityForm.title")}</h1>
        <p className="activity-form-circle">
          <BidiText>{circleDisplayTitle(props.circle)}</BidiText>
        </p>
        {context ? <p className="muted activity-form-context">{context}</p> : null}
      </header>

      {loadingDefaults ? (
        <div className="circle-details-skeleton" aria-label={t("common.loading")}>
          <div className="circle-details-skeleton-row" />
          <div className="circle-details-skeleton-row circle-details-skeleton-row--short" />
        </div>
      ) : (
        <>
          {defaultsFailed ? <FormError>{t("activityForm.defaultsFailed")}</FormError> : null}
          <ActivityFormFields
            formId={formId}
            titleId={titleId}
            draft={draft()}
            onChange={applyDraft}
            issues={issues}
            formError={formError}
            submitting={submitting}
            submitLabel={t("activityDetails.publish")}
            submittingLabel={t("activityDetails.publishing")}
            secondaryLabel={t("activityDetails.saveDraft")}
            onSecondary={() => void save(false)}
          />
        </>
      )}
    </form>
  );
}
