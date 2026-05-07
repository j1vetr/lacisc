import React from "react";
import "./_warm_nordic.css";
import { customer, activePeriodLabel, kits, totals, sparkFor, fmtGib, fmtRel } from "./_mock";
import { Ship, Radio, Anchor, Activity, Clock, ChevronRight, Waves, Compass, Wind } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

function StatCard({ label, value, icon, accent }: { label: string; value: string | React.ReactNode; icon: React.ReactNode; accent: string }) {
  return (
    <div className="wn-card p-6 flex items-start gap-4">
      <div className="p-3 rounded-2xl" style={{ backgroundColor: `${accent}20`, color: accent }}>
        {icon}
      </div>
      <div>
        <div className="text-[13px] font-semibold tracking-wide uppercase text-[#6B7275] mb-1">{label}</div>
        <div className="text-3xl font-bold tracking-tight text-[#2C3539]">{value}</div>
      </div>
    </div>
  );
}

function MiniSparkline({ data, color }: { data: number[], color: string }) {
  const chartData = data.map((v, i) => ({ value: v, index: i }));
  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['minData', 'maxData']} hide />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill={`url(#gradient-${color})`} 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function WarmNordic() {
  return (
    <div className="warm-nordic-theme flex w-full">
      {/* Sidebar */}
      <div className="w-[340px] shrink-0 border-r border-[#E8E5DC] p-6 flex flex-col h-screen sticky top-0 overflow-y-auto">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-[#4A6E7C] text-white flex items-center justify-center shadow-sm">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-[18px] text-[#2C3539] tracking-tight">Station Satcom</div>
            <div className="text-xs font-medium text-[#6B7275]">Denizcilik Operasyonları</div>
          </div>
        </div>

        <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7275] mb-4 px-2">Filo Gemileri</div>
        
        <div className="flex flex-col gap-2">
          {kits.map((kit, idx) => {
            const isSatcom = kit.source === 'satcom';
            const sourceColor = isSatcom ? 'var(--wn-satcom)' : 'var(--wn-starlink)';
            const bgLight = isSatcom ? '#E08D6E15' : '#5C889815';
            
            return (
              <div key={kit.kitNo} className={`wn-sidebar-item p-3 flex items-center gap-3 cursor-pointer ${idx === 0 ? 'active' : ''}`}>
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: bgLight, color: sourceColor }}>
                    <Ship className="w-5 h-5" />
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#F5F3ED] ${kit.online ? 'bg-[#7EAC8C]' : 'bg-[#D4A373]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] text-[#2C3539] truncate">{kit.shipName}</div>
                  <div className="text-[13px] text-[#6B7275] flex items-center gap-1.5 mt-0.5">
                    <span className="font-medium px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-wider" style={{ backgroundColor: bgLight, color: sourceColor }}>
                      {kit.source}
                    </span>
                    <span className="truncate">{kit.kitNo}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-[14px] text-[#2C3539]">{fmtGib(kit.currentPeriodGib)}</div>
                  <div className="text-[11px] text-[#6B7275]">GB</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 max-w-[1100px]">
        {/* Header */}
        <div className="flex justify-between items-end mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4A373] text-white text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
              <Clock className="w-3.5 h-3.5" />
              {activePeriodLabel} — Aktif Dönem
            </div>
            <h1 className="text-4xl font-bold text-[#2C3539] tracking-tight">Hoş geldiniz, {customer.name}</h1>
            <p className="text-[16px] text-[#6B7275] mt-2 font-medium">Filo genelinde veri tüketimi ve canlı durum özeti.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-5 py-2.5 rounded-xl bg-white border border-[#E8E5DC] text-[#2C3539] font-semibold text-sm hover:bg-[#F0EEE5] transition-colors shadow-sm">
              Rapor İndir
            </button>
            <button className="px-5 py-2.5 rounded-xl bg-[#4A6E7C] text-white font-semibold text-sm hover:bg-[#3A5A68] transition-colors shadow-sm">
              Tüm Gemiler
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-6 mb-12">
          <StatCard 
            label="Toplam Gemi" 
            value={totals.totalKits.toString()} 
            icon={<Anchor className="w-6 h-6" />}
            accent="#4A6E7C"
          />
          <StatCard 
            label="Dönem Veri Tüketimi" 
            value={<span>{fmtGib(totals.totalGib)} <span className="text-lg text-[#6B7275] font-semibold">GB</span></span>} 
            icon={<Waves className="w-6 h-6" />}
            accent="#5C8898"
          />
          <StatCard 
            label="Çevrimiçi Durum" 
            value={<span className="text-[#7EAC8C]">{totals.online} <span className="text-lg text-[#6B7275] font-semibold">/ {totals.totalKits}</span></span>} 
            icon={<Radio className="w-6 h-6" />}
            accent="#7EAC8C"
          />
        </div>

        {/* Ship List */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#2C3539] flex items-center gap-2">
            <Ship className="w-6 h-6 text-[#D4A373]" />
            Terminal Durumları
          </h2>
        </div>

        <div className="grid gap-4">
          {kits.map((kit) => {
            const isSatcom = kit.source === 'satcom';
            const sourceColor = isSatcom ? 'var(--wn-satcom)' : 'var(--wn-starlink)';
            const bgLight = isSatcom ? '#E08D6E15' : '#5C889815';
            
            return (
              <div key={kit.kitNo} className="wn-card p-5 flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-5 w-[300px]">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-[20px] flex items-center justify-center" style={{ backgroundColor: bgLight, color: sourceColor }}>
                      <Ship className="w-6 h-6" />
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${kit.online ? 'bg-[#7EAC8C]' : 'bg-[#D4A373]'}`} />
                  </div>
                  <div>
                    <div className="font-bold text-[18px] text-[#2C3539] mb-1">{kit.shipName}</div>
                    <div className="text-[13px] text-[#6B7275] font-medium">{kit.kitNo}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-[150px]">
                  <div className="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider" style={{ backgroundColor: bgLight, color: sourceColor }}>
                    {kit.source}
                  </div>
                  {kit.alerts && kit.alerts > 0 ? (
                    <div className="px-2.5 py-1 rounded-lg bg-[#D4A373] text-white text-[11px] font-bold uppercase tracking-wider">
                      {kit.alerts} Uyarı
                    </div>
                  ) : null}
                </div>

                <div className="w-[120px]">
                  <MiniSparkline data={sparkFor(kit)} color={sourceColor} />
                </div>

                <div className="w-[120px] text-right">
                  <div className="font-bold text-[18px] text-[#2C3539]">{fmtGib(kit.currentPeriodGib)} <span className="text-[13px] text-[#6B7275] font-semibold">GB</span></div>
                </div>

                <div className="w-[120px] text-right text-[13px] text-[#6B7275] font-medium">
                  {fmtRel(kit.lastUpdate)}
                </div>

                <div className="w-10 flex justify-end">
                  <div className="w-8 h-8 rounded-full bg-[#F5F3ED] flex items-center justify-center text-[#6B7275] group-hover:bg-[#4A6E7C] group-hover:text-white transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
