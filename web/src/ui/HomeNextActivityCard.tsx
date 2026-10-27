import React from "react";
import { useTranslation } from "react-i18next";
import type { HomeActivityItem } from "../api/types";
import { activityPriceLabel, activityReadinessLabel } from "./activityDisplay";
import { BidiText } from "./BidiText";
import { HomeActivityReconfirm } from "./HomeActivityReconfirm";
import { homeActivityPlace, needsReconfirmation } from "./homeActivities";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";

/** The earliest joined Activity date that has not ended. */
export function HomeNextActivityCard(props: {
  items: HomeActivityItem[];
  onOpen: (item: HomeActivityItem) => void;
  onRefresh: () => Promise<void> | void;
  onFindCircles?: () => void;
  onCreateCircle?: () => void;
}) {
  const { t } = useTranslation();
  const next = props.items[0];

  if (!next) {
    return (
      <section className="home-hero home-hero--empty card stack onboarding-empty-guidance" aria-label={t("homeFeed.yourNextActivity")}>
        <p className="onboarding-empty-title">{t("emptyStates.activitiesTitle")}</p>
        <p className="home-hero-empty-text muted">{t("emptyStates.activitiesSubtitle")}</p>
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

  const changed = needsReconfirmation(next);
  const place = homeActivityPlace(next);
  const price = activityPriceLabel(next);
  const meta = [
    t("activityParticipation.goingCount", { count: next.participation.goingCount, size: next.participation.groupSize }),
    activityReadinessLabel(next.participation, t),
    place ? `📍 ${place}` : null,
    price,
  ].filter(Boolean);

  return (
    <section className="home-hero card" aria-label={t("homeFeed.yourNextActivity")}>
      <div className="home-hero-row">
        <button type="button" className="home-hero-body" onClick={() => props.onOpen(next)}>
          <span className="home-hobby-badge" aria-hidden>
            {next.hobyIcon ?? ""}
          </span>
          <span className="home-hero-copy">
            <BidiText as="span" className="home-hero-title">
              {next.title}
            </BidiText>
            <span className="home-hero-time">{formatSessionDateTimeHero(next.startAt)}</span>
            <span className="home-hero-meta">{meta.join(" · ")}</span>
            {next.isRecurring ? <span className="home-hero-meta">{t("activityDetails.recurringLabel")}</span> : null}
          </span>
          <span className={`home-status-badge ${changed ? "home-status-badge--pending" : "home-status-badge--confirmed"}`}>
            {changed ? t("activitySuggestions.activityChanged") : t("activityParticipation.youreGoing")}
          </span>
        </button>
      </div>
      {changed ? <HomeActivityReconfirm key={next.occurrenceId ?? next.activityId} item={next} onDone={props.onRefresh} /> : null}
    </section>
  );
}
