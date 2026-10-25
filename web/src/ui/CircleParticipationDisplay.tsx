import React from "react";
import { useTranslation } from "react-i18next";
import { HomeParticipantAvatars } from "./HomeParticipantAvatars";

export function CircleParticipationDisplay(props: {
  memberCount: number;
  maxSize: number;
  showAvatars?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const rootClass = ["circle-participation", props.className].filter(Boolean).join(" ");
  const joined = Math.max(0, props.memberCount);

  return (
    <div className={rootClass}>
      {props.showAvatars ? <HomeParticipantAvatars count={props.memberCount} /> : null}
      <div className="circle-participation-copy">
        <span className="circle-participation-in">{t("circleDetails.memberCount", { count: joined })}</span>
      </div>
    </div>
  );
}
