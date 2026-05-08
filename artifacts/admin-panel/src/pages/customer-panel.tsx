import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";
import {
  useGetKits,
  getGetKitsQueryKey,
  useGetStarlinkTerminals,
  getGetStarlinkTerminalsQueryKey,
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetKitDaily,
  getGetKitDailyQueryKey,
  useGetStarlinkTerminalDaily,
  getGetStarlinkTerminalDailyQueryKey,
} from "@workspace/api-client-react";

import { useDocumentTitle } from "@/hooks/use-document-title";
import "@/styles/editorial.css";

type Row = {
  source: "satcom" | "starlink";
  kitNo: string;
  shipName: string;
  currentPeriodGib: number;
  online: boolean;
  lastSeenAt: string | null;
};

const TR = (s: string) => s.toLocaleUpperCase("tr-TR");

function fmtGib(n: number | null | undefined): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtRel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "—";
  const diff = Math.max(0, Date.now() - d);
  const min = Math.round(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  const day = Math.round(h / 24);
  return `${day} gün önce`;
}

function isOnlineSatcom(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

function periodLabelTR(period: string | undefined | null): string {
  // YYYYMM → "Mayıs 2026"
  if (!period || period.length !== 6) return "";
  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];
  const y = period.slice(0, 4);
  const m = parseInt(period.slice(4, 6), 10);
  if (m < 1 || m > 12) return period;
  return `${months[m - 1]} ${y}`;
}

export default function CustomerPanel() {
  useDocumentTitle("Filo Bülteni");
  const [, setLocation] = useLocation();

  const refetchMs = 30_000;

  const { data: summary } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: refetchMs,
    },
  });

  const { data: satcomKits } = useGetKits(
    { sortBy: "totalGib" },
    {
      query: {
        queryKey: getGetKitsQueryKey({ sortBy: "totalGib" }),
        refetchInterval: refetchMs,
      },
    }
  );

  const { data: starlinkTerminals } = useGetStarlinkTerminals({
    query: {
      queryKey: getGetStarlinkTerminalsQueryKey(),
      refetchInterval: refetchMs,
    },
  });

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const k of satcomKits ?? []) {
      const last = k.lastSyncedAt ?? null;
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: (k.shipName?.trim() || "Adsız Gemi"),
        // Satcom GiB → GB; Starlink zaten GB.
        currentPeriodGib: (k.totalGib ?? 0) * 1.073741824,
        online: isOnlineSatcom(last),
        lastSeenAt: last,
      });
    }
    for (const t of starlinkTerminals ?? []) {
      out.push({
        source: "starlink",
        kitNo: t.kitSerialNumber,
        shipName: (t.nickname?.trim() || t.assetName?.trim() || "Adsız Gemi"),
        currentPeriodGib: t.currentPeriodTotalGb ?? 0,
        online: t.isOnline ?? false,
        lastSeenAt: t.lastSeenAt ?? null,
      });
    }
    out.sort((a, b) => b.currentPeriodGib - a.currentPeriodGib);
    return out;
  }, [satcomKits, starlinkTerminals]);

  const top = rows[0];
  const totalKits = rows.length;
  const totalGib = rows.reduce((s, r) => s + r.currentPeriodGib, 0);
  const onlineCount = rows.filter((r) => r.online).length;
  const avgGib = totalGib / Math.max(1, totalKits);
  const maxGib = top?.currentPeriodGib ?? 1;

  const activePeriodLabel =
    periodLabelTR(summary?.activePeriod) || "Aktif Dönem";

  const today = TR(
    new Date().toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

  // Featured kit's 14-day spark — fetch only for top.
  const topIsStar = top?.source === "starlink";
  const satcomKitNo = top && !topIsStar ? top.kitNo : "_skip";
  const satcomDailyParams = summary?.activePeriod
    ? { period: summary.activePeriod }
    : undefined;
  const { data: topSatcomDaily } = useGetKitDaily(
    satcomKitNo,
    satcomDailyParams,
    {
      query: {
        queryKey: getGetKitDailyQueryKey(satcomKitNo, satcomDailyParams),
        enabled: !!top && !topIsStar,
        staleTime: 60_000,
      },
    }
  );
  const starKitNo = top && topIsStar ? top.kitNo : "_skip";
  const { data: topStarDaily } = useGetStarlinkTerminalDaily(
    starKitNo,
    undefined,
    {
      query: {
        queryKey: getGetStarlinkTerminalDailyQueryKey(starKitNo),
        enabled: !!top && topIsStar,
        staleTime: 60_000,
      },
    }
  );

  const sparkData = useMemo(() => {
    if (!top) return [] as { d: number; v: number }[];
    if (topIsStar) {
      const pts = (topStarDaily ?? []).slice(-14);
      return pts.map((p, i) => ({ d: i, v: p.deltaPackageGb ?? 0 }));
    }
    const pts = (topSatcomDaily ?? []).slice(-14);
    // Satcom volumeGib → GB.
    return pts.map((p, i) => ({ d: i, v: (p.volumeGib ?? 0) * 1.073741824 }));
  }, [top, topIsStar, topSatcomDaily, topStarDaily]);

  const overPct = top
    ? Math.max(
        0,
        Math.round((top.currentPeriodGib / Math.max(0.001, avgGib)) * 100 - 100)
      )
    : 0;

  return (
    <>
      {/* Sidebar + topbar are provided by CustomerLayout */}

      {/* Header */}
        <header className="px-14 pt-14 pb-12">
          <div className="text-[11px] tracking-[0.22em] uppercase text-[var(--orange)] mb-3 font-medium">
            {TR(activePeriodLabel)} · AKTİF DÖNEM
          </div>
          <p className="ed-serif text-[26px] leading-[1.45] text-[var(--ink)] max-w-[760px] tracking-[-0.005em]">
            Filonuzdaki <span className="font-medium">{totalKits} gemi</span> bu
            ay toplam{" "}
            <span className="font-medium num-tabular">
              {fmtGib(totalGib)} GB
            </span>{" "}
            veri tüketti.
            <br />
            Şu an{" "}
            <span className="font-bold text-[var(--ink)]">
              {onlineCount} gemi
            </span>{" "}
            kesintisiz bağlantıda.
          </p>

          {/* Stat strip */}
          <div className="grid grid-cols-4 gap-0 mt-12 hl-t hl-b">
            {[
              { label: "TOPLAM GEMİ", value: String(totalKits), unit: "" },
              {
                label: "ÇEVRİMİÇİ",
                value: `${onlineCount}`,
                unit: `/ ${totalKits}`,
              },
              { label: "DÖNEM TÜKETİMİ", value: fmtGib(totalGib), unit: "GB" },
              { label: "GEMİ BAŞINA ORT.", value: fmtGib(avgGib), unit: "GB" },
            ].map((s, i) => (
              <div
                key={i}
                className={`py-7 ${i > 0 ? "hl-l pl-8" : ""} ${i < 3 ? "pr-8" : ""}`}
              >
                <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-3">
                  {s.label}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="stat-num text-[40px] text-[var(--ink)]">
                    {s.value}
                  </span>
                  {s.unit && (
                    <span className="ed-mono text-[12px] text-[var(--ink-mute)]">
                      {s.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </header>

        {/* Featured */}
        {top && (
          <section className="px-14 pb-14">
            <div className="featured-card p-10">
              <div className="grid grid-cols-[1.1fr_1fr] gap-12 items-center">
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-[10px] tracking-widest uppercase text-[var(--orange)] font-medium">
                      Ayın Öne Çıkanı
                    </span>
                  </div>
                  <h2 className="ed-serif text-[44px] leading-[1] tracking-[-0.015em] text-[var(--ink)]">
                    {top.shipName}
                  </h2>
                  <div className="ed-mono text-[11px] text-[var(--ink-mute)] mt-2">
                    {top.kitNo}
                  </div>
                  <p className="ed-serif text-[18px] leading-[1.5] text-[var(--ink-soft)] mt-6 max-w-[420px]">
                    Bu dönem en yüksek veri tüketimi sizin filonuzda{" "}
                    <span className="text-[var(--ink)] font-medium">
                      {top.shipName}
                    </span>
                    'a ait. Toplam{" "}
                    <span className="num-tabular text-[var(--ink)] font-medium">
                      {fmtGib(top.currentPeriodGib)} GB
                    </span>
                    {overPct > 0 ? (
                      <>
                        {" "}
                        ile dönem ortalamasının{" "}
                        <span className="text-[var(--ink)] font-medium">
                          {overPct}%
                        </span>{" "}
                        üzerinde seyrediyor.
                      </>
                    ) : (
                      <> ile dönem ortalamasında seyrediyor.</>
                    )}
                  </p>
                  <div className="mt-8 flex items-center gap-6">
                    <Link href={`/kits/${encodeURIComponent(top.kitNo)}`}>
                      <button className="cta">
                        GEMİ DETAYINI AÇ
                        <ArrowUpRight
                          className="w-3.5 h-3.5"
                          strokeWidth={1.5}
                        />
                      </button>
                    </Link>
                    <span className="ed-mono text-[10px] tracking-[0.14em] uppercase text-[var(--ink-mute)]">
                      SON GÜNCELLEME · {TR(fmtRel(top.lastSeenAt))}
                    </span>
                  </div>
                </div>

                <div className="hl-l pl-12">
                  <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-2">
                    Son 14 Gün
                  </div>
                  <div className="h-[180px]">
                    {sparkData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={sparkData}
                          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="cust-top-grad"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#f54e00"
                                stopOpacity={0.18}
                              />
                              <stop
                                offset="100%"
                                stopColor="#f54e00"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <Tooltip
                            cursor={{
                              stroke: "#26251e",
                              strokeWidth: 0.5,
                              strokeDasharray: "2 3",
                            }}
                            contentStyle={{
                              background: "#fcfbf8",
                              border: "1px solid #d8d6cf",
                              borderRadius: 2,
                              padding: "6px 10px",
                              boxShadow: "none",
                            }}
                            labelStyle={{ display: "none" }}
                            itemStyle={{
                              color: "#26251e",
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: 11,
                            }}
                            formatter={(v: number) => [
                              `${fmtGib(v)} GB`,
                              "Tüketim",
                            ]}
                          />
                          <Area
                            type="monotone"
                            dataKey="v"
                            stroke="#f54e00"
                            strokeWidth={1.4}
                            fill="url(#cust-top-grad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-end">
                        <div
                          className="w-full"
                          style={{
                            height: "1px",
                            background: "var(--hairline-strong)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between mt-3 text-[10px] tracking-widest uppercase text-[var(--ink-faint)]">
                    <span>14 GÜN ÖNCE</span>
                    <span>BUGÜN</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Fleet table */}
        <section className="px-14 pb-24">
          <div className="flex items-end justify-between mb-1 hl-b-strong pb-5">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-2">
                Bölüm II
              </div>
              <h2 className="ed-serif italic text-[40px] leading-none tracking-[-0.015em] text-[var(--ink)]">
                Tüm Gemiler
              </h2>
            </div>
            <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)]">
              Sıralama · Aylık Tüketim
            </div>
          </div>

          <div className="grid grid-cols-[40px_2fr_1fr_140px_120px_24px] gap-6 px-1 py-3 hl-b text-[10px] tracking-widest uppercase text-[var(--ink-mute)]">
            <div className="text-right">№</div>
            <div>Gemi</div>
            <div>Pay</div>
            <div className="text-right">Aylık Tüketim</div>
            <div className="text-right">Son İletişim</div>
            <div />
          </div>

          {rows.length === 0 ? (
            <div className="py-16 text-center ed-serif italic text-[18px] text-[var(--ink-mute)]">
              Henüz size atanmış bir gemi yok. Yöneticinizle iletişime geçin.
            </div>
          ) : (
            <ul>
              {rows.map((kit, i) => {
                const pct = Math.max(4, (kit.currentPeriodGib / maxGib) * 100);
                const goDetail = () =>
                  setLocation(`/kits/${encodeURIComponent(kit.kitNo)}`);
                return (
                  <li key={`${kit.source}:${kit.kitNo}`} className="ship-row hl-b">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={goDetail}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goDetail();
                        }
                      }}
                      aria-label={`${kit.shipName} gemi detayını aç`}
                      className="grid grid-cols-[40px_2fr_1fr_140px_120px_24px] gap-6 items-center px-1 py-6 cursor-pointer focus:outline-none focus-visible:bg-[var(--bg-paper)]"
                    >
                      <div className="text-right">
                        <span className="ed-serif text-[20px] text-[var(--ink-faint)] num-tabular">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="ship-headline ed-serif text-[26px] leading-tight text-[var(--ink)] tracking-[-0.01em]">
                            {kit.shipName}
                          </span>
                          {!kit.online && (
                            <span className="pill-offline">ÇEVRİMDIŞI</span>
                          )}
                        </div>
                        <div className="ed-mono text-[11px] text-[var(--ink-mute)] mt-1.5">
                          {kit.kitNo}
                        </div>
                      </div>

                      <div>
                        <div
                          className="h-[2px] w-full rounded-full overflow-hidden"
                          style={{ background: "var(--hairline)" }}
                        >
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              background: "var(--ink)",
                            }}
                          />
                        </div>
                        <div className="ed-mono text-[10px] text-[var(--ink-faint)] mt-2 tracking-widest uppercase">
                          {Math.round((kit.currentPeriodGib / Math.max(0.001, totalGib)) * 100)}% PAYI
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span className="stat-num text-[28px] leading-none text-[var(--ink)]">
                            {fmtGib(kit.currentPeriodGib)}
                          </span>
                          <span className="ed-mono text-[10px] text-[var(--ink-mute)]">
                            GB
                          </span>
                        </div>
                      </div>

                      <div className="text-right ed-mono text-[10px] tracking-[0.12em] uppercase text-[var(--ink-mute)]">
                        {TR(fmtRel(kit.lastSeenAt))}
                      </div>

                      <div className="ship-arrow text-[var(--ink)]">
                        <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Colophon */}
          <div className="mt-12 grid grid-cols-2 gap-12">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-3">
                Bültende
              </div>
              <p className="ed-serif italic text-[16px] leading-[1.6] text-[var(--ink-soft)] max-w-[460px]">
                Bu sayfa, atanmış gemilerinizin {activePeriodLabel} dönemine ait
                tüketim ve canlı durum özetini sunar. Bir gemiye tıklayarak
                günlük dökümlere ve geçmiş dönem raporlarına ulaşabilirsiniz.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-3">
                Veri Tazeleme
              </div>
              <div className="ed-serif text-[28px] text-[var(--ink)]">
                ≈ 30 saniye
              </div>
              <div className="ed-mono text-[11px] text-[var(--ink-mute)] mt-1">
                otomatik
              </div>
            </div>
          </div>
        </section>
    </>
  );
}
