import React, { useState } from "react";
import type { AttendanceStatus, HomeCalendarSession } from "../api/types";
import { api } from "../api/client";
import {
  formatSessionDateTimeHero,
  getUpcomingSessions,
  isSessionPending,
  sessionTitle,
} from "./homeDashboardUtils";
import { CircleParticipationDisplay } from "./CircleParticipationDisplay";
import { FormError } from "./FormError";

export function HomeNextActivityCard(props: {
  sessions: HomeCalendarSession[];
  onOpenCircle: (circleId: string) => void;
  onRefresh?: () => Promise<void> | void;
  onFindCircles?: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = getUpcomingSessions(props.sessions)[0];

  if (!next) {
    return (
      <section className="home-hero home-hero--empty card stack" aria-label="Next activity">
        <p className="home-hero-empty-text">No hangouts on your calendar yet</p>
        {props.onFindCircles ? (
          <button type="button" className="home-btn-text home-hero-empty-link" onClick={props.onFindCircles}>
            Explore circles
          </button>
        ) : null}
      </section>
    );
  }

  const title = sessionTitle(next);
  const pending = isSessionPending(next);
  const imComing = next.myAttendance?.status === "attending";
  const memberCount = next.memberCount ?? 0;
  const maxSize = next.maxSize ?? memberCount ?? 6;

  async function setAttendance(status: AttendanceStatus) {
    setWorking(true);
    setError(null);
    try {
      await api.putAttendance(next!.session.id, status);
      await props.onRefresh?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="home-hero card stack" aria-label="Next activity">
      <button
        type="button"
        className="home-hero-body"
        onClick={() => props.onOpenCircle(next.circleId)}
      >
        <div className="home-hero-top">
          {next.hobyIcon ? (
            <span className="home-hero-icon" aria-hidden>
              {next.hobyIcon}
            </span>
          ) : null}
          <div className="home-hero-copy">
            <h2 className="home-hero-title">{title}</h2>
            <p className="home-hero-time">{formatSessionDateTimeHero(next.session.dateTime)}</p>
          </div>
          {pending ? (
            <span className="home-status-badge home-status-badge--pending">Pending</span>
          ) : (
            <span className="home-status-badge home-status-badge--confirmed">Confirmed</span>
          )}
        </div>
        <CircleParticipationDisplay
          memberCount={memberCount}
          maxSize={maxSize}
          showAvatars
          className="home-hero-social"
        />
      </button>

      <div className="home-hero-actions">
        <button
          type="button"
          className="primary home-hero-primary"
          disabled={working || imComing}
          onClick={() => void setAttendance("attending")}
        >
          {working && !imComing ? "Saving…" : "I'm in ✅"}
        </button>
        <button
          type="button"
          className="home-btn-text"
          disabled={working || (!imComing && pending)}
          onClick={() => void setAttendance("not_attending")}
        >
          {working && imComing ? "Saving…" : "Not now"}
        </button>
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </section>
  );
}
