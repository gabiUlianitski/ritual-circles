import React from "react";
import type { HomeCalendarSession } from "../api/types";
import { welcomeContextLine } from "./homeDashboardUtils";

export function HomeWelcomeHeader(props: { sessions: HomeCalendarSession[]; firstName?: string | null }) {
  const greeting = props.firstName?.trim() ? `Hi ${props.firstName.trim()} 👋` : "Hi 👋";
  const context = welcomeContextLine(props.sessions);

  return (
    <header className="home-welcome stack" style={{ gap: 4 }}>
      <h1 className="home-welcome-greeting">{greeting}</h1>
      <p className="home-welcome-context muted">{context}</p>
    </header>
  );
}
