import React from "react";
import { useTranslation } from "react-i18next";
import { formatDayLabel } from "./homeDashboardUtils";

export function HomeEmptyDayPrompt(props: {
  selectedDay: Date;
  onFindCircles: () => void;
  onCreateCircle: () => void;
}) {
  const { t } = useTranslation();
  const dayLabel = formatDayLabel(props.selectedDay);

  return (
    <div className="home-empty-day-prompt" role="region" aria-label={t("home.emptyDayTitle")}>
      <p className="home-empty-day-title">{t("home.emptyDayTitle")}</p>
      <p className="home-empty-day-sub muted">{dayLabel}</p>
      <div className="home-empty-day-actions">
        <button type="button" className="home-empty-day-action" onClick={props.onFindCircles}>
          <span aria-hidden>🔍</span> {t("home.findCircles")}
        </button>
        <button type="button" className="home-empty-day-action" onClick={props.onCreateCircle}>
          <span aria-hidden>➕</span> {t("home.createCircle")}
        </button>
      </div>
    </div>
  );
}
