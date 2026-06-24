import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleListItem, Hoby } from "../api/types";
import { circleHobyTitle } from "./circleDisplay";
import {
  formatCircleDetailsTitle,
  formatCircleDetailsVibe,
  formatCircleScheduleShort,
} from "./circleDetailsFormat";
import { findHobyCatalogue, circleHobyTypeLevelLabels } from "./memberHobbyLevel";
import { formatCompactSchedule, formatCompactLocation, formatParticipantsLabel } from "./circleDiscover";
import { isCircleJoinable, circleParticipationState } from "./circleParticipation";

export type DiscoverCircleCardProps = {
  circle: CircleListItem;
  onPress: () => void;
  /** Onboarding step 3: show level, vibe, and full location (no ellipsis). */
  fullDescription?: boolean;
  hobiesCatalog?: Hoby[];
  joinAction?: {
    label: string;
    busy?: boolean;
    disabled?: boolean;
    secondary?: boolean;
    onJoin: () => void;
  } | null;
};

export function DiscoverCircleCard(props: DiscoverCircleCardProps) {
  const { t } = useTranslation();
  const { circle } = props;
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;
  const full = props.fullDescription === true;
  const title = full
    ? formatCircleDetailsTitle(circle, catalogue, t)
    : circleHobyTitle(circle);
  const location = formatCompactLocation(circle);
  const time = full ? formatCircleScheduleShort(circle, t) : formatCompactSchedule(circle, t);
  const participants = formatParticipantsLabel(circle, t);
  const typeLevel = catalogue ? circleHobyTypeLevelLabels(circle, catalogue) : null;
  const typeLevelLine =
    full && typeLevel && typeLevel.type !== "—"
      ? t("discoverPage.typeLevelLine", {
          type: typeLevel.type,
          level: typeLevel.level,
        })
      : null;
  const vibeLine = full ? formatCircleDetailsVibe(circle.ritualType, t) : null;
  const participation = circleParticipationState(circle.memberCount, circle.maxSize);
  const joinable = isCircleJoinable(circle.memberCount, circle.maxSize);
  const joinAction =
    props.joinAction && !joinable
      ? {
          label: t("discoverPage.circleFull", {
            count: participation.joined,
            max: participation.capacity,
          }),
          busy: false,
          disabled: true,
          secondary: true,
          onJoin: () => {},
        }
      : props.joinAction;

  return (
    <article
      className={`discover-card discover-card-tappable${full ? " discover-card--full" : ""}`}
      onClick={() => props.onPress()}
    >
      <div className="discover-card-body">
        <div className="discover-card-head">
          {!full && (
            <span className="discover-card-icon" aria-hidden>
              {circle.hobyIcon || "🎯"}
            </span>
          )}
          <h3 className="discover-card-title">{title}</h3>
        </div>
        {vibeLine ? <p className="discover-card-vibe muted">{vibeLine}</p> : null}
        {typeLevelLine ? <p className="discover-card-type-level muted">{typeLevelLine}</p> : null}
        <ul className="discover-card-meta">
          <li>
            <span className="discover-card-meta-icon" aria-hidden>
              🕐
            </span>
            {time}
          </li>
          <li className="discover-card-meta-location">
            <span className="discover-card-meta-icon" aria-hidden>
              📍
            </span>
            <span className="discover-card-meta-text">{location}</span>
          </li>
          <li className="discover-card-participants">
            <span className="discover-card-meta-icon" aria-hidden>
              👥
            </span>
            <span className="discover-card-participants-text">{participants}</span>
          </li>
        </ul>
      </div>
      {joinAction ? (
        <button
          type="button"
          className={`discover-card-join${joinAction.secondary ? " discover-card-join-secondary" : " primary"}`}
          disabled={joinAction.disabled || joinAction.busy}
          onClick={(e) => {
            e.stopPropagation();
            joinAction.onJoin();
          }}
        >
          {joinAction.busy ? t("discoverPage.joining") : joinAction.label}
        </button>
      ) : null}
    </article>
  );
}

export function DiscoverSection(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`discover-section${props.compact ? " discover-section-compact" : ""}`}>
      <div className="discover-section-heading">
        <h2 className="discover-section-title">{props.title}</h2>
        {props.subtitle ? <p className="discover-section-subtitle muted">{props.subtitle}</p> : null}
      </div>
      <div className="discover-section-body">{props.children}</div>
    </section>
  );
}

export function DiscoverFilterChips<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="discover-filter-group">
      <span className="discover-filter-label muted">{props.label}</span>
      <div className="discover-chips row" role="group" aria-label={props.label}>
        {props.options.map((opt) => (
          <button
            key={opt.value || "all"}
            type="button"
            className={`discover-chip${props.value === opt.value ? " discover-chip-active" : ""}`}
            disabled={props.disabled}
            aria-pressed={props.value === opt.value}
            onClick={() => props.onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DiscoverFiltersCollapsible(props: {
  expanded: boolean;
  onToggle: () => void;
  hasActiveFilters: boolean;
  onClear: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="discover-filters-panel">
      <button
        type="button"
        className="discover-filters-toggle"
        aria-expanded={props.expanded}
        onClick={props.onToggle}
        disabled={props.disabled}
      >
        <span>{t("discoverPage.filters")}</span>
        {props.hasActiveFilters ? (
          <span className="discover-filters-dot" aria-label={t("discoverPage.filtersActive")} />
        ) : null}
        <span className="discover-filters-chevron" aria-hidden>
          {props.expanded ? "▾" : "▸"}
        </span>
      </button>
      {props.expanded ? (
        <div className="discover-filters-body stack">
          {props.children}
          {props.hasActiveFilters ? (
            <button type="button" className="discover-filters-clear" onClick={props.onClear}>
              {t("discoverPage.clearFilters")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DiscoverInterestChips(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  categories: { id: string; label: string; icon: string }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="discover-interest-scroll" role="group" aria-label={t("discoverPage.browseInterestAria")}>
      {props.categories.map((cat) => {
        const active = props.value === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            className={`discover-interest-chip${active ? " discover-interest-chip-active" : ""}`}
            disabled={props.disabled}
            aria-pressed={active}
            onClick={() => props.onChange(active ? "" : cat.id)}
          >
            <span aria-hidden>{cat.icon}</span> {cat.label}
          </button>
        );
      })}
    </div>
  );
}

export function DiscoverEmptyState(props: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="discover-empty stack">
      <div className="discover-empty-title">{props.title}</div>
      {props.message ? <p className="discover-empty-message muted">{props.message}</p> : null}
      {props.actionLabel && props.onAction ? (
        <button type="button" className="primary discover-empty-action" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function DiscoverSectionHint(props: { title: string; message?: string }) {
  return (
    <div className="discover-section-hint stack">
      <div className="discover-section-hint-title">{props.title}</div>
      {props.message ? <p className="discover-section-hint-message muted">{props.message}</p> : null}
    </div>
  );
}
