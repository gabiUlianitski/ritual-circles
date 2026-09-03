import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getAuthToken, setAuthToken } from "../api/client";
import type { HomeResponse } from "../api/types";
import { isGuestMode, setGuestMode } from "../guestMode";
import i18n from "../i18n";
import { hasAnyNotifications } from "../notificationsFeed";
import { AppLanguageSelect } from "./AppLanguageSelect";
import { shouldShowWelcomeTutorial } from "../onboarding/onboardingState";
import { Notifications } from "./Notifications";
import { FormError } from "./FormError";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { CreateJoinCircle } from "./CreateJoinCircle";
import { Profile } from "./Profile";
import { Hobies } from "./Hobies";
import { Circles } from "./Circles";
import { GuestRegisterPrompt } from "./GuestRegisterPrompt";

type AppStage = "login" | "dashboard" | "createJoin" | "profile" | "hobies" | "circles" | "notifications";

/** Guests have no account, so Home is empty without calling the API. */
const GUEST_HOME: HomeResponse = {
  circle: null,
  nextSession: null,
  myAttendance: null,
  myCircles: [],
  calendarSessions: [],
};

export type CirclesDeepLink = { circleId: string; initialTab: "details" | "chat" };

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

function IconCircles() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

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
  const [guest, setGuest] = useState(() => !getAuthToken() && isGuestMode());
  const [guestNotice, setGuestNotice] = useState<string | null>(null);
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  const [stage, setStage] = useState<AppStage>(
    getAuthToken() || (!getAuthToken() && isGuestMode()) ? "dashboard" : "login",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [circlesDeepLink, setCirclesDeepLink] = useState<CirclesDeepLink | null>(null);
  const [circlesVisitKey, setCirclesVisitKey] = useState(0);
  const [discoverDateFilter, setDiscoverDateFilter] = useState<string | null>(null);
  const [createMeetDate, setCreateMeetDate] = useState<string | null>(null);
  const [returnStageAfterNotif, setReturnStageAfterNotif] = useState<AppStage>("dashboard");
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
    setGuestMode(false);
    setGuest(false);
    setGuestNotice(null);
    setGuestGateOpen(false);
    setStage("dashboard");
    await refresh();
  }

  function startGuest() {
    setGuestMode(true);
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

  function dismissGuestGate() {
    setGuestGateOpen(false);
    setGuestNotice(null);
  }

  function logout() {
    setAuthToken(null);
    setGuestMode(false);
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
    if (s === "circles") setCirclesVisitKey((k) => k + 1);
    setStage(s);
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

  return (
    <div className="app">
      <div className="row app-header-row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="h1" style={{ marginBottom: 0 }}>
          {t("nav.appTitle")}
        </div>
        <div className="header-toolbar">
          {stage !== "login" ? (
            <>
            {!onboardingMode ? (
            <>
            <button
              type="button"
              className={`icon-btn${stage === "dashboard" ? " is-active" : ""}`}
              aria-label={t("nav.home")}
              aria-current={stage === "dashboard" ? "page" : undefined}
              disabled={loading}
              title={t("nav.home")}
              onClick={() => navigate("dashboard")}
            >
              <IconHome />
            </button>
            <button
              type="button"
              className={`icon-btn${stage === "circles" ? " is-active" : ""}`}
              aria-label={t("nav.discoverCircles")}
              aria-current={stage === "circles" ? "page" : undefined}
              disabled={loading}
              title={t("nav.discoverCircles")}
              onClick={() => navigate("circles")}
            >
              <IconCircles />
            </button>
            </>
            ) : null}
            {!onboardingMode && !guest ? (
            <>
            <button
              type="button"
              className={`icon-btn${stage === "profile" ? " is-active" : ""}`}
              aria-label={t("nav.profile")}
              aria-current={stage === "profile" ? "page" : undefined}
              disabled={loading}
              title={t("nav.profile")}
              onClick={() => navigate("profile")}
            >
              <IconProfile />
            </button>
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
                      if (guest) goToRegister(t("guest.noticeCreateAccount"));
                      else logout();
                    }}
                    disabled={loading}
                  >
                    {guest ? t("guest.createAccount") : t("nav.logout")}
                  </button>
                </div>
              ) : null}
            </div>
            </>
          ) : null}
        </div>
      </div>

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
          initialMode={guestNotice ? "register" : "login"}
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
        <Profile onBack={() => navigate("dashboard")} onLogout={logout} />
      ) : stage === "hobies" ? (
        <Hobies onBack={() => navigate("dashboard")} />
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
      ) : stage === "circles" ? (
        <Circles
          onBack={() => {
            setDiscoverDateFilter(null);
            setCirclesDeepLink(null);
            navigate("dashboard");
          }}
          onHomeRefresh={refresh}
          deepLink={circlesDeepLink}
          onDeepLinkConsumed={() => setCirclesDeepLink(null)}
          visitKey={circlesVisitKey}
          prefilterDateIso={discoverDateFilter}
          guest={guest}
          onRegisterRequest={requestRegister}
        />
      ) : stage === "createJoin" ? (
        <CreateJoinCircle
          initialTab="create"
          initialMeetDate={createMeetDate ?? undefined}
          onBack={() => {
            setCreateMeetDate(null);
            navigate("dashboard");
          }}
          onDone={async () => {
            setCreateMeetDate(null);
            await refresh();
            navigate("dashboard");
          }}
        />
      ) : home === null ? (
        <div className="card muted">{t("common.loading")}</div>
      ) : (
        <Dashboard
          home={home}
          onRefresh={refresh}
          guest={guest}
          onRegisterRequest={requestRegister}
          onGoCreateJoin={(dateIso) => {
            if (guest) {
              requestRegister(t("guest.noticeCreateCircle"));
              return;
            }
            setCreateMeetDate(dateIso ?? null);
            navigate("createJoin");
          }}
          onGoFindCircles={(dateIso) => {
            setDiscoverDateFilter(dateIso ?? null);
            setCirclesVisitKey((k) => k + 1);
            navigate("circles");
          }}
          userFirstName={userFirstName}
        />
      )}
    </div>
  );
}
