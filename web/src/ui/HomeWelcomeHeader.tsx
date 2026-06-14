import React from "react";
import { useTranslation } from "react-i18next";
import type { HomeCalendarSession } from "../api/types";
import {
  countActivitiesThisWeek,
  daysUntilNextSession,
} from "./homeDashboardUtils";

function welcomeContextLine(sessions: HomeCalendarSession[], t: (key: string, opts?: object) => string): string {
  const weekCount = countActivitiesThisWeek(sessions);
  if (weekCount > 0) {
    return weekCount === 1
      ? t("home.weekOneHangout")
      : t("home.weekManyHangouts", { count: weekCount });
  }
  const days = daysUntilNextSession(sessions);
  if (days === null) return t("home.noHangouts");
  if (days === 0) return t("home.hangoutToday");
  if (days === 1) return t("home.hangoutTomorrow");
  return t("home.hangoutInDays", { count: days });
}

export function HomeWelcomeHeader(props: { sessions: HomeCalendarSession[]; firstName?: string | null }) {
  const { t } = useTranslation();
  const greeting = props.firstName?.trim()
    ? t("home.greetingName", { name: props.firstName.trim() })
    : t("home.greeting");
  const context = welcomeContextLine(props.sessions, t);

  return (
    <header className="home-welcome stack" style={{ gap: 4 }}>
      <h1 className="home-welcome-greeting">{greeting}</h1>
      <p className="home-welcome-context muted">{context}</p>
    </header>
  );
}
