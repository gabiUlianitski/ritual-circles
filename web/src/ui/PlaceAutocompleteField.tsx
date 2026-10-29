import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { PlaceSuggestion } from "../api/types";
import { placeFromSuggestion, type SelectedPlace } from "../venueCardDisplay";
import { PlaceCategoryIcon, placeIconKind } from "./PlaceCategoryIcon";

export const PLACE_SEARCH_MIN_CHARS = 2;
export const PLACE_SEARCH_DEBOUNCE_MS = 300;
export const PLACE_SEARCH_MAX_RESULTS = 6;

type SearchStatus = "idle" | "loading" | "done" | "error";

/** Search for one place inside an already selected city (Circle create/edit, Activity location). */
export function PlaceAutocompleteField(props: {
  id: string;
  city: string;
  countryCode?: string;
  cityLat?: number | null;
  cityLon?: number | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (place: SelectedPlace) => void;
  disabled?: boolean;
  label?: string;
  /** The parent already labels this input. */
  hideLabel?: boolean;
}) {
  const { t } = useTranslation();
  const listId = `${props.id}-listbox`;
  const statusId = `${props.id}-status`;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const q = props.query.trim();
  const city = props.city.trim();

  useEffect(() => {
    abortRef.current?.abort();
    const seq = ++seqRef.current;
    if (q.length < PLACE_SEARCH_MIN_CHARS || !city) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await api.placeSuggest(
            {
              q,
              city,
              country: props.countryCode,
              limit: PLACE_SEARCH_MAX_RESULTS,
              lat: props.cityLat,
              lon: props.cityLon,
            },
            { signal: ac.signal },
          );
          if (seq !== seqRef.current || ac.signal.aborted) return;
          setResults(rows.slice(0, PLACE_SEARCH_MAX_RESULTS));
          setStatus("done");
          setActiveIndex(-1);
        } catch {
          if (seq !== seqRef.current || ac.signal.aborted) return;
          setResults([]);
          setStatus("error");
        }
      })();
    }, PLACE_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q, city, props.countryCode, props.cityLat, props.cityLon]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const showList = open && !props.disabled && q.length >= PLACE_SEARCH_MIN_CHARS;

  function pick(row: PlaceSuggestion) {
    props.onSelect(placeFromSuggestion(row));
    setOpen(false);
    setActiveIndex(-1);
  }

  function clear() {
    props.onQueryChange("");
    setResults([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function secondaryLine(row: PlaceSuggestion): string {
    const rowCity = row.cityName?.trim() ?? "";
    const otherCountry =
      row.countryCode && props.countryCode && row.countryCode.toUpperCase() !== props.countryCode.toUpperCase();
    const sharedName = results.filter((item) => item.name.trim() === row.name.trim()).length > 1;
    const street = sharedName ? row.shortAddress?.split(",")[0]?.trim() ?? "" : "";
    const streetIsCity = street.toLowerCase() === rowCity.toLowerCase();
    return [street && !streetIsCity ? street : "", rowCity, otherCountry ? row.countryName?.trim() : ""]
      .filter(Boolean)
      .join(", ");
  }

  const announcement =
    status === "loading"
      ? t("placeSearch.searching")
      : status === "error"
        ? t("placeSearch.unavailable")
        : status === "done"
          ? results.length
            ? t("placeSearch.resultCount", { count: results.length })
            : t("placeSearch.noResults")
          : "";

  return (
    <div ref={wrapRef} className="place-ac">
      {props.hideLabel ? null : (
        <label htmlFor={props.id} className="sr-only">
          {props.label ?? t("placeSearch.placeholder", { city })}
        </label>
      )}
      <div className="place-ac-input-wrap">
        <svg className="place-ac-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id={props.id}
          className="place-ac-input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && activeIndex >= 0 ? `${props.id}-opt-${activeIndex}` : undefined}
          aria-describedby={statusId}
          autoComplete="off"
          dir="auto"
          placeholder={t("placeSearch.placeholder", { city })}
          value={props.query}
          disabled={props.disabled}
          onChange={(e) => {
            props.onQueryChange(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (!results.length) return;
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) =>
                e.key === "ArrowDown" ? (i + 1) % results.length : i <= 0 ? results.length - 1 : i - 1,
              );
              return;
            }
            if (e.key === "Enter" && showList) {
              e.preventDefault();
              if (activeIndex >= 0 && results[activeIndex]) pick(results[activeIndex]);
            }
          }}
        />
        {props.query ? (
          <button
            type="button"
            className="place-ac-clear"
            aria-label={t("placeSearch.clear")}
            disabled={props.disabled}
            onClick={clear}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div id={statusId} className="sr-only" role="status" aria-live="polite">
        {showList ? announcement : ""}
      </div>

      {showList ? (
        <ul id={listId} className="place-ac-list" role="listbox" aria-label={t("placeSearch.resultsLabel")}>
          {results.map((row, i) => (
            <li
              key={`${row.name}-${row.latitude ?? i}-${row.longitude ?? i}`}
              id={`${props.id}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`place-ac-option${i === activeIndex ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => pick(row)}
            >
              <span className="place-ac-option-icon">
                <PlaceCategoryIcon category={row.category} />
              </span>
              <span className="place-ac-option-text">
                <span className="place-ac-option-name" dir="auto">
                  {row.name}
                </span>
                {secondaryLine(row) ? (
                  <span className="place-ac-option-city" dir="auto">
                    {secondaryLine(row)}
                  </span>
                ) : null}
              </span>
              {placeIconKind(row.category) !== "generic" ? (
                <span className="place-ac-option-category">{t(`placeSearch.category.${placeIconKind(row.category)}`)}</span>
              ) : null}
            </li>
          ))}
          {!results.length ? (
            <li className="place-ac-hint" role="presentation">
              {status === "loading" ? (
                <span>{t("placeSearch.searching")}</span>
              ) : status === "error" ? (
                <span>{t("placeSearch.unavailable")}</span>
              ) : status === "done" ? (
                <>
                  <span className="place-ac-hint-title">{t("placeSearch.noResults")}</span>
                  <span className="place-ac-hint-sub">{t("placeSearch.tryAnother")}</span>
                </>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
