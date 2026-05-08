import { useLocation } from "wouter";
import { ArrowUpRight } from "lucide-react";

import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  useCustomerFleetContext,
  detailHref,
  type FleetRow,
} from "@/hooks/use-customer-fleet";

const fmtGb = (n: number) =>
  n.toLocaleString("tr-TR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

function ShipCard({
  row,
  maxGb,
  onOpen,
}: {
  row: FleetRow;
  maxGb: number;
  onOpen: () => void;
}) {
  // Real veride per-KIT kotası yok; barı filo zirvesine göre relative çiz.
  const pct = Math.min(
    100,
    Math.max(2, Math.round((row.currentPeriodGb / Math.max(0.001, maxGb)) * 100)),
  );
  const warn = pct >= 80;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="sd-card w-full text-left p-5 sm:p-6 flex flex-col gap-5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sd-orange)]"
      style={{ minHeight: 184 }}
      aria-label={`${row.shipName} detayını aç`}
    >
      <div className="flex items-start gap-3">
        <span
          className="sd-dot mt-[6px] shrink-0"
          style={{
            backgroundColor: row.online
              ? "var(--sd-success)"
              : "var(--sd-hairline-strong)",
          }}
        />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <h3
            className="text-[16px] sm:text-[17px] font-semibold leading-tight truncate"
            style={{ letterSpacing: "-0.01em" }}
          >
            {row.shipName}
          </h3>
          <span
            className="sd-mono text-[11px]"
            style={{ color: "var(--sd-muted)" }}
          >
            {row.kitNo}
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="sd-tnum text-[30px] sm:text-[34px] font-semibold leading-none"
          style={{ letterSpacing: "-0.025em" }}
        >
          {fmtGb(row.currentPeriodGb)}
        </span>
        <span className="text-[13px]" style={{ color: "var(--sd-muted)" }}>
          GB
        </span>
        <span
          className="text-[12px] ml-auto sd-tnum"
          style={{ color: "var(--sd-muted)" }}
        >
          %{pct}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="sd-bar-track">
          <div
            className={`sd-bar-fill ${warn ? "warn" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--sd-muted)" }}>
            Filo zirvesine göre
          </span>
          <span
            className="flex items-center gap-1 text-[12px] sd-detail-label"
            style={{ color: "var(--sd-muted)" }}
          >
            Detay
            <ArrowUpRight className="sd-arrow" size={14} strokeWidth={2} />
          </span>
        </div>
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div
      className="sd-card p-5 sm:p-6"
      style={{ minHeight: 184 }}
      aria-hidden
    >
      <div className="space-y-3 animate-pulse">
        <div
          className="h-4 w-2/3 rounded"
          style={{ background: "var(--sd-hairline)" }}
        />
        <div
          className="h-3 w-1/3 rounded"
          style={{ background: "var(--sd-hairline)" }}
        />
        <div
          className="h-8 w-1/2 rounded mt-4"
          style={{ background: "var(--sd-hairline)" }}
        />
        <div
          className="h-1 w-full rounded mt-2"
          style={{ background: "var(--sd-hairline)" }}
        />
      </div>
    </div>
  );
}

export default function CustomerPanel() {
  useDocumentTitle("Filom");
  const [, setLocation] = useLocation();
  const { fleet, filteredFleet, query, isLoading } = useCustomerFleetContext();

  const totalGb = fleet.reduce((s, r) => s + r.currentPeriodGb, 0);
  const onlineCount = fleet.filter((r) => r.online).length;
  const totalCount = fleet.length;
  const maxGb = fleet.reduce((m, r) => Math.max(m, r.currentPeriodGb), 0);

  return (
    <>
      {/* Page header */}
      <section className="sd-main-pad sd-page-head px-10 pt-10 pb-8 flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="sd-eyebrow">Gemiler</span>
          <h1
            className="text-[26px] sm:text-[30px] font-semibold leading-none"
            style={{ letterSpacing: "-0.025em" }}
          >
            Genel Bakış
          </h1>
        </div>
        <div className="sd-page-stats flex items-end gap-10">
          <div className="flex flex-col items-end gap-1">
            <span className="sd-eyebrow">Bu ay toplam</span>
            <div className="flex items-baseline gap-1.5">
              <span
                className="sd-tnum text-[24px] sm:text-[28px] font-semibold leading-none"
                style={{ letterSpacing: "-0.02em" }}
              >
                {isLoading ? "—" : fmtGb(totalGb)}
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--sd-muted)" }}
              >
                GB
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="sd-eyebrow">Aktif</span>
            <span
              className="sd-tnum text-[24px] sm:text-[28px] font-semibold leading-none"
              style={{ letterSpacing: "-0.02em" }}
            >
              {isLoading ? "—" : onlineCount}
              {!isLoading && (
                <span
                  className="text-[14px]"
                  style={{ color: "var(--sd-muted)", fontWeight: 400 }}
                >
                  {" "}
                  / {totalCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* Cards grid */}
      <section className="sd-main-pad px-10 pb-12">
        {isLoading ? (
          <div
            className="grid gap-4 sm:gap-5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredFleet.length === 0 ? (
          <div
            className="text-center py-16 text-[14px]"
            style={{ color: "var(--sd-muted)" }}
          >
            {fleet.length === 0
              ? "Henüz size atanmış bir gemi yok. Yöneticinizle iletişime geçin."
              : query
                ? `"${query}" araması için sonuç bulunamadı.`
                : "Sonuç yok."}
          </div>
        ) : (
          <div
            className="grid gap-4 sm:gap-5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {filteredFleet.map((row) => (
              <ShipCard
                key={`${row.source}:${row.kitNo}`}
                row={row}
                maxGb={maxGb}
                onOpen={() => setLocation(detailHref(row))}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
