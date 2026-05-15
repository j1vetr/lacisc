import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  Download, MapPin, HardDrive, Clock, ArrowLeft,
  CalendarClock, Globe, Zap, Gauge,
} from "lucide-react";

const ORANGE = "#f54e00";
const CREAM = "#f7f7f4";
const INK = "#26251e";
const BORDER = "#e6e5e0";
const MUTED = "#9a9891";
const CARD = "#ffffff";

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
    <div style={{ padding: "12px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: MUTED }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{title}</span>
      {sub && <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginLeft: 2 }}>{sub}</span>}
    </div>
  );
}

function StatBox({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div style={{
      background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: "14px 16px", flex: 1,
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: INK }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: MUTED }}>{unit}</span>}
      </div>
    </div>
  );
}

export function Norway() {
  const [activePeriod, setActivePeriod] = useState("202505");

  const priority = 119.4;
  const standard = 43.2;
  const total = priority + standard;
  const plan = 350;
  const remaining = plan - total;
  const pct = (total / plan) * 100;

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', sans-serif", color: INK, padding: "0 0 40px 0" }}>
      {/* Header */}
      <div style={{
        background: CARD, borderBottom: `1px solid ${BORDER}`,
        padding: "10px 24px", display: "flex", alignItems: "center",
        gap: 8, position: "sticky", top: 0, zIndex: 10,
      }}>
        <ArrowLeft size={14} style={{ color: MUTED }} />
        <span style={{ fontSize: 11, color: MUTED }}>Terminaller</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, color: MUTED }}>ATLAS QUEEN</span>
        <span style={{ color: BORDER }}>/</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: INK }}>SL-NO-004821</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{
            background: "#dde9f7", color: "#2563a6",
            border: "1px solid #9fbbe0", borderRadius: 4,
            padding: "2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          }}>Norway #2</span>
          <span style={{
            background: "#d4f0d9", color: "#2a7a3f",
            border: "1px solid #a8d8b0", borderRadius: 4,
            padding: "2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          }}>AKTİF</span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>
            <Clock size={10} style={{ display: "inline", marginRight: 4 }} />
            SON SENKRON: 15.05.2026 08:18
          </span>
        </div>
      </div>

      <div style={{ padding: "24px 24px 0" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Leo Bridge Terminal Detayları</h1>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4, display: "flex", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Globe size={10} /> Space Norway / Leo Bridge
            </span>
          </div>
        </div>

        {/* Stats + Map */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 16 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <SectionHeader icon={<Gauge size={15} />} title="Dönem İstatistikleri" sub="· 05/2026" />
            <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <StatBox label="Priority GB" value={priority.toFixed(1)} unit="GB" accent="#3b82f6" />
              <StatBox label="Standard GB" value={standard.toFixed(1)} unit="GB" accent="#94a3b8" />
              <StatBox label="Toplam Kullanım" value={total.toFixed(1)} unit="GB" accent={ORANGE} />
              <StatBox label="Kalan Kota" value={remaining.toFixed(1)} unit="GB" accent="#10b981" />
            </div>

            {/* Sub-metric row */}
            <div style={{ margin: "0 16px 16px", padding: "12px 16px", background: CREAM, borderRadius: 8, border: `1px solid ${BORDER}`, display: "flex", gap: 24 }}>
              <div>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>Servis Hattı</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>SL-4821-MAIN</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>Plan</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>350 GB / Ay</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>Kullanım Oranı</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: pct > 80 ? "#c94f00" : INK }}>
                  %{pct.toFixed(1)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>Dönem</div>
                <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>05/2026</div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div style={{
            background: "#d8e8f8", border: `1px solid ${BORDER}`, borderRadius: 12,
            overflow: "hidden", position: "relative", minHeight: 220,
          }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #c8dff5 0%, #b8d4f0 30%, #c5dae8 60%, #d0e5d8 100%)" }} />
            <div style={{ position: "absolute", bottom: "40%", right: "15%", width: "30%", height: "25%", background: "#c8d8b0", borderRadius: "40% 60% 50% 40%", opacity: 0.55 }} />
            <div style={{ position: "absolute", top: "38%", left: "40%", transform: "translate(-50%, -50%)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 6px rgba(245,78,0,0.2)` }}>
                <MapPin size={16} color="white" />
              </div>
            </div>
            <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.9)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${BORDER}` }}>
              Konum
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.88)", borderTop: `1px solid ${BORDER}`, padding: "6px 12px", display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "monospace" }}>
              <span><span style={{ color: MUTED }}>lat</span> 59.3124</span>
              <span><span style={{ color: MUTED }}>lng</span> 10.4872</span>
            </div>
          </div>
        </div>

        {/* Plan ve Kota */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <SectionHeader icon={<HardDrive size={15} />} title="Plan ve Kota" />
          <div style={{ padding: "20px 24px" }}>
            <div style={{ height: 18, borderRadius: 9, background: "#eeecea", overflow: "hidden", marginBottom: 12 }}>
              <div style={{ display: "flex", height: "100%", borderRadius: 9, overflow: "hidden" }}>
                <div style={{ width: `${(priority / plan) * 100}%`, background: "#3b82f6" }} />
                <div style={{ width: `${(standard / plan) * 100}%`, background: "#94a3b8" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>Bu Dönem Kullanım</div>
                <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "monospace" }}>{total.toFixed(1)} GB / {plan} GB</div>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#3b82f6", display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: MUTED }}>Priority</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{priority.toFixed(1)} GB</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 2 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#94a3b8", display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: MUTED }}>Standard</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>{standard.toFixed(1)} GB</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginBottom: 2 }}>Toplam Tahsis</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{plan} GB</div>
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
              <div style={{ display: "flex", gap: 10, marginLeft: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: MUTED }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6", display: "inline-block" }} /> Priority
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: MUTED }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#94a3b8", display: "inline-block" }} /> Standard
                </span>
              </div>
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
              <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={BORDER} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number, n: string) => [`${v} GB`, n === "priority" ? "Priority" : "Standard"]} />
                <Bar dataKey="priority" stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
                <Bar dataKey="standard" stackId="a" fill="#94a3b8" radius={[3,3,0,0]} />
              </BarChart>
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
                <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11 }} formatter={(v: number, n: string) => [`${v} GB`, n === "priority" ? "Priority" : "Standard"]} labelFormatter={(l) => `${String(l).slice(4)}/${String(l).slice(0,4)}`} />
                <Bar dataKey="priority" stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
                <Bar dataKey="standard" stackId="a" fill="#94a3b8" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
