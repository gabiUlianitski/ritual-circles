import React from "react";
import { useTranslation } from "react-i18next";
import { CircleDescriptionField } from "./CircleDescriptionField";
import { CircleNameField } from "./CircleNameField";

/**
 * Purpose is not stored on circles yet. These choices stay in the create draft
 * so the preview can show them, and they are not sent to POST /circles.
 */
export const CIRCLE_PURPOSES = [
  { id: "meet", icon: "👋", labelKey: "createCircle.purposeMeet" },
  { id: "learn", icon: "📚", labelKey: "createCircle.purposeLearn" },
  { id: "practice", icon: "🔁", labelKey: "createCircle.purposePractice" },
  { id: "train", icon: "💪", labelKey: "createCircle.purposeTrain" },
  { id: "share", icon: "💬", labelKey: "createCircle.purposeShare" },
] as const;

export type CirclePurposeId = (typeof CIRCLE_PURPOSES)[number]["id"];

function nameExampleKey(hobbyName: string, slug: string): string | null {
  const blob = `${slug} ${hobbyName}`.toLowerCase();
  if (/cycl|bike|bicycle|אופני/.test(blob)) return "createCircle.nameExampleCycling";
  if (blob.includes("chess") || blob.includes("שחמט")) return "createCircle.nameExampleChess";
  if (/hik|trail|הליכ/.test(blob)) return "createCircle.nameExampleHiking";
  return null;
}

export function CreateCircleIdentityStep(props: {
  circleName: string;
  circleDescription: string;
  purpose: CirclePurposeId | null;
  hobbyName: string;
  hobbySlug: string;
  hobbyIcon: string;
  levelName: string;
  disabled?: boolean;
  /** Fields only, for the final review. Skips the identity header and preview. */
  fieldsOnly?: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPurposeChange: (value: CirclePurposeId | null) => void;
}) {
  const { t } = useTranslation();
  const exampleKey = nameExampleKey(props.hobbyName, props.hobbySlug);
  const purpose = CIRCLE_PURPOSES.find((item) => item.id === props.purpose) ?? null;
  const previewName = props.circleName.trim() || t("createCircle.previewNameFallback");
  const previewDescription =
    props.circleDescription.trim() || t("createCircle.previewDescriptionFallback");

  const fields = (
    <>
      <CircleNameField
        id="create-circle-name"
        value={props.circleName}
        onChange={props.onNameChange}
        disabled={props.disabled}
        label={t("createCircle.identityNameLabel")}
        placeholder={exampleKey ? t(exampleKey) : undefined}
        hint={null}
      />

      <div className="stack" style={{ gap: 10 }}>
        <h3 className="create-hobby-follow-title">{t("createCircle.purposeQuestion")}</h3>
        <div className="circle-purpose-list" role="radiogroup" aria-label={t("createCircle.purposeQuestion")}>
          {CIRCLE_PURPOSES.map((item) => {
            const selected = item.id === props.purpose;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`circle-purpose-card${selected ? " is-selected" : ""}`}
                disabled={props.disabled}
                onClick={() => props.onPurposeChange(selected ? null : item.id)}
              >
                <span className="circle-purpose-icon" aria-hidden>
                  {selected ? "✓" : item.icon}
                </span>
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <CircleDescriptionField
        id="create-circle-description"
        value={props.circleDescription}
        onChange={props.onDescriptionChange}
        disabled={props.disabled}
        label={t("createCircle.descriptionQuestion")}
        hint={t("createCircle.descriptionFriendly")}
        placeholder={t("createCircle.descriptionExample")}
      />
    </>
  );

  if (props.fieldsOnly) {
    return <div className="create-review-details-fields stack">{fields}</div>;
  }

  return (
    <section className="create-circle-step circle-identity-step stack" aria-labelledby="create-step-identity">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="create-step-identity" className="create-circle-step-title">
          {t("createCircle.identityTitle")}
        </h2>
        <p className="circle-identity-subtitle muted">{t("createCircle.identitySubtitle")}</p>
      </div>

      {fields}

      <article className="circle-identity-preview" aria-live="polite">
        <div className="circle-identity-preview-title">
          <span aria-hidden>{props.hobbyIcon || "🎯"}</span>
          <span dir="auto">{previewName}</span>
        </div>
        {props.hobbyName ? (
          <p className="circle-identity-preview-hobby" dir="auto">
            {props.hobbyName}
          </p>
        ) : null}
        {props.levelName ? (
          <p className="circle-identity-preview-level" dir="auto">
            {props.levelName}
          </p>
        ) : null}
        {purpose ? (
          <p className="circle-identity-preview-purpose">
            <span className="muted">{t("createCircle.purposeLabel")}:</span>{" "}
            <span dir="auto">{t(purpose.labelKey)}</span>
          </p>
        ) : null}
        <p
          className={`circle-identity-preview-description${props.circleDescription.trim() ? "" : " muted"}`}
          dir="auto"
        >
          {previewDescription}
        </p>
      </article>
    </section>
  );
}
