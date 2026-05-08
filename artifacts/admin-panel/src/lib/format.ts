import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";

export function formatCurrency(amount?: number | string | null, currency: string = "USD") {
  if (amount == null) return "-";
  
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return String(amount);
  
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

export function formatNumber(amount?: number | string | null, decimals: number = 2) {
  if (amount == null) return "-";
  
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return String(amount);
  
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericAmount);
}

// Satcom portalı GiB (binary, 2^30) cinsinden raporlar; biz GB (decimal,
// 10^9) gösteriyoruz. 1 GiB = 1.073741824 GB. Starlink/Leo Bridge zaten
// GB döndürdüğü için onların değerlerine uygulanmaz.
export const GIB_TO_GB = 1.073741824;

export function gibToGb(value?: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return null;
  return n * GIB_TO_GB;
}

export function formatGibAsGb(
  value?: number | string | null,
  decimals: number = 2
): string {
  const gb = gibToGb(value);
  if (gb == null) return "-";
  return formatNumber(gb, decimals);
}

export function formatDate(dateString?: string | null) {
  if (!dateString) return "-";
  try {
    return format(parseISO(dateString), "dd.MM.yyyy HH:mm", { locale: tr });
  } catch (e) {
    return dateString;
  }
}
