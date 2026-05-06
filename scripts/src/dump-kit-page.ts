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
    console.log(`  tables=${probe.tablesCount}, selects=${probe.selects.length}, dxPeriodInputs=${probe.dxInputs.length}, sampleDateCells=${probe.sampleDateCells.length}`);

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
