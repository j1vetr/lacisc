import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  MapPin, HardDrive, ArrowLeft, CalendarClock,
  Download, Wifi, AlertTriangle,
} from "lucide-react";

const ORANGE = "#f54e00";
const CREAM = "#f7f7f4";
const INK = "#26251e";
const BORDER = "#e6e5e0";
const MUTED = "#9a9891";
const CARD = "#ffffff";

const dailyData = [
  { day: "01.05", gb: 28 }, { day: "02.05", gb: 42 }, { day: "03.05", gb: 35 },
  { day: "04.05", gb: 61 }, { day: "05.05", gb: 55 }, { day: "06.05", gb: 48 },
  { day: "07.05", gb: 39 }, { day: "08.05", gb: 73 }, { day: "09.05", gb: 67 },
  { day: "10.05", gb: 51 }, { day: "11.05", gb: 44 }, { day: "12.05", gb: 38 },
  { day: "13.05", gb: 82 }, { day: "14.05", gb: 76 }, { day: "15.05", gb: 29 },
];

const monthlyData = [
  { period: "202501", gb: 412 }, { period: "202502", gb: 688 },
  { period: "202503", gb: 754 }, { period: "202504", gb: 821 },
  { period: "202505", gb: 899 },
];

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ padding: "11px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: MUTED }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{title}</span>
      {sub && <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginLeft: 2 }}>{sub}</span>}
    </div>
  );
}

export function SatcomCustomer() {
  const [activePeriod, setActivePeriod] = useState("202505");

  const used = 898.7;
  const total = 2000;
  const remaining = total - used;
  const pct = (used / total) * 100;
  const isWarning = pct > 80;
  const isCritical = pct > 95;

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 10 }}>
        <ArrowLeft size={14} style={{ color: MUTED }} />
        <span style={{ fontSize: 11, color: MUTED }}>Gemilerim</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, color: INK, fontWeight: 500 }}>ILHAN YILMAZ 3</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: INK }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22543d", display: "inline-block" }} />
            AKTİF
          </span>
        </div>
      </div>

      <div style={{ padding: "22px 24px 0" }}>
        {/* Page title */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>ILHAN YILMAZ 3</h1>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3, fontFamily: "monospace" }}>KITP00079130</div>
        </div>

        {/* Büyük kota kartı — müşteri için ana öğe */}
        <div style={{
          background: CARD, border: `1px solid ${isCritical ? ORANGE : BORDER}`,
          borderRadius: 12, overflow: "hidden", marginBottom: 14,
        }}>
          <div style={{ padding: "18px 22px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  <HardDrive size={10} style={{ display: "inline", marginRight: 4 }} />
                  Bu Dönem Kullanım — 05/2026
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.03em", color: isCritical ? ORANGE : INK }}>
                  {pct.toFixed(0)}<span style={{ fontSize: 18, fontWeight: 600, color: MUTED }}>%</span>
                </div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 2, fontFamily: "monospace" }}>
                  {used.toFixed(1)} GB kullanıldı
                </div>
              </div>
              {(isWarning || isCritical) && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: isCritical ? "#fef2ee" : "#fef8ee",
                  border: `1px solid ${isCritical ? "#fbd0be" : "#f5e0a8"}`,
                  borderRadius: 8, padding: "8px 12px",
                  fontSize: 11, fontWeight: 600,
                  color: isCritical ? ORANGE : "#b45309",
                }}>
                  <AlertTriangle size={13} />
                  {isCritical ? "Kota Dolmak Üzere" : "Kota Uyarısı"}
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: 12, borderRadius: 6, background: BORDER, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 6,
                background: isCritical ? ORANGE : isWarning ? "#b45309" : INK,
                transition: "width 0.4s",
              }} />
            </div>

            {/* Stats satırı */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderTop: `1px solid ${BORDER}` }}>
              {[
                { label: "Kullanılan", value: `${used.toFixed(1)} GB`, accent: true },
                { label: "Kalan", value: `${remaining.toFixed(1)} GB`, accent: false },
                { label: "Plan Kotası", value: `${total.toLocaleString()} GB`, accent: false },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: "14px 16px",
                  borderRight: i < 2 ? `1px solid ${BORDER}` : undefined,
                }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: item.accent && isCritical ? ORANGE : INK }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Konum haritası */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <SectionHeader icon={<Wifi size={14} />} title="Gemi Konumu" />
          <div style={{ position: "relative", height: 200 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #dde8f2 0%, #ccd9ea 40%, #c8d4e0 70%, #cdd8cc 100%)" }} />
            <div style={{ position: "absolute", bottom: "30%", left: "10%", width: "38%", height: "32%", background: "#bfcfaa", borderRadius: "60% 40% 50% 60%", opacity: 0.5 }} />
            <div style={{ position: "absolute", top: "38%", left: "55%", transform: "translate(-50%,-50%)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 6px rgba(245,78,0,0.15)` }}>
                <MapPin size={15} color="white" />
              </div>
              <div style={{ position: "absolute", top: 44, left: "50%", transform: "translateX(-50%)", background: "rgba(38,37,30,0.8)", color: "white", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
                ILHAN YILMAZ 3
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.9)", borderTop: `1px solid ${BORDER}`, padding: "6px 14px", display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 11.7997</span>
              <span style={{ color: MUTED }}>·</span>
              <span><span style={{ color: MUTED }}>lng</span> -15.6053</span>
              <span style={{ color: MUTED }}>15.05.2026 08:12</span>
            </div>
          </div>
        </div>

        {/* Günlük Tüketim */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "11px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: MUTED }}><Download size={14} /></span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Günlük Tüketim</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["202501","202502","202503","202504","202505"].map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)} style={{
                  padding: "2px 7px", borderRadius: 4, border: `1px solid ${BORDER}`,
                  background: activePeriod === p ? INK : CREAM,
                  color: activePeriod === p ? "white" : MUTED,
                  fontSize: 10, fontFamily: "monospace", cursor: "pointer", fontWeight: 500,
                }}>{p.slice(4)}/{p.slice(0,4)}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px 16px 8px" }}>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cust-gb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} GB`, "Kullanım"]} />
                <Area type="monotone" dataKey="gb" stroke={ORANGE} strokeWidth={2} fill="url(#cust-gb)" isAnimationActive={false} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Aylık tarihçe */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <SectionHeader icon={<CalendarClock size={14} />} title="Aylık Kullanım Geçmişi" />
          <div style={{ padding: "12px 16px" }}>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="period" tickFormatter={(v) => `${v.slice(4)}/${v.slice(2,4)}`} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} GB`, ""]} labelFormatter={(l) => `${String(l).slice(4)}/${String(l).slice(0,4)}`} />
                <Bar dataKey="gb" fill={ORANGE} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
