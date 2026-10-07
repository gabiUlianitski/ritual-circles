import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleNextSessionRoster, CircleResponse } from "../api/types";
import { FormError } from "./FormError";
import { formatCircleLocationShort } from "./circleDetailsFormat";

function friendlyDateTime(value: string): { date: string; time: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export function CircleDetailsNextActivity(props: {
  circle: CircleResponse;
  roster?: CircleNextSessionRoster | null;
  myUserId: string | null;
  isCreator: boolean;
  onManage: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const when = props.roster ? friendlyDateTime(props.roster.dateTime) : null;
  const myAttendance = props.roster?.members.find((member) => member.userId === props.myUserId)?.status;
  const attendingCount = useMemo(
    () => props.roster?.members.filter((member) => member.status === "attending").length ?? 0,
    [props.roster],
  );
  const sessionLocation = props.roster?.locationOrLink?.trim() || "";
  const sessionLink = /^https?:\/\//i.test(sessionLocation) ? sessionLocation : null;

  async function setAttendance(status: "attending" | "not_attending") {
    if (!props.roster) return;
    setWorking(true);
    setError(false);
    try {
      await api.putAttendance(props.roster.sessionId, status);
      await props.onRefresh();
    } catch {
      setError(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="circle-details-next" aria-labelledby="circle-next-title">
      <div className="circle-details-section-head">
        <div>
          <p className="circle-details-section-kicker">{t("circleDetails.upNext")}</p>
          <h2 id="circle-next-title">{t("circleDetails.nextActivity")}</h2>
        </div>
        {props.roster ? (
          <span className="circle-details-attending-count">
            {t("circleDetails.attendingCount", { count: attendingCount })}
          </span>
        ) : null}
      </div>

      {props.roster && when ? (
        <div className="circle-details-next-content">
          <div className="circle-details-date-tile" aria-hidden>
            <span>{new Date(props.roster.dateTime).toLocaleDateString(undefined, { month: "short" })}</span>
            <strong>{new Date(props.roster.dateTime).getDate()}</strong>
          </div>
          <div className="circle-details-next-copy">
            <strong>{when.date}</strong>
            <span>{when.time}</span>
            {sessionLink ? (
              <a className="circle-details-location" href={sessionLink} target="_blank" rel="noreferrer">
                {t("circleDetails.openOnlineActivity")}
              </a>
            ) : (
              <span className="circle-details-location">
                {sessionLocation || formatCircleLocationShort(props.circle, t)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="circle-details-next-empty">
          <strong>{t("circleDetails.noUpcomingActivity")}</strong>
          <span>{t("circleDetails.noUpcomingActivityHint")}</span>
          {props.isCreator ? (
            <button type="button" className="circle-details-secondary" onClick={props.onManage}>
              {t("circleDetails.manageSchedule")}
            </button>
          ) : null}
        </div>
      )}

      {props.roster ? (
        <div className="circle-details-attendance">
          <span className="circle-details-attendance-label">
            {myAttendance === "attending"
              ? t("circleDetails.youAreAttending")
              : t("circleDetails.youAreNotAttending")}
          </span>
          <div className="circle-details-attendance-actions">
            <button
              type="button"
              className={myAttendance === "attending" ? "circle-details-attendance-btn is-active" : "circle-details-attendance-btn"}
              disabled={working || myAttendance === "attending"}
              onClick={() => void setAttendance("attending")}
            >
              {working ? t("common.saving") : t("home.imIn")}
            </button>
            <button
              type="button"
              className={myAttendance === "not_attending" ? "circle-details-attendance-btn is-active" : "circle-details-attendance-btn"}
              disabled={working || myAttendance === "not_attending"}
              onClick={() => void setAttendance("not_attending")}
            >
              {t("home.notNow")}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <FormError>{t("circleDetails.attendanceFailed")}</FormError> : null}
    </section>
  );
}
