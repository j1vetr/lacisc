import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function useThemedAsset(light: string, dark: string): string {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return document.documentElement.classList.contains("dark") ? dark : light;
  }
  return resolvedTheme === "dark" ? dark : light;
}
