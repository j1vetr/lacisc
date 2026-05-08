import "./_group.css";
import { useMemo, useState } from "react";
import { Search, ArrowRight, Sun, Moon } from "lucide-react";
import { rows, fmtGb, sourceLabel, sourceClass, type Row } from "./_mock";

export default function VariantA() {
  const [q, setQ] = useState("");
  const [dark, setDark] = useState(false);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) => r.kitNo.toLowerCase().includes(s) || r.shipName.toLowerCase().includes(s),
    );
  }, [q]);

  const totalGb = filtered.reduce((s, r) => s + r.totalGb, 0);
  const counts = {
    satcom: filtered.filter((r) => r.source === "satcom").length,
    starlink: filtered.filter((r) => r.source === "starlink").length,
    leobridge: filtered.filter((r) => r.source === "leobridge").length,
  };

  const GRID = "1fr 160px 220px";

  return (
    <div className={`kr-theme${dark ? " kr-dark" : ""}`}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div className="flex items-end justify-between gap-6 mb-8 flex-wrap">
          <div>
            <h1
              className="font-normal text-[#26251e]"
              style={{
                fontSize: 32,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              KIT Özeti
            </h1>
            <div
              className="flex items-center gap-3 kr-tnum"
              style={{
                color: "var(--kr-muted)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              <span>{filtered.length} TERMİNAL</span>
              <span style={{ color: "var(--kr-hairline-strong)" }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="kr-source-dot satcom" /> {counts.satcom} SATCOM
              </span>
              <span style={{ color: "var(--kr-hairline-strong)" }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="kr-source-dot tototheo" /> {counts.starlink} TOTOTHEO
              </span>
              <span style={{ color: "var(--kr-hairline-strong)" }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="kr-source-dot norway" /> {counts.leobridge} NORWAY
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="kr-search" style={{ width: 320 }}>
              <Search size={14} style={{ color: "var(--kr-muted)" }} />
              <input
                placeholder="KIT no veya gemi ara…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              aria-label="Tema"
              style={{
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                border: "1px solid var(--kr-hairline)",
                background: "var(--kr-surface)",
                color: "var(--kr-ink)",
                cursor: "pointer",
              }}
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {/* Tablo */}
        <div>
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: GRID,
              padding: "10px 4px",
              borderBottom: "1px solid var(--kr-hairline)",
            }}
          >
            <span className="kr-eyebrow">Terminal</span>
            <span className="kr-eyebrow text-right">Dönem GB</span>
            <span className="kr-eyebrow text-right">Kota</span>
          </div>

          {filtered.map((r: Row) => {
            const pct = r.planGb ? Math.min(100, (r.totalGb / r.planGb) * 100) : null;
            const warn = pct !== null && pct >= 80;
            return (
              <div
                key={`${r.source}:${r.kitNo}`}
                className="kr-row grid items-center"
                style={{
                  gridTemplateColumns: GRID,
                  padding: "14px 4px",
                  borderBottom: "1px solid var(--kr-hairline)",
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`kr-source-dot ${sourceClass(r.source)}`}
                    title={sourceLabel(r.source)}
                  />
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[14px] font-medium truncate"
                      style={{ color: "var(--kr-ink)", letterSpacing: "-0.005em" }}
                    >
                      {r.shipName}
                    </span>
                    <span
                      className="kr-mono text-[11px] truncate"
                      style={{ color: "var(--kr-muted)" }}
                    >
                      {r.kitNo}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className="kr-mono text-[14px]"
                    style={{ color: "var(--kr-ink)" }}
                  >
                    {fmtGb(r.totalGb)}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3">
                  {pct !== null ? (
                    <>
                      <div
                        className="kr-bar-track"
                        style={{ width: 110, flexShrink: 0 }}
                      >
                        <div
                          className={`kr-bar-fill ${warn ? "warn" : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className="kr-mono text-[12px] whitespace-nowrap"
                        style={{
                          color: warn ? "var(--kr-orange)" : "var(--kr-muted)",
                          minWidth: 56,
                          textAlign: "right",
                        }}
                      >
                        {r.planGb} GB
                      </span>
                    </>
                  ) : (
                    <span
                      className="text-[10px] tracking-widest uppercase"
                      style={{ color: "var(--kr-muted)" }}
                    >
                      Tarifesiz
                    </span>
                  )}
                  <ArrowRight size={14} className="kr-arrow" />
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: GRID,
              padding: "14px 4px",
              color: "var(--kr-muted)",
            }}
          >
            <span className="kr-eyebrow">Toplam</span>
            <span className="kr-mono text-[13px] text-right" style={{ color: "var(--kr-ink)" }}>
              {fmtGb(totalGb)}
            </span>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
