import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HomeResponse } from "../api/types";
import { CircleDetails } from "./CircleDetails";
import { HomeCalendar } from "./HomeCalendar";
import { HomeEmptyDayPrompt } from "./HomeEmptyDayPrompt";
import { HomeNextActivityCard } from "./HomeNextActivityCard";
import { HomeSessionEvents } from "./HomeSessionEvents";
import { HomeWeekStrip } from "./HomeWeekStrip";
import { HomeWelcomeHeader } from "./HomeWelcomeHeader";
import { dateToIsoLocal, getUpcomingSessions } from "./homeDashboardUtils";

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function defaultSelectedDay(sessions: HomeResponse["calendarSessions"]): Date | null {
  const next = getUpcomingSessions(sessions ?? [])[0];
  if (next) {
    const d = new Date(next.session.dateTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function Dashboard(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: (prefillDateIso?: string) => void;
  onGoFindCircles: (prefillDateIso?: string) => void;
  userFirstName?: string | null;
}) {
  const { t } = useTranslation();
  const [detailsCircleId, setDetailsCircleId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<"details" | "chat" | "scheduled">("details");
  const calendarSessions = props.home.calendarSessions ?? [];
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => defaultSelectedDay(calendarSessions));

  const selectedDaySessions = useMemo(() => {
    if (!selectedDay) return [];
    const key = ymdKey(selectedDay);
    return calendarSessions
      .filter((s) => ymdKey(new Date(s.session.dateTime)) === key)
      .sort((a, b) => new Date(a.session.dateTime).getTime() - new Date(b.session.dateTime).getTime());
  }, [calendarSessions, selectedDay]);

  const showEmptyDayPrompt = selectedDay != null && selectedDaySessions.length === 0;

  function openCircle(circleId: string, t: "details" | "chat" | "scheduled" = "details") {
    setDetailsCircleId(circleId);
    setDetailsInitialTab(t);
  }

  function findCirclesForSelectedDay() {
    if (!selectedDay) return;
    props.onGoFindCircles(dateToIsoLocal(selectedDay));
  }

  function createCircleForSelectedDay() {
    if (!selectedDay) return;
    props.onGoCreateJoin(dateToIsoLocal(selectedDay));
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

  return (
    <div className="stack dashboard-home">
      <HomeWelcomeHeader sessions={calendarSessions} firstName={props.userFirstName} />

      <HomeNextActivityCard
        sessions={calendarSessions}
        onOpenCircle={(id) => openCircle(id, "details")}
        onRefresh={props.onRefresh}
        onFindCircles={() => props.onGoFindCircles()}
      />

      <section className="home-upcoming stack" aria-label={t("home.upcomingThisWeek")}>
        <h2 className="home-section-title">{t("home.upcomingThisWeek")}</h2>
        <HomeWeekStrip sessions={calendarSessions} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        {showEmptyDayPrompt && selectedDay ? (
          <HomeEmptyDayPrompt
            selectedDay={selectedDay}
            onFindCircles={findCirclesForSelectedDay}
            onCreateCircle={createCircleForSelectedDay}
          />
        ) : null}
      </section>

      {calendarSessions.length > 0 ? (
        <button
          type="button"
          className="home-btn-text home-calendar-toggle"
          aria-expanded={showFullCalendar}
          onClick={() => setShowFullCalendar((v) => !v)}
        >
          {showFullCalendar ? t("home.hideFullCalendar") : t("home.viewFullCalendar")}
        </button>
      ) : null}

      {calendarSessions.length > 0 ? (
        <HomeCalendar
          expanded={showFullCalendar}
          sessions={calendarSessions}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      ) : null}

      {selectedDay && selectedDaySessions.length > 0 ? (
        <HomeSessionEvents
          sessions={selectedDaySessions}
          selectedDay={selectedDay}
          onOpenCircle={(id) => openCircle(id, "details")}
          onRefresh={props.onRefresh}
        />
      ) : null}
    </div>
  );
}
