import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, CommunityStats, HomeCalendarSession, HomeResponse, Hoby, UserMeResponse } from "../api/types";
import { discoveryImageUrl, scenePrompt } from "./homeDiscovery";
import {
  shouldShowWelcomeTutorial,
} from "../onboarding/onboardingState";
import { CircleDetails } from "./CircleDetails";
import { circleDisplayTitle } from "./circleDisplay";
import { formatCircleLocationChip } from "./circleDetailsFormat";
import { hobbiesFromMe } from "./circleJoinHobby";
import { buildHomeFeed } from "./homeSections";
import { HobbyVisual } from "./HomeVisuals";
import { formatSessionEventParts, formatUpcomingDateTime, getUpcomingSessions, sessionTitle, upcomingBadge } from "./homeDashboardUtils";
import { todayKey } from "./homeDiscovery";
import { discoverNewInterests, type NewInterestMatch } from "./homeInterestDiscovery";
import { circleSignal } from "./homeMoments";
import { TodaysDiscovery } from "./TodaysDiscovery";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";

function activityPlace(item: HomeCalendarSession, circle: CircleListItem | undefined, t: (key: string) => string): string {
  if (circle) {
    const chip = formatCircleLocationChip(circle, t);
    if (chip) return chip;
  }
  const raw = item.session.locationOrLink?.trim() ?? "";
  if (raw && !/^https?:/i.test(raw)) return raw.split(",")[0].trim();
  return "";
}

function activitySignal(
  item: HomeCalendarSession,
  circle: CircleListItem | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if ((circle?.messagesToday ?? 0) > 0) return t("homeMoments.signalActiveChat");
  const max = circle?.maxSize ?? item.maxSize ?? 0;
  const members = circle?.memberCount ?? item.memberCount ?? 0;
  const spots = Math.max(0, max - members);
  if (max > 0 && spots > 0 && spots <= 2) return t("homeFeed.proofSpotsLeft", { count: spots });
  const people = item.attendingCount ?? members;
  if (people <= 1) return t("homeMoments.signalNewActivity");
  return t("homeFeed.participantCount", { count: people });
}

function UpcomingStrip(props: {
  sessions: HomeCalendarSession[];
  circles: CircleListItem[];
  onOpen: (circleId: string) => void;
  onSeeAll: () => void;
  onFind: () => void;
}) {
  const { t } = useTranslation();
  const byId = new Map(props.circles.map((c) => [c.id, c]));
  return (
    <section className="home-feed-block" aria-label={t("homeMoments.myUpcoming")}>
      <div className="home-section-head">
        <h2 className="home-section-title">{t("homeMoments.myUpcoming")}</h2>
        {props.sessions.length > 0 ? (
          <button type="button" className="home-section-link" onClick={props.onSeeAll}>
            {t("homeFeed.seeAll")}
          </button>
        ) : null}
      </div>
      {props.sessions.length === 0 ? (
        <div className="home-upcoming-empty">
          <p>{t("homeMoments.emptyPlansTitle")}</p>
          <button type="button" className="primary" onClick={props.onFind}>
            {t("homeMoments.discoverActivities")}
          </button>
        </div>
      ) : (
        <div className="home-carousel home-upcoming-carousel">
          {props.sessions.map((item) => {
            const circle = byId.get(item.circleId);
            const badge = upcomingBadge(formatSessionEventParts(item.session.dateTime).daysAway);
            const place = activityPlace(item, circle, t);
            const icon = item.hobyIcon?.trim();
            return (
              <button
                key={item.session.id}
                type="button"
                className="home-upcoming-card"
                onClick={() => props.onOpen(item.circleId)}
              >
                <span className="home-upcoming-top">
                  <span className="home-upcoming-name circle-title-wrap">
                    {icon ? <span aria-hidden>{icon} </span> : null}
                    {sessionTitle(item)}
                  </span>
                  <span className="home-upcoming-badge">{t(badge.key, { count: badge.count })}</span>
                </span>
                <span className="home-upcoming-when">{formatUpcomingDateTime(item.session.dateTime)}</span>
                {place ? <span className="home-upcoming-place">📍 {place}</span> : null}
                <span className="home-upcoming-signal">{activitySignal(item, circle, t)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CirclePhoto(props: { circle: CircleListItem }) {
  const [failed, setFailed] = useState(false);
  const name = props.circle.hobyDisplayName || props.circle.ritualType;
  if (failed) {
    return <HobbyVisual slug={props.circle.ritualType} icon={props.circle.hobyIcon} size="sm" />;
  }
  return (
    <img
      className="home-recommend-image"
      src={discoveryImageUrl(scenePrompt(name), props.circle.id, { w: 520, h: 320 })}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function ForYouIntro(props: { guest?: boolean }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const day = todayKey();
  useEffect(() => {
    if (props.guest) return;
    let cancelled = false;
    void api
      .forYouIntro(day)
      .then((res) => {
        if (!cancelled && res.text?.trim()) setText(res.text.trim());
      })
      .catch(() => {
        /* localized fallback stays on screen */
      });
    return () => {
      cancelled = true;
    };
  }, [props.guest, day, i18n.language]);
  return <p className="home-for-you-intro">{text || t("homeMoments.forYouFallback")}</p>;
}

function RecommendStrip(props: {
  circles: CircleListItem[];
  guest?: boolean;
  onOpen: (c: CircleListItem) => void;
  onFind: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="home-feed-block home-section-break" aria-label={t("homeMoments.forYou")}>
      <div className="home-section-head">
        <h2 className="home-section-title">{`✨ ${t("homeMoments.forYou")}`}</h2>
        <button type="button" className="home-section-link" onClick={props.onFind}>
          {t("homeFeed.seeAll")}
        </button>
      </div>
      <ForYouIntro guest={props.guest} />
      {props.circles.length === 0 ? (
        <div className="home-upcoming-empty">
          <p>{t("homeMoments.emptyRecommendTitle")}</p>
          <button type="button" className="primary" onClick={props.onFind}>
            {t("homeMoments.discoverActivities")}
          </button>
        </div>
      ) : (
      <div className="home-carousel">
        {props.circles.map((c) => (
          <button key={c.id} type="button" className="home-recommend-card" onClick={() => props.onOpen(c)}>
            <CirclePhoto circle={c} />
            <span className="home-recommend-body">
              <span className="home-recommend-name circle-title-wrap">
                {c.hobyIcon?.trim() ? <span aria-hidden>{c.hobyIcon.trim()} </span> : null}
                {circleDisplayTitle(c)}
              </span>
              {formatCircleLocationChip(c, t) ? (
                <span className="home-recommend-meta">{formatCircleLocationChip(c, t)}</span>
              ) : null}
              <span className="home-recommend-social">
                {`👥 ${t("homeFeed.memberCount", { count: c.memberCount })} · ${circleSignal(c, t)}`}
              </span>
              <span className="home-recommend-cta">{t("discoverPage.join")}</span>
            </span>
          </button>
        ))}
      </div>
      )}
    </section>
  );
}

function NewInterestDiscovery(props: {
  matches: NewInterestMatch[];
  onExplore: (slug: string) => void;
}) {
  const { t } = useTranslation();
  if (props.matches.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("homeNewInterests.title")}>
      <h2 className="home-section-title">{`✨ ${t("homeNewInterests.title")}`}</h2>
      <div className="home-carousel home-new-interest-carousel">
        {props.matches.map((match) => (
          <button
            key={match.hobby.id}
            type="button"
            className="home-new-interest-card"
            onClick={() => props.onExplore(match.hobby.slug)}
          >
            <span className="home-new-interest-top">
              <span className="home-new-interest-identity">
                <span className="home-new-interest-icon" aria-hidden>
                  {match.hobby.icon?.trim() || "✨"}
                </span>
                <span className="home-new-interest-name">{match.hobby.displayName}</span>
              </span>
              <span className="home-new-interest-match">
                {t("homeNewInterests.match", { score: match.score })}
              </span>
            </span>
            <span className="home-new-interest-reason">
              {match.reason === "interest" && match.relatedHobby
                ? t("homeNewInterests.relatedReason", {
                    hobby: match.relatedHobby,
                    name: match.hobby.displayName,
                  })
                : t(match.nearby ? "homeNewInterests.nearbyReason" : "homeNewInterests.newReason")}
            </span>
            {match.hobby.discoveryDescription?.trim() || match.hobby.shortDescription?.trim() ? (
              <span className="home-new-interest-description">
                {match.hobby.discoveryDescription?.trim() || match.hobby.shortDescription}
              </span>
            ) : null}
            {match.activeCircles > 0 || match.upcomingActivities > 0 ? (
              <span className="home-new-interest-opportunities">
                {match.activeCircles > 0 ? (
                  <span>
                    {match.nearby
                      ? t("homeNewInterests.activeNearby", { count: match.activeCircles })
                      : t("homeNewInterests.activeAvailable", { count: match.activeCircles })}
                  </span>
                ) : null}
                {match.upcomingActivities > 0 ? (
                  <span>
                    {t("homeNewInterests.upcomingActivities", { count: match.upcomingActivities })}
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className="home-new-interest-cta">
              {t("homeNewInterests.explore", { hobby: match.hobby.displayName })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Dashboard(props: {
  home: HomeResponse;
  onRefresh: () => Promise<void> | void;
  onGoCreateJoin: (prefillDateIso?: string) => void;
  onGoFindCircles: (prefillDateIso?: string, hobbySlug?: string) => void;
  /** Open a circle the user is not a member of (public catalog view). */
  onOpenCatalogCircle: (circleId: string) => void;
  onChooseHobbies: () => void;
  onOpenMessages: () => void;
  onBrowseHobby?: (hobbySlug: string) => void;
  onSeeAllActivities?: () => void;
  guest?: boolean;
  onRegisterRequest?: (notice?: string) => void;
  onBackToAuth?: () => void;
  guestWelcomeHeaderMenu?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [detailsCircleId, setDetailsCircleId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<"details" | "chat">("details");
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const [catalog, setCatalog] = useState<CircleListItem[] | null>(null);
  const [hobyCatalog, setHobyCatalog] = useState<Hoby[]>([]);
  const [hobyCatalogReady, setHobyCatalogReady] = useState(false);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const calendarSessions = props.home.calendarSessions ?? [];

  useEffect(() => {
    if (props.guest) {
      setMe(null);
      return;
    }
    void api.getMe().then(setMe).catch(() => setMe(null));
  }, [props.home, props.guest]);

  useEffect(() => {
    let cancelled = false;
    void api
      .listCircles()
      .then((list) => !cancelled && setCatalog(Array.isArray(list) ? list : []))
      .catch(() => !cancelled && setCatalog([]));
    void api
      .getCommunityPreview()
      .then((res) => !cancelled && setStats(res.stats))
      .catch(() => !cancelled && setStats(null));
    return () => {
      cancelled = true;
    };
  }, [props.home]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getHobiesSaved()
      .then((list) => {
        if (cancelled) return;
        setHobyCatalog(Array.isArray(list) ? list : []);
        setHobyCatalogReady(true);
      })
      .catch(() => {
        if (!cancelled) setHobyCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const hobbies = useMemo(() => hobbiesFromMe(me), [me]);
  const dayKey = todayKey();
  const rotationKey = `${dayKey}:${me?.id ?? "guest"}`;

  const feed = useMemo(
    () =>
      buildHomeFeed({
        catalog: catalog ?? [],
        sessions: calendarSessions,
        hobbies,
        hobyCatalog,
        city: me?.city ?? null,
        onlyCompleteHobbies: hobyCatalogReady,
        rotationKey,
      }),
    [catalog, calendarSessions, hobbies, hobyCatalog, hobyCatalogReady, me?.city, rotationKey],
  );
  const likedSlugs = useMemo(
    () => [
      ...new Set([
        ...hobbies.map((h) => h.slug),
        ...(catalog ?? []).filter((c) => c.isYours).map((c) => c.ritualType),
      ]),
    ],
    [hobbies, catalog],
  );

  if (detailsCircleId) {
    return (
      <CircleDetails
        circleId={detailsCircleId}
        initialTab={detailsTab}
        onBack={() => setDetailsCircleId(null)}
        onLeftCircle={async () => {
          await props.onRefresh();
          setDetailsCircleId(null);
        }}
      />
    );
  }

  if (
    shouldShowWelcomeTutorial(props.home, {
      guest: props.guest,
      meLoaded: props.guest || me != null,
      onboardingCompleted: me?.onboardingCompleted,
    })
  ) {
    return (
      <OnboardingFlow
        home={props.home}
        onRefresh={props.onRefresh}
        onGoCreateJoin={() => props.onGoCreateJoin()}
        onGoFindCircles={() => props.onGoFindCircles()}
        onBrowseHobby={props.onBrowseHobby}
        guest={props.guest}
        onRegisterRequest={props.onRegisterRequest}
        onBackToAuth={props.onBackToAuth}
        guestWelcomeHeaderMenu={props.guestWelcomeHeaderMenu}
      />
    );
  }

  function openMember(circleId: string, tab: "details" | "chat" = "details") {
    setDetailsTab(tab);
    setDetailsCircleId(circleId);
  }

  function openListed(c: CircleListItem, chat = false) {
    if (c.isYours) openMember(c.id, chat ? "chat" : "details");
    else props.onOpenCatalogCircle(c.id);
  }

  const openHobby = (slug: string) => props.onGoFindCircles(undefined, slug);
  const openDiscover = () => props.onGoFindCircles();
  const joinedUpcoming = getUpcomingSessions(calendarSessions).slice(0, 3);
  const featuredCircle = feed.recommended[0];
  const carouselPool = feed.recommended.filter((circle) => circle.id !== featuredCircle?.id);
  const featuredSlug = featuredCircle?.ritualType.trim().toLowerCase();
  const diverseCircles = [
    ...carouselPool.filter((circle) => circle.ritualType.trim().toLowerCase() !== featuredSlug),
    ...carouselPool.filter((circle) => circle.ritualType.trim().toLowerCase() === featuredSlug),
  ];
  if (diverseCircles.length === 0 && featuredCircle) diverseCircles.push(featuredCircle);
  const alreadyProposed = [
    ...likedSlugs,
    featuredCircle?.ritualType ?? "",
    ...diverseCircles.map((circle) => circle.ritualType),
  ];
  const newInterests = discoverNewInterests({
    hobbies: hobyCatalog,
    circles: catalog ?? [],
    selectedSlugs: alreadyProposed,
    city: me?.city ?? null,
    dayKey,
    limit: 2,
  });

  return (
    <div className="stack dashboard-home home-feed">
      <TodaysDiscovery
        hobies={hobyCatalog}
        userSlugs={hobbies.map((h) => h.slug)}
        circleSlugs={(catalog ?? []).filter((c) => c.isYours).map((c) => c.ritualType)}
        userId={me?.id ?? null}
        featuredCircle={featuredCircle}
        libraryCircles={[
          ...joinedUpcoming
            .map((session) => (catalog ?? []).find((circle) => circle.id === session.circleId))
            .filter((circle): circle is NonNullable<typeof circle> => Boolean(circle)),
          ...feed.recommended,
        ]}
        catalog={catalog ?? []}
        likedSlugs={likedSlugs}
        city={me?.city ?? null}
        stats={stats}
        onOpenCircle={(circle) => openListed(circle)}
        onExplore={openHobby}
      />

      <UpcomingStrip
        sessions={joinedUpcoming}
        circles={catalog ?? []}
        onOpen={(id) => openMember(id)}
        onSeeAll={() => props.onSeeAllActivities?.()}
        onFind={openDiscover}
      />

      {catalog === null ? (
        <section className="home-feed-block" aria-busy="true">
          <h2 className="home-section-title">{`✨ ${t("homeMoments.forYou")}`}</h2>
          <div className="home-carousel">
            <div className="home-recommend-card home-recommend-card--skeleton" />
            <div className="home-recommend-card home-recommend-card--skeleton" />
          </div>
        </section>
      ) : (
        <RecommendStrip
          circles={diverseCircles}
          guest={props.guest}
          onOpen={(c) => openListed(c)}
          onFind={openDiscover}
        />
      )}

      <NewInterestDiscovery
        matches={newInterests}
        onExplore={props.onBrowseHobby ?? openHobby}
      />
    </div>
  );
}
