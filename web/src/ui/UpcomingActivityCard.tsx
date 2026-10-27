import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { HomeActivityItem } from "../api/types";
import { activityParticipationDisplay, activityScheduleLine } from "./activityDisplay";
import { BidiText } from "./BidiText";
import { FormError } from "./FormError";
import { HomeActivityReconfirm } from "./HomeActivityReconfirm";
import { homeActivityPlace, needsReconfirmation } from "./homeActivities";

/** One upcoming Activity, with the Circle named only as context. */
export function UpcomingActivityCard(props: {
  item: HomeActivityItem;
  memberCount?: number;
  onOpen: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const item = props.item;
  const participation = item.participation;
  const display = activityParticipationDisplay(participation, t);
  const when = activityScheduleLine(item.startAt, item.endAt);
  const place = homeActivityPlace(item);
  const changed = needsReconfirmation(item);
  const going = participation.currentUserStatus === "going";
  const closed = item.status !== "open" && item.status !== "confirmed";
  const memberLabel =
    props.memberCount == null
      ? null
      : props.memberCount === 1
        ? t("home.oneMember")
        : t("home.membersCount", { count: props.memberCount });
  const detailsLabel = item.isRecurring ? t("activityPage.viewDates") : t("activityPage.activityDetails");
  const personal = [
    item.status === "confirmed" ? t("activityDetails.status.confirmed") : null,
    going ? t("activityParticipation.youreGoing") : null,
  ].filter(Boolean);

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      if (item.occurrenceId) await api.joinOccurrence(item.activityId, item.occurrenceId);
      else await api.joinActivity(item.activityId);
      await props.onRefresh();
    } catch {
      setJoinError(t("activityParticipation.joinFailed"));
    } finally {
      setJoining(false);
    }
  }

  return (
    <article className="activity-decision">
      <button type="button" className="activity-decision-open" onClick={props.onOpen}>
        <span className="home-hobby-badge home-hobby-badge--sm" aria-hidden>
          {item.hobyIcon ?? ""}
        </span>
        <span className="activity-decision-copy">
          <BidiText as="span" className="activity-decision-title">
            {item.title}
          </BidiText>
          {item.isRecurring ? <span className="activity-decision-repeat">{t("activityPage.everyWeek")}</span> : null}
          {when ? <span className="activity-decision-when">{when}</span> : null}
          {place ? (
            <BidiText as="span" className="activity-decision-place">
              {place}
            </BidiText>
          ) : null}
          {changed ? null : (
            <>
              <span className="activity-decision-count">
                <bdi dir="ltr">{display.countLabel}</bdi>
                {display.secondaryLabel ? <span className="activity-decision-secondary"> · {display.secondaryLabel}</span> : null}
                {!display.secondaryLabel && display.fullLabel ? (
                  <span className="activity-decision-full"> · {display.fullLabel}</span>
                ) : null}
              </span>
              {display.readinessLabel ? <span className="activity-decision-ready">{display.readinessLabel}</span> : null}
              {personal.length > 0 ? <span className="activity-decision-meta">{personal.join(" · ")}</span> : null}
            </>
          )}
          <span className="activity-decision-circle">
            <BidiText>{item.circleName}</BidiText>
            {memberLabel ? <span className="activity-decision-members"> · {memberLabel}</span> : null}
          </span>
        </span>
      </button>
      {changed ? (
        <>
          <HomeActivityReconfirm item={item} onDone={props.onRefresh} />
          <div className="activity-decision-quiet">
            <span className="activity-decision-count">
              <bdi dir="ltr">{display.countLabel}</bdi>
              {display.secondaryLabel ? <span className="activity-decision-secondary"> · {display.secondaryLabel}</span> : null}
              {!display.secondaryLabel && display.fullLabel ? (
                <span className="activity-decision-full"> · {display.fullLabel}</span>
              ) : null}
            </span>
            {display.readinessLabel ? <span className="activity-decision-ready">{display.readinessLabel}</span> : null}
            {personal.length > 0 ? <span className="activity-decision-meta">{personal.join(" · ")}</span> : null}
          </div>
        </>
      ) : (
        <div className="activity-decision-actions">
          {closed || going || participation.isFull ? (
            <button type="button" className="primary" onClick={props.onOpen}>
              {detailsLabel}
            </button>
          ) : (
            <button type="button" className="primary" disabled={joining} onClick={() => void join()}>
              {item.occurrenceId ? t("activityParticipation.joinDate") : t("activityParticipation.join")}
            </button>
          )}
        </div>
      )}
      {joinError ? <FormError>{joinError}</FormError> : null}
    </article>
  );
}
