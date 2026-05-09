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
import { and, eq, sql } from "drizzle-orm";
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
        target: [stationKitLocation.credentialId, stationKitLocation.kitNo],
        set: {
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

// Bu Measurements gridinde page-size dropdown YOK. Onun yerine DevExpress
// "Moderno" pager butonları kullanılıyor: dxWeb_pFirst/pPrev/pNext/pLast_Moderno.
// Strateji: önce gridin satır basmasını bekle, sonra "Last" butonuyla
// pager'ın sonuna atla (en güncel veri orada — sayfa sıralaması ASC),
// ardından N sayfa "Prev" ile geri yürü. Her sayfa upsert overlap-safe.
async function waitForMeasurementsRows(
  page: Page,
  timeoutMs = 15000
): Promise<number> {
  const gridPrefix = "ctl00_ContentPlaceHolder1_gvStarlinkMeasurementsOneHour";
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    const n = await page
      .evaluate(
        (gid) => document.querySelectorAll(`[id^='${gid}_DXDataRow']`).length,
        gridPrefix
      )
      .catch(() => 0);
    if (n > 0) return n;
    last = n;
    await page.waitForTimeout(300);
  }
  return last;
}

// Grid imza fonksiyonu — pager disabled / no-op tespiti için.
const measurementsSigFn = (gid: string) => {
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

// ASPx.GVPagerOnClick komutları:
//   PBF=First, PBP=Prev, PBN=Next, PBL=Last, "<n>"=spesifik sayfa
//   sayısal değer (ör. "50") = page-size değişikliği → grid'i AJAX ile yeniden
//   yükler. Bu portalda goto sonrası grid boş geliyor; page-size komutu
//   hem grid'i uyandırır hem yükler.
async function fireMeasurementsPager(
  page: Page,
  command: "PBF" | "PBP" | "PBN" | "PBL" | string,
  label: string
): Promise<{ triggered: boolean; movedSig: boolean }> {
  const gridPrefix = "ctl00_ContentPlaceHolder1_gvStarlinkMeasurementsOneHour";
  const before = await page.evaluate(measurementsSigFn, gridPrefix).catch(() => "");

  const triggered = await page
    .evaluate(
      ([gid, cmd]) => {
        const w = window as unknown as Record<string, unknown>;
        const aspx = w["ASPx"] as
          | { GVPagerOnClick?: (id: string, val: string) => void }
          | undefined;
        if (aspx && typeof aspx.GVPagerOnClick === "function") {
          try {
            aspx.GVPagerOnClick(gid as string, cmd as string);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      },
      [gridPrefix, command] as const
    )
    .catch(() => false);

  if (!triggered) {
    // Yedek: DOM butonuna tıkla (Moderno theme).
    const clsMap: Record<string, string> = {
      PBF: "dxWeb_pFirst_Moderno",
      PBP: "dxWeb_pPrev_Moderno",
      PBN: "dxWeb_pNext_Moderno",
      PBL: "dxWeb_pLast_Moderno",
    };
    const cls = clsMap[command];
    const btn = page.locator(`[id*='${gridPrefix}'] .${cls}`).first();
    if ((await btn.count().catch(() => 0)) === 0) {
      logger.info({ command, label }, "Pager: ASPx yok ve DOM butonu yok");
      return { triggered: false, movedSig: false };
    }
    await btn.click({ timeout: 5000 }).catch(() => {});
  }

  // Grid imzası değişene kadar bekle (yeniden render).
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    const nowSig = await page.evaluate(measurementsSigFn, gridPrefix).catch(() => before);
    if (nowSig && nowSig !== before) {
      return { triggered: true, movedSig: true };
    }
  }
  return { triggered: true, movedSig: false };
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

  // Grid container'ı bekle. Bu portalda satırlar AJAX ile geç yükleniyor —
  // grid'i "uyandırmak" için PBL (Last) komutu gönderiyoruz; bu hem grid'i
  // doldurur hem de en güncel sayfaya götürür (sıralama ASC).
  await page
    .locator("[id*='gvStarlinkMeasurementsOneHour']")
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});

  // DEBUG: Measurements sayfasının DOM durumunu logla.
  const probe = await page
    .evaluate(() => {
      const gid = "ctl00_ContentPlaceHolder1_gvStarlinkMeasurementsOneHour";
      const w = window as unknown as Record<string, unknown>;
      const aspx = w["ASPx"] as
        | { GVPagerOnClick?: (id: string, val: string) => void }
        | undefined;
      const allRows = document.querySelectorAll(
        `[id*='${gid}'] tr[id*='DXDataRow']`
      ).length;
      const directRows = document.querySelectorAll(
        `[id^='${gid}_DXDataRow']`
      ).length;
      const pagerBtns = Array.from(
        document.querySelectorAll(`[id*='${gid}'] [class*='dxWeb_p']`)
      )
        .map((el) => (el as HTMLElement).className)
        .slice(0, 8);
      const containerHtmlLen =
        document.querySelector(`[id*='${gid}']`)?.innerHTML.length ?? 0;
      const iframes = Array.from(document.querySelectorAll("iframe"))
        .map((f) => (f as HTMLIFrameElement).id || "(no-id)")
        .slice(0, 5);
      // Sayfadaki tüm "gv" prefix'li ID'leri ve büyük tabloları listele.
      const allGvIds = Array.from(document.querySelectorAll("[id*='gv']"))
        .map((el) => el.id)
        .filter((id) => id && !id.includes("_DX") && id.length < 100)
        .slice(0, 20);
      const tableIds = Array.from(document.querySelectorAll("table[id]"))
        .map((t) => (t as HTMLTableElement).id)
        .filter((id) => id.length < 80)
        .slice(0, 15);
      const measurementsIds = Array.from(
        document.querySelectorAll("[id*='easurement'], [id*='easur']")
      )
        .map((el) => el.id)
        .filter((id) => id.length < 100)
        .slice(0, 10);
      const bodyTextSnippet = (document.body.innerText || "").slice(0, 400);
      return {
        url: location.href,
        title: document.title,
        hasASPx: typeof aspx?.GVPagerOnClick === "function",
        allRows,
        directRows,
        pagerBtns,
        containerHtmlLen,
        iframes,
        allGvIds,
        tableIds,
        measurementsIds,
        bodyTextSnippet,
      };
    })
    .catch((e) => ({ err: (e as Error).message }));
  logger.info({ credentialId, probe }, "Measurements DOM probe");

  // 1) WAKE: page-size komutu grid'i AJAX ile yeniden yükler. PBL boş gridde
  //    no-op olur; önce default sayfa verilerini yüklemek şart.
  const wake = await fireMeasurementsPager(page, "50", "wake-50");
  const wokeRows = await waitForMeasurementsRows(page, 20000);
  if (wokeRows === 0) {
    logger.warn(
      { credentialId, wake },
      "Measurements grid satır basmadı (telemetri atlandı)"
    );
    return { inserted: 0, updated: 0, rows: 0 };
  }
  // 2) Sonuna atla — sıralama ASC, son sayfa = en güncel.
  const lastJump = await fireMeasurementsPager(page, "PBL", "Last");
  await waitForMeasurementsRows(page, 10000);
  logger.info({ credentialId, wokeRows, lastJump }, "Measurements: PBL sonrası");

  // Bu gridde page-size dropdown YOK. Strateji: PBL ile en son sayfaya atla
  // (yukarıda yapıldı), sonra PBP ile N sayfa geri yürü. Yazımlar
  // (credential_id, kit_no, interval_start) unique key üzerinde upsert —
  // tekrar çekilen saatler güncellenir.
  // First-full: 14 sayfa (~14 gün headroom), incremental: 7 sayfa (~1 hafta).
  const maxPages = isFirstFull ? 14 : 7;

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

    if (pageIdx === maxPages - 1) break;
    const prev = await fireMeasurementsPager(page, "PBP", "Prev");
    if (!prev.movedSig) break;
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
  // Menü click → grid'in dolmasını bekle (KITP linkleri görünene kadar).
  async function ensureRatedCdrsGrid(label: string): Promise<boolean> {
    // Önce menü linkini dene; yoksa (örn. Starlink/Telemetry alt sayfasındayız)
    // doğrudan URL'e git. Oturum kurulu olduğundan direct goto güvenli — bu
    // gotcha "login'den hemen sonra" için geçerli, enrichment sonrasında değil.
    const cdrLink = page
      .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
      .first();
    if ((await cdrLink.count()) > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
        cdrLink.click().catch(() => {}),
      ]);
    } else {
      await page
        .goto(`${baseUrl}/RatedCdrs.aspx`, { waitUntil: "networkidle", timeout: 25000 })
        .catch((e) =>
          logger.warn(
            { label, err: (e as Error).message },
            "CardDetails: ratedCdrs direct-goto failed"
          )
        );
    }
    // Grid hazır olana kadar (KITP link'i görünene dek) 10sn bekle.
    try {
      await page
        .locator("#ctl00_ContentPlaceHolder1_gvRatedCdr a:text-matches('^KITP', 'i')")
        .first()
        .waitFor({ state: "visible", timeout: 10000 });
      return true;
    } catch {
      const url = page.url();
      const sample = await page
        .locator("#ctl00_ContentPlaceHolder1_gvRatedCdr a")
        .evaluateAll((els) => els.slice(0, 5).map((e) => (e.textContent || "").trim()))
        .catch(() => [] as string[]);
      logger.warn(
        { label, url, sample },
        "CardDetails: ratedCdrs grid'inde KITP link'i görünmedi"
      );
      return false;
    }
  }
  await ensureRatedCdrsGrid("initial");

  for (const k of kits) {
    try {
      // KIT'in grid'deki link'ini KIT no text'inden bul (href format
      // farklılıklarına bağımlı değil). Önce gvRatedCdr içinde, yoksa
      // sayfa genelinde ara.
      let link = page
        .locator("#ctl00_ContentPlaceHolder1_gvRatedCdr a", { hasText: k.kitNo })
        .first();
      if ((await link.count()) === 0 && k.detailHref) {
        link = page.locator(`a[href="${k.detailHref}"]`).first();
      }
      if ((await link.count()) === 0) {
        // Bir kerelik grid'i tekrar yüklemeyi dene.
        await ensureRatedCdrsGrid(`retry ${k.kitNo}`);
        link = page
          .locator("#ctl00_ContentPlaceHolder1_gvRatedCdr a", { hasText: k.kitNo })
          .first();
      }
      if ((await link.count()) === 0) {
        failed++;
        logger.warn(
          { kitNo: k.kitNo, url: page.url() },
          "CardDetails: grid link bulunamadı (atlandı)"
        );
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
        .where(
          and(
            eq(stationKits.credentialId, credentialId),
            eq(stationKits.kitNo, k.kitNo)
          )
        );

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
