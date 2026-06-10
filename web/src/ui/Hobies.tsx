import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Hoby, HobyPrecheckResponse } from "../api/types";
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
  }, []);

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
        setError("Add at least one type or one level, or turn on AI to generate them.");
        return;
      }
      setSaveStep("Checking the catalogue…");
      const pr = await api.precheckNewHoby({ displayName: dn });
      if (pr.blockedReason) {
        setPrecheckBlock(pr);
        setSaveNote(null);
        setError(null);
        return;
      }
      setPrecheckBlock(null);
      setSaveNote(pr.aiNote || null);
      setSaveStep("Saving hoby…");
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
      setError("Hoby name is required.");
      return;
    }
    const levels = rowsToLevelsPayloadWithKeys(editLevelRows);
    const types = rowsToTypesPayloadWithKeys(editTypeRows);
    if (!levels && !types) {
      setError("Add at least one type or one level.");
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

  function typeLevelHint(t: HobyTypeRow) {
    const shared = hobyLevelsFlat.length > 0;
    const legacyNested = t.levels.length > 0 && !shared;
    if (shared) return `${hobyLevelsFlat.length} levels`;
    if (legacyNested) return `${t.levels.length} levels`;
    return "Open";
  }

  function renderTypeBubble(t: HobyTypeRow, index: number) {
    const title = t.label || t.key;
    return (
      <button
        key={t.key}
        type="button"
        className="hoby-type-bubble"
        data-bubble={index % 5}
        onClick={() => setOpenTypeKey(t.key)}
        aria-label={`${title}, ${typeLevelHint(t)}`}
      >
        <span className="hoby-type-bubble-label">{title}</span>
        {t.description ? <span className="hoby-type-bubble-desc">{t.description}</span> : null}
        <span className="hoby-type-bubble-meta">{typeLevelHint(t)}</span>
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
                <div style={{ fontWeight: 650 }}>{panelHoby.displayName}</div>
                <div className="muted" style={{ maxWidth: 560 }} title={`slug: ${panelHoby.slug}`}>
                  {hobySubtitle(panelHoby)}
                </div>
                {!isEditing && panelHoby.groupSize ? (
                  <div className="muted" style={{ fontSize: "0.85em", marginTop: 4 }}>
                    Preferred group: {formatGroupSizeSummary(panelHoby.groupSize)}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {!isEditing ? (
                <span className="pill">
                  {types.length ? `${types.length} types` : hobyLevelsFlat.length ? "legacy levels" : "No metadata"}
                  {totalLevelCount ? ` · ${totalLevelCount} levels total` : null}
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
                  Modify
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn icon-btn--ghost icon-btn--square"
                aria-label="Collapse hobby details"
                title="Collapse"
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
                Slug stays <code>{slug}</code> so existing circles keep working.
              </div>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.88em" }}>
                  Name
                </span>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Hoby name"
                />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.88em" }}>
                  Short description
                </span>
                <input
                  value={editShortDescription}
                  onChange={(e) => setEditShortDescription(e.target.value)}
                  placeholder="One line about this hoby"
                />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: "0.88em" }}>
                  Icon (emoji)
                </span>
                <input
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  placeholder="e.g. ♟️"
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
                title="Preferred group size"
                helper="Default when someone creates a circle for this hoby."
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
                  {loading ? "Saving…" : "Save changes"}
                </button>
                <button type="button" style={{ width: "auto" }} disabled={loading} onClick={cancelEditHoby}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {!types.length && hobyLevelsFlat.length ? (
                <div className="hoby-types-thread" style={{ gap: 8 }}>
                  <div className="hoby-types-thread-hint muted">Levels</div>
                  <div className="hoby-level-bubbles" role="list">
                    {hobyLevelsFlat.map((lv, i) => renderLevelBubble(lv, i))}
                  </div>
                </div>
              ) : null}

              {types.length ? (
                <div className="hoby-types-thread" style={{ gap: 8 }}>
                  {openTypeKey === null ? (
                    <>
                      <div className="hoby-types-thread-hint muted">Tap a type to see levels</div>
                      <div className="hoby-type-bubbles" role="list">
                        {types.map((t, i) => renderTypeBubble(t, i))}
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
                        ← Types
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
                        <div className="muted">No levels defined for this type.</div>
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
        <div className="h1">Hobies</div>
        <button style={{ width: "auto" }} onClick={props.onBack} disabled={loading}>
          Back
        </button>
      </div>

      {error ? <FormError>{error}</FormError> : null}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="muted">Browse existing hobies or add a new one.</div>
        <button style={{ width: "auto" }} className="primary" onClick={() => setShowAdd((v) => !v)} disabled={loading}>
          {showAdd ? "Close" : "Add hoby"}
        </button>
      </div>

      <label className="stack" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: "0.88em" }}>
          Search by name, description, or slug
        </span>
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Type to filter the list…"
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
          aria-label="Filter hobies list"
        />
      </label>

      {showAdd ? (
        <div className="card stack" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 650 }}>New hoby</div>
            <span className="pill">{useAI ? "AI assist" : "Manual form"}</span>
          </div>
          {saveStep ? <div className="muted">{saveStep}</div> : null}
          {saveNote ? (
            <div className="muted" style={{ fontSize: "0.88em" }}>
              {saveNote}
            </div>
          ) : null}
          {precheckBlock?.blockedReason ? (
            <div className="notice" role="status">
              <div>{precheckBlock.message ?? "This name can’t be added as a new hoby right now."}</div>
              {precheckBlock.duplicateDetail ? (
                <div className="muted" style={{ marginTop: 6, fontSize: "0.9em" }}>
                  {precheckBlock.duplicateDetail}
                </div>
              ) : null}
            </div>
          ) : null}
          <input
            placeholder="Hoby name (e.g. Tennis)"
            value={displayName}
            spellCheck={true}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {precheckBlock?.similarExisting?.length ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="muted" style={{ fontWeight: 600, fontSize: "0.9em" }}>
                Catalogue matches
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
              <div className="muted">You might have meant:</div>
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
            <span className="muted">Use AI to suggest types and a shared levels ladder. Uncheck to fill types and levels in the form below.</span>
          </label>
          {!useAI ? (
            <HobyManualMetadataEditor
              typeRows={typeRows}
              levelRows={levelRows}
              onChangeTypes={setTypeRows}
              onChangeLevels={setLevelRows}
            />
          ) : (
            <div className="muted">
              AI proposes real variants in types, and one shared skill ladder stored in levels — not “commuting vs
              recreational” as types.
            </div>
          )}
          <CreateCircleGroupSizeStep
            title="Preferred group size"
            helper="Default when someone creates a circle for this hoby."
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
            {loading ? "Working…" : "Save hoby"}
          </button>
        </div>
      ) : null}

      <div className="stack">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}
        >
          <div style={{ fontWeight: 650 }}>Existing hobies</div>
          <div className="hoby-browse-toggle" role="group" aria-label="How to show hobies">
            <button
              type="button"
              className={browseLayout === "list" ? "is-active" : ""}
              aria-pressed={browseLayout === "list"}
              onClick={() => setBrowseLayout("list")}
            >
              List
            </button>
            <button
              type="button"
              className={browseLayout === "icons" ? "is-active" : ""}
              aria-pressed={browseLayout === "icons"}
              onClick={() => setBrowseLayout("icons")}
            >
              Icons
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
                        <div style={{ fontWeight: 650 }}>{h.displayName}</div>
                        <div className="muted" title={`slug: ${h.slug}`}>
                          {hobySubtitle(h)}
                        </div>
                      </div>
                    </div>
                    <span className="pill">{visuallyOpen ? "Hide" : "Details"}</span>
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
                        <span className="hoby-icon-tile-name">{h.displayName}</span>
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
            <div className="muted">No hobies match your search.</div>
          )
        ) : (
          <div className="muted">{loading ? "Loading…" : "No hobies yet."}</div>
        )}
      </div>
    </div>
  );
}
