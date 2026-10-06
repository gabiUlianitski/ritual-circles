import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleMemberResponse, CircleResponse, Hoby } from "../api/types";
import { humanMemberLevelPhrase } from "./circleDetailsFormat";
import { dedupeMembers, memberDisplayName } from "./circleMembers";
import { findHobyCatalogue, memberHobbyLevelLabel } from "./memberHobbyLevel";
import { formatMemberAvailability } from "./circleMemberDisplay";

function memberInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function MemberAvatar(props: { name: string; isYou?: boolean }) {
  return (
    <span
      className={`circle-details-member-avatar${props.isYou ? " circle-details-member-avatar--you" : ""}`}
      aria-hidden
    >
      {memberInitial(props.name)}
    </span>
  );
}

function MemberBadges(props: {
  memberId: string;
  myUserId: string | null;
  creatorUserId: string | null;
  t: (key: string) => string;
}) {
  const isYou = Boolean(props.myUserId && props.memberId === props.myUserId);
  const isOwner = Boolean(props.creatorUserId && props.memberId === props.creatorUserId);
  if (!isYou && !isOwner) return null;
  return (
    <span className="circle-details-member-badges">
      {isYou ? <span className="pill">{props.t("circleDetails.you")}</span> : null}
      {isOwner ? <span className="pill pill--owner">{props.t("circleDetails.owner")}</span> : null}
    </span>
  );
}

export function CircleDetailsMembersSection(props: {
  members: CircleMemberResponse[];
  circle: CircleResponse;
  hobiesCatalog: Hoby[];
  myUserId: string | null;
  creatorUserId: string | null;
  maxSize: number;
  selectedMemberId: string | null;
  onSelectMember: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const members = dedupeMembers(props.members);
  const catalogue = findHobyCatalogue(props.hobiesCatalog, props.circle.ritualType);
  const selectedMember = members.find((m) => m.id === props.selectedMemberId) ?? null;

  if (!members.length) return null;

  if (selectedMember) {
    const name = memberDisplayName(selectedMember, members);
    const levelRaw = memberHobbyLevelLabel(selectedMember, props.circle, catalogue);
    return (
      <section className="circle-details-members-section stack">
        <button
          type="button"
          className="circle-details-back"
          onClick={() => props.onSelectMember(null)}
        >
          {t("circleDetails.backWhosComing")}
        </button>
        <div className="circle-details-member-profile card stack">
          <div className="circle-details-member-profile-head row">
            <MemberAvatar name={name} isYou={selectedMember.id === props.myUserId} />
            <div>
              <div className="circle-details-member-profile-name">{name}</div>
              <div className="circle-details-member-profile-level muted">
                {selectedMember.id === props.creatorUserId ? t("circleDetails.owner") : t("circleDetails.member")}
                {levelRaw !== "Level not set" && levelRaw !== "—"
                  ? ` · ${humanMemberLevelPhrase(levelRaw, t)}`
                  : ""}
              </div>
            </div>
            <MemberBadges
              memberId={selectedMember.id}
              myUserId={props.myUserId}
              creatorUserId={props.creatorUserId}
              t={t}
            />
          </div>
          {selectedMember.city?.trim() ? (
            <p className="muted circle-details-member-meta">{selectedMember.city.trim()}</p>
          ) : null}
          <p className="muted circle-details-member-meta">{formatMemberAvailability(selectedMember)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="circle-details-members-section stack">
      <div className="circle-details-members-head">
        <h3 className="circle-details-members-title">{t("circleDetails.whosComing")}</h3>
      </div>
      {members.length <= 1 ? (
        <div className="circle-details-empty-members">
          {members[0]?.id !== props.myUserId ? (
            <p className="circle-details-empty-lead">{t("circleDetails.beFirstToJoin")}</p>
          ) : null}
          <p>{t("circleDetails.lookingForParticipants")}</p>
        </div>
      ) : null}

      <div className="circle-details-member-list" role="list">
        {members.map((m) => {
          const name = memberDisplayName(m, members);
          return (
            <button
              key={m.id}
              type="button"
              className="circle-details-member-card"
              role="listitem"
              onClick={() => props.onSelectMember(m.id)}
            >
              <MemberAvatar name={name} isYou={m.id === props.myUserId} />
              <span className="circle-details-member-card-copy">
                <span className="circle-details-member-card-name">{name}</span>
                <span className="circle-details-member-badges">
                  {m.id === props.myUserId ? <span className="pill">{t("circleDetails.you")}</span> : null}
                  {m.id === props.creatorUserId ? (
                    <span className="pill pill--owner">{t("circleDetails.owner")}</span>
                  ) : (
                    <span className="pill pill--member">{t("circleDetails.member")}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
