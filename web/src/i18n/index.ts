import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import he from "../locales/he.json";

export const APP_LANGUAGES = [
  { code: "en", nativeLabel: "English" },
  { code: "he", nativeLabel: "עברית" },
] as const;

export type AppLanguageCode = (typeof APP_LANGUAGES)[number]["code"];

const STORAGE_KEY = "app_language";

function normalizeLang(code: string): AppLanguageCode {
  const base = code.split("-")[0]?.toLowerCase();
  return base === "he" ? "he" : "en";
}

export function applyDocumentLanguage(lang: AppLanguageCode) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
}

export async function setAppLanguage(code: string) {
  const lang = normalizeLang(code);
  localStorage.setItem(STORAGE_KEY, lang);
  applyDocumentLanguage(lang);
  await i18n.changeLanguage(lang);
}

const initial = normalizeLang(localStorage.getItem(STORAGE_KEY) ?? navigator.language ?? "en");
applyDocumentLanguage(initial);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
