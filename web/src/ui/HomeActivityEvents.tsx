import React from "react";
import { useTranslation } from "react-i18next";
import type { HomeActivityItem } from "../api/types";
import { BidiText } from "./BidiText";
import { homeActivityKey, homeActivityPlace, needsReconfirmation } from "./homeActivities";
import { activityTypeClass, formatDayLabel, formatSessionDateTimeHero } from "./homeDashboardUtils";

/** Joined Activity dates on the selected day. Opening one shows its Activity Details. */
export function HomeActivityEvents(props: {
  items: HomeActivityItem[];
  selectedDay: Date | null;
  onOpen: (item: HomeActivityItem) => void;
}) {
  const { t } = useTranslation();
  if (!props.selectedDay || props.items.length === 0) return null;

  return (
    <div className="home-session-events stack">
      <h3 className="home-session-events-heading">{formatDayLabel(props.selectedDay)}</h3>
      {props.items.map((item) => {
        const changed = needsReconfirmation(item);
        const place = homeActivityPlace(item);
        return (
          <article
            key={homeActivityKey(item)}
            className={`home-session-event ${activityTypeClass(item.ritualType)}${
              changed ? " home-session-event--pending" : " home-session-event--confirmed"
            }`}
          >
            <button type="button" className="home-session-event-main-btn" onClick={() => props.onOpen(item)}>
              <div className="home-session-event-main">
                <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
                  {item.hobyIcon ?? ""}
                </span>
                <div className="home-session-event-copy">
                  <BidiText className="home-session-event-title">{item.title}</BidiText>
                  <div className="home-session-event-time">
                    {[formatSessionDateTimeHero(item.startAt), place].filter(Boolean).join(" · ")}
                  </div>
                  <div className="home-session-event-joining">
                    {t("activityParticipation.goingCount", {
                      count: item.participation.goingCount,
                      size: item.participation.groupSize,
                    })}
                  </div>
                </div>
              </div>
            </button>
            <div className="home-session-event-actions">
              <span className={`home-status-badge ${changed ? "home-status-badge--pending" : "home-status-badge--confirmed"}`}>
                {changed ? t("activitySuggestions.activityChanged") : t("activityParticipation.youreGoing")}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
