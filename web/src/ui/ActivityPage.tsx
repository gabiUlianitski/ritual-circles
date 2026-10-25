import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HomeActivityItem, HomeResponse } from "../api/types";
import { CircleDetails } from "./CircleDetails";
import { HomeActivityEvents } from "./HomeActivityEvents";
import { HomeCalendar } from "./HomeCalendar";
import { HomeCirclesList } from "./HomeCirclesList";
import { HomeEmptyDayPrompt } from "./HomeEmptyDayPrompt";
import { HomeNextActivityCard } from "./HomeNextActivityCard";
import { HomeWeekStrip } from "./HomeWeekStrip";
import { upcomingHomeActivities } from "./homeActivities";
import { dateToIsoLocal } from "./homeDashboardUtils";

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function defaultSelectedDay(items: HomeActivityItem[]): Date {
  const d = items[0] ? new Date(items[0].startAt) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** See-all for Home: joined Activities first, then the circles you belong to. */
export function ActivityPage(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: (prefillDateIso?: string) => void;
  onGoFindCircles: (prefillDateIso?: string) => void;
}) {
  const { t } = useTranslation();
  const activities = useMemo(
    () => upcomingHomeActivities(props.home.upcomingActivities),
    [props.home.upcomingActivities],
  );
  const myCircles = props.home.myCircles ?? [];
  const hasActivities = activities.length > 0;
  const [detailsCircleId, setDetailsCircleId] = useState<string | null>(null);
  const [detailsActivityId, setDetailsActivityId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<"details" | "chat" | "scheduled">("details");
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => defaultSelectedDay(activities));

  const selectedDayActivities = useMemo(() => {
    if (!selectedDay) return [];
    const key = ymdKey(selectedDay);
    return activities.filter((item) => ymdKey(new Date(item.startAt)) === key);
  }, [activities, selectedDay]);

  function openCircle(circleId: string, tab: "details" | "chat" | "scheduled" = "details") {
    setDetailsActivityId(null);
    setDetailsCircleId(circleId);
    setDetailsInitialTab(tab);
  }

  function openActivity(item: HomeActivityItem) {
    setDetailsActivityId(item.activityId);
    setDetailsCircleId(item.circleId);
    setDetailsInitialTab("details");
  }

  function closeDetails() {
    const fromActivity = detailsActivityId != null;
    setDetailsCircleId(null);
    setDetailsActivityId(null);
    setDetailsInitialTab("details");
    if (fromActivity) void props.onRefresh();
  }

  if (detailsCircleId) {
    return (
      <CircleDetails
        circleId={detailsCircleId}
        initialTab={detailsInitialTab}
        initialActivityId={detailsActivityId ?? undefined}
        onBack={closeDetails}
        onLeftCircle={async () => {
          await props.onRefresh();
          setDetailsCircleId(null);
          setDetailsActivityId(null);
          setDetailsInitialTab("details");
        }}
      />
    );
  }

  const showEmptyDayPrompt = selectedDay != null && selectedDayActivities.length === 0 && hasActivities;

  return (
    <div className="stack dashboard-home activity-page">
      <header className="home-welcome">
        <h1 className="home-welcome-greeting">{t("activityPage.title")}</h1>
        <p className="home-welcome-context muted">{t("activityPage.subtitle")}</p>
      </header>

      <section className="home-primary-section stack" aria-label={t("activityPage.upcoming")}>
        <h2 className="home-section-title">{t("activityPage.upcoming")}</h2>
        <HomeNextActivityCard
          items={activities}
          onOpen={openActivity}
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
          <HomeWeekStrip items={activities} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
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
            items={activities}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          <HomeActivityEvents items={selectedDayActivities} selectedDay={selectedDay} onOpen={openActivity} />
        </section>
      ) : null}

      {myCircles.length > 0 ? (
        <section className="home-secondary-section stack" aria-label={t("activityPage.yourCircles")}>
          <h2 className="home-section-title">{t("activityPage.yourCircles")}</h2>
          <HomeCirclesList items={myCircles} onRefresh={props.onRefresh} onOpenCircle={openCircle} hideHeading />
        </section>
      ) : null}
    </div>
  );
}
