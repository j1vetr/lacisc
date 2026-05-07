// Task #20 — Satcom portal enrichment helpers.
//
// runSync() içine takılan üç ek pass:
//   1. fetchKitLocations(page, baseUrl, credentialId) — /Starlink/Telemetry/Map
//      sayfasından inline `terminals: [...]` JSON'ını alır, station_kit_location'a
//      upsert eder. Tüm hesabın KIT'leri için snapshot'tır (overwrite).
//   2. fetchHourlyTelemetry(page, baseUrl, credentialId, isFirstFull) —
//      /Starlink/Telemetry/Measurements sayfasındaki `gvStarlinkMeasurementsOneHour`
//      grid'inden saatlik metrikleri okur ve station_kit_telemetry_hourly'ye
//      upsert eder. fullSync=true ise tarihsel sayfaları da tarar (max 80 sayfa);
//      false ise sadece görünen (en yeni) sayfayı çeker — saatlik cron için
//      yeterli.
//   3. enrichCardDetails(page, baseUrl, credentialId, kits) — her KIT için
//      CardDetails.aspx?ICCID=... sayfasını ratedCdrs grid'inden link tıklayarak
//      açar (direkt goto ASP.NET ErrorPage döner). station_kits'e
//      IMSI/IMEI/Mobile/Cost Center/Activation/Active Plan + Last Session +
//      Opt Out / Step Alert eşiklerini yazar; alt grid'i (Subscription History)
//      station_kit_subscription_history'ye upsert eder.
//
// Hepsi best-effort: hata olursa logger.warn ile geçilir, sync sonucu
// etkilenmez (records sayımı satır CDR'lara aittir).

import {
  db,
  stationKits,
  stationKitLocation,
  stationKitTelemetryHourly,
  stationKitSubscriptionHistory,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Page } from "playwright";
import type { KitListEntry } from "./scraper";

// ---------------------------------------------------------------------------
// 1) Map sayfası — terminal konum snapshot'ları
// ---------------------------------------------------------------------------
export async function fetchKitLocations(
  page: Page,
  baseUrl: string,
  credentialId: number
): Promise<{ count: number }> {
  try {
    await page.goto(`${baseUrl}/Starlink/Telemetry/Map`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
  } catch (e) {
    logger.warn(
      { err: (e as Error).message, baseUrl },
      "Map sayfası açılamadı (atlandı)"
    );
    return { count: 0 };
  }

  // Inline `var config = { ..., terminals: [{...}], ... }` bloğu içinden
  // sadece terminals array'ini regex ile yakalıyoruz — JSON.parse ile
  // doğrula. Ham HTML içinde olduğu için page.evaluate yerine content() yeterli.
  const html = await page.content().catch(() => "");
  const m = html.match(/terminals\s*:\s*(\[[^\]]*\])/);
  if (!m) {
    logger.warn(
      { url: page.url() },
      "Map sayfasında `terminals` JSON'ı bulunamadı"
    );
    return { count: 0 };
  }
  type Terminal = {
    Code: string;
    Latitude: number;
    Longitude: number;
    Active: boolean;
    Offline: boolean;
    Icon?: number;
    CustomerId?: number;
  };
  let terminals: Terminal[] = [];
  try {
    terminals = JSON.parse(m[1]) as Terminal[];
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "Map terminals JSON parse hatası");
    return { count: 0 };
  }

  let count = 0;
  for (const t of terminals) {
    if (!t.Code || typeof t.Latitude !== "number" || typeof t.Longitude !== "number") {
      continue;
    }
    await db
      .insert(stationKitLocation)
      .values({
        kitNo: t.Code,
        credentialId,
        lat: t.Latitude,
        lng: t.Longitude,
        active: !!t.Active,
        offline: !!t.Offline,
        icon: typeof t.Icon === "number" ? t.Icon : null,
        customerId: typeof t.CustomerId === "number" ? t.CustomerId : null,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: stationKitLocation.kitNo,
        set: {
          credentialId,
          lat: t.Latitude,
          lng: t.Longitude,
          active: !!t.Active,
          offline: !!t.Offline,
          icon: typeof t.Icon === "number" ? t.Icon : null,
          customerId: typeof t.CustomerId === "number" ? t.CustomerId : null,
          lastSeenAt: new Date(),
        },
      });
    count++;
  }
  logger.info({ credentialId, count }, "Map konumları kaydedildi");
  return { count };
}

// ---------------------------------------------------------------------------
// 2) Saatlik telemetri — gvStarlinkMeasurementsOneHour
// ---------------------------------------------------------------------------

// Grid satır sırası (20 hücre):
//   0: kit (anchor metni)
//   1: "DD MMM YYYY HH:MM"
//   2-4: download Mbps min/avg/max
//   5-7: upload Mbps min/avg/max
//   8-10: latency ms min/avg/max
//   11-13: ping drop % min/avg/max
//   14-16: obstruction % min/avg/max
//   17-19: signal quality % min/avg/max

const MONTHS_3: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseMeasurementDate(value: string): Date | null {
  // "07 May 2026 19:00"
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mm = MONTHS_3[m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
  if (!mm) return null;
  const iso = `${m[3]}-${mm}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function parseFloatOrNull(value: string): number | null {
  const t = value.trim().replace(/,/g, ".");
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

async function parseMeasurementsPage(page: Page): Promise<
  Array<{
    kitNo: string;
    intervalStart: Date;
    cells: (number | null)[];
  }>
> {
  const raw: { kit: string; ts: string; vals: string[] }[] = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll(
        "[id^='ctl00_ContentPlaceHolder1_gvStarlinkMeasurementsOneHour_DXDataRow'], [id*='gvStarlinkMeasurementsOneHour_DXDataRow']"
      )
    );
    return rows.map((tr) => {
      const tds = Array.from(tr.querySelectorAll("td"));
      const cells = tds.map((td) => (td.textContent || "").trim());
      const kitAnchor = (tds[0]?.querySelector("a")?.textContent || cells[0] || "").trim();
      return {
        kit: kitAnchor,
        ts: cells[1] || "",
        vals: cells.slice(2, 20),
      };
    });
  });
  const out: Array<{ kitNo: string; intervalStart: Date; cells: (number | null)[] }> = [];
  for (const r of raw) {
    if (!r.kit || !r.kit.startsWith("KIT")) continue;
    const ts = parseMeasurementDate(r.ts);
    if (!ts) continue;
    const cells = r.vals.map((v) => parseFloatOrNull(v));
    if (cells.length < 18) continue;
    out.push({ kitNo: r.kit, intervalStart: ts, cells });
  }
  return out;
}

// Generic ASPx.GVPagerOnClick helper — same proven mechanism as
// `setGridPageSize()` in scraper.ts, parameterized by grid id. DevExpress's
// `Page size` dropdown calls `ASPx.GVPagerOnClick(gridId, size)`; SetValue /
// PerformCallback / __doPostBack silently fail (see replit.md gotcha).
async function setMeasurementsGridPageSize(
  page: Page,
  size: number
): Promise<void> {
  const gridId = "ctl00_ContentPlaceHolder1_gvStarlinkMeasurementsOneHour";
  const before = await page
    .evaluate(
      (gid) => document.querySelectorAll(`[id^='${gid}_DXDataRow']`).length,
      gridId
    )
    .catch(() => 0);
  const triggered = await page
    .evaluate(
      ([gid, sz]) => {
        const w = window as unknown as Record<string, unknown>;
        const aspx = w["ASPx"] as
          | { GVPagerOnClick?: (id: string, val: string) => void }
          | undefined;
        if (aspx && typeof aspx.GVPagerOnClick === "function") {
          try {
            aspx.GVPagerOnClick(gid as string, String(sz));
            return "ASPx.GVPagerOnClick";
          } catch {
            /* fall through */
          }
        }
        return "noop";
      },
      [gridId, size] as const
    )
    .catch(() => "error");
  // Poll DOM row count until grid rerenders (or stabilises) — same approach as
  // setGridPageSize() in scraper.ts.
  const deadline = Date.now() + 12000;
  let after = before;
  let stableTicks = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const n = await page
      .evaluate(
        (gid) => document.querySelectorAll(`[id^='${gid}_DXDataRow']`).length,
        gridId
      )
      .catch(() => after);
    if (n > before) {
      after = n;
      await page.waitForTimeout(400);
      after = await page
        .evaluate(
          (gid) => document.querySelectorAll(`[id^='${gid}_DXDataRow']`).length,
          gridId
        )
        .catch(() => after);
      break;
    }
    if (n === after) {
      stableTicks++;
      if (stableTicks >= 4) break;
    } else {
      after = n;
      stableTicks = 0;
    }
  }
  logger.info(
    {
      gridId,
      requestedSize: size,
      triggered,
      rowsBefore: before,
      rowsAfter: after,
    },
    "setMeasurementsGridPageSize result"
  );
}

export async function fetchHourlyTelemetry(
  page: Page,
  baseUrl: string,
  credentialId: number,
  isFirstFull: boolean
): Promise<{ inserted: number; updated: number; rows: number }> {
  try {
    await page.goto(`${baseUrl}/Starlink/Telemetry/Measurements`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
  } catch (e) {
    logger.warn(
      { err: (e as Error).message },
      "Measurements sayfası açılamadı (atlandı)"
    );
    return { inserted: 0, updated: 0, rows: 0 };
  }

  // Grid'in oluşmasını bekle.
  await page
    .locator("[id*='gvStarlinkMeasurementsOneHour']")
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});

  // setGridPageSize pattern (proven in scraper.ts) → page size 200; sonra
  // DevExpress pager ile gerçek sayfa-sayfa traverse. Telemetry tablosu
  // (credential_id, kit_no, interval_start) unique → overlap-safe upsert,
  // tekrar çekilen saatler güncellenir, duplicate yok.
  // - First-full: en fazla 10 sayfa (200 × 10 = 2000 satır → ~10 gün × 24h ×
  //   8 KIT için yeterli headroom).
  // - Incremental: 2 sayfa yeter (en taze saatler + 1 önceki sayfa overlap).
  await setMeasurementsGridPageSize(page, 200);
  // Task spec: first-full = ~80 sayfa derinlik (10 günlük backfill garantisi),
  // incremental = 2 sayfa (overlap-safe upsert). Pager `goToNextMeasurementsPage`
  // disabled olunca erken çıkar — boş sayfalar 80 limitine kadar çalışmaz.
  const maxPages = isFirstFull ? 80 : 2;
  let inserted = 0;
  let updated = 0;
  let totalRows = 0;
  let pageIdx = 0;

  for (; pageIdx < maxPages; pageIdx++) {
    const rows = await parseMeasurementsPage(page);
    if (rows.length === 0) break;
    totalRows += rows.length;

    for (const r of rows) {
      const c = r.cells;
      const values = {
        credentialId,
        kitNo: r.kitNo,
        intervalStart: r.intervalStart,
        downloadMinMbps: c[0],
        downloadAvgMbps: c[1],
        downloadMaxMbps: c[2],
        uploadMinMbps: c[3],
        uploadAvgMbps: c[4],
        uploadMaxMbps: c[5],
        latencyMinMs: c[6],
        latencyAvgMs: c[7],
        latencyMaxMs: c[8],
        pingDropMinPct: c[9],
        pingDropAvgPct: c[10],
        pingDropMaxPct: c[11],
        obstructionMinPct: c[12],
        obstructionAvgPct: c[13],
        obstructionMaxPct: c[14],
        signalQualityMinPct: c[15],
        signalQualityAvgPct: c[16],
        signalQualityMaxPct: c[17],
        scrapedAt: new Date(),
      };
      const result = await db
        .insert(stationKitTelemetryHourly)
        .values(values)
        .onConflictDoUpdate({
          target: [
            stationKitTelemetryHourly.credentialId,
            stationKitTelemetryHourly.kitNo,
            stationKitTelemetryHourly.intervalStart,
          ],
          set: { ...values, scrapedAt: new Date() },
        })
        .returning({ inserted: sql<boolean>`xmax = 0` });
      const wasInserted = result[0]?.inserted === true;
      if (wasInserted) inserted++;
      else updated++;
    }

    const moved = await goToNextMeasurementsPage(page);
    if (!moved) break;
  }

  logger.info(
    {
      credentialId,
      pages: pageIdx + 1,
      maxPages,
      rows: totalRows,
      inserted,
      updated,
      isFirstFull,
    },
    "Saatlik telemetri kaydedildi"
  );
  return { inserted, updated, rows: totalRows };
}

async function goToNextMeasurementsPage(page: Page): Promise<boolean> {
  const gridPrefix = "ctl00_ContentPlaceHolder1_gvStarlinkMeasurementsOneHour";
  // Sayfa değişimini içerik-imzası ile algıla. DevExpress satır id'leri
  // (`...DXDataRow0`, `DXDataRow1`...) sayfalar arası SABİT kalır; sadece
  // hücre metni (özellikle KIT no + saatlik timestamp) değişir. Bu yüzden
  // snapshot olarak ilk birkaç satırın hücre içeriğini birleştirip kullan.
  const sigFn = (gid: string) => {
    const rows = Array.from(
      document.querySelectorAll(`[id^='${gid}_DXDataRow']`)
    ).slice(0, 3) as HTMLElement[];
    return rows
      .map((tr) =>
        Array.from(tr.querySelectorAll("td"))
          .slice(0, 2)
          .map((td) => (td.textContent || "").trim())
          .join("|")
      )
      .join("§");
  };
  const before = await page.evaluate(sigFn, gridPrefix).catch(() => "");

  // En güvenli yol: ASPx.GVPagerOnClick(gridId, 'PBN') = page button next.
  // SetValue/PerformCallback/__doPostBack silently fail (replit.md), bu
  // mekanizma `setGridPageSize` ile aynı API.
  const triggered = await page
    .evaluate((gid) => {
      const w = window as unknown as Record<string, unknown>;
      const aspx = w["ASPx"] as
        | { GVPagerOnClick?: (id: string, val: string) => void }
        | undefined;
      if (aspx && typeof aspx.GVPagerOnClick === "function") {
        try {
          aspx.GVPagerOnClick(gid, "PBN");
          return "ASPx.GVPagerOnClick(PBN)";
        } catch {
          /* fall through */
        }
      }
      return "noop";
    }, gridPrefix)
    .catch(() => "error");

  if (triggered === "noop" || triggered === "error") {
    // Yedek: title='Next Page' resim/butonu (DevExpress pager).
    const fallback = page
      .locator(
        `[id*='${gridPrefix}'] img[title='Next Page' i], [id*='${gridPrefix}'] .dxp-button[title='Next Page' i]`
      )
      .first();
    if ((await fallback.count()) === 0) return false;
    const disabled = await fallback
      .evaluate((el) =>
        /Disabled|disabled/.test((el as HTMLElement).className || "")
      )
      .catch(() => false);
    if (disabled) return false;
    await fallback.click({ timeout: 5000 }).catch(() => {});
  }

  // Grid yenilenene kadar bekle — ilk satırların hücre içeriği değişmeli.
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    const nowSig = await page.evaluate(sigFn, gridPrefix).catch(() => before);
    if (nowSig && nowSig !== before) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 3) CardDetails — KIT meta + abonelik geçmişi + son oturum
// ---------------------------------------------------------------------------

const MONTHS_FULL: Record<string, string> = MONTHS_3;

function parseLongDate(value: string | null | undefined): string | null {
  // "01 Jan 2026" veya "01 Jan 2026 00:00"
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS_FULL[m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

function parseLongDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mm = MONTHS_FULL[m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
  if (!mm) return null;
  const iso = `${m[3]}-${mm}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

interface CardDetailsParse {
  imsi: string | null;
  imei: string | null;
  mobileNumber: string | null;
  costCenter: string | null;
  activationDate: string | null;
  activePlanName: string | null;
  activePlanStartedAt: string | null;
  activeSubscriptionId: string | null;
  optOutGib: number | null;
  stepAlertGib: number | null;
  lastSessionStart: Date | null;
  lastSessionEnd: Date | null;
  lastSessionActive: boolean | null;
  lastSessionType: string | null;
  subscriptionHistory: Array<{
    subscriptionId: string;
    startDate: string | null;
    endDate: string | null;
    customerId: string | null;
    customerName: string | null;
    pricePlanName: string | null;
  }>;
}

async function parseCardDetails(page: Page): Promise<CardDetailsParse | null> {
  const data = await page
    .evaluate(() => {
      // Yardımcı: bir tbInput'un yanındaki "narrowfield"in metnini bul.
      function fieldByLabelFor(forId: string): string | null {
        const lbl = document.querySelector(`label[for='${forId}']`);
        if (!lbl) return null;
        const td = lbl.closest("td");
        const tr = td?.parentElement;
        if (!tr) return null;
        const tds = tr.querySelectorAll("td");
        if (tds.length < 2) return null;
        return (tds[1].textContent || "").trim();
      }
      const subLink = document.querySelector(
        "#ctl00_ContentPlaceHolder1_lbSubscriptionLink a"
      ) as HTMLAnchorElement | null;
      const subId =
        subLink?.href?.match(/SubscriptionID=(\d+)/i)?.[1] ?? null;

      const monitorHtml =
        document.querySelector("#ctl00_ContentPlaceHolder1_lbTrafficMonitorSummary")
          ?.innerHTML ?? "";

      // Subscription History grid satırları
      const subRows: Array<{
        subscriptionId: string | null;
        startDate: string | null;
        endDate: string | null;
        customerId: string | null;
        customerName: string | null;
        pricePlanName: string | null;
      }> = [];
      document
        .querySelectorAll(
          "[id*='gvSubscriptionHistory_DXDataRow']"
        )
        .forEach((tr) => {
          const tds = Array.from(tr.querySelectorAll("td"));
          if (tds.length < 5) return;
          const subAnchor = tds[0].querySelector("a") as HTMLAnchorElement | null;
          subRows.push({
            subscriptionId: (subAnchor?.textContent || tds[0].textContent || "").trim() || null,
            startDate: (tds[1].textContent || "").trim() || null,
            endDate: (tds[2].textContent || "").trim() || null,
            customerId: (tds[3].textContent || "").trim() || null,
            customerName: tds[3].getAttribute("title") || null,
            pricePlanName: (tds[4].textContent || "").trim() || null,
          });
        });

      // Last Session End "(this session still seems to be running)" → active.
      const lastEndText =
        fieldByLabelFor("ctl00_ContentPlaceHolder1_tbLastSessionEnd") || "";
      const stillRunning = /still\s+seems\s+to\s+be\s+running/i.test(lastEndText);

      return {
        imsi: fieldByLabelFor("ctl00_ContentPlaceHolder1_tbIMSI"),
        imei: fieldByLabelFor("ctl00_ContentPlaceHolder1_tbIMEI"),
        mobileNumber: fieldByLabelFor("ctl00_ContentPlaceHolder1_tbMMSISDN"),
        costCenter: fieldByLabelFor("ctl00_ContentPlaceHolder1_tbCostCenter"),
        activationDate: fieldByLabelFor(
          "ctl00_ContentPlaceHolder1_tbActivationDate"
        ),
        activePlanName: fieldByLabelFor("ctl00_ContentPlaceHolder1_tbPricePlan"),
        activePlanStartedAt: fieldByLabelFor(
          "ctl00_ContentPlaceHolder1_dbSubscriptionStart"
        ),
        activeSubscriptionId: subId,
        monitorHtml,
        lastSessionStartText: fieldByLabelFor(
          "ctl00_ContentPlaceHolder1_tbLastSessionStart"
        ),
        lastSessionEndText: lastEndText,
        lastSessionTypeText: fieldByLabelFor(
          "ctl00_ContentPlaceHolder1_tbLastSessionType"
        ),
        lastSessionActive: stillRunning,
        subRows,
      };
    })
    .catch(() => null);
  if (!data) return null;

  const optOut = data.monitorHtml.match(
    /Opt\s+Out\s+when[^<]*?exceeds\s+(\d+(?:[.,]\d+)?)\s*GigaBytes/i
  );
  const stepAlert = data.monitorHtml.match(
    /Send\s+Alert\s+when[^<]*?exceeds\s+(\d+(?:[.,]\d+)?)\s*GigaBytes/i
  );

  return {
    imsi: data.imsi,
    imei: data.imei,
    mobileNumber: data.mobileNumber,
    costCenter: data.costCenter,
    activationDate: parseLongDate(data.activationDate),
    activePlanName: data.activePlanName,
    activePlanStartedAt: parseLongDate(data.activePlanStartedAt),
    activeSubscriptionId: data.activeSubscriptionId,
    optOutGib: optOut ? parseFloat(optOut[1].replace(",", ".")) : null,
    stepAlertGib: stepAlert ? parseFloat(stepAlert[1].replace(",", ".")) : null,
    lastSessionStart: parseLongDateTime(data.lastSessionStartText),
    lastSessionEnd: parseLongDateTime(data.lastSessionEndText),
    lastSessionActive: data.lastSessionActive,
    lastSessionType: data.lastSessionTypeText,
    subscriptionHistory: data.subRows
      .filter((r) => r.subscriptionId)
      .map((r) => ({
        subscriptionId: r.subscriptionId as string,
        startDate: parseLongDate(r.startDate),
        endDate: parseLongDate(r.endDate),
        customerId: r.customerId,
        customerName: r.customerName,
        pricePlanName: r.pricePlanName,
      })),
  };
}

export async function enrichCardDetails(
  page: Page,
  baseUrl: string,
  credentialId: number,
  kits: KitListEntry[]
): Promise<{ updated: number; failed: number }> {
  // CardDetails.aspx?ICCID=... direkt goto edilirse ASP.NET ErrorPage döner
  // (replit.md gotcha). Tek güvenli yol ratedCdrs grid'inde KIT satırının
  // detay link'ini tıklamak — `enrichShipNames` ile aynı pattern.
  // Bu nedenle önce ratedCdrs'e dön, sonra her KIT için link.click() yap;
  // her tıklama sonrası geri dön ki bir sonraki click'in bağlamı kaybolmasın.
  let updated = 0;
  let failed = 0;

  // Map / Measurements bizi başka sayfalara götürdü — ratedCdrs'e dön.
  const cdrLink0 = page
    .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
    .first();
  if ((await cdrLink0.count()) > 0) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
      cdrLink0.click().catch(() => {}),
    ]);
  }

  for (const k of kits) {
    try {
      if (!k.detailHref) {
        failed++;
        logger.warn({ kitNo: k.kitNo }, "CardDetails: detailHref yok (atlandı)");
        continue;
      }
      const link = page.locator(`a[href="${k.detailHref}"]`).first();
      if ((await link.count()) === 0) {
        failed++;
        logger.warn({ kitNo: k.kitNo }, "CardDetails: grid link bulunamadı (atlandı)");
        continue;
      }
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
        link.click({ timeout: 10000 }).catch(() => {}),
      ]);
      if (
        /ErrorPage/i.test(page.url()) ||
        (await page.locator("text=ErrorPage").count()) > 0
      ) {
        failed++;
        logger.warn({ kitNo: k.kitNo, url: page.url() }, "CardDetails ErrorPage döndü (atlandı)");
        // ratedCdrs'e dönmeyi dene — bir sonraki tıklamanın bağlamı bozulmasın.
        const back = page
          .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
          .first();
        if ((await back.count()) > 0) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {}),
            back.click().catch(() => {}),
          ]);
        }
        continue;
      }
      const parsed = await parseCardDetails(page);
      if (!parsed) {
        failed++;
        continue;
      }
      const now = new Date();
      await db
        .update(stationKits)
        .set({
          imsi: parsed.imsi,
          imei: parsed.imei,
          mobileNumber: parsed.mobileNumber,
          costCenter: parsed.costCenter,
          activationDate: parsed.activationDate,
          activePlanName: parsed.activePlanName,
          activePlanStartedAt: parsed.activePlanStartedAt,
          activeSubscriptionId: parsed.activeSubscriptionId,
          optOutGib: parsed.optOutGib,
          stepAlertGib: parsed.stepAlertGib,
          lastSessionStart: parsed.lastSessionStart,
          lastSessionEnd: parsed.lastSessionEnd,
          lastSessionActive: parsed.lastSessionActive,
          lastSessionType: parsed.lastSessionType,
          cardDetailsSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(stationKits.kitNo, k.kitNo));

      for (const sub of parsed.subscriptionHistory) {
        await db
          .insert(stationKitSubscriptionHistory)
          .values({
            credentialId,
            kitNo: k.kitNo,
            subscriptionId: sub.subscriptionId,
            startDate: sub.startDate,
            endDate: sub.endDate,
            customerId: sub.customerId,
            customerName: sub.customerName,
            pricePlanName: sub.pricePlanName,
            scrapedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              stationKitSubscriptionHistory.credentialId,
              stationKitSubscriptionHistory.kitNo,
              stationKitSubscriptionHistory.subscriptionId,
            ],
            set: {
              startDate: sub.startDate,
              endDate: sub.endDate,
              customerId: sub.customerId,
              customerName: sub.customerName,
              pricePlanName: sub.pricePlanName,
              scrapedAt: now,
            },
          });
      }
      updated++;
    } catch (e) {
      failed++;
      logger.warn(
        { kitNo: k.kitNo, err: (e as Error).message },
        "CardDetails enrich başarısız"
      );
    }

    // Bir sonraki KIT'in link'ini bulabilmek için ratedCdrs'e dön.
    const back = page
      .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
      .first();
    if ((await back.count()) > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {}),
        back.click().catch(() => {}),
      ]);
    }
  }
  logger.info(
    { credentialId, updated, failed, total: kits.length },
    "CardDetails enrichment tamamlandı"
  );
  return { updated, failed };
}
