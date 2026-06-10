import React from "react";
import type { CostPaymentPayload, GroupSizePayload, Hoby } from "../api/types";
import { type CircleHobyFields } from "./circleDisplay";
import {
  formatCircleCostChip,
  formatCircleDetailsRhythm,
  formatCircleDetailsTitle,
  formatCircleDetailsVibe,
  formatCircleLocationChip,
  formatCircleScheduleChip,
  formatCircleSizeChip,
} from "./circleDetailsFormat";
import { findHobyCatalogue } from "./memberHobbyLevel";

export function CircleDetailsSummary(props: {
  circle: CircleHobyFields & {
    modality?: string;
    costPayment?: CostPaymentPayload | null;
    groupSize?: GroupSizePayload | null;
  };
  hobiesCatalog?: Hoby[];
  memberCount?: number;
  maxSize?: number;
}) {
  const { circle } = props;
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;

  const title = formatCircleDetailsTitle(circle, catalogue);
  const rhythm = formatCircleDetailsRhythm(circle);
  const vibe = formatCircleDetailsVibe(circle.ritualType);
  const scheduleChip = formatCircleScheduleChip(circle);
  const locationChip = formatCircleLocationChip(circle);
  const costChip = formatCircleCostChip(circle.costPayment, circle.groupSize);
  const sizeChip = formatCircleSizeChip(props.memberCount ?? 0, props.maxSize ?? circle.maxSize ?? 6);

  return (
    <div className="circle-details-summary stack">
      <header className="circle-details-hero">
        <h2 className="circle-details-hero-title">{title}</h2>
        <p className="circle-details-hero-rhythm">{rhythm}</p>
        <p className="circle-details-hero-vibe muted">{vibe}</p>
      </header>

      <div className="circle-details-chips" aria-label="Circle at a glance">
        <div className="circle-details-chip-row">
          <span className="circle-details-chip">📅 {scheduleChip}</span>
          <span className="circle-details-chip">📍 {locationChip}</span>
        </div>
        <div className="circle-details-chip-row">
          <span className="circle-details-chip">💸 {costChip}</span>
          <span className="circle-details-chip">👥 {sizeChip}</span>
        </div>
      </div>
    </div>
  );
}

export function CircleDetailsPrimaryAction(props: {
  isMember: boolean;
  joinLabel?: string;
  joinDisabled?: boolean;
  joinBusy?: boolean;
  onJoin?: () => void;
}) {
  if (props.isMember) return null;

  if (!props.onJoin) return null;

  const blocked = props.joinLabel && props.joinLabel !== "Join circle" && props.joinLabel !== "Join";

  return (
    <div className="circle-details-cta stack">
      <button
        type="button"
        className={blocked ? "circle-details-cta-btn circle-details-cta-btn-secondary" : "primary circle-details-cta-btn"}
        disabled={props.joinDisabled || props.joinBusy}
        onClick={props.onJoin}
      >
        {props.joinBusy ? "Joining…" : blocked ? props.joinLabel : "Join this circle"}
      </button>
    </div>
  );
}
