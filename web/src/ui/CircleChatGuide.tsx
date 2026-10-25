import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleMemberResponse, CircleResponse } from "../api/types";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import { memberDisplayName } from "./circleMembers";
function memberInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function CircleChatGuide(props: {
  circle: CircleResponse;
  joined: number;
  isCreator: boolean;
  members: CircleMemberResponse[];
  myUserId: string | null;
  creatorUserId: string | null;
  onSuggestPlace: () => void;
  onInvite: () => void;
  onOpenMember: (id: string) => void;
}) {
  const { t } = useTranslation();
  const joined = Math.max(0, props.joined);
  const solo = joined <= 1;

  let actionTitle = t("circleChat.nextNeedPeople");
  let actionLabel: string | null = null;
  let onAction: (() => void) | null = null;
  if (solo && props.isCreator) {
    actionTitle = t("circleChat.creatorLooking");
    actionLabel = t("circleDetails.inviteTitle");
    onAction = props.onInvite;
  }

  return (
    <div className="circle-chat-guide stack">
      <header className="circle-chat-guide-head">
        <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
          {props.circle.hobyIcon?.trim() ?? ""}
        </span>
        <div className="circle-chat-guide-title-wrap">
          <BidiText as="h2" className="circle-chat-guide-title circle-title-wrap">
            {circleDisplayTitle(props.circle)}
          </BidiText>
          {circleHobbySubtitle(props.circle) ? (
            <p className="muted circle-identity-hobby">{circleHobbySubtitle(props.circle)}</p>
          ) : null}
        </div>
        <span className="circle-activity-status-badge circle-details-status--forming">
          {t("circleDetails.memberCount", { count: joined })}
        </span>
      </header>

      <section className="circle-progress-card">
        <p className="circle-progress-count">{t("circleDetails.memberCount", { count: joined })}</p>
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

      <section className="circle-chat-plan" aria-label={t("circleChat.planTitle")}>
        <h3 className="circle-chat-plan-title">{t("circleChat.planTitle")}</h3>
        <div className="circle-chat-plan-item">
          <p className="circle-chat-plan-label">{t("circleChat.planPlace")}</p>
          <p className="circle-chat-plan-hint">{t("circleChat.planPlaceHint")}</p>
          <button type="button" className="circle-chat-plan-btn" onClick={props.onSuggestPlace}>
            {t("circleChat.suggestPlace")}
          </button>
        </div>
      </section>
    </div>
  );
}
