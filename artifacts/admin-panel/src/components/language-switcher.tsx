import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@/i18n/languages";

import TR from "country-flag-icons/react/3x2/TR";
import GB from "country-flag-icons/react/3x2/GB";
import RU from "country-flag-icons/react/3x2/RU";
import SA from "country-flag-icons/react/3x2/SA";
import CN from "country-flag-icons/react/3x2/CN";
import ES from "country-flag-icons/react/3x2/ES";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function FlagIcon({ code, className }: { code: string; className?: string }) {
  const props = { className, "aria-hidden": true as const };
  switch (code) {
    case "tr": return <TR {...props} />;
    case "en": return <GB {...props} />;
    case "ru": return <RU {...props} />;
    case "ar": return <SA {...props} />;
    case "zh": return <CN {...props} />;
    case "es": return <ES {...props} />;
    default:   return null;
  }
}

export function LanguageSwitcher({
  compact = false,
  variant = "subtle",
}: {
  compact?: boolean;
  variant?: "subtle" | "solid";
}) {
  const { t, i18n } = useTranslation();
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  const triggerClassName =
    variant === "solid"
      ? compact
        ? "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border shadow-sm text-foreground hover:border-primary/40 hover:shadow-md transition-all"
        : "shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-card border border-border shadow-sm text-xs font-semibold text-foreground hover:border-primary/40 hover:shadow-md transition-all"
      : compact
        ? "shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        : "shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={t("Dil seçimi")}
        >
          {variant === "solid" ? (
            <FlagIcon
              code={current.code}
              className="w-6 h-4 rounded-[2px] overflow-hidden shrink-0"
            />
          ) : (
            <Languages className="w-3.5 h-3.5" />
          )}
          {!compact && <span>{current.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={
              lang.code === current.code ? "font-semibold gap-2" : "gap-2"
            }
          >
            <FlagIcon
              code={lang.code}
              className="w-6 h-4 rounded-[2px] overflow-hidden shrink-0"
            />
            <span>{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
