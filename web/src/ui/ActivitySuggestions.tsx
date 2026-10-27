import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity, ActivitySuggestion } from "../api/types";
import { BidiText } from "./BidiText";
import { CircleMemberAvatar } from "./CircleMemberAvatar";
import { DatePickerField } from "./DatePickerField";
import { occurrenceWhen } from "./activityDisplay";
import { localDateTimeIso } from "./activityForm";
import { QuarterHourTimePicker } from "./QuarterHourTimePicker";
import { snapTimeValue } from "./quarterHourTime";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "18:00" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", time: "18:00" };
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: snapTimeValue(`${pad(value.getHours())}:${pad(value.getMinutes())}`),
  };
}

function placeLine(name?: string | null, address?: string | null): string {
  return [name?.trim(), address?.trim()].filter(Boolean).join(", ");
}

export function ActivityChanged(props: {
  summary: string;
  busy: boolean;
  leaveLabel?: string;
  onStillGoing: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const leaveLabel = props.leaveLabel ?? t("activitySuggestions.leave");
  const [askLeave, setAskLeave] = useState(false);

  return (
    <section className="activity-changed" aria-label={t("activitySuggestions.activityChanged")}>
      <h3>{t("activitySuggestions.activityChanged")}</h3>
      <p>
        <span className="muted">{t("activitySuggestions.newDetails")}</span>{" "}
        <BidiText>{props.summary}</BidiText>
      </p>
      <p>{t("activitySuggestions.pleaseConfirm")}</p>
      <div className="activity-suggestion-actions">
        <button type="button" className="circle-details-primary" disabled={props.busy} onClick={props.onStillGoing}>
          {t("activitySuggestions.stillGoing")}
        </button>
        <button type="button" className="circle-details-secondary" disabled={props.busy} onClick={() => setAskLeave(true)}>
          {leaveLabel}
        </button>
      </div>
      {askLeave ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-leave-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="suggestion-leave-title">{t("activityParticipation.leaveAsk")}</h2>
            <p>{t("activityParticipation.leaveBody")}</p>
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={props.busy} onClick={() => setAskLeave(false)}>
                {t("activityParticipation.stay")}
              </button>
              <button
                type="button"
                className="profile-interest-remove"
                disabled={props.busy}
                onClick={() => {
                  setAskLeave(false);
                  props.onLeave();
                }}
              >
                {leaveLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ActivitySuggestions(props: {
  activityId: string;
  occurrenceId?: string | null;
  suggestions: ActivitySuggestion[];
  canSuggest: boolean;
  confirmed: boolean;
  currentStart: string;
  currentEnd?: string | null;
  currentPlace: string;
  onUpdated: (activity: Activity) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<"time" | "location" | null>(null);
  const [decision, setDecision] = useState<{ id: string; action: "accept" | "decline" | "withdraw" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = localParts(props.currentStart);
  const currentEnd = props.currentEnd ? localParts(props.currentEnd).time : "";
  const [date, setDate] = useState(current.date);
  const [startTime, setStartTime] = useState(current.time);
  const [endTime, setEndTime] = useState(currentEnd);
  const [useEnd, setUseEnd] = useState(Boolean(currentEnd));
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [note, setNote] = useState("");

  const openItems = props.suggestions.filter((item) => item.status === "open");
  const earlier = props.suggestions.filter((item) => item.status !== "open");
  const showSection = props.canSuggest || props.suggestions.length > 0;
  if (!showSection) return null;

  function openForm(kind: "time" | "location") {
    const start = localParts(props.currentStart);
    const end = props.currentEnd ? localParts(props.currentEnd).time : "";
    setDate(start.date);
    setStartTime(start.time);
    setEndTime(end);
    setUseEnd(Boolean(end));
    setPlaceName("");
    setPlaceAddress("");
    setNote("");
    setError(null);
    setForm(kind);
  }

  function problem(err: unknown): string {
    const raw = err instanceof Error ? err.message : "";
    if (raw.includes("403")) return t("activityForm.forbidden");
    if (raw.includes("409") && raw.toLowerCase().includes("wait until")) return t("activitySuggestions.oneAtATime");
    if (raw.includes("409")) return t("activitySuggestions.duplicate");
    if (raw.toLowerCase().includes("no longer available") || raw.toLowerCase().includes("not available")) {
      return t("activitySuggestions.unavailable");
    }
    return t("activitySuggestions.failed");
  }

  async function run(work: () => Promise<Activity>) {
    setBusy(true);
    setError(null);
    try {
      props.onUpdated(await work());
      setForm(null);
      setDecision(null);
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (form === "time") {
      const proposedStartAt = localDateTimeIso(date, startTime);
      if (!proposedStartAt) {
        setError(t("activitySuggestions.needTime"));
        return;
      }
      const proposedEndAt = useEnd && endTime ? localDateTimeIso(date, endTime) : null;
      if (proposedEndAt && new Date(proposedEndAt) <= new Date(proposedStartAt)) {
        setError(t("activitySuggestions.endAfterStart"));
        return;
      }
      const payload = {
        type: "time" as const,
        proposedStartAt,
        proposedEndAt,
        note: note.trim() || null,
      };
      await run(() =>
        props.occurrenceId
          ? api.suggestOccurrence(props.activityId, props.occurrenceId, payload)
          : api.suggestActivity(props.activityId, payload),
      );
      return;
    }
    if (!placeName.trim()) {
      setError(t("activitySuggestions.needPlace"));
      return;
    }
    const payload = {
      type: "location" as const,
      proposedLocationName: placeName.trim(),
      proposedLocationAddress: placeAddress.trim() || null,
      note: note.trim() || null,
    };
    await run(() =>
      props.occurrenceId
        ? api.suggestOccurrence(props.activityId, props.occurrenceId, payload)
        : api.suggestActivity(props.activityId, payload),
    );
  }

  function statusLabel(status: ActivitySuggestion["status"]): string {
    if (status === "accepted") return t("activitySuggestions.accepted");
    if (status === "declined") return t("activitySuggestions.declined");
    if (status === "withdrawn") return t("activitySuggestions.withdrawn");
    return t("activitySuggestions.open");
  }

  function renderSuggestion(item: ActivitySuggestion) {
    const when = item.type === "time" ? occurrenceWhen(item.proposedStartAt ?? "", item.proposedEndAt) : null;
    const place = item.type === "location" ? placeLine(item.proposedLocationName, item.proposedLocationAddress) : "";
    return (
      <article key={item.id} className="activity-suggestion-card">
        <h4>{item.type === "time" ? t("activitySuggestions.differentTime") : t("activitySuggestions.differentPlace")}</h4>
        {when ? (
          <p className="activity-occurrence-when">
            {when.date ? <span>{when.date}</span> : null}
            {when.time ? <span>{when.time}</span> : null}
          </p>
        ) : (
          <p className="activity-suggestion-place">
            <BidiText>{place}</BidiText>
          </p>
        )}
        <p className="activity-suggestion-by">
          <CircleMemberAvatar name={item.suggestedByName} avatarUrl={item.suggestedByAvatarUrl} compact />
          <span>
            {t("activitySuggestions.suggestedBy")} <BidiText>{item.suggestedByName}</BidiText>
          </span>
        </p>
        {item.note ? (
          <p className="activity-suggestion-note">
            <BidiText>{item.note}</BidiText>
          </p>
        ) : null}
        <p className="muted">
          {t("activitySuggestions.supportCount", { count: item.supportCount })}
          {" · "}
          {statusLabel(item.status)}
        </p>
        {item.status === "open" && !item.actionable ? <p>{t("activitySuggestions.unavailable")}</p> : null}
        {item.canSupport || item.canWithdraw ? (
          <div className="activity-suggestion-actions">
            {item.canSupport ? (
              <button
                type="button"
                className="circle-details-secondary"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    item.supportedByMe ? api.removeSuggestionSupport(item.id) : api.supportSuggestion(item.id),
                  )
                }
              >
                {item.supportedByMe ? t("activitySuggestions.supporting") : t("activitySuggestions.support")}
              </button>
            ) : null}
            {item.canWithdraw ? (
              <button type="button" disabled={busy} onClick={() => setDecision({ id: item.id, action: "withdraw" })}>
                {t("activitySuggestions.withdraw")}
              </button>
            ) : null}
          </div>
        ) : null}
        {item.canDecide ? (
          <div className="activity-suggestion-actions activity-suggestion-decisions">
            <button type="button" className="circle-details-primary" disabled={busy} onClick={() => setDecision({ id: item.id, action: "accept" })}>
              {t("activitySuggestions.accept")}
            </button>
            <button type="button" disabled={busy} onClick={() => setDecision({ id: item.id, action: "decline" })}>
              {t("activitySuggestions.decline")}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  const now = occurrenceWhen(props.currentStart, props.currentEnd);

  return (
    <section className="activity-suggestions" aria-label={t("activitySuggestions.title")}>
      <h3>{t("activitySuggestions.title")}</h3>
      {props.confirmed && props.canSuggest ? <p className="muted">{t("activitySuggestions.alreadyConfirmed")}</p> : null}
      {props.suggestions.length === 0 ? (
        <>
          <p>{t("activitySuggestions.empty")}</p>
          {props.canSuggest ? <p className="muted">{t("activitySuggestions.emptyHint")}</p> : null}
        </>
      ) : (
        <div className="activity-suggestion-list">{openItems.map(renderSuggestion)}</div>
      )}
      {props.canSuggest && openItems.length === 0 ? (
        <div className="activity-suggestion-actions">
          <button type="button" disabled={busy} onClick={() => openForm("time")}>
            {t("activitySuggestions.suggestTime")}
          </button>
          <button type="button" disabled={busy} onClick={() => openForm("location")}>
            {t("activitySuggestions.suggestPlace")}
          </button>
        </div>
      ) : null}
      {props.canSuggest && openItems.length > 0 ? <p className="muted">{t("activitySuggestions.oneAtATime")}</p> : null}
      {earlier.length > 0 ? (
        <details className="activity-suggestion-earlier">
          <summary>{t("activitySuggestions.earlier")}</summary>
          <div className="activity-suggestion-list">{earlier.map(renderSuggestion)}</div>
        </details>
      ) : null}
      {error && !form && !decision ? (
        <p className="activity-form-field-error" role="alert">
          {error}
        </p>
      ) : null}

      {form ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-form-title">
          <div className="hoby-cat-modal-card profile-interest-dialog activity-suggestion-form">
            <h2 id="suggestion-form-title">
              {form === "time" ? t("activitySuggestions.suggestTime") : t("activitySuggestions.suggestPlace")}
            </h2>
            {form === "time" ? (
              <>
                <p className="muted">{t("activitySuggestions.currentTime")}</p>
                <p className="activity-occurrence-when">
                  {now.date ? <span>{now.date}</span> : null}
                  {now.time ? <span>{now.time}</span> : null}
                </p>
                <DatePickerField id="suggestion-date" label={t("activitySuggestions.proposedDate")} value={date} onChange={setDate} />
                <QuarterHourTimePicker
                  value={startTime}
                  onChange={setStartTime}
                  hourLabel={t("activitySuggestions.proposedStart")}
                  hourId="suggestion-start-hour"
                  minuteId="suggestion-start-minute"
                />
                <label className="activity-suggestion-check">
                  <input type="checkbox" checked={useEnd} onChange={(event) => setUseEnd(event.target.checked)} />
                  <span>{t("activitySuggestions.addEnd")}</span>
                </label>
                {useEnd ? (
                  <QuarterHourTimePicker
                    value={endTime || startTime}
                    onChange={setEndTime}
                    hourLabel={t("activitySuggestions.proposedEnd")}
                    hourId="suggestion-end-hour"
                    minuteId="suggestion-end-minute"
                  />
                ) : null}
              </>
            ) : (
              <>
                <p className="muted">{t("activitySuggestions.currentPlace")}</p>
                <p className="activity-suggestion-place">
                  <BidiText>{props.currentPlace || t("activitySuggestions.noPlace")}</BidiText>
                </p>
                <label className="activity-form-field">
                  <span>{t("activitySuggestions.placeName")}</span>
                  <input className="create-circle-input" value={placeName} onChange={(event) => setPlaceName(event.target.value)} />
                </label>
                <label className="activity-form-field">
                  <span>{t("activitySuggestions.address")}</span>
                  <input className="create-circle-input" value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} />
                </label>
              </>
            )}
            <label className="activity-form-field">
              <span>{t("activitySuggestions.note")}</span>
              <input className="create-circle-input" value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} />
            </label>
            {error ? (
              <p className="activity-form-field-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={busy} onClick={() => setForm(null)}>
                {t("activitySuggestions.close")}
              </button>
              <button type="button" className="circle-details-primary" disabled={busy} onClick={() => void submit()}>
                {busy ? t("activitySuggestions.sending") : t("activitySuggestions.submit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {decision ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-decision-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="suggestion-decision-title">
              {decision.action === "accept"
                ? t("activitySuggestions.acceptAsk")
                : decision.action === "decline"
                  ? t("activitySuggestions.declineAsk")
                  : t("activitySuggestions.withdrawAsk")}
            </h2>
            <p>
              {decision.action === "accept"
                ? t("activitySuggestions.acceptBody")
                : decision.action === "decline"
                  ? t("activitySuggestions.declineBody")
                  : t("activitySuggestions.withdrawBody")}
            </p>
            {error ? (
              <p className="activity-form-field-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={busy} onClick={() => setDecision(null)}>
                {t("activitySuggestions.close")}
              </button>
              <button
                type="button"
                className={decision.action === "accept" ? "circle-details-primary" : "profile-interest-remove"}
                disabled={busy}
                onClick={() =>
                  void run(() => {
                    if (decision.action === "accept") return api.acceptSuggestion(decision.id);
                    if (decision.action === "decline") return api.declineSuggestion(decision.id);
                    return api.withdrawSuggestion(decision.id);
                  })
                }
              >
                {decision.action === "accept"
                  ? t("activitySuggestions.accept")
                  : decision.action === "decline"
                    ? t("activitySuggestions.decline")
                    : t("activitySuggestions.withdraw")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
