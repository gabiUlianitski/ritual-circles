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
import { BidiText } from "./BidiText";
import { FormError } from "./FormError";
import { occurrenceWhen } from "./activityDisplay";

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

type Translate = (key: string, options?: Record<string, unknown>) => string;

function activityTitleLine(item: StoredNotification, t: Translate): string {
  switch (item.activityType) {
    case "activity_confirmed":
      return t("activityNotifications.confirmedTitle");
    case "activity_cancelled":
      return t("activityNotifications.cancelledTitle");
    case "activity_changed":
      return t("activityNotifications.changedTitle");
    case "reconfirmation_required":
      return t("activityNotifications.reconfirmTitle");
    case "upcoming_activity":
      return t("activityNotifications.upcomingTitle");
    case "suggestion_accepted":
      return t("activityNotifications.suggestionAcceptedTitle");
    case "suggestion_declined":
      return t("activityNotifications.suggestionDeclinedTitle");
    case "suggestion_created":
      return t("activityNotifications.suggestionCreatedTitle");
    default:
      return t("activityNotifications.title");
  }
}

function activityMessage(item: StoredNotification, t: Translate): string {
  switch (item.activityType) {
    case "activity_confirmed":
      return t("activityNotifications.confirmedBody");
    case "activity_cancelled":
      return item.recurring ? t("activityNotifications.dateCancelledBody") : t("activityNotifications.cancelledBody");
    case "activity_changed":
      if (item.suggestionType === "time") return t("activityNotifications.timeChangedBody");
      if (item.suggestionType === "location") return t("activityNotifications.placeChangedBody");
      return t("activityNotifications.changedBody");
    case "reconfirmation_required":
      return t("activityNotifications.reconfirmBody");
    case "upcoming_activity":
      return t("activityNotifications.upcomingBody");
    case "suggestion_accepted":
      return t("activityNotifications.suggestionAcceptedBody");
    case "suggestion_declined":
      return t("activityNotifications.suggestionDeclinedBody");
    case "suggestion_created": {
      const name = item.suggestedByName?.trim() || t("activityNotifications.someone");
      return item.suggestionType === "location"
        ? t("activityNotifications.suggestionCreatedPlaceBody", { name })
        : t("activityNotifications.suggestionCreatedTimeBody", { name });
    }
    default:
      return "";
  }
}

function itemTitle(item: StoredNotification, t: Translate): string {
  if (item.kind === "activity") return activityTitleLine(item, t);
  if (item.kind === "place_suggest") return `Place suggestion in ${item.circleName}`;
  if (item.kind === "chat") return `New message in ${item.circleName}`;
  if (item.kind === "circle_dropped") return `${item.circleName} was dropped`;
  if (item.kind === "circle_invite") return item.circleName;
  return `New member in ${item.circleName}`;
}

function itemBody(
  item: StoredNotification,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (item.kind === "place_suggest") {
    return `${item.authorName ?? "Someone"} suggested: ${item.suggestLabel ?? "a new meeting place"}`;
  }
  if (item.kind === "activity") return activityMessage(item, t);
  if (item.kind === "chat") return item.body ?? "";
  if (item.kind === "circle_dropped") {
    return item.body ?? "The organizer ended this circle. You are no longer in it.";
  }
  if (item.kind === "circle_invite") {
    return t("invitePreview.invitedBody", {
      name: item.authorName?.trim() || t("invitePreview.someone"),
    });
  }
  return `Your circle now has ${item.memberCount ?? "?"} members.`;
}

function decisionLabel(
  item: StoredNotification,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (item.kind === "circle_invite") {
    if (item.decision === "accepted") return t("invitePreview.joined");
    if (item.decision === "declined") return t("invitePreview.declinedStatus");
    return null;
  }
  if (item.kind !== "place_suggest") return null;
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
  onViewInvitation: (invitationId: string) => void;
  onOpenActivity: (circleId: string, activityId: string, occurrenceId: string | null) => void;
  declineNotice?: boolean;
  onInboxChanged?: () => void;
  onHomeRefresh?: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<StoredNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [showDeclined, setShowDeclined] = useState(false);

  useEffect(() => {
    if (props.declineNotice) setShowDeclined(true);
  }, [props.declineNotice]);

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

    if (item.kind === "activity") {
      if (item.activityId) props.onOpenActivity(item.circleId, item.activityId, item.occurrenceId ?? null);
      return;
    }

    if (item.kind === "circle_invite") {
      if (item.decision === "accepted") {
        props.onOpenCircleDetails(item.circleId);
        return;
      }
      if (item.decision === "declined") return;
      const invitationId =
        item.invitationId || (item.id.startsWith("invite:") ? item.id.slice("invite:".length) : "");
      if (invitationId) props.onViewInvitation(invitationId);
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

  async function respondToInvitation(item: StoredNotification, action: "accept" | "decline") {
    if (!props.myUserId || !item.invitationId) return;
    setBusyId(item.id);
    setError(null);
    try {
      if (action === "accept") {
        await api.acceptInvitation(item.invitationId);
        markSuggestionDecision(props.myUserId, item.id, "accepted");
        await props.onHomeRefresh?.();
        props.onOpenCircleDetails(item.circleId);
      } else {
        await api.declineInvitation(item.invitationId);
        markSuggestionDecision(props.myUserId, item.id, "declined");
        setShowDeclined(true);
      }
      notifyChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function respondToSuggestion(item: StoredNotification, action: "accept" | "decline") {
    if (!props.myUserId || !item.messageId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await api.respondToCircleSuggestion(item.circleId, item.messageId, { action });
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

  async function answerReconfirm(item: StoredNotification, action: "stay" | "leave") {
    if (!props.myUserId || !item.activityId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const occurrenceId = item.occurrenceId ?? null;
      if (action === "stay") {
        if (occurrenceId) await api.reconfirmOccurrence(item.activityId, occurrenceId);
        else await api.reconfirmActivity(item.activityId);
      } else if (occurrenceId) {
        await api.leaveOccurrence(item.activityId, occurrenceId);
      } else {
        await api.leaveActivity(item.activityId);
      }
      await syncNotificationInbox(props.myUserId, props.homeCircleId);
      markNotificationRead(props.myUserId, item.id);
      notifyChanged();
      await props.onHomeRefresh?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  const unreadCount = items.filter((n) => !n.read).length;
  const visibleItems = filter === "unread" ? items.filter((n) => !n.read) : items;

  function renderItem(item: StoredNotification) {
    const isSuggestion = item.kind === "place_suggest" || item.kind === "circle_invite";
    const statusLabel = decisionLabel(item, t);
    const menu = (
      <NotificationItemMenu
        item={item}
        disabled={busyId === item.id}
        onMarkRead={() => markRead(item)}
        onDelete={() => removeItem(item)}
      />
    );

    if (item.kind === "activity") {
      const when = item.startAt ? occurrenceWhen(item.startAt) : null;
      const askAgain = item.activityType === "reconfirmation_required" && !item.resolved;
      return (
        <li key={item.id}>
          <div
            className={`notif-item notif-item--activity${item.read ? " is-read" : " is-unread"}`}
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
              <span className="notif-item-title">{itemTitle(item, t)}</span>
              {menu}
            </div>
            <span className="notif-item-body">
              <BidiText>{item.activityTitle ?? ""}</BidiText>
              {" · "}
              <BidiText>{item.circleName}</BidiText>
            </span>
            {when ? (
              <span className="notif-item-body muted">
                {when.date}
                {when.time ? ` · ${when.time}` : ""}
              </span>
            ) : null}
            <span className="notif-item-body muted">{itemBody(item, t)}</span>
            {item.cancellationNote ? (
              <span className="notif-item-body muted">
                <BidiText>{item.cancellationNote}</BidiText>
              </span>
            ) : null}
            <span className="notif-item-when muted">{formatWhen(item.createdAt)}</span>
            <div className="notif-item-actions row" onClick={(e) => e.stopPropagation()}>
              {askAgain ? (
                <>
                  <button
                    type="button"
                    className="primary"
                    style={{ width: "auto" }}
                    disabled={busyId === item.id}
                    onClick={() => void answerReconfirm(item, "stay")}
                  >
                    {busyId === item.id ? "…" : t("activityNotifications.stillGoing")}
                  </button>
                  <button
                    type="button"
                    style={{ width: "auto" }}
                    disabled={busyId === item.id}
                    onClick={() => void answerReconfirm(item, "leave")}
                  >
                    {t("activityNotifications.leaveActivity")}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                style={{ width: "auto" }}
                disabled={busyId === item.id}
                onClick={() => openItem(item)}
              >
                {t("activityNotifications.openActivity")}
              </button>
            </div>
          </div>
        </li>
      );
    }

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
              <span className="notif-item-title">{itemTitle(item, t)}</span>
              {menu}
            </div>
            <span className="notif-item-body muted">{itemBody(item, t)}</span>
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
                  onClick={() =>
                    void (item.kind === "circle_invite"
                      ? respondToInvitation(item, "accept")
                      : respondToSuggestion(item, "accept"))
                  }
                >
                  {busyId === item.id ? "…" : item.kind === "circle_invite" ? t("invitePreview.acceptInvitation") : "Agree"}
                </button>
                <button
                  type="button"
                  style={{ width: "auto" }}
                  disabled={busyId === item.id}
                  onClick={() =>
                    void (item.kind === "circle_invite"
                      ? respondToInvitation(item, "decline")
                      : respondToSuggestion(item, "decline"))
                  }
                >
                  {item.kind === "circle_invite" ? t("invitePreview.declineInvitation") : "Decline"}
                </button>
                <button
                  type="button"
                  style={{ width: "auto" }}
                  disabled={busyId === item.id}
                  onClick={() => openItem(item)}
                >
                  {item.kind === "circle_invite" ? t("invitePreview.viewCircle") : "View chat"}
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
            <span className="notif-item-title">{itemTitle(item, t)}</span>
            {menu}
          </div>
          <span className="notif-item-body muted">{itemBody(item, t)}</span>
          <span className="notif-item-when muted">{formatWhen(item.createdAt)}</span>
        </div>
      </li>
    );
  }

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="h1" style={{ marginBottom: 0 }}>
          {t("activityNotifications.title")}
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
      {showDeclined ? (
        <p className="notif-item-decision" role="status">
          {t("invitePreview.declinedBanner")}
        </p>
      ) : null}
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
