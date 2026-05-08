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
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import "./_group.css";
import {
  daily,
  totals,
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
const SRC_HEX: Record<Source, string> = {
  satcom: "#a4400a",
  tototheo: "#2563a6",
  norway: "#3a3aa6",
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

// Source halkası — kaynak başı kullanım payını/aktivitesini görselleştirir
function SourceRing({ pct, color }: { pct: number; color: string }) {
  const size = 76;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--dv-hairline)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(C * pct) / 100} ${C}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={14}
        fontWeight={500}
        fontFamily="JetBrains Mono"
        fill="var(--dv-ink)"
      >
        %{Math.round(pct)}
      </text>
    </svg>
  );
}

export default function VariantB() {
  const ink = "#26251e";
  const muted = "#807d72";
  const grid = "#e6e5e0";

  // Üst hero: 3 kaynak büyük kartı (kaynak adı + halka + GB + hesap + terminal)
  const sources: Array<{
    source: Source; label: string; gb: number; accounts: number; kits: number; share: number;
  }> = [
    { source: "satcom",   label: "SATCOM",   gb: totals.satcomGb,   accounts: kpi.satcomAccounts,   kits: kpi.satcomKits,   share: 0 },
    { source: "tototheo", label: "TOTOTHEO", gb: totals.tototheoGb, accounts: kpi.tototheoAccounts, kits: kpi.tototheoKits, share: 0 },
    { source: "norway",   label: "NORWAY",   gb: totals.norwayGb,   accounts: kpi.norwayAccounts,   kits: kpi.norwayKits,   share: 0 },
  ];
  const sumGb = sources.reduce((s, x) => s + x.gb, 0);
  for (const s of sources) s.share = (s.gb / sumGb) * 100;

  return (
    <div className="dv-theme" style={{ padding: 28 }}>
      {/* === ÜST META: tek satır eyebrow (terminal + dönem + sistem) === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          marginBottom: 22,
        }}
      >
        <MetaCard eyebrow="TOPLAM TERMİNAL">
          <div className="dv-stat-num" style={{ fontSize: 38, fontWeight: 450 }}>
            {kpi.totalKits}
          </div>
          <div
            className="dv-mono"
            style={{ fontSize: 10, color: muted, marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            <span className="dv-source-dot satcom" style={{ marginRight: 5 }} />
            {kpi.satcomKits}
            <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
            <span className="dv-source-dot tototheo" style={{ marginRight: 5 }} />
            {kpi.tototheoKits}
            <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
            <span className="dv-source-dot norway" style={{ marginRight: 5 }} />
            {kpi.norwayKits}
          </div>
        </MetaCard>

        <MetaCard eyebrow="AKTİF DÖNEM">
          <div className="dv-stat-num" style={{ fontSize: 38, fontWeight: 450 }}>
            {kpi.activePeriod}
          </div>
        </MetaCard>

        <MetaCard eyebrow="SİSTEM DURUMU">
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
            <span style={{ fontSize: 22, fontWeight: 500, color: ink }}>AKTİF</span>
          </div>
          <div
            className="dv-mono"
            style={{ fontSize: 10, color: muted, marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            SON SYNC · {kpi.lastSyncAt}
          </div>
        </MetaCard>
      </div>

      {/* === HERO: 3 büyük kaynak kartı yan yana === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          marginBottom: 22,
        }}
      >
        {sources.map((s) => (
          <div
            key={s.source}
            className="dv-card"
            style={{
              padding: "22px 24px",
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 0,
              borderTop: `2px solid ${SRC_HEX[s.source]}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`dv-source-dot ${s.source}`} />
                <span
                  className="dv-eyebrow"
                  style={{ color: ink, fontWeight: 600, letterSpacing: "0.12em", fontSize: 11 }}
                >
                  {s.label}
                </span>
              </div>
              <span className={`dv-pill ${s.source}`}>{s.accounts} HESAP</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <SourceRing pct={s.share} color={SRC_HEX[s.source]} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="dv-stat-num" style={{ fontSize: 28, fontWeight: 500 }}>
                  {fmtCompactGb(s.gb)}
                </div>
                <div
                  className="dv-mono"
                  style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  {s.kits} TERMİNAL
                </div>
                <div
                  className="dv-mono"
                  style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}
                >
                  PAYLAŞIM %{s.share.toFixed(1)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* === ALT GRID: günlük bar (2fr) + movers list (1fr), eşit yükseklik === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <div className="dv-card" style={{ padding: 22, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span className="dv-eyebrow">SON 14 GÜN · GÜNLÜK GB</span>
            <div style={{ display: "flex", gap: 14, fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
              <span><span className="dv-source-dot satcom" style={{ marginRight: 6 }} />SATCOM</span>
              <span><span className="dv-source-dot tototheo" style={{ marginRight: 6 }} />TOTOTHEO</span>
              <span><span className="dv-source-dot norway" style={{ marginRight: 6 }} />NORWAY</span>
            </div>
          </div>
          <div style={{ width: "100%", flex: 1, minHeight: 240 }}>
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
                  cursor={{ fill: "rgba(38,37,30,0.04)" }}
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
                <Bar dataKey="satcom"   stackId="a" fill={SRC_HEX.satcom}   />
                <Bar dataKey="tototheo" stackId="a" fill={SRC_HEX.tototheo} />
                <Bar dataKey="norway"   stackId="a" fill={SRC_HEX.norway}   radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Yüksek kullanım listesi */}
        <div className="dv-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="dv-eyebrow">YÜKSEK KULLANIM</span>
            <span
              className="dv-mono"
              style={{ fontSize: 10, color: muted, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              SON 24 SAAT
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {movers.slice(0, 6).map((m) => {
              const positive = m.delta >= 0;
              return (
                <div
                  key={m.kitNo}
                  className="dv-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 60px",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 22px",
                    borderTop: "1px solid var(--dv-hairline)",
                    flex: 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className={`dv-source-dot ${m.source}`} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {m.shipName}
                      </div>
                      <div className="dv-mono" style={{ fontSize: 11, color: muted }}>
                        {m.kitNo}
                      </div>
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
    </div>
  );
}

function MetaCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div
      className="dv-card"
      style={{
        padding: "22px 24px",
        minHeight: 130,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0,
      }}
    >
      <div className="dv-eyebrow" style={{ marginBottom: 12 }}>{eyebrow}</div>
      {children}
    </div>
  );
}
