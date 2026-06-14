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

    if (!canJoin) {
      return {
        label: "Add hobby to join",
        busy: false,
        disabled: false,
        secondary: true,
        onJoin: () => openDetails(c),
      };
    }

    if (c.inviteOnly === false) {
      return {
        label: "Join",
        busy: joining,
        disabled: busy,
        onJoin: () => void joinOpenCircle(c.id),
      };
    }

    return {
      label: "Request to join",
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
          label: "Open",
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
          label: "Manage",
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
          ← Discover Circles
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
              joinLabel={joinAction?.label === "Join" ? "Join this circle" : joinAction?.label}
              joinDisabled={joinAction?.disabled}
              joinBusy={joinAction?.busy}
              onJoin={joinAction?.onJoin}
            />
            {!userHasJoinableHobbyForCircle(userHobies, c, hobies) ? (
              <>
                {joinHobbyBlockedHint(userHobies, c, hobies) ? (
                  <div className="muted" style={{ fontSize: "0.92em" }}>
                    {joinHobbyBlockedHint(userHobies, c, hobies)}
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
            <div className="hoby-browse-toggle discover-page-tabs" role="tablist" aria-label="Circles views">
              <button
                type="button"
                role="tab"
                className={pageTab === "discover" ? "is-active" : ""}
                aria-selected={pageTab === "discover"}
                onClick={() => setPageTab("discover")}
              >
                Discover Circles
              </button>
              <button
                type="button"
                role="tab"
                className={pageTab === "mine" ? "is-active" : ""}
                aria-selected={pageTab === "mine"}
                onClick={() => setPageTab("mine")}
              >
                Show my circles
              </button>
              <button
                type="button"
                role="tab"
                className={pageTab === "joined" ? "is-active" : ""}
                aria-selected={pageTab === "joined"}
                onClick={() => setPageTab("joined")}
              >
                Circles I'm in
              </button>
            </div>
          </div>
          <p className="discover-subtitle muted">
            {pageTab === "discover"
              ? "Find people who enjoy the same things as you"
              : pageTab === "mine"
                ? "Circles you created and organize"
                : "Circles you joined as a member"}
          </p>
        </div>
        <div className="row discover-header-actions">
          <button type="button" className="primary" style={{ width: "auto" }} disabled={loading} onClick={() => openCreate()}>
            Create
          </button>
          <button style={{ width: "auto" }} onClick={props.onBack} disabled={loading}>
            Back
          </button>
        </div>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : pageTab === "mine" ? (
        <div className="stack discover-sections">
          {myCreatedCircles.length > 0 ? (
            <DiscoverSection title={`${myCreatedCircles.length} circle${myCreatedCircles.length === 1 ? "" : "s"}`}>
              <div className="discover-cards">{myCreatedCircles.map((c) => renderMyCircleCard(c))}</div>
            </DiscoverSection>
          ) : (
            <DiscoverEmptyState
              title="You haven't created a circle yet"
              message="Start one for your hobby — then invite people to join."
              actionLabel="Create a circle"
              onAction={() => openCreate()}
            />
          )}
        </div>
      ) : pageTab === "joined" ? (
        <div className="stack discover-sections">
          {myJoinedCircles.length > 0 ? (
            <DiscoverSection title={`${myJoinedCircles.length} circle${myJoinedCircles.length === 1 ? "" : "s"}`}>
              <div className="discover-cards">{myJoinedCircles.map((c) => renderJoinedCircleCard(c))}</div>
            </DiscoverSection>
          ) : (
            <DiscoverEmptyState
              title="You're not in any circles yet"
              message="Discover circles and join one that fits your hobby."
              actionLabel="Discover circles"
              onAction={() => setPageTab("discover")}
            />
          )}
        </div>
      ) : props.prefilterDateIso ? (
        <div className="stack discover-sections">
          <div className="discover-date-banner stack">
            <p className="discover-date-banner-label muted">Showing circles for</p>
            <p className="discover-date-banner-date">{formatMeetDateLabel(props.prefilterDateIso)}</p>
          </div>

          {datePrefilterResults.length > 0 ? (
            <DiscoverSection title={`${datePrefilterResults.length} circle${datePrefilterResults.length === 1 ? "" : "s"} this day`}>
              <div className="discover-cards">{datePrefilterResults.map((c) => renderDiscoverCard(c))}</div>
            </DiscoverSection>
          ) : (
            <DiscoverEmptyState
              title="No circles found for this day"
              message="Be the first — start something on a day that works for you."
              actionLabel="Create your own circle"
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
              placeholder="Search by hobby (tennis, chess, walking...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loading}
              aria-label="Search circles"
            />

            <DiscoverFiltersCollapsible
              expanded={filtersExpanded}
              onToggle={() => setFiltersExpanded((v) => !v)}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
              disabled={loading}
            >
              <DiscoverFilterChips
                label="Hobby"
                value={filterHobby}
                disabled={loading}
                options={[
                  { value: "", label: "All" },
                  ...hobies.map((h) => ({
                    value: h.slug,
                    label: (h.icon ? `${h.icon} ` : "") + h.displayName,
                  })),
                ]}
                onChange={setFilterHobby}
              />
              <DiscoverFilterChips
                label="Level"
                value={filterLevel}
                disabled={loading}
                options={[
                  { value: "", label: "Any" },
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                ]}
                onChange={setFilterLevel}
              />
              <DiscoverFilterChips
                label="Time"
                value={filterTime}
                disabled={loading}
                options={[
                  { value: "", label: "Any" },
                  { value: "morning", label: "Morning" },
                  { value: "evening", label: "Evening" },
                  { value: "weekend", label: "Weekend" },
                ]}
                onChange={setFilterTime}
              />
              <DiscoverFilterChips
                label="Size"
                value={filterSize}
                disabled={loading}
                options={[
                  { value: "", label: "Any" },
                  { value: "small", label: "1–3" },
                  { value: "growing", label: "4–5" },
                ]}
                onChange={setFilterSize}
              />
            </DiscoverFiltersCollapsible>
          </div>

          {hasActiveFilters ? (
            searchResults.length > 0 ? (
              <DiscoverSection title="Results">
                <div className="discover-cards">{searchResults.map((c) => renderDiscoverCard(c))}</div>
              </DiscoverSection>
            ) : (
              <DiscoverEmptyState
                title="No circles found 😔"
                message="Try changing filters or create your own!"
                actionLabel="Create circle"
                onAction={() => openCreate()}
              />
            )
          ) : joinableCircles.length === 0 ? (
            <DiscoverEmptyState
              title="No circles available yet"
              actionLabel="Create a circle"
              onAction={() => openCreate()}
            />
          ) : (
            <>
              {recommended.length > 0 ? (
                <DiscoverSection title="Recommended for you" subtitle="We think you'll enjoy this">
                  <div className="discover-cards">
                    {recommended.map((c) => renderDiscoverCard(c))}
                  </div>
                </DiscoverSection>
              ) : (
                <DiscoverSectionHint
                  title="We're still learning your preferences"
                  message="Explore circles below 👇"
                />
              )}

              {nearYou.length > 0 ? (
                <DiscoverSection
                  title="Near you"
                  subtitle="Circles happening close to your location"
                >
                  <div className="discover-cards">
                    {nearYou.map((c) => renderDiscoverCard(c))}
                  </div>
                </DiscoverSection>
              ) : null}

              <DiscoverSection title="Browse by interest">
                <DiscoverInterestChips
                  value={interestFilter}
                  onChange={(v) => setInterestFilter(v as InterestCategoryId)}
                  disabled={loading}
                  categories={interestCategories}
                />
              </DiscoverSection>

              <DiscoverSection title="All circles">
                {allCircles.length > 0 ? (
                  <div className="discover-cards">
                    {allCircles.map((c) => renderDiscoverCard(c))}
                  </div>
                ) : (
                  <DiscoverEmptyState
                    title="No circles in this category"
                    message="Try another interest or create your own circle."
                    actionLabel="Create a circle"
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
