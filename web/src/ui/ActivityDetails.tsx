import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Activity, CircleResponse, Hoby } from "../api/types";
import { BidiText } from "./BidiText";
import { ActivityAttendance } from "./ActivityAttendance";
import { ActivityEdit } from "./ActivityEdit";
import { activityDetailWhen, activityParticipationDisplay, activityPriceLabel, occurrenceWhen } from "./activityDisplay";
import { ActivityParticipationPanel } from "./ActivityParticipation";
import { ActivityChanged, ActivitySuggestions } from "./ActivitySuggestions";
import { circleDisplayTitle, discoverSubtitleParts } from "./circleDisplay";
import { parsedWeeklyRule } from "./activityForm";

export function ActivityDetails(props: {
  activityId: string;
  circle: CircleResponse;
  hobby?: Hoby;
  myUserId: string | null;
  ownerId: string | null;
  /** One date of a recurring Activity to bring into view, e.g. when opened from a notification. */
  focusOccurrenceId?: string | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState<string | null>(null);
  const [dateWorking, setDateWorking] = useState<string | null>(null);
  const [leaveDate, setLeaveDate] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const focusId = props.focusOccurrenceId ?? null;
  const focusMissing = Boolean(
    focusId && activity && !(activity.occurrences ?? []).some((item) => item.id === focusId),
  );

  useEffect(() => {
    if (!focusId || !activity) return;
    document.getElementById(`activity-date-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, activity?.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setNotFound(false);
    setEditing(false);
    void api
      .getActivity(props.activityId)
      .then((row) => {
        if (!cancelled) setActivity(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : "";
        setActivity(null);
        if (raw.includes("404")) setNotFound(true);
        else setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.activityId, retry]);

  if (editing && activity) {
    return (
      <ActivityEdit
        activity={activity}
        circle={props.circle}
        hobby={props.hobby}
        onBack={() => setEditing(false)}
        onSaved={(saved) => {
          setActivity(saved);
          setEditing(false);
          setNotice(t("activityDetails.saved"));
          props.onChanged();
        }}
      />
    );
  }

  const context = discoverSubtitleParts(props.circle, props.hobby).join(" · ");
  const when = activity ? activityDetailWhen(activity) : { date: "", time: "" };
  const price = activity ? activityPriceLabel(activity) : null;
  const series = activity?.recurrenceType === "recurring";
  const weekly = series ? parsedWeeklyRule(activity?.recurrenceRule) : null;
  const actions = activity?.actions;
  const seriesLive = series && (activity?.status === "open" || activity?.status === "confirmed");
  const upcomingDates = (activity?.occurrences ?? []).filter((item) => !item.hasEnded);
  const pastDates = (activity?.occurrences ?? []).filter((item) => item.hasEnded);
  const place = activity?.locationName?.trim() ?? "";
  const address = activity?.locationAddress?.trim() ?? "";
  const description = activity?.description?.trim() ?? "";

  function lifecycleError(err: unknown): string {
    const raw = err instanceof Error ? err.message : "";
    if (raw.includes("403")) return t("activityDetails.forbidden");
    if (raw.toLowerCase().includes("publish the activity before")) return t("activityDetails.confirmNeedsOpen");
    if (raw.toLowerCase().includes("must be confirmed")) return t("activityDetails.completeNeedsConfirmed");
    if (raw.toLowerCase().includes("after it ends")) return t("activityDetails.completeAfterEnd");
    if (raw.toLowerCase().includes("already been cancelled")) return t("activityDetails.alreadyCancelled");
    if (raw.toLowerCase().includes("already happened")) return t("activityDetails.dateAlreadyHappened");
    if (raw.toLowerCase().includes("no longer open")) return t("activityParticipation.dateClosed");
    return t("activityDetails.actionFailed");
  }

  async function runLifecycle(label: string, work: () => Promise<Activity>) {
    if (!activity) return;
    setWorking(true);
    setWorkingLabel(label);
    setActionError(null);
    try {
      const saved = await work();
      setActivity(saved);
      props.onChanged();
      return saved;
    } catch (err) {
      setActionError(lifecycleError(err));
      return null;
    } finally {
      setWorking(false);
      setWorkingLabel(null);
    }
  }

  async function publish() {
    const saved = await runLifecycle(t("activityDetails.publishing"), () => api.publishActivity(activity!.id));
    if (saved) setNotice(t("activityDetails.published"));
  }

  function dateProblem(err: unknown): string {
    const raw = err instanceof Error ? err.message : "";
    if (raw.includes("409") || raw.toLowerCase().includes("date is full")) return t("activityParticipation.dateFull");
    if (raw.toLowerCase().includes("has ended")) return t("activityParticipation.dateEnded");
    if (raw.toLowerCase().includes("no longer open")) return t("activityParticipation.dateClosed");
    if (raw.includes("403")) return t("activityParticipation.joinCircleFirst");
    return t("activityParticipation.participationFailed");
  }

  async function refreshActivity() {
    if (!activity) return;
    try {
      setActivity(await api.getActivity(activity.id));
    } catch {
      /* The error message still stands if the refresh fails. */
    }
  }

  async function joinDate(occurrenceId: string) {
    if (!activity) return;
    setDateWorking(occurrenceId);
    setDateError(null);
    try {
      const saved = await api.joinOccurrence(activity.id, occurrenceId);
      setActivity(saved);
      props.onChanged();
      setNotice(t("activityParticipation.joinedDate"));
    } catch (err) {
      setDateError(dateProblem(err));
      await refreshActivity();
    } finally {
      setDateWorking(null);
    }
  }

  async function submitLeave() {
    if (!activity || !leaveDate) return;
    const occurrenceId = leaveDate;
    setDateWorking(occurrenceId);
    setDateError(null);
    try {
      const saved = await api.leaveOccurrence(activity.id, occurrenceId);
      setActivity(saved);
      setLeaveDate(null);
      props.onChanged();
      setNotice(t("activityParticipation.leftDate"));
    } catch (err) {
      setLeaveDate(null);
      setDateError(dateProblem(err));
      await refreshActivity();
    } finally {
      setDateWorking(null);
    }
  }

  function changedSummary(start: string, end: string | null | undefined, placeText: string) {
    const next = occurrenceWhen(start, end);
    return [next.date, next.time, placeText].filter(Boolean).join(" · ");
  }

  async function stillGoing(occurrenceId: string | null) {
    if (!activity) return;
    setDateWorking(occurrenceId ?? "activity");
    setActionError(null);
    try {
      const saved = occurrenceId
        ? await api.reconfirmOccurrence(activity.id, occurrenceId)
        : await api.reconfirmActivity(activity.id);
      setActivity(saved);
      props.onChanged();
    } catch (err) {
      setActionError(dateProblem(err));
    } finally {
      setDateWorking(null);
    }
  }

  async function leaveChanged(occurrenceId: string | null) {
    if (!activity) return;
    setDateWorking(occurrenceId ?? "activity");
    setActionError(null);
    try {
      if (occurrenceId) {
        setActivity(await api.leaveOccurrence(activity.id, occurrenceId));
        setNotice(t("activityParticipation.leftDate"));
      } else {
        const saved = await api.leaveActivity(activity.id);
        setActivity({ ...activity, participation: saved });
        setNotice(t("activityParticipation.left"));
      }
      props.onChanged();
    } catch (err) {
      setActionError(dateProblem(err));
    } finally {
      setDateWorking(null);
    }
  }

  function dismiss() {
    setConfirmCancel(false);
    setConfirmCommit(false);
    setConfirmComplete(false);
    setTargetDate(null);
  }

  function ask(kind: "confirm" | "cancel" | "complete", occurrenceId: string | null) {
    setTargetDate(occurrenceId);
    if (kind === "confirm") setConfirmCommit(true);
    else if (kind === "complete") setConfirmComplete(true);
    else setConfirmCancel(true);
  }

  async function cancelActivity() {
    const dateId = targetDate;
    const saved = await runLifecycle(t("activityDetails.cancelling"), () =>
      api.cancelActivity(activity!.id, {
        occurrenceId: dateId,
        cancellationReason: cancelNote.trim() || null,
      }),
    );
    if (saved) {
      setConfirmCancel(false);
      setCancelNote("");
      setTargetDate(null);
      setNotice(
        dateId
          ? t("activityDetails.occurrenceUpdated")
          : series
            ? t("activityDetails.seriesCancelledDone")
            : t("activityDetails.cancelledDone"),
      );
    }
  }

  async function confirmActivity() {
    const dateId = targetDate;
    const saved = await runLifecycle(t("activityDetails.confirming"), () => api.confirmActivity(activity!.id, dateId));
    if (saved) {
      setConfirmCommit(false);
      setTargetDate(null);
      setNotice(dateId ? t("activityDetails.occurrenceUpdated") : t("activityDetails.confirmedDone"));
    }
  }

  async function completeActivity() {
    const dateId = targetDate;
    const saved = await runLifecycle(t("activityDetails.completing"), () => api.completeActivity(activity!.id, dateId));
    if (saved) {
      setConfirmComplete(false);
      setTargetDate(null);
      setNotice(dateId ? t("activityDetails.occurrenceUpdated") : t("activityDetails.completedDone"));
    }
  }

  function renderDate(item: NonNullable<Activity["occurrences"]>[number]) {
    if (!activity) return null;
    const when = occurrenceWhen(item.startAt, item.endAt);
    const places = item.participation;
    const facts = places ? activityParticipationDisplay(places, t) : null;
    const going = places?.currentUserStatus === "going";
    const busy = dateWorking === item.id || working;
    const live = item.status === "open" || item.status === "confirmed";
    const datePlace = item.locationName
      ? [item.locationName, item.locationAddress].filter(Boolean).join(", ")
      : [place, address].filter(Boolean).join(", ");
    return (
      <li
        key={item.id}
        id={`activity-date-${item.id}`}
        className={item.id === props.focusOccurrenceId ? "activity-occurrence-focused" : undefined}
      >
        <p className="activity-occurrence-when">
          <span>{when.date}</span>
          {when.time ? <span>{when.time}</span> : null}
        </p>
        {item.status === "cancelled" ? <p>{t("activityDetails.notHappening")}</p> : null}
        {item.status === "confirmed" && !item.hasEnded ? <p>{t("activityDetails.dateHappening")}</p> : null}
        {item.status === "completed" ? <p>{t("activityDetails.status.completed")}</p> : null}
        {item.status === "cancelled" && item.cancellationReason ? (
          <p>
            <span className="muted">{t("activityDetails.organizerNote")}</span>{" "}
            <BidiText>{item.cancellationReason}</BidiText>
          </p>
        ) : null}
        {item.hasEnded && live ? <p className="muted">{t("activityParticipation.dateEnded")}</p> : null}
        {facts ? (
          <p>
            {facts.countLabel}
            {facts.secondaryLabel ? <span> {facts.secondaryLabel}</span> : null}
            {facts.readinessLabel ? <span> {facts.readinessLabel}</span> : null}
            {facts.fullLabel ? <span> {facts.fullLabel}</span> : null}
          </p>
        ) : null}
        {item.locationName ? (
          <p className="activity-suggestion-place">
            <BidiText>{datePlace}</BidiText>
          </p>
        ) : null}
        {going ? <p>{t("activityParticipation.youreGoing")}</p> : null}
        {going && places?.confirmationRequired && item.actions.canLeave ? (
          <ActivityChanged
            summary={changedSummary(item.startAt, item.endAt, datePlace)}
            busy={busy}
            leaveLabel={t("activityParticipation.leaveDate")}
            onStillGoing={() => void stillGoing(item.id)}
            onLeave={() => void leaveChanged(item.id)}
          />
        ) : null}
        {item.actions.canJoin ? (
          <button type="button" className="circle-details-primary" disabled={busy} onClick={() => void joinDate(item.id)}>
            {dateWorking === item.id ? t("activityParticipation.joining") : t("activityParticipation.joinDate")}
          </button>
        ) : null}
        {item.actions.canLeave && !places?.confirmationRequired ? (
          <button type="button" className="circle-details-secondary" disabled={busy} onClick={() => setLeaveDate(item.id)}>
            {t("activityParticipation.leaveDate")}
          </button>
        ) : null}
        {item.actions.canCancel ? (
          <button type="button" disabled={busy} onClick={() => ask("cancel", item.id)}>
            {t("activityDetails.markNotHappening")}
          </button>
        ) : null}
        {item.attendance ? (
          <ActivityAttendance
            entries={item.attendance}
            onMark={async (participantId, outcome) => {
              setActivity(await api.recordDateAttendance(activity.id, item.id, participantId, outcome));
            }}
          />
        ) : null}
        <ActivitySuggestions
          activityId={activity.id}
          occurrenceId={item.id}
          suggestions={item.suggestions ?? []}
          canSuggest={Boolean(item.actions.canSuggest)}
          confirmed={item.status === "confirmed"}
          currentStart={item.startAt}
          currentEnd={item.endAt}
          currentPlace={datePlace}
          onUpdated={(saved) => {
            setActivity(saved);
            props.onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <div className={`activity-details stack${activity?.status === "cancelled" ? " is-cancelled" : ""}`}>
      <button type="button" className="circle-details-back" onClick={props.onBack}>
        {t("activityDetails.back")}
      </button>

      {loading ? (
        <div className="circle-details-skeleton" aria-label={t("common.loading")}>
          <div className="circle-details-skeleton-row" />
          <div className="circle-details-skeleton-row circle-details-skeleton-row--short" />
        </div>
      ) : notFound ? (
        <p className="activity-details-note" role="alert">
          {t("activityDetails.notFound")}
        </p>
      ) : failed || !activity ? (
        <div className="activity-details-note" role="alert">
          <p>{t("activityDetails.loadFailed")}</p>
          <button type="button" className="circle-details-secondary" onClick={() => setRetry((n) => n + 1)}>
            {t("circleActivities.tryAgain")}
          </button>
        </div>
      ) : (
        <>
          <header className="activity-details-head">
            <p className="activity-details-circle">
              <BidiText>{circleDisplayTitle(props.circle)}</BidiText>
            </p>
            {context ? <p className="muted">{context}</p> : null}
            <h1>
              <BidiText>{activity.title}</BidiText>
            </h1>
            {series ? <p className="activity-details-status">{t("activityDetails.recurringLabel")}</p> : null}
            {series && activity.status === "cancelled" ? <p>{t("activityDetails.seriesCancelled")}</p> : null}
            {activity.recurrenceType === "recurring" && (activity.occurrences?.length ?? 0) > 0 ? null : (
              <p className="activity-details-status">{t(`activityDetails.status.${activity.status}`)}</p>
            )}
            {activity.recurrenceType === "one_time" && activity.status === "draft" ? (
              <p className="muted">{t("activityDetails.draftHint")}</p>
            ) : null}
            {activity.recurrenceType === "recurring" && activity.status === "draft" ? (
              <p className="muted">{t("activityDetails.draftHint")}</p>
            ) : null}
            {activity.recurrenceType === "one_time" && activity.status === "confirmed" ? (
              <p>{t("activityDetails.happening")}</p>
            ) : null}
            {activity.recurrenceType === "one_time" && activity.status === "confirmed" && activity.hasEnded ? (
              <p>{t("activityDetails.passed")}</p>
            ) : null}
            {activity.recurrenceType === "one_time" && activity.status === "completed" ? (
              <p>{t("activityDetails.ended")}</p>
            ) : null}
            {activity.recurrenceType === "one_time" && activity.status === "cancelled" ? (
              <p>{t("activityDetails.wasCancelled")}</p>
            ) : null}
            {activity.status === "cancelled" && activity.cancellationReason ? (
              <p>
                <span className="muted">{t("activityDetails.organizerNote")}</span>{" "}
                <BidiText>{activity.cancellationReason}</BidiText>
              </p>
            ) : null}
          </header>

          {notice ? (
            <p className="activity-form-success" role="status">
              {notice}
            </p>
          ) : null}

          {description ? (
            <p className="activity-details-description">
              <BidiText>{description}</BidiText>
            </p>
          ) : null}

          {when.date || when.time ? (
            <p className="activity-details-when">
              {when.date ? <span>{when.date}</span> : null}
              {when.time ? <span>{when.time}</span> : null}
            </p>
          ) : null}
          {activity.recurrenceType === "recurring" ? (
            <p className="activity-details-repeat">
              {weekly
                ? t("activityDetails.weeklyAt", {
                    day: t(`activityForm.day${weekly.weekday}`),
                    time: weekly.time,
                  })
                : t("circleActivities.weekly")}
            </p>
          ) : null}

          {place ? (
            <p className="activity-details-place">
              <BidiText>{place}</BidiText>
            </p>
          ) : null}
          {address ? (
            <p className="activity-details-address muted">
              <BidiText>{address}</BidiText>
            </p>
          ) : null}

          <div className="activity-details-facts">
            <p>
              <span className="muted">{t("activityForm.minParticipants")}</span>
              <span>{activity.minParticipants}</span>
            </p>
            <p>
              <span className="muted">{t("activityDetails.groupSize")}</span>
              <span>{activity.groupSize}</span>
            </p>
            <p>
              <span className="muted">{t("activityDetails.cost")}</span>
              <span>{price ?? t("activityDetails.free")}</span>
            </p>
          </div>

          {activity.recurrenceType === "one_time" ? (
            <ActivityParticipationPanel
              activity={activity}
              onActivity={setActivity}
              onChanged={props.onChanged}
              onNotice={setNotice}
            />
          ) : null}
          {activity.recurrenceType === "one_time" && activity.attendance ? (
            <ActivityAttendance
              entries={activity.attendance}
              onMark={async (participantId, outcome) => {
                setActivity(await api.recordAttendance(activity.id, participantId, outcome));
              }}
            />
          ) : null}
          {activity.recurrenceType === "one_time" &&
          activity.participation?.currentUserStatus === "going" &&
          activity.participation.confirmationRequired ? (
            <ActivityChanged
              summary={changedSummary(activity.startAt, activity.endAt, [place, address].filter(Boolean).join(", "))}
              busy={dateWorking === "activity" || working}
              onStillGoing={() => void stillGoing(null)}
              onLeave={() => void leaveChanged(null)}
            />
          ) : null}

          {actionError ? (
            <p className="activity-form-field-error" role="alert">
              {actionError}
            </p>
          ) : null}

          {actions?.canPublish || actions?.canEdit || actions?.canConfirm || actions?.canComplete || actions?.canCancel ? (
            <div className="activity-details-actions">
              {actions.canPublish ? (
                <button type="button" className="circle-details-primary" disabled={working} onClick={() => void publish()}>
                  {workingLabel && actions.canPublish ? workingLabel : t("activityDetails.publish")}
                </button>
              ) : null}
              {actions.canConfirm ? (
                <button type="button" className="circle-details-primary" disabled={working} onClick={() => ask("confirm", null)}>
                  {t("activityDetails.confirm")}
                </button>
              ) : null}
              {actions.canComplete ? (
                <button type="button" className="circle-details-primary" disabled={working} onClick={() => ask("complete", null)}>
                  {t("activityDetails.complete")}
                </button>
              ) : null}
              {actions.canEdit ? (
                <button type="button" className="circle-details-secondary" disabled={working} onClick={() => setEditing(true)}>
                  {t("activityDetails.edit")}
                </button>
              ) : null}
              {actions.canCancel ? (
                <button type="button" className="activity-details-cancel" disabled={working} onClick={() => ask("cancel", null)}>
                  {series ? t("activityDetails.cancelSeries") : t("activityDetails.cancel")}
                </button>
              ) : null}
            </div>
          ) : null}
          {activity.recurrenceType === "one_time" ? (
            <ActivitySuggestions
              activityId={activity.id}
              suggestions={activity.suggestions ?? []}
              canSuggest={Boolean(actions?.canSuggest)}
              confirmed={activity.status === "confirmed"}
              currentStart={activity.startAt}
              currentEnd={activity.endAt}
              currentPlace={[place, address].filter(Boolean).join(", ")}
              onUpdated={(saved) => {
                setActivity(saved);
                props.onChanged();
              }}
            />
          ) : null}
          {focusMissing ? <p className="muted">{t("activityNotifications.dateUnavailable")}</p> : null}
          {series && (activity.occurrences?.length ?? 0) > 0 ? (
            <section className="activity-occurrence-list" aria-label={t("activityDetails.chooseDate")}>
              {seriesLive ? (
                <>
                  <h2>{t("activityDetails.chooseDate")}</h2>
                  <p className="muted">
                    {t("activityDetails.upcomingDates", {
                      count: upcomingDates.filter((item) => item.status === "open" || item.status === "confirmed").length,
                    })}
                  </p>
                  {dateError ? (
                    <p className="activity-form-field-error" role="alert">
                      {dateError}
                    </p>
                  ) : null}
                  <ul>{upcomingDates.map(renderDate)}</ul>
                </>
              ) : null}
              {pastDates.length > 0 ? (
                <details className="activity-occurrence-past">
                  <summary>{t("activityDetails.pastDates", { count: pastDates.length })}</summary>
                  <ul>{pastDates.map(renderDate)}</ul>
                </details>
              ) : null}
            </section>
          ) : null}
        </>
      )}
      {confirmCancel ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-activity-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="cancel-activity-title">
              {targetDate
                ? t("activityDetails.notHappeningAsk")
                : series
                  ? t("activityDetails.cancelSeriesAsk")
                  : t("activityDetails.cancelAsk")}
            </h2>
            <p>
              {targetDate
                ? t("activityDetails.notHappeningBody")
                : series
                  ? t("activityDetails.cancelSeriesBody")
                  : ((activity?.participation?.goingCount) ?? 0) > 0
                    ? t("activityDetails.cancelBodyPeople")
                    : t("activityDetails.cancelBody")}
            </p>
            <label className="activity-form-field">
              <span>{t("activityDetails.cancelNote")}</span>
              <input className="create-circle-input" value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} />
            </label>
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={working} onClick={dismiss}>
                {series && !targetDate ? t("activityDetails.keepSeries") : t("activityDetails.keep")}
              </button>
              <button type="button" className="profile-interest-remove" disabled={working} onClick={() => void cancelActivity()}>
                {targetDate
                  ? t("activityDetails.markNotHappening")
                  : series
                    ? t("activityDetails.cancelSeries")
                    : t("activityDetails.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmCommit ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-activity-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="confirm-activity-title">{t("activityDetails.confirmAsk")}</h2>
            <p>{t("activityDetails.confirmBody")}</p>
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={working} onClick={dismiss}>
                {t("activityDetails.notYet")}
              </button>
              <button type="button" className="circle-details-primary" disabled={working} onClick={() => void confirmActivity()}>
                {working ? t("activityDetails.confirming") : t("activityDetails.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmComplete ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="complete-activity-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="complete-activity-title">{t("activityDetails.completeAsk")}</h2>
            <p>{t("activityDetails.completeBody")}</p>
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={working} onClick={dismiss}>
                {t("activityDetails.notYet")}
              </button>
              <button type="button" className="circle-details-primary" disabled={working} onClick={() => void completeActivity()}>
                {working ? t("activityDetails.completing") : t("activityDetails.markCompleted")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {leaveDate ? (
        <div className="hoby-cat-modal" role="dialog" aria-modal="true" aria-labelledby="leave-date-title">
          <div className="hoby-cat-modal-card profile-interest-dialog">
            <h2 id="leave-date-title">{t("activityParticipation.leaveAsk")}</h2>
            <p>{t("activityParticipation.leaveBody")}</p>
            <div className="profile-interest-dialog-actions">
              <button type="button" disabled={dateWorking !== null} onClick={() => setLeaveDate(null)}>
                {t("activityParticipation.stay")}
              </button>
              <button type="button" className="profile-interest-remove" disabled={dateWorking !== null} onClick={() => void submitLeave()}>
                {dateWorking === leaveDate ? t("activityParticipation.leaving") : t("activityParticipation.leaveDate")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
