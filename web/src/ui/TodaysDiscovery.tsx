import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, CommunityStats, Hoby } from "../api/types";
import { circleSignal, dailyMoment } from "./homeMoments";
import { formatCircleLocationChip } from "./circleDetailsFormat";
import { circleDisplayTitle } from "./circleDisplay";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";
import { HobbyVisual } from "./HomeVisuals";
import {
  discoveryImageUrl,
  discoveryCategory,
  pickTodaysHobby,
  rememberDiscovery,
  scenePrompt,
  todayKey,
} from "./homeDiscovery";
import { compactInsight, insightFallbackKey } from "./hobbyInsightSelect";

/** One circle for today. The insight comes from the stored library, never from a live AI call. */
export function TodaysDiscovery(props: {
  hobies: Hoby[];
  userSlugs: string[];
  circleSlugs: string[];
  userId: string | null;
  featuredCircle?: CircleListItem;
  /** Circles to try, in order, until one hobby has an active insight library. */
  libraryCircles?: CircleListItem[];
  catalog: CircleListItem[];
  likedSlugs: string[];
  city: string | null;
  stats: CommunityStats | null;
  onOpenCircle: (circle: CircleListItem) => void;
  onExplore: (slug: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const today = todayKey();
  const pick = useMemo(
    () =>
      pickTodaysHobby({
        hobies: props.hobies,
        userSlugs: props.userSlugs,
        circleSlugs: props.circleSlugs,
        userId: props.userId,
        today,
      }),
    [props.hobies, props.userSlugs, props.circleSlugs, props.userId, today],
  );
  const [imageFailed, setImageFailed] = useState(false);
  const [insight, setInsight] = useState<{ slug: string; text: string } | null>(null);

  const featured = props.featuredCircle;
  const libraryChoices = useMemo(() => {
    const seen = new Set<string>();
    const circles: CircleListItem[] = [];
    for (const circle of [...(props.libraryCircles ?? []), ...(featured ? [featured] : [])]) {
      const slug = circle.ritualType.trim().toLowerCase();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      circles.push(circle);
    }
    return circles;
  }, [props.libraryCircles, featured]);
  const insightSlug = (libraryChoices[0]?.ritualType || featured?.ritualType || pick?.slug || "").trim();

  useEffect(() => {
    if (pick) rememberDiscovery(props.userId, today, pick);
    setImageFailed(false);
  }, [pick, props.userId, today]);

  const choiceKey = libraryChoices.map((circle) => `${circle.id}:${circle.ritualType}`).join("|");
  useEffect(() => {
    const slugs = libraryChoices.map((circle) => circle.ritualType.trim()).filter(Boolean);
    if (slugs.length === 0 && insightSlug) slugs.push(insightSlug);
    if (slugs.length === 0) return;
    setInsight(null);
    let cancelled = false;
    void (async () => {
      for (const slug of slugs) {
        try {
          const res = await api.dailyLibraryInsight(slug, today);
          if (cancelled) return;
          if (res.text?.trim()) {
            setInsight({ slug: slug.toLowerCase(), text: res.text.trim() });
            return;
          }
        } catch {
          /* This hobby has no active library. Try the next circle. */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [choiceKey, insightSlug, today, i18n.language]);

  const shown =
    (insight
      ? libraryChoices.find((circle) => circle.ritualType.trim().toLowerCase() === insight.slug)
      : null) ?? featured;

  if (!pick && !shown) return null;

  const featuredHobby = shown
    ? props.hobies.find((h) => h.slug.trim().toLowerCase() === shown.ritualType.trim().toLowerCase())
    : null;
  const visualPick = featuredHobby
    ? {
        slug: featuredHobby.slug,
        displayName: featuredHobby.displayName,
        icon: featuredHobby.icon ?? null,
        category: discoveryCategory(featuredHobby),
      }
    : shown
      ? {
          slug: shown.ritualType,
          displayName: shown.hobyDisplayName || shown.ritualType,
          icon: shown.hobyIcon ?? null,
          category: discoveryCategory({
            slug: shown.ritualType,
            displayName: shown.hobyDisplayName || shown.ritualType,
          }),
        }
      : pick;
  if (!visualPick) return null;

  const title = shown ? circleDisplayTitle(shown) : visualPick.displayName;
  const location = shown ? formatCircleLocationChip(shown, t) : "";
  const libraryInsight = insight?.text ? compactInsight(insight.text) : null;
  const heroLine = shown
    ? dailyMoment({
        featured: shown,
        catalog: props.catalog,
        likedSlugs: props.likedSlugs,
        city: props.city,
        stats: props.stats,
        libraryInsight,
        dayKey: today,
        t,
      })
    : libraryInsight || compactInsight(t(insightFallbackKey(visualPick.slug, today), { name: visualPick.displayName }));
  const imageUrl = discoveryImageUrl(scenePrompt(visualPick.displayName), `${today}:${visualPick.slug}`);
  const nextActivity = shown?.nextSessionAt
    ? formatSessionDateTimeHero(shown.nextSessionAt)
    : t("homeFeed.readyToChooseDate");

  const open = () => {
    if (shown) props.onOpenCircle(shown);
    else props.onExplore(visualPick.slug);
  };

  return (
    <section className="home-discovery" aria-label={t("homeFeed.discoveryBadge")}>
      {imageFailed ? (
        <HobbyVisual slug={visualPick.slug} icon={visualPick.icon} size="lg" />
      ) : (
        <img
          className="home-discovery-image"
          src={imageUrl}
          alt=""
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="home-discovery-shade" />
      <div className="home-discovery-content">
        <span className="home-discovery-badge">{`✨ ${t("homeMoments.badge")}`}</span>
        <p className="home-discovery-insight">{heroLine}</p>
        <div className="home-discovery-pick">
          <h2 className="home-discovery-circle circle-title-wrap">
            {visualPick.icon?.trim() ? <span aria-hidden>{visualPick.icon.trim()} </span> : null}
            {title}
          </h2>
          {shown ? (
            <p className="home-discovery-facts">
              {location ? <span>📍 {location}</span> : null}
              <span>📅 {nextActivity}</span>
            </p>
          ) : null}
        </div>
        <div className="home-discovery-action">
          {shown ? (
            <p className="home-discovery-proof">
              <span>👥 {t("homeFeed.memberCount", { count: shown.memberCount })}</span>
              <span aria-hidden>·</span>
              <span>{circleSignal(shown, t)}</span>
            </p>
          ) : null}
          <button type="button" className="circle-details-primary home-discovery-cta" onClick={open}>
            {shown ? t("homeFeed.joinCircle") : t("homeFeed.exploreHobby", { name: visualPick.displayName })}
          </button>
        </div>
      </div>
    </section>
  );
}
