import React from "react";
import { useTranslation } from "react-i18next";

export type CircleMomentum =
  | "justStarted"
  | "growing"
  | "almostReady"
  | "readyToSchedule"
  | "meetingConfirmed";

/** Fill level plus whether a next session already exists. No fixed hobby or count. */
export function circleMomentum(joined: number, capacity: number, hasNextSession: boolean): CircleMomentum {
  const safeJoined = Math.max(0, joined);
  const safeCapacity = Math.max(1, capacity);
  const spots = Math.max(0, safeCapacity - safeJoined);
  if (safeJoined >= safeCapacity) return "meetingConfirmed";
  if (!hasNextSession && safeJoined >= 2 && spots <= Math.max(1, Math.ceil(safeCapacity / 3))) {
    return "readyToSchedule";
  }
  if (safeJoined >= 2 && (spots <= 2 || safeJoined / safeCapacity >= 0.67)) return "almostReady";
  if (safeJoined <= 1) return "justStarted";
  return "growing";
}

const STATUS_KEY: Record<CircleMomentum, string> = {
  justStarted: "circleDetails.statusJustStarted",
  growing: "circleDetails.statusGrowing",
  almostReady: "circleDetails.statusAlmostReady",
  readyToSchedule: "circleDetails.statusReadyToSchedule",
  meetingConfirmed: "circleDetails.statusMeetingConfirmed",
};

const STATUS_MARK: Record<CircleMomentum, string> = {
  justStarted: "🟡",
  growing: "🟡",
  almostReady: "🔥",
  readyToSchedule: "🔥",
  meetingConfirmed: "🟢",
};

/** One sentence built from the real headcount. */
export function circleMomentumMessage(
  joined: number,
  capacity: number,
  hasNextSession: boolean,
  viewerIsMember = false,
): { key: string; count?: number } {
  const safeJoined = Math.max(0, joined);
  const safeCapacity = Math.max(1, capacity);
  const spots = Math.max(0, safeCapacity - safeJoined);
  const status = circleMomentum(safeJoined, safeCapacity, hasNextSession);
  if (status === "meetingConfirmed" || status === "readyToSchedule") {
    return { key: "circleDetails.momentumEnough" };
  }
  if (safeJoined <= 1) {
    return { key: viewerIsMember ? "circleDetails.momentumInviteOthers" : "circleDetails.beFirstToJoin" };
  }
  if (spots <= 2) {
    return spots === 1
      ? { key: "circleDetails.momentumOneMore" }
      : { key: "circleDetails.momentumOnlyMore", count: spots };
  }
  return { key: "circleDetails.momentumAlreadyJoined", count: safeJoined };
}

export function CircleMomentumNote(props: {
  joined: number;
  capacity: number;
  hasNextSession: boolean;
  viewerIsMember?: boolean;
}) {
  const { t } = useTranslation();
  const message = circleMomentumMessage(props.joined, props.capacity, props.hasNextSession, props.viewerIsMember);
  return <p className="circle-momentum-message">{t(message.key, { count: message.count })}</p>;
}

const MOMENTUM_RANK: Record<CircleMomentum, number> = {
  readyToSchedule: 0,
  almostReady: 1,
  growing: 2,
  justStarted: 3,
  meetingConfirmed: 4,
};

/** Discover order: closest to happening first; full circles last because they cannot be joined. */
export function momentumRank(status: CircleMomentum): number {
  return MOMENTUM_RANK[status];
}

export function circleStatusKey(status: CircleMomentum): string {
  return STATUS_KEY[status];
}

export function activityStatusMark(status: CircleMomentum): string {
  return STATUS_MARK[status];
}

export function CircleProgressCard(props: {
  joined: number;
  capacity: number;
  hasNextSession: boolean;
}) {
  const { t } = useTranslation();
  const joined = Math.max(0, props.joined);
  const capacity = Math.max(1, props.capacity);
  const spots = Math.max(0, capacity - joined);
  const status = circleMomentum(joined, capacity, props.hasNextSession);
  const pct = Math.min(100, Math.round((joined / capacity) * 100));
  const needed =
    spots <= 0
      ? t("circleDetails.circleFullProgress")
      : spots === 1
        ? t("circleDetails.oneMoreNeeded")
        : t("circleDetails.moreNeeded", { count: spots });

  return (
    <section className="circle-progress-card" aria-label={t("circleDetails.groupProgress")}>
      <h3 className="circle-progress-title">{t("circleDetails.groupProgress")}</h3>
      <p className="circle-progress-count">{t("circleDetails.joinedOf", { joined, capacity })}</p>
      <p className="circle-progress-needed">{needed}</p>
      <div
        className="circle-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(joined, capacity)}
        aria-valuetext={t(STATUS_KEY[status])}
      >
        <span className="circle-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className={`circle-progress-status circle-progress-status--${status}`}>
        <span aria-hidden>{STATUS_MARK[status]} </span>
        {t("circleDetails.statusLine", { status: t(STATUS_KEY[status]) })}
      </p>
    </section>
  );
}
