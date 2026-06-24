import React from "react";
import { useTranslation } from "react-i18next";
import { circleParticipationState } from "./circleParticipation";
import { HomeParticipantAvatars } from "./HomeParticipantAvatars";

export function CircleParticipationDisplay(props: {
  memberCount: number;
  maxSize: number;
  showAvatars?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const state = circleParticipationState(props.memberCount, props.maxSize);
  const rootClass = ["circle-participation", props.className].filter(Boolean).join(" ");
  const joined = Math.max(0, props.memberCount);
  const capacity = Math.max(1, props.maxSize);
  const spotsLeft = capacity - joined;

  if (state.isFull) {
    return (
      <div className={rootClass}>
        <span className="home-status-badge home-status-badge--full circle-participation-full">
          {t("discoverPage.circleFull", { count: joined, max: capacity })}
        </span>
      </div>
    );
  }

  const peopleInLine =
    joined <= 1 ? null : t("home.peopleIn", { count: joined });
  const spotsLeftLine =
    spotsLeft <= 0
      ? null
      : spotsLeft === 1
        ? t("home.oneSpotLeft")
        : t("home.spotsLeft", { count: spotsLeft });

  return (
    <div className={rootClass}>
      {props.showAvatars ? <HomeParticipantAvatars count={props.memberCount} /> : null}
      <div className="circle-participation-copy">
        {peopleInLine ? <span className="circle-participation-in">{peopleInLine}</span> : null}
        {spotsLeftLine ? <span className="circle-participation-spots">{spotsLeftLine}</span> : null}
      </div>
    </div>
  );
}
