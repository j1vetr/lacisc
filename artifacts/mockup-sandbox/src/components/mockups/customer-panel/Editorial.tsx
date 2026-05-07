import "./_editorial.css";
import {
  customer,
  activePeriodLabel,
  kits,
  totals,
  sparkFor,
  fmtGib,
  fmtRel,
} from "./_mock";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  LineChart,
  Line,
} from "recharts";
import brandLogo from "@/assets/brand-logo.png";

export default function Editorial() {
  const sorted = [...kits].sort((a, b) => b.currentPeriodGib - a.currentPeriodGib);
  const top = sorted[0];
  const maxGib = sorted[0]?.currentPeriodGib ?? 1;

  const today = new Date()
    .toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toLocaleUpperCase("tr-TR");
  const avgGib = totals.totalGib / Math.max(1, totals.totalKits);

  return (
    <div className="editorial-theme flex w-full">
      {/* ───────────── Sidebar ───────────── */}
      <aside className="w-[320px] shrink-0 hl-r min-h-screen sticky top-0 h-screen flex flex-col">
        {/* Brand */}
        <div className="px-8 pt-9 pb-9">
          <div className="brand-mark">
            <img src={brandLogo} alt="Lacivert Teknoloji" />
          </div>
        </div>

        {/* Customer chip */}
        <div className="px-8 pb-7 hl-b">
          <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-2">
            Hesap
          </div>
          <div className="font-serif text-[22px] leading-tight text-[var(--ink)]">
            {customer.name}
          </div>
          <div className="font-mono text-[11px] text-[var(--ink-mute)] mt-1">
            @{customer.username}
          </div>
        </div>

        {/* Filo list */}
        <div className="flex-1 overflow-y-auto no-scrollbar pt-7 pb-6">
          <div className="px-8 flex items-center justify-between mb-4">
            <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] font-medium">
              Filo · İçindekiler
            </div>
            <Search className="w-3.5 h-3.5 text-[var(--ink-faint)]" strokeWidth={1.5} />
          </div>

          <ul>
            {sorted.map((kit, i) => (
              <li key={kit.kitNo}>
                <button className="row-link w-full text-left px-8 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="font-mono text-[11px] w-5 num-tabular font-medium tracking-tight"
                      style={{ color: kit.online ? "#2f8a4f" : "#d44a2c" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="ship-name font-serif text-[18px] leading-tight text-[var(--ink)] truncate">
                        {kit.shipName}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--ink-faint)] mt-0.5">
                        {kit.kitNo}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-[12px] text-[var(--ink-soft)] num-tabular">
                      {fmtGib(kit.currentPeriodGib)}
                    </div>
                    <div className="text-[9px] tracking-widest uppercase text-[var(--ink-faint)] mt-0.5">
                      GB
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 hl-t">
          <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)]">
            {activePeriodLabel} · Toplam
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="stat-num text-[26px] text-[var(--ink)]">
              {fmtGib(totals.totalGib)}
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-mute)]">GB</span>
          </div>
          <div className="text-[11px] text-[var(--ink-mute)] mt-1">
            {totals.online} / {totals.totalKits} gemi çevrimiçi
          </div>
        </div>
      </aside>

      {/* ───────────── Main ───────────── */}
      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="hl-b px-14 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.18em] uppercase text-[var(--ink-mute)]">
            <span className="rule-orange" />
            <span>AYLIK FİLO BÜLTENİ</span>
            <span className="text-[var(--ink-faint)]">·</span>
            <span className="font-mono text-[11px] tracking-[0.12em]">{today}</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="ghost-cta">
              RAPOR İNDİR
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Header */}
        <header className="px-14 pt-14 pb-12">
          <div className="text-[11px] tracking-[0.22em] uppercase text-[var(--orange)] mb-3 font-medium">
            {activePeriodLabel.toLocaleUpperCase("tr-TR")} · AKTİF DÖNEM
          </div>
          <p className="font-serif text-[26px] leading-[1.45] text-[var(--ink)] max-w-[760px] tracking-[-0.005em]">
            Filonuzdaki <span className="font-medium">{totals.totalKits} gemi</span> bu ay
            toplam <span className="font-medium num-tabular">{fmtGib(totals.totalGib)} GB</span> veri
            tüketti.
            <br />
            Şu an{" "}
            <span className="font-bold text-[var(--ink)]">{totals.online} gemi</span>{" "}
            kesintisiz bağlantıda.
          </p>

          {/* Inline stat strip */}
          <div className="grid grid-cols-4 gap-0 mt-12 hl-t hl-b">
            {[
              { label: "TOPLAM GEMİ", value: String(totals.totalKits), unit: "" },
              { label: "ÇEVRİMİÇİ", value: `${totals.online}`, unit: `/ ${totals.totalKits}` },
              { label: "DÖNEM TÜKETİMİ", value: fmtGib(totals.totalGib), unit: "GB" },
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
                    <span className="font-mono text-[12px] text-[var(--ink-mute)]">
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
                  <h2 className="font-serif text-[44px] leading-[1] tracking-[-0.015em] text-[var(--ink)]">
                    {top.shipName}
                  </h2>
                  <div className="font-mono text-[11px] text-[var(--ink-mute)] mt-2">
                    {top.kitNo}
                  </div>
                  <p className="font-serif text-[18px] leading-[1.5] text-[var(--ink-soft)] mt-6 max-w-[420px]">
                    Bu dönem en yüksek veri tüketimi sizin filonuzda{" "}
                    <span className="text-[var(--ink)] font-medium">{top.shipName}</span>
                    'a ait. Toplam{" "}
                    <span className="num-tabular text-[var(--ink)] font-medium">
                      {fmtGib(top.currentPeriodGib)} GB
                    </span>{" "}
                    ile dönem ortalamasının{" "}
                    <span className="text-[var(--ink)] font-medium">
                      {Math.round((top.currentPeriodGib / (totals.totalGib / totals.totalKits)) * 100 - 100)}%
                    </span>{" "}
                    üzerinde seyrediyor.
                  </p>
                  <div className="mt-8 flex items-center gap-6">
                    <button className="cta">
                      GEMİ DETAYINI AÇ
                      <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--ink-mute)]">
                      SON GÜNCELLEME · {fmtRel(top.lastUpdate).toLocaleUpperCase("tr-TR")}
                    </span>
                  </div>
                </div>

                <div className="hl-l pl-12">
                  <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-2">
                    Son 14 Gün
                  </div>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={sparkFor(top).map((v, i) => ({ d: i, v }))}
                        margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="ed-top-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f54e00" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="#f54e00" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          cursor={{ stroke: "#26251e", strokeWidth: 0.5, strokeDasharray: "2 3" }}
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
                          formatter={(v: number) => [`${fmtGib(v)} GB`, "Tüketim"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke="#f54e00"
                          strokeWidth={1.4}
                          fill="url(#ed-top-grad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
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

        {/* Fleet — editorial table */}
        <section className="px-14 pb-24">
          <div className="flex items-end justify-between mb-1 hl-b-strong pb-5">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-2">
                Bölüm II
              </div>
              <h2 className="font-serif italic text-[40px] leading-none tracking-[-0.015em] text-[var(--ink)]">
                Tüm Gemiler
              </h2>
            </div>
            <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)]">
              Sıralama · Aylık Tüketim
            </div>
          </div>

          {/* Header row */}
          <div className="grid grid-cols-[40px_1.6fr_1fr_140px_120px_24px] gap-6 px-1 py-3 hl-b text-[10px] tracking-widest uppercase text-[var(--ink-mute)]">
            <div className="text-right">№</div>
            <div>Gemi</div>
            <div>Trend · Son 14 Gün</div>
            <div className="text-right">Aylık Tüketim</div>
            <div className="text-right">Son İletişim</div>
            <div />
          </div>

          <ul>
            {sorted.map((kit, i) => {
              const pct = Math.max(4, (kit.currentPeriodGib / maxGib) * 100);
              return (
                <li key={kit.kitNo} className="ship-row hl-b cursor-pointer">
                  <div className="grid grid-cols-[40px_1.6fr_1fr_140px_120px_24px] gap-6 items-center px-1 py-6">
                    <div className="text-right">
                      <span className="font-serif text-[20px] text-[var(--ink-faint)] num-tabular">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="ship-headline font-serif text-[26px] leading-tight text-[var(--ink)] tracking-[-0.01em]">
                          {kit.shipName}
                        </span>
                        {!kit.online && <span className="pill-offline">ÇEVRİMDIŞI</span>}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--ink-mute)] mt-1.5">
                        {kit.kitNo}
                      </div>
                    </div>

                    <div>
                      <div className="h-[36px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={sparkFor(kit).map((v, j) => ({ d: j, v }))}
                            margin={{ top: 4, right: 0, left: 0, bottom: 4 }}
                          >
                            <Line
                              type="monotone"
                              dataKey="v"
                              stroke="#26251e"
                              strokeWidth={1}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-1 h-[2px] w-full bg-[var(--hairline)] rounded-full overflow-hidden">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, background: "var(--ink)" }}
                        />
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1.5">
                        <span className="stat-num text-[28px] leading-none text-[var(--ink)]">
                          {fmtGib(kit.currentPeriodGib)}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-mute)]">GB</span>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--ink-mute)]">
                      {fmtRel(kit.lastUpdate).toLocaleUpperCase("tr-TR")}
                    </div>

                    <div className="ship-arrow text-[var(--ink)]">
                      <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Colophon */}
          <div className="mt-12 grid grid-cols-2 gap-12">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-3">
                Bültende
              </div>
              <p className="font-serif italic text-[16px] leading-[1.6] text-[var(--ink-soft)] max-w-[460px]">
                Bu sayfa, atanmış gemilerinizin {activePeriodLabel} dönemine ait
                tüketim ve canlı durum özetini sunar. Bir gemiye tıklayarak
                günlük dökümlere ve geçmiş dönem raporlarına ulaşabilirsiniz.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-3">
                Sonraki Senkronizasyon
              </div>
              <div className="font-serif text-[28px] text-[var(--ink)]">
                ≈ 22 dakika
              </div>
              <div className="font-mono text-[11px] text-[var(--ink-mute)] mt-1">
                30 dk · otomatik
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
