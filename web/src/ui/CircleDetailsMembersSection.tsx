import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleMemberResponse, CircleResponse, Hoby } from "../api/types";
import { humanMemberLevelPhrase } from "./circleDetailsFormat";
import { dedupeMembers, memberDisplayName } from "./circleMembers";
import { findHobyCatalogue, memberHobbyLevelLabel } from "./memberHobbyLevel";
import { formatMemberAvailability } from "./circleMemberDisplay";
import { parseHobyTypesNested } from "./hobyMetadata";
import { CircleMemberAvatar } from "./CircleMemberAvatar";
import { BidiText } from "./BidiText";

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
  /** Creator-only. Empty seats stay decorative when this is omitted. */
  onInviteSeat?: () => void;
}) {
  const { t } = useTranslation();
  const members = dedupeMembers(props.members);
  const catalogue = findHobyCatalogue(props.hobiesCatalog, props.circle.ritualType);
  const selectedMember = members.find((m) => m.id === props.selectedMemberId) ?? null;

  if (!members.length) return null;

  if (selectedMember) {
    const name = memberDisplayName(selectedMember, members);
    const levelRaw = memberHobbyLevelLabel(selectedMember, props.circle, catalogue);
    const selectedType = parseHobyTypesNested(catalogue?.types).find(
      (item) => item.key === selectedMember.hobby_subtype?.trim(),
    );
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
            <CircleMemberAvatar
              name={name}
              avatarUrl={selectedMember.avatarUrl}
              isYou={selectedMember.id === props.myUserId}
            />
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
          {selectedType ? (
            <p className="muted circle-details-member-meta">
              {selectedType.icon ? <span aria-hidden>{selectedType.icon} </span> : null}
              {selectedType.label ?? selectedType.key.replace(/_/g, " ")}
            </p>
          ) : null}
          <p className="muted circle-details-member-meta">{formatMemberAvailability(selectedMember)}</p>
        </div>
      </section>
    );
  }

  const capacity = Math.max(members.length, props.maxSize || 6);
  const openSeats = Math.max(0, capacity - members.length);
  const ordered = [...members].sort((a, b) => memberRank(b, props) - memberRank(a, props));

  return (
    <section className="circle-details-members-section">
      <div className="circle-details-members-head">
        <div>
          <p className="circle-details-section-kicker">{t("circleDetails.community")}</p>
          <h2 className="circle-details-members-title">{t("circleDetails.peopleTitle")}</h2>
        </div>
        <span className="circle-details-members-meta">
          {t("circleDetails.seatsFilled", { joined: members.length, capacity })}
        </span>
      </div>
      {members.length <= 1 ? (
        <p className="circle-details-empty-members">
          {members[0]?.id !== props.myUserId ? t("circleDetails.beFirstToJoin") : t("circleDetails.lookingForParticipants")}
        </p>
      ) : null}

      <ul className="circle-details-people-grid">
        {ordered.map((m) => {
          const name = memberDisplayName(m, members);
          const type = parseHobyTypesNested(catalogue?.types).find((item) => item.key === m.hobby_subtype?.trim());
          const level = memberHobbyLevelLabel(m, props.circle, catalogue);
          const details = [
            type ? `${type.icon ? `${type.icon} ` : ""}${type.label ?? type.key.replace(/_/g, " ")}` : null,
            level !== "Level not set" && level !== "—" ? humanMemberLevelPhrase(level, t) : null,
          ].filter(Boolean);
          const isYou = m.id === props.myUserId;
          const isOwner = m.id === props.creatorUserId;
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`circle-details-person${isYou ? " circle-details-person--you" : ""}`}
                onClick={() => props.onSelectMember(m.id)}
              >
                <span className="circle-details-person-avatar">
                  <CircleMemberAvatar name={name} avatarUrl={m.avatarUrl} isYou={isYou} />
                  {isOwner ? (
                    <span className="circle-details-person-crown" aria-hidden>
                      ★
                    </span>
                  ) : null}
                </span>
                <BidiText className="circle-details-person-name">{isYou ? t("circleDetails.you") : name}</BidiText>
                <span className="circle-details-person-role">
                  {isOwner ? t("circleDetails.owner") : t("circleDetails.member")}
                </span>
                {details.length ? <span className="circle-details-person-meta">{details.join(" · ")}</span> : null}
              </button>
            </li>
          );
        })}
        {Array.from({ length: openSeats }, (_, i) =>
          props.onInviteSeat ? (
            <li key={`open-${i}`}>
              <button
                type="button"
                className="circle-details-person circle-details-person--open circle-details-person--invite"
                onClick={props.onInviteSeat}
              >
                <span className="circle-details-person-avatar">
                  <span className="circle-details-open-seat">+</span>
                </span>
                <span className="circle-details-person-name">{t("circleDetails.inviteSomeone")}</span>
              </button>
            </li>
          ) : (
            <li key={`open-${i}`} className="circle-details-person circle-details-person--open" aria-hidden>
              <span className="circle-details-person-avatar">
                <span className="circle-details-open-seat">+</span>
              </span>
              <span className="circle-details-person-name">{t("circleDetails.openSpot")}</span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function memberRank(m: CircleMemberResponse, props: { myUserId: string | null; creatorUserId: string | null }): number {
  if (m.id === props.creatorUserId) return 2;
  if (m.id === props.myUserId) return 1;
  return 0;
}
