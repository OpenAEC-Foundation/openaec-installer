import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { getSetting } from "../store";

// English
import enCommon from "./locales/en/common.json";
import enSettings from "./locales/en/settings.json";
// Dutch
import nlCommon from "./locales/nl/common.json";
import nlSettings from "./locales/nl/settings.json";

export const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "nl", name: "Nederlands" },
  { code: "en", name: "English" },
];

const ns = ["common", "settings"];

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, settings: enSettings },
      nl: { common: nlCommon, settings: nlSettings },
    },
    ns,
    defaultNS: "common",
    fallbackLng: "nl",
    interpolation: { escapeValue: false },
    detection: {
      order: ["navigator"],
      caches: [],
    },
  });

i18next.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
});

// Load saved language from Tauri store on startup
getSetting("language", "auto").then((lang) => {
  changeLanguage(lang);
});

export function changeLanguage(lang: string) {
  if (lang === "auto") {
    const detected = navigator.language?.split("-")[0] || "nl";
    const supported = Object.keys(i18next.options.resources || {});
    const finalLang = supported.includes(detected) ? detected : "nl";
    return i18next.changeLanguage(finalLang);
  }
  return i18next.changeLanguage(lang);
}

export default i18next;
