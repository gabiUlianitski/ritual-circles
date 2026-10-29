import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlaceCategory } from "../api/types";
import { PlaceAutocompleteField } from "./PlaceAutocompleteField";
import { PlaceCategoryIcon } from "./PlaceCategoryIcon";

/** Activity place picker. Search is the Circle's PlaceAutocompleteField; the Activity keeps its own place. */
export function ActivityLocationField(props: {
  id: string;
  city: string;
  countryCode?: string;
  name: string;
  address: string;
  /** True only for a new Activity that started from the Circle's preferred place. */
  inherited: boolean;
  disabled?: boolean;
  onChange: (next: { locationName: string; locationAddress: string }) => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<PlaceCategory>("generic");
  const [fromCircle, setFromCircle] = useState(props.inherited);
  const [changing, setChanging] = useState(false);
  const [details, setDetails] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [manualAddress, setManualAddress] = useState(props.address);

  const city = props.city.trim();
  const selected = Boolean(props.name.trim()) && !changing && !manual;

  function choose(name: string, address: string, nextCategory: PlaceCategory) {
    setCategory(nextCategory);
    setFromCircle(false);
    setChanging(false);
    setManual(false);
    setDetails(false);
    setQuery("");
    props.onChange({ locationName: name, locationAddress: address });
    window.setTimeout(() => document.getElementById(`${props.id}-remove`)?.focus(), 0);
  }

  function remove() {
    setFromCircle(false);
    setChanging(false);
    setDetails(false);
    setManual(false);
    setQuery("");
    props.onChange({ locationName: "", locationAddress: "" });
    window.setTimeout(() => document.getElementById(props.id)?.focus(), 0);
  }

  return (
    <div className="activity-location stack">
      {selected ? (
        <div
          className="create-location-selected"
          role="group"
          aria-label={
            fromCircle
              ? t("activityForm.fromCircleA11y", { name: props.name })
              : t("activityForm.locationSelected", { name: props.name })
          }
        >
          <div className="create-location-selected-main">
            <span className="create-location-selected-icon">
              <PlaceCategoryIcon category={category} />
            </span>
            <span className="create-location-selected-text">
              <span className="create-location-selected-name" dir="auto">
                {props.name}
              </span>
              {fromCircle ? <span className="activity-location-origin muted">{t("activityForm.fromCircle")}</span> : null}
            </span>
          </div>
          {details && props.address.trim() ? (
            <div id={`${props.id}-details`} className="create-location-details">
              <span className="create-location-details-name" dir="auto">
                {props.name}
              </span>
              <span className="muted" dir="auto">
                {props.address}
              </span>
            </div>
          ) : null}
          <div className="create-location-selected-actions">
            {props.address.trim() ? (
              <button
                type="button"
                className="create-location-action"
                aria-expanded={details}
                aria-controls={`${props.id}-details`}
                aria-label={t("createCircle.placeDetailsName", { name: props.name })}
                disabled={props.disabled}
                onClick={() => setDetails((open) => !open)}
              >
                {t("createCircle.placeDetails")}
              </button>
            ) : null}
            <button
              type="button"
              className="create-location-action"
              aria-label={t("createCircle.placeChangeName", { name: props.name })}
              disabled={props.disabled}
              onClick={() => {
                setChanging(true);
                setDetails(false);
                window.setTimeout(() => document.getElementById(props.id)?.focus(), 0);
              }}
            >
              {t("createCircle.placeChange")}
            </button>
            <button
              id={`${props.id}-remove`}
              type="button"
              className="create-location-action"
              aria-label={t("createCircle.placeRemoveName", { name: props.name })}
              disabled={props.disabled}
              onClick={remove}
            >
              {t("createCircle.placeRemove")}
            </button>
          </div>
        </div>
      ) : null}

      {!selected && city && !manual ? (
        <>
          <label className="create-location-label" htmlFor={props.id}>
            {t("activityForm.locationName")}
          </label>
          <PlaceAutocompleteField
            id={props.id}
            city={city}
            countryCode={props.countryCode}
            query={query}
            onQueryChange={setQuery}
            onSelect={(place) => choose(place.name, place.address, place.category)}
            disabled={props.disabled}
            hideLabel
          />
        </>
      ) : null}

      {changing && !manual ? (
        <button
          type="button"
          className="create-circle-link-btn create-location-keep"
          disabled={props.disabled}
          onClick={() => {
            setChanging(false);
            setQuery("");
          }}
        >
          {t("createCircle.placeKeep")}
        </button>
      ) : null}

      {!props.name.trim() && !manual ? (
        <p className="muted activity-form-help">{t("activityForm.locationEmpty")}</p>
      ) : null}

      {!selected && !manual ? (
        <button
          type="button"
          className="create-circle-link-btn activity-location-manual-link"
          disabled={props.disabled}
          onClick={() => {
            setManual(true);
            setManualAddress(props.address);
            setFromCircle(false);
          }}
        >
          {t("activityForm.manualPrompt")} {t("activityForm.manualAction")}
        </button>
      ) : null}

      {manual ? (
        <div className="activity-location-manual stack">
          <label className="activity-form-field" htmlFor={`${props.id}-manual-name`}>
            <span>{t("activityForm.locationName")}</span>
            <input
              id={`${props.id}-manual-name`}
              className="create-circle-input"
              dir="auto"
              value={props.name}
              disabled={props.disabled}
              onChange={(event) => {
                setFromCircle(false);
                props.onChange({ locationName: event.target.value, locationAddress: manualAddress });
              }}
            />
          </label>
          <label className="activity-form-field" htmlFor={`${props.id}-manual-address`}>
            <span>{t("activityForm.locationAddress")}</span>
            <input
              id={`${props.id}-manual-address`}
              className="create-circle-input"
              dir="auto"
              value={manualAddress}
              disabled={props.disabled}
              onChange={(event) => {
                setManualAddress(event.target.value);
                setFromCircle(false);
                props.onChange({ locationName: props.name, locationAddress: event.target.value });
              }}
            />
          </label>
          <button
            type="button"
            className="create-circle-link-btn activity-location-manual-link"
            disabled={props.disabled}
            onClick={() => {
              setManual(false);
              setQuery("");
            }}
          >
            {t("activityForm.manualBack")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
