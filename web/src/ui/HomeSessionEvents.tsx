import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus, HomeCalendarSession } from "../api/types";
import { api } from "../api/client";
import { BidiText } from "./BidiText";
import {
  activityTypeClass,
  formatSessionDateTimeHero,
  isSessionPending,
  sessionTitle,
} from "./homeDashboardUtils";
import { CircleParticipationDisplay } from "./CircleParticipationDisplay";
import { FormError } from "./FormError";

export function HomeSessionEvents(props: {
  sessions: HomeCalendarSession[];
  selectedDay: Date | null;
  onOpenCircle?: (circleId: string) => void;
  onRefresh?: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [workingSessionId, setWorkingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!props.selectedDay || props.sessions.length === 0) return null;

  async function setSessionAttendance(sessionId: string, status: AttendanceStatus) {
    setWorkingSessionId(sessionId);
    setError(null);
    try {
      await api.putAttendance(sessionId, status);
      await props.onRefresh?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorkingSessionId(null);
    }
  }

  return (
    <div className="home-session-events stack">
      <h3 className="home-session-events-heading">
        {props.selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
      </h3>
      {props.sessions.map((item) => {
        const title = sessionTitle(item);
        const pending = isSessionPending(item);
        const busy = workingSessionId === item.session.id;
        const imComing = item.myAttendance?.status === "attending";
        const typeClass = activityTypeClass(item.ritualType);
        const memberCount = item.memberCount ?? 0;
        const maxSize = item.maxSize ?? memberCount ?? 6;
        const circleFull = memberCount >= maxSize;

        return (
          <article
            key={item.session.id}
            className={`home-session-event ${typeClass}${pending ? " home-session-event--pending" : " home-session-event--confirmed"}`}
          >
            <button
              type="button"
              className="home-session-event-main-btn"
              onClick={() => props.onOpenCircle?.(item.circleId)}
            >
              <div className="home-session-event-main">
                {item.hobyIcon ? (
                  <span className="home-session-event-icon" aria-hidden>
                    {item.hobyIcon}
                  </span>
                ) : null}
                <div className="home-session-event-copy">
                  <BidiText className="home-session-event-title">{title}</BidiText>
                  <div className="home-session-event-time">{formatSessionDateTimeHero(item.session.dateTime)}</div>
                  <CircleParticipationDisplay
                    memberCount={memberCount}
                    maxSize={maxSize}
                    className="home-session-event-participation"
                  />
                </div>
              </div>
            </button>
            <div className="home-session-event-actions">
              {!circleFull ? (
                imComing ? (
                  <span className="home-status-badge home-status-badge--confirmed">{t("home.confirmed")}</span>
                ) : (
                  <span className="home-status-badge home-status-badge--pending">{t("home.pending")}</span>
                )
              ) : null}
              <div className="home-session-event-btns">
                <button
                  type="button"
                  className="primary home-session-event-primary"
                  disabled={busy || imComing}
                  onClick={() => void setSessionAttendance(item.session.id, "attending")}
                >
                  {busy && !imComing ? t("common.saving") : t("home.imComing")}
                </button>
                <button
                  type="button"
                  className="home-btn-text"
                  disabled={busy || (!imComing && pending)}
                  onClick={() => void setSessionAttendance(item.session.id, "not_attending")}
                >
                  {busy && imComing ? t("common.saving") : t("home.notNow")}
                </button>
              </div>
            </div>
          </article>
        );
      })}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
