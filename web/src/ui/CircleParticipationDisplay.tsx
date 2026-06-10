import React from "react";
import { circleParticipationState } from "./circleParticipation";
import { HomeParticipantAvatars } from "./HomeParticipantAvatars";

export function CircleParticipationDisplay(props: {
  memberCount: number;
  maxSize: number;
  showAvatars?: boolean;
  className?: string;
}) {
  const state = circleParticipationState(props.memberCount, props.maxSize);
  const rootClass = ["circle-participation", props.className].filter(Boolean).join(" ");

  if (state.isFull) {
    return (
      <div className={rootClass}>
        <span className="home-status-badge home-status-badge--confirmed circle-participation-full">
          Confirmed
        </span>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {props.showAvatars ? <HomeParticipantAvatars count={props.memberCount} /> : null}
      <div className="circle-participation-copy">
        {state.peopleInLine ? (
          <span className="circle-participation-in">{state.peopleInLine}</span>
        ) : null}
        {state.spotsLeftLine ? (
          <span className="circle-participation-spots">{state.spotsLeftLine}</span>
        ) : null}
      </div>
    </div>
  );
}
