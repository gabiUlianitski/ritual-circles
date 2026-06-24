import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { CircleListItem, Hoby, UserMeResponse } from "../api/types";
import { AddCircleHobbyForm } from "./AddCircleHobbyForm";
import { CircleDetails } from "./CircleDetails";
import { CircleDetailsPrimaryAction, CircleDetailsSummary } from "./CircleDetailsSummary";
import { CreateJoinCircle } from "./CreateJoinCircle";
import { hobbiesFromMe, joinHobbyBlockedHint, userHasJoinableHobbyForCircle } from "./circleJoinHobby";
import {
  applyDiscoverFilters,
  filterCirclesByMeetDate,
  formatMeetDateLabel,
  getAllDiscoverCircles,
  getNearYouCircles,
  getRecommendedCircles,
  getInterestCategories,
  buildHobyInterestLookup,
  userHasLocationData,
  type DiscoverLevelFilter,
  type DiscoverSizeFilter,
  type DiscoverTimeFilter,
  type InterestCategoryId,
} from "./circleDiscover";
import { isCircleJoinable } from "./circleParticipation";
import {
  DiscoverCircleCard,
  DiscoverEmptyState,
  DiscoverFilterChips,
  DiscoverFiltersCollapsible,
  DiscoverInterestChips,
  DiscoverSection,
  DiscoverSectionHint,
} from "./DiscoverCircleCard";
import { FormError } from "./FormError";

type CirclesDeepLink = { circleId: string; initialTab: "details" | "chat" };
type DiscoverPageTab = "discover" | "mine" | "joined";

export function Circles(props: {
  onBack: () => void;
  onHomeRefresh: () => Promise<void> | void;
  deepLink?: CirclesDeepLink | null;
  onDeepLinkConsumed?: () => void;
  visitKey?: number;
  /** When set, show circles matching this calendar day (from Home empty-day action). */
  prefilterDateIso?: string | null;
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
  const [detailsInitialTab, setDetailsInitialTab] = useState<"details" | "chat">("details");
  const [catalogDetail, setCatalogDetail] = useState<CircleListItem | null>(null);
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filterHobby, setFilterHobby] = useState("");
  const [filterLevel, setFilterLevel] = useState<DiscoverLevelFilter>("");
  const [filterTime, setFilterTime] = useState<DiscoverTimeFilter>("");
  const [filterSize, setFilterSize] = useState<DiscoverSizeFilter>("");
  const [interestFilter, setInterestFilter] = useState<InterestCategoryId>("");
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [me, setMe] = useState<UserMeResponse | null>(null);
  const [pageTab, setPageTab] = useState<DiscoverPageTab>("discover");

  const userHobies = useMemo(() => hobbiesFromMe(me), [me]);
  const userCity = me?.city ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let err: string | null = null;
    try {
      const [list, profile] = await Promise.all([api.listCircles(), api.getMe()]);
      setCatalog(Array.isArray(list) ? list : []);
      setMe(profile);
    } catch (e) {
      err = String(e);
      setCatalog([]);
      setMe(null);
    }
    if (err) setError(err);
    setLoading(false);
  }, []);

  const interestCategories = useMemo(() => getInterestCategories(t), [t, i18n.language]);

  useEffect(() => {
    void load();
  }, [load, props.visitKey, i18n.language]);

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
        if (!cancelled) setHobies(Array.isArray(list) ? list : []);
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
    setCatalogDetail(null);
    setShowForm(false);
    setDetailsCircleId(link.circleId);
    setDetailsInitialTab(link.initialTab);
    setShowDetails(true);
    props.onDeepLinkConsumed?.();
  }, [props.deepLink]);

  const catalogSorted = useMemo(() => {
    return [...catalog].sort((a, b) => Number(b.isYours) - Number(a.isYours));
  }, [catalog]);

  const recommended = useMemo(
    () => getRecommendedCircles(catalogSorted, userHobies, userCity),
    [catalogSorted, userHobies, userCity],
  );

  const nearYou = useMemo(
    () => (userHasLocationData(userCity) ? getNearYouCircles(catalogSorted, userCity) : []),
    [catalogSorted, userCity],
  );

  const hobyInterestLookup = useMemo(() => buildHobyInterestLookup(hobies), [hobies]);

  const allCircles = useMemo(
    () => getAllDiscoverCircles(catalogSorted, interestFilter, hobyInterestLookup),
    [catalogSorted, interestFilter, hobyInterestLookup],
  );

  const joinableCircles = useMemo(
    () => catalogSorted.filter((c) => !c.isYours),
    [catalogSorted],
  );

  const myCreatedCircles = useMemo(
    () => catalogSorted.filter((c) => c.isCreator),
    [catalogSorted],
  );

  const myJoinedCircles = useMemo(
    () => catalogSorted.filter((c) => c.isYours && !c.isCreator),
    [catalogSorted],
  );

  const searchResults = useMemo(
    () =>
      applyDiscoverFilters(catalogSorted.filter((c) => !c.isYours), {
        query: searchQuery,
        hobbySlug: filterHobby,
        level: filterLevel,
        time: filterTime,
        size: filterSize,
        meetDateIso: props.prefilterDateIso ?? undefined,
      }),
    [catalogSorted, searchQuery, filterHobby, filterLevel, filterTime, filterSize, props.prefilterDateIso],
  );

  const datePrefilterResults = useMemo(() => {
    if (!props.prefilterDateIso) return [];
    return filterCirclesByMeetDate(joinableCircles, props.prefilterDateIso);
  }, [joinableCircles, props.prefilterDateIso]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || filterHobby || filterLevel || filterTime || filterSize || props.prefilterDateIso,
  );

  async function afterCreateOrJoin() {
    setShowForm(false);
    setFormInitialTab("create");
    setFormInitialMeetDate(undefined);
    await load();
    await props.onHomeRefresh();
  }

  async function joinOpenCircle(circleId: string) {
    setJoinBusyId(circleId);
    setError(null);
    try {
      await api.joinCircleOpen(circleId);
      setCatalogDetail(null);
      await load();
      await props.onHomeRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setJoinBusyId(null);
    }
  }

  async function refreshProfile() {
    try {
      setMe(await api.getMe());
    } catch {
      setMe(null);
    }
  }

  function openCreate(dateIso?: string) {
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
    const canJoin = userHasJoinableHobbyForCircle(userHobies, c, hobies);

    if (!isCircleJoinable(c.memberCount, c.maxSize)) {
      return {
        label: t("circleDetails.full"),
        busy: false,
        disabled: true,
        secondary: true,
        onJoin: () => {},
      };
    }

    if (!canJoin) {
      return {
        label: t("discoverPage.addHobbyToJoin"),
        busy: false,
        disabled: false,
        secondary: true,
        onJoin: () => openDetails(c),
      };
    }

    if (c.inviteOnly === false) {
      return {
        label: t("discoverPage.join"),
        busy: joining,
        disabled: busy,
        onJoin: () => void joinOpenCircle(c.id),
      };
    }

    return {
      label: t("discoverPage.requestJoin"),
      busy: joining,
      disabled: busy,
      onJoin: () => {
        setCatalogDetail(null);
        setFormInitialTab("join");
        setShowForm(true);
      },
    };
  }

  function renderJoinedCircleCard(c: CircleListItem) {
    return (
      <DiscoverCircleCard
        key={c.id}
        circle={c}
        onPress={() => openDetails(c)}
        joinAction={{
          label: t("discoverPage.open"),
          secondary: true,
          onJoin: () => openDetails(c),
        }}
      />
    );
  }

  function renderMyCircleCard(c: CircleListItem) {
    return (
      <DiscoverCircleCard
        key={c.id}
        circle={c}
        onPress={() => openDetails(c)}
        joinAction={{
          label: t("discoverPage.manage"),
          secondary: true,
          onJoin: () => openDetails(c),
        }}
      />
    );
  }

  function renderDiscoverCard(c: CircleListItem) {
    return (
      <DiscoverCircleCard
        key={c.id}
        circle={c}
        onPress={() => openDetails(c)}
        joinAction={joinActionFor(c)}
      />
    );
  }

  function clearFilters() {
    setSearchQuery("");
    setFilterHobby("");
    setFilterLevel("");
    setFilterTime("");
    setFilterSize("");
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
        onDone={async () => {
          await afterCreateOrJoin();
        }}
      />
    );
  }

  if (showDetails && detailsCircleId) {
    return (
      <CircleDetails
        circleId={detailsCircleId}
        initialTab={detailsInitialTab}
        onBack={() => {
          setShowDetails(false);
          setDetailsCircleId(null);
          setDetailsInitialTab("details");
        }}
        onLeftCircle={async () => {
          await props.onHomeRefresh();
          setShowDetails(false);
          setDetailsCircleId(null);
          setDetailsInitialTab("details");
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
        />

        {!c.isYours ? (
          <>
            <CircleDetailsPrimaryAction
              isMember={false}
              joinLabel={joinAction?.label === t("discoverPage.join") ? t("discoverPage.joinThisCircle") : joinAction?.label}
              joinDisabled={joinAction?.disabled}
              joinBusy={joinAction?.busy}
              onJoin={joinAction?.onJoin}
            />
            {!userHasJoinableHobbyForCircle(userHobies, c, hobies) ? (
              <>
                {joinHobbyBlockedHint(userHobies, c, hobies, t) ? (
                  <div className="muted" style={{ fontSize: "0.92em" }}>
                    {joinHobbyBlockedHint(userHobies, c, hobies, t)}
                  </div>
                ) : null}
                <AddCircleHobbyForm
                  circle={c}
                  hobies={hobies}
                  savedHobbies={userHobies}
                  onCancel={() => setCatalogDetail(null)}
                  onSaved={async () => {
                    await refreshProfile();
                  }}
                />
              </>
            ) : null}
          </>
        ) : null}

        {error ? <FormError>{error}</FormError> : null}
      </div>
    );
  }

  return (
    <div className="card stack discover-page">
      <div className="discover-header row">
        <div className="discover-header-text">
          <div className="discover-header-title-row row">
            <div className="hoby-browse-toggle discover-page-tabs" role="tablist" aria-label={t("discoverPage.tabListAria")}>
              <button
                type="button"
                role="tab"
                className={pageTab === "discover" ? "is-active" : ""}
                aria-selected={pageTab === "discover"}
                onClick={() => setPageTab("discover")}
              >
                {t("discoverPage.tabDiscover")}
              </button>
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
          <p className="discover-subtitle muted">
            {pageTab === "discover"
              ? t("discoverPage.subtitleDiscover")
              : pageTab === "mine"
                ? t("discoverPage.subtitleMine")
                : t("discoverPage.subtitleJoined")}
          </p>
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
              onAction={() => setPageTab("discover")}
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
              onAction={() => openCreate(props.prefilterDateIso)}
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

            <DiscoverFiltersCollapsible
              expanded={filtersExpanded}
              onToggle={() => setFiltersExpanded((v) => !v)}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
              disabled={loading}
            >
              <DiscoverFilterChips
                label={t("discoverPage.filterHobby")}
                value={filterHobby}
                disabled={loading}
                options={[
                  { value: "", label: t("discoverPage.filterAll") },
                  ...hobies.map((h) => ({
                    value: h.slug,
                    label: (h.icon ? `${h.icon} ` : "") + h.displayName,
                  })),
                ]}
                onChange={setFilterHobby}
              />
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
            </DiscoverFiltersCollapsible>
          </div>

          {hasActiveFilters ? (
            searchResults.length > 0 ? (
              <DiscoverSection title={t("discoverPage.results")}>
                <div className="discover-cards">{searchResults.map((c) => renderDiscoverCard(c))}</div>
              </DiscoverSection>
            ) : (
              <DiscoverEmptyState
                title={t("discoverPage.noResultsTitle")}
                message={t("discoverPage.noResultsMessage")}
                actionLabel={t("discoverPage.createCircleShort")}
                onAction={() => openCreate()}
              />
            )
          ) : joinableCircles.length === 0 ? (
            <DiscoverEmptyState
              title={t("discoverPage.noCirclesTitle")}
              actionLabel={t("discoverPage.createCircle")}
              onAction={() => openCreate()}
            />
          ) : (
            <>
              {recommended.length > 0 ? (
                <DiscoverSection title={t("discoverPage.recommendedTitle")} subtitle={t("discoverPage.recommendedSubtitle")}>
                  <div className="discover-cards">
                    {recommended.map((c) => renderDiscoverCard(c))}
                  </div>
                </DiscoverSection>
              ) : (
                <DiscoverSectionHint
                  title={t("discoverPage.learningPrefsTitle")}
                  message={t("discoverPage.learningPrefsMessage")}
                />
              )}

              {nearYou.length > 0 ? (
                <DiscoverSection
                  title={t("discoverPage.nearYouTitle")}
                  subtitle={t("discoverPage.nearYouSubtitle")}
                >
                  <div className="discover-cards">
                    {nearYou.map((c) => renderDiscoverCard(c))}
                  </div>
                </DiscoverSection>
              ) : null}

              <DiscoverSection title={t("discoverPage.browseInterest")}>
                <DiscoverInterestChips
                  value={interestFilter}
                  onChange={(v) => setInterestFilter(v as InterestCategoryId)}
                  disabled={loading}
                  categories={interestCategories}
                />
              </DiscoverSection>

              <DiscoverSection title={t("discoverPage.allCircles")}>
                {allCircles.length > 0 ? (
                  <div className="discover-cards">
                    {allCircles.map((c) => renderDiscoverCard(c))}
                  </div>
                ) : (
                  <DiscoverEmptyState
                    title={t("discoverPage.noCategoryTitle")}
                    message={t("discoverPage.noCategoryMessage")}
                    actionLabel={t("discoverPage.createCircle")}
                    onAction={() => openCreate()}
                  />
                )}
              </DiscoverSection>
            </>
          )}
        </div>
      )}
    </div>
  );
}
