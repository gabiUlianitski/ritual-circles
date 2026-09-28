import React from "react";
import { useTranslation } from "react-i18next";
import "../welcome.css";

function BrandMark() {
  return (
    <span className="welcome-brand-mark" aria-hidden="true">
      <span className="brand-node brand-node-one" />
      <span className="brand-node brand-node-two" />
      <span className="brand-node brand-node-three" />
    </span>
  );
}

/** Top-left Ritual Circles brand — shared by landing and Look Around pages. */
export function AppBrand() {
  const { t } = useTranslation();
  return (
    <div className="welcome-brand">
      <BrandMark />
      <span className="welcome-brand-name">{t("nav.appTitle")}</span>
    </div>
  );
}

/** Decorative circle cluster above the headline. */
export function CircleCluster() {
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

/** Centered translucent card surface — same width, padding, border, and shadow on all welcome flows. */
export function CenteredCard(props: {
  children: React.ReactNode;
  ariaLabelledBy?: string;
}) {
  return (
    <section className="welcome-surface" aria-labelledby={props.ariaLabelledBy}>
      {props.children}
    </section>
  );
}

/** Full-page welcome shell: background, brand header, centered card region. */
export function WelcomePageShell(props: {
  headerEnd?: React.ReactNode;
  surfaceAriaLabelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="welcome-page">
      <header className={`welcome-header${props.headerEnd ? " welcome-header--with-menu" : ""}`}>
        <AppBrand />
        {props.headerEnd ? <div className="welcome-header-end">{props.headerEnd}</div> : null}
      </header>

      <div className="welcome-content-region">
        <CenteredCard ariaLabelledBy={props.surfaceAriaLabelledBy}>
          {props.children}
        </CenteredCard>
      </div>
    </main>
  );
}

export function WelcomeHeadline(props: { id: string; children: React.ReactNode }) {
  return (
    <h1 id={props.id} className="welcome-title">
      {props.children}
    </h1>
  );
}

export function WelcomeTagline(props: { children: React.ReactNode }) {
  return <p className="welcome-tagline">{props.children}</p>;
}

export function WelcomeDescription(props: { children: React.ReactNode }) {
  return <p className="welcome-description">{props.children}</p>;
}

export function WelcomeReassurance(props: { children: React.ReactNode; emphasis?: boolean }) {
  return (
    <p className={props.emphasis ? "welcome-reassurance welcome-reassurance--key" : "welcome-reassurance"}>
      {props.children}
    </p>
  );
}

export function WelcomeActions(props: { children: React.ReactNode }) {
  return <div className="welcome-actions">{props.children}</div>;
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode },
) {
  const { className, type = "button", ...rest } = props;
  return (
    <button
      type={type}
      className={["welcome-btn welcome-btn--primary", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function SecondaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode },
) {
  const { className, type = "button", ...rest } = props;
  return (
    <button
      type={type}
      className={["welcome-btn welcome-btn--secondary", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function WelcomeTextAction(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode },
) {
  const { className, type = "button", ...rest } = props;
  return (
    <button
      type={type}
      className={["welcome-guest-action", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function WelcomeBackLink(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode },
) {
  const { className, type = "button", ...rest } = props;
  return (
    <button
      type={type}
      className={["welcome-back-link", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function WelcomeDivider(props: { label: string }) {
  return (
    <div className="welcome-divider" role="presentation">
      <span className="welcome-divider-line" aria-hidden="true" />
      <span>{props.label}</span>
      <span className="welcome-divider-line" aria-hidden="true" />
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
      <path
        d="M4.8 9.1C5.8 8.4 7 7.8 8 7.3C9.2 6.7 10.4 6.2 11.3 5.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function TrustIconWelcoming() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function TrustIconMeetInPerson() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M8 2.5C6.2 2.5 4.8 3.9 4.8 5.7C4.8 7.8 8 11.5 8 11.5C8 11.5 11.2 7.8 11.2 5.7C11.2 3.9 9.8 2.5 8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="5.6" r="1.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function TrustIconNewCircles() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="4" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7H13" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="9.8" r="0.9" fill="currentColor" />
      <circle cx="8" cy="9.8" r="0.9" fill="currentColor" opacity="0.55" />
      <circle cx="10.5" cy="9.8" r="0.9" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

const WELCOME_FEATURE_ITEMS = [
  { key: "trustWelcoming", Icon: TrustIconWelcoming },
  { key: "trustSharedInterests", Icon: ProofIconSharedInterests },
  { key: "trustMeetInPerson", Icon: TrustIconMeetInPerson },
] as const;

const GUEST_FEATURE_ITEMS = [
  { key: "trustNewCircles", Icon: TrustIconNewCircles },
  { key: "trustSmallGroups", Icon: ProofIconSmallGroups },
  { key: "trustNoPressure", Icon: ProofIconJoinPace },
] as const;

/** Compact reassurance row below actions — shared icon containers and muted labels. */
export function FeatureRow(props: { variant: "welcome" | "guestExplore" }) {
  const { t } = useTranslation();
  const items = props.variant === "welcome" ? WELCOME_FEATURE_ITEMS : GUEST_FEATURE_ITEMS;

  return (
    <ul className="welcome-trust-list" aria-label={t(`${props.variant}.trustAria`)}>
      {items.map(({ key, Icon }) => (
        <li key={key} className="welcome-trust-item">
          <span className="welcome-proof-icon" aria-hidden="true">
            <Icon />
          </span>
          <span className="welcome-trust-label">{t(`${props.variant}.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}
