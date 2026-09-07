import React from "react";
import { useTranslation } from "react-i18next";
import { WelcomeHobbyChips } from "./WelcomeHobbyChips";
import {
  CircleCluster,
  FeatureRow,
  PrimaryButton,
  SecondaryButton,
  WelcomeActions,
  WelcomeBackLink,
  WelcomeDescription,
  WelcomeHeadline,
  WelcomePageShell,
  WelcomeReassurance,
  WelcomeTagline,
} from "./WelcomeUIKit";

export function GuestExploreWelcome(props: {
  headerMenu?: React.ReactNode;
  onFindCircles: () => void;
  onBrowseHobby: (hobbySlug: string) => void;
  onCreateCircle: () => void;
  onBackToAuth?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <WelcomePageShell headerEnd={props.headerMenu} surfaceAriaLabelledBy="guest-explore-title">
      <div className="welcome-guest-explore">
        <CircleCluster />

        <WelcomeHeadline id="guest-explore-title">{t("guestExplore.headline")}</WelcomeHeadline>

        <WelcomeTagline>{t("guestExplore.tagline")}</WelcomeTagline>

        <WelcomeDescription>{t("guestExplore.description")}</WelcomeDescription>

        <WelcomeHobbyChips disabled={props.disabled} onSelect={props.onBrowseHobby} />

        <WelcomeActions>
          <PrimaryButton disabled={props.disabled} onClick={props.onFindCircles}>
            {t("guestExplore.seeCircles")}
          </PrimaryButton>

          <SecondaryButton disabled={props.disabled} onClick={props.onCreateCircle}>
            {t("guestExplore.startCircle")}
          </SecondaryButton>
        </WelcomeActions>

        <FeatureRow variant="guestExplore" />

        <WelcomeReassurance emphasis>{t("guestExplore.closingLine")}</WelcomeReassurance>

        {props.onBackToAuth ? (
          <WelcomeBackLink onClick={props.onBackToAuth}>
            {t("guestExplore.backToSignIn")}
          </WelcomeBackLink>
        ) : null}
      </div>
    </WelcomePageShell>
  );
}
