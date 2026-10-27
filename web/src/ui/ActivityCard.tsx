import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity, ActivityOccurrence } from "../api/types";
import {
  activityCardPlace,
  activityParticipationDisplay,
  activityScheduleLine,
} from "./activityDisplay";
import { parsedWeeklyRule } from "./activityForm";
import { ActivityChanged } from "./ActivitySuggestions";
import { BidiText } from "./BidiText";
import { FormError } from "./FormError";

/** One Activity inside Circle Details. Participation numbers come from the server. */
export function ActivityCard(props: {
  activity: Activity;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activity = props.activity;
  const recurring = activity.recurrenceType === "recurring";
  const date = recurring ? shownDate(activity) : null;
  const participation = recurring ? date?.participation : activity.participation;
  const status = date?.status ?? activity.status;
  const whenSource = date ?? activity;
  const when = activityScheduleLine(whenSource.startAt, whenSource.endAt);
  const place = activityCardPlace(
    date?.locationName ?? activity.locationName,
    date?.locationAddress ?? activity.locationAddress,
  );
  const display = participation ? activityParticipationDisplay(participation, t) : null;
  const going = participation?.currentUserStatus === "going";
  const changed = Boolean(participation?.confirmationRequired && going);
  const cancelled = status === "cancelled" || status === "completed";
  const draft = status === "draft";
  const canJoin = !changed && !cancelled && !draft && Boolean((date?.actions ?? activity.actions)?.canJoin);
  const weekly = recurring ? parsedWeeklyRule(activity.recurrenceRule) : null;
  const repeat = recurring
    ? weekly
      ? t("circleActivities.everyDay", { day: t(`activityForm.day${weekly.weekday}`) })
      : t("activityPage.everyWeek")
    : null;
  const detailsLabel = recurring ? t("activityPage.viewDates") : t("activityPage.activityDetails");
  const lifecycle =
    status === "confirmed"
      ? t("activityDetails.status.confirmed")
      : status === "cancelled"
        ? t("activityDetails.status.cancelled")
        : status === "completed"
          ? t("activityDetails.status.completed")
          : draft
            ? t("activityDetails.status.draft")
            : null;
  const personal = [lifecycle, going && !changed ? t("activityParticipation.youreGoing") : null].filter(Boolean);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      if (date) await api.joinOccurrence(activity.id, date.id);
      else await api.joinActivity(activity.id);
      props.onChanged();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(raw.includes("409") ? t("activityParticipation.justFilled") : t("activityParticipation.joinFailed"));
    } finally {
      setJoining(false);
    }
  }

  async function settle(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      props.onChanged();
    } catch {
      setError(t("activityParticipation.participationFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`activity-card${cancelled || draft ? " is-quiet" : ""}`}>
      <button type="button" className="activity-card-open" onClick={props.onOpen}>
        <BidiText as="span" className="activity-card-title">
          {activity.title}
        </BidiText>
        {repeat ? <span className="activity-card-repeat">{repeat}</span> : null}
        {when ? (
          <span className="activity-card-when">
            {recurring ? t("circleActivities.nextWhen", { when }) : when}
          </span>
        ) : null}
        {place ? (
          <BidiText as="span" className="activity-card-place">
            {place}
          </BidiText>
        ) : null}
        {!changed && display ? (
          <span className="activity-card-count">
            <bdi dir="ltr">{display.countLabel}</bdi>
            {display.secondaryLabel ? <span> · {display.secondaryLabel}</span> : null}
          </span>
        ) : null}
        {changed || !display ? null : (
          <>
            {display.readinessLabel ? <span className="activity-card-ready">{display.readinessLabel}</span> : null}
            {display.fullLabel ? <span className="activity-card-full">{display.fullLabel}</span> : null}
            {personal.length > 0 ? <span className="activity-card-personal">{personal.join(" · ")}</span> : null}
          </>
        )}
      </button>
      {changed && participation ? (
        <>
          <ActivityChanged
            summary={[when, place].filter(Boolean).join(" · ")}
            busy={busy}
            leaveLabel={date ? t("activityParticipation.leaveDate") : undefined}
            onStillGoing={() =>
              void settle(() =>
                date ? api.reconfirmOccurrence(activity.id, date.id) : api.reconfirmActivity(activity.id),
              )
            }
            onLeave={() =>
              void settle(() => (date ? api.leaveOccurrence(activity.id, date.id) : api.leaveActivity(activity.id)))
            }
          />
          {display ? (
            <p className="activity-card-count activity-card-count--quiet">
              <bdi dir="ltr">{display.countLabel}</bdi>
            </p>
          ) : null}
        </>
      ) : (
        <div className="activity-card-actions">
          {canJoin ? (
            <button type="button" className="circle-details-primary" disabled={joining} onClick={() => void join()}>
              {date ? t("activityParticipation.joinDate") : t("activityParticipation.join")}
            </button>
          ) : (
            <button type="button" className="circle-details-secondary" onClick={props.onOpen}>
              {detailsLabel}
            </button>
          )}
        </div>
      )}
      {error ? <FormError>{error}</FormError> : null}
    </article>
  );
}

function shownDate(activity: Activity): ActivityOccurrence | null {
  if (activity.nextOccurrence) return activity.nextOccurrence;
  const dates = activity.occurrences ?? [];
  const past = dates
    .filter((item) => item.hasEnded || item.status === "completed" || item.status === "cancelled")
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  return past[0] ?? null;
}
