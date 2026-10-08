import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, Hoby, UserMeResponse } from "../api/types";
import { CircleDetails } from "./CircleDetails";
import { CircleDetailsPrimaryAction, CircleDetailsSummary, CircleDetailsWhyJoin } from "./CircleDetailsSummary";
import { CircleMomentumNote, CircleProgressCard, circleMomentum, momentumRank } from "./CircleProgressCard";
import { DiscoverHobbyChips, DiscoverMomentumCard } from "./DiscoverMomentumCard";
import { CreateJoinCircle } from "./CreateJoinCircle";
import { hobbiesFromMe } from "./circleJoinHobby";
import {
  applyDiscoverFilters,
  filterCirclesByMeetDate,
  formatMeetDateLabel,
  scoreCircleForUser,
  type DiscoverLevelFilter,
  type DiscoverSizeFilter,
  type DiscoverTimeFilter,
} from "./circleDiscover";
import { isCircleJoinable } from "./circleParticipation";
import { DiscoverEmptyState, DiscoverFilterChips, DiscoverSection } from "./DiscoverCircleCard";
import { FormError } from "./FormError";
import { CircleJoinSuccess, hasSeenJoinSuccess, markJoinSuccessSeen } from "./CircleJoinSuccess";

type CirclesDeepLink = { circleId: string; initialTab: "details" | "chat" | "scheduled"; justJoined?: boolean };
type DiscoverPageTab = "discover" | "mine" | "joined";

const CLOSEST_LIMIT = 3;
const RECOMMENDED_LIMIT = 4;

export function Circles(props: {
  onBack: () => void;
  /** discover = browse joinable circles; mine = circles the user joined or created. */
  mode?: "discover" | "mine";
  onOpenDiscover?: () => void;
  onHomeRefresh: () => Promise<void> | void;
  deepLink?: CirclesDeepLink | null;
  onDeepLinkConsumed?: () => void;
  visitKey?: number;
  /** When set, show circles matching this calendar day (from Home empty-day action). */
  prefilterDateIso?: string | null;
  /** When set, pre-select this hobby in discover filters (from guest explore chips). */
  prefilterHobbySlug?: string | null;
  /** Guest = browsing without an account: read-only, join/create ask to register. */
  guest?: boolean;
  onRegisterRequest?: (notice?: string) => void;
}) {
  const { i18n, t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CircleListItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formInitialTab, setFormInitialTab] = useState<"create" | "join">("create");
  const [formInitialMeetDate, setFormInitialMeetDate] = useState<string | undefined>();
  const [showDetails, setShowDetails] = useState(false);
  const [detailsCircleId, setDetailsCircleId] = useState<string | null>(null);
  const [detailsInitialTab, setDetailsInitialTab] = useState<"details" | "chat" | "scheduled">("details");
  const [detailsInitialDraft, setDetailsInitialDraft] = useState<string | undefined>(undefined);
  const [joinSuccessCircleId, setJoinSuccessCircleId] = useState<string | null>(null);
  const [catalogDetail, setCatalogDetail] = useState<CircleListItem | null>(null);
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterHobby, setFilterHobby] = useState("");
  const [filterLevel, setFilterLevel] = useState<DiscoverLevelFilter>("");
  const [filterTime, setFilterTime] = useState<DiscoverTimeFilter>("");
  const [filterSize, setFilterSize] = useState<DiscoverSizeFilter>("");
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [hobbyListReady, setHobbyListReady] = useState(false);
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const mode = props.mode ?? "discover";
  const [pageTab, setPageTab] = useState<DiscoverPageTab>(mode === "mine" ? "joined" : "discover");

  const userHobies = useMemo(() => hobbiesFromMe(me), [me]);
  const userCity = me?.city ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let err: string | null = null;
    try {
      // Guests have no profile to load; the catalog is readable without an account.
      const [list, profile] = await Promise.all([
        api.listCircles(),
        props.guest ? Promise.resolve(null) : api.getMe(),
      ]);
      setCatalog(Array.isArray(list) ? list : []);
      setMe(profile);
    } catch (e) {
      err = String(e);
      setCatalog([]);
      setMe(null);
    }
    if (err) setError(err);
    setLoading(false);
  }, [props.guest]);

  useEffect(() => {
    void load();
  }, [load, props.visitKey, i18n.language]);

  useEffect(() => {
    setFilterHobby(props.prefilterHobbySlug ?? "");
  }, [props.prefilterHobbySlug, props.visitKey]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshProfile();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.getHobies();
        if (!cancelled) {
          setHobies(Array.isArray(list) ? list : []);
          setHobbyListReady(true);
        }
      } catch {
        if (!cancelled) setHobies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  useEffect(() => {
    const link = props.deepLink;
    if (!link) return;
    setShowForm(false);
    if (link.justJoined && !hasSeenJoinSuccess(me?.id ?? null, link.circleId)) {
      setCatalogDetail(null);
      setJoinSuccessCircleId(link.circleId);
      props.onDeepLinkConsumed?.();
      return;
    }
    if (link.initialTab === "details") {
      // Non-members can only see the public catalog view, so wait for the catalog.
      if (loading) return;
      const listed = catalog.find((c) => c.id === link.circleId);
      if (listed && !listed.isYours) {
        setShowDetails(false);
        setDetailsCircleId(null);
        setCatalogDetail(listed);
        props.onDeepLinkConsumed?.();
        return;
      }
    }
    setCatalogDetail(null);
    setDetailsCircleId(link.circleId);
    setDetailsInitialTab(link.initialTab);
    setShowDetails(true);
    props.onDeepLinkConsumed?.();
  }, [props.deepLink, me?.id, loading, catalog]);

  useEffect(() => {
    if (mode !== "mine" || loading) return;
    const joinedAny = catalog.some((c) => c.isYours && !c.isCreator);
    const createdAny = catalog.some((c) => c.isCreator);
    if (!joinedAny && createdAny) setPageTab("mine");
  }, [mode, loading, catalog]);

  const catalogSorted = useMemo(() => {
    return [...catalog].sort((a, b) => Number(b.isYours) - Number(a.isYours));
  }, [catalog]);

  const sortByMomentum = useCallback(
    (list: CircleListItem[]) =>
      list
        .map((c) => ({
          c,
          rank: momentumRank(circleMomentum(c.memberCount, c.maxSize, Boolean(c.nextSessionAt))),
          score: scoreCircleForUser(c, userHobies, userCity),
        }))
        .sort((a, b) => a.rank - b.rank || b.c.memberCount - a.c.memberCount || b.score - a.score)
        .map((x) => x.c),
    [userHobies, userCity],
  );

  const completeHobbySlugs = useMemo(
    () => new Set(hobies.map((h) => h.slug.trim().toLowerCase())),
    [hobies],
  );

  const joinableCircles = useMemo(
    () =>
      catalogSorted.filter(
        (c) =>
          !c.isYours &&
          (!hobbyListReady || completeHobbySlugs.has(c.ritualType.trim().toLowerCase())),
      ),
    [catalogSorted, completeHobbySlugs, hobbyListReady],
  );

  const myCreatedCircles = useMemo(
    () => catalogSorted.filter((c) => c.isCreator),
    [catalogSorted],
  );

  const myJoinedCircles = useMemo(
    () => catalogSorted.filter((c) => c.isYours && !c.isCreator),
    [catalogSorted],
  );

  const discoverResults = useMemo(
    () =>
      sortByMomentum(
        applyDiscoverFilters(joinableCircles, {
          query: searchQuery,
          hobbySlug: filterHobby,
          level: filterLevel,
          time: filterTime,
          size: filterSize,
        }),
      ),
    [joinableCircles, searchQuery, filterHobby, filterLevel, filterTime, filterSize, sortByMomentum],
  );

  const discoverSections = useMemo(() => {
    const fillPct = (c: CircleListItem) => c.memberCount / Math.max(1, c.maxSize);
    const closest = discoverResults
      .filter((c) => isCircleJoinable(c.memberCount, c.maxSize))
      .map((c) => ({ c, status: circleMomentum(c.memberCount, c.maxSize, Boolean(c.nextSessionAt)) }))
      .filter(({ status }) => status === "readyToSchedule" || status === "almostReady" || status === "growing")
      .sort((a, b) => momentumRank(a.status) - momentumRank(b.status) || fillPct(b.c) - fillPct(a.c))
      .slice(0, CLOSEST_LIMIT)
      .map(({ c }) => c);
    const taken = new Set(closest.map((c) => c.id));
    const recommended = discoverResults
      .filter((c) => !taken.has(c.id) && scoreCircleForUser(c, userHobies, userCity) > 0)
      .slice(0, RECOMMENDED_LIMIT);
    for (const c of recommended) taken.add(c.id);
    const rest = discoverResults.filter((c) => !taken.has(c.id));
    return { closest, recommended, rest };
  }, [discoverResults, userHobies, userCity]);

  const datePrefilterResults = useMemo(() => {
    if (!props.prefilterDateIso) return [];
    return sortByMomentum(filterCirclesByMeetDate(joinableCircles, props.prefilterDateIso));
  }, [joinableCircles, props.prefilterDateIso, sortByMomentum]);

  const hobbyChips = useMemo(
    () => hobies.filter((h) => h.slug && h.displayName),
    [hobies],
  );
  const selectedHobbyStory = useMemo(() => {
    const slug = filterHobby.trim().toLowerCase();
    if (!slug) return "";
    const match = hobies.find((h) => h.slug.trim().toLowerCase() === slug);
    return match?.discoveryDescription?.trim() || "";
  }, [filterHobby, hobies]);

  const hasDetailFilters = Boolean(filterLevel || filterTime || filterSize);

  async function afterCreateOrJoin(joinedCircleId?: string) {
    setShowForm(false);
    setFormInitialTab("create");
    setFormInitialMeetDate(undefined);
    await load();
    await props.onHomeRefresh();
    if (joinedCircleId && !hasSeenJoinSuccess(me?.id ?? null, joinedCircleId)) {
      setJoinSuccessCircleId(joinedCircleId);
    }
  }

  async function openCreatedCircle(createdCircleId: string | null) {
    setShowForm(false);
    setFormInitialTab("create");
    setFormInitialMeetDate(undefined);
    await load();
    await props.onHomeRefresh();
    if (!createdCircleId) {
      setError(t("createCircle.missingId"));
      return;
    }
    setError(null);
    setCatalogDetail(null);
    setJoinSuccessCircleId(null);
    setDetailsCircleId(createdCircleId);
    setDetailsInitialTab("details");
    setDetailsInitialDraft(undefined);
    setShowDetails(true);
  }

  async function joinOpenCircle(circleId: string) {
    setJoinBusyId(circleId);
    setError(null);
    try {
      await api.joinCircleOpen(circleId);
      setCatalogDetail(null);
      await load();
      await props.onHomeRefresh();
      if (!hasSeenJoinSuccess(me?.id ?? null, circleId)) {
        setJoinSuccessCircleId(circleId);
      } else {
        setDetailsCircleId(circleId);
        setDetailsInitialTab("details");
        setShowDetails(true);
      }
    } catch {
      setError(t("circleDetails.joinFailed"));
    } finally {
      setJoinBusyId(null);
    }
  }

  async function refreshProfile() {
    if (props.guest) return;
    try {
      setMe(await api.getMe());
    } catch {
      setMe(null);
    }
  }

  function openCreate(dateIso?: string) {
    if (props.guest) {
      props.onRegisterRequest?.(t("guest.noticeCreateCircle"));
      return;
    }
    setFormInitialMeetDate(dateIso);
    setFormInitialTab("create");
    setShowForm(true);
  }

  function openDetails(c: CircleListItem) {
    if (c.isYours) {
      setCatalogDetail(null);
      setDetailsCircleId(c.id);
      setShowDetails(true);
      return;
    }
    setShowDetails(false);
    setDetailsCircleId(null);
    setCatalogDetail(c);
  }

  function joinActionFor(c: CircleListItem) {
    if (c.isYours) return null;

    const busy = joinBusyId !== null;
    const joining = joinBusyId === c.id;

    if (!isCircleJoinable(c.memberCount, c.maxSize)) {
      return {
        label: t("circleDetails.full"),
        busy: false,
        disabled: true,
        secondary: true,
        onJoin: () => {},
      };
    }

    if (c.inviteOnly) return null;

    if (props.guest) {
      return {
        label: t("guest.createAccountToJoin"),
        busy: false,
        disabled: false,
        onJoin: () => props.onRegisterRequest?.(t("guest.noticeJoin")),
      };
    }

    return {
      label: t("discoverPage.join"),
      busy: joining,
      disabled: busy,
      onJoin: () => void joinOpenCircle(c.id),
    };
  }

  function renderJoinedCircleCard(c: CircleListItem) {
    return (
      <DiscoverMomentumCard
        key={c.id}
        circle={c}
        hobiesCatalog={hobies}
        actionLabel={t("discoverPage.open")}
        onOpen={() => openDetails(c)}
      />
    );
  }

  function renderMyCircleCard(c: CircleListItem) {
    return (
      <DiscoverMomentumCard
        key={c.id}
        circle={c}
        hobiesCatalog={hobies}
        actionLabel={t("discoverPage.manage")}
        onOpen={() => openDetails(c)}
      />
    );
  }

  function renderDiscoverCard(c: CircleListItem, featured = false) {
    return (
      <DiscoverMomentumCard
        key={c.id}
        circle={c}
        hobiesCatalog={hobies}
        actionLabel={t("discoverPage.viewActivity")}
        onOpen={() => openDetails(c)}
        featured={featured}
      />
    );
  }

  if (showForm) {
    return (
      <CreateJoinCircle
        initialTab={formInitialTab}
        initialMeetDate={formInitialMeetDate}
        onBack={() => {
          setShowForm(false);
          setFormInitialTab("create");
          setFormInitialMeetDate(undefined);
        }}
        onDone={async (joinedCircleId) => {
          await afterCreateOrJoin(joinedCircleId);
        }}
        onCreated={openCreatedCircle}
        onOpenCircle={(circleId, tab) => {
          setShowForm(false);
          setFormInitialTab("create");
          setFormInitialMeetDate(undefined);
          void load();
          void props.onHomeRefresh();
          setError(null);
          setCatalogDetail(null);
          setJoinSuccessCircleId(null);
          setDetailsCircleId(circleId);
          setDetailsInitialTab(tab);
          setDetailsInitialDraft(undefined);
          setShowDetails(true);
        }}
      />
    );
  }

  if (joinSuccessCircleId) {
    return (
      <CircleJoinSuccess
        circleId={joinSuccessCircleId}
        onOpenChat={(prefillDraft) => {
          markJoinSuccessSeen(me?.id ?? null, joinSuccessCircleId);
          const cid = joinSuccessCircleId;
          setJoinSuccessCircleId(null);
          setDetailsCircleId(cid);
          setDetailsInitialTab("chat");
          setDetailsInitialDraft(prefillDraft);
          setShowDetails(true);
        }}
        onViewCircle={() => {
          markJoinSuccessSeen(me?.id ?? null, joinSuccessCircleId);
          const cid = joinSuccessCircleId;
          setJoinSuccessCircleId(null);
          setDetailsCircleId(cid);
          setDetailsInitialTab("details");
          setDetailsInitialDraft(undefined);
          setShowDetails(true);
        }}
        onClose={() => {
          markJoinSuccessSeen(me?.id ?? null, joinSuccessCircleId);
          setJoinSuccessCircleId(null);
        }}
      />
    );
  }

  if (showDetails && detailsCircleId) {
    return (
      <CircleDetails
        circleId={detailsCircleId}
        initialTab={detailsInitialTab}
        initialDraft={detailsInitialDraft}
        onBack={() => {
          setShowDetails(false);
          setDetailsCircleId(null);
          setDetailsInitialTab("details");
          setDetailsInitialDraft(undefined);
        }}
        onLeftCircle={async () => {
          await props.onHomeRefresh();
          setShowDetails(false);
          setDetailsCircleId(null);
          setDetailsInitialTab("details");
          setDetailsInitialDraft(undefined);
          await load();
        }}
      />
    );
  }

  if (catalogDetail) {
    const c = catalogDetail;
    const joinAction = joinActionFor(c);
    return (
      <div className="card stack circle-details-page">
        <button type="button" className="circle-details-back" onClick={() => setCatalogDetail(null)}>
          {t("discoverPage.backToDiscover")}
        </button>

        <CircleDetailsSummary
          circle={c}
          hobiesCatalog={hobies}
          memberCount={c.memberCount}
          maxSize={c.maxSize}
          hasNextSession={Boolean(c.nextSessionAt)}
        />
        <CircleProgressCard
          joined={c.memberCount}
          capacity={c.maxSize}
          hasNextSession={Boolean(c.nextSessionAt)}
        />
        <CircleMomentumNote
          joined={c.memberCount}
          capacity={c.maxSize}
          hasNextSession={Boolean(c.nextSessionAt)}
          viewerIsMember={c.isYours}
        />
        {!c.isYours && c.memberCount <= 1 ? (
          <p className="circle-momentum-message">{t("circleChat.visitorHelp")}</p>
        ) : null}

        {!c.isYours && joinAction ? (
          <CircleDetailsPrimaryAction
            isMember={false}
            joinLabel={joinAction.label === t("discoverPage.join") ? t("discoverPage.joinThisCircle") : joinAction.label}
            joinDisabled={joinAction.disabled}
            joinBusy={joinAction.busy}
            onJoin={joinAction.onJoin}
          />
        ) : null}
        {!c.isYours && !joinAction && c.inviteOnly ? (
          <p className="muted">{t("discoverPage.invitationOnlyHint")}</p>
        ) : null}
        {!c.isYours ? <CircleDetailsWhyJoin circle={c} hobiesCatalog={hobies} /> : null}

        {error ? <FormError>{error}</FormError> : null}
      </div>
    );
  }

  return (
    <div className="card stack discover-page">
      <div className="discover-header row">
        <div className="discover-header-text">
          {mode === "mine" ? (
          <div className="discover-header-title-row row">
            <div className="hoby-browse-toggle discover-page-tabs" role="tablist" aria-label={t("discoverPage.tabListAria")}>
              <button
                type="button"
                role="tab"
                className={pageTab === "mine" ? "is-active" : ""}
                aria-selected={pageTab === "mine"}
                onClick={() => setPageTab("mine")}
              >
                {t("discoverPage.tabMine")}
              </button>
              <button
                type="button"
                role="tab"
                className={pageTab === "joined" ? "is-active" : ""}
                aria-selected={pageTab === "joined"}
                onClick={() => setPageTab("joined")}
              >
                {t("discoverPage.tabJoined")}
              </button>
            </div>
          </div>
          ) : null}
          {pageTab === "discover" ? (
            <div className="discover-hero">
              <h1 className="discover-hero-title">{t("discoverPage.heroTitle")}</h1>
              <p className="discover-hero-subtitle">{t("discoverPage.heroSubtitle")}</p>
            </div>
          ) : (
            <p className="discover-subtitle muted">
              {pageTab === "mine" ? t("discoverPage.subtitleMine") : t("discoverPage.subtitleJoined")}
            </p>
          )}
        </div>
        <div className="row discover-header-actions">
          <button type="button" className="primary" style={{ width: "auto" }} disabled={loading} onClick={() => openCreate()}>
            {t("discoverPage.create")}
          </button>
          <button style={{ width: "auto" }} onClick={props.onBack} disabled={loading}>
            {t("common.back")}
          </button>
        </div>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      {loading ? (
        <div className="muted">{t("common.loading")}</div>
      ) : pageTab === "mine" ? (
        <div className="stack discover-sections">
          {myCreatedCircles.length > 0 ? (
            <DiscoverSection title={t("discoverPage.circleCount", { count: myCreatedCircles.length })}>
              <div className="discover-cards">{myCreatedCircles.map((c) => renderMyCircleCard(c))}</div>
            </DiscoverSection>
          ) : (
            <DiscoverEmptyState
              title={t("discoverPage.emptyMineTitle")}
              message={t("discoverPage.emptyMineMessage")}
              actionLabel={t("discoverPage.createCircle")}
              onAction={() => openCreate()}
            />
          )}
        </div>
      ) : pageTab === "joined" ? (
        <div className="stack discover-sections">
          {myJoinedCircles.length > 0 ? (
            <DiscoverSection title={t("discoverPage.circleCount", { count: myJoinedCircles.length })}>
              <div className="discover-cards">{myJoinedCircles.map((c) => renderJoinedCircleCard(c))}</div>
            </DiscoverSection>
          ) : (
            <DiscoverEmptyState
              title={t("discoverPage.emptyJoinedTitle")}
              message={t("discoverPage.emptyJoinedMessage")}
              actionLabel={t("discoverPage.discoverCirclesAction")}
              onAction={() => (props.onOpenDiscover ? props.onOpenDiscover() : setPageTab("discover"))}
            />
          )}
        </div>
      ) : props.prefilterDateIso ? (
        <div className="stack discover-sections">
          <div className="discover-date-banner stack">
            <p className="discover-date-banner-label muted">{t("discoverPage.showingFor")}</p>
            <p className="discover-date-banner-date">{formatMeetDateLabel(props.prefilterDateIso)}</p>
          </div>

          {datePrefilterResults.length > 0 ? (
            <DiscoverSection title={t("discoverPage.circlesThisDay", { count: datePrefilterResults.length })}>
              <div className="discover-cards">{datePrefilterResults.map((c) => renderDiscoverCard(c))}</div>
            </DiscoverSection>
          ) : (
            <DiscoverEmptyState
              title={t("discoverPage.noCirclesThisDayTitle")}
              message={t("discoverPage.noCirclesThisDayMessage")}
              actionLabel={t("discoverPage.createYourOwn")}
              onAction={() => openCreate(props.prefilterDateIso ?? undefined)}
            />
          )}
        </div>
      ) : (
        <div className="stack discover-sections">
          <div className="discover-search stack">
            <input
              type="search"
              className="discover-search-input"
              placeholder={t("discoverPage.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loading}
              aria-label={t("discoverPage.searchAria")}
            />

            <div className="discover-browse-row">
              <div className="discover-browse-interests">
                <DiscoverHobbyChips
                  hobies={hobbyChips}
                  value={filterHobby}
                  onChange={setFilterHobby}
                  disabled={loading}
                />
              </div>
              <button
                type="button"
                className="discover-filters-inline-toggle"
                aria-expanded={filtersOpen}
                disabled={loading}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <span>{t("discoverPage.filters")}</span>
                {hasDetailFilters ? (
                  <span className="discover-filters-dot" aria-label={t("discoverPage.filtersActive")} />
                ) : null}
                <span className="discover-filters-chevron" aria-hidden>
                  {filtersOpen ? "▾" : "▸"}
                </span>
              </button>
            </div>

            {selectedHobbyStory ? <p className="discover-hobby-story">{selectedHobbyStory}</p> : null}

            {filtersOpen ? (
              <div className="discover-filters-body stack">
                <DiscoverFilterChips
                  label={t("discoverPage.filterLevel")}
                  value={filterLevel}
                  disabled={loading}
                  options={[
                    { value: "", label: t("discoverPage.filterAny") },
                    { value: "beginner", label: t("discoverPage.filterBeginner") },
                    { value: "intermediate", label: t("discoverPage.filterIntermediate") },
                    { value: "advanced", label: t("discoverPage.filterAdvanced") },
                  ]}
                  onChange={setFilterLevel}
                />
                <DiscoverFilterChips
                  label={t("discoverPage.filterTime")}
                  value={filterTime}
                  disabled={loading}
                  options={[
                    { value: "", label: t("discoverPage.filterAny") },
                    { value: "morning", label: t("discoverPage.filterMorning") },
                    { value: "evening", label: t("discoverPage.filterEvening") },
                    { value: "weekend", label: t("discoverPage.filterWeekend") },
                  ]}
                  onChange={setFilterTime}
                />
                <DiscoverFilterChips
                  label={t("discoverPage.filterSize")}
                  value={filterSize}
                  disabled={loading}
                  options={[
                    { value: "", label: t("discoverPage.filterAny") },
                    { value: "small", label: t("discoverPage.filterSizeSmall") },
                    { value: "growing", label: t("discoverPage.filterSizeGrowing") },
                  ]}
                  onChange={setFilterSize}
                />
                {hasDetailFilters ? (
                  <button
                    type="button"
                    className="discover-filters-clear"
                    onClick={() => {
                      setFilterLevel("");
                      setFilterTime("");
                      setFilterSize("");
                    }}
                  >
                    {t("discoverPage.clearFilters")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {discoverResults.length > 0 ? (
            <>
              {discoverSections.closest.length > 0 ? (
                <DiscoverSection
                  title={t("discoverPage.closestTitle")}
                  subtitle={t("discoverPage.closestSubtitle")}
                >
                  <div className="discover-cards discover-cards--featured">
                    {discoverSections.closest.map((c) => renderDiscoverCard(c, true))}
                  </div>
                </DiscoverSection>
              ) : null}
              {discoverSections.recommended.length > 0 ? (
                <DiscoverSection title={t("discoverPage.recommendedForYou")}>
                  <div className="discover-cards">{discoverSections.recommended.map((c) => renderDiscoverCard(c))}</div>
                </DiscoverSection>
              ) : null}
              {discoverSections.rest.length > 0 ? (
                <DiscoverSection title={t("discoverPage.allActivities")}>
                  <div className="discover-cards">{discoverSections.rest.map((c) => renderDiscoverCard(c))}</div>
                </DiscoverSection>
              ) : null}
            </>
          ) : (
            <DiscoverEmptyState
              title={t("discoverPage.noMatchTitle")}
              message={t("discoverPage.noMatchMessage")}
              actionLabel={t("discoverPage.createCircleShort")}
              onAction={() => openCreate()}
            />
          )}
        </div>
      )}
    </div>
  );
}
