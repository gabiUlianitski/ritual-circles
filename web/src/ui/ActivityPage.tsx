import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HomeResponse } from "../api/types";
import { BidiText } from "./BidiText";
import { CircleDetails } from "./CircleDetails";
import { HomeCalendar } from "./HomeCalendar";
import { HomeCirclesList } from "./HomeCirclesList";
import { HomeEmptyDayPrompt } from "./HomeEmptyDayPrompt";
import { HomeNextActivityCard } from "./HomeNextActivityCard";
import { HomeSessionEvents } from "./HomeSessionEvents";
import { HomeWeekStrip } from "./HomeWeekStrip";
import { dateToIsoLocal, formatSessionDateTimeHero, getUpcomingSessions, sessionTitle } from "./homeDashboardUtils";

const HISTORY_LIMIT = 6;

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function defaultSelectedDay(sessions: HomeResponse["calendarSessions"]): Date {
  const next = getUpcomingSessions(sessions ?? [])[0];
  const d = next ? new Date(next.session.dateTime) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Upcoming meetups, attendance and past sessions — moved off Home unchanged. */
export function ActivityPage(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: (prefillDateIso?: string) => void;
  onGoFindCircles: (prefillDateIso?: string) => void;
}) {
  const { t } = useTranslation();
  const calendarSessions = props.home.calendarSessions ?? [];
  const myCircles = props.home.myCircles ?? [];
  const hasActivities = calendarSessions.length > 0;
  const [detailsCircleId, setDetailsCircleId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<"details" | "chat" | "scheduled">("details");
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => defaultSelectedDay(calendarSessions));

  const selectedDaySessions = useMemo(() => {
    if (!selectedDay) return [];
    const key = ymdKey(selectedDay);
    return calendarSessions
      .filter((s) => ymdKey(new Date(s.session.dateTime)) === key)
      .sort((a, b) => new Date(a.session.dateTime).getTime() - new Date(b.session.dateTime).getTime());
  }, [calendarSessions, selectedDay]);

  const history = useMemo(() => {
    const now = Date.now();
    return calendarSessions
      .filter((s) => new Date(s.session.dateTime).getTime() < now)
      .sort((a, b) => new Date(b.session.dateTime).getTime() - new Date(a.session.dateTime).getTime())
      .slice(0, HISTORY_LIMIT);
  }, [calendarSessions]);

  function openCircle(circleId: string, tab: "details" | "chat" | "scheduled" = "details") {
    setDetailsCircleId(circleId);
    setDetailsInitialTab(tab);
  }

  if (detailsCircleId) {
    return (
      <CircleDetails
        circleId={detailsCircleId}
        initialTab={detailsInitialTab}
        onBack={() => {
          setDetailsCircleId(null);
          setDetailsInitialTab("details");
        }}
        onLeftCircle={async () => {
          await props.onRefresh();
          setDetailsCircleId(null);
          setDetailsInitialTab("details");
        }}
      />
    );
  }

  const showEmptyDayPrompt = selectedDay != null && selectedDaySessions.length === 0 && hasActivities;

  return (
    <div className="stack dashboard-home activity-page">
      <header className="home-welcome">
        <h1 className="home-welcome-greeting">{t("activityPage.title")}</h1>
        <p className="home-welcome-context muted">{t("activityPage.subtitle")}</p>
      </header>

      <section className="home-primary-section stack" aria-label={t("activityPage.upcoming")}>
        <h2 className="home-section-title">{t("activityPage.upcoming")}</h2>
        <HomeNextActivityCard
          sessions={calendarSessions}
          onOpenCircle={(id) => openCircle(id, "details")}
          onRefresh={props.onRefresh}
          onFindCircles={() => props.onGoFindCircles()}
          onCreateCircle={() => props.onGoCreateJoin()}
        />
      </section>

      {hasActivities ? (
        <section className="home-schedule stack" aria-labelledby="activity-schedule-title">
          <header className="home-schedule-head">
            <h2 id="activity-schedule-title" className="home-section-title">
              {t("home.yourSchedule")}
            </h2>
            <p className="home-schedule-support">{t("home.yourScheduleSupport")}</p>
          </header>
          <HomeWeekStrip sessions={calendarSessions} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
          {showEmptyDayPrompt && selectedDay ? (
            <HomeEmptyDayPrompt
              selectedDay={selectedDay}
              onFindCircles={() => props.onGoFindCircles(dateToIsoLocal(selectedDay))}
              onCreateCircle={() => props.onGoCreateJoin(dateToIsoLocal(selectedDay))}
            />
          ) : null}
          <button
            type="button"
            className="home-btn-text home-calendar-toggle"
            aria-expanded={showFullCalendar}
            onClick={() => setShowFullCalendar((v) => !v)}
          >
            {showFullCalendar ? t("home.hideFullCalendar") : t("home.viewFullCalendar")}
          </button>
          <HomeCalendar
            expanded={showFullCalendar}
            sessions={calendarSessions}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          {selectedDay && selectedDaySessions.length > 0 ? (
            <HomeSessionEvents
              sessions={selectedDaySessions}
              selectedDay={selectedDay}
              onOpenCircle={(id) => openCircle(id, "details")}
              onRefresh={props.onRefresh}
            />
          ) : null}
        </section>
      ) : null}

      {myCircles.length > 0 ? (
        <section className="home-secondary-section stack" aria-label={t("activityPage.attendance")}>
          <h2 className="home-section-title">{t("activityPage.attendance")}</h2>
          <HomeCirclesList
            items={myCircles}
            sessions={calendarSessions}
            onRefresh={props.onRefresh}
            onOpenCircle={openCircle}
            hideHeading
          />
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="home-secondary-section stack" aria-label={t("activityPage.history")}>
          <h2 className="home-section-title">{t("activityPage.history")}</h2>
          <ul className="activity-history">
            {history.map((item) => (
              <li key={item.session.id}>
                <button
                  type="button"
                  className="activity-history-item"
                  onClick={() => openCircle(item.circleId, "details")}
                >
                  <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
                    {item.hobyIcon ?? ""}
                  </span>
                  <span className="activity-history-copy">
                    <BidiText as="span" className="activity-history-title">
                      {sessionTitle(item)}
                    </BidiText>
                    <span className="activity-history-time muted">
                      {formatSessionDateTimeHero(item.session.dateTime)}
                    </span>
                  </span>
                  <span className="activity-history-status muted">
                    {item.myAttendance?.status === "attending" ? t("activityPage.attended") : t("activityPage.missed")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
