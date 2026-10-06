import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Hoby, UserHobyPreference, UserMeResponse } from "../api/types";
import { FormError } from "./FormError";
import { parseHobyTypesNested } from "./hobyMetadata";
import { LandingIllustration } from "./LandingIllustration";
import { selectedTypeKeys } from "./userHobbyDisplay";

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

function interestName(h: Hoby | undefined, entry: UserHobyPreference): string {
  return h?.displayName?.trim() || entry.slug;
}

/** One card per hobby. Older rows that stored a single subtype are folded in. */
function groupByHobby(entries: UserHobyPreference[]): UserHobyPreference[] {
  const grouped = new Map<string, UserHobyPreference>();
  for (const entry of entries) {
    const key = entry.slug.trim().toLowerCase();
    const types = selectedTypeKeys(entry);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, types });
      continue;
    }
    const merged = [...selectedTypeKeys(existing)];
    for (const typeKey of types) {
      if (!merged.some((item) => item.toLowerCase() === typeKey.toLowerCase())) merged.push(typeKey);
    }
    existing.types = merged;
    existing.subtype = merged[0] ?? existing.subtype ?? null;
    if (entry.experienceLevel) existing.experienceLevel = entry.experienceLevel;
  }
  return [...grouped.values()];
}

const LEVEL_MARK: Record<string, string> = {
  beginner: "🌱",
  intermediate: "🚀",
  advanced: "⭐",
  expert: "🏆",
};

function typeParts(hoby: Hoby | undefined, key: string): { key: string; icon: string; label: string } {
  const rows = parseHobyTypesNested(hoby?.types);
  const match = rows.find(
    (row) => row.key.toLowerCase() === key.toLowerCase() || (row.label ?? "").trim().toLowerCase() === key.toLowerCase(),
  );
  const label =
    match?.label?.trim() ||
    key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { key, icon: match?.icon?.trim() ?? "", label };
}

function experienceId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim().toLowerCase();
  return LEVEL_MARK[id] ? id : null;
}

export function ProfileHobbiesTab(props: {
  me: UserMeResponse;
  onSaved: () => void | Promise<void>;
  onInfo: (msg: string | null) => void;
  onError: (msg: string | null) => void;
  onOpenHobby?: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<UserHobyPreference[]>(() => hobbiesFromMe(props.me));
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setSaved(hobbiesFromMe(props.me));
  }, [props.me]);

  useEffect(() => {
    let cancelled = false;
    api
      .getHobiesSaved()
      .then((list) => {
        if (!cancelled) setHobies(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bySlug = useMemo(() => new Map(hobies.map((hoby) => [hoby.slug.trim().toLowerCase(), hoby])), [hobies]);
  const interests = useMemo(() => groupByHobby(saved), [saved]);

  async function persist(next: UserHobyPreference[], message: string): Promise<boolean> {
    setWorking(true);
    setError(null);
    props.onError(null);
    props.onInfo(null);
    try {
      await api.patchMe({ userHobies: next });
      setSaved(next);
      props.onInfo(message);
      await props.onSaved();
      return true;
    } catch (e) {
      const msg = String(e);
      setError(msg);
      props.onError(msg);
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function addInterest(hoby: Hoby, typeKeys: string[], experienceLevel: string) {
    if (interests.some((entry) => entry.slug.trim().toLowerCase() === hoby.slug.trim().toLowerCase())) {
      setError(t("profileHobbies.duplicate"));
      return;
    }
    const ok = await persist(
      [
        ...saved,
        { slug: hoby.slug, subtype: typeKeys[0] ?? null, types: typeKeys, level: null, experienceLevel },
      ],
      t("profileHobbies.added"),
    );
    if (ok) setAdding(false);
  }

  if (loading) return <div className="muted">{t("common.loading")}</div>;

  return (
    <div className="stack profile-hobbies">
      <div className="profile-hobbies-head">
        <div>
          <h2>{t("profileHobbies.yourInterests")}</h2>
          <p>{t("profileHobbies.yourInterestsSubtitle")}</p>
        </div>
        <button type="button" className="primary profile-hobbies-add" disabled={working} onClick={() => setAdding(true)}>
          {t("profileHobbies.addInterest")}
        </button>
      </div>

      <p className="profile-interest-count">{t("profileHobbies.interestsCount", { count: interests.length })}</p>

      {error && !adding ? <FormError>{error}</FormError> : null}

      {interests.length ? (
        <div className="profile-interest-grid">
          {interests.map((entry) => {
            const hoby = bySlug.get(entry.slug.trim().toLowerCase());
            const chosen = selectedTypeKeys(entry).map((key) => typeParts(hoby, key));
            const level = experienceId(entry.experienceLevel);
            return (
              <button
                key={entry.slug}
                type="button"
                className="profile-interest-card"
                onClick={() => props.onOpenHobby?.(entry.slug)}
              >
                <span className="profile-interest-icon" aria-hidden>
                  {hoby?.icon?.trim() || "✦"}
                </span>
                <span className="profile-interest-name">{interestName(hoby, entry)}</span>
                {chosen.length ? (
                  <span className="profile-interest-types-block">
                    <span className="profile-interest-types-label">{t("profileHobbies.typesLabel")}</span>
                    <span className="profile-interest-types-line">
                      {chosen.map((item, index) => (
                        <span key={item.key}>
                          {index > 0 ? <span aria-hidden> • </span> : null}
                          {item.icon ? <span aria-hidden>{`${item.icon} `}</span> : null}
                          {item.label}
                        </span>
                      ))}
                    </span>
                  </span>
                ) : null}
                {level ? (
                  <span className="profile-interest-level">
                    <span aria-hidden>{LEVEL_MARK[level]}</span>
                    {t(`profileHobbies.experienceLevels.${level}.name`)}
                  </span>
                ) : null}
              </button>
            );
          })}
          <button type="button" className="profile-interest-card profile-interest-card--add" onClick={() => setAdding(true)}>
            <span className="profile-interest-icon profile-interest-icon--plus" aria-hidden>
              +
            </span>
            <span className="profile-interest-name">{t("profileHobbies.addInterestCard")}</span>
            <span className="profile-interest-meta">{t("profileHobbies.addInterestHint")}</span>
          </button>
        </div>
      ) : (
        <div className="profile-interests-empty">
          <LandingIllustration />
          <h3>{t("profileHobbies.emptyTitle")}</h3>
          <p>{t("profileHobbies.emptyBody")}</p>
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            {t("profileHobbies.addFirst")}
          </button>
        </div>
      )}

      {adding ? (
        <AddInterestDialog
          hobies={hobies.filter(
            (hoby) => !interests.some((entry) => entry.slug.trim().toLowerCase() === hoby.slug.trim().toLowerCase()),
          )}
          working={working}
          error={error}
          onCancel={() => {
            setError(null);
            setAdding(false);
          }}
          onSubmit={addInterest}
        />
      ) : null}
    </div>
  );
}

const EXPERIENCE_IDS = ["beginner", "intermediate", "advanced", "expert"] as const;

function AddInterestDialog(props: {
  hobies: Hoby[];
  working: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (hoby: Hoby, typeKeys: string[], experienceLevel: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Hoby | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [experience, setExperience] = useState<string | null>(null);

  const matches = props.hobies.filter((hoby) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [hoby.displayName, hoby.canonicalDisplayName, hoby.heDisplayName, hoby.slug].some((part) =>
      (part ?? "").toLowerCase().includes(q),
    );
  });
  const typeRows = parseHobyTypesNested(picked?.types);

  function toggle(key: string) {
    setSelected((current) =>
      current.some((item) => item.toLowerCase() === key.toLowerCase())
        ? current.filter((item) => item.toLowerCase() !== key.toLowerCase())
        : [...current, key],
    );
  }

  return (
    <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="interest-add-title">
      <div className="hoby-cat-modal-card profile-interest-dialog">
        <h2 id="interest-add-title">{picked ? picked.displayName : t("profileHobbies.chooseHobby")}</h2>
        {picked ? <p>{t("profileHobbies.chooseTypes")}</p> : null}
        {!picked ? (
          <>
            <label className="hoby-cat-field">
              <span>{t("profileHobbies.searchHobby")}</span>
              <input autoFocus value={query} placeholder={t("profileHobbies.searchHobby")} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="hobby-type-list">
              {matches.slice(0, 12).map((hoby) => (
                <button
                  key={hoby.slug}
                  type="button"
                  className="hobby-type-option"
                  onClick={() => {
                    setPicked(hoby);
                    setSelected([]);
                  }}
                >
                  <span aria-hidden>{hoby.icon?.trim() || "✦"}</span>
                  <span>{hoby.displayName}</span>
                </button>
              ))}
              {!matches.length ? <p className="muted">{t("profileHobbies.noHobbyMatch")}</p> : null}
            </div>
          </>
        ) : (
          <div className="hobby-type-list">
            {typeRows.length ? (
              typeRows.map((row) => {
                const on = selected.some((key) => key.toLowerCase() === row.key.toLowerCase());
                return (
                  <label key={row.key} className={`hobby-type-check${on ? " is-selected" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(row.key)} />
                    <span>
                      {row.icon?.trim() ? `${row.icon.trim()} ` : ""}
                      {row.label?.trim() || row.key}
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="muted">{t("profileHobbies.noTypes")}</p>
            )}
          </div>
        )}
        {picked ? (
          <div className="profile-interest-level-pick" role="group" aria-label={t("profileHobbies.experienceTitle")}>
            <p>{t("profileHobbies.experienceTitle")}</p>
            <div className="profile-interest-level-picks">
              {EXPERIENCE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={experience === id ? "is-selected" : ""}
                  aria-pressed={experience === id}
                  onClick={() => setExperience(id)}
                >
                  <span aria-hidden>{LEVEL_MARK[id]}</span>
                  {t(`profileHobbies.experienceLevels.${id}.name`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {props.error ? <FormError>{props.error}</FormError> : null}
        <div className="profile-interest-dialog-actions">
          {picked ? (
            <button
              type="button"
              className="primary"
              disabled={props.working || !experience || (typeRows.length > 0 && selected.length === 0)}
              onClick={() => void props.onSubmit(picked, selected, experience ?? "")}
            >
              {t("profileHobbies.addInterest")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={props.working}
            onClick={() => {
              if (picked) {
                setPicked(null);
                setSelected([]);
                setExperience(null);
                return;
              }
              props.onCancel();
            }}
          >
            {picked ? t("common.back") : t("profileHobbies.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
