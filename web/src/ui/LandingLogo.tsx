import React from "react";
import { useTranslation } from "react-i18next";

export function LandingLogo() {
  const { t } = useTranslation();
  return (
    <div className="landing-logo">
      <span className="landing-logo-icon" aria-hidden>
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="13" stroke="#93C5FD" strokeWidth="2" />
          <circle cx="11" cy="14" r="2.5" fill="#CBD5E1" />
          <circle cx="21" cy="14" r="2.5" fill="#CBD5E1" />
          <circle cx="16" cy="20" r="2.5" fill="#CBD5E1" />
        </svg>
      </span>
      <span className="landing-logo-text">{t("nav.appTitle")}</span>
    </div>
  );
}
