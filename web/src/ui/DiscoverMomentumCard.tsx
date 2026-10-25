import { useTranslation } from "react-i18next";
import type { CircleListItem, Hoby } from "../api/types";
import { findHobyCatalogue } from "./memberHobbyLevel";
import { BidiText } from "./BidiText";
import { circleIdentity, DiscoverSubtitle, discoverDescription, discoverSubtitleParts } from "./circleDisplay";
import { DiscoverCircleSignals } from "./DiscoverCircleSignals";
import {
  formatCircleCostChip,
  formatCircleDetailsVibe,
  formatCircleLocationChip,
} from "./circleDetailsFormat";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";

function discoverMomentumText(joined: number, viewerIsMember: boolean): { key: string; count?: number } {
  if (joined <= 1) {
    return {
      key: viewerIsMember ? "circleDetails.momentumInviteOthers" : "discoverPage.momentumBeFirst",
    };
  }
  return {
    key: viewerIsMember ? "circleDetails.momentumAlreadyJoined" : "discoverPage.momentumAlreadyJoined",
    count: joined,
  };
}

export function DiscoverMomentumCard(props: {
  circle: CircleListItem;
  actionLabel: string;
  onOpen: () => void;
  featured?: boolean;
  /** Home variant: no place/cost row and no social-proof line. */
  compact?: boolean;
  showDate?: boolean;
  /** Hobby catalogue: type/level labels and the description fallback. */
  hobiesCatalog?: Hoby[];
}) {
  const { t } = useTranslation();
  const { circle } = props;
  const joined = Math.max(0, circle.memberCount);
  const capacity = Math.max(1, circle.maxSize);
  const isNew = joined <= 1 && !circle.isYours;
  const momentum = discoverMomentumText(joined, circle.isYours);
  const next = circle.nextActivity ?? null;
  const when = next ? formatSessionDateTimeHero(next.startAt) : t("discoverPage.noActivityPlanned");
  const nextLine = next ? t("discoverPage.nextActivityAt", { when }) : t("discoverPage.noActivityPlanned");
  const sizeLine = t("circleDetails.typicalSizeValue", { count: capacity });
  const proofLine = isNew
    ? t("discoverPage.proofHelpStart")
    : joined >= 2
      ? t("discoverPage.proofPeopleJoined", { count: joined })
      : null;

  const identity = circleIdentity(circle);
  const catalogue = props.hobiesCatalog?.length
    ? findHobyCatalogue(props.hobiesCatalog, circle.ritualType)
    : undefined;
  const subtitleParts = discoverSubtitleParts(circle, catalogue);
  const description = discoverDescription(
    circle,
    catalogue,
    formatCircleDetailsVibe(circle.ritualType, t),
  );

  if (!props.compact) {
    const activeThisWeek = (circle.messagesLastWeek ?? 0) > 0;

    return (
      <article
        className={`discover-community-card${props.featured ? " discover-community-card--featured" : ""}${
          isNew ? " discover-community-card--new" : ""
        }`}
        role="button"
        tabIndex={0}
        aria-label={identity.displayTitle}
        onClick={props.onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onOpen();
          }
        }}
      >
        <header className="discover-community-top">
          <span className="home-hobby-badge discover-community-badge" aria-hidden>
            {circle.hobyIcon?.trim() || catalogue?.icon?.trim() || ""}
          </span>
          {isNew ? (
            <span className="circle-activity-status-badge discover-momentum-new-badge">
              <span aria-hidden>✨</span>
              {t("discoverPage.newCircle")}
            </span>
          ) : null}
        </header>

        <div className="discover-community-identity">
          <BidiText as="h3" className="discover-community-title">
            {identity.displayTitle}
          </BidiText>
          <DiscoverSubtitle parts={subtitleParts} className="discover-community-hobby" />
        </div>

        {description ? (
          <p className="discover-community-description">
            <BidiText>{description}</BidiText>
          </p>
        ) : null}

        <DiscoverCircleSignals
          memberCount={joined}
          isRecurring={circle.isRecurring}
          recurringTime={circle.recurringTime}
        />

        <div className="discover-community-people">
          <span>{t("circleDetails.memberCount", { count: joined })}</span>
          <span className="discover-momentum-spots">{sizeLine}</span>
        </div>

        <ul className="discover-community-signals" aria-label={t("circleDetails.chipsAria")}>
          <li>
            <span aria-hidden>📅</span>
            <span>
              <bdi>{nextLine}</bdi>
            </span>
          </li>
          <li>
            <span aria-hidden>📍</span>
            <span>
              {formatCircleLocationChip(circle, t)} · {formatCircleCostChip(circle.costPayment, circle.groupSize, t)}
            </span>
          </li>
          {activeThisWeek ? (
            <li>
              <span aria-hidden>💬</span>
              <span>{t("discoverPage.activeThisWeek")}</span>
            </li>
          ) : null}
        </ul>

        <p className="discover-community-momentum">{t(momentum.key, { count: momentum.count })}</p>

        <button
          type="button"
          className="circle-details-primary discover-momentum-action"
          onClick={(e) => {
            e.stopPropagation();
            props.onOpen();
          }}
        >
          {props.actionLabel}
        </button>
      </article>
    );
  }

  return (
    <article
      className={`discover-momentum-card${props.featured ? " discover-momentum-card--featured" : ""}${
        isNew ? " discover-momentum-card--new" : ""
      }${props.compact ? " discover-momentum-card--compact" : ""}`}
      role="button"
      tabIndex={0}
      onClick={props.onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onOpen();
        }
      }}
    >
      <header className="discover-momentum-head">
        <span className="home-hobby-badge discover-momentum-badge" aria-hidden>
          {circle.hobyIcon?.trim() ?? ""}
        </span>
        <div className="discover-momentum-title-wrap">
          <BidiText as="h3" className="discover-momentum-title circle-title-wrap">
            {identity.displayTitle}
          </BidiText>
          <DiscoverSubtitle parts={subtitleParts} className="discover-momentum-hobby muted" />
        </div>
        {isNew ? (
          <span className="circle-activity-status-badge discover-momentum-new-badge">
            <span aria-hidden>✨</span>
            {t("discoverPage.newCircle")}
          </span>
        ) : null}
      </header>

      {props.compact ? (
        props.showDate ? (
          <ul className="discover-momentum-facts" aria-label={t("circleDetails.chipsAria")}>
            <li>
              <span aria-hidden>📅</span>
              <span>{when}</span>
            </li>
          </ul>
        ) : null
      ) : (
        <ul className="discover-momentum-facts" aria-label={t("circleDetails.chipsAria")}>
          <li>
            <span aria-hidden>📅</span>
            <span>{when}</span>
          </li>
          <li>
            <span aria-hidden>📍</span>
            <span>{formatCircleLocationChip(circle, t)}</span>
          </li>
          <li>
            <span aria-hidden>💰</span>
            <span>{formatCircleCostChip(circle.costPayment, circle.groupSize, t)}</span>
          </li>
        </ul>
      )}

      <div className="discover-momentum-progress">
        <div className="discover-momentum-progress-row">
          <span className="discover-momentum-count">
            {props.compact ? <span aria-hidden>👥 </span> : null}
            {t("circleDetails.memberCount", { count: joined })}
          </span>
          <span className="discover-momentum-spots">
            {sizeLine}
          </span>
        </div>
      </div>

      <p className="discover-momentum-message">{t(momentum.key, { count: momentum.count })}</p>

      {proofLine && (!props.compact || isNew) ? (
        <div className="discover-momentum-proof">
          <span aria-hidden>{isNew ? "🌱" : "👥"}</span>
          <span className="discover-momentum-proof-text">{proofLine}</span>
        </div>
      ) : null}

      <button
        type="button"
        className="circle-details-primary discover-momentum-action"
        onClick={(e) => {
          e.stopPropagation();
          props.onOpen();
        }}
      >
        {props.actionLabel}
      </button>
    </article>
  );
}

export function DiscoverHobbyChips(props: {
  hobies: { slug: string; displayName: string; icon?: string | null }[];
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="discover-hobby-chips" role="group" aria-label={t("discoverPage.filterHobby")}>
      <button
        type="button"
        className={`discover-hobby-chip${props.value === "" ? " is-active" : ""}`}
        aria-pressed={props.value === ""}
        disabled={props.disabled}
        onClick={() => props.onChange("")}
      >
        {t("discoverPage.filterAll")}
      </button>
      {props.hobies.map((h) => {
        const active = props.value === h.slug;
        return (
          <button
            key={h.slug}
            type="button"
            className={`discover-hobby-chip${active ? " is-active" : ""}`}
            aria-pressed={active}
            disabled={props.disabled}
            onClick={() => props.onChange(active ? "" : h.slug)}
          >
            {h.icon?.trim() ? <span aria-hidden>{h.icon.trim()}</span> : null}
            {h.displayName}
          </button>
        );
      })}
    </div>
  );
}
