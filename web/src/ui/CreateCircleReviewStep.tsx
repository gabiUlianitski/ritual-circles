import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { circleHobbySubtitle, circleIdentity, type CircleIdentityFields } from "./circleDisplay";
import { CreateCircleIdentityStep, type CirclePurposeId, CIRCLE_PURPOSES } from "./CreateCircleIdentityStep";
import { OpenCircleToggle, openCircleLabel } from "./OpenCircleToggle";

function ReviewSection(props: {
  title: string;
  editLabel: string;
  summary: string;
  incomplete?: boolean;
  onEdit: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className={`create-review-section${props.incomplete ? " is-incomplete" : ""}`}>
      <div className="create-review-section-head">
        <h3 className="create-review-section-title">{props.title}</h3>
        <button type="button" className="create-review-edit" onClick={props.onEdit} aria-label={props.editLabel}>
          {t("createCircle.edit")}
        </button>
      </div>
      {props.summary ? (
        <p className="create-review-section-summary" dir="auto">
          {props.summary}
        </p>
      ) : null}
      {props.incomplete ? (
        <p className="create-review-alert" role="alert">
          {t("createCircle.sectionIncomplete")}
        </p>
      ) : null}
      {props.children}
    </section>
  );
}

export function CreateCircleReviewStep(props: {
  identity: CircleIdentityFields;
  hobbyIcon: string;
  typeName: string;
  levelName: string;
  placeLine: string;
  scheduleLine: string;
  groupSizeLine: string;
  costLine: string;
  description: string;
  circleName: string;
  purpose: CirclePurposeId | null;
  hobbyName: string;
  hobbySlug: string;
  openCircle: boolean;
  activityIncomplete: boolean;
  placeIncomplete: boolean;
  meetupIncomplete: boolean;
  membersIncomplete: boolean;
  costIncomplete: boolean;
  detailsIncomplete: boolean;
  disabled?: boolean;
  onEditStep: (step: number) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPurposeChange: (value: CirclePurposeId | null) => void;
  onOpenCircleChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const identity = circleIdentity(props.identity);
  const hobbyLine = circleHobbySubtitle(props.identity);
  const purpose = CIRCLE_PURPOSES.find((item) => item.id === props.purpose) ?? null;
  const showDetails = detailsOpen || props.detailsIncomplete;
  const activityLine = [identity.hobbyDisplayName, props.typeName, props.levelName].filter(Boolean).join(" · ");
  const detailParts = [
    identity.hasCustomName ? identity.name : "",
    purpose ? t(purpose.labelKey) : "",
    props.description.trim(),
  ].filter(Boolean);
  const detailLine = detailParts.join(" · ") || t("createCircle.notSetYet");

  useEffect(() => {
    if (!detailsOpen) return;
    document.getElementById("create-circle-name")?.focus();
  }, [detailsOpen]);

  return (
    <section className="create-circle-step create-review-step stack" aria-labelledby="create-step-6">
      <div className="stack" style={{ gap: 6 }}>
        <p className="create-review-eyebrow">{t("createCircle.reviewEyebrow")}</p>
        <h2 id="create-step-6" className="create-circle-step-title">
          {t("createCircle.reviewTitle")}
        </h2>
        <p className="create-review-subtitle muted">{t("createCircle.reviewSubtitle")}</p>
      </div>

      <article className="create-review-preview" aria-label={identity.displayTitle}>
        <div className="create-review-preview-title">
          {props.hobbyIcon.trim() ? (
            <span className="create-review-preview-icon" aria-hidden>
              {props.hobbyIcon}
            </span>
          ) : null}
          <span dir="auto">{identity.displayTitle}</span>
        </div>
        {hobbyLine ? (
          <p className="create-review-preview-line" dir="auto">
            {hobbyLine}
          </p>
        ) : null}
        {props.typeName ? (
          <p className="create-review-preview-line" dir="auto">
            {props.typeName}
          </p>
        ) : null}
        {props.levelName ? (
          <p className="create-review-preview-line" dir="auto">
            {props.levelName}
          </p>
        ) : null}
        {props.placeLine ? (
          <p className="create-review-preview-line" dir="auto">
            <span aria-hidden>📍 </span>
            {props.placeLine}
          </p>
        ) : null}
        {props.scheduleLine ? <p className="create-review-preview-line">{props.scheduleLine}</p> : null}
        {props.groupSizeLine ? (
          <p className="create-review-preview-line">
            <span aria-hidden>👥 </span>
            {props.groupSizeLine}
          </p>
        ) : null}
        <p className="create-review-preview-line">
          <span aria-hidden>{props.openCircle ? "🌐 " : "🔒 "}</span>
          {openCircleLabel(props.openCircle)}
        </p>
        {props.description.trim() ? (
          <p className="create-review-preview-description" dir="auto">
            {props.description.trim()}
          </p>
        ) : null}
      </article>

      <div className="create-review-sections">
        <ReviewSection
          title={t("createCircle.reviewActivity")}
          editLabel={t("createCircle.editActivity")}
          summary={activityLine}
          incomplete={props.activityIncomplete}
          onEdit={() => props.onEditStep(1)}
        />
        <ReviewSection
          title={t("createCircle.reviewPlace")}
          editLabel={t("createCircle.editPlace")}
          summary={props.placeLine}
          incomplete={props.placeIncomplete}
          onEdit={() => props.onEditStep(2)}
        />
        <ReviewSection
          title={t("createCircle.reviewMeetup")}
          editLabel={t("createCircle.editMeetup")}
          summary={props.scheduleLine}
          incomplete={props.meetupIncomplete}
          onEdit={() => props.onEditStep(3)}
        />
        <ReviewSection
          title={t("createCircle.reviewMembers")}
          editLabel={t("createCircle.editMembers")}
          summary={props.groupSizeLine}
          incomplete={props.membersIncomplete}
          onEdit={() => props.onEditStep(4)}
        />
        <ReviewSection
          title={t("createCircle.reviewCost")}
          editLabel={t("createCircle.editCost")}
          summary={props.costLine}
          incomplete={props.costIncomplete}
          onEdit={() => props.onEditStep(5)}
        />
        <ReviewSection
          title={t("createCircle.reviewDetails")}
          editLabel={t("createCircle.editDetails")}
          summary={detailLine}
          incomplete={props.detailsIncomplete}
          onEdit={() => setDetailsOpen(true)}
        >
          {showDetails ? (
            <CreateCircleIdentityStep
              fieldsOnly
              circleName={props.circleName}
              circleDescription={props.description}
              purpose={props.purpose}
              hobbyName={props.hobbyName}
              hobbySlug={props.hobbySlug}
              hobbyIcon={props.hobbyIcon}
              levelName={props.levelName}
              disabled={props.disabled}
              onNameChange={props.onNameChange}
              onDescriptionChange={props.onDescriptionChange}
              onPurposeChange={props.onPurposeChange}
            />
          ) : null}
        </ReviewSection>
        <ReviewSection
          title={t("createCircle.reviewJoining")}
          editLabel={t("createCircle.editJoining")}
          summary={openCircleLabel(props.openCircle)}
          onEdit={() => document.getElementById("create-circle-open")?.focus()}
        >
          <OpenCircleToggle
            id="create-circle-open"
            checked={props.openCircle}
            onChange={props.onOpenCircleChange}
            disabled={props.disabled}
          />
        </ReviewSection>
      </div>

      <aside className="create-review-next">
        <h3 className="create-review-next-title">{t("createCircle.whatNextTitle")}</h3>
        <p className="muted">{t("createCircle.whatNextBody")}</p>
      </aside>
    </section>
  );
}
