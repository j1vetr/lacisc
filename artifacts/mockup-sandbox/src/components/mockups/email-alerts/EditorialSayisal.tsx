export function EditorialSayisal() {
  const sample = {
    shipLabel: "M/V Yılmazlar Balıkçılık",
    kitNo: "KITP00409812",
    credentialLabel: "yilmazlarBalik",
    periodLabel: "2026-05",
    totalGib: 612.4,
    totalUsd: 1837.2,
    crossedStep: 600,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#efece4",
        padding: "32px 16px",
        fontFamily:
          "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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
          background: "#fbfaf6",
          border: "1px solid #1c1b16",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "20px 36px",
                borderBottom: "2px solid #1c1b16",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 14,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                color: "#1c1b16",
              }}
            >
              Lacivert · Satcom Bülteni
            </td>
          </tr>

          <tr>
            <td style={{ padding: "44px 36px 8px 36px" }}>
              <div
                style={{
                  fontFamily: "ui-sans-serif, sans-serif",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#8a8276",
                }}
              >
                {sample.periodLabel} &nbsp;·&nbsp; Kullanım Eşiği Bildirimi
              </div>
              <h1
                style={{
                  margin: "16px 0 0 0",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 38,
                  lineHeight: 1.1,
                  letterSpacing: "-0.015em",
                  color: "#1c1b16",
                  fontWeight: 500,
                }}
              >
                {sample.shipLabel}
                <br />
                <span style={{ fontStyle: "italic", color: "#6b6a63", fontSize: 26 }}>
                  ayın {sample.crossedStep} GiB eşiğini aştı.
                </span>
              </h1>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "32px 36px 16px 36px" }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        fontSize: 96,
                        lineHeight: 1,
                        color: "#1c1b16",
                        fontWeight: 500,
                        letterSpacing: "-0.04em",
                        verticalAlign: "bottom",
                      }}
                    >
                      {sample.totalGib.toFixed(1)}
                    </td>
                    <td
                      style={{
                        fontFamily: "ui-sans-serif, sans-serif",
                        fontSize: 13,
                        color: "#6b6a63",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        verticalAlign: "bottom",
                        paddingBottom: 14,
                        paddingLeft: 12,
                      }}
                    >
                      GiB
                      <br />
                      anlık tüketim
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "'JetBrains Mono', SFMono-Regular, monospace",
                  fontSize: 12,
                  color: "#8a8276",
                  letterSpacing: "0.04em",
                }}
              >
                eşik: {sample.crossedStep} GiB &nbsp;·&nbsp; aşım: +
                {(sample.totalGib - sample.crossedStep).toFixed(1)} GiB
              </div>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "24px 36px 32px 36px" }}>
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                style={{ borderTop: "1px solid #d8d4c8" }}
              >
                <tbody>
                  {[
                    ["Hesap", sample.credentialLabel, true],
                    ["Terminal", sample.kitNo, true],
                    ["Dönem", sample.periodLabel, true],
                    ["Dönem maliyeti", `$${sample.totalUsd.toFixed(2)}`, true],
                  ].map(([k, v, mono]) => (
                    <tr key={k as string}>
                      <td
                        style={{
                          padding: "14px 0",
                          borderBottom: "1px solid #d8d4c8",
                          fontFamily: "'Playfair Display', Georgia, serif",
                          fontSize: 14,
                          fontStyle: "italic",
                          color: "#6b6a63",
                          width: "40%",
                        }}
                      >
                        {k}
                      </td>
                      <td
                        style={{
                          padding: "14px 0",
                          borderBottom: "1px solid #d8d4c8",
                          fontFamily: mono
                            ? "'JetBrains Mono', SFMono-Regular, monospace"
                            : "ui-sans-serif, sans-serif",
                          fontSize: 14,
                          color: "#1c1b16",
                          textAlign: "right",
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
                padding: "20px 36px 28px 36px",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: "italic",
                fontSize: 13,
                color: "#6b6a63",
                lineHeight: 1.55,
              }}
            >
              Bu eşik için tek bir bildirim iletilir. Yeni dönem başladığında sayaç sıfırlanır.
            </td>
          </tr>

          <tr>
            <td
              style={{
                padding: "16px 36px",
                borderTop: "1px solid #1c1b16",
                fontFamily: "'JetBrains Mono', SFMono-Regular, monospace",
                fontSize: 10,
                color: "#8a8276",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Lacivert SC · Station Satcom Operasyon Paneli
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
