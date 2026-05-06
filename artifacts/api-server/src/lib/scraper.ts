import {
  db,
  stationKits,
  stationKitDaily,
  stationKitPeriodTotal,
  stationCredentials,
} from "@workspace/db";
import { eq, inArray, sql, desc } from "drizzle-orm";
import { logger } from "./logger";
import type { Page, Browser } from "playwright";

export interface SyncResult {
  success: boolean;
  message: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
  screenshotPath?: string;
  htmlSnapshotPath?: string;
}

const VOLUME_REGEX = /^([\d.,]+)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB|Bytes?|B)$/i;

// Parse "13.17 GiB" / "234,5 MiB" / "0 Bytes" into a GiB number.
function parseGib(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(VOLUME_REGEX);
  if (!m) return null;
  let raw = m[1];
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasComma && !hasDot) raw = raw.replace(",", ".");
  else raw = raw.replace(/,/g, "");
  const num = parseFloat(raw);
  if (isNaN(num)) return null;
  const unit = m[2].toLowerCase();
  if (unit === "tib") return num * 1024;
  if (unit === "gib") return num;
  if (unit === "mib") return num / 1024;
  if (unit === "kib") return num / (1024 * 1024);
  if (unit === "tb") return num * 1000;
  if (unit === "gb") return num;
  if (unit === "mb") return num / 1024;
  if (unit === "kb") return num / (1024 * 1024);
  if (unit.startsWith("byte") || unit === "b") return num / (1024 * 1024 * 1024);
  return num;
}

function parseUsd(value: string | null | undefined): number | null {
  if (!value) return null;
  let raw = value.trim().replace(/[^\d.,-]/g, "");
  if (!raw) return null;
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasComma && !hasDot) raw = raw.replace(",", ".");
  else raw = raw.replace(/,/g, "");
  const num = parseFloat(raw);
  return isNaN(num) ? null : num;
}

// Extract YYYY-MM-DD from a portal date cell. Accepts:
//   "2026-04-17 22:31:18" → "2026-04-17"
//   "17/04/2026 22:31"    → "2026-04-17"
//   "17.04.2026"          → "2026-04-17"
function parseDayDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  // ISO-ish first
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy or dd.mm.yyyy
  const eu = v.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return null;
}

export interface KitListEntry {
  kitNo: string;
  detailHref: string | null;
  iccid: string | null;
}

// ---------------------------------------------------------------------------
// Login + reach the Rated CDRs grid via menu click. Returns the page that
// is now sitting on /ratedCdrs.aspx with the grid loaded. Throws on failure.
// ---------------------------------------------------------------------------
async function loginAndOpenRatedCdrs(
  page: Page,
  baseUrl: string,
  username: string,
  password: string
): Promise<void> {
  await page
    .goto(`${baseUrl}/Account/Login`, { waitUntil: "networkidle" })
    .catch(async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
    });

  const usernameInput = page
    .locator(
      "input[name='Email'], input[id='Email'], input[name='UserName'], input[id='UserName'], input[name*='user' i], input[id*='user' i], input[type='email'], input[type='text']:not([type='hidden'])"
    )
    .first();
  if (!(await usernameInput.count())) {
    throw new Error(`Login form not found at ${page.url()}`);
  }
  await usernameInput.fill(username);
  const passwordInput = page.locator("input[type='password']").first();
  await passwordInput.fill(password);

  const submit = page
    .locator(
      "button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Giriş'), button:has-text('Sign in')"
    )
    .first();
  const hasSubmit = (await submit.count()) > 0;
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
    hasSubmit ? submit.click() : passwordInput.press("Enter"),
  ]);

  const stillOnLogin =
    /Account\/Login/i.test(page.url()) ||
    (await page.locator("input[type='password']").count()) > 0;
  if (stillOnLogin) {
    throw new Error(`Login failed (still on login page: ${page.url()})`);
  }

  // Click the menu link to ratedCdrs.aspx — direct goto loses the session.
  const cdrLink = page
    .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
    .first();
  if ((await cdrLink.count()) > 0) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
      cdrLink.click(),
    ]);
  } else {
    await page
      .goto(`${baseUrl}/ratedCdrs.aspx`, { waitUntil: "networkidle", timeout: 30000 })
      .catch(() => {});
  }

  if (/Account\/Login/i.test(page.url())) {
    throw new Error(`Reached login page when opening ratedCdrs (${page.url()})`);
  }
  await page
    .locator("#ctl00_ContentPlaceHolder1_gvRatedCdr, [id*='gvRatedCdr'], [id*='RatedCdr']")
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Read the unique KIT list from the rated-CDRs main grid. Each KITP link's
// href contains the ICCID (used later for direct ?FC=ICCID&FV=... URLs).
// ---------------------------------------------------------------------------
async function extractKitList(page: Page): Promise<KitListEntry[]> {
  const rows: KitListEntry[] = await page.evaluate(() => {
    const grid =
      document.querySelector("#ctl00_ContentPlaceHolder1_gvRatedCdr") ||
      document.querySelector("[id*='gvRatedCdr']") ||
      document.querySelector("[id*='RatedCdr']") ||
      document.body;
    const links = Array.from(grid.querySelectorAll("a")) as HTMLAnchorElement[];
    const seen = new Set<string>();
    const out: { kitNo: string; detailHref: string | null; iccid: string | null }[] = [];
    for (const a of links) {
      const text = (a.textContent || "").trim();
      if (!text.startsWith("KITP")) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      const href = a.getAttribute("href");
      let iccid: string | null = null;
      if (href) {
        const m = href.match(/[?&]FV=([^&]+)/i);
        if (m) iccid = decodeURIComponent(m[1]);
      }
      out.push({ kitNo: text, detailHref: href, iccid });
    }
    return out;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Read the period combo options on the rated-CDRs page (filtered ≥202601 and
// ≤current YYYYMM). We do this once per sync.
// ---------------------------------------------------------------------------
async function readPeriodOptions(page: Page): Promise<string[]> {
  const opts: string[] = await page.evaluate(() => {
    const out: string[] = [];

    // 1) DevExpress combo control via window global — preferred path.
    try {
      const w = window as unknown as Record<string, unknown>;
      const combo = w["ctl00_ContentPlaceHolder1_ctl00_ctl00"] as
        | {
            GetItemCount?: () => number;
            GetItem?: (i: number) => { value?: unknown; text?: unknown } | null;
          }
        | undefined;
      if (combo && typeof combo.GetItemCount === "function" && typeof combo.GetItem === "function") {
        const n = combo.GetItemCount();
        for (let i = 0; i < n; i++) {
          const item = combo.GetItem(i);
          if (!item) continue;
          const v = item.value ?? item.text;
          if (v != null) out.push(String(v));
        }
        if (out.length > 0) return out;
      }
    } catch {
      /* fall through to DOM fallback */
    }

    // 2) Fallback — find a real <select> with options[]
    const candidates = Array.from(
      document.querySelectorAll(
        "select[id*='ctl00_ContentPlaceHolder1_ctl00_ctl00'], select[id*='Period' i], select[id*='ctl00']"
      )
    );
    for (const el of candidates) {
      const sel = el as HTMLSelectElement;
      if (sel && sel.options && sel.options.length > 0) {
        for (const o of Array.from(sel.options)) {
          const v = o.value || o.text;
          if (v) out.push(v);
        }
        if (out.length > 0) return out;
      }
    }

    // 3) Last resort — scan any element under the combo wrapper for items
    //    that look like YYYYMM (DevExpress sometimes renders <td class="dxeListBoxItem">)
    const items = Array.from(document.querySelectorAll("[id*='_DDD_L'] *, [id*='_DDD_DXI'] *"));
    for (const it of items) {
      const t = (it.textContent || "").trim();
      if (/^\d{6}$/.test(t)) out.push(t);
    }
    return out;
  });
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const filtered = opts
    .map((o) => o.trim())
    .filter((o) => /^\d{6}$/.test(o))
    .filter((o) => o >= "202601" && o <= currentPeriod);
  // newest first
  filtered.sort((a, b) => (a < b ? 1 : -1));
  // dedupe
  return Array.from(new Set(filtered));
}

// ---------------------------------------------------------------------------
// Set the period combo to the requested YYYYMM and trigger Refresh button.
// ---------------------------------------------------------------------------
async function selectPeriod(page: Page, period: string): Promise<void> {
  await page.evaluate((p) => {
    const w = window as unknown as Record<string, unknown>;
    const combo =
      (w["ctl00_ContentPlaceHolder1_ctl00_ctl00"] as
        | { SetValue: (v: string) => void }
        | undefined) ?? null;
    if (combo && typeof combo.SetValue === "function") {
      combo.SetValue(p);
    }
  }, period);

  // Click the Refresh button. The visible UI button typically has id ending
  // in "btnRefresh" or text "Refresh"/"Yenile".
  const refresh = page
    .locator(
      "[id*='btnRefresh' i], input[value='Refresh' i], input[value='Yenile' i], button:has-text('Refresh'), button:has-text('Yenile')"
    )
    .first();
  if ((await refresh.count()) > 0) {
    await refresh.click().catch(() => {});
  }

  // Wait for grid reload (DevExpress DXMVCCallback usually). Best-effort.
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
}

interface ParsedDailyRow {
  cdrId: string;
  dayDate: string | null;
  volumeGib: number | null;
  chargeUsd: number | null;
  period: string | null;
  service: string | null;
}

interface ParsedGrid {
  rows: ParsedDailyRow[];
  footerGib: number | null;
  footerUsd: number | null;
  diag: GridDiag;
}

interface GridDiag {
  rowSelectorUsed: string | null;
  rowsFound: number;
  isEmptyMarker: boolean;
  firstRowCellCount: number;
  firstRowSample: string;
  gridHtmlLen: number;
}

// Wait for either a data row OR the DevExpress "no data" marker to appear,
// so we never parse a grid that's still loading.
async function waitForGridReady(page: Page, label: string): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const sels = [
          "tr[id*='DXDataRow']",
          "tr.dxgvDataRow",
          "tr[class*='dxgvDataRow']",
          "tr[id*='DXEmptyRow']",
          "td[id*='DXEmptyRow']",
          "tr.dxgvEmptyDataRow",
        ];
        return sels.some((s) => document.querySelector(s) !== null);
      },
      { timeout: 15000 }
    );
  } catch {
    logger.warn({ label, url: page.url() }, "waitForGridReady timeout");
  }
}

// ---------------------------------------------------------------------------
// Parse the DevExpress grid rows and footer using the fixed column map:
//   col4=service, col9=tarih, col12=volume(GiB), col20=USD-bundle,
//   col22=USD-grand, col23=period, col24=cdrId
// ---------------------------------------------------------------------------
async function parseGrid(page: Page): Promise<ParsedGrid> {
  const data = await page.evaluate(() => {
    // Try a list of known DevExpress row selectors and report which one hit.
    const candidates: string[] = [
      "tr[id*='DXDataRow']",
      "tr.dxgvDataRow",
      "tr[class*='dxgvDataRow']",
      "[id*='gvRatedCdr'] tr[id*='DataRow']",
    ];
    let rowSelectorUsed: string | null = null;
    let dataRows: HTMLTableRowElement[] = [];
    for (const sel of candidates) {
      const found = Array.from(document.querySelectorAll(sel)) as HTMLTableRowElement[];
      if (found.length > 0) {
        rowSelectorUsed = sel;
        dataRows = found;
        break;
      }
    }
    const rowCells: string[][] = dataRows.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) =>
        (td.textContent || "").replace(/\s+/g, " ").trim()
      )
    );
    // Footer: DXFooter row inside the same grid.
    const footerTr =
      (document.querySelector("tr[id*='DXFooter']") as HTMLTableRowElement | null) ||
      (document.querySelector("tr.dxgvFooter") as HTMLTableRowElement | null);
    const footerCells = footerTr
      ? Array.from(footerTr.querySelectorAll("td")).map((td) =>
          (td.textContent || "").replace(/\s+/g, " ").trim()
        )
      : [];

    // Diagnostics — only used if rowCells is empty so we can debug.
    const isEmptyMarker =
      document.querySelector(
        "tr[id*='DXEmptyRow'], td[id*='DXEmptyRow'], tr.dxgvEmptyDataRow"
      ) !== null;
    const grid =
      document.querySelector("[id*='gvRatedCdr']") || document.querySelector("table");
    const gridHtml = grid ? grid.outerHTML.slice(0, 600) : "";
    return {
      rowCells,
      footerCells,
      diag: {
        rowSelectorUsed,
        rowsFound: dataRows.length,
        isEmptyMarker,
        firstRowCellCount: rowCells[0]?.length ?? 0,
        firstRowSample: rowCells[0] ? rowCells[0].slice(0, 26).join(" | ") : "",
        gridHtmlLen: gridHtml.length,
      },
    };
  });

  const rows: ParsedDailyRow[] = [];
  for (const cells of data.rowCells) {
    // Be lenient on column count: some portal layouts trim hidden cols.
    // Require at least the indices we actually read (up to col24 = cdrId).
    if (cells.length < 13) continue; // need at least up to col12 (GiB)
    const cdrId = (cells[24] ?? "").trim();
    if (!cdrId) continue;
    rows.push({
      cdrId,
      service: cells[4] || null,
      dayDate: parseDayDate(cells[9]),
      volumeGib: parseGib(cells[12]),
      chargeUsd: parseUsd(cells[22] || cells[20]),
      period: /^\d{6}$/.test(cells[23] ?? "") ? cells[23] : null,
    });
  }

  const footerGib = parseGib(data.footerCells[12]);
  const footerUsd = parseUsd(data.footerCells[22] || data.footerCells[20]);
  return { rows, footerGib, footerUsd, diag: data.diag };
}

// ---------------------------------------------------------------------------
// Persist parsed rows + footer into station_kit_daily and
// station_kit_period_total.
// ---------------------------------------------------------------------------
async function persistKitPeriod(
  kitNo: string,
  period: string,
  parsed: ParsedGrid
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  const now = new Date();

  // Atomic transaction: per-CDR upsert + period-total upsert. The xmax trick
  // tells us whether each row was an insert (xmax=0) or update.
  await db.transaction(async (tx) => {
    for (const r of parsed.rows) {
      if (!r.dayDate) continue;
      const result = await tx.execute(sql`
        INSERT INTO station_kit_daily
          (kit_no, period, day_date, volume_gib, charge_usd, service, cdr_id, scraped_at)
        VALUES
          (${kitNo}, ${period}, ${r.dayDate}, ${r.volumeGib}, ${r.chargeUsd},
           ${r.service}, ${r.cdrId}, ${now})
        ON CONFLICT (kit_no, period, cdr_id) DO UPDATE SET
          day_date   = EXCLUDED.day_date,
          volume_gib = EXCLUDED.volume_gib,
          charge_usd = EXCLUDED.charge_usd,
          service    = EXCLUDED.service,
          scraped_at = EXCLUDED.scraped_at
        RETURNING (xmax = 0) AS inserted
      `);
      const row = (result as unknown as { rows: Array<{ inserted: boolean }> })
        .rows[0];
      if (row?.inserted) inserted++;
      else updated++;
    }

    // Period total: ONLY upsert if we actually got a footer reading. The
    // caller already decided this is a non-empty period; if the footer is
    // missing here it means the grid was multi-page (pageSize mismatch) —
    // do NOT overwrite a previously valid total with NULL.
    if (parsed.footerGib != null || parsed.footerUsd != null) {
      await tx
        .insert(stationKitPeriodTotal)
        .values({
          kitNo,
          period,
          totalGib: parsed.footerGib,
          totalUsd: parsed.footerUsd,
          rowCount: parsed.rows.length,
        })
        .onConflictDoUpdate({
          target: [stationKitPeriodTotal.kitNo, stationKitPeriodTotal.period],
          set: {
            totalGib: parsed.footerGib,
            totalUsd: parsed.footerUsd,
            rowCount: parsed.rows.length,
            scrapedAt: now,
          },
        });
    }
  });

  return { inserted, updated };
}

// Confirm we are still authenticated on the rated-CDRs grid. Used after every
// goto/SetValue to detect silent session loss.
async function isOnRatedCdrsGrid(page: Page): Promise<boolean> {
  if (/Account\/Login/i.test(page.url())) return false;
  if (!/ratedCdrs\.aspx/i.test(page.url())) return false;
  const grid = page
    .locator("#ctl00_ContentPlaceHolder1_gvRatedCdr, [id*='gvRatedCdr']")
    .first();
  return (await grid.count()) > 0;
}

// ---------------------------------------------------------------------------
// Ship-name enrichment (preserved from previous scraper). Only KITs without
// a cached ship_name are visited; we click the link from ratedCdrs to keep
// ASP.NET viewstate / iframe wrapper.
// ---------------------------------------------------------------------------
async function enrichShipNames(
  page: Page,
  kits: KitListEntry[]
): Promise<void> {
  const havingHref = kits.filter((k) => k.detailHref);
  if (havingHref.length === 0) return;
  const cached = await db
    .select({ kitNo: stationKits.kitNo, shipName: stationKits.shipName })
    .from(stationKits)
    .where(inArray(stationKits.kitNo, havingHref.map((k) => k.kitNo)));
  const haveShipName = new Set(
    cached.filter((c) => c.shipName && c.shipName.trim() !== "").map((c) => c.kitNo)
  );
  const toFetch = havingHref.filter((k) => !haveShipName.has(k.kitNo));
  logger.info(
    { totalKits: havingHref.length, alreadyCached: haveShipName.size, toFetch: toFetch.length },
    "Ship-name enrichment plan"
  );

  for (const k of toFetch) {
    try {
      const href = k.detailHref!;
      const link = page.locator(`a[href="${href}"]`).first();
      if ((await link.count()) === 0) continue;
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
        link.click({ timeout: 10000 }).catch(() => {}),
      ]);
      const pairs: Record<string, string> = await page
        .evaluate(() => {
          const out: Record<string, string> = {};
          document.querySelectorAll("tr").forEach((tr) => {
            const cells = Array.from(tr.querySelectorAll("td, th"));
            if (cells.length >= 2) {
              const label = (cells[0].textContent || "")
                .trim()
                .replace(/[:：]\s*$/, "");
              const value = (cells[1].textContent || "").trim();
              if (label && value && label.length < 80 && !out[label]) out[label] = value;
            }
          });
          return out;
        })
        .catch(() => ({} as Record<string, string>));

      const PRIORITY: RegExp[] = [
        /^(ship\s*name|vessel\s*name|gemi\s*ad[ıi]?)$/i,
        /^(ship|vessel|gemi)$/i,
        /(ship|vessel)\s*name/i,
        /^(customer\s*name|customer)$/i,
        /^(installation\s*site|site\s*name|location)$/i,
        /^(kit\s*description|description|name)$/i,
      ];
      let shipName: string | null = null;
      for (const re of PRIORITY) {
        for (const [kk, vv] of Object.entries(pairs)) {
          if (re.test(kk) && vv.length > 1 && vv.length < 200 && !/^kitp/i.test(vv)) {
            shipName = vv;
            break;
          }
        }
        if (shipName) break;
      }

      const now = new Date();
      await db
        .insert(stationKits)
        .values({
          kitNo: k.kitNo,
          shipName,
          detailUrl: href,
          shipNameSyncedAt: shipName ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: stationKits.kitNo,
          set: {
            shipName: shipName ?? undefined,
            detailUrl: href,
            shipNameSyncedAt: shipName ? now : undefined,
            updatedAt: now,
          },
        });
      logger.info({ kitNo: k.kitNo, shipName }, "Ship-name fetched");

      // Navigate back to ratedCdrs via menu so the next click works.
      const cdrLink = page
        .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
        .first();
      if ((await cdrLink.count()) > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
          cdrLink.click(),
        ]);
      }
    } catch (e) {
      logger.warn({ kitNo: k.kitNo, err: (e as Error).message }, "Ship-name fetch failed (skipping)");
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry: full or incremental scrape. Strategy:
//   - First sync (firstFullSyncAt is null): walk every period from 202601
//     up to current YYYYMM for every KIT.
//   - Subsequent syncs: only current + previous period for every KIT.
// On the very first successful full run we set credentials.firstFullSyncAt.
// ---------------------------------------------------------------------------
export async function runSync(
  portalUrl: string,
  username: string,
  password: string,
  testOnly: boolean
): Promise<SyncResult> {
  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);

    const baseUrl = portalUrl.endsWith("/") ? portalUrl.slice(0, -1) : portalUrl;
    await loginAndOpenRatedCdrs(page, baseUrl, username, password);

    if (testOnly) {
      return {
        success: true,
        message: "Bağlantı başarılı! Giriş doğrulandı.",
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
      };
    }

    // 1) KIT listesi + ship-name enrichment (mevcut session üzerinden).
    const kits = await extractKitList(page);
    logger.info({ kitCount: kits.length }, "Discovered KITs");
    if (kits.length === 0) {
      return {
        success: false,
        message: "Rated CDRs sayfasında KITP linki bulunamadı (oturum/ payload sorunu).",
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
      };
    }
    await enrichShipNames(page, kits).catch((e) =>
      logger.warn({ err: (e as Error).message }, "Ship-name enrichment failed (non-fatal)")
    );

    // 2) Period listesi belirle + full vs incremental karar ver.
    // ratedCdrs sayfasında olduğumuzdan emin ol (enrich navigate etmiş olabilir).
    const cdrLink = page
      .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
      .first();
    if ((await cdrLink.count()) > 0 && !/ratedCdrs\.aspx/i.test(page.url())) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
        cdrLink.click(),
      ]);
    }

    const allPeriods = await readPeriodOptions(page);
    if (allPeriods.length === 0) {
      logger.warn("No periods read from combo; falling back to current month only");
      const now = new Date();
      const cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      allPeriods.push(cur);
    }

    const [creds] = await db
      .select()
      .from(stationCredentials)
      .orderBy(desc(stationCredentials.createdAt))
      .limit(1);
    const isFirstFull = !creds?.firstFullSyncAt;
    const periods = isFirstFull ? allPeriods : allPeriods.slice(0, 2);
    logger.info(
      { isFirstFull, periodCount: periods.length, periods: periods.slice(0, 5) },
      "Sync plan"
    );

    // 3) Her KIT için her period'u tara (direct URL + period combo override).
    let totalRows = 0;
    let totalInserted = 0;
    let totalUpdated = 0;

    for (const kit of kits) {
      if (!kit.iccid) {
        logger.warn({ kitNo: kit.kitNo }, "KIT has no ICCID in detail href; skipping");
        continue;
      }
      const directUrl = `${baseUrl}/ratedCdrs.aspx?FC=ICCID&FV=${encodeURIComponent(kit.iccid)}`;
      try {
        await page.goto(directUrl, { waitUntil: "networkidle", timeout: 30000 });
      } catch (e) {
        logger.warn({ kitNo: kit.kitNo, err: (e as Error).message }, "Direct URL failed; skipping KIT");
        continue;
      }
      // Hard guard: if the direct URL silently bounced us back to login or
      // away from the grid, the entire KIT is unsafe to scrape — skip it
      // rather than write zeros over previously valid period totals.
      if (!(await isOnRatedCdrsGrid(page))) {
        logger.warn(
          { kitNo: kit.kitNo, url: page.url() },
          "After direct URL, page is not on ratedCdrs grid — skipping KIT (session may be lost)"
        );
        continue;
      }
      // Wait for the grid to actually finish its initial async render so
      // selectPeriod isn't racing an in-flight callback.
      await waitForGridReady(page, `direct ${kit.kitNo}`);

      for (const period of periods) {
        try {
          await selectPeriod(page, period);
          // Re-check after every period switch — DevExpress callbacks
          // occasionally trigger a logout redirect on stale sessions.
          if (!(await isOnRatedCdrsGrid(page))) {
            logger.warn(
              { kitNo: kit.kitNo, period, url: page.url() },
              "Lost grid context after period switch — skipping period (no overwrite)"
            );
            continue;
          }
          // Wait for the post-callback grid to settle (data row OR empty marker).
          await waitForGridReady(page, `${kit.kitNo}/${period}`);
          const parsed = await parseGrid(page);
          // Diagnostic: if the grid had no parseable rows, dump what we saw
          // so we can adjust selectors / column map without another round-trip.
          if (parsed.rows.length === 0) {
            logger.warn(
              {
                kitNo: kit.kitNo,
                period,
                diag: parsed.diag,
                footerGib: parsed.footerGib,
                footerUsd: parsed.footerUsd,
              },
              "parseGrid produced 0 rows — diagnostic snapshot"
            );
          }
          // Treat as truly empty ONLY when both rows AND footer are absent
          // AND we're still on the grid — that means the portal really has
          // no charges for this (kit, period). We insert a 0-total stub
          // (without overwriting an existing non-zero one).
          if (parsed.rows.length === 0 && parsed.footerGib == null && parsed.footerUsd == null) {
            await db
              .insert(stationKitPeriodTotal)
              .values({
                kitNo: kit.kitNo,
                period,
                totalGib: 0,
                totalUsd: 0,
                rowCount: 0,
              })
              .onConflictDoNothing({
                target: [stationKitPeriodTotal.kitNo, stationKitPeriodTotal.period],
              });
            continue;
          }
          // Rows present but footer missing → almost certainly multi-page
          // pageSize mismatch. Persist the daily rows (idempotent), but DO
          // NOT touch the period total — leave previous value intact.
          if (parsed.rows.length > 0 && parsed.footerGib == null && parsed.footerUsd == null) {
            logger.warn(
              { kitNo: kit.kitNo, period, rowCount: parsed.rows.length },
              "Footer missing despite rows — likely multi-page (pageSize<50). Period total preserved."
            );
          }
          const { inserted, updated } = await persistKitPeriod(kit.kitNo, period, parsed);
          totalRows += parsed.rows.length;
          totalInserted += inserted;
          totalUpdated += updated;

          // Cross-check footer vs row sum (warn only).
          if (parsed.footerGib != null) {
            const sumGib = parsed.rows.reduce((a, r) => a + (r.volumeGib ?? 0), 0);
            const diff = Math.abs(sumGib - parsed.footerGib);
            if (diff > 0.5) {
              logger.warn(
                { kitNo: kit.kitNo, period, footerGib: parsed.footerGib, sumGib, diff },
                "Footer vs row-sum mismatch"
              );
            }
          }
        } catch (e) {
          logger.warn(
            { kitNo: kit.kitNo, period, err: (e as Error).message },
            "Period scrape failed (continuing)"
          );
        }
      }
    }

    // İlk full başarıyla bitti → bayrağı ata.
    if (isFirstFull && creds) {
      await db
        .update(stationCredentials)
        .set({ firstFullSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(stationCredentials.id, creds.id));
    }

    return {
      success: true,
      message: `Sync OK — ${kits.length} KIT × ${periods.length} dönem (${totalRows} satır).`,
      recordsFound: totalRows,
      recordsInserted: totalInserted,
      recordsUpdated: totalUpdated,
    };
  } catch (err) {
    logger.error({ err }, "Scraper error");
    const screenshotPath = "/tmp/rated-cdrs-error.png";
    const htmlSnapshotPath = "/tmp/rated-cdrs-error.html";
    try {
      if (browser) {
        const pages = browser.contexts().flatMap((c) => c.pages());
        const page = pages[0];
        if (page) {
          await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
          const html = await page.content().catch(() => "");
          if (html) {
            await import("fs").then((fs) =>
              fs.promises.writeFile(htmlSnapshotPath, html)
            );
          }
        }
      }
    } catch {
      // ignore
    }
    return {
      success: false,
      message: `Sync failed: ${(err as Error).message}`,
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      screenshotPath,
      htmlSnapshotPath,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
