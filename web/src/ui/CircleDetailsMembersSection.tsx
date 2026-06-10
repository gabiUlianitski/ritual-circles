import React from "react";
import type { CircleMemberResponse, CircleResponse, Hoby } from "../api/types";
import { circleParticipationState } from "./circleParticipation";
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
}) {
  const isYou = Boolean(props.myUserId && props.memberId === props.myUserId);
  const isOwner = Boolean(props.creatorUserId && props.memberId === props.creatorUserId);
  if (!isYou && !isOwner) return null;
  return (
    <span className="circle-details-member-badges">
      {isYou ? <span className="pill">You</span> : null}
      {isOwner ? <span className="pill pill--owner">Owner</span> : null}
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
  const members = dedupeMembers(props.members);
  const catalogue = findHobyCatalogue(props.hobiesCatalog, props.circle.ritualType);
  const participation = circleParticipationState(members.length, props.maxSize);
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
          ← Who&apos;s coming
        </button>
        <div className="circle-details-member-profile card stack">
          <div className="circle-details-member-profile-head row">
            <MemberAvatar name={name} isYou={selectedMember.id === props.myUserId} />
            <div>
              <div className="circle-details-member-profile-name">{name}</div>
              <div className="circle-details-member-profile-level muted">
                {humanMemberLevelPhrase(levelRaw)}
              </div>
            </div>
            <MemberBadges
              memberId={selectedMember.id}
              myUserId={props.myUserId}
              creatorUserId={props.creatorUserId}
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
        <h3 className="circle-details-members-title">👥 Who&apos;s coming</h3>
        <div className="circle-details-members-meta">
          {participation.isFull ? (
            <span className="home-status-badge home-status-badge--confirmed circle-participation-full">
              Confirmed
            </span>
          ) : (
            <div className="circle-participation-copy circle-participation-copy--meta">
              {participation.peopleInLine ? (
                <span className="circle-participation-in">{participation.peopleInLine}</span>
              ) : null}
              {participation.spotsLeftLine ? (
                <span className="circle-participation-spots">{participation.spotsLeftLine}</span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="circle-details-member-list" role="list">
        {members.map((m) => {
          const name = memberDisplayName(m, members);
          const levelRaw = memberHobbyLevelLabel(m, props.circle, catalogue);
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
                <span className="circle-details-member-card-level muted">
                  {humanMemberLevelPhrase(levelRaw)}
                </span>
              </span>
              <MemberBadges
                memberId={m.id}
                myUserId={props.myUserId}
                creatorUserId={props.creatorUserId}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
