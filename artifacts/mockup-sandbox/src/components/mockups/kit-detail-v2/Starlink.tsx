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

function MetricCard({ label, value, unit, bg, icon }: {
  label: string; value: string; unit: string; bg: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: bg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: INK, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
          <span style={{ fontSize: 12, color: MUTED }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{
      padding: "12px 18px", borderBottom: `1px solid ${BORDER}`,
      display: "flex", alignItems: "center", gap: 8,
    }}>
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
    <div style={{
      minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif",
      color: INK, padding: "0 0 40px 0",
    }}>
      {/* Header */}
      <div style={{
        background: CARD, borderBottom: `1px solid ${BORDER}`,
        padding: "10px 24px", display: "flex", alignItems: "center",
        gap: 8, position: "sticky", top: 0, zIndex: 10,
      }}>
        <ArrowLeft size={14} style={{ color: MUTED }} />
        <span style={{ fontSize: 11, color: MUTED }}>Terminaller</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, color: MUTED }}>MARMARA STAR</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: INK }}>0100000000-00000000</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{
            background: "#dde9f7", color: "#2563a6",
            border: "1px solid #9fbbe0", borderRadius: 4,
            padding: "2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          }}>Tototheo #1</span>
          <span style={{
            background: "#d4f0d9", color: "#2a7a3f",
            border: "1px solid #a8d8b0", borderRadius: 4,
            padding: "2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          }}>AKTİF</span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>
            <Clock size={10} style={{ display: "inline", marginRight: 4 }} />
            SON SENKRON: 15.05.2026 08:15
          </span>
        </div>
      </div>

      <div style={{ padding: "24px 24px 0" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Starlink Terminal Detayları
          </h1>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 16 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <SectionHeader icon={<Radio size={15} />} title="Canlı Telemetri" sub="· son 24 saat ortalaması" />
            <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <MetricCard label="Sinyal Gücü" value="94" unit="%" bg="#d4f0d9" icon={<Gauge size={20} color="#2a7a3f" />} />
              <MetricCard label="Gecikme" value="27" unit="ms" bg="#fde9d5" icon={<Activity size={20} color="#c94f00" />} />
              <MetricCard label="Paket Kaybı" value="0,12" unit="%" bg="#ece8fa" icon={<TrendingUp size={20} color="#6b3fa0" />} />
              <MetricCard label="İndirme" value="87,4" unit="Mbps" bg="#d5f0f0" icon={<Download size={20} color="#1a7a7a" />} />
              <MetricCard label="Yükleme" value="12,1" unit="Mbps" bg="#fce8f3" icon={<Upload size={20} color="#a0306a" />} />
              <MetricCard label="Engel" value="0,08" unit="%" bg="#fffbe6" icon={<Signal size={20} color="#a07a00" />} />
            </div>
          </div>

          {/* Map */}
          <div style={{
            background: "#d8e8f8", border: `1px solid ${BORDER}`, borderRadius: 12,
            overflow: "hidden", position: "relative", minHeight: 280,
          }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #c8dff5 0%, #b8d4f0 30%, #c5dae8 60%, #d0e5d8 100%)" }} />
            <div style={{ position: "absolute", top: "20%", left: "5%", width: "35%", height: "30%", background: "#c8d8b0", borderRadius: "50% 40% 60% 50%", opacity: 0.55 }} />
            <div style={{ position: "absolute", top: "42%", right: "20%", transform: "translate(0, -50%)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 6px rgba(245,78,0,0.2)` }}>
                <MapPin size={16} color="white" />
              </div>
            </div>
            <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${BORDER}` }}>
              Konum
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.88)", borderTop: `1px solid ${BORDER}`, padding: "6px 12px", display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 40.2156</span>
              <span><span style={{ color: MUTED }}>lng</span> 28.8743</span>
            </div>
          </div>
        </div>

        {/* Plan ve Kota */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <SectionHeader icon={<HardDrive size={15} />} title="Plan ve Kota" />
          <div style={{ padding: "20px 24px" }}>
            <div style={{ height: 18, borderRadius: 9, background: "#eeecea", overflow: "hidden", marginBottom: 12 }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: "linear-gradient(90deg, #3b82f6 0%, #06b6d4 60%, #10b981 100%)",
                borderRadius: 9,
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>Bu Dönem Kullanım</div>
                <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "monospace" }}>{used.toFixed(1)} GB / {total} GB</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#3b82f6", display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: MUTED }}>Kullanılan</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{used.toFixed(1)} GB</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#cbd5e1", display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: MUTED }}>Kalan</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{remaining.toFixed(1)} GB</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>Toplam Tahsis</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{total} GB</div>
              </div>
            </div>
          </div>
        </div>

        {/* Günlük Tüketim */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: MUTED }}><Download size={15} /></span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Günlük Tüketim</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["202501","202502","202503","202504","202505"].map((p) => (
                <button key={p} onClick={() => setActivePeriod(p)} style={{
                  padding: "3px 8px", borderRadius: 5, border: `1px solid ${BORDER}`,
                  background: activePeriod === p ? INK : CREAM,
                  color: activePeriod === p ? "white" : MUTED,
                  fontSize: 10, fontFamily: "monospace", cursor: "pointer", fontWeight: 500,
                }}>{p.slice(4)}/{p.slice(0,4)}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: "16px 18px 8px" }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sl-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0.02} />
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
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <SectionHeader icon={<CalendarClock size={15} />} title="Aylık Kullanım Geçmişi" />
          <div style={{ padding: "12px 18px" }}>
            <ResponsiveContainer width="100%" height={140}>
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
