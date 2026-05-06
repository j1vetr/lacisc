export function LacivertOperasyon() {
  const sample = {
    shipLabel: "M/V Yılmazlar Balıkçılık",
    kitNo: "KITP00409812",
    credentialLabel: "yilmazlarBalik",
    periodLabel: "2026-05",
    totalGib: 612.4,
    totalUsd: 1837.2,
    crossedStep: 600,
  };

  const FONT =
    "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const MONO =
    "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1c",
        padding: "32px 16px",
        fontFamily: FONT,
      }}
    >
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width={600}
        style={{
          width: "100%",
          maxWidth: 600,
          margin: "0 auto",
          background: "#0f172a",
          border: "1px solid #1e2a44",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "16px 28px",
                background: "#0a1024",
                borderBottom: "1px solid #1e2a44",
              }}
            >
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        color: "#7dd3fc",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                      }}
                    >
                      ◆ LACIVERT.SC / SATCOM
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontFamily: MONO,
                        fontSize: 11,
                        color: "#64748b",
                        letterSpacing: "0.06em",
                      }}
                    >
                      ALERT-{sample.kitNo.slice(-6)} ·{" "}
                      {sample.periodLabel.replace("-", "")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "28px 28px 0 28px" }}>
              <table role="presentation" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "4px 10px",
                        background: "rgba(245, 78, 0, 0.12)",
                        border: "1px solid rgba(245, 78, 0, 0.4)",
                        borderRadius: 4,
                        fontFamily: MONO,
                        fontSize: 11,
                        color: "#fb923c",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      ⚠ THRESHOLD CROSSED
                    </td>
                  </tr>
                </tbody>
              </table>

              <h1
                style={{
                  margin: "18px 0 4px 0",
                  fontSize: 22,
                  lineHeight: 1.3,
                  color: "#f1f5f9",
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                }}
              >
                {sample.shipLabel}
              </h1>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: "#64748b",
                  letterSpacing: "0.04em",
                }}
              >
                {sample.kitNo} · {sample.credentialLabel}
              </div>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "28px 28px 8px 28px" }}>
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                style={{
                  background:
                    "radial-gradient(circle at 20% 50%, rgba(245,78,0,0.18) 0%, transparent 60%), #0a1024",
                  border: "1px solid #1e2a44",
                  borderRadius: 8,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "26px 28px" }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: "#7dd3fc",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                        }}
                      >
                        AKTIF DÖNEM TÜKETIM
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          fontFamily: MONO,
                          fontSize: 52,
                          color: "#f97316",
                          fontWeight: 600,
                          letterSpacing: "-0.03em",
                          lineHeight: 1,
                          textShadow: "0 0 30px rgba(249,115,22,0.35)",
                        }}
                      >
                        {sample.totalGib.toFixed(1)}
                        <span style={{ fontSize: 18, color: "#94a3b8", marginLeft: 8 }}>
                          GiB
                        </span>
                      </div>
                      <table
                        role="presentation"
                        width="100%"
                        cellPadding={0}
                        cellSpacing={0}
                        style={{ marginTop: 18 }}
                      >
                        <tbody>
                          <tr>
                            <td
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: "#64748b",
                                letterSpacing: "0.06em",
                              }}
                            >
                              EŞIK
                            </td>
                            <td
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: "#cbd5e1",
                                textAlign: "right",
                              }}
                            >
                              {sample.crossedStep} GiB
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={2} style={{ paddingTop: 8 }}>
                              <div
                                style={{
                                  height: 6,
                                  background: "#1e2a44",
                                  borderRadius: 3,
                                  position: "relative",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: "100%",
                                    background:
                                      "linear-gradient(90deg, #7dd3fc 0%, #f97316 85%, #ef4444 100%)",
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "20px 28px 0 28px" }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  {[
                    ["Hesap", sample.credentialLabel, false],
                    ["Terminal", sample.kitNo, true],
                    ["Dönem", sample.periodLabel, true],
                    ["Maliyet", `$${sample.totalUsd.toFixed(2)}`, true],
                  ].map(([k, v, mono], i, arr) => (
                    <tr key={k as string}>
                      <td
                        style={{
                          padding: "12px 0",
                          borderBottom:
                            i < arr.length - 1 ? "1px solid #1e2a44" : "none",
                          fontFamily: MONO,
                          fontSize: 11,
                          color: "#64748b",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          width: "40%",
                        }}
                      >
                        {k}
                      </td>
                      <td
                        style={{
                          padding: "12px 0",
                          borderBottom:
                            i < arr.length - 1 ? "1px solid #1e2a44" : "none",
                          fontFamily: mono ? MONO : FONT,
                          fontSize: 13,
                          color: "#e2e8f0",
                          textAlign: "right",
                          fontWeight: 500,
                        }}
                      >
                        {v as string}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td
              style={{
                padding: "20px 28px",
                fontFamily: FONT,
                fontSize: 12,
                color: "#94a3b8",
                lineHeight: 1.55,
              }}
            >
              Bu eşik için tek bir bildirim iletilir. Yeni dönem başladığında sayaç sıfırlanır ve
              uyarılar otomatik devam eder.
            </td>
          </tr>

          <tr>
            <td
              style={{
                padding: "14px 28px",
                borderTop: "1px solid #1e2a44",
                background: "#0a1024",
                fontFamily: MONO,
                fontSize: 10,
                color: "#475569",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              station.satcom.ops · auto-generated · do not reply
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
