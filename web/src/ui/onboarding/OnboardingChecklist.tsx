import React from "react";
import { useTranslation } from "react-i18next";
import type { ChecklistProgress } from "../../onboarding/onboardingState";

export function OnboardingChecklist(props: { progress: ChecklistProgress }) {
  const { t } = useTranslation();
  const items = [
    { key: "interests", done: props.progress.interests, label: t("onboarding.checklistInterests") },
    { key: "join", done: props.progress.joinedCircle, label: t("onboarding.checklistJoin") },
    { key: "schedule", done: props.progress.scheduledActivity, label: t("onboarding.checklistSchedule") },
    { key: "chat", done: props.progress.saidHello, label: t("onboarding.checklistChat") },
  ] as const;

  return (
    <section className="onboarding-checklist card stack" aria-label={t("onboarding.checklistTitle")}>
      <h2 className="onboarding-checklist-title">{t("onboarding.checklistTitle")}</h2>
      <ul className="onboarding-checklist-list">
        {items.map((item) => (
          <li key={item.key} className={`onboarding-checklist-item${item.done ? " onboarding-checklist-item--done" : ""}`}>
            <span className="onboarding-checklist-box" aria-hidden>
              {item.done ? "✓" : ""}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
