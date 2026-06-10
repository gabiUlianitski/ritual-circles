import React, { useMemo } from "react";
import type { HomeCalendarSession } from "../api/types";
import { isSessionPending } from "./homeDashboardUtils";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function HomeWeekStrip(props: {
  sessions: HomeCalendarSession[];
  selectedDay: Date | null;
  onSelectDay: (day: Date) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, HomeCalendarSession[]>();
    for (const item of props.sessions) {
      const d = new Date(item.session.dateTime);
      const key = ymdKey(d);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [props.sessions]);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      list.push(d);
    }
    return list;
  }, [today]);

  return (
    <div className="home-week-strip-wrap">
      <div className="home-week-strip" role="list" aria-label="Upcoming this week">
        {days.map((date) => {
          const key = ymdKey(date);
          const daySessions = sessionsByDay.get(key) ?? [];
          const hasSession = daySessions.length > 0;
          const hasPending = daySessions.some(isSessionPending);
          const isSelected = props.selectedDay != null && sameDay(date, props.selectedDay);
          const isToday = sameDay(date, today);

          return (
            <button
              key={key}
              type="button"
              role="listitem"
              className={[
                "home-week-day",
                hasSession ? "home-week-day--has" : "home-week-day--no-activity",
                hasPending ? "home-week-day--pending" : "",
                isSelected ? "home-week-day--selected" : "",
                isToday ? "home-week-day--today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}${
                hasSession ? `, ${daySessions.length} activity` : ""
              }`}
              aria-pressed={isSelected}
              onClick={() => props.onSelectDay(date)}
            >
              <span className="home-week-day-label">{DOW[date.getDay()]}</span>
              <span className="home-week-day-num">{date.getDate()}</span>
              <span className="home-week-day-dot-wrap" aria-hidden>
                {hasSession ? (
                  <span
                    className={`home-week-day-dot${hasPending ? " home-week-day-dot--pending" : " home-week-day-dot--confirmed"}`}
                  />
                ) : (
                  <span className="home-week-day-dot home-week-day-dot--empty" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
