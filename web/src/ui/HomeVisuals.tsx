import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CircleListItem, CommunityStats } from "../api/types";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";
import { type HomeInterest } from "./homeSections";

/** Dark-blue gradients; the hobby slug always maps to the same one. */
const VISUAL_GRADIENTS = [
  "linear-gradient(135deg, #1d4ed8 0%, #0b1f4d 70%)",
  "linear-gradient(135deg, #0e7490 0%, #0b1f4d 70%)",
  "linear-gradient(135deg, #6d28d9 0%, #0b1f4d 70%)",
  "linear-gradient(135deg, #0f766e 0%, #0b1f4d 70%)",
  "linear-gradient(135deg, #b45309 0%, #1e1b4b 70%)",
  "linear-gradient(135deg, #be185d 0%, #1e1b4b 70%)",
  "linear-gradient(135deg, #2563eb 0%, #312e81 70%)",
];

function visualStyle(slug: string | null | undefined): React.CSSProperties {
  const s = (slug ?? "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return { background: VISUAL_GRADIENTS[hash % VISUAL_GRADIENTS.length] };
}

/** Hobby "image": the hobby's own icon on its gradient. */
export function HobbyVisual(props: {
  slug: string | null | undefined;
  icon: string | null | undefined;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  return (
    <div className={`home-visual home-visual--${props.size ?? "md"}`} style={visualStyle(props.slug)}>
      <span className="home-visual-icon" aria-hidden>
        {props.icon?.trim() || "✨"}
      </span>
      {props.children}
    </div>
  );
}

const BEGINNER_LEVELS = new Set(["beginner", "1", "novice", "starter", "casual"]);

export function isBeginnerCircle(level: string | number | null | undefined): boolean {
  return BEGINNER_LEVELS.has(String(level ?? "").trim().toLowerCase());
}

/** Real signals only: headcount, level, chat this week, and the next meetup. */
export function circleSocialProof(c: CircleListItem, t: TFunction): string[] {
  return [
    t("homeFeed.memberCount", { count: c.memberCount }),
    isBeginnerCircle(c.ritualLevel) ? t("homeFeed.beginnerFriendly") : null,
    (c.messagesLastWeek ?? 0) > 0 ? t("homeFeed.proofActiveWeek") : null,
    c.nextActivity
      ? t("homeFeed.proofNextMeetup", { when: formatSessionDateTimeHero(c.nextActivity.startAt) })
      : null,
  ].filter((x): x is string => Boolean(x));
}

function ProgressBlock(props: { circle: CircleListItem }) {
  const { t } = useTranslation();
  const joined = Math.max(0, props.circle.memberCount);
  const capacity = Math.max(1, props.circle.maxSize);
  return (
    <div className="discover-momentum-progress">
      <div className="discover-momentum-progress-row">
        <span className="discover-momentum-count">
          <span aria-hidden>👥 </span>
          {t("circleDetails.memberCount", { count: joined })}
        </span>
        <span className="discover-momentum-spots">
          {t("circleDetails.typicalSizeValue", { count: capacity })}
        </span>
      </div>
    </div>
  );
}

function StatusBadge(props: { circle: CircleListItem }) {
  const { t } = useTranslation();
  if (props.circle.memberCount > 1 || props.circle.isYours) return null;
  return (
    <span className="circle-activity-status-badge discover-momentum-new-badge">
      <span aria-hidden>✨</span>
      {t("discoverPage.newCircle")}
    </span>
  );
}

/* ---------- 1. Hero ---------- */

export function HomeHeroEmpty(props: { chips: HomeInterest[]; onPickHobby: (slug: string) => void; onExplore: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="home-hero-empty" aria-label={t("homeFeed.nothingPlannedTitle")}>
      <h2 className="home-hero-empty-title">{t("homeFeed.nothingPlannedTitle")}</h2>
      <p className="home-hero-empty-sub">{t("homeFeed.nothingPlannedSub")}</p>
      <div className="discover-hobby-chips" role="group" aria-label={t("homeFeed.exploreInterests")}>
        {props.chips.map(({ hoby }) => (
          <button key={hoby.slug} type="button" className="discover-hobby-chip" onClick={() => props.onPickHobby(hoby.slug)}>
            {hoby.icon?.trim() ? <span aria-hidden>{hoby.icon.trim()}</span> : null}
            {hoby.displayName}
          </button>
        ))}
        <button type="button" className="discover-hobby-chip" onClick={props.onExplore}>
          {t("homeFeed.exploreActivities")}
        </button>
      </div>
    </section>
  );
}

/* ---------- 4. What's Happening This Week ---------- */

export function HappeningCarousel(props: { circles: CircleListItem[]; onOpen: (c: CircleListItem) => void; onSeeAll: () => void }) {
  const { t } = useTranslation();
  if (props.circles.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("homeFeed.happeningTitle")}>
      <header className="home-feed-section-head">
        <h2 className="home-section-title">{t("homeFeed.happeningTitle")}</h2>
        <button type="button" className="home-btn-text home-feed-see-all" onClick={props.onSeeAll}>
          {t("homeFeed.seeAll")}
        </button>
      </header>
      <div className="home-carousel">
        {props.circles.map((c) => (
          <article
            key={c.id}
            className="home-happening-card"
            role="button"
            tabIndex={0}
            onClick={() => props.onOpen(c)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onOpen(c);
              }
            }}
          >
            <HobbyVisual slug={c.ritualType} icon={c.hobyIcon} size="md">
              <span className="home-visual-badge">
                <StatusBadge circle={c} />
              </span>
            </HobbyVisual>
            <div className="home-happening-body">
              <h3 className="home-happening-title circle-title-wrap">
                <BidiText>{circleDisplayTitle(c)}</BidiText>
              </h3>
              {circleHobbySubtitle(c) ? (
                <p className="home-happening-when circle-identity-hobby">{circleHobbySubtitle(c)}</p>
              ) : null}
              {c.nextActivity ? (
                <p className="home-happening-when">📅 {formatSessionDateTimeHero(c.nextActivity.startAt)}</p>
              ) : null}
              <ProgressBlock circle={c} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- 5. Community Pulse ---------- */

export function CommunityPulse(props: { stats: CommunityStats | null; groupsForming: number }) {
  const { t } = useTranslation();
  const s = props.stats;
  const items = [
    s && s.meetupsThisWeek > 0
      ? { icon: "🎉", value: s.meetupsThisWeek, label: t("homeFeed.communityMeetups") }
      : null,
    s && s.activeCircles > 0
      ? { icon: "📅", value: s.activeCircles, label: t("homeFeed.communityCircles") }
      : null,
    s && s.members > 0 ? { icon: "👥", value: s.members, label: t("homeFeed.communityMembers") } : null,
  ].filter((x): x is { icon: string; value: number; label: string } => x != null);
  if (items.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("homeFeed.communityPulse")}>
      <h2 className="home-section-title">{t("homeFeed.communityPulse")}</h2>
      <ul className="home-pulse">
        {items.map((it) => (
          <li key={it.label} className="home-pulse-item">
            <span className="home-pulse-icon" aria-hidden>
              {it.icon}
            </span>
            <strong className="home-pulse-value">{it.value}</strong>
            <span className="home-pulse-label">{it.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}