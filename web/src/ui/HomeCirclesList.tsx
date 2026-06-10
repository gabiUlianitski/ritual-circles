import React, { useState } from "react";
import type { AttendanceStatus, HomeCircleItem } from "../api/types";
import { api } from "../api/client";
import { markCircleLeftBySelf } from "../notificationInbox";
import { circleHobyTitle } from "./circleDisplay";
import { FormError } from "./FormError";

export function HomeCirclesList(props: {
  items: HomeCircleItem[];
  onRefresh: () => Promise<void> | void;
  onOpenCircle: (circleId: string, tab: "details" | "chat" | "scheduled") => void;
  hideHeading?: boolean;
  listLabel?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Show leave/drop on expanded row (created = drop, joined = leave). */
  showLeaveAction?: boolean;
  leaveActionLabel?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.items.length === 0) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="circle-scheduled-empty muted">{props.emptyMessage ?? "No circles here yet."}</div>
        {props.emptyActionLabel && props.onEmptyAction ? (
          <button type="button" className="primary" style={{ width: "auto", alignSelf: "flex-start" }} onClick={props.onEmptyAction}>
            {props.emptyActionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  async function setAttendance(item: HomeCircleItem, status: AttendanceStatus) {
    if (!item.nextSession) return;
    setWorkingId(item.circle.id);
    setError(null);
    try {
      await api.putAttendance(item.nextSession.id, status);
      await props.onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorkingId(null);
    }
  }

  async function leaveOrDropCircle(item: HomeCircleItem) {
    setWorkingId(item.circle.id);
    setError(null);
    try {
      if (item.isCreator) {
        await api.dropCircle(item.circle.id);
      } else {
        await api.leaveCircle(item.circle.id);
      }
      const me = await api.getMe().catch(() => null);
      if (me?.id) markCircleLeftBySelf(me.id, item.circle.id);
      setExpandedId(null);
      await props.onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorkingId(null);
    }
  }

  const ariaLabel = props.listLabel ?? "Your circles";

  return (
    <section className="home-circles-list stack" aria-label={ariaLabel}>
      {props.hideHeading ? null : <div style={{ fontWeight: 650 }}>{ariaLabel}</div>}
      <div className="stack" style={{ gap: 8 }}>
        {props.items.map((item) => {
          const open = expandedId === item.circle.id;
          const title = circleHobyTitle(item.circle);
          const busy = workingId === item.circle.id;
          return (
            <div key={item.circle.id} className={`home-circle-compact${open ? " home-circle-compact--open" : ""}`}>
              <button
                type="button"
                className="home-circle-compact-head"
                aria-expanded={open}
                onClick={() => setExpandedId((id) => (id === item.circle.id ? null : item.circle.id))}
              >
                <span className="home-circle-compact-icon" aria-hidden>
                  {item.circle.hobyIcon ?? "○"}
                </span>
                <span className="home-circle-compact-title grow">{title}</span>
                {item.pendingConfirmation ? (
                  <span className="home-pending-dot" title="Confirm attendance" aria-label="Needs confirmation" />
                ) : null}
                <span className="home-circle-chevron muted" aria-hidden>
                  {open ? "▴" : "▾"}
                </span>
              </button>

              {open ? (
                <div className="home-circle-compact-body stack">
                  {item.nextSession ? (
                    <>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Next: {new Date(item.nextSession.dateTime).toLocaleString()} •{" "}
                        {item.nextSession.locationOrLink}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {item.myAttendance?.status === "attending"
                          ? "You’re coming."
                          : "Confirm if you’re coming."}
                      </div>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void setAttendance(item, "attending")}
                      >
                        I’m coming
                      </button>
                      <button disabled={busy} onClick={() => void setAttendance(item, "not_attending")}>
                        Not coming
                      </button>
                    </>
                  ) : (
                    <div className="muted">No upcoming session.</div>
                  )}
                  <button disabled={busy} onClick={() => props.onOpenCircle(item.circle.id, "details")}>
                    Circle details
                  </button>
                  {item.isCreator ? (
                    <button disabled={busy} onClick={() => props.onOpenCircle(item.circle.id, "scheduled")}>
                      Modify circle
                    </button>
                  ) : null}
                  {props.showLeaveAction ? (
                    <button className="danger" disabled={busy} onClick={() => void leaveOrDropCircle(item)}>
                      {item.isCreator ? "Delete circle" : (props.leaveActionLabel ?? "Leave circle")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </section>
  );
}
