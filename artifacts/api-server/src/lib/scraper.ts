import { db, stationCdrRecords } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

export interface SyncResult {
  success: boolean;
  message: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
  screenshotPath?: string;
  htmlSnapshotPath?: string;
}

function parseGb(value: string | null | undefined): number | null {
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  const numMatch = lower.match(/[\d.]+/);
  if (!numMatch) return null;
  const num = parseFloat(numMatch[0]);
  if (isNaN(num)) return null;

  if (lower.includes("gb")) return num;
  if (lower.includes("mb")) return num / 1024;
  if (lower.includes("kb")) return num / (1024 * 1024);
  if (lower.includes("byte") || lower.includes("b")) return num / (1024 * 1024 * 1024);
  return num;
}

interface ScrapedRow {
  kit_no: string;
  raw_row_data: string[];
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

  // Iterate cells and match by pattern
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]?.trim() ?? "";
    if (!cell) continue;

    if (cell.startsWith("KITP")) {
      kitNo = cell;
    } else if (/^\d{4}-\d{2}$/.test(cell) || /^\d{4}\/\d{2}$/.test(cell)) {
      period = cell;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(cell) && !startCdr) {
      startCdr = cell;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(cell) && startCdr && !endCdr) {
      endCdr = cell;
    } else if (/^[\d.]+\s*(GB|MB|KB|Bytes?)/i.test(cell)) {
      totalVolumeData = cell;
      totalVolumeGbNumeric = parseGb(cell);
    } else if (/^[\d.]+\s*min/i.test(cell)) {
      totalVolumeMin = cell;
    } else if (/^[\d.]+\s*msg/i.test(cell)) {
      totalVolumeMsg = cell;
    } else if (/^(USD|EUR|GBP|TRY)$/i.test(cell)) {
      currency = cell;
    } else if (/^\d{5,}$/.test(cell) && !cdrId) {
      cdrId = cell;
    } else if (/^[A-Z]{2,}-\d+/.test(cell) && !customerCode) {
      customerCode = cell;
    } else if (/^[\d.]+$/.test(cell) && currency && !totalPrice) {
      totalPrice = cell;
    } else if (!product && cell.length > 2 && cell.length < 50 && !/^\d/.test(cell)) {
      product = cell;
    } else if (!service && cell.length > 2 && cell.length < 50 && !/^\d/.test(cell)) {
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

    // Navigate to portal
    const baseUrl = portalUrl.endsWith("/") ? portalUrl.slice(0, -1) : portalUrl;
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    // Find and fill login form
    const usernameInput = await page
      .locator(
        "input[type='text'], input[name*='user'], input[name*='User'], input[id*='user'], input[id*='User'], input[name*='login'], input[id*='login']"
      )
      .first();

    if (!(await usernameInput.isVisible())) {
      return {
        success: false,
        message: "Could not find username input on login page",
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
      };
    }

    await usernameInput.fill(username);

    const passwordInput = await page
      .locator("input[type='password']")
      .first();
    await passwordInput.fill(password);

    // Submit login
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {}),
      page.keyboard.press("Enter"),
    ]);

    // Authoritative login check: try to reach the protected CDR page.
    // If the portal session is invalid, ASP.NET will redirect us back to the login page.
    await page.goto(`${baseUrl}/ratedCdrs.aspx`, {
      waitUntil: "networkidle",
      timeout: 30000,
    }).catch(() => {});

    const finalUrl = page.url();
    const cdrContent = await page.content();
    const stillOnLogin =
      /login|signin|default\.aspx/i.test(finalUrl) ||
      (await page.locator("input[type='password']").count()) > 0;

    if (stillOnLogin) {
      const screenshotPath = "/tmp/login-debug.png";
      const htmlSnapshotPath = "/tmp/login-debug.html";
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await import("fs").then(fs => fs.promises.writeFile(htmlSnapshotPath, cdrContent)).catch(() => {});
      logger.warn({ finalUrl }, "Login appears to have failed (still on login page)");
      return {
        success: false,
        message: `Login failed: portal redirected back to login page (url=${finalUrl}). Check credentials and portal URL.`,
        recordsFound: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        screenshotPath,
        htmlSnapshotPath,
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

    if (!/ratedcdrs\.aspx/i.test(finalUrl) && !cdrContent.toLowerCase().includes("cdr")) {
      const screenshotPath = "/tmp/rated-cdrs-debug.png";
      const htmlSnapshotPath = "/tmp/rated-cdrs-debug.html";
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await import("fs").then(fs => fs.promises.writeFile(htmlSnapshotPath, cdrContent)).catch(() => {});
      return {
        success: false,
        message: `Could not reach Rated CDRs page (landed on ${finalUrl})`,
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
        return {
          kit_no: (a.textContent || "").trim(),
          raw_row_data: cells,
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
