import "./_group.css";
import { detail, monthly, daily, fmtN, fmtPeriod, fmtDay, fmtDate } from "./_mock";
import {
  ArrowLeft, Satellite, HardDrive, CalendarClock, Activity, Wifi, AlertTriangle,
  MapPin, Gauge, Globe, Signal, Zap, Download, Upload, Eye, Server, Clock,
  TrendingUp, ShieldAlert, Radio, Compass,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

function Card({ children, className = "" }: any) {
  return <div className={`rounded-lg border border-[#e6e5e0] bg-white ${className}`}>{children}</div>;
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "info" }) {
  const tones: Record<string, string> = {
    neutral: "bg-[#fafaf7] text-[#807d72] border-[#e6e5e0]",
    ok: "bg-[#9fc9a2]/30 text-[#1f5b32] border-[#9fc9a2]",
    warn: "bg-[#dfa88f]/30 text-[#7a3a1a] border-[#dfa88f]",
    info: "bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-widest border ${tones[tone]}`}>{children}</span>;
}

function MetricTile({ label, value, unit, icon, tone = "neutral", sub }: any) {
  const accents: Record<string, string> = {
    neutral: "border-l-[#e6e5e0]",
    ok: "border-l-[#9fc9a2]",
    warn: "border-l-[#dfa88f]",
    info: "border-l-[#9fbbe0]",
  };
  return (
    <div className={`rounded-lg border border-[#e6e5e0] border-l-2 ${accents[tone]} bg-white px-3 py-2.5`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">
        <span className="flex items-center gap-1">{icon}{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-base text-[#26251e]">{value}</span>
        {unit && <span className="text-[11px] text-[#807d72]">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-[#807d72] font-mono mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export default function Zengin() {
  const usedPct = (detail.currentPeriodTotalGb / detail.planAllowanceGB) * 100;
  const remainingGB = detail.planAllowanceGB - detail.currentPeriodTotalGb;
  const trafficSplit = [
    { name: "Öncelik", value: detail.priorityGb, color: "#f54e00" },
    { name: "Standart", value: detail.standardTrafficSpent, color: "#9fbbe0" },
  ];
  // 30 günlük projeksiyon
  const dailyAvg = detail.currentPeriodTotalGb / 7;
  const projected = dailyAvg * 30;

  return (
    <div className="starlink-theme">
      <div className="max-w-[1240px] mx-auto px-6 py-6 space-y-4">
        {/* Header bar — dense, sticky */}
        <div className="rounded-lg border border-[#e6e5e0] bg-white sticky top-0 z-20 shadow-[0_1px_0_0_#e6e5e0]">
          <div className="px-5 py-3 flex items-center gap-4 border-b border-[#e6e5e0]">
            <div className="inline-flex items-center gap-2 text-xs text-[#807d72] cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" />
              Terminaller
            </div>
            <span className="text-[#e6e5e0]">/</span>
            <Satellite className="w-4 h-4 text-[#807d72]" />
            <h1 className="text-lg font-mono tracking-tight">{detail.kitSerialNumber}</h1>
            <span className="text-sm text-[#807d72]">— {detail.nickname}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Pill tone="info">Tototheo</Pill>
              <Pill tone="ok"><Wifi className="w-2.5 h-2.5" /> Online</Pill>
              {detail.optIn && <Pill>Opt-In</Pill>}
              {detail.activeAlertsCount > 0 && <Pill tone="warn"><AlertTriangle className="w-2.5 h-2.5" /> {detail.activeAlertsCount} uyarı</Pill>}
            </div>
          </div>
          <div className="px-5 py-2.5 flex items-center gap-6 text-[11px] font-mono text-[#807d72]">
            <span><span className="text-[#26251e]">{detail.plan}</span></span>
            <span>SL <span className="text-[#26251e]">{detail.serviceLineNumber}</span></span>
            <span>UT <span className="text-[#26251e]">{detail.userTerminalId}</span></span>
            <span>IPv4 <span className="text-[#26251e]">{detail.ipv4}</span></span>
            <span className="ml-auto flex items-center gap-1.5"><Clock className="w-3 h-3" /> Son sync {fmtDate(detail.updatedAt)}</span>
          </div>
        </div>

        {/* Top grid: live telemetry (8) + map (4) */}
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-8">
            <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#807d72]" />
                <h2 className="text-sm font-semibold tracking-tight">Canlı Telemetri</h2>
              </div>
              <span className="text-[10px] font-mono text-[#807d72]">refresh ~3 sn</span>
            </div>
            <div className="p-4 grid grid-cols-4 gap-2">
              <MetricTile label="Sinyal" value={`${detail.signalQuality * 100}`} unit="%" icon={<Gauge className="w-3 h-3" />} tone="ok" />
              <MetricTile label="Gecikme" value={detail.latency} unit="ms" icon={<Activity className="w-3 h-3" />} tone="ok" />
              <MetricTile label="Ping Drop" value={fmtN(detail.pingDropRate * 100, 2)} unit="%" icon={<TrendingUp className="w-3 h-3" />} tone="ok" />
              <MetricTile label="Engellenme" value={fmtN(detail.obstruction * 100, 2)} unit="%" icon={<Eye className="w-3 h-3" />} tone="ok" />
              <MetricTile label="İndirme" value={fmtN(detail.downloadSpeed, 1)} unit="Mbps" icon={<Download className="w-3 h-3" />} />
              <MetricTile label="Yükleme" value={fmtN(detail.uploadSpeed, 1)} unit="Mbps" icon={<Upload className="w-3 h-3" />} />
              <MetricTile label="Aktif Uyarı" value={detail.activeAlertsCount} icon={<ShieldAlert className="w-3 h-3" />} tone={detail.activeAlertsCount > 0 ? "warn" : "neutral"} />
              <MetricTile label="Engel Yok" value={fmtN((1 - detail.obstruction) * 100, 1)} unit="%" icon={<Signal className="w-3 h-3" />} tone="ok" />
            </div>
          </Card>

          <Card className="col-span-4">
            <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#807d72]" />
                <h2 className="text-sm font-semibold tracking-tight">Konum</h2>
              </div>
              <span className="text-[10px] font-mono text-[#807d72]">{fmtDate(detail.lastFix)}</span>
            </div>
            <div className="relative h-[214px] bg-gradient-to-br from-[#dde9f7] to-[#fafaf7] overflow-hidden">
              {/* sahte grid + pin */}
              <svg className="absolute inset-0 w-full h-full opacity-40">
                <defs>
                  <pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#9fbbe0" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#g)" />
              </svg>
              <div className="absolute" style={{ left: "52%", top: "44%" }}>
                <div className="relative">
                  <div className="absolute -inset-3 rounded-full bg-[#f54e00]/20 animate-pulse" />
                  <MapPin className="w-6 h-6 text-[#f54e00] fill-[#f54e00] relative" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-white/90 border-t border-[#e6e5e0] flex justify-between text-[11px] font-mono">
                <span><span className="text-[#807d72]">lat</span> {detail.lat.toFixed(4)}</span>
                <span><span className="text-[#807d72]">lng</span> {detail.lng.toFixed(4)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Quota + Traffic split + Projection */}
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-7">
            <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#807d72]" />
                <h2 className="text-sm font-semibold tracking-tight">Plan ve Kota</h2>
                <Pill tone="info">{fmtPeriod(detail.currentPeriod)}</Pill>
              </div>
              <span className="text-[10px] font-mono text-[#807d72]">{detail.plan}</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Kullanılan</div>
                  <div className="font-mono text-3xl mt-0.5">{fmtN(detail.currentPeriodTotalGb, 1)} <span className="text-sm text-[#807d72]">GB</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Kalan</div>
                  <div className="font-mono text-2xl mt-0.5">{fmtN(remainingGB, 1)} <span className="text-sm text-[#807d72]">GB</span></div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Tahsis</div>
                  <div className="font-mono text-2xl mt-0.5 text-[#807d72]">{detail.planAllowanceGB} <span className="text-sm">GB</span></div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Doluluk</div>
                  <div className={`font-mono text-3xl mt-0.5 ${usedPct > 80 ? "text-[#dfa88f]" : ""}`}>{fmtN(usedPct, 1)}%</div>
                </div>
              </div>
              <div className="relative h-3 bg-[#f0efe8] rounded-sm overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-[#26251e]" style={{ width: `${Math.min(usedPct, 100)}%` }} />
                {[25, 50, 75].map(p => (
                  <div key={p} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${p}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[#807d72]">
                <span>0</span><span>256</span><span>512</span><span>768</span><span>1024 GB</span>
              </div>
            </div>
          </Card>

          <Card className="col-span-3">
            <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#807d72]" />
              <h2 className="text-sm font-semibold tracking-tight">Trafik Dağılımı</h2>
            </div>
            <div className="p-2 h-[180px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={trafficSplit} dataKey="value" innerRadius={42} outerRadius={66} paddingAngle={2}>
                    {trafficSplit.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="font-mono text-lg leading-none">{fmtN(detail.currentPeriodTotalGb, 0)}</div>
                  <div className="text-[10px] text-[#807d72] font-mono">GB toplam</div>
                </div>
              </div>
            </div>
            <div className="px-4 pb-3 space-y-1 text-[11px] font-mono">
              {trafficSplit.map(t => (
                <div key={t.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: t.color }} />{t.name}</span>
                  <span>{fmtN(t.value, 1)} GB</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="col-span-2">
            <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#807d72]" />
              <h2 className="text-sm font-semibold tracking-tight">Projeksiyon</h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Günlük ort.</div>
                <div className="font-mono text-xl">{fmtN(dailyAvg, 1)} <span className="text-xs text-[#807d72]">GB</span></div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">30 gün tahmin</div>
                <div className={`font-mono text-xl ${projected > detail.planAllowanceGB ? "text-[#dfa88f]" : ""}`}>{fmtN(projected, 0)} <span className="text-xs text-[#807d72]">GB</span></div>
              </div>
              <Pill tone={projected > detail.planAllowanceGB ? "warn" : "ok"}>
                {projected > detail.planAllowanceGB ? "Aşım riski" : "Plan içi"}
              </Pill>
            </div>
          </Card>
        </div>

        {/* Alerts */}
        {detail.activeAlerts.length > 0 && (
          <Card>
            <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#dfa88f]" />
              <h2 className="text-sm font-semibold tracking-tight">Aktif Uyarılar</h2>
              <Pill tone="warn">{detail.activeAlerts.length}</Pill>
            </div>
            <div className="divide-y divide-[#e6e5e0]">
              {detail.activeAlerts.map((a, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-4">
                  <Pill tone="warn">{a.severity}</Pill>
                  <span className="font-mono text-[11px] text-[#807d72]">{a.type}</span>
                  <span className="text-sm flex-1">{a.message}</span>
                  <span className="text-[11px] font-mono text-[#807d72]">{fmtDate(a.since)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Daily area chart */}
        <Card>
          <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#807d72]" />
              <h2 className="text-sm font-semibold tracking-tight">Günlük Tüketim</h2>
              <Pill>{fmtPeriod(detail.currentPeriod)}</Pill>
            </div>
            <select className="h-8 px-2 rounded border border-[#e6e5e0] bg-white font-mono text-[11px]">
              {monthly.map(m => <option key={m.period}>{fmtPeriod(m.period)}</option>)}
            </select>
          </div>
          <div className="p-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily.map(r => ({ day: fmtDay(r.dayDate), gib: r.deltaPackageGb }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f54e00" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f54e00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e6e5e0" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" stroke="#a8a79e" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} tickLine={false} axisLine={{ stroke: "#e6e5e0" }} />
                <YAxis stroke="#9fbbe0" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#fffefb", border: "1px solid #e6e5e0", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => [`${fmtN(v, 2)} GB`, "Veri"]} />
                <Area type="monotone" dataKey="gib" stroke="#f54e00" strokeWidth={2} fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Monthly history with sparkline-like visual bar */}
        <Card>
          <div className="px-4 py-3 border-b border-[#e6e5e0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#807d72]" />
              <h2 className="text-sm font-semibold tracking-tight">Aylık Geçmiş</h2>
              <span className="text-[10px] text-[#807d72] font-mono">poolPlanMonthlyUsage</span>
            </div>
          </div>
          <table className="w-full text-[12px]">
            <thead className="bg-[#fafaf7]">
              <tr>
                {["Dönem", "Toplam", "Paket", "Öncelik", "Aşım", "Doluluk", "Tarama"].map((h, i) => (
                  <th key={h} className={`h-9 text-[10px] uppercase tracking-widest text-[#807d72] font-semibold ${i === 0 ? "text-left pl-4" : i === 5 ? "text-left" : "text-right"} ${i === 6 ? "pr-4" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.map(r => {
                const fill = (r.totalGb / detail.planAllowanceGB) * 100;
                return (
                  <tr key={r.period} className="border-t border-[#e6e5e0] h-11 hover:bg-[#fafaf7]">
                    <td className="pl-4 font-mono">{fmtPeriod(r.period)}</td>
                    <td className="text-right font-mono">{fmtN(r.totalGb, 1)} GB</td>
                    <td className="text-right font-mono text-[11px] text-[#807d72]">{fmtN(r.packageUsageGb, 1)}</td>
                    <td className="text-right font-mono text-[11px] text-[#807d72]">{fmtN(r.priorityGb, 1)}</td>
                    <td className="text-right font-mono text-[11px] text-[#807d72]">{fmtN(r.overageGb, 1)}</td>
                    <td className="pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[#f0efe8] rounded-sm overflow-hidden max-w-[140px]">
                          <div className="h-full bg-[#26251e]" style={{ width: `${Math.min(fill, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-[#807d72] w-10 text-right">{fmtN(fill, 0)}%</span>
                      </div>
                    </td>
                    <td className="text-right pr-4 font-mono text-[11px] text-[#807d72]">{fmtDate(r.scrapedAt).split(" ")[0]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
