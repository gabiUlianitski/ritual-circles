import React from "react";
import { useTranslation } from "react-i18next";
import type { ChecklistProgress } from "../../onboarding/onboardingState";

export function OnboardingChecklist(props: { progress: ChecklistProgress; onDismiss: () => void }) {
  const { t } = useTranslation();
  const items = [
    { key: "join", done: props.progress.joinedCircle, label: t("onboarding.checklistJoin") },
    { key: "create", done: props.progress.createdCircle, label: t("onboarding.checklistCreate") },
    { key: "interests", done: props.progress.interests, label: t("onboarding.checklistInterests") },
  ] as const;
  const doneCount = items.filter((item) => item.done).length;

  return (
    <aside className="onboarding-checklist" aria-label={t("onboarding.checklistTitle")}>
      <div className="onboarding-checklist-head">
        <span className="onboarding-checklist-title">{t("onboarding.checklistTitle")}</span>
        <span className="onboarding-checklist-count">
          {t("onboarding.checklistProgress", { done: doneCount, total: items.length })}
        </span>
        <button
          type="button"
          className="onboarding-checklist-close"
          onClick={props.onDismiss}
          aria-label={t("onboarding.checklistDismiss")}
          title={t("onboarding.checklistDismiss")}
        >
          ×
        </button>
      </div>
      <ul className="onboarding-checklist-list">
        {items.map((item) => (
          <li
            key={item.key}
            className={`onboarding-checklist-item${item.done ? " onboarding-checklist-item--done" : ""}`}
          >
            <span className="onboarding-checklist-box" aria-hidden>
              {item.done ? "✓" : ""}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
