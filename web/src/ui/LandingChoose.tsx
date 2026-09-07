import React from "react";
import { useTranslation } from "react-i18next";
import "./welcome.css";

function WelcomeBrandMark() {
  return (
    <span className="welcome-brand-mark" aria-hidden="true">
      <span className="brand-node brand-node-one" />
      <span className="brand-node brand-node-two" />
      <span className="brand-node brand-node-three" />
    </span>
  );
}

function WelcomeCommunityVisual() {
  return (
    <div className="welcome-community-visual" aria-hidden="true">
      <div className="welcome-community-visual__canvas">
        <span className="welcome-community-visual__line welcome-community-visual__line--1" />
        <span className="welcome-community-visual__line welcome-community-visual__line--2" />
        <span className="welcome-community-visual__line welcome-community-visual__line--3" />
        <span className="welcome-community-visual__node welcome-community-visual__node--center" />
        <span className="welcome-community-visual__node welcome-community-visual__node--a" />
        <span className="welcome-community-visual__node welcome-community-visual__node--b" />
        <span className="welcome-community-visual__node welcome-community-visual__node--c" />
        <span className="welcome-community-visual__node welcome-community-visual__node--d" />
      </div>
    </div>
  );
}

function ProofIconSmallGroups() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="5.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ProofIconSharedInterests() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="6.2" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.8" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ProofIconJoinPace() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="4" cy="9.5" r="1.2" fill="currentColor" opacity="0.45" />
      <circle cx="8" cy="7.5" r="1.2" fill="currentColor" opacity="0.75" />
      <circle cx="12" cy="5.5" r="1.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M4.8 9.1C5.8 8.4 7 7.8 8 7.3C9.2 6.7 10.4 6.2 11.3 5.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

const PROOF_ITEMS = [
  { key: "proofSmallGroups", Icon: ProofIconSmallGroups },
  { key: "proofSharedInterests", Icon: ProofIconSharedInterests },
  { key: "proofJoinPace", Icon: ProofIconJoinPace },
] as const;

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
    <main className="welcome-page">
      <header className="welcome-header">
        <div className="welcome-brand">
          <WelcomeBrandMark />
          <span className="welcome-brand-name">{t("nav.appTitle")}</span>
        </div>
      </header>

      <div className="welcome-content-region">
        <section className="welcome-surface" aria-labelledby="welcome-title">
          <WelcomeCommunityVisual />

          {props.notice ? <p className="welcome-notice">{props.notice}</p> : null}

          <h1 id="welcome-title" className="welcome-title">{t("welcome.headline")}</h1>

          <p className="welcome-tagline">{t("welcome.tagline")}</p>

          <p className="welcome-description">{t("welcome.description")}</p>

          <ul className="welcome-proof-list" aria-label={t("welcome.proofAria")}>
            {PROOF_ITEMS.map(({ key, Icon }) => (
              <li key={key} className="welcome-proof-item">
                <span className="welcome-proof-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="welcome-proof-label">{t(`welcome.${key}`)}</span>
              </li>
            ))}
          </ul>

          <div className="welcome-actions">
            <button
              type="button"
              className="welcome-btn welcome-btn--primary"
              disabled={props.disabled}
              onClick={props.onSignIn}
            >
              {t("welcome.signIn")}
            </button>

            <button
              type="button"
              className="welcome-btn welcome-btn--secondary"
              disabled={props.disabled}
              onClick={props.onCreateAccount}
            >
              {t("welcome.createAccount")}
            </button>

            <div className="welcome-divider" role="presentation">
              <span className="welcome-divider-line" aria-hidden="true" />
              <span>{t("welcome.or")}</span>
              <span className="welcome-divider-line" aria-hidden="true" />
            </div>

            <button
              type="button"
              className="welcome-guest-action"
              disabled={props.disabled || props.lookAroundDisabled}
              onClick={props.onLookAround}
            >
              {t("welcome.lookAroundFirst")}
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <p className="welcome-reassurance">{t("welcome.reassurance")}</p>
        </section>
      </div>
    </main>
  );
}
