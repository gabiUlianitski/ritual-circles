import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity, ActivityParticipation as Participation } from "../api/types";
import { BidiText } from "./BidiText";
import { CircleMemberAvatar } from "./CircleMemberAvatar";
import { activityHasEnded } from "./activityDisplay";

function spotsText(remaining: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (remaining <= 0) return t("activityParticipation.full");
  if (remaining === 1) return t("activityParticipation.spotLeft");
  return t("activityParticipation.spotsLeft", { count: remaining });
}

export function ActivityParticipationPanel(props: {
  activity: Activity;
  onParticipation: (participation: Participation) => void;
  onChanged: () => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useTranslation();
  const activity = props.activity;
  const participation = activity.participation;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (!participation) return null;
  if (activity.status === "draft") return null;

  const oneTime = activity.recurrenceType === "one_time";
  const openOneTime = (activity.status === "open" || activity.status === "confirmed") && oneTime;
  const ended = activityHasEnded(activity);
  const going = participation.currentUserStatus === "going";
  const people = participation.going ?? [];
  const showActions = openOneTime && !ended;
  const showCount = openOneTime || (activity.status === "completed" && oneTime);

  async function refreshAfterFull() {
    try {
      const fresh = await api.getActivity(activity.id);
      if (fresh.participation) props.onParticipation(fresh.participation);
    } catch {
      /* The full message still stands if the refresh fails. */
    }
  }

  async function join() {
    setWorking(true);
    setError(null);
    try {
      const saved = await api.joinActivity(activity.id);
      props.onParticipation(saved);
      props.onNotice(t("activityParticipation.joined"));
      props.onChanged();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      if (raw.includes("409")) {
        setError(t("activityParticipation.justFilled"));
        await refreshAfterFull();
      } else if (raw.includes("403")) {
        setError(t("activityForm.forbidden"));
      } else {
        setError(t("activityParticipation.joinFailed"));
      }
    } finally {
      setWorking(false);
    }
  }

  async function leave() {
    setWorking(true);
    setError(null);
    try {
      const saved = await api.leaveActivity(activity.id);
      props.onParticipation(saved);
      setConfirmLeave(false);
      props.onNotice(t("activityParticipation.left"));
      props.onChanged();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setConfirmLeave(false);
      setError(raw.includes("403") ? t("activityForm.forbidden") : t("activityParticipation.leaveFailed"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="activity-participation" aria-label={t("activityParticipation.going")}>
      {activity.status === "open" && activity.recurrenceType === "recurring" ? (
        <p className="muted activity-participation-note">{t("activityParticipation.recurringLater")}</p>
      ) : null}

      {showCount && participation.goingCount > 0 ? (
        <p className="activity-participation-count">
          {t("activityParticipation.goingCount", {
            count: participation.goingCount,
            size: participation.groupSize,
          })}
        </p>
      ) : null}
      {openOneTime && participation.goingCount === 0 ? (
        <p className="muted activity-participation-note">{t("activityParticipation.nobodyYet")}</p>
      ) : null}
      {going && activity.status === "open" ? (
        <p className="activity-participation-yours">{t("activityParticipation.youreGoing")}</p>
      ) : null}
      {showActions && !going ? (
        <p className={participation.remainingPlaces === 1 ? "activity-spots activity-spots--last" : "activity-spots"}>
          {spotsText(participation.remainingPlaces, t)}
        </p>
      ) : null}

      {oneTime && people.length > 0 ? (
        <ul className="activity-going-list">
          {people.map((person, index) => (
            <li key={`${person.name}-${index}`}>
              <CircleMemberAvatar name={person.name} avatarUrl={person.avatarUrl} compact />
              <BidiText>{person.name}</BidiText>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="activity-form-field-error" role="alert">
          {error}
        </p>
      ) : null}

      {activity.actions?.canLeave && !participation.confirmationRequired ? (
        <div className="activity-participation-actions">
          <button type="button" className="circle-details-secondary" disabled={working} onClick={() => setConfirmLeave(true)}>
            {t("activityParticipation.leave")}
          </button>
        </div>
      ) : null}
      {activity.actions?.canJoin ? (
        <div className="activity-participation-actions">
          <button type="button" className="circle-details-primary" disabled={working} onClick={() => void join()}>
            {t("activityParticipation.join")}
          </button>
        </div>
      ) : null}

      {confirmLeave ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="leave-activity-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="leave-activity-title">{t("activityParticipation.leaveAsk")}</h2>
            <p>{t("activityParticipation.leaveBody")}</p>
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={working} onClick={() => setConfirmLeave(false)}>
                {t("activityParticipation.stay")}
              </button>
              <button type="button" className="profile-interest-remove" disabled={working} onClick={() => void leave()}>
                {t("activityParticipation.leave")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
