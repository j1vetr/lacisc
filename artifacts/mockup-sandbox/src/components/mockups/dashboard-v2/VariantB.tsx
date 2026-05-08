import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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
    <ResponsiveContainer width="100%" height={26}>
      <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.4} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 3 nested halka (kaynak başına dönem GB) + büyük halka kota %
function HeroRing({
  used,
  quota,
  satcom,
  tototheo,
  norway,
  dark,
}: {
  used: number;
  quota: number;
  satcom: number;
  tototheo: number;
  norway: number;
  dark: boolean;
}) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 12;
  const ringR = [
    (size - stroke) / 2 - 0,
    (size - stroke) / 2 - 22,
    (size - stroke) / 2 - 44,
    (size - stroke) / 2 - 66,
  ];
  const trackColor = dark ? "#2c2b27" : "#ece9e0";
  const orange = dark ? "#ff6b1f" : "#f54e00";
  const sat = dark ? "#f4b896" : "#a4400a";
  const tot = dark ? "#9fbbe0" : "#2563a6";
  const nor = dark ? "#a6a6dd" : "#3a3aa6";
  const ink = dark ? "#ededec" : "#26251e";
  const muted = dark ? "#9e9b8f" : "#807d72";

  const arc = (r: number, pct: number, color: string, id: string) => {
    const C = 2 * Math.PI * r;
    return (
      <g key={id}>
        <circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(C * pct) / 100} ${C}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </g>
    );
  };

  const usedPct = Math.min(100, (used / quota) * 100);
  const satPct  = Math.min(100, (satcom   / Math.max(satcom, tototheo, norway)) * 100);
  const totPct  = Math.min(100, (tototheo / Math.max(satcom, tototheo, norway)) * 100);
  const norPct  = Math.min(100, (norway   / Math.max(satcom, tototheo, norway)) * 100);

  return (
    <div className="dv-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {arc(ringR[0], usedPct, orange, "u")}
        {arc(ringR[1], satPct, sat, "s")}
        {arc(ringR[2], totPct, tot, "t")}
        {arc(ringR[3], norPct, nor, "n")}
      </svg>
      <div className="dv-ring-center">
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: muted, fontWeight: 500 }}>
          KOTA · %
        </div>
        <div className="dv-stat-num" style={{ fontSize: 44, fontWeight: 450, color: ink, marginTop: 4 }}>
          {Math.round(usedPct)}
        </div>
        <div className="dv-mono" style={{ fontSize: 10, color: muted, marginTop: 4, letterSpacing: "0.04em" }}>
          {fmtCompactGb(used)} / {fmtInt(quota)} GB
        </div>
      </div>
    </div>
  );
}

export default function VariantB() {
  const [dark, setDark] = useState(true); // VariantB premium dark default
  const ink = dark ? "#ededec" : "#26251e";
  const muted = dark ? "#9e9b8f" : "#807d72";
  const grid = dark ? "#2c2b27" : "#e6e5e0";

  return (
    <div className={`dv-theme ${dark ? "dv-dark" : ""}`} style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button
          onClick={() => setDark((v) => !v)}
          aria-label="Tema değiştir"
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: "1px solid var(--dv-hairline)",
            background: "var(--dv-surface)",
            color: "var(--dv-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* === HERO: dev halka + kaynak rozetleri yan yana === */}
      <div
        className="dv-card"
        style={{
          padding: 28,
          marginBottom: 22,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 36,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <div className="dv-eyebrow">DÖNEM · {kpi.activePeriod}</div>
          <HeroRing
            used={totalGb}
            quota={kpi.periodQuotaGb}
            satcom={totals.satcomGb}
            tototheo={totals.tototheoGb}
            norway={totals.norwayGb}
            dark={dark}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* 3 kaynak satırı, mini bar ile */}
          {([
            { source: "satcom" as Source,   label: "SATCOM",   gb: totals.satcomGb,   acc: kpi.satcomAccounts,   kits: kpi.satcomKits },
            { source: "tototheo" as Source, label: "TOTOTHEO", gb: totals.tototheoGb, acc: kpi.tototheoAccounts, kits: kpi.tototheoKits },
            { source: "norway" as Source,   label: "NORWAY",   gb: totals.norwayGb,   acc: kpi.norwayAccounts,   kits: kpi.norwayKits },
          ]).map((s) => {
            const share = (s.gb / totalGb) * 100;
            return (
              <div key={s.source}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`dv-source-dot ${s.source}`} />
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: ink }}>
                      {s.label}
                    </span>
                    <span className={`dv-pill ${s.source}`}>{s.acc} HESAP</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="dv-stat-num" style={{ fontSize: 20, fontWeight: 500 }}>
                      {fmtCompactGb(s.gb)}
                    </span>
                    <span className="dv-mono" style={{ fontSize: 11, color: muted }}>
                      {s.kits} terminal
                    </span>
                  </div>
                </div>
                <div className="dv-bar-track" style={{ height: 5 }}>
                  <div
                    className="dv-bar-fill"
                    style={{
                      width: `${share}%`,
                      background: SRC_COLOR[s.source],
                    }}
                  />
                </div>
                <div className="dv-mono" style={{ fontSize: 10, color: muted, marginTop: 4, letterSpacing: "0.04em" }}>
                  paylaşım %{share.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === Alt grid: günlük bar (sol 7/12) + top movers (sağ 5/12) === */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
        <div className="dv-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span className="dv-eyebrow">SON 14 GÜN · GÜNLÜK GB</span>
            <span className="dv-mono" style={{ fontSize: 10, color: muted, letterSpacing: "0.06em" }}>
              TOPLAM {fmtCompactGb(totalGb)}
            </span>
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barCategoryGap="22%">
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
                  cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "rgba(38,37,30,0.04)" }}
                  contentStyle={{
                    background: "var(--dv-surface)",
                    border: "1px solid var(--dv-hairline-strong)",
                    borderRadius: 8,
                    fontSize: 11,
                    color: ink,
                    padding: "8px 10px",
                    boxShadow: "none",
                  }}
                  labelStyle={{ color: muted, fontSize: 10, marginBottom: 4 }}
                  formatter={(v: number, n: string) => [`${fmtGb(v)} GB`, sourceLabel(n as Source)]}
                />
                <Bar dataKey="satcom"   stackId="a" fill={dark ? "#f4b896" : "#a4400a"} radius={[0, 0, 0, 0]} />
                <Bar dataKey="tototheo" stackId="a" fill={dark ? "#9fbbe0" : "#2563a6"} radius={[0, 0, 0, 0]} />
                <Bar dataKey="norway"   stackId="a" fill={dark ? "#a6a6dd" : "#3a3aa6"} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top movers — sparkline + delta */}
        <div className="dv-card" style={{ padding: 0 }}>
          <div style={{ padding: "18px 22px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="dv-eyebrow">YÜKSEK KULLANIM</span>
            <span className="dv-mono" style={{ fontSize: 10, color: muted, letterSpacing: "0.06em" }}>SON 24 SAAT</span>
          </div>
          {movers.slice(0, 6).map((m) => {
            const positive = m.delta >= 0;
            return (
              <div
                key={m.kitNo}
                className="dv-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 70px 70px",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 22px",
                  borderTop: "1px solid var(--dv-hairline)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span className={`dv-source-dot ${m.source}`} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.shipName}
                    </div>
                    <div className="dv-mono" style={{ fontSize: 11, color: muted }}>{m.kitNo}</div>
                  </div>
                </div>
                <div style={{ height: 26 }}>
                  <Sparkline data={m.sparkline} color={SRC_COLOR[m.source]} />
                </div>
                <div
                  className="dv-mono"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 3,
                    fontSize: 12,
                    fontWeight: 500,
                    color: positive ? "var(--dv-success)" : "var(--dv-orange)",
                  }}
                >
                  {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {positive ? "+" : ""}{m.delta.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
