import React from "react";
import { useTranslation } from "react-i18next";

export function OnboardingStepIndicator(props: { step: number; total?: number }) {
  const { t } = useTranslation();
  return (
    <p className="onboarding-step muted" aria-live="polite">
      {t("onboarding.stepOf", { step: props.step, total: props.total ?? 3 })}
    </p>
  );
}

export function OnboardingHome(props: {
  onFindCircles: () => void;
  onCreateCircle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="onboarding-screen card stack">
      <OnboardingStepIndicator step={1} />
      <div className="onboarding-copy stack">
        <h1 className="onboarding-title">
          {t("onboarding.welcomeTitleLead")}
          <br />
          {t("onboarding.welcomeTitle")}
        </h1>
        <p className="onboarding-subtitle muted">{t("onboarding.welcomeSubtitle")}</p>
      </div>
      <div className="onboarding-actions stack">
        <button type="button" className="primary onboarding-primary" onClick={props.onFindCircles}>
          {t("onboarding.findCircles")}
        </button>
        <button type="button" className="onboarding-secondary" onClick={props.onCreateCircle}>
          {t("onboarding.createFirstCircle")}
        </button>
      </div>
      <p className="onboarding-subtitle muted">{t("onboarding.welcomeReassurance")}</p>
    </div>
  );
}
