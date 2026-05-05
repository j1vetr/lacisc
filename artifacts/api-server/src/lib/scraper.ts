import { db, stationCdrRecords, stationKits, stationKitDailySnapshots } from "@workspace/db";
import { and, eq, isNull, or, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { Page } from "playwright";

export interface SyncResult {
  success: boolean;
  message: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
  screenshotPath?: string;
  htmlSnapshotPath?: string;
}

// Matches "13.17 GiB", "234.5 MB", "0 Bytes" — both decimal (KB/MB/GB/TB)
// and binary (KiB/MiB/GiB/TiB) units, plus plain "Bytes".
const VOLUME_REGEX = /^([\d.,]+)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB|Bytes?|B)$/i;

function parseGb(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(VOLUME_REGEX);
  if (!m) return null;
  // Locale-safe number parsing: handle both "13.17" (en) and "13,17" (tr/eu).
  // If the string contains exactly one separator and no other, treat it as the
  // decimal mark; otherwise strip thousands separators (commas) by default.
  let raw = m[1];
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasComma && !hasDot) {
    raw = raw.replace(",", ".");
  } else {
    raw = raw.replace(/,/g, "");
  }
  const num = parseFloat(raw);
  if (isNaN(num)) return null;
  const unit = m[2].toLowerCase();

  // Binary (1024-based) units
  if (unit === "tib") return num * 1024;
  if (unit === "gib") return num;
  if (unit === "mib") return num / 1024;
  if (unit === "kib") return num / (1024 * 1024);
  // Decimal units (treat as approximate GB equivalents — portal mixes them)
  if (unit === "tb") return num * 1000;
  if (unit === "gb") return num;
  if (unit === "mb") return num / 1024;
  if (unit === "kb") return num / (1024 * 1024);
  // Plain bytes
  if (unit.startsWith("byte") || unit === "b") return num / (1024 * 1024 * 1024);
  return num;
}

interface ScrapedRow {
  kit_no: string;
  raw_row_data: string[];
  kit_detail_href: string | null;
}

function mapRowToRecord(row: ScrapedRow): {
  kitNo: string;
  product: string | null;
  service: string | null;
  originNumber: string | null;
  destinationNumber: string | null;
  customerCode: string | null;
  totalVolumeData: string | null;
  totalVolumeGbNumeric: number | null;
  totalVolumeMin: string | null;
  totalVolumeMsg: string | null;
  currency: string | null;
  totalPrice: string | null;
  inBundle: string | null;
  invoicedAmount: string | null;
  period: string | null;
  cdrId: string | null;
  startCdr: string | null;
  endCdr: string | null;
  rawRowData: string[];
} {
  const cells = row.raw_row_data;

  // Try to detect columns by content patterns
  let kitNo = row.kit_no;
  let product: string | null = null;
  let service: string | null = null;
  let originNumber: string | null = null;
  let destinationNumber: string | null = null;
  let customerCode: string | null = null;
  let totalVolumeData: string | null = null;
  let totalVolumeGbNumeric: number | null = null;
  let totalVolumeMin: string | null = null;
  let totalVolumeMsg: string | null = null;
  let currency: string | null = null;
  let totalPrice: string | null = null;
  let inBundle: string | null = null;
  let invoicedAmount: string | null = null;
  let period: string | null = null;
  let cdrId: string | null = null;
  let startCdr: string | null = null;
  let endCdr: string | null = null;

  // First pass: collect all volume-like values so we can pick the largest as
  // "total volume" (the row also contains a "0 Bytes" in-bundle column that
  // would otherwise overwrite a real "13.17 GiB" usage value).
  const volumes: { raw: string; gb: number }[] = [];
  for (const c of cells) {
    const cell = c?.trim() ?? "";
    if (!cell) continue;
    if (VOLUME_REGEX.test(cell)) {
      const gb = parseGb(cell);
      if (gb != null) volumes.push({ raw: cell, gb });
    }
  }
  if (volumes.length > 0) {
    const max = volumes.reduce((a, b) => (b.gb > a.gb ? b : a));
    totalVolumeData = max.raw;
    totalVolumeGbNumeric = max.gb;
  }

  // Second pass: detect the rest of the columns by content patterns.
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]?.trim() ?? "";
    if (!cell) continue;

    if (cell.startsWith("KITP")) {
      kitNo = cell;
    } else if (/^(20\d{2})(0[1-9]|1[0-2])$/.test(cell) && !period) {
      // YYYYMM period with valid month 01-12 (e.g. "202605"); strict check
      // avoids stealing 6-digit numeric IDs.
      period = cell;
    } else if (/^20\d{2}[-/](0[1-9]|1[0-2])$/.test(cell) && !period) {
      period = cell;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(cell) && !startCdr) {
      startCdr = cell;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(cell) && startCdr && !endCdr) {
      endCdr = cell;
    } else if (/^[\d.]+\s*min/i.test(cell)) {
      totalVolumeMin = cell;
    } else if (/^[\d.]+\s*msg/i.test(cell)) {
      totalVolumeMsg = cell;
    } else if (/^(USD|EUR|GBP|TRY)$/i.test(cell)) {
      currency = cell;
    } else if (/^\d{5,}(\.\d+)?$/.test(cell) && !cdrId) {
      cdrId = cell;
    } else if (/^[A-Z]{2,}-[A-Z0-9-]+/.test(cell) && !customerCode) {
      customerCode = cell;
    } else if (/^[\d.]+$/.test(cell) && currency && !totalPrice) {
      totalPrice = cell;
    } else if (/^[\d.]+$/.test(cell) && totalPrice && !invoicedAmount) {
      invoicedAmount = cell;
    } else if (!product && cell.length > 2 && cell.length < 50 && !/^\d/.test(cell) && !VOLUME_REGEX.test(cell)) {
      product = cell;
    } else if (!service && cell.length > 2 && cell.length < 50 && !/^\d/.test(cell) && !VOLUME_REGEX.test(cell)) {
      service = cell;
    }
  }

  return {
    kitNo,
    product,
    service,
    originNumber,
    destinationNumber,
    customerCode,
    totalVolumeData,
    totalVolumeGbNumeric,
    totalVolumeMin,
    totalVolumeMsg,
    currency,
    totalPrice,
    inBundle,
    invoicedAmount,
    period,
    cdrId,
    startCdr,
    endCdr,
    rawRowData: cells,
  };
}

// Visit each KIT detail page (only for KITs we don't yet have a ship name for)
// and cache the ship name in station_kits. Best-effort: any failure is logged
// and skipped so the main sync still succeeds.
async function enrichShipNames(
  page: Page,
  baseUrl: string,
  rows: ScrapedRow[]
): Promise<void> {
  // Build map of unique kit_no -> first non-empty href seen for it.
  const kitHrefMap = new Map<string, string>();
  for (const row of rows) {
    if (row.kit_no && row.kit_detail_href && !kitHrefMap.has(row.kit_no)) {
      kitHrefMap.set(row.kit_no, row.kit_detail_href);
    }
  }
  if (kitHrefMap.size === 0) {
    logger.info("No KIT detail hrefs captured; skipping ship-name enrichment");
    return;
  }

  // Find which kits already have a ship_name cached.
  const kitNos = Array.from(kitHrefMap.keys());
  const cached = await db
    .select({ kitNo: stationKits.kitNo, shipName: stationKits.shipName })
    .from(stationKits)
    .where(inArray(stationKits.kitNo, kitNos));
  const haveShipName = new Set(
    cached.filter((c) => c.shipName != null && c.shipName.trim() !== "").map((c) => c.kitNo)
  );

  const toFetch = kitNos.filter((k) => !haveShipName.has(k));
  logger.info({ totalKits: kitNos.length, alreadyCached: haveShipName.size, toFetch: toFetch.length }, "Ship-name enrichment plan");

  // Save the rated-CDRs page once so we can inspect the actual link markup
  // (href attributes vs. JS click handlers, DevExpress callback args, etc.).
  await page.content().then((html) =>
    import("fs").then((fs) => fs.promises.writeFile("/tmp/rated-cdrs-snapshot.html", html))
  ).catch(() => {});

  // We are currently on the ratedCdrs page. To preserve session/iframe state,
  // we CLICK the actual KIT link in the table rather than navigating directly
  // (direct page.goto to CardDetails.aspx returns ASP.NET ErrorPage). After
  // each detail visit we navigate back to ratedCdrs via the menu.
  let savedFirstDebug = false;
  for (const kitNo of toFetch) {
    const href = kitHrefMap.get(kitNo);
    if (!href) continue;
    try {
      // Click the KIT link from the current ratedCdrs page.
      const linkLocator = page.locator(`a[href="${href}"]`).first();
      const hasLink = (await linkLocator.count()) > 0;
      if (!hasLink) {
        logger.warn({ kitNo, href }, "KIT link not found on current page; re-navigating to ratedCdrs");
        // Navigate back to ratedCdrs via menu and try again
        const cdrLink = page.locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]").first();
        if ((await cdrLink.count()) > 0) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
            cdrLink.click(),
          ]);
        }
      }

      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
        page.locator(`a[href="${href}"]`).first().click({ timeout: 10000 }).catch(() => {}),
      ]);

      // Save the first detail page HTML for debugging label structure.
      if (!savedFirstDebug) {
        savedFirstDebug = true;
        const html = await page.content().catch(() => "");
        if (html) {
          await import("fs").then((fs) =>
            fs.promises.writeFile("/tmp/kit-detail-debug.html", html)
          ).catch(() => {});
        }
      }

      // Build label -> value map from common form/table layouts.
      const pairs: Record<string, string> = await page.evaluate(() => {
        const out: Record<string, string> = {};
        // <tr><td>Label</td><td>Value</td></tr> tables (very common in IBIS)
        document.querySelectorAll("tr").forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td, th"));
          if (cells.length >= 2) {
            const label = (cells[0].textContent || "").trim().replace(/[:：]\s*$/, "");
            const value = (cells[1].textContent || "").trim();
            if (label && value && label.length < 80 && !out[label]) out[label] = value;
          }
        });
        // <label>...<input/span> form layouts
        document.querySelectorAll("label").forEach((l) => {
          const label = (l.textContent || "").trim().replace(/[:：]\s*$/, "");
          const next = l.nextElementSibling;
          if (next && label && !out[label]) {
            const input = next.querySelector("input, select, textarea") as HTMLInputElement | null;
            const value = (input?.value || next.textContent || "").trim();
            if (value && label.length < 80) out[label] = value;
          }
        });
        return out;
      }).catch(() => ({} as Record<string, string>));

      // Pick best ship-name candidate (priority: explicit ship/vessel, then customer name, then description)
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
        for (const [k, v] of Object.entries(pairs)) {
          if (re.test(k) && v.length > 1 && v.length < 200 && !/^kitp/i.test(v)) {
            shipName = v;
            break;
          }
        }
        if (shipName) break;
      }

      const now = new Date();
      await db
        .insert(stationKits)
        .values({
          kitNo,
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
      logger.info({ kitNo, shipName, pairKeys: Object.keys(pairs).slice(0, 10) }, "Ship-name fetched");
    } catch (e) {
      logger.warn({ kitNo, err: (e as Error).message }, "Failed to fetch ship name (continuing)");
    }
  }
}

// Aggregate (kit_no, period) totals from CDR records and upsert one snapshot
// per (kit_no, period) for today's date. Same-day re-runs overwrite.
async function writeDailySnapshots(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rows = await db.execute(sql`
    SELECT
      kit_no AS "kitNo",
      period,
      SUM(total_volume_gb_numeric)::float8 AS "totalGb",
      SUM(CAST(NULLIF(REGEXP_REPLACE(total_price, '[^0-9.]', '', 'g'), '') AS NUMERIC))::float8 AS "totalPrice",
      MAX(currency) AS currency
    FROM station_cdr_records
    WHERE period IS NOT NULL
    GROUP BY kit_no, period
  `);
  const now = new Date();
  // drizzle node-postgres returns { rows: [...] }
  const list = (rows as unknown as { rows: Array<{ kitNo: string; period: string; totalGb: number | null; totalPrice: number | null; currency: string | null }> }).rows;
  for (const r of list) {
    if (!r.kitNo || !r.period) continue;
    await db
      .insert(stationKitDailySnapshots)
      .values({
        kitNo: r.kitNo,
        period: r.period,
        snapshotDate: today,
        totalGb: r.totalGb,
        totalPriceNumeric: r.totalPrice,
        currency: r.currency,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [stationKitDailySnapshots.kitNo, stationKitDailySnapshots.period, stationKitDailySnapshots.snapshotDate],
        set: {
          totalGb: r.totalGb,
          totalPriceNumeric: r.totalPrice,
          currency: r.currency,
          updatedAt: now,
        },
      });
  }
  logger.info({ count: list.length, snapshotDate: today }, "Daily snapshots written");
}

export async function runSync(
  portalUrl: string,
  username: string,
  password: string,
  testOnly: boolean
): Promise<SyncResult> {
  let browser: import("playwright").Browser | null = null;

  try {
    // Dynamic import to avoid issues if playwright isn't installed
    const { chromium } = await import("playwright");

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);

    // Navigate directly to the MVC login page (portal is ASP.NET MVC,
    // landing on root just redirects to /Account/Login anyway).
    const baseUrl = portalUrl.endsWith("/") ? portalUrl.slice(0, -1) : portalUrl;
    await page.goto(`${baseUrl}/Account/Login`, { waitUntil: "networkidle" }).catch(async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
    });

    // ASP.NET MVC Identity uses Email/UserName fields. Try common selectors in order.
    const usernameInput = page
      .locator(
        "input[name='Email'], input[id='Email'], input[name='UserName'], input[id='UserName'], input[name*='user' i], input[id*='user' i], input[type='email'], input[type='text']:not([type='hidden'])"
      )
      .first();

    if (!(await usernameInput.count())) {
      const screenshotPath = "/tmp/login-form-debug.png";
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      return {
        success: false,
        message: `Could not find username input on login page (${page.url()})`,
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        screenshotPath,
      };
    }

    await usernameInput.fill(username);

    const passwordInput = page.locator("input[type='password']").first();
    await passwordInput.fill(password);

    // Verify the values actually landed in the inputs (Playwright sometimes silently
    // fills the wrong element if a selector matched something unexpected).
    const filledUsername = await usernameInput.inputValue().catch(() => "");
    const filledPassword = await passwordInput.inputValue().catch(() => "");
    logger.info({
      filledUsernameLen: filledUsername.length,
      filledPasswordLen: filledPassword.length,
      usernameMatches: filledUsername === username,
      passwordMatches: filledPassword === password,
      preSubmitUrl: page.url(),
    }, "Login form filled");

    // Click the actual submit button so the antiforgery token is included in the form post.
    const submitButton = page.locator(
      "button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Giriş'), button:has-text('Sign in')"
    ).first();

    const hasSubmit = (await submitButton.count()) > 0;
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {}),
      hasSubmit ? submitButton.click() : passwordInput.press("Enter"),
    ]);

    // Snapshot the page IMMEDIATELY after submit to capture portal's real response
    // (success redirect target, or "invalid credentials" error message).
    const postSubmitUrl = page.url();
    const postSubmitContent = await page.content().catch(() => "");
    await page.screenshot({ path: "/tmp/post-submit-debug.png", fullPage: true }).catch(() => {});
    await import("fs").then(fs =>
      fs.promises.writeFile("/tmp/post-submit-debug.html", postSubmitContent)
    ).catch(() => {});

    // Look for visible validation errors that ASP.NET MVC renders inside .text-danger spans.
    const errorTexts = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(".text-danger, .validation-summary-errors, .field-validation-error"));
      return nodes
        .map(n => (n.textContent || "").trim())
        .filter(t => t.length > 0);
    }).catch(() => [] as string[]);

    logger.info({
      postSubmitUrl,
      hasSubmitButton: hasSubmit,
      portalErrors: errorTexts,
      pageHasPasswordInput: postSubmitContent.includes('type="password"'),
    }, "Login form submitted");

    // Decide login success based on the post-submit page itself, NOT by trying
    // to reach /ratedCdrs.aspx (direct deep-link navigation loses the session
    // on this portal — the ASP.NET app requires a click-through from the menu).
    const stillOnLoginAfterSubmit =
      /Account\/Login/i.test(postSubmitUrl) ||
      postSubmitContent.includes('type="password"');

    if (stillOnLoginAfterSubmit) {
      logger.warn({ postSubmitUrl, errorTexts }, "Login truly failed (still on login page after submit)");
      return {
        success: false,
        message: errorTexts.length > 0
          ? `Login failed: ${errorTexts.join(" / ")}`
          : `Login failed: portal kept us on the login page (url=${postSubmitUrl}). Check username/password.`,
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        screenshotPath: "/tmp/post-submit-debug.png",
        htmlSnapshotPath: "/tmp/post-submit-debug.html",
      };
    }

    if (testOnly) {
      return {
        success: true,
        message: "Bağlantı başarılı! Giriş doğrulandı.",
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
      };
    }

    // Reach the CDR page by clicking the menu link from the authenticated welcome
    // page. This preserves the session that direct page.goto() loses.
    const cdrLink = page.locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]").first();
    const cdrLinkCount = await cdrLink.count();
    logger.info({ cdrLinkCount }, "Looking for CDR menu link");

    if (cdrLinkCount > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
        cdrLink.click(),
      ]);
    } else {
      // Fallback: try direct navigation
      await page.goto(`${baseUrl}/ratedCdrs.aspx`, {
        waitUntil: "networkidle",
        timeout: 30000,
      }).catch(() => {});
    }

    const finalUrl = page.url();
    const cdrContent = await page.content();
    logger.info({ finalUrl, viaMenuClick: cdrLinkCount > 0 }, "Reached CDR page candidate");

    if (/Account\/Login/i.test(finalUrl) || (await page.locator("input[type='password']").count()) > 0) {
      const screenshotPath = "/tmp/rated-cdrs-debug.png";
      const htmlSnapshotPath = "/tmp/rated-cdrs-debug.html";
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await import("fs").then(fs => fs.promises.writeFile(htmlSnapshotPath, cdrContent)).catch(() => {});
      return {
        success: false,
        message: `Reached login page when trying to open CDR page (url=${finalUrl}). The user may lack CDR access permission.`,
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        screenshotPath,
        htmlSnapshotPath,
      };
    }

    // Wait for DevExpress grid
    try {
      await page
        .locator(
          "#ctl00_ContentPlaceHolder1_gvRatedCdr, [id*='gvRatedCdr'], [id*='RatedCdr'], table[class*='dxgv']"
        )
        .first()
        .waitFor({ timeout: 15000 });
    } catch {
      logger.warn("Grid not found by primary selector, trying fallback");
    }

    // Extract rows
    const rows: ScrapedRow[] = await page.evaluate(() => {
      const grid =
        document.querySelector("#ctl00_ContentPlaceHolder1_gvRatedCdr") ||
        document.querySelector("[id*='gvRatedCdr']") ||
        document.querySelector("[id*='RatedCdr']") ||
        document.querySelector("table[class*='dxgv']") ||
        document.body;

      const links = Array.from(grid.querySelectorAll("a"));
      const kitLinks = links.filter((a) => {
        const text = (a.textContent || "").trim();
        return text.startsWith("KITP");
      });

      return kitLinks.map((a) => {
        const tr = a.closest("tr");
        const cells = tr
          ? Array.from(tr.querySelectorAll("td")).map((td) =>
              (td.textContent || "").replace(/\s+/g, " ").trim()
            )
          : [];
        const href = a.getAttribute("href");
        return {
          kit_no: (a.textContent || "").trim(),
          raw_row_data: cells,
          kit_detail_href: href,
        };
      });
    });

    if (rows.length === 0) {
      // Debug mode
      const allLinks: string[] = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a")).map((a) => (a.textContent || "").trim())
      );

      const kitTexts = allLinks.filter((t) => t.includes("KIT") || t.includes("KITP"));

      logger.warn({ kitTexts, allLinksCount: allLinks.length }, "No KITP links found, debug info");

      const screenshotPath = "/tmp/rated-cdrs-debug.png";
      const htmlSnapshotPath = "/tmp/rated-cdrs-debug.html";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const html = await page.content();
      await import("fs").then(fs => fs.promises.writeFile(htmlSnapshotPath, html));

      return {
        success: false,
        message: `No KITP records found on page. Found ${allLinks.length} links total. Debug files saved.`,
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        screenshotPath,
        htmlSnapshotPath,
      };
    }

    // Upsert records
    let inserted = 0;
    let updated = 0;
    const now = new Date();

    for (const row of rows) {
      const mapped = mapRowToRecord(row);

      // Check for existing record
      const conditions = [];
      if (mapped.cdrId && mapped.period) {
        conditions.push(eq(stationCdrRecords.cdrId, mapped.cdrId));
        conditions.push(eq(stationCdrRecords.period, mapped.period));
        conditions.push(eq(stationCdrRecords.kitNo, mapped.kitNo));
      }

      let existing = null;
      if (conditions.length > 0) {
        const [found] = await db
          .select()
          .from(stationCdrRecords)
          .where(and(...conditions))
          .limit(1);
        existing = found;
      }

      const recordData = {
        ...mapped,
        syncedAt: now,
      };

      if (existing) {
        await db
          .update(stationCdrRecords)
          .set({ ...recordData, updatedAt: now })
          .where(eq(stationCdrRecords.id, existing.id));
        updated++;
      } else {
        await db.insert(stationCdrRecords).values(recordData).onConflictDoNothing();
        inserted++;
      }
    }

    // Ship-name enrichment: for any KIT we don't yet have a ship name for,
    // visit its detail page once and cache the result. Skip kits that already
    // have a ship_name in station_kits (cache forever).
    if (!testOnly) {
      try {
        await enrichShipNames(page, baseUrl, rows);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "Ship-name enrichment failed (non-fatal)");
      }

      // Daily snapshots: write today's per-(kit,period) totals so we can show
      // day-by-day evolution. Best-effort — failure here must not break sync.
      try {
        await writeDailySnapshots();
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "Daily snapshot write failed (non-fatal)");
      }
    }

    return {
      success: true,
      message: `Sync completed successfully. Found ${rows.length} records.`,
      recordsFound: rows.length,
      recordsInserted: inserted,
      recordsUpdated: updated,
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
          await page.screenshot({ path: screenshotPath }).catch(() => {});
          const html = await page.content().catch(() => "");
          if (html) {
            await import("fs").then(fs => fs.promises.writeFile(htmlSnapshotPath, html));
          }
        }
      }
    } catch {
      // ignore screenshot errors
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
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
