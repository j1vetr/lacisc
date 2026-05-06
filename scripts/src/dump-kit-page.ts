import { createDecipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, stationCredentials } from "@workspace/db";
import { desc } from "drizzle-orm";
import { chromium, type Page } from "playwright";

const OUT_DIR = "/tmp/kit-debug";
const KIT_NO_ARG = process.argv[2] ?? process.env.KIT_NO ?? null;

function decrypt(ciphertext: string): string {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error("ENCRYPTION_KEY missing");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 64 hex chars");
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

async function dump(page: Page, label: string): Promise<void> {
  const html = await page.content().catch(() => "");
  await fs.writeFile(path.join(OUT_DIR, `${label}.html`), html);
  await page.screenshot({ path: path.join(OUT_DIR, `${label}.png`), fullPage: true }).catch(() => {});
  console.log(`  → dumped ${label}.html (${html.length} chars) + ${label}.png`);
}

async function login(page: Page, baseUrl: string, username: string, password: string): Promise<void> {
  console.log(`[login] navigating to ${baseUrl}/Account/Login`);
  await page.goto(`${baseUrl}/Account/Login`, { waitUntil: "networkidle" }).catch(async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
  });
  const userInput = page.locator(
    "input[name='Email'], input[id='Email'], input[name='UserName'], input[id='UserName'], input[name*='user' i], input[id*='user' i], input[type='email'], input[type='text']:not([type='hidden'])"
  ).first();
  await userInput.fill(username);
  const passInput = page.locator("input[type='password']").first();
  await passInput.fill(password);
  const submit = page.locator(
    "button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Giriş'), button:has-text('Sign in')"
  ).first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
    (await submit.count()) > 0 ? submit.click() : passInput.press("Enter"),
  ]);
  console.log(`[login] post-submit URL: ${page.url()}`);
}

async function clickToCdrPage(page: Page, baseUrl: string): Promise<void> {
  const cdrLink = page.locator("a[href*='ratedCdrs.aspx' i], a[href*='RatedCdrs.aspx' i]").first();
  if ((await cdrLink.count()) === 0) {
    console.log("[cdr] menu link not found, trying direct nav");
    await page.goto(`${baseUrl}/ratedCdrs.aspx`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    return;
  }
  console.log("[cdr] clicking menu link");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
    cdrLink.click(),
  ]);
  console.log(`[cdr] arrived at ${page.url()}`);
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log("[db] reading credentials...");
  const [creds] = await db.select().from(stationCredentials).orderBy(desc(stationCredentials.createdAt)).limit(1);
  if (!creds) throw new Error("No station_credentials row in DB");
  console.log(`  portalUrl=${creds.portalUrl} username=${creds.username}`);

  const password = decrypt(creds.encryptedPassword);
  const baseUrl = creds.portalUrl.replace(/\/Account\/Login.*$/i, "").replace(/\/$/, "");
  console.log(`  resolved baseUrl=${baseUrl}`);

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    await login(page, baseUrl, creds.username, password);
    await clickToCdrPage(page, baseUrl);
    await dump(page, "01-rated-cdrs");

    // Find KIT links
    const kitLinks: Array<{ text: string; href: string }> = await page.evaluate((): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = (globalThis as any).document;
      return (Array.from(d.querySelectorAll("a")) as any[])
        .filter((a: any) => (a.textContent || "").trim().startsWith("KITP"))
        .map((a: any) => ({
          text: (a.textContent || "").trim(),
          href: a.getAttribute("href") || "",
        }));
    });
    console.log(`[scan] found ${kitLinks.length} KITP links`);
    await fs.writeFile(path.join(OUT_DIR, "00-kit-links.json"), JSON.stringify(kitLinks, null, 2));

    if (kitLinks.length === 0) {
      console.error("No KIT links — aborting");
      await dump(page, "01-no-kits");
      return;
    }

    // Pick KIT to inspect
    const target: { text: string; href: string } =
      (KIT_NO_ARG ? kitLinks.find((k) => k.text === KIT_NO_ARG) : undefined) ?? kitLinks[0];
    console.log(`[target] ${target.text}  href=${target.href}`);

    // Approach A: direct URL with FC=ICCID&FV=KITP... (this is the page we actually want)
    const directUrl = `${baseUrl}/RatedCdrs.aspx?FC=ICCID&FV=${encodeURIComponent(target.text)}`;
    console.log(`[approachA] direct URL → ${directUrl}`);
    await page.goto(directUrl, { waitUntil: "networkidle", timeout: 30000 }).catch((e) =>
      console.log(`  goto failed: ${e.message}`)
    );
    // Wait for the gvRatedCdr grid to render
    await page.locator("#ctl00_ContentPlaceHolder1_gvRatedCdr").waitFor({ timeout: 15000 }).catch(() => {
      console.log("  gvRatedCdr did not appear within 15s");
    });
    await dump(page, "02-direct-url");
    const directIsLogin = /Account\/Login/i.test(page.url()) || (await page.locator("input[type='password']").count()) > 0;
    console.log(`  bouncedToLogin=${directIsLogin}`);
    if (directIsLogin) {
      await login(page, baseUrl, creds.username, password);
      await page.goto(directUrl, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await dump(page, "02b-direct-url-after-relogin");
    }

    // Probe page structure — pass as STRING so tsx/esbuild doesn't inject __name helper
    const probeSrc = `(() => {
      const d = document;
      const all = (sel) => Array.from(d.querySelectorAll(sel));

      const selects = all("select").map((s) => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).map((o) => ({ value: o.value, text: (o.textContent||'').trim() })),
      }));

      const dxCandidates = all("input[id*='eriod'], input[id*='onem'], input[id*='cb'], input[id*='Year'], input[id*='Month'], select").map((i) => ({
        tag: i.tagName, id: i.id, name: i.name || '', value: i.value || ''
      }));

      const tables = all("table").map((t, idx) => {
        const rows = t.querySelectorAll("tr").length;
        const firstHeader = Array.from(t.querySelectorAll("th, thead td"))
          .slice(0, 14)
          .map((c) => (c.textContent || "").replace(/\\s+/g, " ").trim())
          .filter(Boolean);
        const allRows = Array.from(t.querySelectorAll("tr")).slice(0, 6).map((tr) =>
          Array.from(tr.querySelectorAll("td, th")).map((c) => (c.textContent || "").replace(/\\s+/g, " ").trim())
        );
        return { idx, id: t.id, cls: t.className, rowCount: rows, firstHeader, sampleRows: allRows };
      });

      const datePattern = /\\b20\\d{2}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])\\b/;
      const dateCells = all("td, span")
        .filter((n) => datePattern.test(n.textContent || ""))
        .slice(0, 30)
        .map((n) => (n.textContent || "").trim());

      // Anything with a period-looking value (YYYYMM)
      const periodPattern = /\\b20\\d{2}(0[1-9]|1[0-2])\\b/;
      const periodHits = all("option, span, td, input[value]")
        .map((n) => (n.value || n.textContent || "").trim())
        .filter((t) => periodPattern.test(t))
        .slice(0, 30);

      return {
        url: location.href,
        title: document.title,
        selects,
        dxCandidates: dxCandidates.slice(0, 30),
        tablesCount: tables.length,
        tables: tables.filter((t) => t.rowCount > 1).slice(0, 8),
        sampleDateCells: dateCells.slice(0, 20),
        periodHits: Array.from(new Set(periodHits)),
      };
    })()`;
    const probe = await page.evaluate(probeSrc);

    await fs.writeFile(path.join(OUT_DIR, "04-probe.json"), JSON.stringify(probe, null, 2));
    console.log(`[probe] saved → ${OUT_DIR}/04-probe.json`);
    console.log(`  url=${probe.url}`);

    // === Step 5: enumerate combo via direct window globals ===
    console.log(`\n[periods] reading period combo via window globals`);
    const periodsSrc = `(async () => {
      const out = { comboKeys: [], gridKeys: [], comboPick: null, current: null, itemCount: 0, items: [], error: null };
      try {
        const w = window;
        // DevExpress publishes each created control as window[id]
        for (const k of Object.keys(w)) {
          const v = w[k];
          if (!v || typeof v !== 'object') continue;
          if (typeof v.GetItemCount === 'function' && typeof v.GetValue === 'function' && typeof v.SetValue === 'function') {
            out.comboKeys.push({ id: k, value: v.GetValue(), itemCount: v.GetItemCount() });
          }
          if (typeof v.Refresh === 'function' && typeof v.GetVisibleRowsOnPage === 'function') {
            out.gridKeys.push({ id: k, pageIndex: v.GetPageIndex && v.GetPageIndex(), pageCount: v.GetPageCount && v.GetPageCount() });
          }
        }
        // Prefer the parent combo (id NOT ending in _DDD_L which is the inner listbox)
        const periodCombo = out.comboKeys.find(c => /^\\d{6}$/.test(String(c.value || '')) && !/_DDD_L$/.test(c.id))
          || out.comboKeys.find(c => /^\\d{6}$/.test(String(c.value || '')));
        if (periodCombo) {
          out.comboPick = periodCombo.id;
          const cb = w[periodCombo.id];
          // try opening dropdown to lazy-load items
          if (cb.ShowDropDown) cb.ShowDropDown();
          await new Promise(r => setTimeout(r, 2000));
          out.itemCount = cb.GetItemCount();
          for (let i = 0; i < out.itemCount; i++) {
            const it = cb.GetItem(i);
            if (it) out.items.push({ value: it.value, text: it.text });
          }
          if (cb.HideDropDown) cb.HideDropDown();
          out.current = cb.GetValue();
        }
      } catch (e) { out.error = String(e); }
      return out;
    })()`;
    const periodsRes: any = await page.evaluate(periodsSrc).catch((e) => ({ error: e.message }));
    await fs.writeFile(path.join(OUT_DIR, "05-periods.json"), JSON.stringify(periodsRes, null, 2));
    console.log(`  current=${periodsRes.current} count=${periodsRes.itemCount}`);
    if (periodsRes.items?.length) {
      console.log(`  first: ${periodsRes.items.slice(0, 5).map((i: any) => i.value).join(", ")}`);
      console.log(`  last:  ${periodsRes.items.slice(-5).map((i: any) => i.value).join(", ")}`);
    }

    // === Step 6: select a past, full period and dump it (try 202504 = Apr 2025) ===
    const TRY_PERIOD = process.env.TRY_PERIOD || "202504";
    const valid = periodsRes.items?.find((i: any) => i.value === TRY_PERIOD);
    const comboId = periodsRes.comboPick;
    if (valid && comboId) {
      // Shared summary helper — captures grid pager state + footer (search ALL footer-like classes) + tail HTML
      const pageSummarySrc = `(() => {
        const grid = (window).gvRatedCdr;
        const out = { pageIndex: null, pageCount: null, visibleRows: 0, footers: [], dataRowCount: 0, footerHtmlSample: null };
        if (grid) {
          out.pageIndex = grid.GetPageIndex && grid.GetPageIndex();
          out.pageCount = grid.GetPageCount && grid.GetPageCount();
          out.visibleRows = grid.GetVisibleRowsOnPage && grid.GetVisibleRowsOnPage();
        }
        // ALL <tr> with class containing 'Footer' anywhere under the gvRatedCdr table
        const gvTable = document.getElementById('ctl00_ContentPlaceHolder1_gvRatedCdr');
        if (gvTable) {
          const footRows = gvTable.querySelectorAll("tr[class*='Footer']");
          footRows.forEach(fr => {
            const cells = Array.from(fr.querySelectorAll('td')).map(td => (td.textContent||'').replace(/\\s+/g,' ').trim());
            out.footers.push({ cls: fr.className, cells });
          });
          // Sample last 1500 chars of grid HTML for inspection
          out.footerHtmlSample = gvTable.outerHTML.slice(-2000);
        }
        const rows = document.querySelectorAll("[id^='ctl00_ContentPlaceHolder1_gvRatedCdr_DXDataRow']");
        out.dataRowCount = rows.length;
        return out;
      })()`;

      console.log(`\n[selectPeriod] switching to ${TRY_PERIOD} via combo ${comboId}`);
      await page.evaluate(`(async () => {
        const cb = window['${comboId}'];
        cb.SetValue('${TRY_PERIOD}');
        if (typeof cb.RaiseSelectedIndexChanged === 'function') cb.RaiseSelectedIndexChanged();
        if ((window).gvRatedCdr) (window).gvRatedCdr.Refresh();
      })()`);
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      await dump(page, `06-period-${TRY_PERIOD}-page1`);
      const sum1: any = await page.evaluate(pageSummarySrc);
      console.log(`  page1: dataRows=${sum1.dataRowCount} pageIndex=${sum1.pageIndex} pageCount=${sum1.pageCount} visibleRows=${sum1.visibleRows}`);
      console.log(`  footers found: ${sum1.footers.length}`);
      sum1.footers.forEach((f: any, i: number) =>
        console.log(`    [${i}] cls="${f.cls}" non-empty:`, f.cells.map((v: string, j: number) => v ? `c${j}:${v}` : null).filter(Boolean))
      );

      // === Walk through ALL pages until last — using REAL pager click (NOT GotoPage API) ===
      const totalPages = sum1.pageCount ?? 1;
      let lastSum = sum1;
      for (let p = 1; p < Math.min(totalPages, 10); p++) {
        console.log(`  → click pager NEXT button (label page${p + 1})`);
        // Click the pager NEXT button to mimic a real user (postback may differ from GotoPage API)
        const clicked = await page.evaluate(`(() => {
          const next = document.getElementById('ctl00_ContentPlaceHolder1_gvRatedCdr_DXPagerBottom_PBN');
          if (next) { next.click(); return 'clicked'; }
          // fallback: page-number link
          const pn = document.querySelector('#ctl00_ContentPlaceHolder1_gvRatedCdr_DXPagerBottom a[href*=\"' + ${p + 1} + '\"]');
          if (pn) { pn.click(); return 'clicked-pn'; }
          (window).gvRatedCdr.GotoPage(${p});
          return 'fallback-api';
        })()`);
        console.log(`    pager method: ${clicked}`);
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
        await dump(page, `06-period-${TRY_PERIOD}-page${p + 1}`);
        lastSum = await page.evaluate(pageSummarySrc);
        console.log(`    dataRows=${lastSum.dataRowCount} pageIndex=${lastSum.pageIndex} footers=${lastSum.footers.length}`);
        lastSum.footers.forEach((f: any, i: number) =>
          console.log(`      [${i}] cls="${f.cls}" non-empty:`, f.cells.map((v: string, j: number) => v ? `c${j}:${v}` : null).filter(Boolean))
        );
      }
      // Save tail HTML of last page for offline inspection
      if (lastSum.footerHtmlSample) {
        await fs.writeFile(path.join(OUT_DIR, `06-period-${TRY_PERIOD}-LASTPAGE-tail.html`), lastSum.footerHtmlSample);
        console.log(`  → saved last-page tail HTML for inspection`);
      }

      // === Step 6b: change pager pageSize to 200 via DevExpress's own callback ===
      console.log(`\n[pageSize=200] using ASPx.GVPagerOnClick(grid, '200') from period 1`);
      // First reset to period
      await page.evaluate(`(async () => {
        const cb = window['${comboId}'];
        cb.SetValue('${TRY_PERIOD}');
        if (typeof cb.RaiseSelectedIndexChanged === 'function') cb.RaiseSelectedIndexChanged();
        if ((window).gvRatedCdr) (window).gvRatedCdr.Refresh();
      })()`);
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      // Now bump pageSize
      await page.evaluate(`ASPx.GVPagerOnClick('ctl00_ContentPlaceHolder1_gvRatedCdr','200')`);
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      await dump(page, `06b-period-${TRY_PERIOD}-pageSize200`);
      const sumPS: any = await page.evaluate(pageSummarySrc);
      console.log(`  afterDataRows=${sumPS.dataRowCount} pageCount=${sumPS.pageCount} footers=${sumPS.footers.length}`);
      sumPS.footers.forEach((f: any, i: number) =>
        console.log(`    [${i}] cls="${f.cls}" non-empty:`, f.cells.map((v: string, j: number) => v ? `c${j}:${v}` : null).filter(Boolean))
      );

      // If still paged, walk to last page on pageSize=200 and re-check footer
      if (sumPS.pageCount && sumPS.pageCount > 1) {
        console.log(`\n[walk-to-end] still ${sumPS.pageCount} pages even with size=200 → click NEXT until last`);
        for (let p = 1; p < Math.min(sumPS.pageCount, 10); p++) {
          await page.evaluate(`document.getElementById('ctl00_ContentPlaceHolder1_gvRatedCdr_DXPagerBottom_PBN')?.click();`);
          await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
          await new Promise((r) => setTimeout(r, 2500));
        }
        await dump(page, `06b-period-${TRY_PERIOD}-pageSize200-LAST`);
        const sumLast: any = await page.evaluate(pageSummarySrc);
        console.log(`  LAST PAGE @size=200: dataRows=${sumLast.dataRowCount} pageIndex=${sumLast.pageIndex} pageCount=${sumLast.pageCount} footers=${sumLast.footers.length}`);
        sumLast.footers.forEach((f: any, i: number) =>
          console.log(`    [${i}] cls="${f.cls}" non-empty:`, f.cells.map((v: string, j: number) => v ? `c${j}:${v}` : null).filter(Boolean))
        );
      }
    } else {
      console.log(`\n[selectPeriod] period ${TRY_PERIOD} not in dropdown; skipping`);
    }

    console.log(`\n✓ Done. Inspect ${OUT_DIR}/`);
    console.log(`  - 01-rated-cdrs.html/png  : main grid`);
    console.log(`  - 02-direct-url.html/png  : direct ?FC=ICCID&FV=... attempt`);
    console.log(`  - 03-click-through.html/png : click-through from grid`);
    console.log(`  - 04-probe.json           : structured findings`);
    console.log(`  - 00-kit-links.json       : all KITP links from main grid`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
