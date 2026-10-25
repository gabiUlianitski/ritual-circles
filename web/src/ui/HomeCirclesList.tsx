import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { HomeCircleItem } from "../api/types";
import { api } from "../api/client";
import { markCircleLeftBySelf } from "../notificationInbox";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
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
          const memberLine =
            item.memberCount === 1 ? t("home.oneMember") : t("home.membersCount", { count: item.memberCount });
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
                  <span className="home-circle-compact-meta">
                    {[hobbyLine, memberLine].filter(Boolean).join(" • ")}
                  </span>
                </span>
                <span className="home-circle-chevron muted" aria-hidden>
                  {open ? "▴" : "▾"}
                </span>
              </button>

              {open ? (
                <div className="home-circle-compact-body stack">
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
