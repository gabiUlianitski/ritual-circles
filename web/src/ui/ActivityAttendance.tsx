import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityAttendanceEntry, ActivityAttendanceStatus } from "../api/types";
import { BidiText } from "./BidiText";
import { CircleMemberAvatar } from "./CircleMemberAvatar";

type Outcome = Exclude<ActivityAttendanceStatus, "pending">;

/** Organizer-only list for an Activity or date that has ended. Outcomes stay private to organizers. */
export function ActivityAttendance(props: {
  entries: ActivityAttendanceEntry[];
  onMark: (participantId: string, outcome: Outcome) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.entries.length === 0) return null;

  async function mark(entry: ActivityAttendanceEntry, outcome: Outcome) {
    if (entry.attendanceStatus === outcome) return;
    setBusyId(entry.participantId);
    setSavedId(null);
    setError(null);
    try {
      await props.onMark(entry.participantId, outcome);
      setSavedId(entry.participantId);
    } catch {
      setError(t("activityAttendance.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  function statusLabel(status: ActivityAttendanceStatus): string {
    if (status === "attended") return t("activityAttendance.attended");
    if (status === "no_show") return t("activityAttendance.noShow");
    return t("activityAttendance.notMarked");
  }

  return (
    <section className="activity-attendance" aria-label={t("activityAttendance.title")}>
      <h3>{t("activityAttendance.whoCame")}</h3>
      <ul className="activity-going-list activity-attendance-list">
        {props.entries.map((entry) => {
          const busy = busyId === entry.participantId;
          return (
            <li key={entry.participantId}>
              <div className="activity-attendance-person">
                <CircleMemberAvatar name={entry.name} avatarUrl={entry.avatarUrl} compact />
                <BidiText>{entry.name}</BidiText>
                <span className="muted activity-attendance-status">{statusLabel(entry.attendanceStatus)}</span>
              </div>
              <div className="activity-attendance-actions" role="group" aria-label={t("activityAttendance.markFor", { name: entry.name })}>
                {(["attended", "no_show"] as const).map((outcome) => {
                  const selected = entry.attendanceStatus === outcome;
                  return (
                    <button
                      key={outcome}
                      type="button"
                      className={selected ? "is-selected" : undefined}
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => void mark(entry, outcome)}
                    >
                      {selected ? <span aria-hidden>✓ </span> : null}
                      {statusLabel(outcome)}
                    </button>
                  );
                })}
              </div>
              {savedId === entry.participantId ? (
                <span className="muted" role="status">
                  {t("activityAttendance.saved")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="activity-form-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
