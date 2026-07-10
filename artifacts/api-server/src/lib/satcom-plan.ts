// Satcom `active_plan_name` (CardDetails enrichment) içinden kota tahmini.
// Plan adları "Mobile Priority 1TB Pooling Plan_TURKEY", "StellaKonnect 50GB"
// gibi rakam + birim taşır; ilk eşleşmeyi alıyoruz. TB → ×1000.
//
// records.ts (KIT listesi/detayı) ve ship-quota.ts (gemi kota düşümü kota
// barı) aynı regex'i paylaşır — burada tek yerde tutulur.
export function parseSatcomPlanAllowanceGb(name?: string | null): number | null {
  if (!name) return null;
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2].toUpperCase() === "TB" ? n * 1000 : n;
}
