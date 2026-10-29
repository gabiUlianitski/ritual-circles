import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity, CircleResponse, Hoby } from "../api/types";
import { ActivityFormFields } from "./ActivityFormFields";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, discoverSubtitleParts } from "./circleDisplay";
import { activityPayload, draftFromActivity, activityIssues, type ActivityDraft, type ActivityIssueCode } from "./activityForm";

function applyPatch(draft: ActivityDraft, patch: Partial<ActivityDraft>): ActivityDraft {
  return { ...draft, ...patch };
}

export function ActivityEdit(props: {
  activity: Activity;
  circle: CircleResponse;
  hobby?: Hoby;
  onBack: () => void;
  onSaved: (activity: Activity) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const titleId = `${formId}-title`;
  const [draft, setDraft] = useState<ActivityDraft>(() => draftFromActivity(props.activity));
  const [issues, setIssues] = useState<ActivityIssueCode[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const context = discoverSubtitleParts(props.circle, props.hobby).join(" · ");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const current = { ...draft, endTime: draft.when === "one_time" ? draft.endTime : "" };
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
    const payload = activityPayload(current, { keepStartAt: props.activity.startAt });
    if (!payload) return;
    setSubmitting(true);
    try {
      const saved = await api.updateActivity(props.activity.id, payload);
      props.onSaved(saved);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setFormError(
        raw.includes("403")
          ? t("activityForm.forbidden")
          : raw.toLowerCase().includes("smaller than the number of people going")
            ? t("activityParticipation.groupSizeTooSmall")
            : t("activityDetails.saveFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="activity-form stack" onSubmit={(event) => void submit(event)} noValidate>
      <button type="button" className="circle-details-back" onClick={props.onBack}>
        {t("activityForm.back")}
      </button>
      <header className="activity-form-head">
        <h1>{t("activityDetails.editTitle")}</h1>
        <p className="activity-form-circle">
          <BidiText>{circleDisplayTitle(props.circle)}</BidiText>
        </p>
        {context ? <p className="muted activity-form-context">{context}</p> : null}
      </header>
      <ActivityFormFields
        formId={formId}
        titleId={titleId}
        draft={draft}
        onChange={(patch) => setDraft((current) => applyPatch(current, patch))}
        issues={issues}
        formError={formError}
        submitting={submitting}
        submitLabel={t("activityDetails.save")}
        submittingLabel={t("activityForm.submitting")}
        circleCity={props.circle.cityName?.split(",")[0]?.trim() ?? ""}
        countryCode={props.circle.countryCode?.trim() ?? ""}
        locationFromCircle={false}
      />
    </form>
  );
}
