import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity } from "../api/types";
import { splitActivities } from "./activityDisplay";
import { ActivityCard } from "./ActivityCard";

export function CircleActivities(props: {
  circleId: string;
  canPlan: boolean;
  refreshKey: number;
  onPlan: () => void;
  onOpen: (activityId: string) => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [pastOpen, setPastOpen] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void api
      .listActivities(props.circleId)
      .then((rows) => {
        if (!cancelled) setItems(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.circleId, props.refreshKey, retry]);

  const { upcoming, past } = splitActivities(items);

  return (
    <section className="circle-activities" aria-labelledby="circle-activities-title">
      <div className="circle-activities-head">
        <h2 id="circle-activities-title">{t("circleActivities.upcoming")}</h2>
        {props.canPlan && items.length > 0 ? (
          <button type="button" className="circle-details-secondary" onClick={props.onPlan}>
            {t("activityForm.open")}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="circle-details-skeleton" aria-label={t("common.loading")}>
          <div className="circle-details-skeleton-row" />
          <div className="circle-details-skeleton-row circle-details-skeleton-row--short" />
        </div>
      ) : failed ? (
        <div className="circle-activities-note" role="alert">
          <p>{t("circleActivities.loadFailed")}</p>
          <button type="button" className="circle-details-secondary" onClick={() => setRetry((n) => n + 1)}>
            {t("circleActivities.tryAgain")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="circle-activities-empty">
          <p className="circle-activities-empty-title">{t("circleActivities.emptyTitle")}</p>
          <p className="muted">{props.canPlan ? t("circleActivities.emptyPlan") : t("circleActivities.emptyWait")}</p>
          {props.canPlan ? (
            <button type="button" className="circle-details-primary" onClick={props.onPlan}>
              {t("activityPage.planActivity")}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {upcoming.length === 0 ? <p className="muted circle-activities-note">{t("circleActivities.emptyTitle")}</p> : null}
          <div className="circle-activities-list">
            {upcoming.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onOpen={() => props.onOpen(activity.id)}
                onChanged={() => setRetry((n) => n + 1)}
              />
            ))}
          </div>
          {past.length > 0 ? (
            <div className="circle-activities-past">
              <button
                type="button"
                className="circle-activities-past-toggle"
                aria-expanded={pastOpen}
                onClick={() => setPastOpen((open) => !open)}
              >
                {t("circleActivities.pastCount", { count: past.length })}
              </button>
              {pastOpen ? (
                <div className="circle-activities-list">
                  {past.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      onOpen={() => props.onOpen(activity.id)}
                      onChanged={() => setRetry((n) => n + 1)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
