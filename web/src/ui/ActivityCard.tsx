import React from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "../api/types";
import { BidiText } from "./BidiText";
import { activityCardWhenLines, activityPriceLabel } from "./activityDisplay";

export function ActivityCard(props: { activity: Activity; onOpen: () => void }) {
  const { t } = useTranslation();
  const activity = props.activity;
  const when = activityCardWhenLines(activity);
  const price = activityPriceLabel(activity);
  const cancelled = activity.status === "cancelled";
  const draft = activity.status === "draft";
  const next = activity.recurrenceType === "recurring" ? activity.nextOccurrence : null;
  const place = (next?.locationName ?? activity.locationName)?.trim() ?? "";
  const address = (next?.locationAddress ?? activity.locationAddress)?.trim() ?? "";
  const participation = next?.participation ?? activity.participation;

  return (
    <article
      className={`activity-card${cancelled ? " is-cancelled" : ""}${draft ? " is-draft" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={activity.title}
      onClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onOpen();
        }
      }}
    >
      <h3 className="activity-card-title">
        <BidiText>{activity.title}</BidiText>
      </h3>
      {when.date || when.time ? (
        <p className="activity-card-when">
          {when.date ? <span className="activity-card-date">{when.date}</span> : null}
          {when.time ? <span className="activity-card-time">{when.time}</span> : null}
        </p>
      ) : null}
      {activity.recurrenceType === "recurring" ? (
        <p className="activity-card-repeat">{t("circleActivities.weekly")}</p>
      ) : null}
      {place ? (
        <p className="activity-card-place">
          <BidiText>{place}</BidiText>
        </p>
      ) : null}
      {address ? (
        <p className="activity-card-address muted">
          <BidiText>{address}</BidiText>
        </p>
      ) : null}
      {participation && participation.goingCount > 0 ? (
        <p className="activity-card-going">
          {t("activityParticipation.goingCount", {
            count: participation.goingCount,
            size: participation.groupSize,
          })}
          {participation.isFull ? <span>{t("activityParticipation.full")}</span> : null}
        </p>
      ) : (
        <p className="activity-card-size">{t("circleActivities.groupSizeLine", { count: activity.groupSize })}</p>
      )}
      <p className="activity-card-cost">{price ?? t("circleActivities.free")}</p>
      <p className="activity-card-status">{t(`activityDetails.status.${activity.status}`)}</p>
    </article>
  );
}
