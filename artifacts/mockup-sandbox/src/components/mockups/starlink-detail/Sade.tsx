import "./_group.css";
import { detail, monthly, daily, fmtN, fmtPeriod, fmtDay, fmtDate } from "./_mock";
import {
  ArrowLeft, Satellite, HardDrive, CalendarClock, CheckCircle2, Activity, Wifi,
  AlertTriangle, MapPin, Gauge, Globe, Signal, Zap, Calendar,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#e6e5e0] bg-[#fafaf7] p-3">
      <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-[13px] text-[#26251e] truncate">{value}</div>
    </div>
  );
}

function Card({ children, className = "" }: any) {
  return <div className={`rounded-xl border border-[#e6e5e0] bg-white ${className}`}>{children}</div>;
}

function Badge({ children, className = "" }: any) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-widest ${className}`}>
      {children}
    </span>
  );
}

export default function Sade() {
  const usedPct = (detail.currentPeriodTotalGb / detail.planAllowanceGB) * 100;
  return (
    <div className="starlink-theme">
      <div className="max-w-[1180px] mx-auto px-8 py-10 space-y-10">
        {/* Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 text-xs text-[#807d72] cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" />
            Tüm terminaller
          </div>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-white border border-[#e6e5e0]">
              <Satellite className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[32px] leading-[1.1] font-mono tracking-tight">{detail.kitSerialNumber}</h1>
                <Badge className="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]">Tototheo</Badge>
                {detail.optIn && <Badge className="bg-[#fafaf7] text-[#807d72] border-[#e6e5e0]">Opt-In</Badge>}
              </div>
              <p className="text-base text-[#807d72] mt-1">
                {detail.nickname} · <span className="text-[#26251e]">{detail.plan}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Live status */}
        <Card>
          <div className="px-6 pt-5 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg tracking-tight">Canlı Durum</h2>
              <p className="text-sm text-[#807d72] mt-0.5">Tototheo portalından son alınan telemetri.</p>
            </div>
            <Badge className="bg-[#9fc9a2]/30 text-[#26251e] border-[#9fc9a2]">
              <Wifi className="w-3 h-3" /> Çevrimiçi
            </Badge>
          </div>
          <div className="px-6 pb-6 grid grid-cols-4 gap-3">
            <Stat label="Sinyal" value={`${detail.signalQuality * 100}%`} icon={<Gauge className="w-3.5 h-3.5" />} />
            <Stat label="Gecikme" value={`${detail.latency} ms`} icon={<Activity className="w-3.5 h-3.5" />} />
            <Stat label="İndirme" value={`${fmtN(detail.downloadSpeed, 1)} Mbps`} />
            <Stat label="Yükleme" value={`${fmtN(detail.uploadSpeed, 1)} Mbps`} />
            <Stat label="Engellenme" value={`${fmtN(detail.obstruction * 100, 2)}%`} />
            <Stat label="Ping Drop" value={`${fmtN(detail.pingDropRate * 100, 2)}%`} />
            <Stat label="Konum" value={`${detail.lat.toFixed(2)}, ${detail.lng.toFixed(2)}`} icon={<MapPin className="w-3.5 h-3.5" />} />
            <Stat label="Son Görülme" value={fmtDate(detail.lastFix)} />
          </div>
        </Card>

        {/* Plan & Quota — yeni */}
        <Card>
          <div className="px-6 pt-5 pb-4">
            <h2 className="text-lg tracking-tight">Plan ve Kota</h2>
            <p className="text-sm text-[#807d72] mt-0.5">Aktif dönem ({fmtPeriod(detail.currentPeriod)}) için paket kullanımı.</p>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Kullanılan</div>
                <div className="font-mono text-3xl mt-1">{fmtN(detail.currentPeriodTotalGb, 2)} <span className="text-sm text-[#807d72]">GB</span></div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[#807d72] font-semibold">Paket Tahsisi</div>
                <div className="font-mono text-2xl mt-1 text-[#807d72]">{fmtN(detail.planAllowanceGB, 0)} <span className="text-sm">GB</span></div>
              </div>
            </div>
            <div className="h-2 bg-[#f0efe8] rounded-full overflow-hidden">
              <div className="h-full bg-[#26251e]" style={{ width: `${Math.min(usedPct, 100)}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-[#807d72] font-mono">
              <span>{fmtN(usedPct, 1)}% kullanıldı</span>
              <span>{fmtN(detail.planAllowanceGB - detail.currentPeriodTotalGb, 0)} GB kalan</span>
            </div>
          </div>
        </Card>

        {/* Period KPIs */}
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#807d72]">Aktif Dönem</span>
              <CalendarClock className="w-4 h-4 text-[#807d72]" />
            </div>
            <div className="px-5 pb-5 text-2xl font-mono">{fmtPeriod(detail.currentPeriod)}</div>
          </Card>
          <Card>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#807d72]">Dönem Veri</span>
              <HardDrive className="w-4 h-4 text-[#807d72]" />
            </div>
            <div className="px-5 pb-5 flex items-baseline gap-2">
              <span className="text-2xl font-mono">{fmtN(detail.currentPeriodTotalGb, 2)}</span>
              <span className="text-sm text-[#807d72]">GB</span>
            </div>
          </Card>
          <Card>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#807d72]">Son Senkronizasyon</span>
              <CheckCircle2 className="w-4 h-4 text-[#807d72]" />
            </div>
            <div className="px-5 pb-5 text-sm font-mono">{fmtDate(detail.updatedAt)}</div>
          </Card>
        </div>

        {/* Alerts (yeni, sadece varsa) */}
        {detail.activeAlerts.length > 0 && (
          <Card>
            <div className="px-6 pt-5 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg tracking-tight flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#dfa88f]" />
                  Aktif Uyarılar ({detail.activeAlerts.length})
                </h2>
                <p className="text-sm text-[#807d72] mt-0.5">Tototheo portalından gelen aktif alarm akışı.</p>
              </div>
            </div>
            <div className="px-6 pb-6 space-y-2">
              {detail.activeAlerts.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-[#e6e5e0] bg-[#fafaf7]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#dfa88f] mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{a.message}</div>
                    <div className="text-[11px] font-mono text-[#807d72] mt-1">
                      {a.type} · {fmtDate(a.since)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Daily breakdown */}
        <Card>
          <div className="px-6 pt-5 pb-4 flex items-start justify-between">
            <div>
              <h2 className="text-lg tracking-tight">Günlük Tüketim</h2>
              <p className="text-sm text-[#807d72] mt-0.5">
                {fmtPeriod(detail.currentPeriod)} dönemi içinde gün gün veri tüketimi (GB).
              </p>
            </div>
            <select className="h-9 px-3 rounded-lg border border-[#e6e5e0] bg-white font-mono text-[12px]">
              {monthly.map(m => <option key={m.period}>{fmtPeriod(m.period)}</option>)}
            </select>
          </div>
          <div className="px-6 pb-6 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily.map(r => ({ day: fmtDay(r.dayDate), gib: r.deltaPackageGb }))} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e6e5e0" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" stroke="#a8a79e" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} tickLine={false} axisLine={{ stroke: "#e6e5e0" }} />
                <YAxis stroke="#9fbbe0" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#fffefb", border: "1px solid #e6e5e0", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${fmtN(v, 2)} GB`, "Veri"]} />
                <Bar dataKey="gib" fill="#9fbbe0" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Monthly summary */}
        <Card>
          <div className="px-6 pt-5 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg tracking-tight">Aylık Özet</h2>
              <p className="text-sm text-[#807d72] mt-0.5">Tototheo "poolPlanMonthlyUsage" verisinden — her dönem için toplam.</p>
            </div>
            <Activity className="w-4 h-4 text-[#807d72]" />
          </div>
          <div className="px-2 pb-2">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafaf7]">
                <tr>
                  {["Dönem", "Toplam GB", "Paket", "Öncelik", "Aşım", "Tarama"].map((h, i) => (
                    <th key={h} className={`h-10 text-[10px] uppercase tracking-widest text-[#807d72] font-semibold ${i === 0 ? "text-left pl-4" : "text-right"} ${i === 5 ? "pr-4" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map(r => (
                  <tr key={r.period} className="border-t border-[#e6e5e0] h-11 hover:bg-[#fafaf7]">
                    <td className="pl-4 font-mono text-[12px]">{fmtPeriod(r.period)}</td>
                    <td className="text-right font-mono text-[12px]">{fmtN(r.totalGb, 2)}</td>
                    <td className="text-right font-mono text-[11px] text-[#807d72]">{fmtN(r.packageUsageGb, 2)}</td>
                    <td className="text-right font-mono text-[11px] text-[#807d72]">{fmtN(r.priorityGb, 2)}</td>
                    <td className="text-right font-mono text-[11px] text-[#807d72]">{fmtN(r.overageGb, 2)}</td>
                    <td className="text-right pr-4 font-mono text-[11px] text-[#807d72]">{fmtDate(r.scrapedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Network identity (yeni, footer card) */}
        <Card>
          <div className="px-6 pt-5 pb-4">
            <h2 className="text-lg tracking-tight">Terminal Kimliği</h2>
            <p className="text-sm text-[#807d72] mt-0.5">Tototheo kayıt bilgileri.</p>
          </div>
          <div className="px-6 pb-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="flex justify-between border-b border-[#e6e5e0] pb-2">
              <span className="text-[#807d72]">Servis Hattı</span>
              <span className="font-mono">{detail.serviceLineNumber}</span>
            </div>
            <div className="flex justify-between border-b border-[#e6e5e0] pb-2">
              <span className="text-[#807d72]">Terminal ID</span>
              <span className="font-mono text-xs">{detail.userTerminalId}</span>
            </div>
            <div className="flex justify-between border-b border-[#e6e5e0] pb-2">
              <span className="text-[#807d72]">IPv4</span>
              <span className="font-mono">{detail.ipv4}</span>
            </div>
            <div className="flex justify-between border-b border-[#e6e5e0] pb-2">
              <span className="text-[#807d72]">Aktivasyon</span>
              <span className="font-mono">{fmtDate(detail.activated).split(" ")[0]}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
