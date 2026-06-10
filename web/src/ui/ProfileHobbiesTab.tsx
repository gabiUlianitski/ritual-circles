import React, { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";

import type { Hoby, UserHobyPreference, UserMeResponse } from "../api/types";

import { FormError } from "./FormError";

import { hobbyTypeLevelCanSave, HobbyTypeLevelFields, initialLevelForEntry } from "./HobbyTypeLevelFields";

import { levelKeyIsSet, parseHobyLevelKey } from "./hobyLevelKey";

import { userHobyEntryKey, userHobyEntryLabel } from "./userHobbyDisplay";



function hobbiesFromMe(me: UserMeResponse): UserHobyPreference[] {

  if (me.userHobies?.length) return me.userHobies;

  if (me.preferred_hoby_slug?.trim()) {

    return [

      {

        slug: me.preferred_hoby_slug,

        subtype: me.preferred_hoby_subtype ?? null,

        level: me.preferred_hoby_level ?? null,

      },

    ];

  }

  return [];

}



export function ProfileHobbiesTab(props: {

  me: UserMeResponse;

  onSaved: () => void | Promise<void>;

  onInfo: (msg: string | null) => void;

  onError: (msg: string | null) => void;

}) {

  const [hobies, setHobies] = useState<Hoby[]>([]);

  const [loading, setLoading] = useState(true);

  const [working, setWorking] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState<UserHobyPreference[]>(() => hobbiesFromMe(props.me));



  const [hobySlug, setHobySlug] = useState("");

  const [hobySubtype, setHobySubtype] = useState("");

  const [hobyLevel, setHobyLevel] = useState("");



  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [editSubtype, setEditSubtype] = useState("");

  const [editLevel, setEditLevel] = useState("");



  useEffect(() => {

    setSaved(hobbiesFromMe(props.me));

  }, [props.me]);



  useEffect(() => {

    let cancelled = false;

    void (async () => {

      setLoading(true);

      setError(null);

      try {

        const list = await api.getHobies();

        if (!cancelled) setHobies(Array.isArray(list) ? list : []);

      } catch (e) {

        if (!cancelled) setError(String(e));

      } finally {

        if (!cancelled) setLoading(false);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, []);



  const hobyBySlug = useMemo(() => {

    const m = new Map<string, Hoby>();

    for (const h of hobies) m.set(h.slug, h);

    return m;

  }, [hobies]);



  const selectedHoby = useMemo(() => hobies.find((h) => h.slug === hobySlug) ?? null, [hobies, hobySlug]);

  const editingEntry = useMemo(

    () => (editingKey ? saved.find((s) => userHobyEntryKey(s) === editingKey) ?? null : null),

    [editingKey, saved],

  );

  const editingCatalogue = useMemo(

    () => (editingEntry ? hobyBySlug.get(editingEntry.slug) : undefined),

    [editingEntry, hobyBySlug],

  );



  async function persist(next: UserHobyPreference[], message: string) {

    setWorking(true);

    setError(null);

    props.onError(null);

    props.onInfo(null);

    try {

      await api.patchMe({ userHobies: next });

      setSaved(next);

      props.onInfo(message);

      await props.onSaved();

    } catch (e) {

      const msg = String(e);

      setError(msg);

      props.onError(msg);

    } finally {

      setWorking(false);

    }

  }



  function buildDraftEntry(slug: string, subtype: string, level: string): UserHobyPreference | null {

    if (!slug.trim()) return null;

    return {

      slug: slug.trim(),

      subtype: subtype.trim() || null,

      level: parseHobyLevelKey(level),

    };

  }



  async function addHobby() {

    const draft = buildDraftEntry(hobySlug, hobySubtype, hobyLevel);

    if (!draft) {

      setError("Choose a hobby first.");

      return;

    }

    const key = userHobyEntryKey(draft);

    if (saved.some((s) => userHobyEntryKey(s) === key)) {

      setError("You already saved this hobby with the same type and level.");

      return;

    }

    await persist([...saved, draft], "Hobby added.");

    setHobySlug("");

    setHobySubtype("");

    setHobyLevel("");

  }



  async function removeHobby(entry: UserHobyPreference) {

    const key = userHobyEntryKey(entry);

    if (editingKey === key) {

      setEditingKey(null);

      setEditSubtype("");

      setEditLevel("");

    }

    await persist(

      saved.filter((s) => userHobyEntryKey(s) !== key),

      "Hobby removed.",

    );

  }



  function startEdit(entry: UserHobyPreference) {

    setEditingKey(userHobyEntryKey(entry));

    setEditSubtype(entry.subtype?.trim() ?? "");

    setEditLevel(initialLevelForEntry(entry.level));

    setHobySlug("");

    setHobySubtype("");

    setHobyLevel("");

    setError(null);

  }



  function cancelEdit() {

    setEditingKey(null);

    setEditSubtype("");

    setEditLevel("");

  }



  async function saveEdit() {

    if (!editingEntry || !editingKey) return;

    const draft = buildDraftEntry(editingEntry.slug, editSubtype, editLevel);

    if (!draft) return;

    const newKey = userHobyEntryKey(draft);

    if (newKey !== editingKey && saved.some((s) => userHobyEntryKey(s) === newKey)) {

      setError("You already saved this hobby with the same type and level.");

      return;

    }

    const next = saved.map((s) => (userHobyEntryKey(s) === editingKey ? draft : s));

    await persist(next, "Hobby updated.");

    cancelEdit();

  }



  const canAdd = hobbyTypeLevelCanSave(selectedHoby ?? undefined, hobySubtype, hobyLevel) && Boolean(hobySlug.trim());

  const canSaveEdit = hobbyTypeLevelCanSave(editingCatalogue, editSubtype, editLevel);



  if (loading) return <div className="muted">Loading hobbies…</div>;



  return (

    <div className="stack" style={{ gap: 14 }}>

      <p className="muted" style={{ margin: 0, fontSize: "0.92em" }}>

        Add hobbies you enjoy and your level. Tap <strong>Edit</strong> on a hobby to change its type or level.

      </p>



      {error ? <FormError>{error}</FormError> : null}



      <div className="stack" style={{ gap: 8 }}>

        <div className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>

          My hobbies

        </div>

        {saved.length ? (

          <div className="hoby-icon-bag">

            {saved.map((entry) => {

              const h = hobyBySlug.get(entry.slug);

              const initial = (h?.displayName.trim().slice(0, 1) || entry.slug.slice(0, 1) || "?").toUpperCase();

              const title = userHobyEntryLabel(h, entry);

              const key = userHobyEntryKey(entry);

              const isEditing = editingKey === key;

              const needsLevel = !levelKeyIsSet(entry.level);

              return (

                <div key={key} className={`hoby-icon-tile-wrap${isEditing ? " hoby-icon-tile-wrap-editing" : ""}`}>

                  <div className="hoby-icon-tile hoby-icon-tile-static" title={title}>

                    {h?.icon ? (

                      <span className="hoby-icon-tile-emoji" aria-hidden>

                        {h.icon}

                      </span>

                    ) : (

                      <span className="hoby-icon-tile-fallback" aria-hidden>

                        {initial}

                      </span>

                    )}

                    <span className="hoby-icon-tile-name">{h?.displayName ?? entry.slug}</span>

                    {needsLevel ? <span className="hoby-icon-tile-hint">Set level</span> : null}

                  </div>

                  <button

                    type="button"

                    className="hoby-icon-tile-edit"

                    aria-label={`Edit ${title}`}

                    disabled={working}

                    onClick={() => (isEditing ? cancelEdit() : startEdit(entry))}

                  >

                    {isEditing ? "Close" : "Edit"}

                  </button>

                  <button

                    type="button"

                    className="hoby-icon-tile-remove"

                    aria-label={`Remove ${title}`}

                    disabled={working}

                    onClick={() => void removeHobby(entry)}

                  >

                    ×

                  </button>

                </div>

              );

            })}

          </div>

        ) : (

          <div className="muted" style={{ fontSize: "0.92em" }}>

            No hobbies saved yet. Add one below.

          </div>

        )}



        {editingEntry ? (

          <div className="hoby-edit-panel stack" style={{ gap: 10 }}>

            <div style={{ fontWeight: 650 }}>

              Edit {hobyBySlug.get(editingEntry.slug)?.displayName ?? editingEntry.slug}

            </div>

            <HobbyTypeLevelFields

              catalogue={editingCatalogue}

              subtype={editSubtype}

              level={editLevel}

              onSubtypeChange={setEditSubtype}

              onLevelChange={setEditLevel}

              disabled={working}

            />

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>

              <button

                type="button"

                className="primary"

                style={{ width: "auto" }}

                disabled={working || !canSaveEdit}

                onClick={() => void saveEdit()}

              >

                {working ? "Saving…" : "Save changes"}

              </button>

              <button type="button" style={{ width: "auto" }} disabled={working} onClick={cancelEdit}>

                Cancel

              </button>

            </div>

          </div>

        ) : null}

      </div>



      <div

        className="stack"

        style={{ gap: 10, paddingTop: 4, borderTop: saved.length ? "1px solid var(--card-border)" : undefined }}

      >

        <div style={{ fontWeight: 650 }}>Add a hobby</div>



        <div className="stack" style={{ gap: 6 }}>

          <label className="muted" style={{ fontSize: "0.85em" }}>

            Hobby

          </label>

          {hobies.length ? (

            <select

              value={hobySlug}

              onChange={(e) => {

                setHobySlug(e.target.value);

                setHobySubtype("");

                setHobyLevel("");

                cancelEdit();

              }}

              disabled={working}

            >

              <option value="">— Choose —</option>

              {hobies.map((h) => (

                <option key={h.id} value={h.slug}>

                  {(h.icon ? `${h.icon} ` : "") + h.displayName}

                </option>

              ))}

            </select>

          ) : (

            <div className="muted">No hobbies in the catalogue yet.</div>

          )}

        </div>



        {hobySlug ? (

          <HobbyTypeLevelFields

            catalogue={selectedHoby ?? undefined}

            subtype={hobySubtype}

            level={hobyLevel}

            onSubtypeChange={setHobySubtype}

            onLevelChange={setHobyLevel}

            disabled={working}

          />

        ) : null}



        <button type="button" className="primary" disabled={working || !canAdd} onClick={() => void addHobby()}>

          {working ? "Saving…" : "Add hobby"}

        </button>

      </div>

    </div>

  );

}


