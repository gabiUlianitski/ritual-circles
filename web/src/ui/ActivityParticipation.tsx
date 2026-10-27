import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity } from "../api/types";
import { BidiText } from "./BidiText";
import { CircleMemberAvatar } from "./CircleMemberAvatar";
import { activityParticipationDisplay } from "./activityDisplay";

export function ActivityParticipationPanel(props: {
  activity: Activity;
  onActivity: (activity: Activity) => void;
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
  const going = participation.currentUserStatus === "going";
  const ended = Boolean(activity.hasEnded || activity.actions?.hasEnded);
  const live = openOneTime && !ended;
  const showJoin = live && !going && !participation.isFull;
  const showLeave = live && going && !participation.confirmationRequired;
  const people = participation.going ?? [];
  const showCount = openOneTime || (activity.status === "completed" && oneTime);
  const facts = activityParticipationDisplay(participation, t);

  async function refreshActivity() {
    const fresh = await api.getActivity(activity.id);
    props.onActivity(fresh);
    return fresh;
  }

  async function join() {
    setWorking(true);
    setError(null);
    try {
      await api.joinActivity(activity.id);
      await refreshActivity();
      props.onNotice(t("activityParticipation.joined"));
      props.onChanged();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      if (raw.includes("409")) {
        setError(t("activityParticipation.justFilled"));
        try {
          await refreshActivity();
        } catch {
          /* The full message still stands if the refresh fails. */
        }
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
      await api.leaveActivity(activity.id);
      await refreshActivity();
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

      {showCount ? (
        <>
          <p className="activity-participation-count">{facts.countLabel}</p>
          {facts.secondaryLabel ? <p className="muted activity-participation-note">{facts.secondaryLabel}</p> : null}
          {facts.readinessLabel ? <p className="activity-participation-ready">{facts.readinessLabel}</p> : null}
          {facts.fullLabel ? <p className="activity-participation-note">{facts.fullLabel}</p> : null}
        </>
      ) : null}
      {going && activity.status === "open" ? (
        <p className="activity-participation-yours">{t("activityParticipation.youreGoing")}</p>
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

      {showLeave ? (
        <div className="activity-participation-actions">
          <button type="button" className="circle-details-secondary" disabled={working} onClick={() => setConfirmLeave(true)}>
            {t("activityParticipation.leave")}
          </button>
        </div>
      ) : null}
      {showJoin ? (
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
