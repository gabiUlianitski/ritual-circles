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

function FeatureIconWelcoming() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 21.2l-1.3-1.2C6 15.8 3 13.1 3 9.6 3 6.9 5.1 4.8 7.8 4.8c1.5 0 3 .7 4.2 1.9 1.2-1.2 2.7-1.9 4.2-1.9 2.7 0 4.8 2.1 4.8 4.8 0 3.5-3 6.2-7.7 10.4L12 21.2z" />
    </svg>
  );
}

function FeatureIconSharedInterests() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8.5" cy="12" r="6.5" />
      <circle cx="15.5" cy="12" r="6.5" opacity="0.55" />
    </svg>
  );
}

function FeatureIconMeetInPerson() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2.5c-3.9 0-7 3-7 6.9 0 4.8 5.6 11 6.3 11.7a1 1 0 0 0 1.4 0c.7-.7 6.3-6.9 6.3-11.7 0-3.9-3.1-6.9-7-6.9zm0 9.6a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z"
      />
    </svg>
  );
}

function FeatureIconNewCircles() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8 2.5a1 1 0 0 1 1 1V5h6V3.5a1 1 0 1 1 2 0V5h1.5A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5H7V3.5a1 1 0 0 1 1-1zM5 10v8.5c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5V10H5z"
      />
      <circle cx="12" cy="14.5" r="2.2" />
    </svg>
  );
}

function FeatureIconSmallGroups() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.2" />
      <path d="M6 19.5c0-3.3 2.7-6 6-6s6 2.7 6 6v.5H6v-.5z" />
      <circle cx="5" cy="9.5" r="2.3" opacity="0.6" />
      <path d="M1.5 18.5c0-2.4 1.6-4.4 3.8-4.9A7.5 7.5 0 0 0 4.5 17v1.5h-3z" opacity="0.6" />
      <circle cx="19" cy="9.5" r="2.3" opacity="0.6" />
      <path d="M22.5 18.5c0-2.4-1.6-4.4-3.8-4.9.5 1 .8 2.2.8 3.4v1.5h3z" opacity="0.6" />
    </svg>
  );
}

function FeatureIconNoPressure() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20.5 3.5C11 3.5 4.5 8.6 4.5 15.6c0 1.3.3 2.6.8 3.7L3.3 21.3a1 1 0 0 0 1.4 1.4l2-2c1.1.5 2.3.8 3.7.8 7 0 11.1-6.6 11.1-17a1 1 0 0 0-1-1zM8.7 17.3a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 1.4l-5 5z" />
    </svg>
  );
}

const WELCOME_FEATURE_ITEMS = [
  { key: "trustWelcoming", Icon: FeatureIconWelcoming },
  { key: "trustSharedInterests", Icon: FeatureIconSharedInterests },
  { key: "trustMeetInPerson", Icon: FeatureIconMeetInPerson },
] as const;

const GUEST_FEATURE_ITEMS = [
  { key: "trustNewCircles", Icon: FeatureIconNewCircles },
  { key: "trustSmallGroups", Icon: FeatureIconSmallGroups },
  { key: "trustNoPressure", Icon: FeatureIconNoPressure },
] as const;

/** Three equal reassurance cards below the actions: icon, title, short description. */
export function FeatureRow(props: { variant: "welcome" | "guestExplore" }) {
  const { t } = useTranslation();
  const items = props.variant === "welcome" ? WELCOME_FEATURE_ITEMS : GUEST_FEATURE_ITEMS;

  return (
    <ul className="welcome-trust-list" aria-label={t(`${props.variant}.trustAria`)}>
      {items.map(({ key, Icon }) => (
        <li key={key} className="welcome-trust-item">
          <span className="welcome-trust-icon" aria-hidden="true">
            <Icon />
          </span>
          <span className="welcome-trust-label">{t(`${props.variant}.${key}`)}</span>
          <span className="welcome-trust-desc">{t(`${props.variant}.${key}Desc`)}</span>
        </li>
      ))}
    </ul>
  );
}
