import "./_group.css";
import { useMemo, useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { rows, fmtGb, relTime, sourceLabel, sourceClass, type Row } from "./_mock";

export default function VariantB() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) => r.kitNo.toLowerCase().includes(s) || r.shipName.toLowerCase().includes(s),
    );
  }, [q]);

  const counts = {
    total: filtered.length,
    satcom: filtered.filter((r) => r.source === "satcom").length,
    starlink: filtered.filter((r) => r.source === "starlink").length,
    leobridge: filtered.filter((r) => r.source === "leobridge").length,
  };

  return (
    <div className="kr-theme">
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 32px" }}>
        {/* Eyebrow stat şeridi — başlık yerine zayıf bilgi şeridi */}
        <div className="flex items-end justify-between gap-6 mb-6 flex-wrap">
          <div className="flex items-center gap-10">
            <Stat label="Toplam" value={counts.total.toString()} />
            <Stat label="Satcom" value={counts.satcom.toString()} accent="satcom" />
            <Stat label="Tototheo" value={counts.starlink.toString()} accent="tototheo" />
            <Stat label="Norway" value={counts.leobridge.toString()} accent="norway" />
          </div>

          <div className="kr-search" style={{ width: 300 }}>
            <Search size={14} style={{ color: "var(--kr-muted)" }} />
            <input
              placeholder="KIT no veya gemi ara…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Tablo — kart + başlıksız, sadece eyebrow alt-çizgi */}
        <div className="kr-card" style={{ padding: "8px 0" }}>
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: "minmax(260px, 1.4fr) minmax(220px, 1fr) 180px",
              padding: "12px 24px 10px",
              borderBottom: "1px solid var(--kr-hairline)",
            }}
          >
            <span className="kr-eyebrow">Terminal</span>
            <span className="kr-eyebrow">Kullanım — Dönem GB</span>
            <span className="kr-eyebrow text-right">Aktivite</span>
          </div>

          {filtered.map((r: Row, i) => (
            <div
              key={`${r.source}:${r.kitNo}`}
              className="kr-row grid items-center"
              style={{
                gridTemplateColumns: "minmax(260px, 1.4fr) minmax(220px, 1fr) 180px",
                padding: "16px 24px",
                borderBottom: i === filtered.length - 1 ? "none" : "1px solid var(--kr-hairline)",
              }}
            >
              {/* Terminal: gemi adı büyük, altında KIT + source pill */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span
                  className="text-[14px] font-medium truncate"
                  style={{ color: "var(--kr-ink)", letterSpacing: "-0.005em" }}
                >
                  {r.shipName}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`kr-pill ${sourceClass(r.source)}`}>
                    {sourceLabel(r.source)}
                  </span>
                  <span
                    className="kr-mono text-[11px] truncate"
                    style={{ color: "var(--kr-muted)" }}
                  >
                    {r.kitNo}
                  </span>
                </div>
              </div>

              {/* Kullanım: sayı + plan varsa ince bar */}
              <div className="flex flex-col gap-2 pr-8">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className="kr-mono text-[15px]"
                    style={{ color: "var(--kr-ink)" }}
                  >
                    {fmtGb(r.totalGb)}
                  </span>
                  {r.planGb ? (
                    <span
                      className="kr-mono text-[11px]"
                      style={{ color: "var(--kr-muted)" }}
                    >
                      / {r.planGb} GB
                    </span>
                  ) : (
                    <span
                      className="text-[10px] uppercase tracking-widest"
                      style={{ color: "var(--kr-muted)" }}
                    >
                      Tarifesiz
                    </span>
                  )}
                </div>
                {r.planGb ? (
                  <div className="kr-bar-track">
                    <div
                      className={`kr-bar-fill ${
                        (r.totalGb / r.planGb) * 100 >= 80 ? "warn" : ""
                      }`}
                      style={{
                        width: `${Math.min(100, (r.totalGb / r.planGb) * 100)}%`,
                      }}
                    />
                  </div>
                ) : (
                  <div className="kr-bar-track" style={{ opacity: 0.4 }}>
                    <div className="kr-bar-fill" style={{ width: "0%" }} />
                  </div>
                )}
              </div>

              {/* Aktivite: status dot + relatif zaman + arrow */}
              <div className="flex items-center justify-end gap-3">
                <span className={`kr-status-dot ${r.signal}`} />
                <span
                  className="kr-mono text-[12px]"
                  style={{ color: "var(--kr-muted)" }}
                >
                  {relTime(r.lastSeenMin)}
                </span>
                <ArrowRight size={14} className="kr-arrow" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "satcom" | "tototheo" | "norway";
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {accent ? <span className={`kr-source-dot ${accent}`} /> : null}
        <span className="kr-eyebrow">{label}</span>
      </div>
      <span
        className="kr-mono text-[24px]"
        style={{ color: "var(--kr-ink)", letterSpacing: "-0.02em" }}
      >
        {value}
      </span>
    </div>
  );
}
