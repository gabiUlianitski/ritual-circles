import React, { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";

import type { CircleResponse, CountryItem, VenueSuggestionItem } from "../api/types";

import {

  findVenueSuggestionsForHobby,

  VENUE_SUGGEST_TIMEOUT_MS,

  venueSearchAddress,

  venueSuggestErrorMessage,

} from "../venueSuggestForHobby";

import { CityAutocompleteField } from "./CityAutocompleteField";

import { FormError } from "./FormError";



export function CircleChatPlaceSuggestPanel(props: {

  circle: CircleResponse;

  disabled?: boolean;

  onShare: (item: VenueSuggestionItem, cityLabel: string) => void | Promise<void>;

}) {

  const [countries, setCountries] = useState<CountryItem[]>([]);

  const [countryCode, setCountryCode] = useState(props.circle.countryCode?.trim() || "IL");

  const [cityQuery, setCityQuery] = useState("");

  const [selectedCityDisplay, setSelectedCityDisplay] = useState("");

  const [venueLoading, setVenueLoading] = useState(false);

  const [venueSuggestions, setVenueSuggestions] = useState<VenueSuggestionItem[]>([]);

  const [geocodedNear, setGeocodedNear] = useState<string | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);



  useEffect(() => {

    const prefill =

      props.circle.cityName?.trim() ||

      props.circle.city?.trim() ||

      props.circle.meetingPlace?.trim() ||

      "";

    if (prefill) {

      setCityQuery(prefill);

      setSelectedCityDisplay(prefill);

    }

  }, [props.circle]);



  useEffect(() => {

    let cancelled = false;

    void (async () => {

      try {

        const rows = await api.getCountries();

        if (!cancelled) setCountries(Array.isArray(rows) ? rows : []);

      } catch {

        if (!cancelled) setCountries([]);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, []);



  const countryName = useMemo(

    () => countries.find((c) => c.code === countryCode)?.name ?? "",

    [countries, countryCode],

  );



  const addressForVenueSearch = useMemo(

    () => venueSearchAddress(selectedCityDisplay, cityQuery, countryName),

    [selectedCityDisplay, cityQuery, countryName],

  );



  async function findPlaces() {

    if (!selectedCityDisplay.trim()) {

      setLocalError("Pick a city from the autocomplete list first.");

      return;

    }

    setVenueLoading(true);

    setLocalError(null);

    setVenueSuggestions([]);

    setGeocodedNear(null);

    const ac = new AbortController();

    const t = window.setTimeout(() => ac.abort(), VENUE_SUGGEST_TIMEOUT_MS);

    try {

      const r = await findVenueSuggestionsForHobby(

        {

          address: addressForVenueSearch,

          ritualType: props.circle.ritualType,

          ritualSubtype: props.circle.ritualSubtype ?? null,

          ritualLevel: props.circle.ritualLevel ?? null,

        },

        { signal: ac.signal },

      );

      const list = r.suggestions ?? [];

      setVenueSuggestions(list);

      setGeocodedNear(r.geocodedNear ?? null);

      if (!list.length) {

        setLocalError(

          "No places found — try a larger city nearby, check your connection, or search again in a minute.",

        );

      }

    } catch (e) {

      setLocalError(venueSuggestErrorMessage(e));

    } finally {

      window.clearTimeout(t);

      setVenueLoading(false);

    }

  }



  const cityLabel = selectedCityDisplay.trim();



  return (

    <div className="stack" style={{ gap: 10 }}>

      <p className="muted" style={{ margin: 0, fontSize: "0.88em" }}>

        Choose a city from the suggestions — then we’ll find meeting spots for this circle’s hobby.

      </p>



      <div className="stack" style={{ gap: 6 }}>

        <label htmlFor="chat-place-country" className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>

          Country

        </label>

        <select

          id="chat-place-country"

          value={countryCode}

          onChange={(e) => {

            setCountryCode(e.target.value);

            setSelectedCityDisplay("");

            setCityQuery("");

          }}

          disabled={props.disabled || venueLoading}

        >

          {countries.length ? (

            countries.map((c) => (

              <option key={c.code} value={c.code}>

                {c.name}

              </option>

            ))

          ) : (

            <option value={countryCode}>{countryCode}</option>

          )}

        </select>

      </div>



      <CityAutocompleteField

        id="chat-place-city"

        countryCode={countryCode}

        value={cityQuery}

        selectedDisplay={selectedCityDisplay}

        onValueChange={(q) => {

          setCityQuery(q);

          setSelectedCityDisplay("");

        }}

        onSelect={(item) => {

          setCityQuery(item.shortName);

          setSelectedCityDisplay(item.displayName);

        }}

        disabled={props.disabled || venueLoading}

        label="City (autocomplete)"

      />



      <button

        type="button"

        style={{ width: "auto", alignSelf: "flex-start" }}

        disabled={props.disabled || venueLoading || !selectedCityDisplay.trim()}

        onClick={() => void findPlaces()}

      >

        {venueLoading ? "Finding places… (up to ~1 min)" : "Find places for this hobby"}

      </button>



      {geocodedNear ? (

        <div className="muted" style={{ fontSize: "0.85em" }}>

          Search center: {geocodedNear}. Spots may be in or near this area — we pick the closest matches.

        </div>

      ) : null}

      {localError ? <FormError>{localError}</FormError> : null}



      {venueSuggestions.length > 0 ? (

        <div className="stack" style={{ gap: 8 }}>

          <div className="muted" style={{ fontSize: "0.85em", fontWeight: 650 }}>

            Closest matches for your hobby — tap one to share in chat

          </div>

          {venueSuggestions.map((s, i) => (

            <button

              key={`${s.name}-${i}`}

              type="button"

              className="circle-chat-place-pick card"

              style={{ padding: 10, textAlign: "left", width: "100%" }}

              disabled={props.disabled || venueLoading}

              onClick={() => void props.onShare(s, cityLabel)}

            >

              <div style={{ fontWeight: 650 }}>{s.name}</div>

              <div className="muted" style={{ fontSize: "0.88em", marginTop: 4 }}>

                {s.address}

              </div>

              {s.hobyRelation ? (

                <div className="muted" style={{ fontSize: "0.82em", marginTop: 4 }}>

                  {s.hobyRelation}

                </div>

              ) : null}

            </button>

          ))}

        </div>

      ) : null}

    </div>

  );

}

