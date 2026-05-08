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

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();

  const xhr: { method: string; url: string; status: number; ct: string; body: string }[] = [];
  page.on("response", async (r) => {
    const ct = r.headers()["content-type"] ?? "";
    if (!/json/i.test(ct)) return;
    if (r.url().includes("mapbox")) return;
    let body = "";
    try { body = await r.text(); } catch { /* */ }
    xhr.push({ method: r.request().method(), url: r.url(), status: r.status(), ct, body });
  });

  // Login
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.locator("input[name='username']").fill(USER);
  await page.locator("input[name='password']").fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
  console.log("Logged in →", page.url());
  xhr.length = 0; // discard login XHRs

  // Helper
  const dumpPage = async (label: string) => {
    await page.waitForTimeout(5000); // SPA render
    const html = await page.content().catch(() => "");
    await fs.writeFile(path.join(OUT_DIR, `${label}.html`), html);
    await page.screenshot({ path: path.join(OUT_DIR, `${label}.png`), fullPage: true });
    // Extract visible labels & numbers
    const text = await page.evaluate(() => {
      // Strip scripts/styles
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script,style,svg").forEach((n) => n.remove());
      return (clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    });
    return text;
  };

  // 1. Service line detail
  console.log(`\n=== /front/service-lines/${SL_ID} ===`);
  const xBefore = xhr.length;
  await page.goto(`${BASE}/front/service-lines/${SL_ID}`, { waitUntil: "networkidle", timeout: 30000 });
  let visible = await dumpPage("20-service-line-detail");
  console.log("VISIBLE TEXT:", visible);
  console.log("\nNEW XHRs on this page:");
  xhr.slice(xBefore).forEach((x) => {
    const u = x.url.replace(BASE, "").replace(/\?.*$/, "");
    console.log(`  ${x.status} ${x.method} ${u}`);
  });

  // 2. Terminal detail
  console.log(`\n=== /front/terminals/${TERMINAL_ID} ===`);
  const xBefore2 = xhr.length;
  await page.goto(`${BASE}/front/terminals/${TERMINAL_ID}`, { waitUntil: "networkidle", timeout: 30000 });
  visible = await dumpPage("21-terminal-detail");
  console.log("VISIBLE TEXT:", visible);
  console.log("\nNEW XHRs on this page:");
  xhr.slice(xBefore2).forEach((x) => {
    const u = x.url.replace(BASE, "").replace(/\?.*$/, "");
    console.log(`  ${x.status} ${x.method} ${u}`);
  });

  // 3. Click into the terminal from the dashboard map (simulates real user nav)
  console.log("\n=== Dashboard → click terminal/service-line in UI ===");
  const xBefore3 = xhr.length;
  await page.goto(`${BASE}/front/`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(4000);
  // Try clicking on TURKYILMAZ1 nickname or any clickable element
  const clickResult = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    const matches = all.filter((el) => {
      const t = (el.textContent || "").trim();
      return t === "TURKYILMAZ1" || t.includes("KITP00078410") || t.includes("SL-DF-12373954");
    });
    return matches.slice(0, 10).map((el) => ({
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 80),
      cls: el.className?.toString?.().slice(0, 80),
    }));
  });
  console.log("Found nickname/kit elements:", JSON.stringify(clickResult, null, 2));
  // Click the first one
  const clicker = page.locator("text=TURKYILMAZ1").first();
  if ((await clicker.count()) > 0) {
    await clicker.click().catch(() => {});
    await page.waitForTimeout(5000);
    console.log("After click URL:", page.url());
    visible = await dumpPage("22-after-click");
    console.log("VISIBLE TEXT:", visible);
  }
  console.log("\nNEW XHRs after click:");
  xhr.slice(xBefore3).forEach((x) => {
    const u = x.url.replace(BASE, "").replace(/\?.*$/, "");
    console.log(`  ${x.status} ${x.method} ${u}`);
  });

  // Save full XHR log with bodies
  await fs.writeFile(path.join(OUT_DIR, "xhr-detail.json"), JSON.stringify(xhr, null, 2));
  console.log(`\nSaved ${xhr.length} XHRs with bodies → xhr-detail.json`);

  // Summary: every UNIQUE endpoint hit (excluding obvious dupes)
  const seen = new Map<string, { status: number; bytes: number }>();
  xhr.forEach((x) => {
    const u = x.url.replace(BASE, "").replace(/\?.*$/, "");
    if (!seen.has(u)) seen.set(u, { status: x.status, bytes: x.body.length });
  });
  console.log("\n=== ALL UNIQUE JSON ENDPOINTS HIT ===");
  [...seen.entries()].sort().forEach(([u, m]) => console.log(`  ${m.status} ${u}  (${m.bytes}B)`));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
