import React, { useEffect, useId, useRef, useState } from "react";
import { api } from "../api/client";
import type { CitySuggestItem } from "../api/types";

export function CityAutocompleteField(props: {
  /** Omit for worldwide city search (create-circle step). */
  countryCode?: string;
  value: string;
  selectedDisplay: string;
  onValueChange: (query: string) => void;
  onSelect: (item: CitySuggestItem) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  /** Hide helper lines under the field (e.g. create-circle step). */
  compact?: boolean;
}) {
  const autoId = useId();
  const inputId = props.id ?? `city-ac-${autoId}`;
  const listId = `${inputId}-listbox`;
  const fetchSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [suggestions, setSuggestions] = useState<CitySuggestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const q = props.value.trim();
    if (q.length < 2) {
      abortRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      setSearchError(false);
      return;
    }
    const cc = props.countryCode?.trim();
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setSearchError(false);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await api.citySuggest(
            { q, ...(cc ? { country: cc } : {}) },
            { signal: ac.signal },
          );
          if (seq !== fetchSeqRef.current || ac.signal.aborted) return;
          setSuggestions(rows);
          setSearchError(false);
        } catch (e) {
          if (seq !== fetchSeqRef.current || ac.signal.aborted) return;
          const name = e instanceof Error ? e.name : "";
          if (name === "AbortError") return;
          setSuggestions([]);
          setSearchError(true);
        } finally {
          if (seq === fetchSeqRef.current && !ac.signal.aborted) setLoading(false);
        }
      })();
    }, 400);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [props.value, props.countryCode]);

  const showList =
    listOpen &&
    props.value.trim().length >= 2 &&
    !props.disabled &&
    (loading || suggestions.length > 0 || searchError || !props.selectedDisplay);

  function pick(item: CitySuggestItem) {
    props.onSelect(item);
    setSuggestions([]);
    setListOpen(false);
    setActiveIndex(-1);
    setSearchError(false);
  }

  return (
    <div className="city-autocomplete-wrap stack" style={{ gap: 6 }}>
      <label htmlFor={inputId} className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>
        {props.label ?? "City"}
      </label>
      <div className="city-autocomplete-input-wrap">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={
            showList && activeIndex >= 0 ? `${inputId}-opt-${activeIndex}` : undefined
          }
          autoComplete="off"
          placeholder="Start typing — pick from the list"
          value={props.value}
          disabled={props.disabled}
          onChange={(e) => {
            props.onValueChange(e.target.value);
            setListOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => window.setTimeout(() => setListOpen(false), 220)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showList && activeIndex >= 0 && suggestions[activeIndex]) {
              e.preventDefault();
              pick(suggestions[activeIndex]);
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
          <ul id={listId} className="popover-list city-autocomplete-list" role="listbox">
            {loading ? (
              <li className="city-autocomplete-hint muted" role="status">
                Searching cities…
              </li>
            ) : suggestions.length ? (
              suggestions.map((s, i) => (
                <li key={`${s.displayName}-${i}`} role="presentation">
                  <button
                    id={`${inputId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    className={i === activeIndex ? "is-active" : ""}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      pick(s);
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{s.shortName}</div>
                    <div className="muted" style={{ fontSize: "0.85em" }}>
                      {s.displayName}
                    </div>
                  </button>
                </li>
              ))
            ) : (
              <li className="city-autocomplete-hint muted" role="status">
                {searchError
                  ? "Couldn’t search cities — check your connection and try again"
                  : "No cities found — try another spelling"}
              </li>
            )}
          </ul>
        ) : null}
      </div>
      {!props.compact && props.selectedDisplay ? (
        <div className="muted" style={{ fontSize: "0.85em" }}>
          Selected: {props.selectedDisplay}
        </div>
      ) : null}
      {!props.compact && props.value.trim().length >= 2 && !props.selectedDisplay ? (
        <div className="muted" style={{ fontSize: "0.82em" }}>
          Choose a city from the list above to continue.
        </div>
      ) : null}
    </div>
  );
}
