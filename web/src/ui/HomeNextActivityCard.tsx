import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus, HomeCalendarSession } from "../api/types";
import { api } from "../api/client";
import { BidiText } from "./BidiText";
import {
  formatJoinedLine,
  formatSessionDateTimeHero,
  getUpcomingSessions,
  isSessionPending,
  sessionTitle,
} from "./homeDashboardUtils";
import { FormError } from "./FormError";

export function HomeNextActivityCard(props: {
  sessions: HomeCalendarSession[];
  onOpenCircle: (circleId: string) => void;
  onRefresh?: () => Promise<void> | void;
  onFindCircles?: () => void;
  onCreateCircle?: () => void;
}) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = getUpcomingSessions(props.sessions)[0];

  if (!next) {
    return (
      <section className="home-hero home-hero--empty card stack onboarding-empty-guidance" aria-label="Next activity">
        <p className="onboarding-empty-title">{t("emptyStates.calendarTitle")}</p>
        <p className="home-hero-empty-text muted">{t("emptyStates.calendarSubtitle")}</p>
        <div className="onboarding-empty-actions row">
          {props.onFindCircles ? (
            <button type="button" className="primary" style={{ width: "auto" }} onClick={props.onFindCircles}>
              {t("emptyStates.findCircles")}
            </button>
          ) : null}
          {props.onCreateCircle ? (
            <button type="button" className="onboarding-secondary" style={{ width: "auto" }} onClick={props.onCreateCircle}>
              {t("emptyStates.createCircle")}
            </button>
          ) : null}
        </div>
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
    <section className="home-hero card" aria-label="Next activity">
      <div className="home-hero-row">
        <button
          type="button"
          className="home-hero-body"
          onClick={() => props.onOpenCircle(next.circleId)}
        >
          <span className="home-hobby-badge" aria-hidden>
            {next.hobyIcon ?? ""}
          </span>
          <span className="home-hero-copy">
            <BidiText as="span" className="home-hero-title">
              {title}
            </BidiText>
            <span className="home-hero-time">{formatSessionDateTimeHero(next.session.dateTime)}</span>
            <span className="home-hero-meta">{formatJoinedLine(memberCount, maxSize, t)}</span>
          </span>
          <span className={`home-status-badge ${pending ? "home-status-badge--pending" : "home-status-badge--confirmed"}`}>
            {pending ? t("home.pending") : t("home.confirmed")}
          </span>
        </button>

        <div className="home-hero-actions">
          <button
            type="button"
            className="primary home-hero-primary"
            disabled={working || imComing}
            onClick={() => void setAttendance("attending")}
          >
            {working && !imComing ? t("common.saving") : t("home.imIn")}
          </button>
          <button
            type="button"
            className="home-hero-secondary"
            disabled={working || (!imComing && pending)}
            onClick={() => void setAttendance("not_attending")}
          >
            {working && imComing ? t("common.saving") : t("home.notNow")}
          </button>
        </div>
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </section>
  );
}
