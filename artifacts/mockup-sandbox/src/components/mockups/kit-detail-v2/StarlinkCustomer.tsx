import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  MapPin, HardDrive, ArrowLeft, CalendarClock,
  Download, Upload, Gauge, Activity, AlertTriangle,
} from "lucide-react";

const ORANGE = "#f54e00";
const CREAM = "#f7f7f4";
const INK = "#26251e";
const BORDER = "#e6e5e0";
const MUTED = "#9a9891";
const CARD = "#ffffff";
const ICON_BG = "#eeede9";

const dailyData = [
  { day: "01.05", gb: 12.4 }, { day: "02.05", gb: 18.7 }, { day: "03.05", gb: 9.1 },
  { day: "04.05", gb: 21.3 }, { day: "05.05", gb: 15.8 }, { day: "06.05", gb: 19.2 },
  { day: "07.05", gb: 11.5 }, { day: "08.05", gb: 23.6 }, { day: "09.05", gb: 20.1 },
  { day: "10.05", gb: 17.4 }, { day: "11.05", gb: 13.9 }, { day: "12.05", gb: 16.2 },
  { day: "13.05", gb: 25.8 }, { day: "14.05", gb: 22.7 }, { day: "15.05", gb: 8.4 },
];

const monthlyData = [
  { period: "202501", gb: 248 }, { period: "202502", gb: 312 },
  { period: "202503", gb: 287 }, { period: "202504", gb: 334 },
  { period: "202505", gb: 257 },
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

function ConnStat({ label, value, unit, icon }: { label: string; value: string; unit: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 7, background: ICON_BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: INK }}>
          {value} <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

export function StarlinkCustomer() {
  const [activePeriod, setActivePeriod] = useState("202505");

  const used = 256.8;
  const total = 500;
  const remaining = total - used;
  const pct = (used / total) * 100;
  const isWarning = pct > 70;

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 10 }}>
        <ArrowLeft size={14} style={{ color: MUTED }} />
        <span style={{ fontSize: 11, color: MUTED }}>Gemilerim</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, color: INK, fontWeight: 500 }}>MARMARA STAR</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: INK }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22543d", display: "inline-block" }} />
            AKTİF
          </span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>Starlink</span>
        </div>
      </div>

      <div style={{ padding: "22px 24px 0" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>MARMARA STAR</h1>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3, fontFamily: "monospace" }}>0100000000-00000000</div>
        </div>

        {/* Kota kartı */}
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
                  {used.toFixed(1)} GB kullanıldı
                </div>
              </div>
              {isWarning && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fef8ee", border: "1px solid #f5e0a8", borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#b45309" }}>
                  <AlertTriangle size={13} /> Kota Uyarısı
                </div>
              )}
            </div>
            <div style={{ height: 12, borderRadius: 6, background: BORDER, overflow: "hidden", marginBottom: 0 }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 6, background: isWarning ? ORANGE : INK }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${BORDER}`, marginTop: 14 }}>
              {[
                { label: "Kullanılan", value: `${used.toFixed(1)} GB` },
                { label: "Kalan", value: `${remaining.toFixed(1)} GB` },
                { label: "Plan Kotası", value: `${total} GB` },
              ].map((item, i) => (
                <div key={i} style={{ padding: "14px 16px", borderRight: i < 2 ? `1px solid ${BORDER}` : undefined }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bağlantı Durumu (sadece hız ve gecikme) */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <SectionHeader icon={<Gauge size={14} />} title="Bağlantı Durumu" sub="· anlık" />
          <div style={{ padding: 14, display: "flex", gap: 10 }}>
            <ConnStat label="Gecikme" value="27" unit="ms" icon={<Activity size={16} color={MUTED} />} />
            <ConnStat label="İndirme" value="87,4" unit="Mbps" icon={<Download size={16} color={MUTED} />} />
            <ConnStat label="Yükleme" value="12,1" unit="Mbps" icon={<Upload size={16} color={MUTED} />} />
          </div>
        </div>

        {/* Konum */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <SectionHeader icon={<MapPin size={14} />} title="Gemi Konumu" />
          <div style={{ position: "relative", height: 180 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #dde8f2 0%, #ccd9ea 40%, #c8d4e0 70%, #cdd8cc 100%)" }} />
            <div style={{ position: "absolute", top: "20%", left: "5%", width: "35%", height: "30%", background: "#bfcfaa", borderRadius: "50% 40% 60% 50%", opacity: 0.5 }} />
            <div style={{ position: "absolute", top: "45%", right: "22%", transform: "translate(0,-50%)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 5px rgba(245,78,0,0.15)` }}>
                <MapPin size={14} color="white" />
              </div>
              <div style={{ position: "absolute", top: 38, left: "50%", transform: "translateX(-50%)", background: "rgba(38,37,30,0.8)", color: "white", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
                MARMARA STAR
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.9)", borderTop: `1px solid ${BORDER}`, padding: "5px 12px", display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 40.2156</span>
              <span style={{ color: MUTED }}>·</span>
              <span><span style={{ color: MUTED }}>lng</span> 28.8743</span>
              <span style={{ color: MUTED }}>15.05.2026 08:15</span>
            </div>
          </div>
        </div>

        {/* Günlük */}
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
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cust-sl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} GB`, "Kullanım"]} />
                <Area type="monotone" dataKey="gb" stroke={ORANGE} strokeWidth={2} fill="url(#cust-sl)" isAnimationActive={false} dot={false} />
              </AreaChart>
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
