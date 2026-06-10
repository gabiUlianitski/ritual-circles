import React, { useEffect, useId, useState } from "react";
import { api } from "../api/client";
import type { LanguageItem, UserLanguageItem } from "../api/types";

const MAX_LANGUAGES = 15;

function normCode(code: string): string {
  return code.toLowerCase();
}

function withSinglePreferred(langs: UserLanguageItem[], preferredCode: string): UserLanguageItem[] {
  const c = normCode(preferredCode);
  return langs.map((l) => ({ ...l, preferred: normCode(l.code) === c }));
}

function ensureOnePreferred(langs: UserLanguageItem[]): UserLanguageItem[] {
  if (!langs.length) return langs;
  if (langs.some((l) => l.preferred)) return langs;
  return langs.map((l, i) => ({ ...l, preferred: i === 0 }));
}

export function ProfileLanguagesPicker(props: {
  value: UserLanguageItem[];
  onChange: (value: UserLanguageItem[]) => void;
  disabled?: boolean;
}) {
  const autoId = useId();
  const inputId = `${autoId}-input`;
  const listId = `${autoId}-list`;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LanguageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const atMax = props.value.length >= MAX_LANGUAGES;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || atMax) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await api.languageSuggest({ q });
          const selected = new Set(props.value.map((l) => normCode(l.code)));
          setSuggestions(
            (Array.isArray(rows) ? rows : []).filter((r) => !selected.has(normCode(r.code))),
          );
        } catch {
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, atMax, props.value]);

  const showList =
    listOpen &&
    !atMax &&
    query.trim().length >= 1 &&
    !props.disabled &&
    (loading || suggestions.length > 0);

  function add(item: LanguageItem) {
    const code = normCode(item.code);
    if (props.value.some((l) => normCode(l.code) === code)) return;
    if (props.value.length >= MAX_LANGUAGES) return;
    const isFirst = props.value.length === 0;
    props.onChange(
      ensureOnePreferred([
        ...props.value.map((l) => ({ ...l, preferred: isFirst ? false : l.preferred })),
        { code: item.code, name: item.name, preferred: isFirst },
      ]),
    );
    setQuery("");
    setSuggestions([]);
    setListOpen(false);
    setActiveIndex(-1);
  }

  function remove(code: string) {
    const c = normCode(code);
    const next = props.value.filter((l) => normCode(l.code) !== c);
    props.onChange(ensureOnePreferred(next));
  }

  function setPreferred(code: string) {
    props.onChange(withSinglePreferred(props.value, code));
  }

  const sorted = [...props.value].sort((a, b) => {
    if (a.preferred && !b.preferred) return -1;
    if (!a.preferred && b.preferred) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="profile-languages-picker">
      {sorted.length > 0 ? (
        <ul className="profile-language-chips" aria-label="Languages you speak">
          {sorted.map((lang) => {
            const isPreferred = Boolean(lang.preferred);
            return (
              <li key={lang.code}>
                <span
                  className={`profile-language-chip${isPreferred ? " profile-language-chip--preferred" : ""}`}
                >
                  {isPreferred ? (
                    <span className="profile-language-chip-badge" aria-hidden>
                      Primary
                    </span>
                  ) : null}
                  {lang.name}
                  <button
                    type="button"
                    className={`profile-language-chip-star${isPreferred ? " is-active" : ""}`}
                    disabled={props.disabled || isPreferred}
                    aria-label={
                      isPreferred
                        ? `${lang.name} is your primary language`
                        : `Set ${lang.name} as primary language`
                    }
                    aria-pressed={isPreferred}
                    title={isPreferred ? "Primary language" : "Set as primary"}
                    onClick={() => setPreferred(lang.code)}
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    className="profile-language-chip-remove"
                    disabled={props.disabled}
                    aria-label={`Remove ${lang.name}`}
                    onClick={() => remove(lang.code)}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {props.value.length > 1 ? (
        <p className="profile-language-hint muted">Tap ★ to choose your primary language.</p>
      ) : null}
      <div className="profile-place-autocomplete">
        <input
          id={inputId}
          type="search"
          className="profile-fb-about-input profile-place-autocomplete-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && activeIndex >= 0 ? `${inputId}-opt-${activeIndex}` : undefined}
          aria-label="Add a language"
          autoComplete="off"
          placeholder={atMax ? "Maximum languages added" : "Search languages, e.g. English"}
          value={query}
          disabled={props.disabled || atMax}
          onChange={(e) => {
            setQuery(e.target.value);
            setListOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => window.setTimeout(() => setListOpen(false), 220)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showList && activeIndex >= 0 && suggestions[activeIndex]) {
              e.preventDefault();
              add(suggestions[activeIndex]);
              return;
            }
            if (!showList || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
            } else if (e.key === "Escape") {
              setListOpen(false);
              setActiveIndex(-1);
            }
          }}
        />
        {showList ? (
          <ul id={listId} className="popover-list profile-place-suggest-list" role="listbox">
            {loading ? (
              <li className="profile-place-suggest-hint muted" role="status">
                Searching…
              </li>
            ) : suggestions.length ? (
              suggestions.map((s, i) => (
                <li key={s.code} role="presentation">
                  <button
                    id={`${inputId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`profile-place-suggest-option${i === activeIndex ? " is-active" : ""}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      add(s);
                    }}
                  >
                    <span className="profile-place-suggest-text">
                      <span className="profile-place-suggest-title">{s.name}</span>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="profile-place-suggest-hint muted" role="status">
                No languages found
              </li>
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function formatLanguagesList(langs: UserLanguageItem[]): string {
  const preferred = langs.find((l) => l.preferred);
  const others = langs.filter((l) => !l.preferred).map((l) => l.name.trim()).filter(Boolean);
  if (preferred?.name?.trim()) {
    const p = preferred.name.trim();
    if (!others.length) return p;
    if (others.length === 1) return `${p} (primary) and ${others[0]}`;
    return `${p} (primary), ${others.slice(0, -1).join(", ")}, and ${others[others.length - 1]}`;
  }
  const names = langs.map((l) => l.name.trim()).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function formatLanguagesSummary(langs: UserLanguageItem[]): string {
  const line = formatLanguagesList(langs);
  if (!line) return "";
  return `Speaks ${line}`;
}
