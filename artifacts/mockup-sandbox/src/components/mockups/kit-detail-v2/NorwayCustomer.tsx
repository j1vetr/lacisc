import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  MapPin, HardDrive, ArrowLeft, CalendarClock, Download, AlertTriangle,
} from "lucide-react";

const ORANGE = "#f54e00";
const CREAM = "#f7f7f4";
const INK = "#26251e";
const BORDER = "#e6e5e0";
const MUTED = "#9a9891";
const CARD = "#ffffff";
const MUTED2 = "#c4c2bc";

const dailyData = [
  { day: "01.05", priority: 4.2, standard: 1.8 },
  { day: "02.05", priority: 7.1, standard: 2.4 },
  { day: "03.05", priority: 5.6, standard: 1.1 },
  { day: "04.05", priority: 9.3, standard: 3.2 },
  { day: "05.05", priority: 6.8, standard: 2.7 },
  { day: "06.05", priority: 8.4, standard: 1.9 },
  { day: "07.05", priority: 4.9, standard: 2.1 },
  { day: "08.05", priority: 11.2, standard: 4.1 },
  { day: "09.05", priority: 9.7, standard: 3.5 },
  { day: "10.05", priority: 7.3, standard: 2.8 },
  { day: "11.05", priority: 5.1, standard: 1.6 },
  { day: "12.05", priority: 6.4, standard: 2.3 },
  { day: "13.05", priority: 12.1, standard: 4.8 },
  { day: "14.05", priority: 10.4, standard: 3.9 },
  { day: "15.05", priority: 3.2, standard: 0.9 },
];

const monthlyData = [
  { period: "202501", priority: 145, standard: 52 },
  { period: "202502", priority: 198, standard: 71 },
  { period: "202503", priority: 167, standard: 58 },
  { period: "202504", priority: 221, standard: 84 },
  { period: "202505", priority: 119, standard: 43 },
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

export function NorwayCustomer() {
  const [activePeriod, setActivePeriod] = useState("202505");

  const priority = 119.4;
  const standard = 43.2;
  const total = priority + standard;
  const plan = 350;
  const remaining = plan - total;
  const pct = (total / plan) * 100;
  const isWarning = pct > 70;

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 10 }}>
        <ArrowLeft size={14} style={{ color: MUTED }} />
        <span style={{ fontSize: 11, color: MUTED }}>Gemilerim</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, color: INK, fontWeight: 500 }}>ATLAS QUEEN</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: INK }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22543d", display: "inline-block" }} />
            AKTİF
          </span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>Norway</span>
        </div>
      </div>

      <div style={{ padding: "22px 24px 0" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>ATLAS QUEEN</h1>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3, fontFamily: "monospace" }}>SL-NO-004821</div>
        </div>

        {/* Kota kartı — Priority + Standard ayrımı */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "18px 22px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  <HardDrive size={10} style={{ display: "inline", marginRight: 4 }} />
                  Bu Dönem Kullanım — 05/2026
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.03em" }}>
                  {pct.toFixed(0)}<span style={{ fontSize: 18, fontWeight: 600, color: MUTED }}>%</span>
                </div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 2, fontFamily: "monospace" }}>
                  {total.toFixed(1)} GB / {plan} GB
                </div>
              </div>
              {isWarning && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fef8ee", border: "1px solid #f5e0a8", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#b45309" }}>
                  <AlertTriangle size={13} /> Kota Uyarısı
                </div>
              )}
            </div>

            {/* Stacked progress bar */}
            <div style={{ height: 12, borderRadius: 6, background: BORDER, overflow: "hidden", marginBottom: 4 }}>
              <div style={{ display: "flex", height: "100%" }}>
                <div style={{ width: `${(priority / plan) * 100}%`, background: ORANGE }} />
                <div style={{ width: `${(standard / plan) * 100}%`, background: MUTED2 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: MUTED }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE, display: "inline-block" }} /> Priority: {priority.toFixed(1)} GB
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: MUTED }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: MUTED2, display: "inline-block" }} /> Standard: {standard.toFixed(1)} GB
              </span>
            </div>

            {/* Stats satırı */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderTop: `1px solid ${BORDER}` }}>
              {[
                { label: "Priority", value: `${priority.toFixed(1)} GB` },
                { label: "Standard", value: `${standard.toFixed(1)} GB` },
                { label: "Kalan", value: `${remaining.toFixed(1)} GB` },
                { label: "Plan Kotası", value: `${plan} GB` },
              ].map((item, i) => (
                <div key={i} style={{ padding: "12px 14px", borderRight: i < 3 ? `1px solid ${BORDER}` : undefined }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Konum */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <SectionHeader icon={<MapPin size={14} />} title="Gemi Konumu" />
          <div style={{ position: "relative", height: 180 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #dde8f2 0%, #ccd9ea 40%, #c8d4e0 70%, #cdd8cc 100%)" }} />
            <div style={{ position: "absolute", bottom: "40%", right: "15%", width: "30%", height: "25%", background: "#bfcfaa", borderRadius: "40% 60% 50% 40%", opacity: 0.5 }} />
            <div style={{ position: "absolute", top: "40%", left: "40%", transform: "translate(-50%,-50%)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 5px rgba(245,78,0,0.15)` }}>
                <MapPin size={14} color="white" />
              </div>
              <div style={{ position: "absolute", top: 38, left: "50%", transform: "translateX(-50%)", background: "rgba(38,37,30,0.8)", color: "white", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
                ATLAS QUEEN
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.9)", borderTop: `1px solid ${BORDER}`, padding: "5px 12px", display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 59.3124</span>
              <span style={{ color: MUTED }}>·</span>
              <span><span style={{ color: MUTED }}>lng</span> 10.4872</span>
              <span style={{ color: MUTED }}>15.05.2026 08:18</span>
            </div>
          </div>
        </div>

        {/* Günlük */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "11px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: MUTED }}><Download size={14} /></span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Günlük Tüketim</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: MUTED }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE, display: "inline-block" }} /> Priority
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: MUTED }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: MUTED2, display: "inline-block" }} /> Standard
              </span>
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
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number, n: string) => [`${v} GB`, n === "priority" ? "Priority" : "Standard"]} />
                <Bar dataKey="priority" stackId="a" fill={ORANGE} />
                <Bar dataKey="standard" stackId="a" fill={MUTED2} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Aylık */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <SectionHeader icon={<CalendarClock size={14} />} title="Aylık Kullanım Geçmişi" />
          <div style={{ padding: "12px 16px" }}>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="period" tickFormatter={(v) => `${v.slice(4)}/${v.slice(2,4)}`} tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number, n: string) => [`${v} GB`, n === "priority" ? "Priority" : "Standard"]} labelFormatter={(l) => `${String(l).slice(4)}/${String(l).slice(0,4)}`} />
                <Bar dataKey="priority" stackId="a" fill={ORANGE} />
                <Bar dataKey="standard" stackId="a" fill={MUTED2} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
