import React, { type Dispatch, type SetStateAction } from "react";

export type HobyManualRow = {
  id: string;
  label: string;
  description: string;
};

function newId(): string {
  return globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyManualRow(): HobyManualRow {
  return { id: newId(), label: "", description: "" };
}

/** Build `types` for POST /hobies — keys are assigned server-side from labels. */
export function rowsToTypesPayload(rows: HobyManualRow[]): unknown | undefined {
  const out: Array<{ label: string; description?: string }> = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) continue;
    const o: { label: string; description?: string } = { label };
    const d = r.description.trim();
    if (d) o.description = d;
    out.push(o);
  }
  return out.length ? out : undefined;
}

/** Build `levels` for POST /hobies — keys are assigned server-side (order + fallbacks). */
export function rowsToLevelsPayload(rows: HobyManualRow[]): unknown | undefined {
  const out: Array<{ label: string; description?: string }> = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) continue;
    const o: { label: string; description?: string } = { label };
    const d = r.description.trim();
    if (d) o.description = d;
    out.push(o);
  }
  return out.length ? out : undefined;
}

function looksLikeStableKey(id: string): boolean {
  const t = id.trim();
  if (!t) return false;
  if (t.includes("-") && t.length > 20) return false;
  return true;
}

/** Preserve catalogue keys when editing an existing hoby. */
export function rowsToTypesPayloadWithKeys(rows: HobyManualRow[]): unknown | undefined {
  const out: Array<{ key?: string; label: string; description?: string }> = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) continue;
    const o: { key?: string; label: string; description?: string } = { label };
    const d = r.description.trim();
    if (d) o.description = d;
    if (looksLikeStableKey(r.id)) o.key = r.id.trim();
    out.push(o);
  }
  return out.length ? out : undefined;
}

export function rowsToLevelsPayloadWithKeys(rows: HobyManualRow[]): unknown | undefined {
  const out: Array<{ key?: string | number; label: string; description?: string }> = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) continue;
    const o: { key?: string | number; label: string; description?: string } = { label };
    const d = r.description.trim();
    if (d) o.description = d;
    if (looksLikeStableKey(r.id)) {
      const n = Number(r.id);
      o.key = Number.isFinite(n) && String(n) === r.id.trim() ? n : r.id.trim();
    }
    out.push(o);
  }
  return out.length ? out : undefined;
}

function updateRow(rows: HobyManualRow[], id: string, patch: Partial<Omit<HobyManualRow, "id">>): HobyManualRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

function LabelRowFields(props: {
  row: HobyManualRow;
  labelPlaceholder: string;
  onChange: (patch: Partial<Omit<HobyManualRow, "id">>) => void;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input placeholder={props.labelPlaceholder} value={props.row.label} onChange={(e) => props.onChange({ label: e.target.value })} />
      <input
        placeholder="Description (optional)"
        value={props.row.description}
        onChange={(e) => props.onChange({ description: e.target.value })}
      />
    </div>
  );
}

export function HobyManualMetadataEditor(props: {
  typeRows: HobyManualRow[];
  levelRows: HobyManualRow[];
  onChangeTypes: Dispatch<SetStateAction<HobyManualRow[]>>;
  onChangeLevels: Dispatch<SetStateAction<HobyManualRow[]>>;
}) {
  const { typeRows, levelRows, onChangeTypes, onChangeLevels } = props;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ fontWeight: 650 }}>Types</div>
        <div className="muted" style={{ fontSize: "0.9em", lineHeight: 1.45 }}>
          Variants like surface, equipment, or style (e.g. <strong>Clay court</strong>, <strong>Hard court</strong>).
        </div>
        {typeRows.map((row) => (
          <div key={row.id} className="card stack" style={{ padding: 10, gap: 8 }}>
            <LabelRowFields
              row={row}
              labelPlaceholder="Label (e.g. Clay court)"
              onChange={(patch) => onChangeTypes((prev) => updateRow(prev, row.id, patch))}
            />
            <button
              type="button"
              style={{ width: "auto" }}
              onClick={() => onChangeTypes((prev) => prev.filter((r) => r.id !== row.id))}
            >
              Remove type
            </button>
          </div>
        ))}
        <button type="button" style={{ width: "auto" }} onClick={() => onChangeTypes((prev) => [...prev, emptyManualRow()])}>
          + Add another type
        </button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div style={{ fontWeight: 650 }}>Levels (shared ladder)</div>
        <div className="muted" style={{ fontSize: "0.9em", lineHeight: 1.45 }}>
          One progression for everyone in this hoby (e.g. <strong>Beginner</strong> → <strong>Advanced</strong>).
        </div>
        {levelRows.map((row) => (
          <div key={row.id} className="card stack" style={{ padding: 10, gap: 8 }}>
            <LabelRowFields
              row={row}
              labelPlaceholder="Label (e.g. Beginner)"
              onChange={(patch) => onChangeLevels((prev) => updateRow(prev, row.id, patch))}
            />
            <button
              type="button"
              style={{ width: "auto" }}
              onClick={() => onChangeLevels((prev) => prev.filter((r) => r.id !== row.id))}
            >
              Remove level
            </button>
          </div>
        ))}
        <button type="button" style={{ width: "auto" }} onClick={() => onChangeLevels((prev) => [...prev, emptyManualRow()])}>
          + Add another level
        </button>
      </div>
    </div>
  );
}
