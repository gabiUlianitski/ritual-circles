import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CitySuggestItem, VenueSuggestionItem } from "../api/types";
import { findVenueSuggestionsForHobby } from "../venueSuggestForHobby";
import { placeFromVenue, type SelectedPlace } from "../venueCardDisplay";
import { CityAutocompleteField } from "./CityAutocompleteField";
import { PlaceAutocompleteField } from "./PlaceAutocompleteField";
import { PlaceCategoryIcon, placeIconKind } from "./PlaceCategoryIcon";

const TOP_SUGGESTIONS = 3;
/** Show suggestions only when they arrive inside this window. Later replies are ignored. */
export const TOP_SUGGESTIONS_UI_MS = 1_500;

function usableVenue(v: VenueSuggestionItem): boolean {
  const name = (v.displayName || v.name || "").trim();
  return Boolean(name) && !/\(city area\)/i.test(v.name ?? "");
}

export function CreateCircleLocationStep(props: {
  cityQuery: string;
  citySelected: string;
  cityShortName: string;
  countryCode: string;
  cityLat: number | null;
  cityLon: number | null;
  onCityQueryChange: (query: string) => void;
  onCitySelect: (item: CitySuggestItem) => void;
  place: SelectedPlace | null;
  onPlaceChange: (place: SelectedPlace | null) => void;
  ritualType: string;
  ritualSubtype: string;
  ritualLevel: string | number | null;
  suggestionLabel: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [editingCity, setEditingCity] = useState(!props.citySelected.trim());
  const [placeQuery, setPlaceQuery] = useState("");
  const [changingPlace, setChangingPlace] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [topVenues, setTopVenues] = useState<VenueSuggestionItem[]>([]);
  const topRequestRef = useRef(0);

  const cityChosen = Boolean(props.citySelected.trim());

  useEffect(() => {
    setPlaceQuery("");
    setChangingPlace(false);
    setShowDetails(false);
    if (cityChosen) setEditingCity(false);
  }, [props.citySelected, cityChosen]);

  useEffect(() => {
    setTopVenues([]);
    const requestId = ++topRequestRef.current;
    if (!cityChosen || !props.ritualType.trim()) return;
    const ac = new AbortController();
    let accept = true;
    const timer = window.setTimeout(() => {
      accept = false;
    }, TOP_SUGGESTIONS_UI_MS);
    findVenueSuggestionsForHobby(
      {
        address: props.citySelected,
        ritualType: props.ritualType,
        ritualSubtype: props.ritualSubtype || null,
        ritualLevel: props.ritualLevel,
        countryCode: props.countryCode || null,
      },
      { signal: ac.signal },
    )
      .then((r) => {
        if (!accept || requestId !== topRequestRef.current || ac.signal.aborted) return;
        setTopVenues((r.suggestions ?? []).filter(usableVenue).slice(0, TOP_SUGGESTIONS));
      })
      .catch(() => {
        /* Optional help. A slow or failed search leaves the step as it is. */
      });
    return () => {
      accept = false;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [cityChosen, props.citySelected, props.countryCode, props.ritualType, props.ritualSubtype, props.ritualLevel]);

  function choosePlace(place: SelectedPlace) {
    props.onPlaceChange(place);
    setPlaceQuery("");
    setChangingPlace(false);
    setShowDetails(false);
    window.setTimeout(() => document.getElementById("create-location-remove")?.focus(), 0);
  }

  function changeCity() {
    if (props.place && !window.confirm(t("createCircle.cityChangeConfirm"))) return;
    props.onPlaceChange(null);
    setEditingCity(true);
    window.setTimeout(() => document.getElementById("create-circle-city")?.focus(), 0);
  }

  function removePlace() {
    props.onPlaceChange(null);
    setChangingPlace(false);
    setShowDetails(false);
    window.setTimeout(() => document.getElementById("create-circle-place")?.focus(), 0);
  }

  const searching = placeQuery.trim().length > 0;
  const showSearch = cityChosen && (!props.place || changingPlace);
  const showTop = showSearch && !searching && topVenues.length > 0;

  return (
    <section className="create-venue-step create-location-step stack" aria-labelledby="create-step-2">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="create-step-2" className="create-circle-step-title">
          {t("createCircle.locationTitle")}
        </h2>
        <p className="create-location-helper muted">{t("createCircle.locationHelp")}</p>
      </div>

      <div className="create-location-block stack">
        {editingCity || !cityChosen ? (
          <label className="create-location-label" htmlFor="create-circle-city">
            {t("createCircle.cityLabel")} <span aria-hidden>*</span>
          </label>
        ) : (
          <span className="create-location-label">
            {t("createCircle.cityLabel")} <span aria-hidden>*</span>
          </span>
        )}
        {editingCity || !cityChosen ? (
          <div className="create-venue-city-field">
            <CityAutocompleteField
              id="create-circle-city"
              value={props.cityQuery}
              selectedDisplay={props.citySelected}
              onValueChange={props.onCityQueryChange}
              onSelect={props.onCitySelect}
              disabled={props.disabled}
              hideLabel
              hasVisibleLabel
              compact
              placeholder={t("createCircle.citySearch")}
            />
          </div>
        ) : (
          <div className="create-venue-city-pill">
            <PlaceCategoryIcon category="city" className="create-location-city-icon" />
            <span className="create-venue-city-pill-name" dir="auto">
              {props.cityShortName || props.citySelected.split(",")[0]}
            </span>
            <button type="button" className="create-venue-city-change" disabled={props.disabled} onClick={changeCity}>
              {t("createCircle.cityChange")}
            </button>
          </div>
        )}
      </div>

      {cityChosen ? (
        <div className="create-location-block stack">
          <div className="create-location-place-head">
            <span className="create-location-label">{t("createCircle.placeTitle")}</span>
            <span className="create-location-optional">{t("createCircle.placeOptional")}</span>
          </div>
          <p className="create-location-helper muted">
            {t("createCircle.placeHelp")}
            <br />
            {t("createCircle.placeHelpMore")}
          </p>

          {props.place && !changingPlace ? (
            <div className="create-location-selected">
              <div className="create-location-selected-main">
                <span className="create-location-selected-icon">
                  <PlaceCategoryIcon category={props.place.category} />
                </span>
                <span className="create-location-selected-text">
                  <span className="create-location-selected-name" dir="auto">
                    {props.place.name}
                  </span>
                  {props.place.cityName ? (
                    <span className="create-location-selected-city muted" dir="auto">
                      {props.place.cityName}
                    </span>
                  ) : null}
                </span>
              </div>
              {showDetails && props.place.address ? (
                <div id="create-location-details" className="create-location-details">
                  <span className="create-location-details-name" dir="auto">
                    {props.place.name}
                  </span>
                  <span className="muted" dir="auto">
                    {props.place.address}
                  </span>
                </div>
              ) : null}
              <div className="create-location-selected-actions">
                {props.place.address ? (
                  <button
                    type="button"
                    className="create-location-action"
                    aria-expanded={showDetails}
                    aria-controls="create-location-details"
                    aria-label={t("createCircle.placeDetailsName", { name: props.place.name })}
                    disabled={props.disabled}
                    onClick={() => setShowDetails((v) => !v)}
                  >
                    {t("createCircle.placeDetails")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="create-location-action"
                  aria-label={t("createCircle.placeChangeName", { name: props.place.name })}
                  disabled={props.disabled}
                  onClick={() => {
                    setChangingPlace(true);
                    setShowDetails(false);
                    window.setTimeout(() => document.getElementById("create-circle-place")?.focus(), 0);
                  }}
                >
                  {t("createCircle.placeChange")}
                </button>
                <button
                  id="create-location-remove"
                  type="button"
                  className="create-location-action"
                  aria-label={t("createCircle.placeRemoveName", { name: props.place.name })}
                  disabled={props.disabled}
                  onClick={removePlace}
                >
                  {t("createCircle.placeRemove")}
                </button>
              </div>
            </div>
          ) : null}

          {showSearch ? (
            <PlaceAutocompleteField
              id="create-circle-place"
              city={props.cityShortName || props.citySelected.split(",")[0]}
              countryCode={props.countryCode}
              cityLat={props.cityLat}
              cityLon={props.cityLon}
              query={placeQuery}
              onQueryChange={setPlaceQuery}
              onSelect={choosePlace}
              disabled={props.disabled}
            />
          ) : null}

          {changingPlace ? (
            <button
              type="button"
              className="create-circle-link-btn create-location-keep"
              disabled={props.disabled}
              onClick={() => {
                setChangingPlace(false);
                setPlaceQuery("");
              }}
            >
              {t("createCircle.placeKeep")}
            </button>
          ) : null}

          {showTop ? (
            <div className="create-location-top stack">
              <div className="create-location-top-head">
                <span className="create-location-top-title">
                  {t("createCircle.suggestedFor", { hobby: props.suggestionLabel })}
                </span>
                <span className="create-location-top-count muted">
                  {t("createCircle.suggestedCount", { count: topVenues.length })}
                </span>
              </div>
              <ul className="create-location-top-list">
                {topVenues.map((venue, index) => {
                  const place = placeFromVenue(venue, props.cityShortName);
                  const kind = placeIconKind(place.category);
                  return (
                    <li key={`${place.name}-${index}`}>
                      <button
                        type="button"
                        className="create-location-top-card"
                        disabled={props.disabled}
                        onClick={() => choosePlace(place)}
                      >
                        <span className="create-location-top-icon">
                          <PlaceCategoryIcon category={kind} />
                        </span>
                        <span className="create-location-top-text">
                          <span className="create-location-top-name" dir="auto">
                            {place.name}
                          </span>
                          <span className="create-location-top-city muted" dir="auto">
                            {place.cityName}
                          </span>
                        </span>
                        {kind !== "generic" ? (
                          <span className="create-location-top-chip">{t(`placeSearch.category.${kind}`)}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {!props.place ? (
            <div className="create-location-note" role="note">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 11v5M12 8h.01" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              <span>
                {t("createCircle.placeNone")}
                <br />
                {t("createCircle.placeNoneMore")}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
