import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { CitySuggestItem, CountryItem, Hoby, VenueSuggestionItem } from "../api/types";
import {
  isSubcategoryAny,
  levelsForSelectedType,
  parseHobyLevelsFlat,
  parseHobyTypesNested,
  SUBCATEGORY_ANY,
  SUBCATEGORY_ANY_LABEL,
} from "./hobyMetadata";
import { parseHobyLevelKey } from "./hobyLevelKey";
import { FormError } from "./FormError";
import { OpenCircleToggle } from "./OpenCircleToggle";
import { CreateCircleVenuePicker } from "./CreateCircleVenuePicker";
import {
  buildFirstSessionIso,
  defaultMeetDateIso,
  formatScheduleSummary,
  isMeetDateOnOrAfterToday,
  recurringFromDateAndHour,
  todayIsoLocal,
} from "./createCircleSchedule";
import { formatHourOnlyDisplay } from "./HourOnlyPicker";
import { MeetDateTimePicker } from "./MeetDateTimePicker";
import { meetingPlaceReviewParts, meetingPlaceValue } from "../venueCardDisplay";
import { CreateCircleCostPaymentStep } from "./CreateCircleCostPaymentStep";
import {
  DEFAULT_COST_PAYMENT,
  formatCostPaymentSummary,
  toCostPaymentPayload,
  validateCostPayment,
  type CostPaymentState,
} from "./circlePayment";
import {
  DEFAULT_GROUP_SIZE,
  formatGroupSizeSummary,
  groupSizeStateFromPayload,
  toGroupSizePayload,
  validateGroupSize,
  type GroupSizeState,
} from "./groupSize";
import { CreateCircleGroupSizeStep } from "./CreateCircleGroupSizeStep";
import { geolocationUserMessage } from "../geolocationMessage";

const TOTAL_STEPS = 6;

function CreateCircleSoFarSummary(props: {
  step: number;
  activityLine: string;
  activityIcon: string;
  scheduleLine: string;
}) {
  if (props.step < 2 || !props.activityLine) return null;

  return (
    <aside className="create-circle-progress-summary" aria-label="Your choices so far">
      <p className="create-circle-progress-summary-heading muted">So far</p>
      <ul className="create-circle-progress-summary-list">
        <li>
          <span className="create-circle-progress-summary-icon" aria-hidden>
            {props.activityIcon || "🎯"}
          </span>
          <span>{props.activityLine}</span>
        </li>
        {props.step >= 4 && props.scheduleLine ? (
          <li>
            <span className="create-circle-progress-summary-icon" aria-hidden>
              📅
            </span>
            <span>{props.scheduleLine}</span>
          </li>
        ) : null}
      </ul>
    </aside>
  );
}

export function CreateCircleWizard(props: {
  onDone: () => Promise<void> | void;
  working: boolean;
  setWorking: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  initialMeetDate?: string;
}) {
  const { setError } = props;
  const navRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [hobies, setHobies] = useState<Hoby[]>([]);
  const [hobySlug, setHobySlug] = useState("");
  const [hobySubtype, setHobySubtype] = useState("");
  const [hobyLevel, setHobyLevel] = useState("");
  const [meetDate, setMeetDate] = useState(() => {
    const prefill = props.initialMeetDate?.trim();
    if (prefill && isMeetDateOnOrAfterToday(prefill)) return prefill;
    return defaultMeetDateIso();
  });
  const [meetHour, setMeetHour] = useState("17");
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);
  const [openCircle, setOpenCircle] = useState(true);
  const [cityQuery, setCityQuery] = useState("");
  const [citySelected, setCitySelected] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [meetingPlace, setMeetingPlace] = useState("");
  const [selectedVenueKey, setSelectedVenueKey] = useState<string | null>(null);
  const [locateBusy, setLocateBusy] = useState(false);
  const [venueSearchNonce, setVenueSearchNonce] = useState(0);
  const [groupSize, setGroupSize] = useState<GroupSizeState>(DEFAULT_GROUP_SIZE);
  const [groupSizeError, setGroupSizeError] = useState<string | null>(null);
  const [costPayment, setCostPayment] = useState<CostPaymentState>(DEFAULT_COST_PAYMENT);
  const [costPaymentError, setCostPaymentError] = useState<string | null>(null);

  const clearMeetingPlace = useCallback(() => {
    setMeetingPlace("");
    setSelectedVenueKey(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await api.getHobies()) as Hoby[];
        setHobies(Array.isArray(data) ? data : []);
      } catch {
        /* allow free-text fallback if catalog missing */
      }
    })();
  }, []);

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

  const selectedHoby = useMemo(() => hobies.find((h) => h.slug === hobySlug) ?? null, [hobies, hobySlug]);

  useEffect(() => {
    if (!selectedHoby) return;
    setGroupSize(groupSizeStateFromPayload(selectedHoby.groupSize));
    setGroupSizeError(null);
  }, [selectedHoby?.slug, selectedHoby?.groupSize]);
  const types = useMemo(() => parseHobyTypesNested(selectedHoby?.types), [selectedHoby]);
  const hobyLevelsFlat = useMemo(() => parseHobyLevelsFlat(selectedHoby?.levels), [selectedHoby]);
  const levelsForSubtype = useMemo(
    () => levelsForSelectedType(hobyLevelsFlat, types, hobySubtype),
    [hobyLevelsFlat, types, hobySubtype],
  );

  const subtypeLabel =
    isSubcategoryAny(hobySubtype)
      ? SUBCATEGORY_ANY_LABEL
      : (types.find((t) => t.key === hobySubtype)?.label ?? hobySubtype);
  const levelLabel = levelsForSubtype.find((l) => l.key === hobyLevel)?.label ?? hobyLevel;

  const showSubtypeField = Boolean(hobySlug && types.length);
  const showLevelField = Boolean(
    hobySlug && levelsForSubtype.length && (!types.length || hobySubtype),
  );

  const step1Complete =
    Boolean(hobySlug.trim()) &&
    (!showSubtypeField || Boolean(hobySubtype)) &&
    (!showLevelField || Boolean(hobyLevel));

  const minMeetDate = useMemo(() => todayIsoLocal(), []);

  const step2Complete = Boolean(citySelected.trim() && meetingPlace.trim());
  const step3Complete = Boolean(meetDate && meetHour !== "" && isMeetDateOnOrAfterToday(meetDate));
  const step4Complete = validateGroupSize(groupSize) === null;
  const step5Complete = validateCostPayment(costPayment) === null;
  const groupSizePayload = useMemo(() => toGroupSizePayload(groupSize), [groupSize]);
  const costPaymentPayload = useMemo(() => toCostPaymentPayload(costPayment), [costPayment]);
  const groupSizeSummary = useMemo(() => formatGroupSizeSummary(groupSizePayload), [groupSizePayload]);
  const costPaymentSummary = useMemo(
    () => formatCostPaymentSummary(costPaymentPayload, groupSize),
    [costPaymentPayload, groupSize],
  );
  const meetingPlaceReview = useMemo(
    () => meetingPlaceReviewParts(meetingPlace),
    [meetingPlace],
  );

  const activitySummary = useMemo(() => {
    const name = selectedHoby?.displayName ?? hobySlug.trim();
    if (!name) return "";
    let line = name;
    if (hobySubtype && !isSubcategoryAny(hobySubtype)) line += ` · ${subtypeLabel}`;
    if (hobyLevel) line += ` (${levelLabel})`;
    return line;
  }, [selectedHoby, hobySlug, hobySubtype, subtypeLabel, hobyLevel, levelLabel]);

  const scheduleSummary = useMemo(() => {
    return formatScheduleSummary(meetDate, meetHour, repeatsWeekly, formatHourOnlyDisplay);
  }, [meetDate, meetHour, repeatsWeekly]);

  function onCityQueryChange(q: string) {
    setCityQuery(q);
    setCitySelected("");
    clearMeetingPlace();
  }

  function bumpVenueSearch() {
    setVenueSearchNonce((n) => n + 1);
  }

  function onCitySelect(item: CitySuggestItem) {
    const display = item.displayName.trim() || item.shortName.trim();
    setCityQuery(item.shortName.trim() || display);
    setCitySelected(display);
    const cc = item.countryCode?.trim().toUpperCase();
    if (cc && cc.length === 2) setCountryCode(cc);
    clearMeetingPlace();
    setError(null);
    bumpVenueSearch();
  }

  function onSelectVenue(venue: VenueSuggestionItem, key: string) {
    setSelectedVenueKey(key);
    setMeetingPlace(meetingPlaceValue(venue));
    setError(null);
    window.setTimeout(() => {
      navRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
  }

  async function fillFromBrowserLocation() {
    if (!window.isSecureContext) {
      throw new Error("Location only works on HTTPS or localhost. Pick a city from the list instead.");
    }
    if (!navigator.geolocation) {
      throw new Error("Location not available in this browser. Pick a city from the list instead.");
    }
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 15_000,
      });
    });
    const r = await api.reverseLocate({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    const cc =
      countries.find((c) => c.code === r.countryCode)?.code ??
      countries.find((c) => c.code.toLowerCase() === r.countryCode.toLowerCase())?.code ??
      r.countryCode;
    if (cc) setCountryCode(cc);
    const display = (r.displayName ?? "").trim() || r.cityShortName;
    setCityQuery(r.cityShortName);
    setCitySelected(display);
    clearMeetingPlace();
    setError(null);
    bumpVenueSearch();
  }

  function onActivityChange(slug: string) {
    setHobySlug(slug);
    setHobySubtype("");
    setHobyLevel("");
  }

  function onSubtypeChange(key: string) {
    setHobySubtype(key);
    setHobyLevel("");
  }

  function onLevelChange(key: string) {
    setHobyLevel(key);
  }

  function goNext() {
    setError(null);
    if (step === 1 && !step1Complete) {
      setError("Choose activity, subcategory, and level to continue.");
      return;
    }
    if (step === 2 && !step2Complete) {
      setError("Pick a city and meeting place.");
      return;
    }
    if (step === 3 && !step3Complete) {
      setError(
        meetDate && !isMeetDateOnOrAfterToday(meetDate)
          ? "Pick today or a future date."
          : "Pick a date and time.",
      );
      return;
    }
    if (step === 4) {
      const gsErr = validateGroupSize(groupSize);
      if (gsErr) {
        setGroupSizeError(gsErr);
        setError(gsErr);
        return;
      }
      setGroupSizeError(null);
    }
    if (step === 5) {
      const cpErr = validateCostPayment(costPayment);
      if (cpErr) {
        setCostPaymentError(cpErr);
        setError(cpErr);
        return;
      }
      setCostPaymentError(null);
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function goBack() {
    setError(null);
    setGroupSizeError(null);
    setCostPaymentError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function create() {
    setError(null);
    const gsErr = validateGroupSize(groupSize);
    const cpErr = validateCostPayment(costPayment);
    if (!step1Complete || !step2Complete || !step3Complete || gsErr || cpErr) {
      setError(cpErr ?? gsErr ?? "Complete all steps before creating.");
      if (gsErr) setGroupSizeError(gsErr);
      if (cpErr) setCostPaymentError(cpErr);
      return;
    }
    props.setWorking(true);
    try {
      await api.createCircle({
        ritualType: hobySlug.trim() || "hoby",
        ritualLevel: parseHobyLevelKey(hobyLevel),
        ritualSubtype: isSubcategoryAny(hobySubtype) ? null : hobySubtype.trim() || null,
        modality: "offline",
        recurringTime: recurringFromDateAndHour(meetDate, meetHour),
        firstSessionAt: buildFirstSessionIso(meetDate, meetHour),
        isRecurring: repeatsWeekly,
        countryCode: countryCode.trim() || null,
        cityName: citySelected.trim() || null,
        meetingPlace: meetingPlace.trim(),
        inviteOnly: !openCircle,
        groupSize: groupSizePayload,
        costPayment: costPaymentPayload,
      });
      await props.onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      props.setWorking(false);
    }
  }


  return (
    <div className={`create-circle-wizard stack${step === 2 ? " create-circle-wizard--sticky-nav" : ""}`}>
      <div className="create-circle-step-meta muted">Step {step} of {TOTAL_STEPS}</div>

      <CreateCircleSoFarSummary
        step={step}
        activityLine={activitySummary}
        activityIcon={selectedHoby?.icon ?? "🎯"}
        scheduleLine={scheduleSummary}
      />

      {step === 1 ? (
        <section className="create-circle-step stack" aria-labelledby="create-step-1">
          <h2 id="create-step-1" className="create-circle-step-title">
            What&apos;s your circle about?
          </h2>
          <label className="create-circle-field stack">
            <span className="create-circle-label">Activity</span>
            {hobies.length ? (
              <select
                className="create-circle-input"
                value={hobySlug}
                onChange={(e) => onActivityChange(e.target.value)}
                disabled={props.working}
                aria-label="Activity"
              >
                <option value="">Choose activity…</option>
                {hobies.map((h) => (
                  <option key={h.id} value={h.slug}>
                    {(h.icon ? `${h.icon} ` : "") + h.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="create-circle-input"
                placeholder="Activity"
                value={hobySlug}
                onChange={(e) => onActivityChange(e.target.value)}
                disabled={props.working}
                aria-label="Activity"
              />
            )}
          </label>

          {showSubtypeField ? (
            <label className="create-circle-field stack">
              <span className="create-circle-label">Subcategory</span>
              <select
                className="create-circle-input"
                value={hobySubtype}
                disabled={props.working}
                aria-label="Subcategory"
                onChange={(e) => onSubtypeChange(e.target.value)}
              >
                <option value="">Choose subcategory…</option>
                <option value={SUBCATEGORY_ANY}>{SUBCATEGORY_ANY_LABEL}</option>
                {types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label ?? t.key}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showLevelField ? (
            <label className="create-circle-field stack">
              <span className="create-circle-label">Level</span>
              <select
                className="create-circle-input"
                value={hobyLevel}
                disabled={props.working}
                aria-label="Level"
                onChange={(e) => onLevelChange(e.target.value)}
              >
                <option value="">Choose level…</option>
                {levelsForSubtype.map((lv) => (
                  <option key={lv.key} value={lv.key}>
                    {lv.label ?? lv.key}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <CreateCircleVenuePicker
          cityQuery={cityQuery}
          citySelected={citySelected}
          onCityQueryChange={onCityQueryChange}
          onCitySelect={onCitySelect}
          ritualType={hobySlug}
          ritualSubtype={isSubcategoryAny(hobySubtype) ? "" : hobySubtype}
          ritualLevel={parseHobyLevelKey(hobyLevel)}
          venueSearchNonce={venueSearchNonce}
          locateBusy={locateBusy}
          onUseLocation={async () => {
            setLocateBusy(true);
            setError(null);
            try {
              await fillFromBrowserLocation();
            } catch (e) {
              const message = geolocationUserMessage(e);
              setError(message);
              throw new Error(message);
            } finally {
              setLocateBusy(false);
            }
          }}
          meetingPlace={meetingPlace}
          selectedKey={selectedVenueKey}
          onSelectVenue={onSelectVenue}
          onClearMeetingPlace={clearMeetingPlace}
          disabled={props.working}
        />
      ) : null}

      {step === 3 ? (
        <section className="create-circle-step stack" aria-labelledby="create-step-3">
          <h2 id="create-step-3" className="create-circle-step-title">
            When do you meet?
          </h2>
          <MeetDateTimePicker
            dateId="create-circle-meet-datetime"
            dateValue={meetDate}
            hourValue={meetHour}
            minDate={minMeetDate}
            onDateChange={setMeetDate}
            onHourChange={setMeetHour}
            disabled={props.working}
          />
          <label className="create-circle-repeat-row row">
            <input
              type="checkbox"
              className="create-circle-repeat-checkbox"
              checked={repeatsWeekly}
              onChange={(e) => setRepeatsWeekly(e.target.checked)}
              disabled={props.working}
            />
            <span className="create-circle-helper muted">This repeats every week</span>
          </label>
        </section>
      ) : null}

      {step === 4 ? (
        <CreateCircleGroupSizeStep
          value={groupSize}
          onChange={(next) => {
            setGroupSize(next);
            setGroupSizeError(null);
            setError(null);
          }}
          disabled={props.working}
          fieldError={groupSizeError}
        />
      ) : null}

      {step === 5 ? (
        <CreateCircleCostPaymentStep
          value={costPayment}
          groupSize={groupSize}
          onChange={(next) => {
            setCostPayment(next);
            setCostPaymentError(null);
            setError(null);
          }}
          disabled={props.working}
          fieldError={costPaymentError}
        />
      ) : null}

      {step === 6 ? (
        <section className="create-circle-step stack" aria-labelledby="create-step-6">
          <h2 id="create-step-6" className="create-circle-step-title">
            Your circle
          </h2>
          <ul className="create-circle-review">
            <li>
              <span className="create-circle-review-icon" aria-hidden>
                {selectedHoby?.icon || "🎯"}
              </span>
              <span>
                {selectedHoby?.displayName ?? hobySlug}
                {hobySubtype && !isSubcategoryAny(hobySubtype) ? ` · ${subtypeLabel}` : ""}
                {hobyLevel ? ` (${levelLabel})` : ""}
              </span>
            </li>
            <li>
              <span className="create-circle-review-icon" aria-hidden>
                📅
              </span>
              <span>{formatScheduleSummary(meetDate, meetHour, repeatsWeekly, formatHourOnlyDisplay)}</span>
            </li>
            <li>
              <span className="create-circle-review-icon" aria-hidden>
                📍
              </span>
              <div className="create-circle-review-location">
                <span dir="auto">{meetingPlaceReview.placeName}</span>
                {meetingPlaceReview.addressLine ? (
                  <span className="create-circle-review-location-address muted" dir="auto">
                    {meetingPlaceReview.addressLine}
                  </span>
                ) : null}
              </div>
            </li>
            <li>
              <span className="create-circle-review-icon" aria-hidden>
                👥
              </span>
              <span>{groupSizeSummary}</span>
            </li>
            <li>
              <span className="create-circle-review-icon" aria-hidden>
                💳
              </span>
              <span>{costPaymentSummary}</span>
            </li>
            <li>
              <span className="create-circle-review-icon" aria-hidden>
                {openCircle ? "🌐" : "🔒"}
              </span>
              <span>{openCircle ? "Open circle — anyone can join" : "Invite only — join code required"}</span>
            </li>
          </ul>
          <OpenCircleToggle checked={openCircle} onChange={setOpenCircle} disabled={props.working} />
        </section>
      ) : null}

      {props.error ? <FormError>{props.error}</FormError> : null}

      <div ref={navRef} className="create-circle-nav row create-circle-nav--sticky">
        {step > 1 ? (
          <button type="button" style={{ width: "auto" }} disabled={props.working} onClick={goBack}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            className="primary create-circle-next-btn"
            disabled={
              props.working ||
              (step === 1 && !step1Complete) ||
              (step === 2 && !step2Complete) ||
              (step === 3 && !step3Complete) ||
              (step === 4 && !step4Complete) ||
              (step === 5 && !step5Complete)
            }
            onClick={goNext}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="primary create-circle-next-btn"
            disabled={props.working || !step1Complete || !step2Complete || !step3Complete || !step4Complete || !step5Complete}
            onClick={() => void create()}
          >
            {props.working ? "Creating…" : "Create Circle"}
          </button>
        )}
      </div>
    </div>
  );
}
