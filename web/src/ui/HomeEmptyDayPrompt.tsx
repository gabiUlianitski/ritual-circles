import React from "react";
import { formatDayLabel } from "./homeDashboardUtils";

export function HomeEmptyDayPrompt(props: {
  selectedDay: Date;
  onFindCircles: () => void;
  onCreateCircle: () => void;
}) {
  const dayLabel = formatDayLabel(props.selectedDay);

  return (
    <div className="home-empty-day-prompt" role="region" aria-label={`Nothing planned for ${dayLabel}`}>
      <p className="home-empty-day-title">Nothing planned for this day</p>
      <p className="home-empty-day-sub muted">{dayLabel}</p>
      <div className="home-empty-day-actions">
        <button type="button" className="home-empty-day-action" onClick={props.onFindCircles}>
          <span aria-hidden>🔍</span> Find circles for this day
        </button>
        <button type="button" className="home-empty-day-action" onClick={props.onCreateCircle}>
          <span aria-hidden>➕</span> Create a circle on this day
        </button>
      </div>
    </div>
  );
}
