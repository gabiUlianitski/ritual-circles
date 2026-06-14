import React from "react";
import { useTranslation } from "react-i18next";
import { APP_LANGUAGES, setAppLanguage } from "../i18n";

export function AppLanguageSelect(props: { disabled?: boolean; className?: string }) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.split("-")[0] ?? "en";

  return (
    <div className="app-language-select-wrap stack">
      <select
        className={props.className ?? "profile-fb-about-input app-language-select"}
        value={current}
        disabled={props.disabled}
        aria-label={t("appLanguage.label")}
        onChange={(e) => void setAppLanguage(e.target.value)}
      >
        {APP_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeLabel}
          </option>
        ))}
      </select>
      <p className="profile-fb-about-secondary muted">{t("appLanguage.hint")}</p>
    </div>
  );
}
