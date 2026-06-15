import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Hoby, HobyPrecheckResponse } from "../api/types";
import { BidiText } from "./BidiText";
import {
  levelsForSelectedType,
  parseHobyLevelsFlat,
  parseHobyTypesNested,
  type HobyLevelRow,
  type HobyTypeRow,
} from "./hobyMetadata";
import {
  emptyManualRow,
  HobyManualMetadataEditor,
  rowsToLevelsPayload,
  rowsToLevelsPayloadWithKeys,
  rowsToTypesPayload,
  rowsToTypesPayloadWithKeys,
  type HobyManualRow,
} from "./hobyManualForm";
import { FormError } from "./FormError";
import { CreateCircleGroupSizeStep } from "./CreateCircleGroupSizeStep";
import {
  DEFAULT_GROUP_SIZE,
  formatGroupSizeSummary,
  groupSizeStateFromPayload,
  toGroupSizePayload,
  validateGroupSize,
  type GroupSizeState,
} from "./groupSize";

function hobySubtitle(h: { slug: string; shortDescription?: string | null }) {
  const d = h.shortDescription?.trim();
  return d || h.slug;
}

function hobyMatchesQuery(h: Hoby, query: string): boolean {
  const s = query.trim().toLowerCase();
  if (!s) return true;
  const hay = [h.displayName, h.slug, h.shortDescription ?? "", h.icon ?? ""].map((x) => String(x).toLowerCase());
  return hay.some((p) => p.includes(s));
}

function typeRowsFromHoby(types: HobyTypeRow[]): HobyManualRow[] {
  return types.map((t) => ({
    id: t.key,
    label: t.label ?? t.key,
    description: t.description ?? "",
  }));
}

function levelRowsFromHoby(levels: HobyLevelRow[]): HobyManualRow[] {
  return levels.map((lv) => ({
    id: String(lv.key),
    label: lv.label ?? String(lv.key),
    description: lv.description ?? "",
  }));
}

export function Hobies(props: { onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  /** When set, detail panel shows levels for this type key; null = type list only. */
  const [openTypeKey, setOpenTypeKey] = useState<string | null>(null);
  /** Keeps detail content mounted briefly after close so height/opacity transitions can finish. */
  const [closingForSlug, setClosingForSlug] = useState<string>("");

  const [displayName, setDisplayName] = useState("");
  const [typeRows, setTypeRows] = useState<HobyManualRow[]>([]);
  const [levelRows, setLevelRows] = useState<HobyManualRow[]>([]);
  const [useAI, setUseAI] = useState(true);
  const [saveStep, setSaveStep] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [precheckBlock, setPrecheckBlock] = useState<HobyPrecheckResponse | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editShortDescription, setEditShortDescription] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editTypeRows, setEditTypeRows] = useState<HobyManualRow[]>([]);
  const [editLevelRows, setEditLevelRows] = useState<HobyManualRow[]>([]);
  const [editGroupSize, setEditGroupSize] = useState<GroupSizeState>(DEFAULT_GROUP_SIZE);
  const [editGroupSizeError, setEditGroupSizeError] = useState<string | null>(null);
  const [addGroupSize, setAddGroupSize] = useState<GroupSizeState>(DEFAULT_GROUP_SIZE);
  const [addGroupSizeError, setAddGroupSizeError] = useState<string | null>(null);
  const [browseLayout, setBrowseLayout] = useState<"list" | "icons">(() => {
    try {
      const v = localStorage.getItem("hobiesBrowseLayout");
      if (v === "icons" || v === "list") return v;
    } catch {
      /* ignore */
    }
    return "list";
  });

  useEffect(() => {
    try {
      localStorage.setItem("hobiesBrowseLayout", browseLayout);
    } catch {
      /* ignore */
    }
  }, [browseLayout]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getHobies();
      setHobies(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [i18n.language]);

  useEffect(() => {
    setOpenTypeKey(null);
    setEditingSlug("");
  }, [selectedSlug]);

  const filteredHobies = useMemo(() => {
    if (!listFilter.trim()) return hobies;
    return hobies.filter((h) => hobyMatchesQuery(h, listFilter));
  }, [hobies, listFilter]);

  useEffect(() => {
    if (!selectedSlug) return;
    if (!filteredHobies.some((h) => h.slug === selectedSlug)) {
      setClosingForSlug(selectedSlug);
      setSelectedSlug("");
      setOpenTypeKey(null);
    }
  }, [filteredHobies, selectedSlug]);

  useEffect(() => {
    if (!closingForSlug) return;
    if (!filteredHobies.some((h) => h.slug === closingForSlug)) {
      setClosingForSlug("");
    }
  }, [filteredHobies, closingForSlug]);

  useEffect(() => {
    if (!showAdd) {
      setTypeRows([]);
      setLevelRows([]);
      setPrecheckBlock(null);
      setSaveNote(null);
      setAddGroupSize(DEFAULT_GROUP_SIZE);
      setAddGroupSizeError(null);
    }
  }, [showAdd]);

  useEffect(() => {
    setPrecheckBlock(null);
    setSaveNote(null);
  }, [displayName]);

  useEffect(() => {
    if (useAI) {
      setTypeRows([]);
      setLevelRows([]);
    }
  }, [useAI]);

  useEffect(() => {
    if (showAdd && !useAI) {
      setTypeRows((prev) => (prev.length ? prev : [emptyManualRow()]));
      setLevelRows((prev) => (prev.length ? prev : [emptyManualRow()]));
    }
  }, [showAdd, useAI]);

  async function addHoby() {
    const dn = displayName.trim();
    if (!dn) return;
    setLoading(true);
    setError(null);
    setPrecheckBlock(null);
    setSaveNote(null);
    setSaveStep(null);
    try {
      const levels = useAI ? undefined : rowsToLevelsPayload(levelRows);
      const types = useAI ? undefined : rowsToTypesPayload(typeRows);
      if (!useAI && levels === undefined && types === undefined) {
        setError(t("hobbiesPage.errNeedTypeOrLevel"));
        return;
      }
      setSaveStep(t("hobbiesPage.checkingCatalogue"));
      const pr = await api.precheckNewHoby({ displayName: dn });
      if (pr.blockedReason) {
        setPrecheckBlock(pr);
        setSaveNote(null);
        setError(null);
        return;
      }
      setPrecheckBlock(null);
      setSaveNote(pr.aiNote || null);
      setSaveStep(t("hobbiesPage.savingHobby"));
      const gsErr = validateGroupSize(addGroupSize);
      if (gsErr) {
        setAddGroupSizeError(gsErr);
        setError(gsErr);
        return;
      }
      setAddGroupSizeError(null);
      const created = await api.createHoby({
        displayName: dn,
        levels,
        types,
        groupSize: toGroupSizePayload(addGroupSize),
      });
      setDisplayName("");
      setShowAdd(false);
      await load();
      setSelectedSlug(created.slug);
      setSaveNote(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setSaveStep(null);
    }
  }

  function beginEditHoby(h: Hoby) {
    const parsedTypes = parseHobyTypesNested(h.types);
    const parsedLevels = parseHobyLevelsFlat(h.levels);
    setEditingSlug(h.slug);
    setEditDisplayName(h.displayName);
    setEditShortDescription(h.shortDescription?.trim() ?? "");
    setEditIcon(h.icon?.trim() ?? "");
    setEditTypeRows(parsedTypes.length ? typeRowsFromHoby(parsedTypes) : [emptyManualRow()]);
    setEditLevelRows(parsedLevels.length ? levelRowsFromHoby(parsedLevels) : [emptyManualRow()]);
    setEditGroupSize(groupSizeStateFromPayload(h.groupSize));
    setEditGroupSizeError(null);
    setOpenTypeKey(null);
    setError(null);
  }

  function cancelEditHoby() {
    setEditingSlug("");
    setEditDisplayName("");
    setEditShortDescription("");
    setEditIcon("");
    setEditTypeRows([]);
    setEditLevelRows([]);
    setEditGroupSize(DEFAULT_GROUP_SIZE);
    setEditGroupSizeError(null);
  }

  async function saveHobyEdits(slug: string) {
    const dn = editDisplayName.trim();
    if (!dn) {
      setError(t("hobbiesPage.errNameRequired"));
      return;
    }
    const levels = rowsToLevelsPayloadWithKeys(editLevelRows);
    const types = rowsToTypesPayloadWithKeys(editTypeRows);
    if (!levels && !types) {
      setError(t("hobbiesPage.errNeedMetadata"));
      return;
    }
    const gsErr = validateGroupSize(editGroupSize);
    if (gsErr) {
      setEditGroupSizeError(gsErr);
      setError(gsErr);
      return;
    }
    setEditGroupSizeError(null);
    setLoading(true);
    setError(null);
    try {
      await api.updateHoby(slug, {
        displayName: dn,
        shortDescription: editShortDescription.trim() || null,
        icon: editIcon.trim() || null,
        levels,
        types,
        groupSize: toGroupSizePayload(editGroupSize),
      });
      cancelEditHoby();
      await load();
      setSelectedSlug(slug);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const panelSlug = selectedSlug || closingForSlug;
  const panelHoby = useMemo(
    () => (panelSlug ? hobies.find((h) => h.slug === panelSlug) ?? null : null),
    [hobies, panelSlug],
  );
  const hobyLevelsFlat = useMemo(() => parseHobyLevelsFlat(panelHoby?.levels), [panelHoby]);
  const types = useMemo(() => parseHobyTypesNested(panelHoby?.types), [panelHoby]);

  function beginCloseHobyPanel(slug: string) {
    setClosingForSlug(slug);
    setSelectedSlug("");
  }

  useEffect(() => {
    if (selectedSlug) setClosingForSlug("");
  }, [selectedSlug]);

  useEffect(() => {
    if (!closingForSlug) return;
    const id = window.setTimeout(() => setClosingForSlug(""), 420);
    return () => window.clearTimeout(id);
  }, [closingForSlug]);

  const openType = useMemo(
    () => (openTypeKey ? types.find((t) => t.key === openTypeKey) ?? null : null),
    [types, openTypeKey],
  );

  const levelsForOpenType: HobyLevelRow[] = useMemo(() => {
    if (!openTypeKey) return [];
    return levelsForSelectedType(hobyLevelsFlat, types, openTypeKey);
  }, [openTypeKey, hobyLevelsFlat, types]);

  const totalLevelCount = useMemo(() => {
    if (hobyLevelsFlat.length) return hobyLevelsFlat.length;
    return types.reduce((m, t) => Math.max(m, t.levels.length), 0);
  }, [types, hobyLevelsFlat]);

  function typeLevelHint(typeRow: HobyTypeRow) {
    const shared = hobyLevelsFlat.length > 0;
    const legacyNested = typeRow.levels.length > 0 && !shared;
    if (shared) return t("hobbiesPage.levelsCount", { count: hobyLevelsFlat.length });
    if (legacyNested) return t("hobbiesPage.levelsCount", { count: typeRow.levels.length });
    return t("hobbiesPage.open");
  }

  function renderTypeBubble(typeRow: HobyTypeRow, index: number) {
    const title = typeRow.label || typeRow.key;
    return (
      <button
        key={typeRow.key}
        type="button"
        className="hoby-type-bubble"
        data-bubble={index % 5}
        onClick={() => setOpenTypeKey(typeRow.key)}
        aria-label={`${title}, ${typeLevelHint(typeRow)}`}
      >
        <span className="hoby-type-bubble-label">{title}</span>
        {typeRow.description ? <span className="hoby-type-bubble-desc">{typeRow.description}</span> : null}
        <span className="hoby-type-bubble-meta">{typeLevelHint(typeRow)}</span>
      </button>
    );
  }

  function renderLevelBubble(lv: HobyLevelRow, index: number) {
    const title = lv.label || lv.key;
    return (
      <div
        key={lv.key}
        className="hoby-level-bubble"
        data-bubble={index % 5}
      >
        <span className="hoby-type-bubble-label">{title}</span>
        {lv.description ? <span className="hoby-type-bubble-desc">{lv.description}</span> : null}
      </div>
    );
  }

  function renderHobyDetailPanel() {
    if (!panelHoby) return null;
    const slug = panelHoby.slug;
    const isEditing = editingSlug === slug;
    return (
      <div className="hoby-inline-expand-surface">
        <div className="card stack" style={{ marginTop: 8, padding: 12, borderColor: "#2a6df4" }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}
          >
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              {panelHoby.icon ? (
                <span style={{ fontSize: "2rem", lineHeight: 1 }} aria-hidden>
                  {panelHoby.icon}
                </span>
              ) : null}
              <div>
                <div style={{ fontWeight: 650 }}>
                  <BidiText>{panelHoby.displayName}</BidiText>
                </div>
                <div className="muted" style={{ maxWidth: 560 }} title={`slug: ${panelHoby.slug}`}>
                  {hobySubtitle(panelHoby)}
                </div>
                {!isEditing && panelHoby.groupSize ? (
                  <div className="muted" style={{ fontSize: "0.85em", marginTop: 4 }}>
                    {t("hobbiesPage.preferredGroup", { summary: formatGroupSizeSummary(panelHoby.groupSize) })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {!isEditing ? (
                <span className="pill">
                  {types.length
                    ? t("hobbiesPage.typesCount", { count: types.length })
                    : hobyLevelsFlat.length
                      ? t("hobbiesPage.legacyLevels")
                      : t("hobbiesPage.noMetadata")}
                  {totalLevelCount ? t("hobbiesPage.levelsTotal", { count: totalLevelCount }) : null}
                </span>
              ) : null}
              {!isEditing ? (
                <button
                  type="button"
                  className="home-btn-text"
                  style={{ fontSize: "0.88rem" }}
                  disabled={loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    beginEditHoby(panelHoby);
                  }}
                >
                  {t("common.modify")}
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn icon-btn--ghost icon-btn--square"
                aria-label={t("hobbiesPage.collapseAria")}
                title={t("hobbiesPage.collapse")}
                onClick={(e) => {
                  e.stopPropagation();
                  cancelEditHoby();
                  beginCloseHobyPanel(slug);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 15l6-6 6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="stack hoby-edit-form" style={{ gap: 12, marginTop: 4 }}>
              <div className="muted" style={{ fontSize: "0.88em" }}>
                {t("hobbiesPage.slugStays", { slug })}
              </div>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.88em" }}>
                  {t("hobbiesPage.nameLabel")}
                </span>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder={t("hobbiesPage.hobbyName")}
                />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.88em" }}>
                  {t("hobbiesPage.shortDescription")}
                </span>
                <input
                  value={editShortDescription}
                  onChange={(e) => setEditShortDescription(e.target.value)}
                  placeholder={t("hobbiesPage.shortDescriptionPlaceholder")}
                />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.88em" }}>
                  {t("hobbiesPage.iconLabel")}
                </span>
                <input
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  placeholder={t("hobbiesPage.iconPlaceholder")}
                  maxLength={8}
                />
              </label>
              <HobyManualMetadataEditor
                typeRows={editTypeRows}
                levelRows={editLevelRows}
                onChangeTypes={setEditTypeRows}
                onChangeLevels={setEditLevelRows}
              />
              <CreateCircleGroupSizeStep
                title={t("hobbiesPage.groupSizeTitle")}
                helper={t("hobbiesPage.groupSizeHelper")}
                showTip={false}
                value={editGroupSize}
                fieldError={editGroupSizeError}
                disabled={loading}
                onChange={(next) => {
                  setEditGroupSize(next);
                  setEditGroupSizeError(null);
                }}
              />
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary"
                  style={{ width: "auto" }}
                  disabled={loading || !editDisplayName.trim()}
                  onClick={() => void saveHobyEdits(slug)}
                >
                  {loading ? t("common.saving") : t("common.save")}
                </button>
                <button type="button" style={{ width: "auto" }} disabled={loading} onClick={cancelEditHoby}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {!types.length && hobyLevelsFlat.length ? (
                <div className="hoby-types-thread" style={{ gap: 8 }}>
                  <div className="hoby-types-thread-hint muted">{t("hobbiesPage.levels")}</div>
                  <div className="hoby-level-bubbles" role="list">
                    {hobyLevelsFlat.map((lv, i) => renderLevelBubble(lv, i))}
                  </div>
                </div>
              ) : null}

              {types.length ? (
                <div className="hoby-types-thread" style={{ gap: 8 }}>
                  {openTypeKey === null ? (
                    <>
                      <div className="hoby-types-thread-hint muted">{t("hobbiesPage.tapTypeForLevels")}</div>
                      <div className="hoby-type-bubbles" role="list">
                        {types.map((typeRow, i) => renderTypeBubble(typeRow, i))}
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="hoby-thread-back"
                        style={{ width: "auto" }}
                        onClick={() => setOpenTypeKey(null)}
                      >
                        {t("hobbiesPage.backToTypes")}
                      </button>
                      <div className="hoby-type-bubble hoby-type-bubble--anchor is-static">
                        <span className="hoby-type-bubble-label">{openType?.label ?? openTypeKey}</span>
                        {openType?.description ? (
                          <span className="hoby-type-bubble-desc">{openType.description}</span>
                        ) : null}
                      </div>
                      {levelsForOpenType.length ? (
                        <div className="hoby-level-bubbles" role="list">
                          {levelsForOpenType.map((lv, i) => renderLevelBubble(lv, i))}
                        </div>
                      ) : (
                        <div className="muted">{t("hobbiesPage.noLevelsForType")}</div>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  const iconBagDetailOpen = browseLayout === "icons" && Boolean(panelSlug);

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="h1">{t("hobbiesPage.title")}</div>
        <button style={{ width: "auto" }} onClick={props.onBack} disabled={loading}>
          {t("common.back")}
        </button>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="muted">{t("hobbiesPage.intro")}</div>
        <button style={{ width: "auto" }} className="primary" onClick={() => setShowAdd((v) => !v)} disabled={loading}>
          {showAdd ? t("common.close") : t("hobbiesPage.addHobby")}
        </button>
      </div>

      <label className="stack" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: "0.88em" }}>
          {t("hobbiesPage.searchLabel")}
        </span>
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={t("hobbiesPage.searchPlaceholder")}
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
          aria-label={t("hobbiesPage.searchAria")}
        />
      </label>

      {showAdd ? (
        <div className="card stack" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 650 }}>{t("hobbiesPage.newHobby")}</div>
            <span className="pill">{useAI ? t("hobbiesPage.aiAssist") : t("hobbiesPage.manualForm")}</span>
          </div>
          {saveStep ? <div className="muted">{saveStep}</div> : null}
          {saveNote ? (
            <div className="muted" style={{ fontSize: "0.88em" }}>
              {saveNote}
            </div>
          ) : null}
          {precheckBlock?.blockedReason ? (
            <div className="notice" role="status">
              <div>{precheckBlock.message ?? t("hobbiesPage.precheckBlocked")}</div>
              {precheckBlock.duplicateDetail ? (
                <div className="muted" style={{ marginTop: 6, fontSize: "0.9em" }}>
                  {precheckBlock.duplicateDetail}
                </div>
              ) : null}
            </div>
          ) : null}
          <input
            placeholder={t("hobbiesPage.hobbyNamePlaceholder")}
            value={displayName}
            spellCheck={true}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {precheckBlock?.similarExisting?.length ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="muted" style={{ fontWeight: 600, fontSize: "0.9em" }}>
                {t("hobbiesPage.catalogueMatches")}
              </div>
              {precheckBlock.similarExisting.map((s) => (
                <div key={s.slug} className="muted" style={{ fontSize: "0.92em" }}>
                  <strong>{s.displayName}</strong> ({s.slug}){s.note ? ` — ${s.note}` : ""}
                </div>
              ))}
            </div>
          ) : null}
          {precheckBlock?.suggestedNames?.length ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="muted">{t("hobbiesPage.mightHaveMeant")}</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {precheckBlock.suggestedNames.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    style={{ width: "auto" }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDisplayName(sug);
                      setPrecheckBlock(null);
                      setError(null);
                    }}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span className="muted">{t("hobbiesPage.aiCheckbox")}</span>
          </label>
          {!useAI ? (
            <HobyManualMetadataEditor
              typeRows={typeRows}
              levelRows={levelRows}
              onChangeTypes={setTypeRows}
              onChangeLevels={setLevelRows}
            />
          ) : (
            <div className="muted">{t("hobbiesPage.aiHint")}</div>
          )}
          <CreateCircleGroupSizeStep
            title={t("hobbiesPage.groupSizeTitle")}
            helper={t("hobbiesPage.groupSizeHelper")}
            showTip={false}
            value={addGroupSize}
            fieldError={addGroupSizeError}
            disabled={loading}
            onChange={(next) => {
              setAddGroupSize(next);
              setAddGroupSizeError(null);
            }}
          />
          <button
            className="primary"
            disabled={loading || !displayName.trim()}
            onClick={() => void addHoby()}
          >
            {loading ? t("common.working") : t("hobbiesPage.saveHobby")}
          </button>
        </div>
      ) : null}

      <div className="stack">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}
        >
          <div style={{ fontWeight: 650 }}>{t("hobbiesPage.existingTitle")}</div>
          <div className="hoby-browse-toggle" role="group" aria-label={t("hobbiesPage.layoutAria")}>
            <button
              type="button"
              className={browseLayout === "list" ? "is-active" : ""}
              aria-pressed={browseLayout === "list"}
              onClick={() => setBrowseLayout("list")}
            >
              {t("hobbiesPage.layoutList")}
            </button>
            <button
              type="button"
              className={browseLayout === "icons" ? "is-active" : ""}
              aria-pressed={browseLayout === "icons"}
              onClick={() => setBrowseLayout("icons")}
            >
              {t("hobbiesPage.layoutIcons")}
            </button>
          </div>
        </div>
        {hobies.length ? (
          filteredHobies.length ? (
            browseLayout === "list" ? (
            filteredHobies.map((h) => {
            const visuallyOpen = h.slug === selectedSlug || h.slug === closingForSlug;
            return (
              <div key={h.id} className="hoby-list-item">
                <div
                  className="card clickable"
                  style={{ padding: 12, borderColor: visuallyOpen ? "#2a6df4" : undefined }}
                  onClick={() => {
                    if (selectedSlug === h.slug) beginCloseHobyPanel(h.slug);
                    else setSelectedSlug(h.slug);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={visuallyOpen}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (selectedSlug === h.slug) beginCloseHobyPanel(h.slug);
                      else setSelectedSlug(h.slug);
                    }
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="row" style={{ gap: 10, alignItems: "center" }}>
                      {h.icon ? (
                        <span style={{ fontSize: "1.5rem", lineHeight: 1 }} aria-hidden>
                          {h.icon}
                        </span>
                      ) : null}
                      <div>
                        <div style={{ fontWeight: 650 }}>
                          <BidiText>{h.displayName}</BidiText>
                        </div>
                        <div className="muted" title={`slug: ${h.slug}`}>
                          {hobySubtitle(h)}
                        </div>
                      </div>
                    </div>
                    <span className="pill">{visuallyOpen ? t("common.hide") : t("common.details")}</span>
                  </div>
                </div>
                <div
                  className={`hoby-inline-expand${visuallyOpen ? " hoby-inline-expand-open" : ""}`}
                  aria-hidden={!visuallyOpen}
                >
                  {visuallyOpen && panelHoby && h.slug === panelHoby.slug ? renderHobyDetailPanel() : null}
                </div>
              </div>
            );
          })
            ) : (
              <>
                <div className="hoby-icon-bag">
                  {filteredHobies.map((h) => {
                    const visuallyOpen = h.slug === selectedSlug || h.slug === closingForSlug;
                    const initial = (h.displayName.trim().slice(0, 1) || "?").toUpperCase();
                    return (
                      <button
                        key={h.id}
                        type="button"
                        className={`hoby-icon-tile${visuallyOpen ? " is-selected" : ""}`}
                        onClick={() => {
                          if (selectedSlug === h.slug) beginCloseHobyPanel(h.slug);
                          else setSelectedSlug(h.slug);
                        }}
                        aria-expanded={visuallyOpen}
                        title={hobySubtitle(h)}
                      >
                        {h.icon ? (
                          <span className="hoby-icon-tile-emoji" aria-hidden>
                            {h.icon}
                          </span>
                        ) : (
                          <span className="hoby-icon-tile-fallback" aria-hidden>
                            {initial}
                          </span>
                        )}
                        <BidiText className="hoby-icon-tile-name">{h.displayName}</BidiText>
                      </button>
                    );
                  })}
                </div>
                <div
                  className={`hoby-inline-expand${iconBagDetailOpen ? " hoby-inline-expand-open" : ""}`}
                  aria-hidden={!iconBagDetailOpen}
                >
                  {iconBagDetailOpen ? renderHobyDetailPanel() : null}
                </div>
              </>
            )
          ) : (
            <div className="muted">{t("hobbiesPage.noMatch")}</div>
          )
        ) : (
          <div className="muted">{loading ? t("common.loading") : t("hobbiesPage.empty")}</div>
        )}
      </div>
    </div>
  );
}
