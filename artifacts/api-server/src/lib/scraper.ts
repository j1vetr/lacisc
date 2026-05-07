import {
  db,
  stationKits,
  stationKitDaily,
  stationKitPeriodTotal,
  stationCredentials,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { checkAndSendUsageAlert } from "./alerts";
import type { Page, Browser } from "playwright";
import * as progress from "./sync-progress";
import {
  fetchKitLocations,
  fetchHourlyTelemetry,
  enrichCardDetails,
} from "./scraper-enrichment";

export interface SyncResult {
  success: boolean;
  message: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
  screenshotPath?: string;
  htmlSnapshotPath?: string;
}

export interface RunSyncOptions {
  credentialId: number;
  credentialLabel?: string;
  portalUrl: string;
  username: string;
  password: string;
  testOnly?: boolean;
  reportProgress?: boolean;
  // When true, walk every period from 202601 → current regardless of
  // firstFullSyncAt. Used by the manual "Şimdi Senkronize Et" button so the
  // operator can always force a full backfill from the UI without touching SQL.
  forceFull?: boolean;
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
  // ISO-ish anywhere in the string
  const iso = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy, dd.mm.yyyy, or dd-mm-yyyy anywhere in the string
  const eu = v.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return null;
}

// Portal cells like "01 May 00:00" (no year). Combine the day from the cell
// with year+month from the period (YYYYMM) to produce a full ISO date.
function parseShortDayWithPeriod(
  value: string | null | undefined,
  period: string | null
): string | null {
  if (!value || !period || !/^\d{6}$/.test(period)) return null;
  const m = value.trim().match(/^(\d{1,2})\b/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  return `${period.slice(0, 4)}-${period.slice(4, 6)}-${day}`;
}

// Scan every cell for a date-shape and return the first match. Used when the
// fixed col9 lookup fails (column layout differs across portal accounts).
function findDayDateInRow(cells: string[]): string | null {
  for (const c of cells) {
    const d = parseDayDate(c);
    if (d) return d;
  }
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
    const out: {
      kitNo: string;
      detailHref: string | null;
      iccid: string | null;
    }[] = [];
    for (const a of links) {
      const text = (a.textContent || "").trim();
      if (!text.startsWith("KITP")) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      const href = a.getAttribute("href");
      // The portal's "ICCID" column actually stores the KITP code itself;
      // the direct URL is `?FC=ICCID&FV=<KITP...>`. So `iccid` is just kitNo.
      out.push({ kitNo: text, detailHref: href, iccid: text });
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
  // Step 1: probe what controls/buttons actually exist on the page. We log
  // these once per call so production diagnostics show real IDs.
  const probe = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const combo = w["ctl00_ContentPlaceHolder1_ctl00_ctl00"] as
      | {
          SetValue?: (v: string, raiseEvents?: boolean) => void;
          GetValue?: () => unknown;
          name?: string;
          uniqueID?: string;
        }
      | undefined;
    const buttons: { id: string; tag: string; value: string; text: string }[] = [];
    document
      .querySelectorAll(
        "input[type='button'], input[type='submit'], button, a[id*='btn' i]"
      )
      .forEach((el) => {
        const e = el as HTMLElement & { value?: string };
        const id = e.id || "";
        if (
          /btnRefresh|btnSearch|btnFilter|btnApply|btnGo|btnYenile/i.test(id) ||
          /refresh|yenile|filtre|ara|search/i.test(e.textContent || "") ||
          /refresh|yenile|filtre|ara|search/i.test(e.value || "")
        ) {
          buttons.push({
            id,
            tag: e.tagName,
            value: e.value || "",
            text: (e.textContent || "").trim().slice(0, 40),
          });
        }
      });
    return {
      comboFound: !!combo,
      comboPrevValue:
        combo && typeof combo.GetValue === "function" ? String(combo.GetValue() ?? "") : null,
      buttons: buttons.slice(0, 12),
      hasDoPostBack: typeof (w["__doPostBack"] as unknown) === "function",
    };
  });

  // Step 2: trigger a server-side WebForms postback. Diagnostic showed that
  // __doPostBack against the combo's UniqueID DOES re-render the grid with
  // the requested period — but it causes a full page navigation. So we MUST
  // wrap it in waitForNavigation, otherwise subsequent page.evaluate calls
  // race the navigation and crash with "execution context destroyed".
  // Strategy: simulate the EXACT user gesture — open the combo dropdown via
  // its real button, then click the <td>/<li> that contains the target
  // period text. This is the only path that fires DevExpress's real
  // SelectedIndexChanged handler (which in turn POSTs the form back).
  // SetValue / SendPostBack / __doPostBack proven not to trigger the grid
  // re-query on this portal.
  let setTried: string[] = [];
  try {
    // Open the dropdown.
    await page
      .locator("#ctl00_ContentPlaceHolder1_ctl00_ctl00_B-1Img, #ctl00_ContentPlaceHolder1_ctl00_ctl00_B-1")
      .first()
      .click({ timeout: 5000 });
    await page.waitForTimeout(400);
    setTried.push("openCombo");

    // Find the dropdown row containing the period text and click it inside
    // a Promise.all with waitForNavigation, since clicking fires postback.
    const optionLocator = page.locator(
      `#ctl00_ContentPlaceHolder1_ctl00_ctl00_DDD_L_LBT tr:has-text("${period}"), #ctl00_ContentPlaceHolder1_ctl00_ctl00_DDD_DDTC td:has-text("${period}")`
    );
    const optionCount = await optionLocator.count().catch(() => 0);
    setTried.push(`optionsFound=${optionCount}`);
    if (optionCount > 0) {
      await optionLocator.first().click({ timeout: 5000 });
      setTried.push("optionClicked");
      // Initial wait — give DevExpress's async callback time to actually
      // begin re-rendering the grid (otherwise our first poll catches the
      // pre-callback state and exits early thinking nothing changed).
      await page.waitForTimeout(800);
      // Poll the grid for the actual period. We treat EMPTY as conclusive
      // ONLY after several consecutive empty reads — otherwise we mistake
      // the brief loading-state for a truly empty period.
      const deadline = Date.now() + 15000;
      let polled = "";
      let pollCount = 0;
      let consecutiveEmpty = 0;
      while (Date.now() < deadline) {
        pollCount++;
        const got = await page
          .evaluate(() => {
            const rows = Array.from(
              document.querySelectorAll<HTMLTableRowElement>(
                "tr.dxgvDataRow_Aqua, tr.dxgvDataRow"
              )
            );
            if (rows.length === 0) return "EMPTY";
            const cells = rows[0].querySelectorAll("td");
            return cells[23]?.textContent?.trim() ?? "";
          })
          .catch(() => "");
        polled = got;
        if (got === period) break;
        if (got === "EMPTY") {
          consecutiveEmpty++;
          // 8 consecutive empty reads (~3.2s) ⇒ this period really has no data.
          if (consecutiveEmpty >= 8) break;
        } else {
          consecutiveEmpty = 0;
        }
        await page.waitForTimeout(400);
      }
      setTried.push(`polled=${polled} after ${pollCount} checks`);
    } else {
      // Fallback: SetValue + raise events.
      await page.evaluate((p) => {
        const w = window as unknown as Record<string, unknown>;
        const combo = w["ctl00_ContentPlaceHolder1_ctl00_ctl00"] as
          | { SetValue?: (v: string, raiseEvents?: boolean) => void }
          | undefined;
        if (combo && typeof combo.SetValue === "function") {
          try { combo.SetValue(p, true); } catch { /* ignore */ }
        }
      }, period);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      setTried.push("fallbackSetValue");
    }
  } catch (e) {
    setTried.push(`error:${(e as Error).message.slice(0, 80)}`);
  }
  await page.waitForTimeout(400);

  const setResult = {
    tried: setTried,
    uid: "ctl00$ContentPlaceHolder1$ctl00$ctl00",
  };

  // Step 5: verify the combo and the GRID's actual first-row period match.
  // The combo can lie (it just shows what we set), but the grid's row[23]
  // is the truth.
  const after = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const combo = w["ctl00_ContentPlaceHolder1_ctl00_ctl00"] as
      | { GetValue?: () => unknown }
      | undefined;
    const comboVal =
      combo && typeof combo.GetValue === "function" ? String(combo.GetValue() ?? "") : null;
    // Snapshot the first data row's period cell (col23) without using the
    // full parseGrid path.
    const firstRow = document.querySelector(
      "tr[id*='DXDataRow'], tr.dxgvDataRow, tr[class*='dxgvDataRow']"
    );
    let firstRowPeriod: string | null = null;
    if (firstRow) {
      const tds = firstRow.querySelectorAll("td");
      if (tds.length > 23) firstRowPeriod = (tds[23].textContent || "").trim();
    }
    return { comboVal, firstRowPeriod };
  });

  logger.info(
    {
      requested: period,
      probe,
      setTried: setResult.tried,
      comboUid: setResult.uid,
      comboAfter: after.comboVal,
      firstRowPeriodAfter: after.firstRowPeriod,
    },
    "selectPeriod result"
  );
}

interface ParsedDailyRow {
  cdrId: string;
  kitNo: string | null;
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
    if (cells.length < 13) continue;
    // cdrId: prefer col24, fall back to any col holding a long numeric id.
    let cdrId = (cells[24] ?? "").trim();
    if (!cdrId) {
      for (const c of cells) {
        if (/^\d{8,}$/.test(c)) {
          cdrId = c;
          break;
        }
      }
    }
    if (!cdrId) continue;
    const period = /^\d{6}$/.test(cells[23] ?? "") ? cells[23] : null;
    // dayDate: try ISO/EU first, then "DD MMM HH:MM" + period, then any cell.
    const dayDate =
      parseDayDate(cells[9]) ??
      parseShortDayWithPeriod(cells[9], period) ??
      findDayDateInRow(cells);
    // col1 carries the KITP code itself (the row's owning kit). When we scan
    // a multi-kit grid (bare RatedCdrs page) we MUST use this to split rows
    // back into per-kit buckets.
    const rowKit = (cells[1] || "").trim();
    rows.push({
      cdrId,
      kitNo: /^KITP/i.test(rowKit) ? rowKit : null,
      // col3 is the human service label ("Background IP"); col4 is a bundle
      // ID like "SL-DF-9290337-...". Prefer col3, fall back to col4.
      service: cells[3] || cells[4] || null,
      dayDate,
      volumeGib: parseGib(cells[12]),
      chargeUsd: parseUsd(cells[22] || cells[20]),
      period,
    });
  }
  // One-time sample log so we can see real cell layout when something looks off.
  if (data.rowCells.length > 0) {
    const c = data.rowCells[0];
    const sample = c.map((v, i) => `${i}=${v}`).slice(0, 26).join(" | ");
    logger.info({ cellCount: c.length, sample }, "parseGrid first-row sample");
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
  credentialId: number,
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
          (credential_id, kit_no, period, day_date, volume_gib, charge_usd, service, cdr_id, scraped_at)
        VALUES
          (${credentialId}, ${kitNo}, ${period}, ${r.dayDate}, ${r.volumeGib}, ${r.chargeUsd},
           ${r.service}, ${r.cdrId}, ${now})
        ON CONFLICT (credential_id, kit_no, period, cdr_id) DO UPDATE SET
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
          credentialId,
          kitNo,
          period,
          totalGib: parsed.footerGib,
          totalUsd: parsed.footerUsd,
          rowCount: parsed.rows.length,
        })
        .onConflictDoUpdate({
          target: [
            stationKitPeriodTotal.credentialId,
            stationKitPeriodTotal.kitNo,
            stationKitPeriodTotal.period,
          ],
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

// ---------------------------------------------------------------------------
// Walk EVERY page of the rated-CDRs grid for the currently-selected period
// and merge the rows. We do this because:
//   - Default pageSize is 25; even after `setGridPageSize` (which the portal
//     silently caps at the dropdown's max — usually 100), large periods span
//     several pages.
//   - DevExpress only renders the footer when `pageCount === 1`, so multi-page
//     totals must be computed from the row sum (caller already does this per
//     KIT bucket).
// ---------------------------------------------------------------------------
async function gotoGridPage(page: Page, pageIdx: number): Promise<boolean> {
  const triggered = await page.evaluate((idx) => {
    const w = window as unknown as Record<string, unknown>;
    const grid = w["gvRatedCdr"] as
      | { GotoPage?: (i: number) => void; GetPageIndex?: () => number }
      | undefined;
    if (!grid?.GotoPage) return false;
    try {
      grid.GotoPage(idx);
      return true;
    } catch {
      return false;
    }
  }, pageIdx);
  if (!triggered) {
    // Fallback: click the actual pager NEXT button.
    const ok = await page.evaluate(() => {
      const next = document.getElementById(
        "ctl00_ContentPlaceHolder1_gvRatedCdr_DXPagerBottom_PBN"
      );
      if (next) {
        (next as HTMLElement).click();
        return true;
      }
      return false;
    });
    if (!ok) return false;
  }
  // Poll until DevExpress's async callback lands on the requested page.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const cur = await page
      .evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const grid = w["gvRatedCdr"] as { GetPageIndex?: () => number } | undefined;
        return grid?.GetPageIndex?.() ?? -1;
      })
      .catch(() => -1);
    if (cur === pageIdx) {
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

async function parseAllPages(
  page: Page,
  period: string
): Promise<ParsedGrid> {
  // Bump pageSize first to minimise the number of pager round-trips.
  await setGridPageSize(page, 100);

  const startInfo = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const grid = w["gvRatedCdr"] as
      | {
          GetPageCount?: () => number;
          GetPageIndex?: () => number;
          GetVisibleRowsOnPage?: () => number;
        }
      | undefined;
    return {
      pageCount: grid?.GetPageCount?.() ?? 1,
      pageIndex: grid?.GetPageIndex?.() ?? 0,
      visibleRows: grid?.GetVisibleRowsOnPage?.() ?? 0,
    };
  });

  // If a previous period left us on a non-zero page, rewind first so
  // page-1 parsing is correct.
  if (startInfo.pageIndex !== 0 && startInfo.pageCount > 1) {
    await gotoGridPage(page, 0);
  }

  const totalPages = Math.max(startInfo.pageCount, 1);
  logger.info(
    {
      period,
      totalPages,
      visibleRowsOnPage1: startInfo.visibleRows,
    },
    "parseAllPages: starting walk"
  );

  const allRows: ParsedDailyRow[] = [];
  const seenCdrIds = new Set<string>();
  let firstFooterGib: number | null = null;
  let firstFooterUsd: number | null = null;
  let firstDiag: GridDiag | null = null;

  const HARD_PAGE_CAP = 100; // sanity bound — 100×100 = 10k CDRs per period
  const limit = Math.min(totalPages, HARD_PAGE_CAP);

  for (let i = 0; i < limit; i++) {
    if (i > 0) {
      const ok = await gotoGridPage(page, i);
      if (!ok) {
        logger.warn(
          { period, page: i, of: totalPages },
          "parseAllPages: gotoGridPage failed — stopping walk"
        );
        break;
      }
    }
    const parsed = await parseGrid(page);
    if (i === 0) {
      firstFooterGib = parsed.footerGib;
      firstFooterUsd = parsed.footerUsd;
      firstDiag = parsed.diag;
    }
    let added = 0;
    for (const r of parsed.rows) {
      if (seenCdrIds.has(r.cdrId)) continue;
      seenCdrIds.add(r.cdrId);
      allRows.push(r);
      added++;
    }
    logger.info(
      {
        period,
        page: i + 1,
        of: totalPages,
        rowsOnPage: parsed.rows.length,
        newRows: added,
        totalSoFar: allRows.length,
      },
      "parseAllPages: page parsed"
    );
    if (parsed.rows.length === 0) break;
  }

  // Footer values only mean "grand total" when the grid was single-page.
  // Otherwise downstream callers compute per-KIT totals from row sums.
  const footerGib = totalPages === 1 ? firstFooterGib : null;
  const footerUsd = totalPages === 1 ? firstFooterUsd : null;

  return {
    rows: allRows,
    footerGib,
    footerUsd,
    diag:
      firstDiag ?? {
        rowSelectorUsed: null,
        rowsFound: 0,
        isEmptyMarker: false,
        firstRowCellCount: 0,
        firstRowSample: "",
        gridHtmlLen: 0,
      },
  };
}

// ---------------------------------------------------------------------------
// Bump the DevExpress grid pageSize so we get ALL CDR rows (and a real footer
// total) on a single page. The portal user's per-session pageSize defaults to
// 25 — which means parseGrid would only see the first 25 CDRs and the footer
// would show only that page's subtotal (e.g. 774 GiB instead of the real 955).
// `ASPx.GVPagerOnClick(gridId, '<size>')` is DevExpress's own pager handler
// and is what the "Page size" dropdown in the footer actually invokes.
// ---------------------------------------------------------------------------
async function setGridPageSize(page: Page, size: number): Promise<void> {
  const gridId = "ctl00_ContentPlaceHolder1_gvRatedCdr";
  const before = await page.evaluate((gid) => {
    const rows = document.querySelectorAll(`[id^='${gid}_DXDataRow']`).length;
    return rows;
  }, gridId);
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
  // The pager click fires an async DevExpress callback. Poll the DOM row count
  // until it grows past the previous page (or stabilises), with a hard cap.
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
      // wait one more tick to be sure rendering finished
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
      if (stableTicks >= 4) break; // 4 stable polls (~1.6s) — already single page
    } else {
      after = n;
      stableTicks = 0;
    }
  }
  logger.info(
    { gridId, requestedSize: size, triggered, rowsBefore: before, rowsAfter: after },
    "setGridPageSize result"
  );
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
  credentialId: number,
  kits: KitListEntry[]
): Promise<void> {
  const havingHref = kits.filter((k) => k.detailHref);
  if (havingHref.length === 0) return;
  const cached = await db
    .select({ kitNo: stationKits.kitNo, shipName: stationKits.shipName })
    .from(stationKits)
    .where(
      and(
        eq(stationKits.credentialId, credentialId),
        inArray(stationKits.kitNo, havingHref.map((k) => k.kitNo))
      )
    );
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
          credentialId,
          shipName,
          detailUrl: href,
          shipNameSyncedAt: shipName ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: stationKits.kitNo,
          set: {
            credentialId,
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
export async function runSync(opts: RunSyncOptions): Promise<SyncResult> {
  const {
    credentialId,
    credentialLabel,
    portalUrl,
    username,
    password,
    testOnly = false,
    reportProgress = false,
    forceFull = false,
  } = opts;
  const accountLabel = credentialLabel?.trim() || username;
  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);

    // Normalize: take only the origin (scheme://host[:port]) and discard any
    // path/query the user may have accidentally pasted (e.g. they saved the
    // login redirect URL "https://...satcomhost.com/Account/Login?ReturnUrl=%2F"
    // as their portal URL — appending /RatedCdrs.aspx would 404/302 to login).
    let baseUrl: string;
    try {
      baseUrl = new URL(portalUrl.trim()).origin;
    } catch {
      // Fallback: best-effort strip of trailing slashes if URL() rejects it.
      baseUrl = portalUrl.trim().replace(/\/+$/, "");
    }
    logger.info({ baseUrl, rawPortalUrl: portalUrl }, "Sync starting with normalized baseUrl");
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
    //    Bare grid is server-capped (~100 rows) so a low-activity KIT may
    //    not appear in the current snapshot. Union with previously-known
    //    KITs from the DB so they still get scraped.
    const liveKits = await extractKitList(page);
    const dbKits = await db
      .select({ kitNo: stationKits.kitNo, shipName: stationKits.shipName })
      .from(stationKits)
      .where(eq(stationKits.credentialId, credentialId));
    const kitMap = new Map<string, KitListEntry>();
    for (const k of liveKits) kitMap.set(k.kitNo, k);
    for (const k of dbKits) {
      if (!kitMap.has(k.kitNo)) {
        kitMap.set(k.kitNo, { kitNo: k.kitNo, detailHref: null, iccid: null });
      }
    }
    const kits = Array.from(kitMap.values());
    logger.info(
      { credentialId, liveCount: liveKits.length, dbCount: dbKits.length, totalCount: kits.length },
      "Discovered KITs (union of live grid + DB)"
    );
    if (kits.length === 0) {
      return {
        success: false,
        message: "Rated CDRs sayfasında KITP linki bulunamadı (oturum/ payload sorunu).",
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
      };
    }
    await enrichShipNames(page, credentialId, kits).catch((e) =>
      logger.warn({ err: (e as Error).message }, "Ship-name enrichment failed (non-fatal)")
    );

    // Task #20 — Map + Measurements + CardDetails enrichment.
    // Hepsi best-effort; CDR scraping akışını bloklamaz. Map ve Measurements
    // tek hesap-genelidir (KIT döngüsünden bağımsız çalışır); CardDetails
    // KIT başınadır.
    await fetchKitLocations(page, baseUrl, credentialId).catch((e) =>
      logger.warn({ err: (e as Error).message }, "Map enrichment failed (non-fatal)")
    );
    await fetchHourlyTelemetry(page, baseUrl, credentialId, forceFull).catch(
      (e) =>
        logger.warn(
          { err: (e as Error).message },
          "Telemetry enrichment failed (non-fatal)"
        )
    );
    await enrichCardDetails(page, baseUrl, credentialId, kits).catch((e) =>
      logger.warn({ err: (e as Error).message }, "CardDetails enrichment failed (non-fatal)")
    );

    // Sonraki adım ratedCdrs grid'inde olmamızı bekliyor — enrich bizi başka
    // sayfalara götürdü, geri dön.
    const cdrLinkBack = page
      .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
      .first();
    if ((await cdrLinkBack.count()) > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
        cdrLinkBack.click().catch(() => {}),
      ]);
    }

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
      .where(eq(stationCredentials.id, credentialId))
      .limit(1);
    // Full-walk triggers: (a) account has never been fully synced before, OR
    // (b) caller explicitly forced it (manual "Şimdi Senkronize Et" button).
    // Otherwise stay incremental (current + previous period only) to keep the
    // nightly cron fast.
    const isFirstFull = !creds?.firstFullSyncAt;
    const doFullWalk = isFirstFull || forceFull;
    const periods = doFullWalk ? allPeriods : allPeriods.slice(0, 2);
    logger.info(
      {
        credentialId,
        isFirstFull,
        forceFull,
        doFullWalk,
        periodCount: periods.length,
        periods: periods.slice(0, 5),
      },
      "Sync plan"
    );
    if (reportProgress) {
      progress.setAccountPlan(periods.length, kits.length);
    }

    // 3) Per-(KIT × period) scrape via the FV-filtered URL.
    //    The bare RatedCdrs grid combines all kits but is server-capped at
    //    ~100 rows total — so a kit with 50+ CDRs in a period only contributes
    //    its first ~25. The drill-down URL `?FC=ICCID&FV=KITPxxxx` shows
    //    ONLY that kit's CDRs (≤32 rows for any single period in practice),
    //    fitting in one pager page so the footer carries the real grand
    //    total per (kit, period).
    let totalRows = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let kitPeriodFailures = 0;

    for (let pIdx = 0; pIdx < periods.length; pIdx++) {
      const period = periods[pIdx];
      if (reportProgress) progress.startPeriod(period, pIdx + 1);
      // Set the session period once on the bare grid, then walk kits. The FV
      // URL inherits the session-level period the first time we land on it.
      try {
        if (!(await isOnRatedCdrsGrid(page)) || /[?&]FV=/i.test(page.url())) {
          const cdrLink = page
            .locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]")
            .first();
          if ((await cdrLink.count()) > 0) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
              cdrLink.click(),
            ]);
          }
        }
        await selectPeriod(page, period);
      } catch (e) {
        logger.warn(
          { period, err: (e as Error).message },
          "Bare-grid period switch failed (will still try FV URL per kit)"
        );
      }

      for (let kIdx = 0; kIdx < kits.length; kIdx++) {
        const kit = kits[kIdx];
        if (reportProgress) progress.startKit(kit.kitNo, kIdx + 1);
        try {
          const fvUrl = `${baseUrl}/RatedCdrs.aspx?FC=ICCID&FV=${encodeURIComponent(
            kit.kitNo
          )}`;
          let gotoOk = true;
          await page
            .goto(fvUrl, { waitUntil: "networkidle", timeout: 30000 })
            .catch((e) => {
              gotoOk = false;
              logger.warn(
                { period, kit: kit.kitNo, err: (e as Error).message },
                "FV goto failed"
              );
            });
          if (!gotoOk || !(await isOnRatedCdrsGrid(page))) {
            kitPeriodFailures++;
            if (reportProgress) progress.reportKitFailure(kit.kitNo, period, "FV URL bounced");
            logger.warn(
              { period, kit: kit.kitNo, url: page.url() },
              "FV URL bounced or goto failed — skipping (no overwrite, no 0-stub)"
            );
            continue;
          }
          await waitForGridReady(page, `FV ${kit.kitNo} ${period}`);

          // Verify the loaded grid actually belongs to this KIT before doing
          // ANY overwrite. If cells[1] of the first row is a different KIT,
          // the FV navigation didn't take effect and we'd otherwise smear
          // another kit's CDRs onto this one.
          const firstRowProbe = await page
            .evaluate(() => {
              const row = document.querySelector(
                "tr[id*='DXDataRow'], tr.dxgvDataRow"
              );
              if (!row) return { kitNo: null, period: null, hasRows: false };
              const tds = row.querySelectorAll("td");
              return {
                kitNo: tds.length > 1 ? (tds[1].textContent || "").trim() : null,
                period: tds.length > 23 ? (tds[23].textContent || "").trim() : null,
                hasRows: true,
              };
            })
            .catch(() => ({ kitNo: null, period: null, hasRows: false }));

          if (firstRowProbe.hasRows && firstRowProbe.kitNo && firstRowProbe.kitNo !== kit.kitNo) {
            kitPeriodFailures++;
            if (reportProgress)
              progress.reportKitFailure(
                kit.kitNo,
                period,
                `farklı KIT (${firstRowProbe.kitNo})`
              );
            logger.warn(
              { period, kit: kit.kitNo, gridShows: firstRowProbe.kitNo },
              "FV grid shows different KIT — skipping (no overwrite)"
            );
            continue;
          }

          // The FV URL initially loads with the session-level period. If a
          // previous (kit, period) pair changed it, or if the session default
          // doesn't match `period`, run selectPeriod here too.
          if (firstRowProbe.period !== null && firstRowProbe.period !== period) {
            await selectPeriod(page, period);
            await waitForGridReady(page, `FV ${kit.kitNo} ${period} after switch`);
          }

          const parsed = await parseAllPages(page, period);

          // Drop rows whose period column doesn't match — defensive; keeps us
          // from polluting one period's row table with another's CDRs if the
          // grid hasn't fully refreshed yet.
          const kitRows = parsed.rows.filter(
            (r) => r.period === period && (r.kitNo === kit.kitNo || r.kitNo === null)
          );

          if (kitRows.length === 0) {
            // No usage this period: persist a 0-stub if there is no existing
            // row (so we don't overwrite a previously valid total).
            await db
              .insert(stationKitPeriodTotal)
              .values({
                credentialId,
                kitNo: kit.kitNo,
                period,
                totalGib: 0,
                totalUsd: 0,
                rowCount: 0,
              })
              .onConflictDoNothing({
                target: [
                  stationKitPeriodTotal.credentialId,
                  stationKitPeriodTotal.kitNo,
                  stationKitPeriodTotal.period,
                ],
              });
            if (reportProgress)
              progress.reportKitDone(kit.kitNo, period, 0, 0, 0, 0, 0);
            logger.info(
              { period, kit: kit.kitNo },
              "FV grid empty for this period — 0-stub"
            );
            continue;
          }

          // Footer is the source of truth when single-page; otherwise sum.
          const sumGib =
            Math.round(
              kitRows.reduce((a, r) => a + (r.volumeGib ?? 0), 0) * 100
            ) / 100;
          const sumUsd =
            Math.round(
              kitRows.reduce((a, r) => a + (r.chargeUsd ?? 0), 0) * 100
            ) / 100;
          const totalGib = parsed.footerGib ?? sumGib;
          const totalUsd = parsed.footerUsd ?? sumUsd;

          const synthetic: ParsedGrid = {
            rows: kitRows.map((r) => ({ ...r, kitNo: kit.kitNo })),
            footerGib: totalGib,
            footerUsd: totalUsd,
            diag: parsed.diag,
          };
          const { inserted, updated } = await persistKitPeriod(
            credentialId,
            kit.kitNo,
            period,
            synthetic
          );
          totalRows += kitRows.length;
          totalInserted += inserted;
          totalUpdated += updated;
          if (reportProgress)
            progress.reportKitDone(
              kit.kitNo,
              period,
              kitRows.length,
              inserted,
              updated,
              totalGib,
              totalUsd
            );
          // Fire-and-forget threshold alert (no await — alerts must never
          // block or fail the sync). Idempotent via lastAlertThresholdGib.
          void checkAndSendUsageAlert({
            credentialId,
            credentialLabel: accountLabel,
            kitNo: kit.kitNo,
            period,
            totalGib,
            totalUsd,
          });
          logger.info(
            {
              period,
              kit: kit.kitNo,
              rows: kitRows.length,
              footerGib: parsed.footerGib,
              sumGib,
              storedGib: totalGib,
              footerUsd: parsed.footerUsd,
              sumUsd,
            },
            "FV (kit, period) persisted"
          );
        } catch (e) {
          kitPeriodFailures++;
          if (reportProgress)
            progress.reportKitFailure(kit.kitNo, period, (e as Error).message);
          logger.warn(
            { period, kit: kit.kitNo, err: (e as Error).message },
            "FV (kit, period) scrape failed (continuing)"
          );
        }
      }
    }

    // İlk full bayrağı YALNIZCA hatasız tamamlandığında atılır — aksi halde
    // sonraki sync'te tekrar full backfill denenir.
    if (isFirstFull && creds && kitPeriodFailures === 0) {
      await db
        .update(stationCredentials)
        .set({ firstFullSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(stationCredentials.id, creds.id));
    }

    const partial = kitPeriodFailures > 0;
    return {
      success: !partial,
      message: partial
        ? `Sync kısmen başarılı — ${kits.length} KIT × ${periods.length} dönem (${totalRows} satır, ${kitPeriodFailures} başarısız KIT-dönem).`
        : `Sync OK — ${kits.length} KIT × ${periods.length} dönem (${totalRows} satır).`,
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
