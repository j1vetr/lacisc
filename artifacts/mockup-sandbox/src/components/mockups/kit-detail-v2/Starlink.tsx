import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  Gauge, Activity, TrendingUp, Download, Upload,
  Signal, MapPin, HardDrive, Clock, Radio, ArrowLeft,
  CalendarClock, Satellite, Eye,
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

function MetricCard({ label, value, unit, icon }: {
  label: string; value: string; unit: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: ICON_BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
          <span style={{ fontSize: 11, color: MUTED }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ padding: "11px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: MUTED }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{title}</span>
      {sub && <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginLeft: 2 }}>{sub}</span>}
    </div>
  );
}

export function Starlink() {
  const [activePeriod, setActivePeriod] = useState("202505");

  const used = 256.8;
  const total = 500;
  const remaining = total - used;
  const pct = (used / total) * 100;

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 10 }}>
        <ArrowLeft size={14} style={{ color: MUTED }} />
        <span style={{ fontSize: 11, color: MUTED }}>Terminaller</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, color: MUTED }}>MARMARA STAR</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: INK }}>0100000000-00000000</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 500, color: MUTED }}>
            Tototheo #1
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: INK }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22543d", display: "inline-block" }} />
            AKTİF
          </span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={10} /> SON SENKRON: 15.05.2026 08:15
          </span>
        </div>
      </div>

      <div style={{ padding: "22px 24px 0" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Starlink Terminal Detayları</h1>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4, display: "flex", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Satellite size={10} /> Tototheo Starlink
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Eye size={10} /> Plan: 500 GB / Ay
            </span>
          </div>
        </div>

        {/* Telemetry + Map */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, marginBottom: 14 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            <SectionHeader icon={<Radio size={14} />} title="Canlı Telemetri" sub="· son 24 saat ortalaması" />
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <MetricCard label="Sinyal Gücü" value="94" unit="%" icon={<Gauge size={18} color={MUTED} />} />
              <MetricCard label="Gecikme" value="27" unit="ms" icon={<Activity size={18} color={MUTED} />} />
              <MetricCard label="Paket Kaybı" value="0,12" unit="%" icon={<TrendingUp size={18} color={MUTED} />} />
              <MetricCard label="İndirme" value="87,4" unit="Mbps" icon={<Download size={18} color={MUTED} />} />
              <MetricCard label="Yükleme" value="12,1" unit="Mbps" icon={<Upload size={18} color={MUTED} />} />
              <MetricCard label="Engel" value="0,08" unit="%" icon={<Signal size={18} color={MUTED} />} />
            </div>
          </div>

          {/* Map */}
          <div style={{ background: "#e8eef4", border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", position: "relative", minHeight: 280 }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #dde8f2 0%, #ccd9ea 40%, #c8d4e0 70%, #cdd8cc 100%)" }} />
            <div style={{ position: "absolute", top: "20%", left: "5%", width: "35%", height: "30%", background: "#bfcfaa", borderRadius: "50% 40% 60% 50%", opacity: 0.5 }} />
            <div style={{ position: "absolute", top: "42%", right: "20%", transform: "translate(0, -50%)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 5px rgba(245,78,0,0.15)` }}>
                <MapPin size={14} color="white" />
              </div>
            </div>
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.92)", borderRadius: 5, padding: "3px 9px", fontSize: 10, fontWeight: 600, border: `1px solid ${BORDER}` }}>
              Konum
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.9)", borderTop: `1px solid ${BORDER}`, padding: "5px 10px", display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 40.2156</span>
              <span><span style={{ color: MUTED }}>lng</span> 28.8743</span>
            </div>
          </div>
        </div>

        {/* Plan ve Kota */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          <SectionHeader icon={<HardDrive size={14} />} title="Plan ve Kota" />
          <div style={{ padding: "18px 22px" }}>
            <div style={{ height: 16, borderRadius: 8, background: BORDER, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 8 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>Bu Dönem Kullanım</div>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>{used.toFixed(1)} GB / {total} GB</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE, display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: MUTED }}>Kullanılan</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{used.toFixed(1)} GB</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: BORDER, display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: MUTED }}>Kalan</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{remaining.toFixed(1)} GB</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>Toplam Tahsis</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{total} GB</div>
              </div>
            </div>
          </div>
        </div>

        {/* Günlük Tüketim */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
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
                  <linearGradient id="sl-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} GB`, "Kullanım"]} />
                <Area type="monotone" dataKey="gb" stroke={ORANGE} strokeWidth={2} fill="url(#sl-gradient)" isAnimationActive={false} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Aylık tarihçe */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
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
