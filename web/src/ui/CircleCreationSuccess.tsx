import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleResponse } from "../api/types";
import { meetingPlaceReviewParts } from "../venueCardDisplay";
import { BidiText } from "./BidiText";
import { CircleInviteModal } from "./CircleInviteModal";
import { circleDisplayTitle, circleHobbySubtitle } from "./circleDisplay";
import { formatHourOnlyDisplay } from "./HourOnlyPicker";
import { formatSessionDateTimeHero } from "./homeDashboardUtils";

/**
 * Create always enrolls the creator on the new circle's sessions.
 * The response has no member list, so this is that known result, not a fetched count.
 */
const CREATOR_IS_FIRST_MEMBER = 1;

function meetingClock(recurringTime: string): { day: string; time: string } {
  const [day, clock] = recurringTime.trim().split(/\s+/, 2);
  const hour = clock?.match(/^(\d{1,2})/)?.[1];
  return {
    day: day ?? "",
    time: hour ? formatHourOnlyDisplay(hour) : (clock ?? ""),
  };
}

export function CircleCreationSuccess(props: {
  circle: CircleResponse;
  /** First meeting instant already chosen in the wizard. The create response does not include it. */
  meetingAt?: string | null;
  onViewCircle: () => void;
  onEditCircle: () => void;
}) {
  const { t } = useTranslation();
  const circle = props.circle;
  const title = circleDisplayTitle(circle);
  const hobby = circleHobbySubtitle(circle);
  const when = meetingClock(circle.recurringTime);
  const meetingLabel = props.meetingAt ? formatSessionDateTimeHero(props.meetingAt) : "";
  const schedule =
    meetingLabel && meetingLabel !== props.meetingAt
      ? meetingLabel
      : [when.day, when.time].filter(Boolean).join(" · ");
  const place = meetingPlaceReviewParts(circle.meetingPlace ?? "");
  const location = [circle.cityName?.trim(), place.placeName].filter(Boolean).join(" · ");
  const open = circle.inviteOnly === false;
  const capacity = Math.max(CREATOR_IS_FIRST_MEMBER, circle.maxSize || 6);
  const openSpots = Math.max(0, capacity - CREATOR_IS_FIRST_MEMBER);

  return (
    <div className="card stack circle-join-success-page circle-created-page">
      <header className="circle-join-success-hero stack">
        <div className="circle-join-success-icon-wrap" aria-hidden>
          <span className="circle-join-success-icon">✅</span>
        </div>
        <p className="circle-created-kicker">{t("createSuccess.kicker")}</p>
        <h1 className="circle-join-success-headline">{t("createSuccess.headline")}</h1>
        <p className="circle-join-success-subheadline muted">
          {open ? t("createSuccess.supportOpen") : t("createSuccess.supportInvite")}
        </p>
      </header>

      <article className="circle-join-success-card stack" aria-label={title}>
        <div className="circle-join-success-summary-head">
          {circle.hobyIcon?.trim() ? (
            <span className="home-hobby-badge circle-details-hobby-badge" aria-hidden>
              {circle.hobyIcon}
            </span>
          ) : null}
          <div className="circle-join-success-summary-copy">
            <BidiText as="h2" className="circle-join-success-circle-name circle-title-wrap">
              {title}
            </BidiText>
            {hobby ? <p className="muted circle-identity-hobby">{hobby}</p> : null}
          </div>
        </div>
        {schedule ? (
          <p className="circle-created-meta" dir="auto">
            {schedule}
            {circle.isRecurring === false ? "" : ` · ${t("createSuccess.weekly")}`}
          </p>
        ) : null}
        {location ? (
          <p className="circle-created-meta" dir="auto">
            {location}
          </p>
        ) : null}
        <p className="circle-created-meta">{open ? t("circleDetails.openCircle") : t("circleDetails.inviteOnly")}</p>
        {circle.description?.trim() ? (
          <p className="circle-created-description" dir="auto">
            {circle.description.trim()}
          </p>
        ) : null}
      </article>

      <section className="circle-created-momentum" aria-label={t("createSuccess.momentumLabel")}>
        <div>
          <p className="circle-created-momentum-label">{t("createSuccess.members")}</p>
          <p className="circle-created-momentum-value">{CREATOR_IS_FIRST_MEMBER}</p>
        </div>
        <div>
          <p className="circle-created-momentum-label">{t("createSuccess.creator")}</p>
          <p className="circle-created-momentum-value">{t("createSuccess.firstMember")}</p>
        </div>
        <div>
          <p className="circle-created-momentum-label">{t("createSuccess.status")}</p>
          <p className="circle-created-momentum-value">{t("createSuccess.waiting")}</p>
        </div>
      </section>

      <section className="circle-created-grow stack" aria-label={t("createSuccess.growKicker")}>
        <p className="circle-created-kicker">{t("createSuccess.growKicker")}</p>
        <p className="circle-created-description" dir="auto">
          {t("createSuccess.growBody")}
        </p>
        {openSpots > 0 ? (
          <p className="circle-created-meta">
            {openSpots === 1 ? t("createSuccess.oneSpotOpen") : t("createSuccess.spotsOpen", { count: openSpots })}
          </p>
        ) : null}
      </section>

      <CircleInviteModal
        embedded
        isOpen
        circle={circle}
        joined={CREATOR_IS_FIRST_MEMBER}
        capacity={capacity}
        meetingAt={props.meetingAt}
        location={location || null}
        canInviteMembers
        onClose={() => {}}
      />

      <div className="circle-join-success-actions stack">
        <button type="button" className="circle-join-success-action-secondary" onClick={props.onViewCircle}>
          {t("circleJoinSuccess.viewCircle")}
        </button>
        <button type="button" className="circle-join-success-action-tertiary" onClick={props.onEditCircle}>
          {t("createSuccess.edit")}
        </button>
      </div>
    </div>
  );
}
