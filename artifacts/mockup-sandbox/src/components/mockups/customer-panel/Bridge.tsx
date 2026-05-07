import "./_bridge.css";
import React, { useMemo } from "react";
import { customer, activePeriodLabel, kits, totals, sparkFor, fmtGib, fmtRel } from "./_mock";
import {
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  Server,
  Gauge,
  Clock,
  MonitorDot,
  Crosshair
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from "recharts";

const StatBox = ({ label, value, unit, glowColor = "" }: any) => (
  <div className="flex flex-col border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 relative overflow-hidden group">
    <div className={`absolute top-0 right-0 w-24 h-24 bg-[var(${glowColor})] blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-2">{label}</span>
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-mono text-[var(--text-bright)] tracking-tight">{value}</span>
      {unit && <span className="text-sm font-mono text-[var(--text-muted)]">{unit}</span>}
    </div>
  </div>
);

export default function Bridge() {
  const sortedKits = useMemo(() => {
    return [...kits].sort((a, b) => {
      if (a.alerts !== b.alerts) return (b.alerts || 0) - (a.alerts || 0);
      if (a.online !== b.online) return a.online ? -1 : 1;
      return b.currentPeriodGib - a.currentPeriodGib;
    });
  }, []);

  return (
    <div className="bridge-theme flex h-screen w-full overflow-hidden selection:bg-[var(--cyan-muted)] selection:text-[var(--cyan-base)] relative">
      <div className="bridge-scanline" />
      
      {/* Sidebar */}
      <aside className="w-[340px] flex-shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col z-10 relative">
        <div className="h-20 px-6 flex items-center border-b border-[var(--border-subtle)] justify-between bg-[var(--bg-base)]">
          <div className="flex items-center gap-3">
            <Crosshair className="w-5 h-5 text-[var(--text-muted)]" />
            <span className="font-mono text-sm text-[var(--text-base)] tracking-widest uppercase">MANIFEST</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--green-base)] bridge-pulse shadow-[0_0_8px_var(--green-base)]" />
            <span className="font-mono text-[11px] text-[var(--green-base)] tracking-widest">LINK OK</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {sortedKits.map(kit => {
            const isStarlink = kit.source === "starlink";
            const colorVar = isStarlink ? "--cyan-base" : "--amber-base";
            const bgVar = isStarlink ? "--cyan-muted" : "--amber-muted";
            
            return (
              <button 
                key={kit.kitNo}
                className="w-full text-left p-3.5 border border-transparent hover:border-[var(--border-strong)] hover:bg-[var(--bg-card)] transition-colors rounded-none flex flex-col gap-2.5 group relative"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-4 bg-[var(${colorVar})] opacity-80`} />
                    <span className="font-mono text-sm font-bold text-[var(--text-bright)] tracking-tight">{kit.shipName}</span>
                  </div>
                  {kit.online ? (
                    <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-bright)] transition-colors" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-[var(--red-base)]" />
                  )}
                </div>
                <div className="flex justify-between items-end pl-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{kit.kitNo}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-[2px] bg-[var(${bgVar})] text-[var(${colorVar})] font-mono text-[9px] uppercase tracking-widest`}>
                        {kit.source}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm text-[var(--text-bright)]">{fmtGib(kit.currentPeriodGib)} <span className="text-[10px] text-[var(--text-muted)]">GB</span></span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-[var(--bg-base)]">
        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] backdrop-blur-sm z-10">
          <div>
            <h1 className="font-mono text-2xl font-bold text-[var(--text-bright)] tracking-tight">OPERASYON KÖPRÜSÜ</h1>
            <p className="font-mono text-xs text-[var(--text-muted)] mt-1.5 tracking-widest uppercase">
              Opr: {customer.name} <span className="mx-2 text-[var(--border-strong)]">|</span> Prd: {activePeriodLabel} — AKTİF DÖNEM
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 border border-[var(--cyan-base)]/30 bg-[var(--cyan-muted)] flex items-center gap-2">
              <MonitorDot className="w-4 h-4 text-[var(--cyan-base)] bridge-pulse" />
              <span className="font-mono text-xs text-[var(--cyan-base)] tracking-wider">LIVE TELEMETRY</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-[1300px] mx-auto space-y-8 pb-12">
            
            {/* Top KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <StatBox label="Aktİf TERMİNAL" value={totals.totalKits} unit="KİT" glowColor="--text-strong" />
              <StatBox label="Çevrİmİçİ" value={totals.online} unit={`/ ${totals.totalKits}`} glowColor="--green-base" />
              <StatBox label="Dönem ToplamI" value={fmtGib(totals.totalGib)} unit="GB" glowColor="--cyan-base" />
              <StatBox label="Aktİf ALARM" value={kits.reduce((s, k) => s + (k.alerts||0), 0)} unit="UYARI" glowColor="--red-base" />
            </div>

            {/* Sub-viz: Top consumers this month */}
            <div className="border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--text-muted)]" />
                  <h2 className="font-mono text-sm tracking-widest text-[var(--text-base)] uppercase">Ağ Tüketİm Matrİsİ</h2>
                </div>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...kits].sort((a,b)=>b.currentPeriodGib - a.currentPeriodGib)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="shipName" stroke="var(--text-muted)" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border-subtle)' }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} tickFormatter={(v)=>`${v}G`} />
                    <Tooltip 
                      cursor={{ fill: 'var(--border-strong)' }}
                      contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '0px', fontFamily: 'JetBrains Mono', fontSize: '12px' }}
                      itemStyle={{ color: 'var(--text-bright)' }}
                    />
                    <Bar dataKey="currentPeriodGib" maxBarSize={48}>
                      {kits.map((kit, idx) => {
                        const isStarlink = kit.source === "starlink";
                        return <Cell key={`cell-${idx}`} fill={`var(${isStarlink ? '--cyan-base' : '--amber-base'})`} fillOpacity={0.85} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fleet Cards */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-mono text-sm tracking-widest text-[var(--text-base)] uppercase flex items-center gap-2">
                  <Server className="w-4 h-4" /> Filo Durum Panelİ
                </h2>
                <div className="flex items-center gap-4 text-[11px] font-mono text-[var(--text-muted)] tracking-wider">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[var(--cyan-base)] shadow-[0_0_8px_var(--cyan-base)]" /> TOTOTHEO</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[var(--amber-base)] shadow-[0_0_8px_var(--amber-base)]" /> SATCOM</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {sortedKits.map(kit => {
                  const isStarlink = kit.source === "starlink";
                  const colorVar = isStarlink ? "--cyan-base" : "--amber-base";
                  const sparkData = sparkFor(kit).map((v, i) => ({ day: i, val: v }));

                  return (
                    <div key={kit.kitNo} className="border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] transition-all duration-300 group cursor-pointer relative flex flex-col min-h-[160px]">
                      {kit.alerts ? (
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--red-base)] blur-[60px] opacity-[0.15] pointer-events-none group-hover:opacity-30 transition-opacity" />
                      ) : null}
                      
                      <div className="p-5 flex justify-between items-start border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] z-10">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-mono text-xl font-bold text-[var(--text-bright)] tracking-tight">{kit.shipName}</h3>
                            {kit.online ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--green-base)] uppercase tracking-wider px-2 py-0.5 border border-[var(--green-base)]/30 bg-[var(--green-base)]/10">
                                <span className="w-1.5 h-1.5 bg-[var(--green-base)] bridge-pulse" /> ONL
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider px-2 py-0.5 border border-[var(--border-strong)] bg-black/20">
                                <WifiOff className="w-3 h-3" /> OFFLINE
                              </span>
                            )}
                            {kit.alerts ? (
                              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--red-base)] uppercase tracking-wider px-2 py-0.5 border border-[var(--red-base)]/30 bg-[var(--red-base)]/10">
                                <AlertTriangle className="w-3 h-3" /> {kit.alerts} UYARI
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-[11px] text-[var(--text-muted)]">{kit.kitNo}</span>
                            <span className="text-[var(--border-subtle)]">|</span>
                            <span className={`font-mono text-[11px] uppercase tracking-widest text-[var(${colorVar})]`}>
                              {kit.source}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-2xl text-[var(--text-bright)] tracking-tight leading-none">
                            {fmtGib(kit.currentPeriodGib)} <span className="text-sm text-[var(--text-muted)] font-normal">GB</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 flex z-10">
                        <div className="w-1/3 p-4 border-r border-[var(--border-subtle)] flex flex-col justify-center space-y-4">
                          <div>
                            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5"><Clock className="w-3 h-3"/> SON GÜNCEL.</div>
                            <div className="text-sm font-mono text-[var(--text-base)]">{fmtRel(kit.lastUpdate)}</div>
                          </div>
                          {kit.signal !== undefined && (
                            <div>
                              <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-1 flex items-center gap-1.5"><Gauge className="w-3 h-3"/> SİNYAL KALİTESİ</div>
                              <div className="text-sm font-mono text-[var(--text-bright)]">{(kit.signal * 100).toFixed(0)}%</div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 p-4 flex flex-col">
                          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase mb-2 flex items-center gap-1.5"><Activity className="w-3 h-3"/> 14 GÜN TREND</div>
                          <div className="flex-1 h-full w-full min-h-[60px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={sparkData}>
                                <defs>
                                  <linearGradient id={`grad-${kit.kitNo}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={`var(${colorVar})`} stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor={`var(${colorVar})`} stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <Area 
                                  type="monotone" 
                                  dataKey="val" 
                                  stroke={`var(${colorVar})`} 
                                  fillOpacity={1} 
                                  fill={`url(#grad-${kit.kitNo})`} 
                                  strokeWidth={2}
                                  isAnimationActive={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 0px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
      `}} />
    </div>
  );
}
