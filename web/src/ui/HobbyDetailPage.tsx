import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Hoby, UserHobyPreference, UserMeResponse } from "../api/types";
import { FormError } from "./FormError";
import { parseHobyTypesNested } from "./hobyMetadata";
import { HobbyVisual } from "./HomeVisuals";
import { selectedTypeKeys } from "./userHobbyDisplay";

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
const LEVEL_MARK: Record<(typeof EXPERIENCE_LEVELS)[number], string> = {
  beginner: "🌱",
  intermediate: "🚀",
  advanced: "⭐",
  expert: "🏆",
};
type ExperienceLevelId = (typeof EXPERIENCE_LEVELS)[number];

function asExperience(raw: string | null | undefined): ExperienceLevelId | null {
  const id = (raw ?? "").trim().toLowerCase();
  return (EXPERIENCE_LEVELS as readonly string[]).includes(id) ? (id as ExperienceLevelId) : null;
}

function hobbiesFromMe(me: UserMeResponse): UserHobyPreference[] {
  if (me.userHobies?.length) return me.userHobies;
  if (me.preferred_hoby_slug?.trim()) {
    return [{ slug: me.preferred_hoby_slug, subtype: me.preferred_hoby_subtype ?? null, level: me.preferred_hoby_level ?? null }];
  }
  return [];
}

function sameSlug(entry: UserHobyPreference, slug: string): boolean {
  return entry.slug.trim().toLowerCase() === slug.trim().toLowerCase();
}

/** Profile interest: the shared hobby, the types this user chose, and their experience. */
export function HobbyDetailPage(props: {
  slug: string;
  onBack: () => void;
  onInterestRemoved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [hoby, setHoby] = useState<Hoby | null>(null);
  const [entries, setEntries] = useState<UserHobyPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [stored, setStored] = useState<string[]>([]);
  const [experience, setExperience] = useState<ExperienceLevelId | null>(null);
  const [storedExperience, setStoredExperience] = useState<ExperienceLevelId | null>(null);
  const [working, setWorking] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const slugKey = props.slug.trim().toLowerCase();
  const typeRows = useMemo(() => parseHobyTypesNested(hoby?.types), [hoby]);

  function applyMine(list: UserHobyPreference[]) {
    const mine = list.filter((entry) => sameSlug(entry, slugKey));
    const keys: string[] = [];
    for (const entry of mine) {
      for (const key of selectedTypeKeys(entry)) {
        if (!keys.some((item) => item.toLowerCase() === key.toLowerCase())) keys.push(key);
      }
    }
    const level = asExperience(mine.find((entry) => entry.experienceLevel)?.experienceLevel);
    setSelected(keys);
    setStored(keys);
    setExperience(level);
    setStoredExperience(level);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedNote(false);
    setConfirmRemove(false);
    Promise.all([api.getHobiesSaved(), api.getMe()])
      .then(([list, me]) => {
        if (cancelled) return;
        setHoby(list.find((item) => item.slug.trim().toLowerCase() === slugKey) ?? null);
        const next = hobbiesFromMe(me);
        setEntries(next);
        applyMine(next);
      })
      .catch(() => {
        if (!cancelled) setError(t("hobbyDetail.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slugKey, i18n.language, t]);

  const typesDirty =
    selected.length !== stored.length || selected.some((key, index) => key.toLowerCase() !== stored[index]?.toLowerCase());
  const experienceDirty = experience !== storedExperience;

  function labelFor(key: string): string {
    const label = typeRows.find((row) => row.key.toLowerCase() === key.toLowerCase())?.label?.trim();
    if (label) return label;
    return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function toggle(key: string) {
    setSavedNote(false);
    setSelected((current) =>
      current.some((item) => item.toLowerCase() === key.toLowerCase())
        ? current.filter((item) => item.toLowerCase() !== key.toLowerCase())
        : [...current, key],
    );
  }

  async function save(nextTypes: string[], nextExperience: ExperienceLevelId | null) {
    setWorking(true);
    setError(null);
    setSavedNote(false);
    try {
      const me = await api.getMe();
      const current = hobbiesFromMe(me);
      const kept = current.filter((entry) => !sameSlug(entry, slugKey));
      const previous = current.find((entry) => sameSlug(entry, slugKey));
      kept.push({
        slug: previous?.slug || props.slug,
        subtype: nextTypes[0] ?? null,
        types: nextTypes,
        level: previous?.level ?? null,
        experienceLevel: nextExperience,
      });
      await api.patchMe({ userHobies: kept });
      setEntries(kept);
      setSelected(nextTypes);
      setStored(nextTypes);
      setExperience(nextExperience);
      setStoredExperience(nextExperience);
      setSavedNote(true);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d{3}:\s*/, "") : String(e));
    } finally {
      setWorking(false);
    }
  }

  async function remove() {
    setWorking(true);
    setError(null);
    try {
      const me = await api.getMe();
      const next = hobbiesFromMe(me).filter((entry) => !sameSlug(entry, slugKey));
      await api.patchMe({ userHobies: next });
      props.onInterestRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d{3}:\s*/, "") : String(e));
      setWorking(false);
    }
  }

  const onProfile = entries.some((entry) => sameSlug(entry, slugKey));

  return (
    <div className="stack hobby-detail">
      <button type="button" className="home-section-link hobby-detail-back" onClick={props.onBack}>
        {t("common.back")}
      </button>

      {loading ? <p className="muted">{t("common.loading")}</p> : null}
      {error ? <FormError>{error}</FormError> : null}

      {!loading && !error ? (
        <>
          <header className="hobby-detail-hero">
            <HobbyVisual slug={props.slug} icon={hoby?.icon} size="md" />
            <div className="hobby-detail-hero-copy">
              <h1>{hoby?.displayName || props.slug}</h1>
              {experience || selected.length ? (
                <div className="hobby-detail-hero-facts">
                  {experience ? (
                    <span className="profile-interest-level">
                      <span aria-hidden>{LEVEL_MARK[experience]}</span>
                      {t(`profileHobbies.experienceLevels.${experience}.name`)}
                    </span>
                  ) : null}
                  {selected.length ? (
                    <span className="hobby-detail-types-count">
                      {t("profileHobbies.typesSelected", { count: selected.length })}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {hoby?.discoveryDescription || hoby?.shortDescription ? (
                <p>{hoby.discoveryDescription || hoby.shortDescription}</p>
              ) : null}
            </div>
          </header>

          {typeRows.length ? (
            <section className="hobby-pref" aria-label={t("profileHobbies.yourTypes")}>
              <h2>{t("profileHobbies.yourTypes")}</h2>
              <p>{t("profileHobbies.chooseTypes")}</p>
              <div className="hobby-level-choices">
                {typeRows.map((row) => {
                  const on = selected.some((key) => key.toLowerCase() === row.key.toLowerCase());
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`hobby-level-choice hobby-type-choice${on ? " is-selected" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(row.key)}
                    >
                      <span className="hobby-type-choice-head">
                        {row.icon?.trim() ? (
                          <span className="hobby-level-mark" aria-hidden>
                            {row.icon.trim()}
                          </span>
                        ) : null}
                        <span className="hobby-level-name">{labelFor(row.key)}</span>
                        {on ? (
                          <span className="hobby-choice-check" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </span>
                      {row.description ? <span className="hobby-level-body">{row.description}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="hobby-pref" aria-label={t("profileHobbies.experienceTitle")}>
            <h2>{t("profileHobbies.experienceTitle")}</h2>
            <p>{t("profileHobbies.experiencePrompt")}</p>
            <div className="hobby-level-choices">
              {EXPERIENCE_LEVELS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`hobby-level-choice${experience === id ? " is-selected" : ""}`}
                  aria-pressed={experience === id}
                  onClick={() => {
                    setSavedNote(false);
                    setExperience(id);
                  }}
                >
                  <span className="hobby-level-mark" aria-hidden>
                    {LEVEL_MARK[id]}
                  </span>
                  <span className="hobby-level-name">{t(`profileHobbies.experienceLevels.${id}.name`)}</span>
                  <span className="hobby-level-body">{t(`profileHobbies.experienceLevels.${id}.body`)}</span>
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            className="primary"
            disabled={working || !onProfile || (!typesDirty && !experienceDirty)}
            onClick={() => void save(selected, experience)}
          >
            {t("profileHobbies.savePreferences")}
          </button>
          {savedNote ? <p className="hobby-pref-note">{t("profileHobbies.preferencesSaved")}</p> : null}

          <section className="hobby-detail-manage">
            <button type="button" className="is-danger" disabled={working} onClick={() => setConfirmRemove(true)}>
              {t("profileHobbies.deleteInterest")}
            </button>
          </section>

          {confirmRemove ? (
            <div className="hoby-cat-modal" role="dialog" aria-modal="true">
              <div className="hoby-cat-modal-card profile-interest-dialog">
                <h2>{t("profileHobbies.removeTitle")}</h2>
                <p>{t("profileHobbies.removeBody")}</p>
                <div className="profile-interest-dialog-actions">
                  <button type="button" disabled={working} onClick={() => setConfirmRemove(false)}>
                    {t("profileHobbies.cancel")}
                  </button>
                  <button type="button" className="profile-interest-remove" disabled={working} onClick={() => void remove()}>
                    {t("profileHobbies.remove")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
