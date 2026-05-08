import "./_group.css";
import { useMemo, useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { rows, fmtGb, relTime, sourceLabel, sourceClass, type Row } from "./_mock";

export default function VariantA() {
  const [q, setQ] = useState("");
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

  return (
    <div className="kr-theme">
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 32px" }}>
        {/* Header — tek satır: başlık + sayım soldan, arama sağdan */}
        <div className="flex items-end justify-between gap-6 mb-8 flex-wrap">
          <div>
            <h1
              className="font-normal text-[#26251e]"
              style={{
                fontSize: 32,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: 6,
              }}
            >
              KIT Özeti
            </h1>
            <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--kr-muted)" }}>
              <span className="kr-tnum">{filtered.length} terminal</span>
              <span style={{ color: "var(--kr-hairline-strong)" }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="kr-source-dot satcom" /> {counts.satcom} Satcom
              </span>
              <span style={{ color: "var(--kr-hairline-strong)" }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="kr-source-dot tototheo" /> {counts.starlink} Tototheo
              </span>
              <span style={{ color: "var(--kr-hairline-strong)" }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="kr-source-dot norway" /> {counts.leobridge} Norway
              </span>
            </div>
          </div>

          <div className="kr-search" style={{ width: 320 }}>
            <Search size={14} style={{ color: "var(--kr-muted)" }} />
            <input
              placeholder="KIT no veya gemi ara…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Tablo — başlıklar tek satır, eyebrow tarzı, ince */}
        <div>
          {/* Hairline header */}
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: "1fr 160px 200px",
              padding: "10px 4px",
              borderBottom: "1px solid var(--kr-hairline)",
            }}
          >
            <span className="kr-eyebrow">Terminal</span>
            <span className="kr-eyebrow text-right">Dönem · GB</span>
            <span className="kr-eyebrow text-right">Son Güncelleme</span>
          </div>

          {filtered.map((r: Row) => (
            <div
              key={`${r.source}:${r.kitNo}`}
              className="kr-row grid items-center"
              style={{
                gridTemplateColumns: "1fr 160px 200px",
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

          {/* Footer — sade toplam */}
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: "1fr 160px 200px",
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
