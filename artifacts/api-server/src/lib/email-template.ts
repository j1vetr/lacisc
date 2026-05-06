// ---------------------------------------------------------------------------
// Cross-client email templates (Gmail + Outlook + Apple Mail).
//
// Hard rules followed here:
//   1. Table-based layout — Outlook does not honour CSS flex/grid.
//   2. Inline CSS only — Gmail strips <style> blocks in many cases.
//   3. Max width 600px (single column), centered with an outer 100% table.
//   4. System font stack — Google Fonts won't load in Outlook desktop.
//   5. No background-image, no rounded corners on Outlook-critical chrome
//      (we keep the soft 6px radius — Outlook just renders square, that's OK).
//   6. Bulletproof: every <td> has explicit padding/border, no floats.
//   7. The HTML is intentionally compact and "report-like" — no marketing
//      copy, no emojis, no AI flourishes. Just the facts the operator needs.
// ---------------------------------------------------------------------------

const COLORS = {
  bg: "#f7f7f4",
  card: "#ffffff",
  ink: "#26251e",
  muted: "#6b6a63",
  hairline: "#e6e5e0",
  accent: "#f54e00",
  // A near-black title bar gives the mail a quietly serious tone without
  // shouting like a marketing brand color would.
  bar: "#1c1b16",
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK =
  "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A single key/value row in the data block. `mono` switches to JetBrains-like
// monospace for KIT codes, periods, numbers — matches the in-app convention.
function row(label: string, value: string, mono = false): string {
  const valueFont = mono ? MONO_STACK : FONT_STACK;
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};font-family:${FONT_STACK};font-size:12px;line-height:1.4;color:${COLORS.muted};text-transform:uppercase;letter-spacing:0.06em;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${COLORS.hairline};font-family:${valueFont};font-size:14px;line-height:1.45;color:${COLORS.ink};vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function shell(opts: {
  preheader: string;
  eyebrow: string;
  headline: string;
  // The big number under the headline (optional — used for alerts).
  metric?: { value: string; unit: string };
  rowsHtml: string;
  footnote?: string;
}): string {
  const { preheader, eyebrow, headline, metric, rowsHtml, footnote } = opts;
  const metricBlock = metric
    ? `
      <tr>
        <td style="padding:8px 32px 24px 32px;font-family:${FONT_STACK};">
          <div style="display:inline-block;font-family:${MONO_STACK};font-size:36px;line-height:1;color:${COLORS.accent};font-weight:600;letter-spacing:-0.02em;">${escapeHtml(metric.value)}</div>
          <div style="display:inline-block;margin-left:8px;font-family:${FONT_STACK};font-size:14px;color:${COLORS.muted};">${escapeHtml(metric.unit)}</div>
        </td>
      </tr>`
    : "";

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(eyebrow)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};">
<!-- Preheader (hidden in body, surfaces in inbox preview) -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLORS.bg};">${escapeHtml(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${COLORS.card};border:1px solid ${COLORS.hairline};border-radius:6px;">
        <!-- Title bar -->
        <tr>
          <td style="padding:14px 32px;background-color:${COLORS.bar};border-top-left-radius:6px;border-top-right-radius:6px;font-family:${FONT_STACK};font-size:13px;line-height:1;letter-spacing:0.04em;color:#f1efe9;">
            STATION &middot; SATCOM
          </td>
        </tr>
        <!-- Eyebrow -->
        <tr>
          <td style="padding:28px 32px 0 32px;font-family:${FONT_STACK};font-size:11px;line-height:1;letter-spacing:0.12em;color:${COLORS.muted};text-transform:uppercase;">
            ${escapeHtml(eyebrow)}
          </td>
        </tr>
        <!-- Headline -->
        <tr>
          <td style="padding:10px 32px 0 32px;font-family:${FONT_STACK};font-size:22px;line-height:1.3;color:${COLORS.ink};font-weight:500;letter-spacing:-0.01em;">
            ${escapeHtml(headline)}
          </td>
        </tr>
        ${metricBlock}
        <!-- Data rows -->
        <tr>
          <td style="padding:${metric ? "0" : "20"}px 32px 24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.hairline};">
              ${rowsHtml}
            </table>
          </td>
        </tr>
        ${
          footnote
            ? `<tr>
          <td style="padding:0 32px 28px 32px;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${COLORS.muted};">
            ${escapeHtml(footnote)}
          </td>
        </tr>`
            : ""
        }
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid ${COLORS.hairline};font-family:${FONT_STACK};font-size:11px;line-height:1.4;color:${COLORS.muted};letter-spacing:0.02em;">
            Bu bildirim Station Satcom yönetim panelinden otomatik olarak gönderildi.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Threshold alert email
// ---------------------------------------------------------------------------

export interface AlertEmailInput {
  shipLabel: string; // ship name OR fallback to KIT code
  shipName: string | null;
  kitNo: string;
  credentialLabel: string;
  period: string; // YYYYMM
  totalGib: number;
  totalUsd: number | null;
  crossedStep: number;
}

export function buildAlertEmail(input: AlertEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const periodLabel = `${input.period.slice(0, 4)}-${input.period.slice(4)}`;
  const subject = `[Lacivert SC] ${input.shipLabel} (${input.kitNo}) ${input.crossedStep} GiB'e ulaştı`;

  const headline = `${input.shipLabel} terminali ${input.crossedStep} GiB eşiğini geçti.`;

  const rows = [
    row("Hesap", input.credentialLabel),
    row("Terminal", input.kitNo, true),
    input.shipName ? row("Gemi", input.shipName) : "",
    row("Dönem", periodLabel, true),
    row("Anlık tüketim", `${input.totalGib.toFixed(2)} GiB`, true),
    input.totalUsd != null ? row("Dönem maliyeti", `$${input.totalUsd.toFixed(2)}`, true) : "",
  ]
    .filter(Boolean)
    .join("");

  const html = shell({
    preheader: `${input.shipLabel} ${input.crossedStep} GiB eşiğini geçti — ${periodLabel}`,
    eyebrow: "Kullanım Eşiği Uyarısı",
    headline,
    metric: { value: input.crossedStep.toLocaleString("tr-TR"), unit: "GiB eşiği aşıldı" },
    rowsHtml: rows,
    footnote:
      "Bu eşik için tek bir bildirim gönderilir. Yeni dönem başladığında sayaç sıfırlanır.",
  });

  // Plain-text fallback — Gmail/Outlook show this when HTML is blocked.
  const text = [
    headline,
    "",
    `Hesap:           ${input.credentialLabel}`,
    `Terminal:        ${input.kitNo}` + (input.shipName ? ` (${input.shipName})` : ""),
    `Dönem:           ${periodLabel}`,
    `Anlık tüketim:   ${input.totalGib.toFixed(2)} GiB`,
    input.totalUsd != null ? `Dönem maliyeti:  $${input.totalUsd.toFixed(2)}` : "",
    "",
    "— Station Satcom yönetim paneli",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Test email
// ---------------------------------------------------------------------------

export function buildTestEmail(opts: {
  recipients: string[];
  fromAddress: string;
  thresholdStepGib: number;
  smtpHost: string;
}): { subject: string; text: string; html: string } {
  const subject = "[Lacivert SC] Test e-postası — SMTP doğrulandı";
  const headline = "SMTP yapılandırması doğru çalışıyor.";
  const ts = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "long",
    timeStyle: "medium",
  });

  const rows = [
    row("SMTP sunucusu", opts.smtpHost, true),
    row("Gönderen", opts.fromAddress, true),
    row("Alıcı sayısı", String(opts.recipients.length)),
    row("Eşik adımı", `${opts.thresholdStepGib} GiB`, true),
    row("Gönderim", ts),
  ].join("");

  const html = shell({
    preheader: "Station Satcom — SMTP test e-postası başarıyla teslim edildi.",
    eyebrow: "Test E-Postası",
    headline,
    rowsHtml: rows,
    footnote:
      "Bu mesajı görüyorsanız panel artık eşik aşıldığında uyarı maillerini bu adrese teslim edebilir.",
  });

  const text = [
    headline,
    "",
    `SMTP sunucusu:  ${opts.smtpHost}`,
    `Gönderen:       ${opts.fromAddress}`,
    `Alıcı sayısı:   ${opts.recipients.length}`,
    `Eşik adımı:     ${opts.thresholdStepGib} GiB`,
    `Gönderim:       ${ts}`,
    "",
    "— Station Satcom yönetim paneli",
  ].join("\n");

  return { subject, text, html };
}
