import React from "react";
import { useTranslation } from "react-i18next";
import {
  CircleCluster,
  FeatureRow,
  PrimaryButton,
  SecondaryButton,
  WelcomeActions,
  WelcomeDescription,
  WelcomeDivider,
  WelcomeHeadline,
  WelcomePageShell,
  WelcomeReassurance,
  WelcomeTagline,
  WelcomeTextAction,
} from "./welcome/WelcomeUIKit";

export function LandingChoose(props: {
  notice?: string | null;
  disabled?: boolean;
  lookAroundDisabled?: boolean;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onLookAround: () => void;
}) {
  const { t } = useTranslation();

  return (
    <WelcomePageShell surfaceAriaLabelledBy="welcome-title">
      <CircleCluster />

      {props.notice ? <p className="welcome-notice">{props.notice}</p> : null}

      <WelcomeHeadline id="welcome-title">{t("welcome.headline")}</WelcomeHeadline>

      <WelcomeTagline>{t("welcome.tagline")}</WelcomeTagline>

      <WelcomeDescription>{t("welcome.description")}</WelcomeDescription>

      <WelcomeActions>
        <PrimaryButton disabled={props.disabled} onClick={props.onSignIn}>
          {t("welcome.signIn")}
        </PrimaryButton>

        <SecondaryButton disabled={props.disabled} onClick={props.onCreateAccount}>
          {t("welcome.createAccount")}
        </SecondaryButton>

        <WelcomeDivider label={t("welcome.or")} />

        <WelcomeTextAction
          disabled={props.disabled || props.lookAroundDisabled}
          onClick={props.onLookAround}
        >
          {t("welcome.lookAroundFirst")}
          <span aria-hidden="true">→</span>
        </WelcomeTextAction>
      </WelcomeActions>

      <FeatureRow variant="welcome" />

      <WelcomeReassurance>{t("welcome.reassurance")}</WelcomeReassurance>
    </WelcomePageShell>
  );
}
