import React, { useMemo, useState } from "react";
import type { HomeCalendarSession } from "../api/types";
import { isSessionPending, sessionTitle } from "./homeDashboardUtils";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function HomeCalendar(props: {
  sessions: HomeCalendarSession[];
  expanded: boolean;
  selectedDay: Date | null;
  onSelectDay: (day: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));

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

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = viewMonth.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <section
      className={`home-calendar-full${props.expanded ? " home-calendar-full--open" : ""}`}
      aria-label="Full calendar"
      aria-hidden={!props.expanded}
    >
      <div className="home-calendar-full-inner">
        <div className="home-calendar-body">
          <div className="row home-calendar-month-row">
            <div className="home-calendar-month-label">{monthLabel}</div>
            <div className="row home-calendar-month-nav">
              <button
                type="button"
                className="icon-btn icon-btn--ghost icon-btn--square home-calendar-nav-btn"
                aria-label="Previous month"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
              >
                ‹
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--ghost icon-btn--square home-calendar-nav-btn"
                aria-label="Next month"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
              >
                ›
              </button>
            </div>
          </div>

          <div className="home-calendar-grid-wrap">
            <div className="home-calendar-grid home-calendar-grid--full" role="grid" aria-label={monthLabel}>
              {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
                <div key={`hdr-${i}`} className="home-calendar-dow muted" role="columnheader">
                  {label}
                </div>
              ))}
              {cells.map((day, idx) => {
                if (day == null) {
                  return <div key={`empty-${idx}`} className="home-calendar-day home-calendar-day--empty" />;
                }
                const date = new Date(year, month, day);
                const key = ymdKey(date);
                const daySessions = sessionsByDay.get(key) ?? [];
                const hasSession = daySessions.length > 0;
                const hasPending = daySessions.some(isSessionPending);
                const isToday = sameDay(date, today);
                const isSelected = props.selectedDay != null && sameDay(date, props.selectedDay);

                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      "home-calendar-day",
                      "home-calendar-day--minimal",
                      hasSession ? "home-calendar-day--has" : "home-calendar-day--quiet",
                      hasPending ? "home-calendar-day--pending" : "",
                      isToday ? "home-calendar-day--today" : "",
                      isSelected ? "home-calendar-day--selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => props.onSelectDay(date)}
                    aria-label={`${date.toLocaleDateString()}${
                      hasSession
                        ? `, ${daySessions.map((s) => sessionTitle(s)).join(", ")}`
                        : ""
                    }`}
                  >
                    <span className="home-calendar-day-num">{day}</span>
                    {hasSession ? (
                      <span
                        className={`home-calendar-day-min-dot${hasPending ? " home-calendar-day-min-dot--pending" : ""}`}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
