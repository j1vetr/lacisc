import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@/i18n/languages";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        ? "inline-flex items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-card border border-[#e6e9ef] dark:border-border shadow-sm text-foreground hover:border-primary/40 hover:shadow-md transition-all"
        : "inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white dark:bg-card border border-[#e6e9ef] dark:border-border shadow-sm text-xs font-semibold text-foreground hover:border-primary/40 hover:shadow-md transition-all"
      : compact
        ? "inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        : "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={t("Dil seçimi")}
        >
          {variant === "solid" ? (
            <span className="text-base leading-none">{current.flag}</span>
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
              lang.code === current.code
                ? "font-semibold gap-2"
                : "gap-2"
            }
          >
            <span className="text-base leading-none">{lang.flag}</span>
            <span>{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
