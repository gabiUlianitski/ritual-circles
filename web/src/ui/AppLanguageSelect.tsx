import React from "react";
import { useTranslation } from "react-i18next";
import { APP_LANGUAGES, setAppLanguage } from "../i18n";

export function AppLanguageSelect(props: {
  disabled?: boolean;
  className?: string;
  variant?: "default" | "menu";
}) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.split("-")[0] ?? "en";
  const variant = props.variant ?? "default";

  const select = (
    <select
      className={
        props.className ??
        (variant === "menu" ? "app-language-select app-language-select--menu" : "profile-fb-about-input app-language-select")
      }
      value={current}
      disabled={props.disabled}
      aria-label={t("appLanguage.label")}
      onChange={(e) => void setAppLanguage(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    >
      {APP_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeLabel}
        </option>
      ))}
    </select>
  );

  if (variant === "menu") {
    return (
      <div className="app-nav-lang" role="none" onClick={(e) => e.stopPropagation()}>
        <span className="app-nav-lang-label muted">{t("appLanguage.label")}</span>
        {select}
      </div>
    );
  }

  return (
    <div className="app-language-select-wrap stack">
      {select}
      <p className="profile-fb-about-secondary muted">{t("appLanguage.hint")}</p>
    </div>
  );
}
