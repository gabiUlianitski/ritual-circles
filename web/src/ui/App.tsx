import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getAuthToken, setAuthToken } from "../api/client";
import { resetDevUserId } from "../api/devUserId";
import type { HomeResponse } from "../api/types";
import i18n from "../i18n";
import { hasAnyNotifications } from "../notificationsFeed";
import { AppLanguageSelect } from "./AppLanguageSelect";
import { shouldShowWelcomeTutorial } from "../onboarding/onboardingState";
import { Notifications } from "./Notifications";
import { FormError } from "./FormError";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { CreateJoinCircle } from "./CreateJoinCircle";
import { Profile, type ProfileTab } from "./Profile";
import { ActivityPage } from "./ActivityPage";
import { Hobies } from "./Hobies";
import { Circles } from "./Circles";
import { GuestRegisterPrompt } from "./GuestRegisterPrompt";
import { HobbyDetailPage } from "./HobbyDetailPage";
import { WelcomePageMenu } from "./welcome/WelcomePageMenu";

type AppStage =
  | "login"
  | "dashboard"
  | "createJoin"
  | "profile"
  | "hobies"
  | "hobbyDetail"
  | "circles"
  | "myCircles"
  | "activity"
  | "notifications";

type NavItem = "home" | "discover" | "activity" | "circles" | "profile";

const NAV_ITEMS: { id: NavItem; icon: string; labelKey: string; stage: AppStage; needsAccount: boolean }[] = [
  { id: "home", icon: "🏠", labelKey: "nav.home", stage: "dashboard", needsAccount: false },
  { id: "discover", icon: "🔍", labelKey: "nav.discover", stage: "circles", needsAccount: false },
  { id: "activity", icon: "📅", labelKey: "nav.activity", stage: "activity", needsAccount: true },
  { id: "circles", icon: "👥", labelKey: "nav.circles", stage: "myCircles", needsAccount: true },
  { id: "profile", icon: "👤", labelKey: "nav.profile", stage: "profile", needsAccount: true },
];

function navItemForStage(stage: AppStage): NavItem | null {
  switch (stage) {
    case "dashboard":
      return "home";
    case "circles":
      return "discover";
    case "activity":
      return "activity";
    case "myCircles":
    case "createJoin":
      return "circles";
    case "profile":
    case "hobies":
    case "hobbyDetail":
      return "profile";
    default:
      return null;
  }
}

/** Guests have no account, so Home is empty without calling the API. */
const GUEST_HOME: HomeResponse = {
  circle: null,
  nextSession: null,
  myAttendance: null,
  myCircles: [],
  calendarSessions: [],
};

export type CirclesDeepLink = { circleId: string; initialTab: "details" | "chat"; justJoined?: boolean };

function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
}

export function App() {
  const { t } = useTranslation();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Guest browsing is per-visit: a reload always returns to sign in / register. */
  const [guest, setGuest] = useState(false);
  const [guestNotice, setGuestNotice] = useState<string | null>(null);
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  const [stage, setStage] = useState<AppStage>(getAuthToken() ? "dashboard" : "login");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [circlesDeepLink, setCirclesDeepLink] = useState<CirclesDeepLink | null>(null);
  const [circlesVisitKey, setCirclesVisitKey] = useState(0);
  const [discoverDateFilter, setDiscoverDateFilter] = useState<string | null>(null);
  const [discoverHobbyFilter, setDiscoverHobbyFilter] = useState<string | null>(null);
  const [guestHobbySlug, setGuestHobbySlug] = useState<string | null>(null);
  const [createHobby, setCreateHobby] = useState<{ slug: string; subtype: string | null; level: string | null } | null>(
    null,
  );
  const [createMeetDate, setCreateMeetDate] = useState<string | null>(null);
  const [returnStageAfterNotif, setReturnStageAfterNotif] = useState<AppStage>("dashboard");
  /** Bumped on every bottom-nav tap so the destination resets to its top level. */
  const [navVisitKey, setNavVisitKey] = useState(0);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const onboardingMode =
    home != null &&
    stage === "dashboard" &&
    shouldShowWelcomeTutorial(home, {
      guest,
      meLoaded: guest || myUserId != null,
      onboardingCompleted,
    });

  const guestWelcomeActive = Boolean(
    guest && stage === "dashboard" && home != null && onboardingMode,
  );

  const checkNotifications = useCallback(
    async (userId: string | null, homeCircleId: string | null | undefined) => {
      if (!userId) {
        setHasUnread(false);
        return;
      }
      try {
        setHasUnread(await hasAnyNotifications(userId, homeCircleId ?? null));
      } catch {
        setHasUnread(false);
      }
    },
    [],
  );

  async function refresh() {
    if (guest) {
      setHome(GUEST_HOME);
      setMyUserId(null);
      setUserFirstName(null);
      setOnboardingCompleted(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let nextHome: HomeResponse | null = null;
    let userId: string | null = myUserId;
    try {
      const [h, me] = await Promise.all([
        api.getHome(),
        api.getMe().catch(() => null),
      ]);
      nextHome = h;
      setHome(h);
      if (me) {
        userId = me.id;
        setMyUserId(me.id);
        setUserFirstName(me.first_name ?? null);
        setOnboardingCompleted(Boolean(me.onboardingCompleted));
      }
    } catch (e) {
      const msg = String(e);
      if (msg.startsWith("401") || msg.includes("Invalid token") || msg.includes("Missing auth")) {
        setAuthToken(null);
        setHome(null);
        setStage("login");
        setError(t("errors.sessionExpired"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
    if (userId && nextHome) {
      void checkNotifications(userId, nextHome.circle?.id);
    }
  }

  useEffect(() => {
    if (stage !== "login") void refresh();
  }, []);

  useEffect(() => {
    const onLang = () => {
      if (stage !== "login") void refresh();
    };
    i18n.on("languageChanged", onLang);
    return () => i18n.off("languageChanged", onLang);
  }, [stage]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        queueMicrotask(() => menuButtonRef.current?.focus());
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        queueMicrotask(() => menuButtonRef.current?.focus());
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (stage === "login" || guest) {
      setMyUserId(null);
      return;
    }
    void api
      .getMe()
      .then((me) => setMyUserId(me.id))
      .catch(() => setMyUserId(null));
  }, [stage, guest]);

  useEffect(() => {
    if (stage === "login") {
      setHasUnread(false);
      return;
    }
    void checkNotifications(myUserId, home?.circle?.id);

    const id = window.setInterval(() => {
      void checkNotifications(myUserId, home?.circle?.id);
    }, 5_000);

    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void checkNotifications(myUserId, home?.circle?.id);
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [stage, myUserId, home?.circle?.id, checkNotifications]);

  async function authed() {
    setGuest(false);
    setGuestNotice(null);
    setGuestGateOpen(false);
    setStage("dashboard");
    await refresh();
  }

  function startGuest() {
    setGuest(true);
    setGuestNotice(null);
    setGuestGateOpen(false);
    setError(null);
    setHome(GUEST_HOME);
    setStage("dashboard");
  }

  /** Guest tried something that needs an account (join, create, save interests). */
  function requestRegister(notice?: string) {
    setMenuOpen(false);
    setGuestNotice(notice ?? t("guest.noticeDefault"));
    setGuestGateOpen(true);
  }

  function goToRegister(notice?: string) {
    setMenuOpen(false);
    setGuestGateOpen(false);
    setGuestNotice(notice ?? t("guest.noticeDefault"));
    setStage("login");
  }

  /** Guest chose to leave browsing and pick sign in / register themselves. */
  function goToAuth() {
    setMenuOpen(false);
    setGuestGateOpen(false);
    setGuestNotice(null);
    setStage("login");
  }

  function dismissGuestGate() {
    setGuestGateOpen(false);
    setGuestNotice(null);
  }

  function logout() {
    setAuthToken(null);
    resetDevUserId();
    setGuest(false);
    setGuestNotice(null);
    setGuestGateOpen(false);
    setHome(null);
    setError(null);
    setMenuOpen(false);
    setHasUnread(false);
    setMyUserId(null);
    setCirclesDeepLink(null);
    setOnboardingCompleted(false);
    setStage("login");
  }

  /** Navigate without moving focus to the Menu button (use for header icons). */
  function navigate(s: AppStage) {
    setMenuOpen(false);
    if (s === "circles" || s === "myCircles") setCirclesVisitKey((k) => k + 1);
    if (s !== "profile") setProfileInitialTab(undefined);
    setStage(s);
  }

  function navigateFromBottomNav(item: (typeof NAV_ITEMS)[number]) {
    if (guest && item.needsAccount) {
      requestRegister(t("guest.noticeDefault"));
      return;
    }
    if (item.stage === "circles") {
      setDiscoverDateFilter(null);
      setDiscoverHobbyFilter(null);
    }
    setCirclesDeepLink(null);
    setNavVisitKey((k) => k + 1);
    navigate(item.stage);
  }

  function openDiscoverCircle(circleId: string) {
    setDiscoverDateFilter(null);
    setDiscoverHobbyFilter(null);
    setCirclesDeepLink({ circleId, initialTab: "details" });
    navigate("circles");
  }

  /** Used from Menu: close menu and return focus to Menu. */
  function navigateFromMenu(s: AppStage) {
    setMenuOpen(false);
    setStage(s);
    queueMicrotask(() => menuButtonRef.current?.focus());
  }

  function openNotifications() {
    setMenuOpen(false);
    if (stage !== "notifications") {
      setReturnStageAfterNotif(stage === "login" ? "dashboard" : stage);
    }
    void checkNotifications(myUserId, home?.circle?.id);
    setStage("notifications");
  }

  function openCircleFromNotification(circleId: string, initialTab: "details" | "chat") {
    setCirclesDeepLink({ circleId, initialTab });
    setCirclesVisitKey((k) => k + 1);
    setStage("circles");
    void checkNotifications(myUserId, home?.circle?.id);
  }

  const showBottomNav = stage !== "login" && !guestWelcomeActive && !onboardingMode;
  const activeNav = navItemForStage(stage);
  const showGreeting = stage === "dashboard" && !onboardingMode;

  return (
    <div
      className={`app${stage === "login" || guestWelcomeActive ? " app--login" : ""}${
        (stage === "dashboard" || stage === "circles" || stage === "myCircles" || stage === "activity") &&
        !guestWelcomeActive
          ? " app--home"
          : ""
      }${showBottomNav ? " app--with-bottom-nav" : ""}`}
    >
      {stage !== "login" && !guestWelcomeActive ? (
      <div className="row app-header-row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        {showGreeting ? (
          <header className="app-greeting">
            <h1 className="home-welcome-greeting">
              {userFirstName?.trim()
                ? t("homeFeed.greetingName", { name: userFirstName.trim() })
                : t("homeFeed.greeting")}
            </h1>
            <p className="home-welcome-context muted">{t("homeFeed.greetingSubline")}</p>
          </header>
        ) : (
          <div className="h1" style={{ marginBottom: 0 }}>
            {t("nav.appTitle")}
          </div>
        )}
        <div className="header-toolbar">
            {!onboardingMode && !guest ? (
            <>
            <button
              type="button"
              className={`icon-btn icon-btn-notif${stage === "notifications" ? " is-active" : ""}`}
              aria-label={hasUnread ? t("nav.notificationsUnread") : t("nav.notifications")}
              aria-current={stage === "notifications" ? "page" : undefined}
              disabled={loading}
              title={hasUnread ? t("nav.notificationsNew") : t("nav.notifications")}
              onClick={() => openNotifications()}
            >
              <IconBell />
              {hasUnread ? <span className="notif-dot" aria-hidden /> : null}
            </button>
            </>
          ) : null}
            <div className="app-header-wrap" ref={menuRef}>
              <button
                ref={menuButtonRef}
                type="button"
                className="app-menu-trigger"
                style={{ width: "auto" }}
                aria-expanded={menuOpen}
                aria-controls="app-nav-menu"
                aria-haspopup="true"
                onClick={() => setMenuOpen((o) => !o)}
                disabled={loading}
              >
                {t("nav.menu")}
              </button>
              {menuOpen ? (
                <div id="app-nav-menu" className="app-nav-dropdown stack" role="menu" aria-label={t("nav.moreOptions")}>
                  <AppLanguageSelect variant="menu" disabled={loading} />
                  {!guest ? (
                    <button type="button" className="app-nav-item" role="menuitem" onClick={() => navigateFromMenu("hobies")}>
                      {t("nav.hobbies")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={guest ? "app-nav-item" : "app-nav-item danger"}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      if (guest) goToAuth();
                      else logout();
                    }}
                    disabled={loading}
                  >
                    {guest ? t("guest.signInOrRegister") : t("nav.logout")}
                  </button>
                </div>
              ) : null}
            </div>
        </div>
      </div>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      {guestGateOpen && guestNotice ? (
        <GuestRegisterPrompt
          message={guestNotice}
          onConfirm={() => goToRegister(guestNotice)}
          onDismiss={dismissGuestGate}
        />
      ) : null}

      {stage === "login" ? (
        <Login
          googleClientId={(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()}
          onAuthed={async () => {
            await authed();
          }}
          loading={loading}
          notice={guestNotice}
          initialMode={guestNotice ? "register" : undefined}
          onGuest={startGuest}
          onKeepLooking={
            guest
              ? () => {
                  setGuestNotice(null);
                  setGuestGateOpen(false);
                  setStage("dashboard");
                }
              : undefined
          }
        />
      ) : stage === "profile" ? (
        <Profile
          key={`profile-${navVisitKey}-${profileInitialTab ?? ""}`}
          initialTab={profileInitialTab}
          onBack={() => navigate("dashboard")}
          onLogout={logout}
          onOpenHobby={(slug) => {
            setGuestHobbySlug(slug);
            navigate("hobbyDetail");
          }}
        />
      ) : stage === "hobies" ? (
        <Hobies onBack={() => navigate("dashboard")} />
      ) : stage === "hobbyDetail" && guestHobbySlug ? (
        <HobbyDetailPage
          slug={guestHobbySlug}
          onBack={() => {
            setGuestHobbySlug(null);
            setProfileInitialTab("hobbies");
            setStage("profile");
          }}
          onInterestRemoved={() => {
            setGuestHobbySlug(null);
            setProfileInitialTab("hobbies");
            setStage("profile");
          }}
        />
      ) : stage === "notifications" ? (
        <Notifications
          myUserId={myUserId}
          homeCircleId={home?.circle?.id}
          onBack={async () => {
            await refresh();
            navigate(returnStageAfterNotif === "notifications" ? "dashboard" : returnStageAfterNotif);
          }}
          onOpenCircleChat={(circleId) => openCircleFromNotification(circleId, "chat")}
          onOpenCircleDetails={(circleId) => openCircleFromNotification(circleId, "details")}
          onInboxChanged={() => void checkNotifications(myUserId, home?.circle?.id)}
          onHomeRefresh={refresh}
        />
      ) : stage === "myCircles" ? (
        <Circles
          key={`mine-${navVisitKey}`}
          mode="mine"
          onBack={() => navigate("dashboard")}
          onOpenDiscover={() => navigate("circles")}
          onHomeRefresh={refresh}
          deepLink={circlesDeepLink}
          onDeepLinkConsumed={() => setCirclesDeepLink(null)}
          visitKey={circlesVisitKey}
          guest={guest}
          onRegisterRequest={requestRegister}
        />
      ) : stage === "activity" && home ? (
        <ActivityPage
          key={`activity-${navVisitKey}`}
          home={home}
          onRefresh={refresh}
          onGoCreateJoin={(dateIso) => {
            setCreateHobby(null);
            setCreateMeetDate(dateIso ?? null);
            navigate("createJoin");
          }}
          onGoFindCircles={(dateIso) => {
            setDiscoverDateFilter(dateIso ?? null);
            setDiscoverHobbyFilter(null);
            navigate("circles");
          }}
        />
      ) : stage === "circles" ? (
        <Circles
          key={`discover-${navVisitKey}`}
          mode="discover"
          onBack={() => {
            setDiscoverDateFilter(null);
            setDiscoverHobbyFilter(null);
            setCirclesDeepLink(null);
            navigate("dashboard");
          }}
          onHomeRefresh={refresh}
          deepLink={circlesDeepLink}
          onDeepLinkConsumed={() => setCirclesDeepLink(null)}
          visitKey={circlesVisitKey}
          prefilterDateIso={discoverDateFilter}
          prefilterHobbySlug={discoverHobbyFilter}
          guest={guest}
          onRegisterRequest={requestRegister}
        />
      ) : stage === "createJoin" ? (
        <CreateJoinCircle
          initialTab="create"
          initialMeetDate={createMeetDate ?? undefined}
          initialHobbySlug={createHobby?.slug}
          initialHobbySubtype={createHobby?.subtype}
          initialHobbyLevel={createHobby?.level}
          onBack={() => {
            setCreateMeetDate(null);
            navigate("dashboard");
          }}
          onDone={async (joinedCircleId) => {
            setCreateMeetDate(null);
            await refresh();
            if (joinedCircleId) {
              setCirclesDeepLink({ circleId: joinedCircleId, initialTab: "details", justJoined: true });
              setCirclesVisitKey((k) => k + 1);
              navigate("circles");
            } else {
              navigate("dashboard");
            }
          }}
        />
      ) : home === null ? (
        <div className="card muted">{t("common.loading")}</div>
      ) : (
        <Dashboard
          key={`home-${navVisitKey}`}
          home={home}
          onRefresh={refresh}
          onOpenCatalogCircle={openDiscoverCircle}
          onChooseHobbies={() => {
            setProfileInitialTab("hobbies");
            setStage("profile");
          }}
          onOpenMessages={() => navigate("myCircles")}
          guest={guest}
          onRegisterRequest={requestRegister}
          onBackToAuth={guest ? goToAuth : undefined}
          guestWelcomeHeaderMenu={
            guestWelcomeActive ? (
              <WelcomePageMenu
                menuOpen={menuOpen}
                onToggle={() => setMenuOpen((o) => !o)}
                onSignInOrRegister={goToAuth}
                disabled={loading}
                menuRef={menuRef}
                buttonRef={menuButtonRef}
              />
            ) : undefined
          }
          onGoCreateJoin={(dateIso) => {
            if (guest) {
              requestRegister(t("guest.noticeCreateCircle"));
              return;
            }
            setCreateHobby(null);
            setCreateMeetDate(dateIso ?? null);
            navigate("createJoin");
          }}
          onGoFindCircles={(dateIso, hobbySlug) => {
            setDiscoverDateFilter(dateIso ?? null);
            setDiscoverHobbyFilter(hobbySlug ?? null);
            setCirclesVisitKey((k) => k + 1);
            navigate("circles");
          }}
          onBrowseHobby={(slug) => {
            setDiscoverDateFilter(null);
            setDiscoverHobbyFilter(slug);
            setCirclesVisitKey((k) => k + 1);
            navigate("circles");
          }}
        />
      )}

      {showBottomNav ? (
        <nav className="bottom-nav" aria-label={t("nav.primary")}>
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`bottom-nav-item${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => navigateFromBottomNav(item)}
              >
                <span className="bottom-nav-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="bottom-nav-label">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
