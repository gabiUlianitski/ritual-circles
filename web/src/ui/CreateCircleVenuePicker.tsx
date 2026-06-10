import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CitySuggestItem, VenueSuggestionItem } from "../api/types";
import { api } from "../api/client";
import {
  GOOGLE_MAPS_OPEN_URL,
  customPlaceSelectionKey,
  customPlaceToVenueItem,
  manualPlaceCardLocation,
  needsMapsLinkResolve,
  parseGoogleMapsLink,
  parsedFromMapsResolve,
  type ParsedCustomPlace,
} from "../parseCustomPlaceInput";
import {
  findVenueSuggestionsForHobby,
  VENUE_SUGGEST_TIMEOUT_MS,
  venueSearchAddress,
  venueSuggestErrorMessage,
} from "../venueSuggestForHobby";
import {
  buildOsmMapEmbedUrl,
  meetingPlaceValue,
  shortLocationLabel,
  venueCardAddressLabel,
  venueCardFromItem,
  venuePlaceIcon,
  venueSelectionKey,
} from "../venueCardDisplay";
import { CityAutocompleteField } from "./CityAutocompleteField";
import { FormError } from "./FormError";
import { geolocationUserMessage } from "../geolocationMessage";

const INITIAL_VISIBLE = 5;

function isCityAreaFallbackVenue(v: VenueSuggestionItem): boolean {
  return /\(city area\)/i.test(v.name?.trim() ?? "");
}

function VenueSkeletonCards() {
  return (
    <div className="create-venue-list-wrap" aria-hidden>
      <ul className="create-venue-list">
        {[0, 1, 2].map((i) => (
          <li key={i} className="create-venue-row-item create-venue-row-item--skeleton">
            <div className="create-venue-icon-col">
              <div className="create-venue-skeleton-icon" />
            </div>
            <div className="create-venue-row-body">
              <div className="create-venue-row-line1">
                <div className="create-venue-skeleton-line create-venue-skeleton-line--title" />
                <div className="create-venue-skeleton-line create-venue-skeleton-line--dist" />
              </div>
              <div className="create-venue-skeleton-line create-venue-skeleton-line--tag" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VenuePlaceCard(props: {
  displayName: string;
  addressLabel: string;
  distanceLabel: string | null;
  icon: string;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onHover?: (active: boolean) => void;
}) {
  return (
    <li
      className={`create-venue-row-item${props.isSelected ? " is-selected" : ""}`}
      onMouseEnter={() => props.onHover?.(true)}
      onMouseLeave={() => props.onHover?.(false)}
      onClick={() => {
        if (!props.disabled) props.onSelect();
      }}
      onKeyDown={(e) => {
        if (props.disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onSelect();
        }
      }}
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      aria-pressed={props.isSelected}
      aria-label={`${props.displayName}${props.addressLabel ? `, ${props.addressLabel}` : ""}`}
    >
      <div className="create-venue-icon-col" aria-hidden>
        {props.isSelected ? (
          <span className="create-venue-check">✓</span>
        ) : (
          <span className="create-venue-icon">{props.icon}</span>
        )}
      </div>
      <div className="create-venue-row-body">
        <div className="create-venue-row-line1">
          <h3 className="create-venue-name">{props.displayName}</h3>
          {props.distanceLabel ? (
            <span className="create-venue-distance">{props.distanceLabel}</span>
          ) : null}
        </div>
        {props.addressLabel ? (
          <p className="create-venue-address muted" dir="auto">
            {props.addressLabel}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function CreateCircleVenuePicker(props: {
  cityQuery: string;
  citySelected: string;
  onCityQueryChange: (query: string) => void;
  onCitySelect: (item: CitySuggestItem) => void;
  ritualType: string;
  ritualSubtype: string;
  ritualLevel: string | number | null;
  venueSearchNonce: number;
  locateBusy: boolean;
  onUseLocation: () => void | Promise<void>;
  meetingPlace: string;
  selectedKey: string | null;
  onSelectVenue: (venue: VenueSuggestionItem, key: string) => void;
  onClearMeetingPlace: () => void;
  disabled?: boolean;
  /** When true, venue search does not clear an existing meeting place (edit / adjust flows). */
  keepMeetingPlaceOnSearch?: boolean;
}) {
  const [venueLoading, setVenueLoading] = useState(false);
  const [venues, setVenues] = useState<VenueSuggestionItem[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showMorePlaces, setShowMorePlaces] = useState(false);
  const [hoveredVenueKey, setHoveredVenueKey] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [mapsLinkInput, setMapsLinkInput] = useState("");
  const [mapsLinkBusy, setMapsLinkBusy] = useState(false);
  const [addedCustom, setAddedCustom] = useState<VenueSuggestionItem | null>(null);
  const [addedCustomParsed, setAddedCustomParsed] = useState<ParsedCustomPlace | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addressForVenueSearch = useMemo(
    () => venueSearchAddress(props.citySelected, props.cityQuery, ""),
    [props.citySelected, props.cityQuery],
  );

  const selectVenue = useCallback(
    (venue: VenueSuggestionItem, key: string) => {
      props.onSelectVenue(venue, key);
    },
    [props.onSelectVenue],
  );

  const runVenueSearch = useCallback(async () => {
    if (!props.citySelected.trim()) {
      setLocalError("Pick a city from the list first.");
      return;
    }
    if (!addressForVenueSearch.trim()) {
      setLocalError("Pick a city from the list first.");
      return;
    }
    if (!props.ritualType.trim()) {
      setLocalError("Choose an activity in step 1 first.");
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setVenueLoading(true);
    setLocalError(null);
    setVenues([]);
    setMapCenter(null);
    setShowMorePlaces(false);
    setHoveredVenueKey(null);
    if (!props.keepMeetingPlaceOnSearch) {
      props.onClearMeetingPlace();
      setAddedCustom(null);
      setAddedCustomParsed(null);
    }

    const t = window.setTimeout(() => ac.abort(), VENUE_SUGGEST_TIMEOUT_MS);
    try {
      const r = await findVenueSuggestionsForHobby(
        {
          address: addressForVenueSearch,
          ritualType: props.ritualType,
          ritualSubtype: props.ritualSubtype.trim() || null,
          ritualLevel: props.ritualLevel,
        },
        { signal: ac.signal },
      );
      if (ac.signal.aborted) return;
      const list = (r.suggestions ?? []).filter((v) => !isCityAreaFallbackVenue(v));
      if (abortRef.current !== ac) return;
      setVenues(list);
      setMapCenter(r.mapCenter ?? null);
      if (!list.length) {
        setLocalError("No suggestions — add your own place below.");
      }
    } catch (e) {
      if (ac.signal.aborted || abortRef.current !== ac) return;
      setLocalError(venueSuggestErrorMessage(e));
    } finally {
      window.clearTimeout(t);
      if (abortRef.current === ac) setVenueLoading(false);
    }
  }, [
    addressForVenueSearch,
    props.citySelected,
    props.ritualType,
    props.ritualSubtype,
    props.ritualLevel,
    props.onClearMeetingPlace,
    props.keepMeetingPlaceOnSearch,
  ]);

  const runVenueSearchRef = useRef(runVenueSearch);
  runVenueSearchRef.current = runVenueSearch;

  useEffect(() => {
    if (!props.venueSearchNonce) return;
    if (!props.citySelected.trim() || !props.ritualType.trim()) return;
    void runVenueSearchRef.current();
    return () => {
      abortRef.current?.abort();
    };
  }, [props.venueSearchNonce, props.citySelected, props.ritualType]);

  useEffect(() => {
    if (props.citySelected.trim() && props.ritualType.trim()) return;
    setVenues([]);
    setMapCenter(null);
    setLocalError(null);
    setVenueLoading(false);
    setAddedCustom(null);
    setAddedCustomParsed(null);
  }, [props.citySelected, props.ritualType]);

  useEffect(() => {
    if (!props.selectedKey?.startsWith("custom:")) return;
    if (addedCustom && props.meetingPlace === meetingPlaceValue(addedCustom)) return;
    const name = props.meetingPlace.split(" — ")[0]?.trim();
    if (!name) return;
    setAddedCustom({
      name,
      address: props.meetingPlace.split(" — ").slice(1).join(" — ") || name,
    });
  }, [props.selectedKey, props.meetingPlace, addedCustom]);

  const visible = showMorePlaces ? venues : venues.slice(0, INITIAL_VISIBLE);

  const pinByKey = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    visible.forEach((venue, index) => {
      const card = venueCardFromItem(venue);
      const key = venueSelectionKey(venue, index);
      if (card.lat != null && card.lon != null) {
        map.set(key, { lat: card.lat, lon: card.lon });
      }
    });
    if (addedCustom?.lat != null && addedCustom.lon != null && props.selectedKey?.startsWith("custom:")) {
      map.set(props.selectedKey, { lat: addedCustom.lat, lon: addedCustom.lon });
    }
    return map;
  }, [visible, addedCustom, props.selectedKey]);

  const allPins = useMemo(() => [...pinByKey.values()], [pinByKey]);

  const highlightPin = useMemo(() => {
    if (hoveredVenueKey) {
      const hovered = pinByKey.get(hoveredVenueKey);
      if (hovered) return hovered;
    }
    if (props.selectedKey) {
      const selected = pinByKey.get(props.selectedKey);
      if (selected) return selected;
    }
    return null;
  }, [hoveredVenueKey, props.selectedKey, pinByKey]);

  const mapUrl = buildOsmMapEmbedUrl(mapCenter, allPins, highlightPin);

  function applyCustomPlace(parsed: ParsedCustomPlace) {
    const venue = customPlaceToVenueItem(parsed);
    const key = customPlaceSelectionKey(parsed);
    setAddedCustom(venue);
    setAddedCustomParsed(parsed);
    selectVenue(venue, key);
  }

  async function addMapsLinkPlace() {
    setCustomError(null);
    const raw = mapsLinkInput.trim();
    if (!raw) return;
    setMapsLinkBusy(true);
    try {
      let parsed = parseGoogleMapsLink(raw);
      if (needsMapsLinkResolve(parsed, raw)) {
        const resolved = await api.resolveMapsLink({ url: raw });
        parsed = parsedFromMapsResolve(resolved);
      }
      setMapsLinkInput("");
      applyCustomPlace(parsed);
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : String(e));
    } finally {
      setMapsLinkBusy(false);
    }
  }

  function openGoogleMaps() {
    window.open(GOOGLE_MAPS_OPEN_URL, "_blank", "noopener,noreferrer");
  }

  const showSuggestions = Boolean(props.citySelected.trim());

  function suggestedVenueAddressLabel(venue: VenueSuggestionItem, displayName: string): string {
    const searchCity =
      props.citySelected.trim().split(",")[0]?.trim() ||
      props.cityQuery.trim().split(",")[0]?.trim() ||
      "";
    return (
      venueCardAddressLabel(venue.address, displayName, searchCity) ||
      venueCardAddressLabel(venue.address, undefined, searchCity) ||
      searchCity
    );
  }

  return (
    <section className="create-venue-step stack" aria-labelledby="create-step-3">
      <h2 id="create-step-3" className="create-circle-step-title">
        Where do you meet?
      </h2>

      <div className="create-venue-city-field">
        <CityAutocompleteField
          id="create-circle-city"
          value={props.cityQuery}
          selectedDisplay={props.citySelected}
          onValueChange={props.onCityQueryChange}
          onSelect={props.onCitySelect}
          disabled={props.disabled || props.locateBusy || venueLoading}
          label="City"
          compact
        />
      </div>

      <button
        type="button"
        className="primary create-venue-locate-btn"
        disabled={props.disabled || props.locateBusy || venueLoading}
        onClick={() => {
          void (async () => {
            setLocalError(null);
            try {
              await props.onUseLocation();
            } catch (e) {
              setLocalError(geolocationUserMessage(e));
            }
          })();
        }}
      >
        {props.locateBusy ? "Locating…" : "Use my location"}
      </button>

      {props.cityQuery.trim().length >= 2 && !props.citySelected.trim() ? (
        <p className="create-venue-city-hint muted">Pick a city from the list.</p>
      ) : null}

      {showSuggestions ? (
        <>
          <hr className="create-venue-divider" />
          <h3 className="create-venue-section-title">Suggested places</h3>

          {localError && !venueLoading ? <FormError>{localError}</FormError> : null}

          {venueLoading ? (
            <>
              <VenueSkeletonCards />
              {localError ? <FormError>{localError}</FormError> : null}
            </>
          ) : (
            <>
              {mapUrl ? (
                <div className="create-venue-map-wrap create-venue-panel-narrow">
                  <iframe
                    key={mapUrl}
                    title="Map preview"
                    className="create-venue-map"
                    src={mapUrl}
                    loading="lazy"
                  />
                  <p className="create-venue-map-hint muted">Tap a place to select</p>
                </div>
              ) : null}

              {visible.length ? (
                <div className="create-venue-list-wrap">
                  <ul className="create-venue-list">
                    {visible.map((venue, index) => {
                      const card = venueCardFromItem(venue);
                      const key = venueSelectionKey(venue, index);
                      const isSelected =
                        props.selectedKey === key || props.meetingPlace === meetingPlaceValue(venue);
                      const addressLabel = suggestedVenueAddressLabel(venue, card.displayName);
                      return (
                        <VenuePlaceCard
                          key={key}
                          displayName={card.displayName}
                          addressLabel={addressLabel}
                          distanceLabel={card.distanceLabel}
                          icon={venuePlaceIcon(card.category, card.displayName)}
                          isSelected={isSelected}
                          disabled={props.disabled}
                          onSelect={() => selectVenue(venue, key)}
                          onHover={(active) => {
                          setHoveredVenueKey(active ? key : null);
                        }}
                        />
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {!showMorePlaces && venues.length > INITIAL_VISIBLE ? (
                <button
                  type="button"
                  className="create-circle-link-btn"
                  disabled={props.disabled}
                  onClick={() => setShowMorePlaces(true)}
                >
                  Show more
                </button>
              ) : null}

              {!venueLoading && (localError || !visible.length) ? (
                <button
                  type="button"
                  className="create-circle-link-btn"
                  disabled={props.disabled}
                  onClick={() => void runVenueSearch()}
                >
                  Search again
                </button>
              ) : null}
            </>
          )}

          <hr className="create-venue-divider" />
          <h3 className="create-venue-section-title">Or add your own place</h3>

          <div className="create-venue-manual stack">
            <div className="create-venue-manual-option stack">
              <label className="create-venue-manual-label" htmlFor="create-venue-maps-link">
                Paste Google Maps link
              </label>
              <button
                type="button"
                className="create-venue-maps-open-btn"
                disabled={props.disabled}
                onClick={openGoogleMaps}
              >
                Open Google Maps
              </button>
              <p className="create-venue-maps-helper muted">
                Find a place → click &quot;Share&quot; → paste link here
              </p>
              <div className="create-venue-manual-row">
                <input
                  id="create-venue-maps-link"
                  className="create-circle-input"
                  placeholder="Paste Google Maps link"
                  value={mapsLinkInput}
                  onChange={(e) => {
                    setMapsLinkInput(e.target.value);
                    setCustomError(null);
                  }}
                  disabled={props.disabled || mapsLinkBusy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addMapsLinkPlace();
                    }
                  }}
                />
                <button
                  type="button"
                  className="primary create-venue-add-btn"
                  disabled={props.disabled || mapsLinkBusy || !mapsLinkInput.trim()}
                  onClick={() => void addMapsLinkPlace()}
                >
                  {mapsLinkBusy ? "…" : "Add"}
                </button>
              </div>
            </div>
          </div>

          {customError ? <FormError>{customError}</FormError> : null}

          {addedCustom &&
          addedCustomParsed &&
          props.selectedKey?.startsWith("custom:") &&
          props.meetingPlace === meetingPlaceValue(addedCustom) ? (
            <div className="create-venue-list-wrap">
              <ul className="create-venue-list">
                <VenuePlaceCard
                  displayName={venueCardFromItem(addedCustom).displayName}
                  addressLabel={
                    venueCardAddressLabel(addedCustom.address, addedCustom.name) ||
                    manualPlaceCardLocation(addedCustom, props.citySelected)
                  }
                  distanceLabel={null}
                  icon={venuePlaceIcon(
                    venueCardFromItem(addedCustom).category,
                    addedCustom.name,
                  )}
                  isSelected
                  disabled={props.disabled}
                  onSelect={() => {
                    selectVenue(addedCustom, customPlaceSelectionKey(addedCustomParsed));
                  }}
                />
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
