import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import "./_group.css";
import {
  daily,
  totals,
  totalGb,
  kpi,
  movers,
  sourceLabel,
  fmtGb,
  fmtCompactGb,
  type Source,
} from "./_mock";

const SRC_COLOR: Record<Source, string> = {
  satcom: "var(--dv-satcom)",
  tototheo: "var(--dv-tototheo)",
  norway: "var(--dv-norway)",
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.4} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function VariantA() {
  const ink = "#26251e";
  const muted = "#807d72";
  const grid = "#e6e5e0";

  return (
    <div className="dv-theme" style={{ padding: 28 }}>
      {/* === ÜST KPI: 3 kart, sayılar dikey ortalı === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          marginBottom: 22,
        }}
      >
        <KpiCard eyebrow="TOPLAM TERMİNAL">
          <div className="dv-stat-num" style={{ fontSize: 44, fontWeight: 450 }}>
            {kpi.totalKits}
          </div>
          <div
            className="dv-mono"
            style={{ fontSize: 10, color: muted, marginTop: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            <span className="dv-source-dot satcom" style={{ marginRight: 5 }} />
            {kpi.satcomKits} SATCOM
            <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
            <span className="dv-source-dot tototheo" style={{ marginRight: 5 }} />
            {kpi.tototheoKits} TOTOTHEO
            <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
            <span className="dv-source-dot norway" style={{ marginRight: 5 }} />
            {kpi.norwayKits} NORWAY
          </div>
        </KpiCard>

        <KpiCard eyebrow="AKTİF DÖNEM">
          <div className="dv-stat-num" style={{ fontSize: 44, fontWeight: 450, letterSpacing: "-0.02em" }}>
            {kpi.activePeriod}
          </div>
        </KpiCard>

        <KpiCard eyebrow="SİSTEM DURUMU">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "var(--dv-success)",
                boxShadow: "0 0 0 5px rgba(31,138,101,0.14)",
              }}
            />
            <span style={{ fontSize: 26, fontWeight: 500, color: ink }}>AKTİF</span>
          </div>
          <div
            className="dv-mono"
            style={{ fontSize: 10, color: muted, marginTop: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            SON SYNC · {kpi.lastSyncAt}
          </div>
        </KpiCard>
      </div>

      {/* === 14 günlük stacked area === */}
      <div className="dv-card" style={{ padding: 22, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span className="dv-eyebrow">SON 14 GÜN · KAYNAK BAZLI GB</span>
          <div style={{ display: "flex", gap: 14, fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
            <span><span className="dv-source-dot satcom" style={{ marginRight: 6 }} />SATCOM</span>
            <span><span className="dv-source-dot tototheo" style={{ marginRight: 6 }} />TOTOTHEO</span>
            <span><span className="dv-source-dot norway" style={{ marginRight: 6 }} />NORWAY</span>
          </div>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={daily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gA-sat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SRC_COLOR.satcom} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={SRC_COLOR.satcom} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gA-tot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SRC_COLOR.tototheo} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={SRC_COLOR.tototheo} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gA-nor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SRC_COLOR.norway} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={SRC_COLOR.norway} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} vertical={false} strokeDasharray="2 4" />
              <XAxis
                dataKey="d"
                stroke={muted}
                tick={{ fontSize: 10, fill: muted, fontFamily: "JetBrains Mono" }}
                axisLine={{ stroke: grid }}
                tickLine={false}
              />
              <YAxis
                stroke={muted}
                tick={{ fontSize: 10, fill: muted, fontFamily: "JetBrains Mono" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: grid, strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--dv-surface)",
                  border: "1px solid var(--dv-hairline-strong)",
                  borderRadius: 8,
                  fontSize: 11,
                  color: ink,
                  padding: "8px 10px",
                  boxShadow: "none",
                }}
                labelStyle={{ color: muted, fontSize: 10, marginBottom: 4, letterSpacing: "0.08em" }}
                formatter={(v: number, n: string) => [`${fmtGb(v)} GB`, sourceLabel(n as Source)]}
              />
              <Area type="monotone" dataKey="satcom"   stackId="1" stroke={SRC_COLOR.satcom}   strokeWidth={1.4} fill="url(#gA-sat)" />
              <Area type="monotone" dataKey="tototheo" stackId="1" stroke={SRC_COLOR.tototheo} strokeWidth={1.4} fill="url(#gA-tot)" />
              <Area type="monotone" dataKey="norway"   stackId="1" stroke={SRC_COLOR.norway}   strokeWidth={1.4} fill="url(#gA-nor)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* === ALT GRID: list (2fr) + 3 kaynak kartı (1fr, listenin yüksekliğine eşit dağılım) === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {/* Yüksek kullanım listesi */}
        <div className="dv-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 22px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="dv-eyebrow">YÜKSEK KULLANIM · TERMİNAL</span>
            <span
              className="dv-mono"
              style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              SON 24 SAAT
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {movers.map((m) => {
              const positive = m.delta >= 0;
              const pct = m.planGb ? Math.min(100, (m.totalGb / m.planGb) * 100) : null;
              return (
                <div
                  key={m.kitNo}
                  className="dv-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 70px 1fr 80px",
                    alignItems: "center",
                    gap: 16,
                    padding: "13px 22px",
                    borderTop: "1px solid var(--dv-hairline)",
                    flex: 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className={`dv-source-dot ${m.source}`} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: ink }}>{m.shipName}</div>
                      <div className="dv-mono" style={{ fontSize: 11, color: muted }}>{m.kitNo}</div>
                    </div>
                  </div>
                  <div style={{ height: 28 }}>
                    <Sparkline data={m.sparkline} color={SRC_COLOR[m.source]} />
                  </div>
                  <div>
                    {pct !== null ? (
                      <>
                        <div className="dv-bar-track" style={{ marginBottom: 4 }}>
                          <div
                            className="dv-bar-fill"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 80 ? "var(--dv-orange)" : ink,
                            }}
                          />
                        </div>
                        <div
                          className="dv-mono"
                          style={{ fontSize: 10, color: muted, letterSpacing: "0.04em", textTransform: "uppercase" }}
                        >
                          {fmtGb(m.totalGb)} / {m.planGb} GB
                        </div>
                      </>
                    ) : (
                      <div className="dv-mono" style={{ fontSize: 12, color: ink }}>
                        {fmtGb(m.totalGb)} GB
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 500,
                      color: positive ? "var(--dv-success)" : "var(--dv-orange)",
                    }}
                    className="dv-mono"
                  >
                    {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {positive ? "+" : ""}{m.delta.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sağ rail: 3 kaynak kartı eşit dağılarak listeye yetişiyor */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SourceCard source="satcom"   label="SATCOM"   gb={totals.satcomGb}   accounts={kpi.satcomAccounts}   kits={kpi.satcomKits} />
          <SourceCard source="tototheo" label="TOTOTHEO" gb={totals.tototheoGb} accounts={kpi.tototheoAccounts} kits={kpi.tototheoKits} />
          <SourceCard source="norway"   label="NORWAY"   gb={totals.norwayGb}   accounts={kpi.norwayAccounts}   kits={kpi.norwayKits} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div
      className="dv-card"
      style={{
        padding: "26px 24px",
        minHeight: 140,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0,
      }}
    >
      <div className="dv-eyebrow" style={{ marginBottom: 14 }}>{eyebrow}</div>
      {children}
    </div>
  );
}

function SourceCard({
  source, label, gb, accounts, kits,
}: { source: Source; label: string; gb: number; accounts: number; kits: number }) {
  return (
    <div
      className="dv-card"
      style={{
        padding: "20px 20px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`dv-source-dot ${source}`} />
          <span
            className="dv-eyebrow"
            style={{ color: "var(--dv-ink)", fontWeight: 600, letterSpacing: "0.10em" }}
          >
            {label}
          </span>
        </div>
        <span className={`dv-pill ${source}`}>{accounts} HESAP</span>
      </div>
      <div className="dv-stat-num" style={{ fontSize: 26, fontWeight: 500, marginBottom: 6 }}>
        {fmtCompactGb(gb)}
      </div>
      <div
        className="dv-mono"
        style={{ fontSize: 10, color: "var(--dv-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        {kits} TERMİNAL
      </div>
    </div>
  );
}
