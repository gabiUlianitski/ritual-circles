import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, CommunityStats, HomeResponse, Hoby, UserMeResponse } from "../api/types";
import { discoveryImageUrl, scenePrompt } from "./homeDiscovery";
import {
  shouldShowWelcomeTutorial,
} from "../onboarding/onboardingState";
import { CircleDetails } from "./CircleDetails";
import { circleDisplayTitle } from "./circleDisplay";
import { formatCircleLocationChip } from "./circleDetailsFormat";
import { hobbiesFromMe } from "./circleJoinHobby";
import { buildHomeFeed, type HomeUpcoming } from "./homeSections";
import { circleActivityLabel, CommunityPulse, HobbyVisual, InterestCarousel, JoiningPulse } from "./HomeVisuals";
import { formatSessionDateTimeHero, sessionTitle } from "./homeDashboardUtils";
import { TodaysDiscovery } from "./TodaysDiscovery";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";

function NextActivity(props: {
  upcoming: HomeUpcoming | undefined;
  onOpen: (circleId: string) => void;
  onFind: () => void;
}) {
  const { t } = useTranslation();
  const u = props.upcoming;
  if (!u) {
    return (
      <section className="card home-next-empty" aria-label={t("homeFeed.nothingPlannedYet")}>
        <h2 className="home-next-compact-title">{t("homeFeed.nothingPlannedYet")}</h2>
        <p className="home-next-compact-meta">{t("homeFeed.nothingPlannedInvite")}</p>
        <div className="home-next-empty-actions">
          <button type="button" className="primary" onClick={props.onFind}>
            {t("homeFeed.findActivities")}
          </button>
        </div>
      </section>
    );
  }
  const circleId = u.kind === "session" ? u.item.circleId : u.circle.id;
  const icon = u.kind === "session" ? u.item.hobyIcon : u.circle.hobyIcon;
  const title = u.kind === "session" ? sessionTitle(u.item) : circleDisplayTitle(u.circle);
  const when =
    u.kind === "session" ? formatSessionDateTimeHero(u.item.session.dateTime) : t("homeFeed.readyToChooseDate");
  const members =
    u.kind === "session"
      ? (u.item.attendingCount ?? u.item.memberCount ?? 0)
      : u.circle.memberCount;
  return (
    <section className="card home-next-compact" aria-label={t("homeFeed.yourNextActivity")}>
      <div className="home-next-compact-row">
        <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
          {icon?.trim() || "✨"}
        </span>
        <span className="home-next-compact-copy">
          <span className="home-next-compact-title circle-title-wrap">{title}</span>
          <span className="home-next-compact-meta">
            {when}
            {` · ${t("homeFeed.participantCount", { count: members })}`}
          </span>
        </span>
        <button type="button" className="primary" onClick={() => props.onOpen(circleId)}>
          {t("homeFeed.openActivity")}
        </button>
      </div>
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

function RecommendStrip(props: {
  circles: CircleListItem[];
  onOpen: (c: CircleListItem) => void;
  onFind: () => void;
}) {
  const { t } = useTranslation();
  if (props.circles.length === 0) return null;
  return (
    <section className="home-feed-block" aria-label={t("discoverPage.recommendedForYou")}>
      <div className="home-section-head">
        <h2 className="home-section-title">{t("discoverPage.recommendedForYou")}</h2>
        <button type="button" className="home-section-link" onClick={props.onFind}>
          {t("homeFeed.seeAll")}
        </button>
      </div>
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
              <span className="home-recommend-social">{t("homeFeed.memberCount", { count: c.memberCount })}</span>
              {circleActivityLabel(c, t) ? (
                <span className="home-recommend-meta">{circleActivityLabel(c, t)}</span>
              ) : null}
              <span className="home-recommend-cta">{t("discoverPage.join")}</span>
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

  const feed = useMemo(
    () =>
      buildHomeFeed({
        catalog: catalog ?? [],
        sessions: calendarSessions,
        hobbies,
        hobyCatalog,
        city: me?.city ?? null,
        onlyCompleteHobbies: hobyCatalogReady,
      }),
    [catalog, calendarSessions, hobbies, hobyCatalog, hobyCatalogReady, me?.city],
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
  const nextActivity = feed.upcoming[0];
  const featuredCircle = feed.recommended[0];
  const carouselCircles =
    feed.recommended.length > 1 ? feed.recommended.slice(1) : feed.recommended;

  return (
    <div className="stack dashboard-home home-feed">
      <TodaysDiscovery
        hobies={hobyCatalog}
        userSlugs={hobbies.map((h) => h.slug)}
        circleSlugs={(catalog ?? []).filter((c) => c.isYours).map((c) => c.ritualType)}
        userId={me?.id ?? null}
        featuredCircle={featuredCircle}
        onOpenCircle={(circle) => openListed(circle)}
        onExplore={openHobby}
      />

      <NextActivity
        upcoming={nextActivity}
        onOpen={(id) => openMember(id)}
        onFind={openDiscover}
      />

      {catalog === null ? (
        <section className="home-feed-block" aria-busy="true">
          <h2 className="home-section-title">{t("discoverPage.recommendedForYou")}</h2>
          <div className="home-carousel">
            <div className="home-recommend-card home-recommend-card--skeleton" />
            <div className="home-recommend-card home-recommend-card--skeleton" />
          </div>
        </section>
      ) : (
        <RecommendStrip
          circles={carouselCircles}
          onOpen={(c) => openListed(c)}
          onFind={openDiscover}
        />
      )}

      <InterestCarousel interests={feed.interests} onPick={props.onBrowseHobby ?? openHobby} />

      <JoiningPulse circles={catalog ?? []} openCircles={feed.groupsForming} />

      <CommunityPulse stats={stats} groupsForming={feed.groupsForming} />
    </div>
  );
}
