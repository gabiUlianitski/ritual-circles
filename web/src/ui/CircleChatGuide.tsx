import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleMemberResponse, CircleResponse } from "../api/types";
import { circleHobyTitle } from "./circleDisplay";
import { memberDisplayName } from "./circleMembers";
import {
  activityStatusMark,
  circleMomentum,
  circleStatusKey,
  type CircleMomentum,
} from "./CircleProgressCard";

function memberInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function momentumCopy(
  status: CircleMomentum,
  spots: number,
  joined: number,
  pendingDateVote: boolean,
): { key: string; count?: number } {
  if (pendingDateVote || status === "readyToSchedule") return { key: "circleChat.momentumFinalizing" };
  if (status === "meetingConfirmed") return { key: "circleChat.momentumReady" };
  if (spots === 1) return { key: "circleChat.momentumOneMore" };
  if (spots > 1 && spots <= 2) return { key: "circleChat.momentumOnlyMore", count: spots };
  if (joined >= 2) return { key: "circleChat.momentumGaining" };
  return { key: "circleChat.momentumStarting" };
}

export function CircleChatGuide(props: {
  circle: CircleResponse;
  joined: number;
  isCreator: boolean;
  members: CircleMemberResponse[];
  myUserId: string | null;
  creatorUserId: string | null;
  hasNextSession: boolean;
  pendingDateVote: boolean;
  onSuggestDate: () => void;
  onSuggestPlace: () => void;
  onVote: () => void;
  onViewMeeting: () => void;
  onShare: () => void;
  onOpenMember: (id: string) => void;
}) {
  const { t } = useTranslation();
  const joined = Math.max(0, props.joined);
  const capacity = Math.max(1, props.circle.maxSize);
  const spots = Math.max(0, capacity - joined);
  const status = circleMomentum(joined, capacity, props.hasNextSession);
  const momentum = momentumCopy(status, spots, joined, props.pendingDateVote);
  const pct = Math.min(100, Math.round((joined / capacity) * 100));
  const solo = joined <= 1;
  const needed =
    spots <= 0
      ? t("circleDetails.circleFullProgress")
      : spots === 1
        ? t("circleChat.oneMoreNeeded")
        : t("circleChat.moreNeeded", { count: spots });

  let actionTitle = t("circleChat.nextNeedPeople");
  let actionLabel: string | null = null;
  let onAction: (() => void) | null = null;
  if (props.pendingDateVote && status !== "meetingConfirmed") {
    actionTitle = t("circleChat.nextVote");
    actionLabel = t("circleChat.voteNow");
    onAction = props.onVote;
  } else if (status === "meetingConfirmed") {
    actionTitle = t("circleChat.nextViewMeeting");
    actionLabel = t("circleChat.viewMeeting");
    onAction = props.onViewMeeting;
  } else if (status === "readyToSchedule") {
    actionTitle = t("circleChat.nextPickDate");
    actionLabel = t("circleChat.suggestDate");
    onAction = props.onSuggestDate;
  } else if (solo && props.isCreator) {
    actionTitle = t("circleChat.creatorLooking");
    actionLabel = t("circleChat.shareCircle");
    onAction = props.onShare;
  }

  return (
    <div className="circle-chat-guide stack">
      <header className="circle-chat-guide-head">
        <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
          {props.circle.hobyIcon?.trim() ?? ""}
        </span>
        <h2 className="circle-chat-guide-title">{circleHobyTitle(props.circle)}</h2>
        <span className={`circle-activity-status-badge circle-progress-status--${status}`}>
          <span aria-hidden>{activityStatusMark(status)}</span>
          {t(circleStatusKey(status))}
        </span>
      </header>

      <section className="circle-progress-card" aria-label={t("circleDetails.groupProgress")}>
        <p className="circle-progress-count">{t("discoverPage.joinedOfShort", { joined, capacity })}</p>
        <p className="circle-progress-needed">{needed}</p>
        <div
          className="circle-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={Math.min(joined, capacity)}
          aria-valuetext={t(circleStatusKey(status))}
        >
          <span className="circle-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className={`circle-progress-status circle-progress-status--${status}`}>
          {t(circleStatusKey(status))}
        </p>
        <p className="circle-momentum-message">{t(momentum.key, { count: momentum.count })}</p>
      </section>

      <section className="circle-chat-next" aria-label={t("circleChat.nextStep")}>
        <p className="circle-chat-next-kicker">{t("circleChat.nextStep")}</p>
        <p className="circle-chat-next-title">{actionTitle}</p>
        {solo && props.isCreator ? <p className="circle-chat-next-support">{t("circleChat.creatorShare")}</p> : null}
        {actionLabel && onAction ? (
          <button type="button" className="circle-details-primary" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </section>

      {props.members.length > 0 ? (
        <section className="circle-chat-people" aria-label={t("circleDetails.whosComing")}>
          <h3 className="circle-chat-people-title">{t("circleDetails.whosComing")}</h3>
          <div className="circle-chat-people-row">
            {props.members.map((member) => {
              const name = memberDisplayName(member, props.members);
              const isOwner = Boolean(props.creatorUserId && member.id === props.creatorUserId);
              return (
                <button
                  key={member.id}
                  type="button"
                  className="circle-chat-person"
                  onClick={() => props.onOpenMember(member.id)}
                >
                  <span className="circle-details-member-avatar" aria-hidden>
                    {memberInitial(name)}
                  </span>
                  <span className="circle-chat-person-name">{name}</span>
                  <span className={isOwner ? "pill pill--owner" : "pill pill--member"}>
                    {isOwner ? t("circleChat.organizer") : t("circleDetails.member")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {status === "readyToSchedule" && !props.pendingDateVote ? (
        <section className="circle-chat-plan" aria-label={t("circleChat.planTitle")}>
          <h3 className="circle-chat-plan-title">{t("circleChat.planTitle")}</h3>
          <div className="circle-chat-plan-item">
            <p className="circle-chat-plan-label">{t("circleChat.planDate")}</p>
            <p className="circle-chat-plan-hint">{t("circleChat.planDateHint")}</p>
            <button type="button" className="circle-chat-plan-btn" onClick={props.onSuggestDate}>
              {t("circleChat.suggestDate")}
            </button>
          </div>
          <div className="circle-chat-plan-item">
            <p className="circle-chat-plan-label">{t("circleChat.planPlace")}</p>
            <p className="circle-chat-plan-hint">{t("circleChat.planPlaceHint")}</p>
            <button type="button" className="circle-chat-plan-btn" onClick={props.onSuggestPlace}>
              {t("circleChat.suggestPlace")}
            </button>
          </div>
          {props.hasNextSession ? (
            <div className="circle-chat-plan-item">
              <p className="circle-chat-plan-label">{t("circleChat.planFinalize")}</p>
              <p className="circle-chat-plan-hint">{t("circleChat.planFinalizeHint")}</p>
              <button type="button" className="circle-chat-plan-btn" onClick={props.onViewMeeting}>
                {t("circleChat.viewMeeting")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
