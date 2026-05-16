// ---------------------------------------------------------------------------
// WhatsApp eşik bildirim sistemi (Task #27).
//
// wpileti.com REST API üzerinden plan-bazlı eşik geçişlerinde tek-noktada
// mesaj üretir. E-posta alarm sistemiyle PARALEL çalışır — eşik adımları,
// alıcı listesi ve idempotency tablosu tamamen ayrıdır.
//
// Tetikleme: Satcom (alerts.ts yanı sıra), Starlink (persistMonthlyTotals
// sonrası), Leo Bridge (persistUsage sonrası). Her tetikleme aktif dönemle
// sınırlanır (history backfill spam etmez).
// ---------------------------------------------------------------------------

import { and, eq, isNull, sql, or, lte, desc } from "drizzle-orm";
import {
  db,
  adminUsers,
  customerKitAssignments,
  whatsappSettings,
  whatsappThresholdRules,
  whatsappAlertState,
  starlinkTerminals,
  leobridgeTerminals,
  stationKits,
  stationKitSubscriptionHistory,
  emailSettings,
} from "@workspace/db";
import { decrypt, encrypt } from "./crypto";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Settings (singleton id=1)
// ---------------------------------------------------------------------------

export type WhatsappSettingsView = {
  enabled: boolean;
  hasApiKey: boolean;
  endpointUrl: string;
  testRecipient: string | null;
  // E-posta ayarlarından okunan global fallback (read-only — bilgilendirme).
  // Plan kotası bilinmiyorsa veya hiçbir whatsapp_threshold_rules kuralı
  // eşleşmiyorsa pickStepGb bu değeri kullanır.
  emailFallbackThresholdGb: number | null;
  updatedAt: Date;
};

async function getEmailFallbackThresholdGb(): Promise<number | null> {
  const [row] = await db
    .select({ step: emailSettings.thresholdStepGib })
    .from(emailSettings)
    .where(eq(emailSettings.id, 1));
  // Schema legacy adı "Gib" — replit.md'ye göre artık GB olarak yorumlanır.
  if (row?.step != null && row.step >= 1) return row.step;
  return null;
}

export async function getWhatsappSettings(): Promise<WhatsappSettingsView> {
  const [row] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  const emailFallback = await getEmailFallbackThresholdGb();
  if (!row) {
    return {
      enabled: false,
      hasApiKey: false,
      endpointUrl: DEFAULT_WHATSAPP_ENDPOINT,
      testRecipient: null,
      emailFallbackThresholdGb: emailFallback,
      updatedAt: new Date(),
    };
  }
  // Defansif: DB'de hatalı/legacy değer varsa runtime'da pinli host'a fallback.
  const safeEndpoint = isAllowedWhatsappEndpoint(row.endpointUrl)
    ? row.endpointUrl
    : DEFAULT_WHATSAPP_ENDPOINT;
  return {
    enabled: row.enabled,
    hasApiKey: !!row.apiKeyEncrypted,
    endpointUrl: safeEndpoint,
    testRecipient: row.testRecipient,
    emailFallbackThresholdGb: emailFallback,
    updatedAt: row.updatedAt,
  };
}

export type WhatsappSettingsUpdate = {
  enabled?: boolean;
  // null/"" → temizle, undefined → değişmez, dolu → re-encrypt
  apiKey?: string | null;
  endpointUrl?: string;
  testRecipient?: string | null;
};

// Güvenlik: SSRF + API anahtarı sızıntısını önlemek için endpoint URL
// kesinlikle wpileti.com host'una pinlenmiştir. Admin UI'da bile
// değiştirilemez (frontend read-only gösterir, backend reddeder).
const ALLOWED_WHATSAPP_HOST = "my.wpileti.com";
const DEFAULT_WHATSAPP_ENDPOINT = "https://my.wpileti.com/api/send-message";

function isAllowedWhatsappEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.host === ALLOWED_WHATSAPP_HOST;
  } catch {
    return false;
  }
}

export async function saveWhatsappSettings(
  patch: WhatsappSettingsUpdate
): Promise<WhatsappSettingsView> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.endpointUrl !== undefined && patch.endpointUrl.trim()) {
    const candidate = patch.endpointUrl.trim();
    if (!isAllowedWhatsappEndpoint(candidate)) {
      throw new Error(
        `WhatsApp endpoint yalnız https://${ALLOWED_WHATSAPP_HOST}/... olabilir (SSRF koruması).`
      );
    }
    update.endpointUrl = candidate;
  }
  if (patch.testRecipient !== undefined)
    update.testRecipient = patch.testRecipient;
  if (patch.apiKey !== undefined) {
    update.apiKeyEncrypted =
      patch.apiKey === null || patch.apiKey === ""
        ? null
        : encrypt(patch.apiKey);
  }

  await db
    .insert(whatsappSettings)
    .values({
      id: 1,
      enabled: (update.enabled as boolean | undefined) ?? false,
      apiKeyEncrypted:
        (update.apiKeyEncrypted as string | null | undefined) ?? null,
      endpointUrl:
        (update.endpointUrl as string | undefined) ??
        DEFAULT_WHATSAPP_ENDPOINT,
      opsRecipients: null,
      testRecipient:
        (update.testRecipient as string | null | undefined) ?? null,
      globalThresholdGb: null,
      updatedAt: update.updatedAt as Date,
    })
    .onConflictDoUpdate({ target: whatsappSettings.id, set: update });

  return getWhatsappSettings();
}

// ---------------------------------------------------------------------------
// Threshold rules
// ---------------------------------------------------------------------------

export type ThresholdRule = {
  id: number;
  minPlanGb: number | null;
  stepGb: number;
  createdAt: Date;
};

export async function listThresholdRules(): Promise<ThresholdRule[]> {
  const rows = await db
    .select()
    .from(whatsappThresholdRules)
    .orderBy(sql`${whatsappThresholdRules.minPlanGb} NULLS FIRST`);
  return rows.map((r) => ({
    id: r.id,
    minPlanGb: r.minPlanGb ?? null,
    stepGb: r.stepGb,
    createdAt: r.createdAt,
  }));
}

export async function createThresholdRule(input: {
  minPlanGb: number | null;
  stepGb: number;
}): Promise<ThresholdRule> {
  if (!Number.isFinite(input.stepGb) || input.stepGb < 1) {
    throw new Error("stepGb >= 1 olmalı.");
  }
  const [row] = await db
    .insert(whatsappThresholdRules)
    .values({
      minPlanGb: input.minPlanGb,
      stepGb: input.stepGb,
    })
    .returning();
  return {
    id: row.id,
    minPlanGb: row.minPlanGb ?? null,
    stepGb: row.stepGb,
    createdAt: row.createdAt,
  };
}

export async function deleteThresholdRule(id: number): Promise<void> {
  await db.delete(whatsappThresholdRules).where(eq(whatsappThresholdRules.id, id));
}

// Spec (kesin):
//   planAllowanceGb null/unknown  → DOĞRUDAN email fallback (catchall yok).
//   planAllowanceGb biliniyor      → minPlanGb NOT NULL ve <= plan olan
//                                    en yüksek minPlanGb kuralı seç.
//                                    Eşleşme yoksa email fallback.
// minPlanGb=NULL satırlar (legacy) kasıtlı olarak değerlendirilmez —
// route catchall kuralları reddeder; DB'de kalırsa pickStepGb tarafından
// görmezden gelinir.
async function pickStepGb(
  planAllowanceGb: number | null,
  globalFallbackGb: number | null
): Promise<number | null> {
  if (planAllowanceGb == null || !Number.isFinite(planAllowanceGb)) {
    return globalFallbackGb != null && globalFallbackGb >= 1
      ? globalFallbackGb
      : null;
  }
  const [row] = await db
    .select()
    .from(whatsappThresholdRules)
    .where(
      and(
        sql`${whatsappThresholdRules.minPlanGb} IS NOT NULL`,
        lte(whatsappThresholdRules.minPlanGb, planAllowanceGb)
      )
    )
    .orderBy(desc(whatsappThresholdRules.minPlanGb))
    .limit(1);
  if (row?.stepGb && row.stepGb >= 1) return row.stepGb;
  return globalFallbackGb != null && globalFallbackGb >= 1
    ? globalFallbackGb
    : null;
}

// ---------------------------------------------------------------------------
// Phone normalization (E.164 without plus, TR fallback to 90)
// ---------------------------------------------------------------------------

const PHONE_RE = /^\d{10,15}$/;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  // 0XXXXXXXXXX (TR yerel) → 90XXXXXXXXXX
  if (s.startsWith("0") && s.length === 11) s = "90" + s.slice(1);
  // 5XXXXXXXXX (TR mobil GSM, başında ülke kodu yok) → 90XXXXXXXXXX
  if (/^5\d{9}$/.test(s)) s = "90" + s;
  if (!PHONE_RE.test(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Send (FIFO 30s queue — same shape as alerts.ts)
// ---------------------------------------------------------------------------

const SEND_INTERVAL_MS = 30_000;
const sendQueue: Array<{ label: string; send: () => Promise<unknown> }> = [];
let sendQueueProcessing = false;

function enqueueSend(label: string, send: () => Promise<unknown>): void {
  sendQueue.push({ label, send });
  if (!sendQueueProcessing) void processSendQueue();
}

async function processSendQueue(): Promise<void> {
  sendQueueProcessing = true;
  try {
    while (sendQueue.length > 0) {
      const job = sendQueue.shift()!;
      try {
        const r = (await job.send()) as
          | { ok: boolean; status: number; body: string }
          | undefined;
        if (r && !r.ok) {
          // Yapılandırılmış hata kaydı (client_errors / sync_logs ile aynı
          // pino sink'ine gider — bir sonraki adımda /sync-logs benzeri UI'da
          // listelenebilir).
          logger.error(
            {
              clientError: true,
              channel: "whatsapp",
              label: job.label,
              providerStatus: r.status,
              providerBody: r.body.slice(0, 500),
            },
            "WhatsApp wpileti.com hata yanıtı"
          );
        } else {
          logger.info(
            { label: job.label, queueRemaining: sendQueue.length },
            "WhatsApp mesajı gönderildi"
          );
        }
      } catch (err) {
        logger.error(
          {
            clientError: true,
            channel: "whatsapp",
            label: job.label,
            err,
          },
          "WhatsApp gönderimi başarısız"
        );
      }
      if (sendQueue.length > 0) {
        await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
      }
    }
  } finally {
    sendQueueProcessing = false;
  }
}

// ---------------------------------------------------------------------------
// Per-receiver digest buffer
//
// WhatsApp consumer apps (wpileti.com benzeri unofficial wrapper'lar dahil)
// aynı kontağa kısa sürede arka arkaya çok mesaj atınca anti-spam motoruna
// takılıp mesajları "Mesaj bekleniyor" pending durumuna düşürüyor (provider
// 200 OK dönse bile teslim edilmiyor). Çözüm: aynı sync turunda aynı alıcıya
// giden tüm KIT eşik bildirimlerini TEK mesajda birleştir.
//
// Akış: maybeFireWhatsappAlert(...) artık doğrudan sendOne enqueue etmek
// yerine, alıcı başına PendingAlertItem buffer'ına ekler ve debounce timer
// kurar. 5 sn yeni alert eklenmeyince flushDigest devreye girer; tek alıcı
// için 1..N mesaj enqueueSend edilir (20 KIT'ten fazlası bölünür).
// ---------------------------------------------------------------------------

// Tek gerçek flush yolu artık orchestrator'un tur sonu hook'u
// (`flushAllPendingDigests()` — manual `/sync-now` ve cron tick'inde çağrılır).
// Debounce timer pasif bir failsafe olarak duruyor: değer cron aralığından
// (varsayılan 30 dk, MAX_INTERVAL_MINUTES=360 dk) yeterince büyük tutulur ki
// normal akışta asla erken tetiklenmesin — yani bir sync turunda biriken her
// alert ALICI BAŞINA TEK mesajda toplanır. Tur sonu hook'u herhangi bir nedenle
// (orchestrator hard-crash sonrası mid-state vs.) atlanırsa, en kötü
// `MAX_INTERVAL_MINUTES + 30 dk` sonra failsafe devreye girer.
const DIGEST_DEBOUNCE_MS = 6 * 60 * 60 * 1000; // 6 saat
const MAX_KITS_PER_MESSAGE = 20;
const BAR_SEGMENTS = 8;

type PendingAlertItem = {
  source: WhatsappAlertSource;
  kitNo: string;
  period: string;
  totalGb: number;
  planAllowanceGb: number | null;
  shipName: string | null;
  crossedStep: number;
};

const pendingDigest = new Map<
  string,
  { alerts: PendingAlertItem[]; flushTimer: ReturnType<typeof setTimeout> | null }
>();

function enqueueAlertForReceiver(
  receiver: string,
  alert: PendingAlertItem
): void {
  let entry = pendingDigest.get(receiver);
  if (!entry) {
    entry = { alerts: [], flushTimer: null };
    pendingDigest.set(receiver, entry);
  }
  entry.alerts.push(alert);
  if (entry.flushTimer) clearTimeout(entry.flushTimer);
  entry.flushTimer = setTimeout(() => {
    void flushDigestForReceiver(receiver);
  }, DIGEST_DEBOUNCE_MS);
}

function severityFor(pct: number): string {
  return pct >= 95 ? "🔴" : pct >= 80 ? "🟠" : pct >= 50 ? "🟡" : "🟢";
}

function renderBar(pct: number): string {
  const filled = Math.max(
    0,
    Math.min(BAR_SEGMENTS, Math.round((pct / 100) * BAR_SEGMENTS))
  );
  return "▰".repeat(filled) + "▱".repeat(BAR_SEGMENTS - filled);
}

function buildSingleKitMessage(a: PendingAlertItem): string {
  const shipLabel = a.shipName?.trim() || a.kitNo;
  const periodLabel = `${a.period.slice(0, 4)}-${a.period.slice(4)}`;
  const plan = a.planAllowanceGb;
  const hasPlan = plan != null && plan > 0;

  let header: string;
  let body: string;
  if (hasPlan) {
    const pct = Math.min(999, (a.totalGb / (plan as number)) * 100);
    const remaining = Math.max(0, (plan as number) - a.totalGb);
    header = `${severityFor(pct)} *Veri Uyarısı | %${pct.toFixed(0)}*`;
    body =
      `${renderBar(pct)}  ${a.totalGb.toFixed(2)} / ${(plan as number).toFixed(0)} GB\n` +
      `Aşılan Eşik : ${a.crossedStep} GB\n` +
      `Kalan Kota : ${remaining.toFixed(2)} GB`;
  } else {
    header = `⚠️ *Veri Uyarısı*`;
    body =
      `${a.totalGb.toFixed(2)} GB kullanıldı\n` +
      `Aşılan Eşik : ${a.crossedStep} GB\n` +
      `_Kota tanımsız — sabit eşik aralığı kullanıldı._`;
  }

  return (
    `${header}\n\n` +
    `Gemi : ${shipLabel} (${a.kitNo})\n` +
    `Dönem : ${periodLabel}\n\n` +
    `${body}\n\n` +
    `| sc.lacivertteknoloji.com`
  );
}

function renderKitBlock(a: PendingAlertItem): string {
  const shipLabel = a.shipName?.trim() || a.kitNo;
  const plan = a.planAllowanceGb;
  if (plan != null && plan > 0) {
    const pct = Math.min(999, (a.totalGb / plan) * 100);
    const remaining = Math.max(0, plan - a.totalGb);
    return (
      `${severityFor(pct)} ${shipLabel} (${a.kitNo})\n` +
      `${renderBar(pct)} %${pct.toFixed(0)} · ${a.totalGb.toFixed(2)} / ${plan.toFixed(0)} GB\n` +
      `Eşik : ${a.crossedStep} GB · Kalan : ${remaining.toFixed(2)} GB`
    );
  }
  return (
    `⚠️ ${shipLabel} (${a.kitNo})\n` +
    `${a.totalGb.toFixed(2)} GB kullanıldı · eşik ${a.crossedStep} GB`
  );
}

function buildDigestMessages(alerts: PendingAlertItem[]): string[] {
  // En kritik üstte: planlı KIT'ler yüzde desc, plansızlar (Satcom çoğunluk)
  // en alta totalGb desc.
  const sorted = [...alerts].sort((a, b) => {
    const aHas = a.planAllowanceGb != null && a.planAllowanceGb > 0;
    const bHas = b.planAllowanceGb != null && b.planAllowanceGb > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas) {
      const aPct = a.totalGb / (a.planAllowanceGb as number);
      const bPct = b.totalGb / (b.planAllowanceGb as number);
      return bPct - aPct;
    }
    return b.totalGb - a.totalGb;
  });

  const period = sorted[0]?.period ?? activePeriod();
  const periodLabel = `${period.slice(0, 4)}-${period.slice(4)}`;

  const chunks: PendingAlertItem[][] = [];
  for (let i = 0; i < sorted.length; i += MAX_KITS_PER_MESSAGE) {
    chunks.push(sorted.slice(i, i + MAX_KITS_PER_MESSAGE));
  }

  return chunks.map((chunk, idx) => {
    const partLabel =
      chunks.length > 1 ? ` (${idx + 1}/${chunks.length})` : "";
    const header =
      `🔔 *Veri Uyarısı | ${chunk.length} KIT*${partLabel}\n` +
      `Dönem : ${periodLabel}`;
    const blocks = chunk.map(renderKitBlock).join("\n\n");
    return `${header}\n\n${blocks}\n\n| sc.lacivertteknoloji.com`;
  });
}

// Sync orchestrator'unun (hem manual `/sync-now` hem 30 dk cron) tur sonunda
// çağırdığı flush. Bekleyen tüm alıcı buffer'larını HEMEN gönderim kuyruğuna
// itmek için debounce timer'larını iptal edip flushDigestForReceiver çağırır.
// Sonuç: bir sync turunda biriken her alert tek mesajda toplanır (KIT'ler
// arası 30-60 sn'lik scraper boşluğu artık digest'i bölmez).
export async function flushAllPendingDigests(): Promise<void> {
  const receivers = Array.from(pendingDigest.keys());
  if (receivers.length === 0) return;
  for (const receiver of receivers) {
    const entry = pendingDigest.get(receiver);
    if (entry?.flushTimer) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
  }
  await Promise.all(receivers.map((r) => flushDigestForReceiver(r)));
}

async function flushDigestForReceiver(receiver: string): Promise<void> {
  const entry = pendingDigest.get(receiver);
  if (!entry || entry.alerts.length === 0) {
    pendingDigest.delete(receiver);
    return;
  }
  const alerts = entry.alerts;
  pendingDigest.delete(receiver);

  try {
    const settings = await getWhatsappSettings();
    if (!settings.enabled || !settings.hasApiKey) return;
    const [row] = await db
      .select({ apiKey: whatsappSettings.apiKeyEncrypted })
      .from(whatsappSettings)
      .where(eq(whatsappSettings.id, 1));
    if (!row?.apiKey) return;
    const apiKey = decrypt(row.apiKey);

    const messages =
      alerts.length === 1
        ? [buildSingleKitMessage(alerts[0])]
        : buildDigestMessages(alerts);

    messages.forEach((message, idx) => {
      const part =
        messages.length > 1 ? `/${idx + 1}of${messages.length}` : "";
      const label = `digest→${receiver}[${alerts.length}KIT${part}]`;
      enqueueSend(label, () =>
        sendOne({ endpointUrl: settings.endpointUrl, apiKey, receiver, message })
      );
    });

    logger.info(
      {
        receiver,
        kitCount: alerts.length,
        messages: messages.length,
        queueDepth: sendQueue.length,
      },
      "WhatsApp digest sıraya alındı"
    );
  } catch (err) {
    logger.error(
      { err, receiver, kitCount: alerts.length },
      "WhatsApp digest flush hatası"
    );
  }
}

async function sendOne(opts: {
  endpointUrl: string;
  apiKey: string;
  receiver: string;
  message: string;
}): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(opts.endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      api_key: opts.apiKey,
      receiver: opts.receiver,
      data: { message: opts.message },
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export type WhatsappTestResultDetail = {
  ok: boolean;
  message: string;
  recipients: string[];
  providerStatus: number | null;
  providerBody: string | null;
};

export async function sendTestWhatsapp(
  overrideTo?: string
): Promise<WhatsappTestResultDetail> {
  const settings = await getWhatsappSettings();
  if (!settings.hasApiKey) {
    return {
      ok: false,
      message: "API anahtarı tanımlı değil.",
      recipients: [],
      providerStatus: null,
      providerBody: null,
    };
  }
  const target = normalizePhone(overrideTo) ?? normalizePhone(settings.testRecipient);
  if (!target) {
    return {
      ok: false,
      message: "Geçerli bir test alıcısı yok.",
      recipients: [],
      providerStatus: null,
      providerBody: null,
    };
  }
  const [row] = await db
    .select({ apiKey: whatsappSettings.apiKeyEncrypted })
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, 1));
  if (!row?.apiKey) {
    return {
      ok: false,
      message: "API anahtarı çözümlenemedi.",
      recipients: [],
      providerStatus: null,
      providerBody: null,
    };
  }
  const apiKey = decrypt(row.apiKey);
  const message =
    "📊 Station Satcom — Test mesajı.\n" +
    `Tarih: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}\n\n` +
    "Bu mesajı aldıysanız WhatsApp eşik bildirimleri çalışıyor.\n\n" +
    "— sc.lacivertteknoloji.com";
  try {
    const r = await sendOne({
      endpointUrl: settings.endpointUrl,
      apiKey,
      receiver: target,
      message,
    });
    if (!r.ok) {
      logger.error(
        {
          clientError: true,
          channel: "whatsapp",
          label: `test→${target}`,
          providerStatus: r.status,
          providerBody: r.body.slice(0, 500),
        },
        "WhatsApp test gönderimi wpileti.com hata yanıtı"
      );
    }
    return {
      ok: r.ok,
      message: r.ok
        ? `Test mesajı ${target} numarasına gönderildi.`
        : `wpileti.com hata (${r.status}).`,
      recipients: [target],
      providerStatus: r.status,
      providerBody: r.body.slice(0, 500),
    };
  } catch (err) {
    logger.error(
      {
        clientError: true,
        channel: "whatsapp",
        label: `test→${target}`,
        err,
      },
      "WhatsApp test gönderimi başarısız"
    );
    return {
      ok: false,
      message: `İstek başarısız: ${(err as Error).message}`,
      recipients: [target],
      providerStatus: null,
      providerBody: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

// Spec: WhatsApp eşik bildirimleri YALNIZ customer rolündeki kullanıcılara
// (kendilerine atanmış KIT için) gider. Operatör/admin/viewer global
// listesi dispatch yolundan kaldırıldı.
//
// Source dimension: customer_kit_assignments (kitNo, source) bazında
// scope'lanır — aynı kitNo birden fazla kaynakta ('satcom'/'starlink'/
// 'leobridge') var olabilir, dolayısıyla tetikleyen kaynağın atamasıyla
// eşleşmeyen müşteriler bildirim almaz.
async function resolveRecipientsForKit(opts: {
  kitNo: string;
  source: WhatsappAlertSource;
}): Promise<string[]> {
  const customers = await db
    .select({ phone: adminUsers.phone })
    .from(customerKitAssignments)
    .innerJoin(adminUsers, eq(customerKitAssignments.userId, adminUsers.id))
    .where(
      and(
        eq(customerKitAssignments.kitNo, opts.kitNo),
        eq(customerKitAssignments.source, opts.source),
        eq(adminUsers.role, "customer"),
        sql`${adminUsers.phone} IS NOT NULL AND ${adminUsers.phone} <> ''`
      )
    );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of customers) {
    const n = normalizePhone(r.phone);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Active period helper (UTC)
// ---------------------------------------------------------------------------

function activePeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Threshold check + dispatch
// ---------------------------------------------------------------------------

export type WhatsappAlertSource = "satcom" | "starlink" | "leobridge";

export async function maybeFireWhatsappAlert(opts: {
  source: WhatsappAlertSource;
  credentialId: number;
  credentialLabel: string;
  kitNo: string;
  period: string;
  totalGb: number | null | undefined;
  planAllowanceGb: number | null | undefined;
  shipName?: string | null;
}): Promise<void> {
  if (opts.totalGb == null || !Number.isFinite(opts.totalGb)) return;
  if (opts.period !== activePeriod()) return;
  try {
    const settings = await getWhatsappSettings();
    if (!settings.enabled || !settings.hasApiKey) return;

    const stepGb = await pickStepGb(
      opts.planAllowanceGb ?? null,
      settings.emailFallbackThresholdGb
    );
    if (!stepGb || stepGb < 1) return;

    const crossedStep = Math.floor(opts.totalGb / stepGb) * stepGb;
    if (crossedStep <= 0) return;

    // Atomic claim: UPSERT + WHERE last < crossed garantisi.
    // Önce mevcut satırı dene; yoksa insert (çakışma → update şartı kontrolü).
    const claimUpdate = await db
      .update(whatsappAlertState)
      .set({ lastAlertStepGb: crossedStep, updatedAt: new Date() })
      .where(
        and(
          eq(whatsappAlertState.source, opts.source),
          eq(whatsappAlertState.credentialId, opts.credentialId),
          eq(whatsappAlertState.kitNo, opts.kitNo),
          eq(whatsappAlertState.period, opts.period),
          sql`${whatsappAlertState.lastAlertStepGb} < ${crossedStep}`
        )
      )
      .returning({ source: whatsappAlertState.source });

    let claimed = claimUpdate.length > 0;
    if (!claimed) {
      // Satır hiç yoksa insert et — çakışma varsa zaten >= crossed demektir.
      const inserted = await db
        .insert(whatsappAlertState)
        .values({
          source: opts.source,
          credentialId: opts.credentialId,
          kitNo: opts.kitNo,
          period: opts.period,
          lastAlertStepGb: crossedStep,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ source: whatsappAlertState.source });
      claimed = inserted.length > 0;
    }
    if (!claimed) return;

    const recipients = await resolveRecipientsForKit({
      kitNo: opts.kitNo,
      source: opts.source,
    });
    if (recipients.length === 0) {
      logger.info(
        { source: opts.source, kitNo: opts.kitNo, crossedStep },
        "WhatsApp eşik geçildi ama alıcı yok — claim kalıcı."
      );
      return;
    }

    const plan = opts.planAllowanceGb;
    const hasPlan = plan != null && Number.isFinite(plan) && plan > 0;

    const item: PendingAlertItem = {
      source: opts.source,
      kitNo: opts.kitNo,
      period: opts.period,
      totalGb: opts.totalGb,
      planAllowanceGb: hasPlan ? (plan as number) : null,
      shipName: opts.shipName ?? null,
      crossedStep,
    };
    for (const receiver of recipients) {
      enqueueAlertForReceiver(receiver, item);
    }

    logger.info(
      {
        source: opts.source,
        kitNo: opts.kitNo,
        period: opts.period,
        crossedStep,
        recipients: recipients.length,
      },
      "WhatsApp eşik bildirimi digest'e eklendi"
    );
  } catch (err) {
    logger.error(
      { err, source: opts.source, kitNo: opts.kitNo, period: opts.period },
      "maybeFireWhatsappAlert hatası"
    );
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers (per-source kit metadata lookups)
// ---------------------------------------------------------------------------

export async function lookupStarlinkPlanAndShip(
  credentialId: number,
  kitSerialNumber: string
): Promise<{ planAllowanceGb: number | null; shipName: string | null }> {
  const [row] = await db
    .select({
      plan: starlinkTerminals.planAllowanceGb,
      nickname: starlinkTerminals.nickname,
      asset: starlinkTerminals.assetName,
    })
    .from(starlinkTerminals)
    .where(
      and(
        eq(starlinkTerminals.credentialId, credentialId),
        eq(starlinkTerminals.kitSerialNumber, kitSerialNumber)
      )
    );
  return {
    planAllowanceGb: row?.plan ?? null,
    shipName: row?.nickname ?? row?.asset ?? null,
  };
}

export async function lookupLeobridgePlanAndShip(
  credentialId: number,
  kitSerialNumber: string
): Promise<{ planAllowanceGb: number | null; shipName: string | null }> {
  const [row] = await db
    .select({
      plan: leobridgeTerminals.planAllowanceGb,
      nickname: leobridgeTerminals.nickname,
    })
    .from(leobridgeTerminals)
    .where(
      and(
        eq(leobridgeTerminals.credentialId, credentialId),
        eq(leobridgeTerminals.kitSerialNumber, kitSerialNumber)
      )
    );
  return {
    planAllowanceGb: row?.plan ?? null,
    shipName: row?.nickname ?? null,
  };
}

// Satcom plan adı (CardDetails enrichment) içinden kota tahmini.
// Plan adları "Mobile Priority 1TB Pooling Plan_TURKEY", "StellaKonnect 50GB"
// gibi rakam + birim taşır; ilk eşleşmeyi alıyoruz. TB → ×1000.
// (records.ts'deki ile aynı mantık — burada tekrar tutuyoruz ki whatsapp.ts
// route katmanına bağımlı olmasın.)
function parseSatcomPlanAllowanceGb(name?: string | null): number | null {
  if (!name) return null;
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2].toUpperCase() === "TB" ? n * 1000 : n;
}

export async function lookupSatcomShipAndPlan(
  credentialId: number,
  kitNo: string
): Promise<{ shipName: string | null; planAllowanceGb: number | null }> {
  const [row] = await db
    .select({
      shipName: stationKits.shipName,
      activePlanName: stationKits.activePlanName,
    })
    .from(stationKits)
    .where(
      and(
        eq(stationKits.credentialId, credentialId),
        eq(stationKits.kitNo, kitNo)
      )
    );

  // Aktif abonelik paketlerinin GB toplamı — endDate IS NULL olan satırlar
  // hâlâ devam eden paketlerdir. Birden fazla paket varsa (örn. 100 GB temel
  // + 300 GB eklenti) doğru toplam kotayı verir ve eşik hesabına yansır.
  const activeSubs = await db
    .select({ pricePlanName: stationKitSubscriptionHistory.pricePlanName })
    .from(stationKitSubscriptionHistory)
    .where(
      and(
        eq(stationKitSubscriptionHistory.kitNo, kitNo),
        isNull(stationKitSubscriptionHistory.endDate),
      )
    );
  const subTotalGb = activeSubs.reduce(
    (sum, s) => sum + (parseSatcomPlanAllowanceGb(s.pricePlanName) ?? 0),
    0,
  );
  const planAllowanceGb =
    subTotalGb > 0
      ? subTotalGb
      : parseSatcomPlanAllowanceGb(row?.activePlanName ?? null);

  return {
    shipName: row?.shipName ?? null,
    planAllowanceGb,
  };
}

// Geriye uyum: eski isim hâlâ ship name döndürür.
export async function lookupSatcomShipName(
  credentialId: number,
  kitNo: string
): Promise<string | null> {
  const r = await lookupSatcomShipAndPlan(credentialId, kitNo);
  return r.shipName;
}
