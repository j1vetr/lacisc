export function RenkliDurumBanner() {
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
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f1",
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
          background: "#ffffff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
          border: "1px solid #e6e5e0",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "20px 28px",
                background:
                  "linear-gradient(135deg, #f54e00 0%, #ff7a3a 50%, #ffb085 100%)",
              }}
            >
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontFamily: FONT,
                        fontSize: 12,
                        color: "#fff5ee",
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      ⬢ Lacivert SC
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontFamily: FONT,
                        fontSize: 11,
                        color: "rgba(255,245,238,0.85)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Eşik aşıldı &nbsp;·&nbsp; {sample.periodLabel}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "32px 28px 8px 28px" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "6px 12px",
                  background: "#fef0e9",
                  color: "#c43d00",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderRadius: 999,
                  border: "1px solid #fbd5c1",
                }}
              >
                ● {sample.crossedStep} GiB Eşiği
              </span>
              <h1
                style={{
                  margin: "16px 0 4px 0",
                  fontSize: 24,
                  lineHeight: 1.25,
                  color: "#1c1b16",
                  letterSpacing: "-0.015em",
                  fontWeight: 600,
                }}
              >
                {sample.shipLabel} terminali yeni bir kullanım eşiği geçti.
              </h1>
              <p style={{ margin: "8px 0 0 0", color: "#6b6a63", fontSize: 14, lineHeight: 1.5 }}>
                Aktif dönemde tüketim hızla yükseliyor; operasyonel takip için hatırlatma
                gönderiyoruz.
              </p>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "24px 28px 8px 28px" }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        background: "#faf9f5",
                        border: "1px solid #ececdf",
                        borderRadius: 12,
                        padding: "20px 22px",
                        width: "50%",
                        verticalAlign: "top",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "#8a8276",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        Anlık Tüketim
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontFamily: MONO,
                          fontSize: 30,
                          color: "#1c1b16",
                          fontWeight: 600,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {sample.totalGib.toFixed(2)}
                        <span style={{ fontSize: 13, color: "#6b6a63", marginLeft: 6 }}>GiB</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#c43d00", fontWeight: 500 }}>
                        +{(sample.totalGib - sample.crossedStep).toFixed(1)} GiB · eşiği aştı
                      </div>
                    </td>
                    <td style={{ width: 12 }}></td>
                    <td
                      style={{
                        background: "#faf9f5",
                        border: "1px solid #ececdf",
                        borderRadius: 12,
                        padding: "20px 22px",
                        width: "50%",
                        verticalAlign: "top",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "#8a8276",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        Dönem Maliyeti
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontFamily: MONO,
                          fontSize: 30,
                          color: "#1c1b16",
                          fontWeight: 600,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        ${sample.totalUsd.toFixed(0)}
                        <span style={{ fontSize: 13, color: "#6b6a63", marginLeft: 6 }}>USD</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#6b6a63" }}>
                        {sample.periodLabel} dönemi
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "20px 28px 8px 28px" }}>
              <div
                style={{
                  border: "1px solid #ececdf",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {[
                  ["Hesap", sample.credentialLabel, false],
                  ["Terminal", sample.kitNo, true],
                  ["Dönem", sample.periodLabel, true],
                ].map(([k, v, mono], i, arr) => (
                  <table
                    key={k as string}
                    role="presentation"
                    width="100%"
                    cellPadding={0}
                    cellSpacing={0}
                  >
                    <tbody>
                      <tr>
                        <td
                          style={{
                            padding: "12px 18px",
                            background: i % 2 === 0 ? "#ffffff" : "#fbfaf6",
                            borderBottom:
                              i < arr.length - 1 ? "1px solid #ececdf" : "none",
                            fontSize: 12,
                            color: "#8a8276",
                            letterSpacing: "0.04em",
                            width: "40%",
                          }}
                        >
                          {k}
                        </td>
                        <td
                          style={{
                            padding: "12px 18px",
                            background: i % 2 === 0 ? "#ffffff" : "#fbfaf6",
                            borderBottom:
                              i < arr.length - 1 ? "1px solid #ececdf" : "none",
                            fontFamily: mono ? MONO : FONT,
                            fontSize: 13,
                            color: "#1c1b16",
                            textAlign: "right",
                            fontWeight: 500,
                          }}
                        >
                          {v as string}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ))}
              </div>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "20px 28px 28px 28px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#8a8276",
                  lineHeight: 1.6,
                }}
              >
                Bu eşik için tek bir bildirim iletilir. Sonraki dönem başladığında sayaç otomatik
                sıfırlanır.
              </p>
            </td>
          </tr>

          <tr>
            <td
              style={{
                padding: "14px 28px",
                background: "#1c1b16",
                fontFamily: FONT,
                fontSize: 11,
                color: "#a4a092",
                letterSpacing: "0.06em",
              }}
            >
              Station Satcom · operasyon paneli &nbsp;·&nbsp; otomatik bildirim
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
