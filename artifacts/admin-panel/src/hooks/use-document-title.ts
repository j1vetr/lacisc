import { useEffect } from "react";

const BASE_TITLE = "Lacivert Teknoloji Scraper SC";

export function useDocumentTitle(suffix?: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = suffix ? `${BASE_TITLE} - ${suffix}` : BASE_TITLE;
    return () => {
      document.title = previous;
    };
  }, [suffix]);
}
