import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleMeResponse, CircleMessage } from "../api/types";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import {
  activityStatusMark,
  circleMomentum,
  circleStatusKey,
} from "./CircleProgressCard";
import { FormError } from "./FormError";

export function hasSeenJoinSuccess(userId: string | null, circleId: string): boolean {
  if (!circleId) return true;
  try {
    const key = `ritual_join_success_seen_${userId ?? "anon"}_${circleId}`;
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function markJoinSuccessSeen(userId: string | null, circleId: string): void {
  if (!circleId) return;
  try {
    const key = `ritual_join_success_seen_${userId ?? "anon"}_${circleId}`;
    localStorage.setItem(key, "true");
  } catch {
    /* ignore storage errors */
  }
}

function memberInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function CircleJoinSuccess(props: {
  circleId: string;
  onOpenChat: (prefillDraft?: string) => void;
  onViewCircle: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<CircleMeResponse | null>(null);
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getMyCircle(props.circleId),
      api.getCircleMessages(props.circleId).catch(() => [] as CircleMessage[]),
    ])
      .then(([circleData, msgList]) => {
        if (cancelled) return;
        setData(circleData);
        setMessages(msgList);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [props.circleId]);

  const circle = data?.circle ?? null;
  const members = data?.members ?? [];
  const creatorUserId = data?.creatorUserId ?? null;
  const joined = Math.max(0, members.length);
  const capacity = Math.max(1, circle?.maxSize ?? 6);
  const spots = Math.max(0, capacity - joined);
  const hasNextSession = Boolean(data?.nextSessionRoster?.dateTime);
  const status = circleMomentum(joined, capacity, hasNextSession);
  const pct = Math.min(100, Math.round((joined / capacity) * 100));

  const needed =
    spots <= 0
      ? t("circleDetails.circleFullProgress")
      : spots === 1
        ? t("circleJoinSuccess.oneSpotNeeded")
        : t("circleJoinSuccess.spotsNeeded", { count: spots });

  const momentumText = useMemo(() => {
    if (joined === 2) {
      return t("circleJoinSuccess.momentumSecondMember");
    }
    if (status === "readyToSchedule" || status === "meetingConfirmed") {
      return t("circleJoinSuccess.momentumReady");
    }
    if (spots <= 2) {
      return spots === 1
        ? t("circleJoinSuccess.momentumOneMore")
        : t("circleJoinSuccess.momentumOnlyMore", { count: spots });
    }
    return t("circleJoinSuccess.momentumAlreadyJoined", { count: joined });
  }, [joined, status, spots, t]);

  const nextStepText = useMemo(() => {
    if (status === "meetingConfirmed") {
      return t("circleJoinSuccess.nextMeetingConfirmed");
    }
    if (hasNextSession) {
      return t("circleJoinSuccess.nextMeetingScheduled");
    }
    if (status === "readyToSchedule") {
      return t("circleJoinSuccess.nextReadyToSchedule");
    }
    return t("circleJoinSuccess.nextStillForming");
  }, [status, hasNextSession, t]);

  const starterChips = useMemo(
    () => [
      t("circleJoinSuccess.chipExcited"),
      t("circleJoinSuccess.chipLookingForward"),
      t("circleJoinSuccess.chipDates"),
      t("circleJoinSuccess.chipLocation"),
    ],
    [t],
  );

  const visibleMembers = members.slice(0, 5);
  const extraMembersCount = members.length - visibleMembers.length;
  const isQuietTwoPeople = joined === 2;
  const hasNoMessages = messages.length === 0;

  return (
    <div className="card stack circle-join-success-page">
      <header className="circle-join-success-hero stack">
        <div className="circle-join-success-icon-wrap" aria-hidden>
          <span className="circle-join-success-icon">✅</span>
        </div>
        <h1 className="circle-join-success-headline">{t("circleJoinSuccess.headline")}</h1>
        <p className="circle-join-success-subheadline muted">{t("circleJoinSuccess.subheadline")}</p>
      </header>

      {error ? <FormError>{error}</FormError> : null}

      {loading && !circle ? (
        <div className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
          {t("common.loading")}
        </div>
      ) : circle ? (
        <>
          <section className="circle-join-success-card stack">
            <div className="circle-join-success-summary-head">
              <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
                {circle.hobyIcon?.trim() ?? ""}
              </span>
              <div className="circle-join-success-summary-copy">
                <div>
                  <BidiText as="h2" className="circle-join-success-circle-name circle-title-wrap">
                    {circleDisplayTitle(circle)}
                  </BidiText>
                  {circleHobbySubtitle(circle) ? (
                    <p className="muted circle-identity-hobby">{circleHobbySubtitle(circle)}</p>
                  ) : null}
                </div>
              </div>
              <span className={`circle-activity-status-badge circle-progress-status--${status}`}>
                <span aria-hidden>{activityStatusMark(status)}</span>
                {t(circleStatusKey(status))}
              </span>
            </div>

            <div className="circle-progress-card circle-join-success-progress" aria-label={t("circleDetails.groupProgress")}>
              <p className="circle-progress-count">
                {t("circleJoinSuccess.joinedOfParticipants", { joined, capacity })}
              </p>
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
              <p className="circle-momentum-message">{momentumText}</p>
            </div>
          </section>

          {isQuietTwoPeople ? (
            <section className="circle-join-success-quiet-card stack">
              <p className="circle-join-success-quiet-lead">{t("circleJoinSuccess.quietHelping")}</p>
              <p className="circle-join-success-quiet-sub muted">{t("circleJoinSuccess.quietInviteOrChat")}</p>
            </section>
          ) : null}

          <section className="circle-join-success-next stack">
            <h3 className="circle-join-success-next-kicker">{t("circleJoinSuccess.whatHappensNext")}</h3>
            <p className="circle-join-success-next-content">{nextStepText}</p>
          </section>

          {members.length > 0 ? (
            <section className="circle-join-success-people stack" aria-label={t("circleJoinSuccess.peopleJoining")}>
              <h3 className="circle-join-success-section-title">{t("circleJoinSuccess.peopleJoining")}</h3>
              <div className="circle-join-success-people-list">
                {visibleMembers.map((member) => {
                  const firstName = member.first_name?.trim() || member.user_name;
                  const isOwner = Boolean(creatorUserId && member.id === creatorUserId);
                  return (
                    <div key={member.id} className="circle-join-success-person">
                      <span className="circle-details-member-avatar" aria-hidden>
                        {memberInitial(firstName)}
                      </span>
                      <span className="circle-join-success-person-name">{firstName}</span>
                      {isOwner ? (
                        <span className="pill pill--owner">{t("circleChat.organizer")}</span>
                      ) : null}
                    </div>
                  );
                })}
                {extraMembersCount > 0 ? (
                  <div className="circle-join-success-person-more">
                    <span className="circle-details-member-avatar circle-details-member-avatar--more" aria-hidden>
                      +{extraMembersCount}
                    </span>
                    <span className="circle-join-success-person-name muted">
                      {t("circleJoinSuccess.andMore", { count: extraMembersCount })}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {hasNoMessages ? (
            <section className="circle-join-success-conversation stack">
              <h3 className="circle-join-success-section-title">{t("circleJoinSuccess.startConversation")}</h3>
              <div className="circle-chat-chips" role="list">
                {starterChips.map((chipText) => (
                  <button
                    key={chipText}
                    type="button"
                    className="circle-chat-chip"
                    onClick={() => props.onOpenChat(chipText)}
                  >
                    {chipText}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="circle-join-success-actions stack">
            <button
              type="button"
              className="circle-details-primary circle-join-success-action-primary"
              onClick={props.onViewCircle}
            >
              {t("circleJoinSuccess.openCircle")}
            </button>

            {props.onClose ? (
              <button type="button" className="circle-join-success-action-secondary" onClick={props.onClose}>
                {t("circleJoinSuccess.continue")}
              </button>
            ) : null}

          </div>
        </>
      ) : null}
    </div>
  );
}
