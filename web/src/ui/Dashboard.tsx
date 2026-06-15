import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { HomeResponse, UserMeResponse } from "../api/types";
import {
  getChecklistProgress,
  isNewUser,
  shouldShowChecklist,
} from "../onboarding/onboardingState";
import { CircleDetails } from "./CircleDetails";
import { HomeCalendar } from "./HomeCalendar";
import { HomeEmptyDayPrompt } from "./HomeEmptyDayPrompt";
import { HomeCirclesList } from "./HomeCirclesList";
import { HomeNextActivityCard } from "./HomeNextActivityCard";
import { HomeSessionEvents } from "./HomeSessionEvents";
import { HomeWeekStrip } from "./HomeWeekStrip";
import { HomeWelcomeHeader } from "./HomeWelcomeHeader";
import { OnboardingChecklist } from "./onboarding/OnboardingChecklist";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
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
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const calendarSessions = props.home.calendarSessions ?? [];
  const myCircles = props.home.myCircles ?? [];
  const hasActivities = calendarSessions.length > 0;
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => defaultSelectedDay(calendarSessions));

  useEffect(() => {
    void api.getMe().then(setMe).catch(() => setMe(null));
  }, [props.home]);

  const checklistProgress = useMemo(
    () => getChecklistProgress(props.home, me?.userHobies ?? []),
    [props.home, me?.userHobies],
  );

  const selectedDaySessions = useMemo(() => {
    if (!selectedDay) return [];
    const key = ymdKey(selectedDay);
    return calendarSessions
      .filter((s) => ymdKey(new Date(s.session.dateTime)) === key)
      .sort((a, b) => new Date(a.session.dateTime).getTime() - new Date(b.session.dateTime).getTime());
  }, [calendarSessions, selectedDay]);

  const showEmptyDayPrompt = selectedDay != null && selectedDaySessions.length === 0 && hasActivities;

  function openCircle(circleId: string, tab: "details" | "chat" | "scheduled" = "details") {
    setDetailsCircleId(circleId);
    setDetailsInitialTab(tab);
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

  if (isNewUser(props.home)) {
    return (
      <OnboardingFlow
        home={props.home}
        onRefresh={props.onRefresh}
        onGoCreateJoin={() => props.onGoCreateJoin()}
      />
    );
  }

  return (
    <div className="stack dashboard-home">
      {shouldShowChecklist(props.home, checklistProgress) ? (
        <OnboardingChecklist progress={checklistProgress} />
      ) : null}

      <HomeWelcomeHeader sessions={calendarSessions} firstName={props.userFirstName} />

      <section className="home-primary-section stack" aria-label={t("home.upcomingThisWeek")}>
        <h2 className="home-section-title">{t("home.upcomingThisWeek")}</h2>
        <HomeNextActivityCard
          sessions={calendarSessions}
          onOpenCircle={(id) => openCircle(id, "details")}
          onRefresh={props.onRefresh}
          onFindCircles={() => props.onGoFindCircles()}
          onCreateCircle={() => props.onGoCreateJoin()}
        />

        {hasActivities ? (
          <>
            <HomeWeekStrip sessions={calendarSessions} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            {showEmptyDayPrompt && selectedDay ? (
              <HomeEmptyDayPrompt
                selectedDay={selectedDay}
                onFindCircles={findCirclesForSelectedDay}
                onCreateCircle={createCircleForSelectedDay}
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
          </>
        ) : null}
      </section>

      <section className="home-secondary-section stack" aria-label={t("emptyStates.myCirclesTitle")}>
        <h2 className="home-section-title">{t("emptyStates.myCirclesTitle")}</h2>
        <HomeCirclesList
          items={myCircles}
          onRefresh={props.onRefresh}
          onOpenCircle={openCircle}
          hideHeading
          emptyTitle={t("emptyStates.circlesTitle")}
          emptySubtitle={t("emptyStates.circlesSubtitle")}
          emptyActionLabel={t("emptyStates.discoverCircles")}
          onEmptyAction={() => props.onGoFindCircles()}
          emptySecondaryActionLabel={t("emptyStates.createCircle")}
          onEmptySecondaryAction={() => props.onGoCreateJoin()}
        />
      </section>
    </div>
  );
}
