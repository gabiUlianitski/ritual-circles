import React from "react";
import { useTranslation } from "react-i18next";
import "../welcome.css";
import {
  WelcomeCommunityVisual,
  WelcomePageShell,
  WelcomeProofList,
} from "./WelcomeParts";
import { WelcomeHobbyChips } from "./WelcomeHobbyChips";

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
      <WelcomeCommunityVisual />

      <h1 id="guest-explore-title" className="welcome-title">{t("guestExplore.headline")}</h1>

      <p className="welcome-tagline">{t("guestExplore.tagline")}</p>

      <p className="welcome-description">{t("guestExplore.description")}</p>

      <WelcomeHobbyChips disabled={props.disabled} onSelect={props.onBrowseHobby} />

      <WelcomeProofList labelPrefix="guestExplore" />

      <div className="welcome-actions">
        <button type="button" className="welcome-btn welcome-btn--primary" disabled={props.disabled} onClick={props.onFindCircles}>
          {t("guestExplore.seeCircles")}
        </button>

        <button type="button" className="welcome-btn welcome-btn--secondary" disabled={props.disabled} onClick={props.onCreateCircle}>
          {t("guestExplore.startCircle")}
        </button>
      </div>

      <p className="welcome-reassurance">{t("guestExplore.closingLine")}</p>

      {props.onBackToAuth ? (
        <button type="button" className="welcome-back-link" onClick={props.onBackToAuth}>
          {t("guestExplore.backToSignIn")}
        </button>
      ) : null}
    </WelcomePageShell>
  );
}
