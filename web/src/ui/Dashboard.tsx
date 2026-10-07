import React, { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, CommunityStats, HomeResponse, Hoby, UserMeResponse } from "../api/types";
import {
  dismissChecklist,
  getChecklistProgress,
  isChecklistDismissed,
  shouldShowChecklist,
  shouldShowWelcomeTutorial,
} from "../onboarding/onboardingState";
import { CircleDetails } from "./CircleDetails";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import { formatCircleLocationChip } from "./circleDetailsFormat";
import { hobbiesFromMe } from "./circleJoinHobby";
import { buildHomeFeed, MIN_VISIBLE_COUNT, socialStatusKey, type HomeUpcoming } from "./homeSections";
import { CommunityPulse, HobbyVisual, InterestCarousel } from "./HomeVisuals";
import { formatSessionDateTimeHero, sessionHobbySubtitle, sessionTitle } from "./homeDashboardUtils";
import { TodaysDiscovery } from "./TodaysDiscovery";
import { OnboardingChecklist } from "./onboarding/OnboardingChecklist";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";

function socialLine(t: TFunction, members: number, confirmed = false): string {
  if (confirmed) return t(socialStatusKey({ members, confirmed }));
  if (members >= MIN_VISIBLE_COUNT) return t("homeFeed.peopleJoinedLine", { count: members });
  return t(socialStatusKey({ members }));
}

function NextActivity(props: {
  upcoming: HomeUpcoming | undefined;
  onOpen: (circleId: string) => void;
  onFind: () => void;
  onExplore: () => void;
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
          <button type="button" onClick={props.onExplore}>
            {t("homeFeed.exploreCircles")}
          </button>
        </div>
      </section>
    );
  }
  const circleId = u.kind === "session" ? u.item.circleId : u.circle.id;
  const icon = u.kind === "session" ? u.item.hobyIcon : u.circle.hobyIcon;
  const title = u.kind === "session" ? sessionTitle(u.item) : circleDisplayTitle(u.circle);
  const hobbyLine = u.kind === "session" ? sessionHobbySubtitle(u.item) : circleHobbySubtitle(u.circle);
  const when =
    u.kind === "session" ? formatSessionDateTimeHero(u.item.session.dateTime) : t("homeFeed.readyToChooseDate");
  const place =
    u.kind === "session"
      ? u.item.session.locationOrLink
      : formatCircleLocationChip(u.circle, t);
  const members = u.kind === "session" ? (u.item.memberCount ?? 0) : u.circle.memberCount;
  const confirmed =
    u.kind === "session" &&
    (u.item.myAttendance?.status === "attending" || (u.item.attendingCount ?? 0) > 0);
  return (
    <section className="card home-next-compact" aria-label={t("homeFeed.yourNextActivity")}>
      <div className="home-next-compact-row">
        <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
          {icon?.trim() || "✨"}
        </span>
        <span className="home-next-compact-copy">
          <span className="home-next-compact-title circle-title-wrap">{title}</span>
          <span className="home-next-compact-meta">
            {hobbyLine ? `${hobbyLine} · ` : ""}
            {when}
            {place ? ` · ${place}` : ""}
            {` · ${socialLine(t, members, confirmed)}`}
          </span>
        </span>
        <button type="button" className="primary" onClick={() => props.onOpen(circleId)}>
          {t("homeFeed.openActivity")}
        </button>
      </div>
    </section>
  );
}

function RecommendStrip(props: {
  circles: CircleListItem[];
  onOpen: (c: CircleListItem) => void;
  onFind: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  if (props.circles.length === 0) {
    return (
      <section className="home-feed-block" aria-label={t("discoverPage.recommendedForYou")}>
        <h2 className="home-section-title">{t("discoverPage.recommendedForYou")}</h2>
        <button type="button" className="home-recommend-card home-recommend-card--invite" onClick={props.onCreate}>
          <HobbyVisual slug="invite" icon="🌱" size="sm" />
          <span className="home-recommend-body">
            <span className="home-recommend-name">{t("homeFeed.inviteCardTitle")}</span>
            <span className="home-recommend-blurb">{t("homeFeed.inviteCardBody")}</span>
            <span className="home-recommend-cta">{t("homeFeed.startCircleCta")}</span>
          </span>
        </button>
      </section>
    );
  }
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
            <HobbyVisual slug={c.ritualType} icon={c.hobyIcon} size="sm" />
            <span className="home-recommend-body">
              <span className="home-recommend-name circle-title-wrap">{circleDisplayTitle(c)}</span>
              {circleHobbySubtitle(c) ? (
                <span className="home-recommend-meta">{circleHobbySubtitle(c)}</span>
              ) : null}
              <span className="home-recommend-meta">{formatCircleLocationChip(c, t)}</span>
              <span className="home-recommend-social">{socialLine(t, c.memberCount)}</span>
              <span className="home-recommend-cta">{t("homeFeed.viewCircle")}</span>
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
  const [checklistDismissed, setChecklistDismissed] = useState(() => isChecklistDismissed());
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
      .getHobies()
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

  const checklistProgress = useMemo(
    () => getChecklistProgress(props.home, me?.userHobies ?? []),
    [props.home, me?.userHobies],
  );

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

  function guard(action: () => void) {
    if (props.guest) {
      props.onRegisterRequest?.(t("guest.noticeDefault"));
      return;
    }
    action();
  }

  return (
    <div className="stack dashboard-home home-feed">
      {shouldShowChecklist(checklistProgress, checklistDismissed) ? (
        <OnboardingChecklist
          progress={checklistProgress}
          onDismiss={() => {
            dismissChecklist();
            setChecklistDismissed(true);
          }}
        />
      ) : null}

      <TodaysDiscovery
        hobies={hobyCatalog}
        userSlugs={hobbies.map((h) => h.slug)}
        circleSlugs={(catalog ?? []).filter((c) => c.isYours).map((c) => c.ritualType)}
        userId={me?.id ?? null}
        onExplore={openHobby}
      />

      <NextActivity
        upcoming={nextActivity}
        onOpen={(id) => openMember(id)}
        onFind={openDiscover}
        onExplore={openDiscover}
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
          circles={feed.recommended}
          onOpen={(c) => openListed(c)}
          onFind={openDiscover}
          onCreate={() => guard(() => props.onGoCreateJoin())}
        />
      )}

      <CommunityPulse stats={stats} groupsForming={feed.groupsForming} />

      <section className="home-feed-block" aria-label={t("homeFeed.quickActions")}>
        <h2 className="home-section-title">{t("homeFeed.quickActions")}</h2>
        <div className="home-quick-grid">
          <button type="button" className="home-quick-btn" onClick={() => guard(() => props.onGoCreateJoin())}>
            <span aria-hidden>＋</span>
            {t("homeFeed.quickCreate")}
          </button>
          <button type="button" className="home-quick-btn" onClick={openDiscover}>
            <span aria-hidden>🔍</span>
            {t("homeFeed.quickDiscover")}
          </button>
          <button
            type="button"
            className="home-quick-btn"
            onClick={() => {
              if (!props.guest && hobbies.length === 0) props.onChooseHobbies();
              else document.getElementById("home-hobbies")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span aria-hidden>🎯</span>
            {t("homeFeed.quickHobbies")}
          </button>
          <button type="button" className="home-quick-btn" onClick={() => guard(props.onOpenMessages)}>
            <span aria-hidden>💬</span>
            {t("homeFeed.quickMessages")}
          </button>
        </div>
      </section>

      <div id="home-hobbies">
        <InterestCarousel interests={feed.interests} onPick={props.onBrowseHobby ?? openHobby} />
      </div>
    </div>
  );
}
