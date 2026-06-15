import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import {
  acknowledgeMemberCount,
  deleteNotification,
  listNotificationInbox,
  markNotificationRead,
  markSuggestionDecision,
  syncNotificationInbox,
  type StoredNotification,
} from "../notificationInbox";
import { FormError } from "./FormError";
import { suggestionAcceptPayloadFromBody } from "./suggestionAccept";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function itemTitle(item: StoredNotification): string {
  if (item.kind === "time_suggest") return `Time suggestion in ${item.circleName}`;
  if (item.kind === "place_suggest") return `Place suggestion in ${item.circleName}`;
  if (item.kind === "chat") return `New message in ${item.circleName}`;
  if (item.kind === "circle_dropped") return `${item.circleName} was dropped`;
  return `New member in ${item.circleName}`;
}

function itemBody(item: StoredNotification): string {
  if (item.kind === "time_suggest") {
    return `${item.authorName ?? "Someone"} suggested: ${item.suggestLabel ?? "a new meeting time"}`;
  }
  if (item.kind === "place_suggest") {
    return `${item.authorName ?? "Someone"} suggested: ${item.suggestLabel ?? "a new meeting place"}`;
  }
  if (item.kind === "chat") return item.body ?? "";
  if (item.kind === "circle_dropped") {
    return item.body ?? "The organizer ended this circle. You are no longer in it.";
  }
  return `Your circle now has ${item.memberCount ?? "?"} members.`;
}

function decisionLabel(item: StoredNotification): string | null {
  if (item.kind !== "time_suggest" && item.kind !== "place_suggest") return null;
  if (item.decision === "accepted") return "You accepted this suggestion";
  if (item.decision === "declined") return "You declined this suggestion";
  return null;
}

function NotificationItemMenu(props: {
  item: StoredNotification;
  disabled?: boolean;
  onMarkRead: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="notif-item-menu-wrap" ref={wrapRef}>
      {!props.item.read ? <span className="notif-unread-dot" aria-label="Unread" title="Unread" /> : null}
      <button
        type="button"
        className="notif-item-menu-btn"
        aria-label="Notification options"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={props.disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋯
      </button>
      {open ? (
        <div className="notif-item-menu-panel" role="menu" aria-label="Notification options">
          {!props.item.read ? (
            <button
              type="button"
              role="menuitem"
              className="notif-item-menu-option"
              onClick={(e) => {
                e.stopPropagation();
                props.onMarkRead();
                setOpen(false);
              }}
            >
              <span className="notif-item-menu-icon" aria-hidden>
                ✓
              </span>
              Mark as read
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="notif-item-menu-option notif-item-menu-option--danger"
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete();
              setOpen(false);
            }}
          >
            <span className="notif-item-menu-icon" aria-hidden>
              ✕
            </span>
            Delete this notification
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Notifications(props: {
  myUserId: string | null;
  homeCircleId?: string | null;
  onBack: () => void;
  onOpenCircleChat: (circleId: string) => void;
  onOpenCircleDetails: (circleId: string) => void;
  onInboxChanged?: () => void;
  onHomeRefresh?: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<StoredNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const refreshList = useCallback(() => {
    if (!props.myUserId) {
      setItems([]);
      return;
    }
    setItems(listNotificationInbox(props.myUserId));
  }, [props.myUserId]);

  const load = useCallback(async () => {
    if (!props.myUserId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await syncNotificationInbox(props.myUserId, props.homeCircleId);
      refreshList();
    } catch (e) {
      setError(String(e));
      refreshList();
    } finally {
      setLoading(false);
    }
  }, [props.myUserId, props.homeCircleId, refreshList]);

  useEffect(() => {
    void load();
  }, [load]);

  function notifyChanged() {
    refreshList();
    props.onInboxChanged?.();
  }

  function openItem(item: StoredNotification) {
    if (!props.myUserId) return;
    markNotificationRead(props.myUserId, item.id);
    notifyChanged();

    if (item.kind === "circle_dropped") {
      props.onBack();
      return;
    }

    if (item.kind === "member_joined") {
      if (item.memberCount != null) {
        acknowledgeMemberCount(props.myUserId, item.circleId, item.memberCount);
      }
      props.onOpenCircleDetails(item.circleId);
      return;
    }
    props.onOpenCircleChat(item.circleId);
  }

  function markRead(item: StoredNotification) {
    if (!props.myUserId) return;
    markNotificationRead(props.myUserId, item.id);
    notifyChanged();
  }

  function removeItem(item: StoredNotification) {
    if (!props.myUserId) return;
    deleteNotification(props.myUserId, item.id);
    notifyChanged();
  }

  async function respondToSuggestion(item: StoredNotification, action: "accept" | "decline") {
    if (!props.myUserId || !item.messageId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const schedule =
        action === "accept" && item.messageBody
          ? suggestionAcceptPayloadFromBody(item.messageBody)
          : null;
      if (action === "accept" && item.kind === "time_suggest" && item.messageBody && !schedule) {
        throw new Error("Could not read the suggested time.");
      }
      await api.respondToCircleSuggestion(item.circleId, item.messageId, {
        action,
        ...(schedule
          ? { firstSessionAt: schedule.firstSessionAt, recurringTime: schedule.recurringTime }
          : {}),
      });
      markSuggestionDecision(props.myUserId, item.id, action === "accept" ? "accepted" : "declined");
      notifyChanged();
      if (action === "accept") {
        await props.onHomeRefresh?.();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  const unreadCount = items.filter((n) => !n.read).length;
  const visibleItems = filter === "unread" ? items.filter((n) => !n.read) : items;

  function renderItem(item: StoredNotification) {
    const isSuggestion = item.kind === "time_suggest" || item.kind === "place_suggest";
    const statusLabel = decisionLabel(item);
    const menu = (
      <NotificationItemMenu
        item={item}
        disabled={busyId === item.id}
        onMarkRead={() => markRead(item)}
        onDelete={() => removeItem(item)}
      />
    );

    if (isSuggestion) {
      return (
        <li key={item.id}>
          <div
            className={`notif-item notif-item--suggestion${item.read ? " is-read" : " is-unread"}`}
            onClick={() => openItem(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openItem(item);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="notif-item-row">
              <span className="notif-item-title">{itemTitle(item)}</span>
              {menu}
            </div>
            <span className="notif-item-body muted">{itemBody(item)}</span>
            <span className="notif-item-when muted">{formatWhen(item.createdAt)}</span>
            {statusLabel ? (
              <span className="notif-item-decision muted">{statusLabel}</span>
            ) : (
              <div className="notif-item-actions row" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="primary"
                  style={{ width: "auto" }}
                  disabled={busyId === item.id}
                  onClick={() => void respondToSuggestion(item, "accept")}
                >
                  {busyId === item.id ? "…" : "Agree"}
                </button>
                <button
                  type="button"
                  style={{ width: "auto" }}
                  disabled={busyId === item.id}
                  onClick={() => void respondToSuggestion(item, "decline")}
                >
                  Decline
                </button>
                <button
                  type="button"
                  style={{ width: "auto" }}
                  disabled={busyId === item.id}
                  onClick={() => openItem(item)}
                >
                  View chat
                </button>
              </div>
            )}
          </div>
        </li>
      );
    }

    return (
      <li key={item.id}>
        <div
          className={`notif-item${item.read ? " is-read" : " is-unread"}`}
          onClick={() => openItem(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openItem(item);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="notif-item-row">
            <span className="notif-item-title">{itemTitle(item)}</span>
            {menu}
          </div>
          <span className="notif-item-body muted">{itemBody(item)}</span>
          <span className="notif-item-when muted">{formatWhen(item.createdAt)}</span>
        </div>
      </li>
    );
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="h1" style={{ marginBottom: 0 }}>
          Notifications
        </div>
        <button type="button" style={{ width: "auto" }} onClick={props.onBack}>
          Back
        </button>
      </div>

      <div className="notif-filter-tabs hoby-browse-toggle" role="tablist" aria-label="Notification filter">
        <button
          type="button"
          role="tab"
          className={filter === "all" ? "is-active" : ""}
          aria-selected={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          className={filter === "unread" ? "is-active" : ""}
          aria-selected={filter === "unread"}
          onClick={() => setFilter("unread")}
        >
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </button>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: "0.92em" }}>
        {unreadCount > 0
          ? `${unreadCount} unread · tap a notification to open it`
          : "All caught up · past alerts stay listed as read"}
      </p>

      {loading ? <div className="muted">Loading…</div> : null}
      {error ? <FormError>{error}</FormError> : null}

      {!loading && !error && visibleItems.length === 0 ? (
        <div className="notif-empty onboarding-empty-guidance stack">
          <p className="onboarding-empty-title">{t("emptyStates.notificationsTitle")}</p>
          <p className="muted">{t("emptyStates.notificationsSubtitle")}</p>
        </div>
      ) : null}

      {!loading && visibleItems.length > 0 ? (
        <ul className="notif-list">{visibleItems.map(renderItem)}</ul>
      ) : null}
    </div>
  );
}
