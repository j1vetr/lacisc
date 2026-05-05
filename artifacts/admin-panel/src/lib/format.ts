import { format, parseISO } from "date-fns";

export function formatCurrency(amount?: number | string | null, currency: string = "USD") {
  if (amount == null) return "-";
  
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return String(amount);
  
  return new Intl.NumberFormat("en-US", {
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
  
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericAmount);
}

export function formatDate(dateString?: string | null) {
  if (!dateString) return "-";
  try {
    return format(parseISO(dateString), "MMM dd, yyyy HH:mm:ss");
  } catch (e) {
    return dateString;
  }
}
