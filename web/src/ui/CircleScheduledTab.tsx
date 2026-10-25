import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import CircularProgress from "@mui/material/CircularProgress";
import { api } from "../api/client";
import type { CircleResponse, CitySuggestItem, CountryItem, VenueSuggestionItem } from "../api/types";
import { meetingPlaceValue, splitMeetingPlace } from "../venueCardDisplay";
import { CreateCircleCostPaymentStep } from "./CreateCircleCostPaymentStep";
import { CreateCircleVenuePicker } from "./CreateCircleVenuePicker";
import { circleAdjustTheme } from "./circleAdjustTheme";
import { FormError } from "./FormError";
import { CircleNameField, circleNameIsValid, circleNamePayload } from "./CircleNameField";
import { useTranslation } from "react-i18next";
import { CIRCLE_NAME_MAX } from "./circleDisplay";
import { geolocationUserMessage } from "../geolocationMessage";
import {
  costPaymentStateFromPayload,
  DEFAULT_COST_PAYMENT,
  toCostPaymentPayload,
  validateCostPayment,
  type CostPaymentState,
} from "./circlePayment";
import {
  DEFAULT_GROUP_SIZE,
  toGroupSizePayload,
  validateGroupSize,
  type GroupSizeState,
} from "./groupSize";

function groupSizeFromCircle(circle: CircleResponse | null): number {
  if (circle?.groupSize?.type === "fixed") {
    return circle.groupSize.min ?? circle.groupSize.max ?? circle.maxSize ?? 6;
  }
  return circle?.maxSize ?? 6;
}

function fixedGroupSizeState(n: number): GroupSizeState {
  return { ...DEFAULT_GROUP_SIZE, type: "fixed", fixedCount: n };
}

function FieldLabel(props: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
      {props.children}
    </Typography>
  );
}

function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ p: 2 }}>
      <Typography variant="subtitle2" color="text.primary" sx={{ mb: 2, fontWeight: 600 }}>
        {props.title}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>{props.children}</Box>
    </Card>
  );
}

export function CircleScheduledTab(props: {
  circleId: string;
  editWhenTrigger?: number;
  onCircleUpdated?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [circle, setCircle] = useState<CircleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cityQuery, setCityQuery] = useState("");
  const [citySelected, setCitySelected] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [meetingPlace, setMeetingPlace] = useState("");
  const [selectedVenueKey, setSelectedVenueKey] = useState<string | null>(null);
  const [locateBusy, setLocateBusy] = useState(false);
  const [venueSearchNonce, setVenueSearchNonce] = useState(0);
  const [costPayment, setCostPayment] = useState<CostPaymentState>(DEFAULT_COST_PAYMENT);
  const [groupSizeN, setGroupSizeN] = useState(6);
  const [openToEveryone, setOpenToEveryone] = useState(false);
  const [circleName, setCircleName] = useState("");

  const hydratedRef = useRef(false);
  const costSaveTimer = useRef<number | null>(null);

  const groupSizeState = useMemo(() => fixedGroupSizeState(groupSizeN), [groupSizeN]);

  const notifyCircleUpdated = useCallback(async () => {
    await props.onCircleUpdated?.();
  }, [props.onCircleUpdated]);

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const circleMe = await api.getMyCircle(props.circleId);
      const c = circleMe.circle ?? null;
      setCircle(c);

      if (!hydratedRef.current && c) {
        const city = c.cityName?.trim() || c.city?.trim() || "";
        setCityQuery(city);
        setCitySelected(city);
        setMeetingPlace(c.meetingPlace?.trim() || "");
        setCountryCode(c.countryCode?.trim().toUpperCase() || "");
        setCostPayment(costPaymentStateFromPayload(c.costPayment));
        setGroupSizeN(groupSizeFromCircle(c));
        setOpenToEveryone(c.inviteOnly === false);
        setCircleName(c.name?.trim() || "");
        if (city && c.ritualType) setVenueSearchNonce(1);
        hydratedRef.current = true;
      } else if (c) {
        setOpenToEveryone(c.inviteOnly === false);
        setGroupSizeN(groupSizeFromCircle(c));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [props.circleId]);

  useEffect(() => {
    setLoading(true);
    hydratedRef.current = false;
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!props.editWhenTrigger || loading) return;
    // Focus is handled by opening the tab; datetime picker opens on click.
  }, [props.editWhenTrigger, loading]);

  async function patchAndRefresh(payload: Parameters<typeof api.patchCircle>[1]) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patchCircle(props.circleId, payload);
      setCircle(updated);
      await load();
      await notifyCircleUpdated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function clearMeetingPlace() {
    setMeetingPlace("");
    setSelectedVenueKey(null);
  }

  function onCityQueryChange(q: string) {
    setCityQuery(q);
    setCitySelected("");
    clearMeetingPlace();
  }

  function onCitySelect(item: CitySuggestItem) {
    const display = item.displayName.trim() || item.shortName.trim();
    setCityQuery(item.shortName.trim() || display);
    setCitySelected(display);
    const cc = item.countryCode?.trim().toUpperCase();
    if (cc && cc.length === 2) setCountryCode(cc);
    clearMeetingPlace();
    setError(null);
    setVenueSearchNonce((n) => n + 1);
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
    setVenueSearchNonce((n) => n + 1);
  }

  async function saveVenue(venue: VenueSuggestionItem) {
    const cityLabel = citySelected.trim() || cityQuery.trim();
    if (!cityLabel) {
      setError("Pick a city first.");
      return;
    }
    const value = meetingPlaceValue(venue);
    const { name, address } = splitMeetingPlace(value);
    if (!name.trim()) return;
    await patchAndRefresh({
      meetingPlaceUpdate: {
        name: name.trim(),
        city: cityLabel,
        address: address.trim() || undefined,
      },
    });
  }

  function onSelectVenue(venue: VenueSuggestionItem, key: string) {
    setSelectedVenueKey(key);
    setMeetingPlace(meetingPlaceValue(venue));
    setError(null);
    void saveVenue(venue);
  }

  async function saveCostPayment(state: CostPaymentState) {
    const err = validateCostPayment(state);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    await patchAndRefresh({ costPayment: toCostPaymentPayload(state) });
  }

  function onCostPaymentChange(next: CostPaymentState) {
    setCostPayment(next);
    if (costSaveTimer.current) window.clearTimeout(costSaveTimer.current);
    costSaveTimer.current = window.setTimeout(() => {
      void saveCostPayment(next);
    }, 700);
  }

  async function saveGroupSize(n: number) {
    const state = fixedGroupSizeState(n);
    const err = validateGroupSize(state);
    if (err) {
      setError(err);
      return;
    }
    setGroupSizeN(n);
    await patchAndRefresh({ groupSize: toGroupSizePayload(state) });
  }

  async function saveVisibility(open: boolean) {
    setOpenToEveryone(open);
    await patchAndRefresh({ inviteOnly: !open });
  }

  if (loading && !circle) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={circleAdjustTheme}>
      <Box className="circle-adjust-tab" sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 400 }}>
          Adjust your circle
        </Typography>

        <SectionCard title="Circle details">
          <CircleNameField
            id="circle-adjust-name"
            value={circleName}
            onChange={setCircleName}
            disabled={saving}
          />
          <button
            type="button"
            className="primary"
            style={{ width: "auto" }}
            disabled={saving || !circleNameIsValid(circleName) || circleNamePayload(circleName) === (circle?.name?.trim() || null)}
            onClick={() => {
              if (!circleNameIsValid(circleName)) {
                setError(t("circleDetails.circleNameTooLong", { max: CIRCLE_NAME_MAX }));
                return;
              }
              void patchAndRefresh({ name: circleNamePayload(circleName) });
            }}
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <Box className="circle-adjust-wizards stack">
            {circle ? (
              <CreateCircleVenuePicker
                cityQuery={cityQuery}
                citySelected={citySelected}
                onCityQueryChange={onCityQueryChange}
                onCitySelect={onCitySelect}
                ritualType={circle.ritualType}
                ritualSubtype={circle.ritualSubtype ?? ""}
                ritualLevel={circle.ritualLevel ?? null}
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
                keepMeetingPlaceOnSearch
                disabled={saving}
              />
            ) : null}
          </Box>

          <CreateCircleCostPaymentStep
            value={costPayment}
            groupSize={groupSizeState}
            onChange={onCostPaymentChange}
            disabled={saving}
          />
        </SectionCard>

        <SectionCard title="Group setup">
          <Box>
            <FieldLabel>Group size</FieldLabel>
            <FormControl fullWidth size="small">
              <Select
                value={groupSizeN}
                disabled={saving}
                onChange={(e) => void saveGroupSize(Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n} people
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={openToEveryone}
                  disabled={saving}
                  onChange={(_, checked) => void saveVisibility(checked)}
                />
              }
              label={
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Open to everyone
                </Typography>
              }
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -0.5, ml: 6 }}>
              Anyone can join your circle
            </Typography>
          </Box>
        </SectionCard>

        {saving ? (
          <Typography variant="caption" color="text.secondary">
            Saving…
          </Typography>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
      </Box>
    </ThemeProvider>
  );
}
