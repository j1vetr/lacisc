import React from "react";
import "./_editorial.css";
import { customer, activePeriodLabel, kits, totals, sparkFor, fmtGib, fmtRel, CustomerKit } from "./_mock";
import { ArrowRight, ChevronRight, Ship } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, Tooltip
} from "recharts";

export default function Editorial() {
  const sortedKits = [...kits].sort((a, b) => b.currentPeriodGib - a.currentPeriodGib);
  const topConsumer = sortedKits[0];

  return (
    <div className="editorial-theme flex w-full">
      
      {/* Left Sidebar (Table of Contents) */}
      <aside className="w-[340px] shrink-0 hairline-right min-h-screen sticky top-0 h-screen flex flex-col py-10 px-8">
        <div className="mb-14">
          <h2 className="font-serif text-3xl italic tracking-tight text-[var(--text-ink)] leading-none">Station</h2>
          <div className="text-[10px] tracking-[0.2em] uppercase mt-2 text-[var(--text-ink-light)] font-medium">Satcom &bull; Denizcilik</div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
          <div className="text-[10px] tracking-widest uppercase mb-6 text-[var(--text-ink-lighter)] hairline-bottom pb-3 font-medium">İçindekiler / Filo</div>
          
          <ul className="space-y-1">
            {sortedKits.map((kit, i) => (
              <li key={kit.kitNo} className="group relative">
                <button className="w-full text-left py-3 flex items-start justify-between transition-colors hover:bg-[var(--bg-cream-alt)] -mx-3 px-3 rounded-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-serif text-lg text-[var(--text-ink)] group-hover:text-[var(--accent-rust)] transition-colors flex items-center gap-2">
                      {kit.shipName}
                      <span className={`w-1.5 h-1.5 rounded-full ${kit.online ? 'bg-[var(--text-ink)]' : 'bg-transparent border border-[var(--text-ink-light)]'}`} />
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-ink-lighter)] tracking-wider">
                      {kit.kitNo} &middot; {kit.source === 'satcom' ? 'SATCOM' : 'STARLINK'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[13px] text-[var(--text-ink-light)]">
                      {fmtGib(kit.currentPeriodGib)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 pt-6 hairline-top">
          <div className="text-[11px] text-[var(--text-ink-lighter)] leading-relaxed">
            {activePeriodLabel} &mdash; Toplam <span className="font-mono">{totals.totalKits}</span> gemi, <span className="font-mono">{totals.online}</span> çevrimiçi. Toplam tüketim: <span className="font-mono">{fmtGib(totals.totalGib)} GB</span>.
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 py-12 px-16 max-w-[1000px]">
        {/* Header */}
        <header className="mb-20">
          <div className="flex justify-between items-end mb-6 hairline-bottom pb-6">
            <div>
              <div className="text-[11px] tracking-widest uppercase text-[var(--text-ink-lighter)] mb-4">Aylık Rapor &mdash; {activePeriodLabel}</div>
              <h1 className="font-serif text-5xl md:text-6xl text-[var(--text-ink)] leading-[1.1] tracking-tight max-w-2xl">
                Hoş geldiniz, {customer.name}.
              </h1>
            </div>
            <div className="text-right pb-2">
              <div className="font-serif italic text-2xl text-[var(--text-ink-light)] mb-1">
                {activePeriodLabel} Aktif Dönem
              </div>
              <div className="font-mono text-xs text-[var(--text-ink-lighter)]">
                Son Güncelleme: Bugün
              </div>
            </div>
          </div>

          {/* Abstract / Summary */}
          <div className="grid grid-cols-3 gap-12 pt-4">
            <div className="col-span-2">
              <p className="text-[15px] leading-relaxed text-[var(--text-ink-light)] first-letter:float-left first-letter:font-serif first-letter:text-6xl first-letter:pr-3 first-letter:pt-1 first-letter:text-[var(--text-ink)]">
                Bu ayki operasyonlarda toplam <strong className="font-medium text-[var(--text-ink)]">{totals.totalKits}</strong> terminal aktif olarak görev yaptı. Filo genelinde şu an <strong className="font-medium text-[var(--text-ink)]">{totals.online}</strong> gemi ile kesintisiz bağlantı sürdürülürken, toplam veri tüketimi <strong className="font-mono text-sm">{fmtGib(totals.totalGib)} GB</strong> seviyesine ulaştı. 
              </p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-ink-lighter)] mb-2">Ağ Dağılımı</div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-serif text-lg" style={{ color: 'var(--accent-rust)' }}>Satcom</span>
                  <span className="font-mono text-sm">{totals.satcomKits}</span>
                </div>
                <div className="hairline-bottom" />
                <div className="flex justify-between items-center">
                  <span className="font-serif text-lg" style={{ color: 'var(--accent-blue)' }}>Starlink</span>
                  <span className="font-mono text-sm">{totals.starlinkKits}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Highlight Section (Top Consumer) */}
        {topConsumer && (
          <section className="mb-24">
             <div className="p-10 hairline-all bg-white/40 relative">
               <div className="absolute top-0 left-0 w-full h-1 bg-[var(--text-ink)]" />
               <div className="flex items-center gap-3 mb-6">
                 <div className="w-2 h-2 rounded-full bg-[var(--accent-rust)]" />
                 <span className="text-[10px] uppercase tracking-widest text-[var(--text-ink-light)]">Ayın Öne Çıkanı</span>
               </div>
               
               <div className="grid grid-cols-2 gap-12 items-center">
                 <div>
                   <h3 className="font-serif text-4xl mb-2">{topConsumer.shipName}</h3>
                   <div className="font-mono text-xs text-[var(--text-ink-lighter)] mb-6">
                     {topConsumer.kitNo}
                   </div>
                   <p className="text-[14px] leading-relaxed text-[var(--text-ink-light)] mb-8">
                     Bu dönem en yüksek veri tüketimine sahip olan gemimiz, toplam <strong className="font-mono text-xs text-[var(--text-ink)]">{fmtGib(topConsumer.currentPeriodGib)} GB</strong> ile operasyonlarını sürdürüyor.
                   </p>
                   <button className="group flex items-center gap-3 text-[11px] uppercase tracking-widest font-medium hover:text-[var(--accent-rust)] transition-colors">
                     Detayları İncele
                     <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                   </button>
                 </div>
                 
                 <div className="h-48 hairline-left pl-12 flex flex-col justify-center">
                   <div className="text-[10px] uppercase tracking-widest text-[var(--text-ink-lighter)] mb-4">Son 14 Gün Tüketim Trendi</div>
                   <div className="flex-1 w-full relative">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkFor(topConsumer).map((val, i) => ({ day: i, val }))}>
                          <defs>
                            <linearGradient id="colorValTop" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--accent-rust)" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="var(--accent-rust)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Tooltip 
                            contentStyle={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 0, padding: '8px 12px' }}
                            itemStyle={{ color: 'var(--text-ink)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                            labelStyle={{ display: 'none' }}
                            formatter={(value: number) => [`${fmtGib(value)} GB`, 'Tüketim']}
                          />
                          <Area type="monotone" dataKey="val" stroke="var(--accent-rust)" strokeWidth={1.5} fill="url(#colorValTop)" />
                        </AreaChart>
                     </ResponsiveContainer>
                   </div>
                 </div>
               </div>
             </div>
          </section>
        )}

        {/* Fleet Grid */}
        <section>
          <div className="flex items-center justify-between mb-8 hairline-bottom pb-4">
            <h2 className="font-serif text-3xl">Tüm Gemiler</h2>
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-ink-lighter)]">Sıralama: Tüketim</span>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-12">
            {sortedKits.map((kit) => (
              <div key={kit.kitNo} className="group cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-serif text-2xl group-hover:text-[var(--accent-rust)] transition-colors flex items-center gap-3">
                      {kit.shipName}
                      {!kit.online && <span className="text-[10px] font-sans tracking-widest uppercase text-[var(--accent-rust)] font-semibold border border-[var(--accent-rust)] px-1.5 py-0.5 rounded-sm">Çevrimdışı</span>}
                      {kit.alerts && kit.alerts > 0 ? (
                         <span className="text-[10px] font-sans tracking-widest uppercase bg-[var(--text-ink)] text-[var(--bg-cream)] px-1.5 py-0.5 rounded-sm">
                           {kit.alerts} Uyarı
                         </span>
                      ) : null}
                    </h3>
                    <div className="font-mono text-xs text-[var(--text-ink-lighter)] mt-1 flex items-center gap-3">
                      <span>{kit.kitNo}</span>
                      <span className="w-px h-3 bg-[var(--text-ink-lighter)] opacity-30" />
                      <span style={{ color: kit.source === 'satcom' ? 'var(--accent-rust)' : 'var(--accent-blue)' }}>
                        {kit.source.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg">{fmtGib(kit.currentPeriodGib)}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-ink-lighter)] mt-1">GB</div>
                  </div>
                </div>

                <div className="h-12 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkFor(kit).map((val, i) => ({ day: i, val }))}>
                      <Area 
                        type="step" 
                        dataKey="val" 
                        stroke={kit.source === 'satcom' ? 'var(--accent-rust)' : 'var(--accent-blue)'} 
                        strokeWidth={1} 
                        fill="none" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 text-[10px] text-[var(--text-ink-lighter)] flex justify-between">
                  <span>Son iletişim: {fmtRel(kit.lastUpdate)}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-medium text-[var(--text-ink)] uppercase tracking-widest">
                    İncele <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
