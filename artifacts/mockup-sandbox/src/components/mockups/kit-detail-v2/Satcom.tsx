import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  Gauge, Activity, TrendingUp, Download, Upload,
  MapPin, HardDrive, Clock, Radio, ArrowLeft,
  Phone, Briefcase, CalendarClock,
} from "lucide-react";

const ORANGE = "#f54e00";
const CREAM = "#f7f7f4";
const INK = "#26251e";
const BORDER = "#e6e5e0";
const MUTED = "#9a9891";
const CARD = "#ffffff";
const ICON_BG = "#eeede9";

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

function MetricCard({
  label, value, unit, icon,
}: {
  label: string; value: string; unit: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 10, padding: "14px 16px",
      display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8,
        background: ICON_BG, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: INK, fontFamily: "'JetBrains Mono', monospace" }}>
            {value}
          </span>
          <span style={{ fontSize: 11, color: MUTED }}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{
      padding: "11px 18px", borderBottom: `1px solid ${BORDER}`,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ color: MUTED }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{title}</span>
      {sub && <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginLeft: 2 }}>{sub}</span>}
    </div>
  );
}

export function Satcom() {
  const [activePeriod, setActivePeriod] = useState("202505");

  const used = 898.7;
  const total = 2000;
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
        <span style={{ fontSize: 11, color: MUTED }}>ILHAN YILMAZ 3</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: INK }}>KITP00079130</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{
            display: "flex", alignItems: "center", gap: 5,
            background: CREAM, border: `1px solid ${BORDER}`,
            borderRadius: 4, padding: "2px 8px",
            fontSize: 10, fontWeight: 600, color: INK,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22543d", display: "inline-block" }} />
            AKTİF
          </span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={10} /> SON SENKRON: 15.05.2026 08:12
          </span>
        </div>
      </div>

      <div style={{ padding: "22px 24px 0" }}>
        {/* Page title */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Terminal Detayları & Telemetri
          </h1>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4, display: "flex", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Phone size={10} /> +90 532 111 22 33
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Briefcase size={10} /> Boğaz Tankercilik A.Ş.
            </span>
          </div>
        </div>

        {/* Top row: Telemetry + Map */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, marginBottom: 14 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            <SectionHeader icon={<Radio size={14} />} title="Canlı Telemetri" sub="· 15.05.2026 07:00 saatlik ortalama" />
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <MetricCard label="Sinyal Gücü" value="100" unit="%" icon={<Gauge size={18} color={MUTED} />} />
              <MetricCard label="Gecikme" value="38" unit="ms" icon={<Activity size={18} color={MUTED} />} />
              <MetricCard label="Paket Kaybı" value="0,00" unit="%" icon={<TrendingUp size={18} color={MUTED} />} />
              <MetricCard label="İndirme" value="0,2" unit="Mbps" icon={<Download size={18} color={MUTED} />} />
            </div>
          </div>

          {/* Map */}
          <div style={{
            background: "#e8eef4", border: `1px solid ${BORDER}`,
            borderRadius: 10, overflow: "hidden", position: "relative", minHeight: 200,
          }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #dde8f2 0%, #ccd9ea 40%, #c8d4e0 70%, #cdd8cc 100%)" }} />
            <div style={{ position: "absolute", bottom: "30%", left: "10%", width: "38%", height: "32%", background: "#bfcfaa", borderRadius: "60% 40% 50% 60%", opacity: 0.5 }} />
            <div style={{ position: "absolute", top: "35%", left: "55%", transform: "translate(-50%, -50%)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 5px rgba(245,78,0,0.15)` }}>
                <MapPin size={14} color="white" />
              </div>
            </div>
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.92)", borderRadius: 5, padding: "3px 9px", fontSize: 10, fontWeight: 600, border: `1px solid ${BORDER}` }}>
              Konum
            </div>
            <div style={{ position: "absolute", top: "42%", left: "8%", background: "rgba(38,37,30,0.7)", borderRadius: 5, padding: "2px 7px", fontSize: 10, color: "white", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
              <Upload size={8} /> 0,0 Mbps
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.9)", borderTop: `1px solid ${BORDER}`, padding: "5px 10px", display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 11.7997</span>
              <span><span style={{ color: MUTED }}>lng</span> -15.6053</span>
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
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>{used.toFixed(1)} GB / {total.toLocaleString()} GB</div>
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
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{total.toLocaleString()} GB</div>
              </div>
            </div>
          </div>
        </div>

        {/* Günlük Tüketim chart */}
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
                }}>
                  {p.slice(4)}/{p.slice(0,4)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px 16px 8px" }}>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gb-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v} GB`, "Kullanım"]} />
                <Area type="monotone" dataKey="gb" stroke={ORANGE} strokeWidth={2} fill="url(#gb-gradient)" isAnimationActive={false} dot={false} />
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
