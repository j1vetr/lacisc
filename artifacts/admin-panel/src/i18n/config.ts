import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./resources/en";
import ru from "./resources/ru";
import ar from "./resources/ar";
import zh from "./resources/zh";
import es from "./resources/es";
import fr from "./resources/fr";
import de from "./resources/de";
import el from "./resources/el";

// Strategy: Turkish source strings are used directly as translation KEYS
// (t("Panel")), so Turkish needs no dictionary — i18next falls back to the
// key itself when a translation is missing, which is exactly the Turkish text.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      tr: { translation: {} },
      en: { translation: en },
      ru: { translation: ru },
      ar: { translation: ar },
      zh: { translation: zh },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      el: { translation: el },
    },
    fallbackLng: "tr",
    supportedLngs: ["tr", "en", "ru", "ar", "zh", "es", "fr", "de", "el"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "ssa-lang",
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
