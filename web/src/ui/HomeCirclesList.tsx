import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus, HomeCalendarSession, HomeCircleItem } from "../api/types";
import { api } from "../api/client";
import { markCircleLeftBySelf } from "../notificationInbox";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";
import { FormError } from "./FormError";

export function HomeCirclesList(props: {
  items: HomeCircleItem[];
  onRefresh: () => Promise<void> | void;
  onOpenCircle: (circleId: string, tab: "details" | "chat" | "scheduled") => void;
  hideHeading?: boolean;
  listLabel?: string;
  emptyMessage?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  emptySecondaryActionLabel?: string;
  onEmptySecondaryAction?: () => void;
  /** Show leave/drop on expanded row (created = drop, joined = leave). */
  showLeaveAction?: boolean;
  leaveActionLabel?: string;
  /** Calendar rows, used only to show member counts already loaded for Home. */
  sessions?: HomeCalendarSession[];
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.items.length === 0) {
    const title = props.emptyTitle ?? props.emptyMessage?.split("\n")[0] ?? "";
    const subtitle = props.emptySubtitle ?? props.emptyMessage?.split("\n")[1] ?? "";
    return (
      <div className="stack onboarding-empty-guidance" style={{ gap: 12 }}>
        {title ? <p className="onboarding-empty-title">{title}</p> : null}
        {subtitle ? <p className="muted">{subtitle}</p> : null}
        <div className="onboarding-empty-actions row">
          {props.emptyActionLabel && props.onEmptyAction ? (
            <button type="button" className="primary" style={{ width: "auto" }} onClick={props.onEmptyAction}>
              {props.emptyActionLabel}
            </button>
          ) : null}
          {props.emptySecondaryActionLabel && props.onEmptySecondaryAction ? (
            <button type="button" className="onboarding-secondary" style={{ width: "auto" }} onClick={props.onEmptySecondaryAction}>
              {props.emptySecondaryActionLabel}
            </button>
          ) : null}
        </div>
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
      <div className="home-circles-cards stack">
        {props.items.map((item) => {
          const open = expandedId === item.circle.id;
          const title = circleDisplayTitle(item.circle);
          const hobbyLine = circleHobbySubtitle(item.circle);
          const busy = workingId === item.circle.id;
          const related = (props.sessions ?? []).filter((s) => s.circleId === item.circle.id);
          const matched =
            (item.nextSession && related.find((s) => s.session.id === item.nextSession?.id)) || related[0];
          const memberCount = matched?.memberCount;
          const memberLine =
            memberCount == null
              ? null
              : memberCount === 1
                ? t("home.oneMember")
                : t("home.membersCount", { count: memberCount });
          const when = item.nextSession ? formatSessionDateTimeHero(item.nextSession.dateTime) : null;
          return (
            <div key={item.circle.id} className={`home-circle-compact${open ? " home-circle-compact--open" : ""}`}>
              <button
                type="button"
                className="home-circle-compact-head"
                aria-expanded={open}
                onClick={() => setExpandedId((id) => (id === item.circle.id ? null : item.circle.id))}
              >
                <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
                  {item.circle.hobyIcon ?? ""}
                </span>
                <span className="home-circle-compact-copy grow">
                  <span className="home-circle-compact-title circle-title-wrap">
                    <BidiText>{title}</BidiText>
                  </span>
                  {hobbyLine || memberLine || when ? (
                    <span className="home-circle-compact-meta">
                      {[hobbyLine, memberLine, when].filter(Boolean).join(" • ")}
                    </span>
                  ) : null}
                </span>
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
