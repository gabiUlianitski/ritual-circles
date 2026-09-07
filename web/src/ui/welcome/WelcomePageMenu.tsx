import React from "react";
import { useTranslation } from "react-i18next";
import { AppLanguageSelect } from "../AppLanguageSelect";

export function WelcomePageMenu(props: {
  menuOpen: boolean;
  onToggle: () => void;
  onSignInOrRegister: () => void;
  disabled?: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();

  return (
    <div className="welcome-header-wrap" ref={props.menuRef}>
      <button
        ref={props.buttonRef}
        type="button"
        className="welcome-menu-trigger"
        aria-expanded={props.menuOpen}
        aria-controls="welcome-nav-menu"
        aria-haspopup="true"
        aria-label={t("nav.menu")}
        onClick={props.onToggle}
        disabled={props.disabled}
      >
        {t("nav.menu")}
      </button>
      {props.menuOpen ? (
        <div id="welcome-nav-menu" className="welcome-nav-dropdown" role="menu" aria-label={t("nav.moreOptions")}>
          <AppLanguageSelect variant="menu" disabled={props.disabled} />
          <button
            type="button"
            className="welcome-nav-item"
            role="menuitem"
            onClick={props.onSignInOrRegister}
            disabled={props.disabled}
          >
            {t("guest.signInOrRegister")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
