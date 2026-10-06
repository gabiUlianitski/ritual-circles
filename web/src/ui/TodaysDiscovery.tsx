import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Hoby } from "../api/types";
import { HobbyVisual } from "./HomeVisuals";
import {
  discoveryImageUrl,
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

  if (!pick) return null;

  const name = pick.displayName;
  const fallbackTitle = t(`homeFeed.discoveryTitle_${pick.category}`, {
    name,
    defaultValue: t("homeFeed.discoveryTitle", { name }),
  });
  const fallbackBody = t(FALLBACK_BODY[pick.category], { name, defaultValue: "" });
  const title = copy?.title || fallbackTitle;
  const body = copy?.body || fallbackBody;
  const imageUrl = discoveryImageUrl(copy?.imagePrompt || scenePrompt(pick.displayName), `${today}:${pick.slug}`);

  return (
    <section className="home-discovery" aria-label={t("homeFeed.discoveryBadge")}>
      {imageFailed ? (
        <HobbyVisual slug={pick.slug} icon={pick.icon} size="lg" />
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
        <span className="home-discovery-badge">{t("homeFeed.discoveryBadge")}</span>
        <h2 className="home-discovery-title">{title}</h2>
        {body ? <p className="home-discovery-body">{body}</p> : null}
        <button type="button" className="circle-details-primary home-discovery-cta" onClick={() => props.onExplore(pick.slug)}>
          {t("homeFeed.exploreHobby", { name: pick.displayName })}
        </button>
      </div>
    </section>
  );
}
