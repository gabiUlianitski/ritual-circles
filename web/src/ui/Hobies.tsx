import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type {
  GenerateInsightLibraryResponse,
  Hoby,
  HobyPrecheckResponse,
  HobyRegeneratePreview,
  HobyRegenField,
} from "../api/types";
import { CreateCircleGroupSizeStep } from "./CreateCircleGroupSizeStep";
import { FormError } from "./FormError";
import {
  DEFAULT_GROUP_SIZE,
  formatGroupSizeSummary,
  groupSizeStateFromPayload,
  toGroupSizePayload,
  validateGroupSize,
  type GroupSizeState,
} from "./groupSize";
import { hobbyAttention, hobbyHasHebrew, hobbyStatus, hobbyWasPrepared, stableCategory } from "./hobyCatalogue";
import {
  emptyManualRow,
  HobyManualMetadataEditor,
  rowsToLevelsPayload,
  rowsToLevelsPayloadWithKeys,
  rowsToTypesPayload,
  rowsToTypesPayloadWithKeys,
  type HobyManualRow,
} from "./hobyManualForm";
import { parseHobyLevelsFlat, parseHobyTypesNested } from "./hobyMetadata";

const REGEN_FIELDS: HobyRegenField[] = ["description", "icon", "category", "types", "levels", "groupSize"];

function friendlyError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/traceback|sql|asyncpg|secret|api.key/i.test(raw)) return fallback;
  const cleaned = raw.replace(/^\d{3}:\s*/, "").trim();
  if (!cleaned || cleaned.length > 240) return fallback;
  return cleaned;
}

function rowsFromHoby(h: Hoby): { types: HobyManualRow[]; levels: HobyManualRow[] } {
  return {
    types: parseHobyTypesNested(h.types).map((row) => ({
      id: row.key,
      label: row.label ?? row.key,
      description: row.description ?? "",
      icon: row.icon ?? "",
    })),
    levels: parseHobyLevelsFlat(h.levels).map((row) => ({
      id: String(row.key),
      label: row.label ?? String(row.key),
      description: row.description ?? "",
    })),
  };
}

export function Hobies(props: { onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "incomplete" | "archived">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [insightCounts, setInsightCounts] = useState<Record<string, number>>({});
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightNote, setInsightNote] = useState<string | null>(null);
  const [insightConfirm, setInsightConfirm] = useState(false);
  const [insightPreview, setInsightPreview] = useState<GenerateInsightLibraryResponse | null>(null);
  const [blockedSlugs, setBlockedSlugs] = useState<string[]>([]);
  const [translation, setTranslation] = useState<"all" | "en" | "he" | "missingHe">("all");
  const [screen, setScreen] = useState<"list" | "review" | "edit">("list");
  const [review, setReview] = useState<Hoby | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([
        api.getHobiesCanonical(),
        api.insightSummary().catch(() => ({ counts: [] })),
      ]);
      setHobies(list);
      setInsightCounts(Object.fromEntries(summary.counts.map((row) => [row.hobbyId, row.activeCount])));
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.loadError")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [i18n.language]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hobies.filter((h) => {
      if (q) {
        const hay = [h.displayName, h.canonicalDisplayName, h.heDisplayName, h.slug, h.shortDescription, h.canonicalShortDescription]
          .map((part) => (part ?? "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      if (category && stableCategory(h.interestCategory) !== category) return false;
      if (statusFilter !== "all" && hobbyStatus(h) !== statusFilter) return false;
      if (translation === "he" && !hobbyHasHebrew(h)) return false;
      if (translation === "missingHe" && hobbyHasHebrew(h)) return false;
      return true;
    });
  }, [hobies, query, category, statusFilter, translation]);

  const counts = useMemo(
    () => ({
      all: hobies.length,
      active: hobies.filter((h) => hobbyStatus(h) === "active").length,
      incomplete: hobies.filter((h) => hobbyStatus(h) === "incomplete").length,
      archived: hobies.filter((h) => hobbyStatus(h) === "archived").length,
    }),
    [hobies],
  );

  function toggleSelected(slug: string) {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug]));
  }

  async function runBulk(action: "delete" | "archive" | "regenerate", slugs = selected) {
    if (!slugs.length) return;
    setBulkBusy(true);
    setError(null);
    setBulkNote(null);
    try {
      const result = await api.bulkHobies({ action, slugs });
      setBlockedSlugs(action === "delete" ? result.blocked : []);
      if (action === "delete" && result.blocked.length) {
        setBulkNote(t("hobbiesPage.bulkBlocked", { count: result.blocked.length }));
      } else if (result.failed.length) {
        setBulkNote(t("hobbiesPage.bulkFailed", { count: result.failed.length }));
      }
      setSelected([]);
      await load();
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.bulkError")));
    } finally {
      setBulkBusy(false);
    }
  }

  function openEdit(slug: string) {
    setEditSlug(slug);
    setScreen("edit");
    setAddOpen(false);
  }

  const editing = hobies.find((h) => h.slug === editSlug) ?? null;
  const selectedHobby = selected.length === 1 ? hobies.find((h) => h.slug === selected[0]) : undefined;
  const selectedInsightCount = selectedHobby ? (insightCounts[selectedHobby.id] ?? 0) : 0;

  async function generateInsights() {
    if (!selectedHobby || insightBusy) return;
    setInsightConfirm(false);
    setInsightBusy(true);
    setError(null);
    setInsightNote(null);
    try {
      const result = await api.generateInsightLibrary(selectedHobby.id);
      setInsightCounts((prev) => ({ ...prev, [result.hobbyId]: result.activeCount }));
      setInsightNote(t("hobbiesPage.insightGenerated"));
      setInsightPreview(result);
    } catch (e) {
      setInsightNote(t("hobbiesPage.insightPreserved"));
      setError(friendlyError(e, t("hobbiesPage.insightFailed")));
    } finally {
      setInsightBusy(false);
    }
  }

  const insightTypeLabel = (type: string) => {
    if (type === "motivation") return t("hobbiesPage.insightTypeMotivation");
    if (type === "social_connection") return t("hobbiesPage.insightTypeSocial");
    if (type === "interesting_fact") return t("hobbiesPage.insightTypeFact");
    return t("hobbiesPage.insightTypeDiscovery");
  };
  const titleFor = (h: Hoby) => (i18n.language.startsWith("he") && h.heDisplayName?.trim() ? h.heDisplayName : h.displayName);

  return (
    <div className="stack hoby-cat">
      <button type="button" className="home-section-link hoby-cat-back" onClick={props.onBack}>
        {t("common.back")}
      </button>

      {screen === "list" ? (
        <>
          <header className="hoby-cat-header">
            <div>
              <h1>{t("hobbiesPage.catalogueTitle")}</h1>
              <p>{t("hobbiesPage.catalogueIntro")}</p>
            </div>
            <button type="button" className="primary hoby-cat-add" onClick={() => setAddOpen(true)}>
              {t("hobbiesPage.addHobby")}
            </button>
          </header>

          <div className="hoby-cat-summary">
            <Summary label={t("hobbiesPage.summaryAll")} value={counts.all} />
            <Summary label={t("hobbiesPage.statusActive")} value={counts.active} />
            <Summary label={t("hobbiesPage.statusAttention")} value={counts.incomplete} />
            <Summary label={t("hobbiesPage.statusArchived")} value={counts.archived} />
          </div>

          <div className="hoby-cat-tools">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("hobbiesPage.searchPlaceholder")}
              aria-label={t("hobbiesPage.searchAria")}
            />
            <div className="hoby-cat-filters">
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("hobbiesPage.filterCategory")}>
                <option value="">{t("hobbiesPage.allCategories")}</option>
                {(["sports", "arts", "games", "learning", "social"] as const).map((id) => (
                  <option key={id} value={id}>
                    {t(`interestCategories.${id}`)}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                aria-label={t("hobbiesPage.filterStatus")}
              >
                <option value="all">{t("hobbiesPage.allStatuses")}</option>
                <option value="active">{t("hobbiesPage.statusActive")}</option>
                <option value="incomplete">{t("hobbiesPage.statusAttention")}</option>
                <option value="archived">{t("hobbiesPage.statusArchived")}</option>
              </select>
              <select
                value={translation}
                onChange={(e) => setTranslation(e.target.value as typeof translation)}
                aria-label={t("hobbiesPage.filterTranslation")}
              >
                <option value="all">{t("hobbiesPage.allTranslations")}</option>
                <option value="en">{t("hobbiesPage.englishAvailable")}</option>
                <option value="he">{t("hobbiesPage.hebrewAvailable")}</option>
                <option value="missingHe">{t("hobbiesPage.hebrewMissing")}</option>
              </select>
            </div>
          </div>

          {error ? <FormError>{error}</FormError> : null}
          {loading ? <p className="muted">{t("common.loading")}</p> : null}
          {!loading && filtered.length === 0 ? <p className="muted">{t("hobbiesPage.noMatch")}</p> : null}

          {selected.length ? (
            <div className="hoby-cat-bulk" role="toolbar" aria-label={t("hobbiesPage.bulkActions")}>
              <span className="hoby-cat-bulk-count">{t("hobbiesPage.selectedCount", { count: selected.length })}</span>
              <div className="hoby-cat-bulk-actions">
                {selectedHobby ? (
                  <button
                    type="button"
                    className="hoby-cat-bulk-btn"
                    disabled={insightBusy}
                    onClick={() => setInsightConfirm(true)}
                  >
                    <span aria-hidden>✨ </span>
                    {insightBusy
                      ? t("hobbiesPage.generatingInsights")
                      : selectedInsightCount > 0
                        ? t("hobbiesPage.regenerate50")
                        : t("hobbiesPage.generate50")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="hoby-cat-bulk-btn"
                  disabled={bulkBusy}
                  onClick={() => {
                    if (window.confirm(t("hobbiesPage.bulkRegenerateConfirm"))) void runBulk("regenerate");
                  }}
                >
                  {t("hobbiesPage.bulkRegenerate")}
                </button>
                <button type="button" className="hoby-cat-bulk-btn" disabled={bulkBusy} onClick={() => void runBulk("archive")}>
                  {t("hobbiesPage.bulkArchive")}
                </button>
                <button type="button" className="hoby-cat-bulk-btn is-danger" disabled={bulkBusy} onClick={() => void runBulk("delete")}>
                  {t("hobbiesPage.bulkDelete")}
                </button>
              </div>
            </div>
          ) : null}
          {insightNote ? <p className="hoby-cat-insight-note">{insightNote}</p> : null}
          {bulkNote ? (
            <div className="hoby-cat-warning">
              <span>{bulkNote}</span>
              {blockedSlugs.length ? (
                <button type="button" className="hoby-cat-bulk-btn" disabled={bulkBusy} onClick={() => void runBulk("archive", blockedSlugs)}>
                  {t("hobbiesPage.archiveHobby")}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="hoby-cat-grid">
            {filtered.map((h) => {
              const status = hobbyStatus(h);
              const attention = status === "incomplete" ? hobbyAttention(h) : null;
              const cat = stableCategory(h.interestCategory);
              const badgeClass = status === "incomplete" ? " is-warning" : status === "archived" ? " is-archived" : "";
              const badgeLabel =
                status === "archived"
                  ? t("hobbiesPage.statusArchived")
                  : status === "incomplete"
                    ? t("hobbiesPage.statusAttention")
                    : t("hobbiesPage.statusActive");
              return (
                <article
                  key={h.id}
                  className={`hoby-cat-card${selected.includes(h.slug) ? " is-selected" : ""}${status === "incomplete" ? " is-incomplete" : ""}`}
                >
                  <label className="hoby-cat-select">
                    <input
                      type="checkbox"
                      checked={selected.includes(h.slug)}
                      onChange={() => toggleSelected(h.slug)}
                      aria-label={t("hobbiesPage.selectHobby", { name: titleFor(h) })}
                    />
                  </label>
                  <button type="button" className="hoby-cat-card-main" onClick={() => openEdit(h.slug)}>
                    <span className="hoby-cat-card-top">
                      <span className="hoby-cat-icon" aria-hidden>
                        {h.icon?.trim() || "✦"}
                      </span>
                      <span className="hoby-cat-card-id">
                        <span className="hoby-cat-name">{titleFor(h)}</span>
                        <span className="hoby-cat-slug">
                          {h.slug}
                          {cat ? ` · ${t(`interestCategories.${cat}`)}` : ""}
                        </span>
                      </span>
                      <span className={`hoby-cat-badge${badgeClass}`}>{badgeLabel}</span>
                    </span>
                    <span className="hoby-cat-desc">
                      {(i18n.language.startsWith("he")
                        ? h.heShortDescription || h.canonicalShortDescription || h.shortDescription
                        : h.canonicalShortDescription || h.shortDescription || t("hobbiesPage.noDescription")
                      )?.trim() || t("hobbiesPage.noDescription")}
                    </span>
                    {attention ? <span className="hoby-cat-gap">{t(`hobbiesPage.${attention}`)}</span> : null}
                    <span className="hoby-cat-facts">
                      <span>{t("hobbiesPage.typesCount", { count: parseHobyTypesNested(h.types).length })}</span>
                      <span>{t("hobbiesPage.levelsCount", { count: parseHobyLevelsFlat(h.levels).length })}</span>
                      <span
                        className={
                          (insightCounts[h.id] ?? 0) > 0 && (insightCounts[h.id] ?? 0) < 50
                            ? "hoby-cat-insight is-warning"
                            : "hoby-cat-insight"
                        }
                      >
                        {(insightCounts[h.id] ?? 0) <= 0
                          ? t("hobbiesPage.insightsNone")
                          : (insightCounts[h.id] ?? 0) >= 50
                            ? t("hobbiesPage.insightsReady", { count: insightCounts[h.id] })
                            : t("hobbiesPage.insightsPartial", { count: insightCounts[h.id] })}
                      </span>
                      <span>
                        {h.groupSize
                          ? t("hobbiesPage.groupFact", { summary: formatGroupSizeSummary(h.groupSize, t) })
                          : t("hobbiesPage.missingGroupSize")}
                      </span>
                    </span>
                    <span className="hoby-cat-lang">
                      {hobbyHasHebrew(h) ? t("hobbiesPage.hebrewAvailable") : t("hobbiesPage.hebrewMissing")}
                    </span>
                  </button>
                  <button type="button" className="hoby-cat-edit" onClick={() => openEdit(h.slug)}>
                    {t("hobbiesPage.edit")}
                  </button>
                </article>
              );
            })}
          </div>
          {insightConfirm && selectedHobby ? (
            <div className="hoby-insight-backdrop" role="presentation" onClick={() => setInsightConfirm(false)}>
              <div
                className="hoby-insight-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hoby-insight-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="hoby-insight-title">
                  {selectedInsightCount > 0 ? t("hobbiesPage.regenerateTitle") : t("hobbiesPage.generateTitle")}
                </h2>
                <p>
                  {selectedInsightCount > 0
                    ? t("hobbiesPage.regenerateMessage", { name: titleFor(selectedHobby) })
                    : t("hobbiesPage.generateMessage", { name: titleFor(selectedHobby) })}
                </p>
                <p className="hoby-insight-support">
                  {selectedInsightCount > 0 ? t("hobbiesPage.regenerateSupport") : t("hobbiesPage.generateSupport")}
                </p>
                <div className="hoby-insight-actions">
                  <button type="button" className="hoby-cat-bulk-btn" onClick={() => setInsightConfirm(false)}>
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className={selectedInsightCount > 0 ? "hoby-cat-bulk-btn is-danger" : "primary"}
                    onClick={() => void generateInsights()}
                  >
                    {selectedInsightCount > 0 ? t("hobbiesPage.generateAndReplace") : t("hobbiesPage.generate50")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {insightPreview ? (
            <div className="hoby-insight-backdrop" role="presentation" onClick={() => setInsightPreview(null)}>
              <div
                className="hoby-insight-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hoby-insight-preview-title"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="hoby-insight-preview-title">{insightPreview.hobbyName}</h2>
                <p>{t("hobbiesPage.insightPreviewCount", { count: insightPreview.activeCount })}</p>
                <p className="hoby-insight-support">{t("hobbiesPage.insightGenerated")}</p>
                <ul className="hoby-insight-preview">
                  {insightPreview.preview.map((item) => (
                    <li key={`${item.type}-${item.contentEn}`}>
                      <span>{insightTypeLabel(item.type)}</span>
                      {item.contentEn}
                    </li>
                  ))}
                </ul>
                <div className="hoby-insight-actions">
                  <button type="button" className="primary" onClick={() => setInsightPreview(null)}>
                    {t("common.close")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {screen === "review" && review ? (
        <HobbyReview
          hoby={review}
          prepared={hobbyWasPrepared(review)}
          onDone={() => {
            setReview(null);
            setScreen("list");
          }}
          onEdit={() => openEdit(review.slug)}
          onUpdated={(next) => {
            setReview(next);
            setHobies((prev) => prev.map((item) => (item.slug === next.slug ? { ...item, ...next } : item)));
          }}
        />
      ) : null}

      {screen === "edit" && editing ? (
        <HobbyEditor
          hoby={editing}
          onCancel={() => setScreen(review ? "review" : "list")}
          onSaved={(next) => {
            setHobies((prev) => prev.map((item) => (item.slug === next.slug ? next : item)));
            if (review?.slug === next.slug) setReview(next);
            setScreen("list");
          }}
          onPatched={(next) => {
            setHobies((prev) => prev.map((item) => (item.slug === next.slug ? next : item)));
            if (review?.slug === next.slug) setReview(next);
          }}
          onRemoved={() => {
            setHobies((prev) => prev.filter((item) => item.slug !== editing.slug));
            setSelected((prev) => prev.filter((slug) => slug !== editing.slug));
            setScreen("list");
          }}
        />
      ) : null}

      {addOpen ? (
        <AddHobbyDialog
          hobies={hobies}
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            setHobies((prev) => [...prev, created].sort((a, b) => a.displayName.localeCompare(b.displayName)));
            setReview(created);
            setScreen("review");
            setAddOpen(false);
            void load();
          }}
          onManualCreated={(created) => {
            setHobies((prev) => [...prev, created].sort((a, b) => a.displayName.localeCompare(b.displayName)));
            setAddOpen(false);
            openEdit(created.slug);
            void load();
          }}
          onOpenExisting={(slug) => openEdit(slug)}
        />
      ) : null}
    </div>
  );
}

function Summary(props: { label: string; value: number }) {
  return (
    <div className="hoby-cat-stat">
      <span className="hoby-cat-stat-value">{props.value}</span>
      <span className="hoby-cat-stat-label">{props.label}</span>
    </div>
  );
}

function hobbySuggestions(hobies: Hoby[], query: string): Hoby[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return hobies
    .map((hoby) => {
      const names = [hoby.canonicalDisplayName, hoby.displayName, hoby.heDisplayName, hoby.slug].filter(
        (part): part is string => Boolean(part?.trim()),
      );
      if (!names.some((part) => part.toLowerCase().includes(q))) return null;
      const starts = names.some((part) => part.toLowerCase().startsWith(q));
      return { hoby, starts, label: (hoby.canonicalDisplayName || hoby.displayName).toLowerCase() };
    })
    .filter((row): row is { hoby: Hoby; starts: boolean; label: string } => row != null)
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map((row) => row.hoby);
}

function AddHobbyDialog(props: {
  hobies: Hoby[];
  onClose: () => void;
  onCreated: (hoby: Hoby) => void;
  onManualCreated: (hoby: Hoby) => void;
  onOpenExisting: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [step, setStep] = useState<"form" | "generating" | "failed">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<HobyPrecheckResponse | null>(null);
  const [typeRows, setTypeRows] = useState<HobyManualRow[]>([emptyManualRow()]);
  const [levelRows, setLevelRows] = useState<HobyManualRow[]>([emptyManualRow()]);
  const [groupSize, setGroupSize] = useState<GroupSizeState>(DEFAULT_GROUP_SIZE);
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [category, setCategory] = useState("");
  const suggestions = useMemo(() => hobbySuggestions(props.hobies, name), [props.hobies, name]);
  const exact = props.hobies.find((hoby) =>
    [hoby.canonicalDisplayName, hoby.displayName, hoby.heDisplayName].some(
      (part) => part?.trim().toLowerCase() === name.trim().toLowerCase(),
    ),
  );

  function chooseSuggestion(hoby: Hoby) {
    setName(hoby.canonicalDisplayName || hoby.displayName);
    setSuggestOpen(false);
    setPrecheck(null);
  }

  async function generate() {
    const dn = name.trim();
    if (!dn) {
      setError(t("hobbiesPage.errNameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setPrecheck(null);
    try {
      const check = await api.precheckNewHoby({ displayName: dn });
      if (check.blockedReason) {
        setPrecheck(check);
        return;
      }
      setStep("generating");
      const created = await api.createHoby(
        manual || !useAI
          ? {
              displayName: dn,
              shortDescription: description.trim() || null,
              icon: icon.trim() || null,
              interestCategory: category || null,
              levels: rowsToLevelsPayload(levelRows) ?? [],
              types: rowsToTypesPayload(typeRows) ?? [],
              groupSize: toGroupSizePayload(groupSize),
            }
          : { displayName: dn },
      );
      props.onCreated(created);
    } catch {
      setStep("failed");
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  async function createManually() {
    const dn = name.trim();
    if (!dn) {
      setError(t("hobbiesPage.errNameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createHoby({ displayName: dn, levels: [], types: [] });
      props.onManualCreated(created);
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.saveError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="add-hoby-title">
      <div className="hoby-cat-modal-card">
        <h2 id="add-hoby-title">{t("hobbiesPage.addTitle")}</h2>
        {step === "generating" ? (
          <p className="hoby-cat-progress">{t("hobbiesPage.preparing", { name: name.trim() })}</p>
        ) : (
          <p>{manual ? t("hobbiesPage.manualIntro") : t("hobbiesPage.addIntro")}</p>
        )}
        {step !== "generating" ? (
          <div className="hoby-cat-field">
            <label htmlFor="add-hoby-name">{t("hobbiesPage.hobbyName")}</label>
            <input
              id="add-hoby-name"
              role="combobox"
              aria-expanded={suggestOpen && suggestions.length > 0}
              aria-controls="add-hoby-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={
                suggestOpen && suggestions[activeIndex] ? `add-hoby-option-${suggestions[activeIndex].slug}` : undefined
              }
              value={name}
              placeholder={t("hobbiesPage.hobbyNamePlaceholder")}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setSuggestOpen(true);
                setActiveIndex(0);
                setPrecheck(null);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              onKeyDown={(e) => {
                if (!suggestOpen || suggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((index) => (index + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
                } else if (e.key === "Enter" && suggestions[activeIndex]) {
                  e.preventDefault();
                  chooseSuggestion(suggestions[activeIndex]);
                } else if (e.key === "Escape") {
                  setSuggestOpen(false);
                }
              }}
            />
            {suggestOpen && suggestions.length > 0 ? (
              <ul id="add-hoby-suggestions" className="hoby-name-suggest" role="listbox">
                {suggestions.map((hoby, index) => (
                  <li key={hoby.slug}>
                    <button
                      id={`add-hoby-option-${hoby.slug}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={index === activeIndex ? "is-active" : undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => chooseSuggestion(hoby)}
                    >
                      <span aria-hidden>{hoby.icon?.trim() || "✦"}</span>
                      <span>
                        <strong>{hoby.canonicalDisplayName || hoby.displayName}</strong>
                        {hoby.heDisplayName ? <small>{hoby.heDisplayName}</small> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {exact ? (
              <p className="hoby-name-existing">
                {t("hobbiesPage.alreadyInCatalogue", { name: exact.canonicalDisplayName || exact.displayName })}{" "}
                <button type="button" className="home-section-link" onClick={() => props.onOpenExisting(exact.slug)}>
                  {t("hobbiesPage.openExisting", { name: exact.canonicalDisplayName || exact.displayName })}
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
        {step !== "generating" && !manual ? (
          <label className="hoby-cat-check">
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
            <span>
              <strong>{t("hobbiesPage.aiAssist")}</strong>
              <span className="muted">{t("hobbiesPage.aiGenerates")}</span>
            </span>
          </label>
        ) : null}
        {manual || !useAI ? (
          <div className="stack">
            <label className="hoby-cat-field">
              <span>{t("hobbiesPage.shortDescription")}</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="hoby-cat-field">
              <span>{t("hobbiesPage.iconLabel")}</span>
              <input value={icon} onChange={(e) => setIcon(e.target.value)} />
            </label>
            <CategoryField value={category} onChange={setCategory} />
            <HobyManualMetadataEditor
              typeRows={typeRows}
              levelRows={levelRows}
              onChangeTypes={setTypeRows}
              onChangeLevels={setLevelRows}
            />
            <CreateCircleGroupSizeStep
              value={groupSize}
              onChange={setGroupSize}
              title={t("hobbiesPage.groupSizeTitle")}
              helper={t("hobbiesPage.groupSizeHelper")}
              showTip={false}
            />
          </div>
        ) : null}
        {precheck ? (
          <div className="hoby-cat-precheck">
            <p>{precheck.message || t("hobbiesPage.precheckBlocked")}</p>
            {precheck.similarExisting.map((item) => (
              <button key={item.slug} type="button" onClick={() => props.onOpenExisting(item.slug)}>
                {t("hobbiesPage.openExisting", { name: item.displayName })}
              </button>
            ))}
            {precheck.suggestedNames.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => { setName(suggestion); setPrecheck(null); }}>
                {t("hobbiesPage.useSuggestion", { name: suggestion })}
              </button>
            ))}
          </div>
        ) : null}
        {step === "failed" ? (
          <div className="hoby-cat-precheck">
            <p>{t("hobbiesPage.aiFailedTitle")}</p>
            <p>{t("hobbiesPage.aiFailedBody")}</p>
          </div>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
        <div className="hoby-cat-actions">
          {step === "failed" ? (
            <>
              <button type="button" className="primary" disabled={busy} onClick={() => void generate()}>
                {t("hobbiesPage.retryAi")}
              </button>
              <button type="button" disabled={busy} onClick={() => void createManually()}>
                {t("hobbiesPage.createManually")}
              </button>
            </>
          ) : step !== "generating" ? (
            <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void generate()}>
              {manual || !useAI ? t("hobbiesPage.saveHobby") : t("hobbiesPage.generate")}
            </button>
          ) : null}
          <button type="button" onClick={props.onClose} disabled={busy && step === "generating"}>
            {t("common.cancel")}
          </button>
          {step === "form" && !manual ? (
            <button type="button" className="home-section-link" onClick={() => { setManual(true); setUseAI(false); }}>
              {t("hobbiesPage.enterManually")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HobbyReview(props: {
  hoby: Hoby;
  prepared: boolean;
  onDone: () => void;
  onEdit: () => void;
  onUpdated: (hoby: Hoby) => void;
}) {
  const { t } = useTranslation();
  const types = parseHobyTypesNested(props.hoby.types);
  const levels = parseHobyLevelsFlat(props.hoby.levels);
  const [openLevel, setOpenLevel] = useState(levels[0] ? String(levels[0].key) : "");
  const [regenOpen, setRegenOpen] = useState(false);
  const cat = stableCategory(props.hoby.interestCategory);
  const selected = levels.find((level) => String(level.key) === openLevel);
  return (
    <div className="stack hoby-review">
      <header className="hoby-cat-header">
        <div>
          <h1>{t("hobbiesPage.reviewTitle")}</h1>
          <p>{t("hobbiesPage.reviewSaved")}</p>
        </div>
      </header>
      {!props.prepared ? (
        <div className="hoby-cat-precheck">
          <p>{t("hobbiesPage.prepareFailed")}</p>
          <p>{t("hobbiesPage.prepareFailedBody")}</p>
        </div>
      ) : null}
      <section className="hoby-review-hero">
        <span className="hoby-review-icon" aria-hidden>
          {props.hoby.icon?.trim() || "✦"}
        </span>
        <h2>{props.hoby.displayName}</h2>
        {props.hoby.shortDescription ? <p>{props.hoby.shortDescription}</p> : null}
        {cat ? <span className="hoby-cat-badge">{t(`interestCategories.${cat}`)}</span> : null}
      </section>
      {types.length ? (
        <section>
          <h3>{t("hobbyDetail.types")}</h3>
          <div className="hoby-review-types">
            {types.map((typeRow) => (
              <article key={typeRow.key} className="hoby-review-type">
                <strong>
                  {typeRow.icon ? `${typeRow.icon} ` : ""}
                  {typeRow.label || typeRow.key}
                </strong>
                {typeRow.description ? <p>{typeRow.description}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {levels.length ? (
        <section>
          <h3>{t("hobbyDetail.levels")}</h3>
          <div className="hobby-detail-chips">
            {levels.map((level) => (
              <button
                key={String(level.key)}
                type="button"
                className={`hobby-detail-chip${openLevel === String(level.key) ? " is-selected" : ""}`}
                onClick={() => setOpenLevel(String(level.key))}
              >
                {level.label || String(level.key)}
              </button>
            ))}
          </div>
          {selected?.description ? <p className="hobby-detail-note">{selected.description}</p> : null}
        </section>
      ) : null}
      <section>
        <h3>{t("hobbiesPage.groupSizeTitle")}</h3>
        <p>{props.hoby.groupSize ? formatGroupSizeSummary(props.hoby.groupSize, t) : t("hobbiesPage.missingGroupSize")}</p>
      </section>
      <div className="hoby-cat-actions">
        <button type="button" className="primary" onClick={props.onDone}>
          {t("hobbiesPage.done")}
        </button>
        <button type="button" onClick={props.onEdit}>
          {t("hobbiesPage.editDetails")}
        </button>
        <button type="button" onClick={() => setRegenOpen(true)}>
          {t("hobbiesPage.regenerate")}
        </button>
      </div>
      {regenOpen ? (
        <RegenDialog
          hoby={props.hoby}
          onClose={() => setRegenOpen(false)}
          onApplied={props.onUpdated}
        />
      ) : null}
    </div>
  );
}

function HobbyEditor(props: {
  hoby: Hoby;
  onCancel: () => void;
  onSaved: (hoby: Hoby) => void;
  onPatched: (hoby: Hoby) => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const source = props.hoby;
  const initial = rowsFromHoby(source);
  const [name, setName] = useState(source.canonicalDisplayName || source.displayName);
  const [description, setDescription] = useState(source.canonicalShortDescription || source.shortDescription || "");
  const [icon, setIcon] = useState(source.icon || "");
  const [category, setCategory] = useState(stableCategory(source.interestCategory) ?? "");
  const [typeRows, setTypeRows] = useState(initial.types.length ? initial.types : [emptyManualRow()]);
  const [levelRows, setLevelRows] = useState(initial.levels.length ? initial.levels : [emptyManualRow()]);
  const [groupSize, setGroupSize] = useState<GroupSizeState>(groupSizeStateFromPayload(source.groupSize));
  const [groupError, setGroupError] = useState<string | null>(null);
  const [heName, setHeName] = useState(source.heDisplayName || "");
  const [heDescription, setHeDescription] = useState(source.heShortDescription || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "blocked">("idle");
  const [circleCount, setCircleCount] = useState(0);

  async function askDelete() {
    setBusy(true);
    setError(null);
    try {
      const usage = await api.hobyUsage(source.slug);
      setCircleCount(usage.circleCount);
      setDeleteStep(usage.circleCount > 0 ? "blocked" : "confirm");
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.deleteError")));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteHoby(source.slug);
      props.onRemoved();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      if (raw.includes("referenced")) {
        setDeleteStep("blocked");
      } else {
        setError(friendlyError(e, t("hobbiesPage.deleteError")));
      }
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.archiveHoby(source.slug);
      props.onSaved(next);
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.archiveError")));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.restoreHoby(source.slug);
      props.onSaved(next);
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.archiveError")));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const gsErr = validateGroupSize(groupSize);
    if (gsErr) {
      setGroupError(gsErr);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api.updateHoby(source.slug, {
        displayName: name.trim(),
        shortDescription: description.trim() || null,
        icon: icon.trim() || null,
        interestCategory: category,
        types: rowsToTypesPayloadWithKeys(typeRows) ?? [],
        levels: rowsToLevelsPayloadWithKeys(levelRows) ?? [],
        groupSize: toGroupSizePayload(groupSize),
        heDisplayName: heName.trim() || null,
        heShortDescription: heDescription.trim() || null,
      });
      props.onSaved(saved);
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.saveError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack hoby-editor">
      <header className="hoby-cat-header">
        <div>
          <h1>{t("hobbiesPage.editTitle", { name: source.displayName })}</h1>
          <p>
            {t("hobbiesPage.slugStays", { slug: source.slug })}
            {" · "}
            {hobbyStatus(source) === "archived"
              ? t("hobbiesPage.statusArchived")
              : hobbyStatus(source) === "incomplete"
                ? t("hobbiesPage.statusAttention")
                : t("hobbiesPage.statusActive")}
          </p>
        </div>
      </header>
      <section className="hoby-editor-section">
        <h2>{t("hobbiesPage.sectionIdentity")}</h2>
        <label className="hoby-cat-field">
          <span>{t("hobbiesPage.nameLabel")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="hoby-cat-field">
          <span>{t("hobbiesPage.slugLabel")}</span>
          <input value={source.slug} readOnly />
        </label>
        <label className="hoby-cat-field">
          <span>{t("hobbiesPage.iconLabel")}</span>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} />
        </label>
        <CategoryField value={category} onChange={setCategory} />
        <label className="hoby-cat-field">
          <span>{t("hobbiesPage.shortDescription")}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
      </section>
      <section className="hoby-editor-section">
        <h2>{t("hobbiesPage.sectionTypes")}</h2>
        <HobyManualMetadataEditor typeRows={typeRows} levelRows={levelRows} onChangeTypes={setTypeRows} onChangeLevels={setLevelRows} />
      </section>
      <section className="hoby-editor-section">
        <h2>{t("hobbiesPage.sectionGroup")}</h2>
        <CreateCircleGroupSizeStep
          value={groupSize}
          onChange={setGroupSize}
          fieldError={groupError}
          title={t("hobbiesPage.groupSizeTitle")}
          helper={t("hobbiesPage.groupSizeHelper")}
          showTip={false}
        />
      </section>
      <section className="hoby-editor-section" dir="rtl">
        <h2>{t("hobbiesPage.sectionHebrew")}</h2>
        <p className="muted">{hobbyHasHebrew(source) ? t("hobbiesPage.hebrewAvailable") : t("hobbiesPage.hebrewMissing")}</p>
        <label className="hoby-cat-field">
          <span>{t("hobbiesPage.nameLabel")}</span>
          <input value={heName} onChange={(e) => setHeName(e.target.value)} />
        </label>
        <label className="hoby-cat-field">
          <span>{t("hobbiesPage.shortDescription")}</span>
          <textarea value={heDescription} onChange={(e) => setHeDescription(e.target.value)} rows={3} />
        </label>
      </section>
      {error ? <FormError>{error}</FormError> : null}
      <div className="hoby-cat-actions">
        <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void save()}>
          {t("hobbiesPage.saveChanges")}
        </button>
        <button type="button" onClick={props.onCancel} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="button" className="hoby-cat-regen" onClick={() => setRegenOpen(true)} disabled={busy}>
          {t("hobbiesPage.regenerate")}
        </button>
      </div>
      <div className="hoby-cat-danger">
        {source.archived ? (
          <button type="button" onClick={() => void restore()} disabled={busy}>
            {t("hobbiesPage.restoreHobby")}
          </button>
        ) : null}
        <button type="button" className="hoby-cat-delete" onClick={() => void askDelete()} disabled={busy}>
          {t("hobbiesPage.deleteHobby")}
        </button>
        {deleteStep === "confirm" ? (
          <div className="hoby-cat-danger-note">
            <p>{t("hobbiesPage.deleteConfirm")}</p>
            <button type="button" className="hoby-cat-delete" onClick={() => void confirmDelete()} disabled={busy}>
              {t("hobbiesPage.deleteHobby")}
            </button>
            <button type="button" onClick={() => setDeleteStep("idle")} disabled={busy}>
              {t("common.cancel")}
            </button>
          </div>
        ) : null}
        {deleteStep === "blocked" ? (
          <div className="hoby-cat-danger-note">
            <p>{t("hobbiesPage.cannotDelete", { count: circleCount })}</p>
            <button type="button" className="primary" onClick={() => void archive()} disabled={busy}>
              {t("hobbiesPage.archiveHobby")}
            </button>
            <button type="button" onClick={() => setDeleteStep("idle")} disabled={busy}>
              {t("common.cancel")}
            </button>
          </div>
        ) : null}
      </div>
      {regenOpen ? (
        <RegenDialog
          hoby={source}
          onClose={() => setRegenOpen(false)}
          onApplied={(next) => {
            setName(next.canonicalDisplayName || next.displayName);
            setDescription(next.canonicalShortDescription || next.shortDescription || "");
            setIcon(next.icon || "");
            setCategory(stableCategory(next.interestCategory) ?? "");
            const rows = rowsFromHoby(next);
            setTypeRows(rows.types.length ? rows.types : [emptyManualRow()]);
            setLevelRows(rows.levels.length ? rows.levels : [emptyManualRow()]);
            setGroupSize(groupSizeStateFromPayload(next.groupSize));
            props.onPatched(next);
            setRegenOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CategoryField(props: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <label className="hoby-cat-field">
      <span>{t("hobbiesPage.category")}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">{t("hobbiesPage.categoryUnset")}</option>
        {(["sports", "arts", "games", "learning", "social"] as const).map((id) => (
          <option key={id} value={id}>
            {t(`interestCategories.${id}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function RegenDialog(props: { hoby: Hoby; onClose: () => void; onApplied: (hoby: Hoby) => void }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<HobyRegenField[]>(["description", "icon", "category", "types", "levels", "groupSize"]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [preview, setPreview] = useState<HobyRegeneratePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(field: HobyRegenField) {
    setPreview(null);
    setPicked((current) => (current.includes(field) ? current.filter((item) => item !== field) : [...current, field]));
  }

  async function previewRegen() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.regenerateHoby(props.hoby.slug, { fields: picked, onlyMissing });
      if (next.fields.length === 0) {
        setError(t("hobbiesPage.regenNothing"));
        setPreview(null);
        return;
      }
      setPreview(next);
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.prepareFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.updateHoby(props.hoby.slug, {
        shortDescription: preview.fields.includes("description") ? preview.shortDescription : undefined,
        icon: preview.fields.includes("icon") ? preview.icon : undefined,
        interestCategory: preview.fields.includes("category") ? preview.interestCategory : undefined,
        types: preview.fields.includes("types") ? preview.types : undefined,
        levels: preview.fields.includes("levels") ? preview.levels : undefined,
        groupSize: preview.fields.includes("groupSize") ? preview.groupSize : undefined,
      });
      props.onApplied(saved);
    } catch (e) {
      setError(friendlyError(e, t("hobbiesPage.saveError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="regen-title">
      <div className="hoby-cat-modal-card">
        <h2 id="regen-title">{t("hobbiesPage.regenerate")}</h2>
        <p>{t("hobbiesPage.regenIntro")}</p>
        <label className="hoby-cat-check">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => { setOnlyMissing(e.target.checked); setPreview(null); }} />
          <span>{t("hobbiesPage.regenMissingOnly")}</span>
        </label>
        <div className="hoby-cat-regen-fields">
          {REGEN_FIELDS.map((field) => (
            <label key={field}>
              <input type="checkbox" checked={picked.includes(field)} onChange={() => toggle(field)} />
              {t(`hobbiesPage.regen_${field}`)}
            </label>
          ))}
        </div>
        {preview ? (
          <div className="hoby-cat-precheck">
            <p>{t("hobbiesPage.regenPreview", { fields: preview.fields.map((field) => t(`hobbiesPage.regen_${field}`)).join(", ") })}</p>
            {preview.shortDescription ? <p>{preview.shortDescription}</p> : null}
            {preview.icon ? <p aria-hidden>{preview.icon}</p> : null}
            {preview.groupSize ? <p>{formatGroupSizeSummary(preview.groupSize, t)}</p> : null}
          </div>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
        <div className="hoby-cat-actions">
          {preview ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void apply()}>
              {t("hobbiesPage.applyRegen")}
            </button>
          ) : (
            <button type="button" className="primary" disabled={busy || picked.length === 0} onClick={() => void previewRegen()}>
              {busy ? t("common.loading") : t("hobbiesPage.previewRegen")}
            </button>
          )}
          <button type="button" onClick={props.onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
