// @ts-nocheck
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT_DIR = "/tmp/leobridge-probe";
const BASE = "https://leobridge.spacenorway.com";
const LOGIN_URL = `${BASE}/accounts/login/?next=/`;

const USER = process.env.LEO_USER ?? "";
const PASS = process.env.LEO_PASS ?? "";

const SL_ID = 185;
const TERMINAL_ID = 375;
const KIT_NO = "KITP00078410";
const SL_NUMBER = "SL-DF-12373954-77663-19";

if (!USER || !PASS) {
  console.error("Set LEO_USER and LEO_PASS env vars");
  process.exit(1);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator("input[name='username']").fill(USER);
  await page.locator("input[name='password']").fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
  console.log("Logged in →", page.url());

  // Listen to all JSON XHR going forward
  const xhr: { method: string; url: string; status: number; ct: string; preview: string }[] = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] ?? "";
    if (!/json/i.test(ct)) return;
    if (r.url().includes("mapbox")) return;
    let preview = "";
    try {
      preview = (await r.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    xhr.push({
      method: r.request().method(),
      url: r.url(),
      status: r.status(),
      ct,
      preview,
    });
  });

  // Visit dashboard, then try to drill into the terminal/service-line
  console.log("\n=== Walking SPA pages ===");
  const pagesToVisit = [
    "/",
    "/front/",
    "/front/orders",
    "/front/orders/",
    `/front/service-lines/${SL_ID}`,
    `/front/service-lines/${SL_ID}/`,
    `/front/terminals/${TERMINAL_ID}`,
    `/front/terminals/${TERMINAL_ID}/`,
    `/front/dashboard/`,
    "/terminals/",
    "/billing/",
    "/usage/",
  ];
  for (const p of pagesToVisit) {
    const url = `${BASE}${p}`;
    try {
      const r = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(2500);
      console.log(`  ${r?.status() ?? "?"} ${p}`);
    } catch (e) {
      console.log(`  ERR ${p}: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Probe explicit usage/billing endpoints with the auth cookie
  console.log("\n=== Direct API probes ===");
  const endpoints = [
    `/api/starlink/service-lines/${SL_ID}`,
    `/api/starlink/service-lines/${SL_ID}/`,
    `/api/starlink/service-lines/${SL_ID}/usage`,
    `/api/starlink/service-lines/${SL_ID}/billing-cycles`,
    `/api/starlink/service-lines/${SL_ID}/data-usage`,
    `/api/starlink/service-line-data-usage/${SL_NUMBER}`,
    `/api/starlink/service-line/${SL_NUMBER}/usage`,
    `/api/starlink/data-blocks`,
    `/api/starlink/data-blocks/`,
    `/api/starlink/data-block-usage`,
    `/api/starlink/billing-cycles`,
    `/api/starlink/billing-cycles/${SL_NUMBER}`,
    `/api/starlink/billing/${SL_NUMBER}`,
    `/api/starlink/usage/${SL_NUMBER}`,
    `/api/starlink/usage`,
    `/api/starlink/data-usage`,
    `/api/starlink/data-usage/${SL_NUMBER}`,
    `/api/starlink/terminals/${TERMINAL_ID}`,
    `/api/starlink/terminal/${TERMINAL_ID}`,
    `/api/starlink/terminal/${TERMINAL_ID}/usage`,
    `/api/starlink/terminal/usage`,
    `/api/starlink/terminal-usage`,
    `/api/starlink/router-usage`,
    `/api/starlink/account/${SL_NUMBER}/usage`,
    `/api/starlink/recurring-blocks`,
    `/api/starlink/products`,
    `/api/starlink/orders`,
    `/api/starlink/orders/`,
    `/api/orders/`,
    `/api/orders`,
  ];
  for (const ep of endpoints) {
    const url = `${BASE}${ep}`;
    const r = await page.request.get(url, { failOnStatusCode: false }).catch(() => null);
    if (!r) continue;
    const ct = r.headers()["content-type"] ?? "";
    const text = (await r.text().catch(() => "")).slice(0, 250);
    const tag = /json/i.test(ct) ? "✓" : " ";
    console.log(`  ${tag} [${r.status()}] ${ep}  →  ${text.replace(/\s+/g, " ").slice(0, 160)}`);
    if (/json/i.test(ct) && r.status() === 200) {
      const safe = ep.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
      await fs.writeFile(path.join(OUT_DIR, `usage_${safe}.json`), text);
    }
  }

  // Search the front bundle for API path patterns
  console.log("\n=== Static bundle scan for API patterns ===");
  const bundles = [
    "/static/front/assets/index-DvOHkokU.js",
    "/static/front/assets/main-DTCtDdgV.js",
    "/static/front/assets/SliceDataUsage-Cyq5v9rO.js",
    "/static/front/assets/usePoolSlices-BhIo0fZW.js",
  ];
  for (const b of bundles) {
    const r = await page.request.get(`${BASE}${b}`, { failOnStatusCode: false });
    if (r.status() !== 200) {
      console.log(`  ${r.status()} ${b}`);
      continue;
    }
    const txt = await r.text();
    const matches = Array.from(txt.matchAll(/["'`](\/api\/[a-zA-Z0-9_/${}.\-:]+)["'`]/g));
    const unique = Array.from(new Set(matches.map((m) => m[1]))).sort();
    console.log(`\n  ${b} → ${unique.length} api paths:`);
    unique.slice(0, 50).forEach((p) => console.log(`    ${p}`));
  }

  // Save XHR log
  await fs.writeFile(path.join(OUT_DIR, "xhr.json"), JSON.stringify(xhr, null, 2));
  console.log(`\nCaptured ${xhr.length} JSON XHR responses → xhr.json`);
  const seen = new Set<string>();
  console.log("\nUnique JSON XHR endpoints visited (status, url):");
  xhr.forEach((x) => {
    const key = `${x.status} ${x.url.replace(/\?.*$/, "")}`;
    if (seen.has(key)) return;
    seen.add(key);
    console.log(`  ${key}`);
  });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
