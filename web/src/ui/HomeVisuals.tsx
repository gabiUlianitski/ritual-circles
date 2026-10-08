import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CircleListItem, CommunityStats } from "../api/types";
import { api } from "../api/client";
import { BidiText } from "./BidiText";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import { activityStatusMark, circleStatusKey } from "./CircleProgressCard";
import { FormError } from "./FormError";
import { formatSessionDateTimeHero, sessionHobbySubtitle, sessionTitle } from "./homeDashboardUtils";
import { circleStatus, type HomeInterest, type HomeUpcoming } from "./homeSections";

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
  const spots = Math.max(0, c.maxSize - c.memberCount);
  return [
    t("homeFeed.memberCount", { count: c.memberCount }),
    isBeginnerCircle(c.ritualLevel) ? t("homeFeed.beginnerFriendly") : null,
    (c.messagesLastWeek ?? 0) > 0 ? t("homeFeed.proofActiveWeek") : null,
    c.nextSessionAt
      ? t("homeFeed.proofNextMeetup", { when: formatSessionDateTimeHero(c.nextSessionAt) })
      : null,
    spots > 0 && spots <= 2 ? t("homeFeed.proofSpotsLeft", { count: spots }) : null,
  ].filter((x): x is string => Boolean(x));
}

/** One activity line for a recommendation card. */
export function circleActivityLabel(c: CircleListItem, t: TFunction): string | null {
  if ((c.messagesLastWeek ?? 0) > 0) return t("homeFeed.proofActiveWeek");
  if (isBeginnerCircle(c.ritualLevel)) return t("homeFeed.beginnerFriendly");
  const status = circleStatus(c);
  if (status === "justStarted") return null;
  return t(circleStatusKey(status));
}

function ProgressBlock(props: { circle: CircleListItem }) {
  const { t } = useTranslation();
  const joined = Math.max(0, props.circle.memberCount);
  const capacity = Math.max(1, props.circle.maxSize);
  const spots = Math.max(0, capacity - joined);
  const pct = Math.min(100, Math.round((joined / capacity) * 100));
  const status = circleStatus(props.circle);
  return (
    <div className="discover-momentum-progress">
      <div className="discover-momentum-progress-row">
        <span className="discover-momentum-count">
          <span aria-hidden>👥 </span>
          {t("discoverPage.joinedOfShort", { joined, capacity })}
        </span>
        <span
          className={`discover-momentum-spots${spots > 0 && spots <= 2 ? " discover-momentum-spots--scarce" : ""}`}
        >
          {spots <= 0
            ? t("discoverPage.cardFull")
            : spots === 1
              ? t("discoverPage.onlyOneSpotLeft")
              : spots === 2
                ? t("discoverPage.onlySpotsLeft", { count: spots })
                : t("discoverPage.spotsLeft", { count: spots })}
        </span>
      </div>
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
    </div>
  );
}

function StatusBadge(props: { circle: CircleListItem }) {
  const { t } = useTranslation();
  const status = circleStatus(props.circle);
  if (props.circle.memberCount <= 1 && !props.circle.isYours) {
    return (
      <span className="circle-activity-status-badge discover-momentum-new-badge">
        <span aria-hidden>✨</span>
        {t("discoverPage.newCircle")}
      </span>
    );
  }
  return (
    <span className={`circle-activity-status-badge circle-progress-status--${status}`}>
      <span aria-hidden>{activityStatusMark(status)}</span>
      {t(circleStatusKey(status))}
    </span>
  );
}

/* ---------- 1. Hero ---------- */

export function HomeHeroActivity(props: {
  upcoming: HomeUpcoming;
  onOpen: (circleId: string, tab?: "details" | "chat") => void;
  onRefresh: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const u = props.upcoming;
  const circleId = u.kind === "session" ? u.item.circleId : u.circle.id;
  const slug = u.kind === "session" ? u.item.ritualType : u.circle.ritualType;
  const icon = u.kind === "session" ? u.item.hobyIcon : u.circle.hobyIcon;
  const title = u.kind === "session" ? sessionTitle(u.item) : circleDisplayTitle(u.circle);
  const hobbyLine = u.kind === "session" ? sessionHobbySubtitle(u.item) : circleHobbySubtitle(u.circle);
  const members = u.kind === "session" ? (u.item.memberCount ?? 0) : u.circle.memberCount;
  const coming = u.kind === "session" ? u.item.attendingCount : undefined;

  async function imComing() {
    if (u.kind !== "session") return;
    setWorking(true);
    setError(null);
    try {
      await api.putAttendance(u.item.session.id, "attending");
      await props.onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="home-hero-visual" aria-label={t("homeFeed.yourNextActivity")}>
      <HobbyVisual slug={slug} icon={icon} size="lg">
        <span className="home-visual-kicker">
          {u.kind === "readyToSchedule"
            ? t("homeFeed.readyToChooseDate")
            : u.needsAnswer
              ? t("homeFeed.waitingForYourAnswer")
              : t("homeFeed.yourNextActivity")}
        </span>
      </HobbyVisual>
      <div className="home-hero-visual-body">
        <BidiText as="h2" className="home-hero-visual-title circle-title-wrap">
          {title}
        </BidiText>
        {hobbyLine ? <p className="home-hero-visual-meta circle-identity-hobby">{hobbyLine}</p> : null}
        <p className="home-hero-visual-meta">
          {u.kind === "session" ? (
            <>
              <span>📅 {formatSessionDateTimeHero(u.item.session.dateTime)}</span>
              <span>
                👥 {coming != null && coming > 0
                  ? t("homeFeed.peopleComing", { count: coming })
                  : t("discoverPage.proofPeopleJoined", { count: members })}
              </span>
            </>
          ) : (
            <span>👥 {t("discoverPage.proofPeopleJoined", { count: members })}</span>
          )}
        </p>
        <div className="home-hero-visual-actions">
          <button
            type="button"
            className="circle-details-primary"
            onClick={() => props.onOpen(circleId, u.kind === "readyToSchedule" ? "chat" : "details")}
          >
            {u.kind === "readyToSchedule" ? t("homeFeed.suggestDate") : t("homeFeed.openActivity")}
          </button>
          {u.kind === "session" && u.needsAnswer ? (
            <button type="button" className="home-hero-secondary" disabled={working} onClick={() => void imComing()}>
              {working ? t("common.saving") : t("home.imComing")}
            </button>
          ) : null}
        </div>
        {error ? <FormError>{error}</FormError> : null}
      </div>
    </section>
  );
}

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

/* ---------- 3. Explore Interests ---------- */

export function InterestCarousel(props: { interests: HomeInterest[]; onPick: (slug: string) => void }) {
  const { t } = useTranslation();
  if (props.interests.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("homeFeed.exploreInterests")}>
      <h2 className="home-section-title">{t("homeFeed.exploreInterests")}</h2>
      <div className="home-interest-chips">
        {props.interests.map(({ hoby }) => (
          <button key={hoby.slug} type="button" className="home-interest-chip" onClick={() => props.onPick(hoby.slug)}>
            {hoby.icon?.trim() ? <span aria-hidden>{hoby.icon.trim()}</span> : null}
            <span>{hoby.displayName}</span>
          </button>
        ))}
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
              {c.nextSessionAt ? (
                <p className="home-happening-when">📅 {formatSessionDateTimeHero(c.nextSessionAt)}</p>
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

/** Today's motion, from chat activity and open circles already loaded on Home. */
export function JoiningPulse(props: { circles: CircleListItem[]; openCircles: number }) {
  const { t } = useTranslation();
  const chatted = props.circles.filter((c) => (c.messagesToday ?? 0) > 0).length;
  const active = props.circles.filter((c) => (c.messagesLastWeek ?? 0) > 0).length;
  const items = [
    chatted > 0 ? { icon: "💬", label: t("homeFeed.chattedToday", { count: chatted }) } : null,
    props.openCircles > 0 ? { icon: "🔥", label: t("homeFeed.openCircles", { count: props.openCircles }) } : null,
    active > 0 ? { icon: "🎉", label: t("homeFeed.activeCirclesWeek", { count: active }) } : null,
  ].filter((x): x is { icon: string; label: string } => x != null);
  if (items.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("homeFeed.peopleAreJoining")}>
      <h2 className="home-section-title">{t("homeFeed.peopleAreJoining")}</h2>
      <div className="home-joining">
        {items.map((it) => (
          <span key={it.label} className="home-joining-pill">
            <span aria-hidden>{it.icon}</span>
            {it.label}
          </span>
        ))}
      </div>
    </section>
  );
}

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

/* ---------- 6. Upcoming Activity ---------- */

export function UpcomingList(props: { items: HomeUpcoming[]; onOpen: (circleId: string) => void }) {
  const { t } = useTranslation();
  if (props.items.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("homeFeed.upcomingActivity")}>
      <h2 className="home-section-title">{t("homeFeed.upcomingActivity")}</h2>
      <ul className="activity-history">
        {props.items.map((u) => {
          const id = u.kind === "session" ? u.item.circleId : u.circle.id;
          const key = u.kind === "session" ? u.item.session.id : `ready-${u.circle.id}`;
          return (
            <li key={key}>
              <button type="button" className="activity-history-item" onClick={() => props.onOpen(id)}>
                <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
                  {(u.kind === "session" ? u.item.hobyIcon : u.circle.hobyIcon) ?? ""}
                </span>
                <span className="activity-history-copy">
                  <BidiText as="span" className="activity-history-title">
                    {u.kind === "session" ? sessionTitle(u.item) : circleDisplayTitle(u.circle)}
                  </BidiText>
                  <span className="activity-history-time muted">
                    {[
                      u.kind === "session" ? sessionHobbySubtitle(u.item) : circleHobbySubtitle(u.circle),
                      u.kind === "session"
                        ? formatSessionDateTimeHero(u.item.session.dateTime)
                        : t("homeFeed.readyToChooseDate"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="activity-history-status muted">
                  {u.kind === "session" && u.needsAnswer ? t("homeFeed.waitingForYourAnswer") : t("homeFeed.openActivity")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
