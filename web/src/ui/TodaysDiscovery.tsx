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
  const [insight, setInsight] = useState<string | null>(null);

  const featured = props.featuredCircle;
  const insightSlug = (featured?.ritualType || pick?.slug || "").trim();

  useEffect(() => {
    if (pick) rememberDiscovery(props.userId, today, pick);
    setImageFailed(false);
  }, [pick, props.userId, today]);

  useEffect(() => {
    if (!insightSlug) return;
    setInsight(null);
    let cancelled = false;
    void api
      .dailyLibraryInsight(insightSlug, today)
      .then((res) => {
        if (!cancelled && res.text?.trim()) setInsight(res.text.trim());
      })
      .catch(() => {
        /* static hobby insight stays on screen */
      });
    return () => {
      cancelled = true;
    };
  }, [insightSlug, today, i18n.language]);

  if (!pick && !featured) return null;

  const featuredHobby = featured
    ? props.hobies.find((h) => h.slug.trim().toLowerCase() === featured.ritualType.trim().toLowerCase())
    : null;
  const visualPick = featuredHobby
    ? {
        slug: featuredHobby.slug,
        displayName: featuredHobby.displayName,
        icon: featuredHobby.icon ?? null,
        category: discoveryCategory(featuredHobby),
      }
    : featured
      ? {
          slug: featured.ritualType,
          displayName: featured.hobyDisplayName || featured.ritualType,
          icon: featured.hobyIcon ?? null,
          category: discoveryCategory({
            slug: featured.ritualType,
            displayName: featured.hobyDisplayName || featured.ritualType,
          }),
        }
      : pick;
  if (!visualPick) return null;

  const title = featured ? circleDisplayTitle(featured) : visualPick.displayName;
  const location = featured ? formatCircleLocationChip(featured, t) : "";
  const libraryInsight = insight ? compactInsight(insight) : null;
  const heroLine = featured
    ? dailyMoment({
        featured,
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
  const nextActivity = featured?.nextSessionAt
    ? formatSessionDateTimeHero(featured.nextSessionAt)
    : t("homeFeed.readyToChooseDate");

  const open = () => {
    if (featured) props.onOpenCircle(featured);
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
          {featured ? (
            <p className="home-discovery-facts">
              {location ? <span>📍 {location}</span> : null}
              <span>📅 {nextActivity}</span>
            </p>
          ) : null}
        </div>
        <div className="home-discovery-action">
          {featured ? (
            <p className="home-discovery-proof">
              <span>👥 {t("homeFeed.memberCount", { count: featured.memberCount })}</span>
              <span aria-hidden>·</span>
              <span>{circleSignal(featured, t)}</span>
            </p>
          ) : null}
          <button type="button" className="circle-details-primary home-discovery-cta" onClick={open}>
            {featured ? t("homeFeed.joinCircle") : t("homeFeed.exploreHobby", { name: visualPick.displayName })}
          </button>
        </div>
      </div>
    </section>
  );
}
