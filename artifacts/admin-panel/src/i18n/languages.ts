export const SUPPORTED_LANGUAGES = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "es", label: "Español" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
