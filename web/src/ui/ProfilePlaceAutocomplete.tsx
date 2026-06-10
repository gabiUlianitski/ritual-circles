import React, { useEffect, useId, useState } from "react";
import { api } from "../api/client";
import type { CitySuggestItem } from "../api/types";
import { IconLocation } from "./profileFbIcons";

function subtitle(displayName: string, shortName: string): string {
  const d = displayName.trim();
  const s = shortName.trim();
  if (!d || d === s) return "";
  if (d.startsWith(s + ",")) return d.slice(s.length + 1).trim();
  if (d.startsWith(s)) return d.slice(s.length).replace(/^,\s*/, "").trim();
  return d;
}

export function ProfilePlaceAutocomplete(props: {
  value: string;
  onChange: (value: string) => void;
  /** When user picks a suggestion — use for precise geocode / venue search. */
  onPick?: (item: CitySuggestItem) => void;
  placeholder: string;
  disabled?: boolean;
  countryCode?: string | null;
  ariaLabel: string;
}) {
  const autoId = useId();
  const inputId = `${autoId}-input`;
  const listId = `${autoId}-list`;

  const [query, setQuery] = useState(props.value);
  const [suggestions, setSuggestions] = useState<CitySuggestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(props.value);
  }, [props.value]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await api.citySuggest({
            q,
            ...(props.countryCode?.trim() ? { country: props.countryCode.trim() } : {}),
          });
          setSuggestions(Array.isArray(rows) ? rows : []);
        } catch {
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [query, props.countryCode]);

  const showList =
    listOpen && query.trim().length >= 2 && !props.disabled && (loading || suggestions.length > 0);

  function pick(item: CitySuggestItem) {
    const stored = item.displayName.trim() || item.shortName.trim();
    setQuery(stored);
    props.onChange(stored);
    props.onPick?.(item);
    setSuggestions([]);
    setListOpen(false);
    setActiveIndex(-1);
  }

  function commitFreeText() {
    const t = query.trim();
    if (t) props.onChange(t);
  }

  return (
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
        aria-label={props.ariaLabel}
        autoComplete="off"
        placeholder={props.placeholder}
        value={query}
        disabled={props.disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setListOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setListOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setListOpen(false);
            commitFreeText();
          }, 220);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (showList && activeIndex >= 0 && suggestions[activeIndex]) {
              e.preventDefault();
              pick(suggestions[activeIndex]);
            } else {
              commitFreeText();
              setListOpen(false);
            }
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
              Searching places…
            </li>
          ) : suggestions.length ? (
            suggestions.map((s, i) => {
              const sub = subtitle(s.displayName, s.shortName);
              return (
                <li key={`${s.displayName}-${i}`} role="presentation">
                  <button
                    id={`${inputId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`profile-place-suggest-option${i === activeIndex ? " is-active" : ""}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      pick(s);
                    }}
                  >
                    <span className="profile-place-suggest-pin" aria-hidden>
                      <IconLocation />
                    </span>
                    <span className="profile-place-suggest-text">
                      <span className="profile-place-suggest-title">{s.shortName}</span>
                      {sub ? <span className="profile-place-suggest-sub muted">{sub}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="profile-place-suggest-hint muted" role="status">
              No places found — try another spelling
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
