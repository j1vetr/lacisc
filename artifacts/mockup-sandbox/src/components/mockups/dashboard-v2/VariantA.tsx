import { useState } from "react";
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
import { Sun, Moon, ArrowUpRight, ArrowDownRight } from "lucide-react";
import "./_group.css";
import {
  daily,
  totals,
  totalGb,
  kpi,
  movers,
  sourceLabel,
  fmtGb,
  fmtInt,
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
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.4}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function VariantA() {
  const [dark, setDark] = useState(false);
  const ink = dark ? "#ededec" : "#26251e";
  const muted = dark ? "#9e9b8f" : "#807d72";
  const grid = dark ? "#2c2b27" : "#e6e5e0";

  return (
    <div className={`dv-theme ${dark ? "dv-dark" : ""}`} style={{ padding: 28 }}>
      {/* Theme toggle (sağ üst, başka kontrol yok) */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button
          onClick={() => setDark((v) => !v)}
          aria-label="Tema değiştir"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--dv-hairline)",
            background: "var(--dv-surface)",
            color: "var(--dv-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* === Eyebrow + Hero satırı: 3 KPI === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1fr",
          gap: 18,
          marginBottom: 26,
        }}
      >
        {/* Toplam Kullanım — büyük + sparkline */}
        <div className="dv-card" style={{ padding: 22 }}>
          <div className="dv-eyebrow" style={{ marginBottom: 14 }}>
            DÖNEM TOPLAMI · {kpi.activePeriod}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span className="dv-stat-num" style={{ fontSize: 48, fontWeight: 450 }}>
              {fmtGb(totalGb)}
            </span>
            <span style={{ fontSize: 14, color: "var(--dv-muted)", fontWeight: 500 }}>GB</span>
          </div>
          <div className="dv-mono" style={{ fontSize: 11, color: "var(--dv-muted)", marginBottom: 14 }}>
            kota {fmtInt(kpi.periodQuotaGb)} GB · %{Math.round((totalGb / kpi.periodQuotaGb) * 100)} kullanıldı
          </div>
          <div className="dv-bar-track">
            <div
              className="dv-bar-fill"
              style={{ width: `${(totalGb / kpi.periodQuotaGb) * 100}%`, background: "var(--dv-orange)" }}
            />
          </div>
        </div>

        {/* Toplam KIT */}
        <div className="dv-card" style={{ padding: 22 }}>
          <div className="dv-eyebrow" style={{ marginBottom: 14 }}>TERMİNAL</div>
          <div className="dv-stat-num" style={{ fontSize: 40, fontWeight: 450 }}>
            {kpi.totalKits}
          </div>
          <div
            className="dv-mono"
            style={{ fontSize: 10, color: "var(--dv-muted)", marginTop: 10, letterSpacing: "0.06em" }}
          >
            <span className="dv-source-dot satcom" style={{ marginRight: 4 }} />
            {kpi.satcomKits}
            <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
            <span className="dv-source-dot tototheo" style={{ marginRight: 4 }} />
            {kpi.tototheoKits}
            <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
            <span className="dv-source-dot norway" style={{ marginRight: 4 }} />
            {kpi.norwayKits}
          </div>
        </div>

        {/* Sistem Sağlığı */}
        <div className="dv-card" style={{ padding: 22 }}>
          <div className="dv-eyebrow" style={{ marginBottom: 14 }}>SİSTEM</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "var(--dv-success)",
                boxShadow: `0 0 0 4px ${dark ? "rgba(52,192,142,0.18)" : "rgba(31,138,101,0.14)"}`,
              }}
            />
            <span style={{ fontSize: 22, fontWeight: 500 }}>Aktif</span>
          </div>
          <div className="dv-mono" style={{ fontSize: 11, color: "var(--dv-muted)", marginTop: 12 }}>
            son sync · {kpi.lastSyncAt}
          </div>
        </div>
      </div>

      {/* === 14 günlük stacked area === */}
      <div className="dv-card" style={{ padding: 22, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="dv-eyebrow">SON 14 GÜN · KAYNAK BAZLI GB</div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--dv-muted)" }}>
            <span><span className="dv-source-dot satcom" style={{ marginRight: 6 }} />Satcom</span>
            <span><span className="dv-source-dot tototheo" style={{ marginRight: 6 }} />Tototheo</span>
            <span><span className="dv-source-dot norway" style={{ marginRight: 6 }} />Norway</span>
          </div>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={daily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gSat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SRC_COLOR.satcom} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={SRC_COLOR.satcom} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gTot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SRC_COLOR.tototheo} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={SRC_COLOR.tototheo} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gNor" x1="0" y1="0" x2="0" y2="1">
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
              <Area type="monotone" dataKey="satcom"   stackId="1" stroke={SRC_COLOR.satcom}   strokeWidth={1.4} fill="url(#gSat)" />
              <Area type="monotone" dataKey="tototheo" stackId="1" stroke={SRC_COLOR.tototheo} strokeWidth={1.4} fill="url(#gTot)" />
              <Area type="monotone" dataKey="norway"   stackId="1" stroke={SRC_COLOR.norway}   strokeWidth={1.4} fill="url(#gNor)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* === Alt grid: 8/4 — Top movers + 3 kaynak kartı === */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        {/* Top terminaller */}
        <div className="dv-card" style={{ padding: 0 }}>
          <div style={{ padding: "18px 22px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="dv-eyebrow">YÜKSEK KULLANIM · TERMİNAL</span>
            <span className="dv-mono" style={{ fontSize: 10, color: "var(--dv-muted)" }}>SON 24 SAAT</span>
          </div>
          <div>
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
                    padding: "12px 22px",
                    borderTop: "1px solid var(--dv-hairline)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className={`dv-source-dot ${m.source}`} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--dv-ink)" }}>{m.shipName}</div>
                      <div className="dv-mono" style={{ fontSize: 11, color: "var(--dv-muted)" }}>{m.kitNo}</div>
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
                              background: pct >= 80 ? "var(--dv-orange)" : "var(--dv-ink)",
                            }}
                          />
                        </div>
                        <div className="dv-mono" style={{ fontSize: 10, color: "var(--dv-muted)" }}>
                          {fmtGb(m.totalGb)} / {m.planGb} GB
                        </div>
                      </>
                    ) : (
                      <div className="dv-mono" style={{ fontSize: 12, color: "var(--dv-ink)", textAlign: "left" }}>
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

        {/* Sağ rail: 3 kaynak kartı (her biri toplam GB + hesap + son sync) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SourceCard source="satcom"   label="Satcom"   gb={totals.satcomGb}   accounts={kpi.satcomAccounts}   kits={kpi.satcomKits} />
          <SourceCard source="tototheo" label="Tototheo" gb={totals.tototheoGb} accounts={kpi.tototheoAccounts} kits={kpi.tototheoKits} />
          <SourceCard source="norway"   label="Norway"   gb={totals.norwayGb}   accounts={kpi.norwayAccounts}   kits={kpi.norwayKits} />
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  source, label, gb, accounts, kits,
}: { source: Source; label: string; gb: number; accounts: number; kits: number }) {
  return (
    <div className="dv-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`dv-source-dot ${source}`} />
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", color: "var(--dv-ink)" }}>
            {label.toUpperCase()}
          </span>
        </div>
        <span className={`dv-pill ${source}`}>{accounts} HESAP</span>
      </div>
      <div className="dv-stat-num" style={{ fontSize: 24, fontWeight: 500, marginBottom: 2 }}>
        {fmtCompactGb(gb)}
      </div>
      <div className="dv-mono" style={{ fontSize: 10, color: "var(--dv-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {kits} terminal
      </div>
    </div>
  );
}
