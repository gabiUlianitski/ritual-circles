import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, Hoby } from "../api/types";
import { formatCircleLocationChip } from "./circleDetailsFormat";
import { circleDisplayTitle } from "./circleDisplay";
import { circleSocialProof, HobbyVisual } from "./HomeVisuals";
import {
  discoveryImageUrl,
  discoveryCategory,
  pickTodaysHobby,
  readDiscoveryCopy,
  rememberDiscovery,
  saveDiscoveryCopy,
  scenePrompt,
  todayKey,
  type DiscoveryCategory,
  type DiscoveryCopy,
} from "./homeDiscovery";

const FALLBACK_BODY: Record<DiscoveryCategory, string> = {
  food: "homeFeed.discoveryBodyFood",
  sports: "homeFeed.discoveryBodySports",
  outdoor: "homeFeed.discoveryBodyOutdoor",
  creativity: "homeFeed.discoveryBodyCreativity",
  games: "homeFeed.discoveryBodyGames",
  learning: "homeFeed.discoveryBodyLearning",
  wellness: "homeFeed.discoveryBodyWellness",
  social: "homeFeed.discoveryBodySocial",
};

/** One magazine-style hobby spotlight for the day. AI copy upgrades a catalog fallback; the card is never empty. */
export function TodaysDiscovery(props: {
  hobies: Hoby[];
  userSlugs: string[];
  circleSlugs: string[];
  userId: string | null;
  featuredCircle?: CircleListItem;
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
  const [copy, setCopy] = useState<DiscoveryCopy | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!pick) return;
    rememberDiscovery(props.userId, today, pick);
    setImageFailed(false);
    const cached = readDiscoveryCopy(props.userId, today, pick.slug);
    if (cached) {
      setCopy(cached);
      return;
    }
    setCopy(null);
    let cancelled = false;
    void api
      .todaysDiscovery({ displayName: pick.displayName, category: pick.category, lang: i18n.language })
      .then((res) => {
        if (cancelled || !res.title?.trim() || !res.body?.trim()) return;
        const next: DiscoveryCopy = {
          title: res.title.trim(),
          body: res.body.trim(),
          imagePrompt: res.imagePrompt?.trim() || scenePrompt(pick.displayName),
          source: "ai",
        };
        saveDiscoveryCopy(props.userId, today, pick.slug, next);
        setCopy(next);
      })
      .catch(() => {
        /* catalog fallback stays on screen */
      });
    return () => {
      cancelled = true;
    };
  }, [pick, props.userId, today, i18n.language]);

  const featured = props.featuredCircle;
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

  const name = visualPick.displayName;
  const fallbackTitle = t(`homeFeed.discoveryTitle_${visualPick.category}`, {
    name,
    defaultValue: t("homeFeed.discoveryTitle", { name }),
  });
  const fallbackBody = t(FALLBACK_BODY[visualPick.category], { name, defaultValue: "" });
  const title = featured ? circleDisplayTitle(featured) : copy?.title || fallbackTitle;
  const body = featured ? formatCircleLocationChip(featured, t) : copy?.body || fallbackBody;
  const proof = featured ? circleSocialProof(featured, t) : [];
  const matchesYou =
    featured != null &&
    props.userSlugs.some((s) => s.trim().toLowerCase() === featured.ritualType.trim().toLowerCase());
  const imageUrl = discoveryImageUrl(
    featured ? scenePrompt(visualPick.displayName) : copy?.imagePrompt || scenePrompt(visualPick.displayName),
    `${today}:${visualPick.slug}`,
  );
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
        <span className="home-discovery-badge">
          {matchesYou ? `✨ ${t("homeFeed.pickedForYou")}` : t("homeFeed.discoveryBadge")}
        </span>
        <h2 className="home-discovery-title">{title}</h2>
        {body ? <p className="home-discovery-body">{featured ? `📍 ${body}` : body}</p> : null}
        {proof.length > 0 ? (
          <p className="home-proof-line">
            {proof.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </p>
        ) : null}
        <button type="button" className="circle-details-primary home-discovery-cta" onClick={open}>
          {featured ? t("discoverPage.join") : t("homeFeed.exploreHobby", { name: visualPick.displayName })}
        </button>
      </div>
    </section>
  );
}
