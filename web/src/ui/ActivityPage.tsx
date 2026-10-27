import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { HomeActivityItem, HomeResponse } from "../api/types";
import { CircleDetails } from "./CircleDetails";
import { circleDisplayTitle } from "./circleDisplay";
import { HomeCirclesList } from "./HomeCirclesList";
import { UpcomingActivityCard } from "./UpcomingActivityCard";
import { homeItemFromCircleActivity, upcomingActivityCards, upcomingHomeActivities } from "./homeActivities";

/** Joined Activities first. Circles stay available underneath, without standing in for an Activity. */
export function ActivityPage(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: (prefillDateIso?: string) => void;
  onGoFindCircles: (prefillDateIso?: string) => void;
}) {
  const { t } = useTranslation();
  const myCircles = props.home.myCircles ?? [];
  const circleKey = myCircles.map((item) => item.circle.id).join(",");
  const [loaded, setLoaded] = useState<HomeActivityItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (myCircles.length === 0) {
      setLoaded([]);
      setFailed(false);
      return;
    }
    setFailed(false);
    void Promise.allSettled(
      myCircles.map(async (entry) => {
        const rows = await api.listActivities(entry.circle.id);
        const circle = {
          name: circleDisplayTitle(entry.circle),
          icon: entry.circle.hobyIcon,
          ritualType: entry.circle.ritualType,
        };
        return (Array.isArray(rows) ? rows : [])
          .map((activity) => homeItemFromCircleActivity(activity, circle))
          .filter((item): item is HomeActivityItem => item != null);
      }),
    ).then((results) => {
      if (cancelled) return;
      const found = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      const allFailed = results.length > 0 && results.every((result) => result.status === "rejected");
      setFailed(allFailed);
      setLoaded(allFailed ? [] : upcomingHomeActivities(found));
    });
    return () => {
      cancelled = true;
    };
  }, [circleKey, props.home, retry]);

  const cards = useMemo(() => upcomingActivityCards(loaded ?? []), [loaded]);
  const membersByCircle = useMemo(
    () => new Map(myCircles.map((item) => [item.circle.id, item.memberCount])),
    [myCircles],
  );
  const [detailsCircleId, setDetailsCircleId] = useState<string | null>(null);
  const [detailsActivityId, setDetailsActivityId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<"details" | "chat" | "scheduled">("details");

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

  return (
    <div className="stack dashboard-home activity-page">
      <header className="home-welcome">
        <h1 className="home-welcome-greeting">{t("activityPage.title")}</h1>
        <p className="home-welcome-context muted">{t("activityPage.subtitle")}</p>
      </header>

      <section className="home-primary-section stack" aria-label={t("activityPage.upcoming")}>
        <h2 className="home-section-title">{t("activityPage.upcoming")}</h2>
        {loaded == null ? (
          <p className="muted">{t("common.loading")}</p>
        ) : failed ? (
          <div className="circle-activities-note" role="alert">
            <p>{t("circleActivities.loadFailed")}</p>
            <button type="button" className="onboarding-secondary" onClick={() => setRetry((n) => n + 1)}>
              {t("circleActivities.tryAgain")}
            </button>
          </div>
        ) : cards.length > 0 ? (
          <div className="activity-decision-list stack">
            {cards.map(({ item }) => (
              <UpcomingActivityCard
                key={item.occurrenceId ? `${item.activityId}:${item.occurrenceId}` : item.activityId}
                item={item}
                memberCount={membersByCircle.get(item.circleId)}
                onOpen={() => openActivity(item)}
                onRefresh={props.onRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="stack onboarding-empty-guidance">
            <p className="onboarding-empty-title">{t("emptyStates.activitiesTitle")}</p>
            <p className="muted">{t("activityPage.emptyBody")}</p>
            <div className="onboarding-empty-actions row">
              <button type="button" className="primary" onClick={() => props.onGoFindCircles()}>
                {t("activityPage.findActivity")}
              </button>
              {myCircles.length > 0 ? (
                <button type="button" className="onboarding-secondary" onClick={() => props.onGoCreateJoin()}>
                  {t("activityPage.planActivity")}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {myCircles.length > 0 ? (
        <section className="home-secondary-section stack" aria-label={t("activityPage.yourCircles")}>
          <h2 className="home-section-title">{t("activityPage.yourCircles")}</h2>
          <HomeCirclesList items={myCircles} onRefresh={props.onRefresh} onOpenCircle={openCircle} hideHeading />
        </section>
      ) : null}
    </div>
  );
}
