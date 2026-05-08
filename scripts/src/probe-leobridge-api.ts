import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT_DIR = "/tmp/leobridge-probe";
const BASE = "https://leobridge.spacenorway.com";
const LOGIN_URL = `${BASE}/accounts/login/?next=/`;

const USER = process.env.LEO_USER ?? "";
const PASS = process.env.LEO_PASS ?? "";

if (!USER || !PASS) {
  console.error("Set LEO_USER and LEO_PASS env vars");
  process.exit(1);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
    await page.locator("input[name='username']").fill(USER);
    await page.locator("input[name='password']").fill(PASS);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
      page.locator("button[type='submit'], input[type='submit']").first().click(),
    ]);
    console.log("Logged in →", page.url());

    const cookies = await ctx.cookies();
    console.log("Session cookies:", cookies.map((c) => c.name).join(", "));

    const endpoints = [
      "/api/info/",
      "/api/accounts/roles/me/",
      "/api/starlink/service-lines",
      "/api/starlink/service-lines/",
      "/api/starlink/terminal/alert",
      "/api/starlink/pool-slices",
      "/api/starlink/terminals",
      "/api/starlink/terminals/",
      "/api/starlink/usage",
      "/api/starlink/billing",
      "/api/starlink/data-usage",
    ];

    for (const ep of endpoints) {
      const url = `${BASE}${ep}`;
      const r = await page.request.get(url, { failOnStatusCode: false }).catch((e) => {
        console.log(`  ERR ${ep}: ${(e as Error).message}`);
        return null;
      });
      if (!r) continue;
      const ct = r.headers()["content-type"] ?? "";
      const text = await r.text().catch(() => "");
      const isJson = /json/i.test(ct);
      console.log(`\n[${r.status()}] ${ep}  (${ct})`);
      if (isJson) {
        try {
          const j = JSON.parse(text);
          // Save full
          const safe = ep.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
          await fs.writeFile(path.join(OUT_DIR, `api_${safe}.json`), JSON.stringify(j, null, 2));
          // Print summary
          if (Array.isArray(j)) {
            console.log(`  Array of ${j.length} items`);
            if (j.length > 0) {
              console.log("  Item[0] keys:", Object.keys(j[0]));
              console.log("  Item[0]:", JSON.stringify(j[0], null, 2).slice(0, 1500));
            }
          } else if (typeof j === "object" && j !== null) {
            console.log("  Keys:", Object.keys(j));
            console.log("  Sample:", JSON.stringify(j, null, 2).slice(0, 1500));
          }
        } catch {
          console.log("  (json parse failed)");
          console.log(text.slice(0, 300));
        }
      } else {
        console.log("  (non-json) " + text.slice(0, 200));
      }
    }

    // Walk frontend pages: /terminals/ + try to find ship/terminal listings
    console.log("\n\n=== Walking /terminals/ frontend ===");
    await page.goto(`${BASE}/terminals/`, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: path.join(OUT_DIR, "10-terminals.png"), fullPage: true });
    // Wait for SPA to load and capture XHR
    const xhr: { url: string; status: number; ct: string }[] = [];
    page.on("response", (r) => {
      const ct = r.headers()["content-type"] ?? "";
      if (/json/i.test(ct)) xhr.push({ url: r.url(), status: r.status(), ct });
    });
    await page.waitForTimeout(4000);
    console.log("XHR calls on /terminals/:");
    xhr.forEach((x) => console.log(`  ${x.status} ${x.url}`));

    // Try to find the front/customer area
    console.log("\n=== Walking /front/ ===");
    await page.goto(`${BASE}/front/`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, "11-front.png"), fullPage: true });
    const navLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          text: (a.textContent || "").trim().slice(0, 60),
          href: (a as HTMLAnchorElement).href,
        }))
        .filter((l) => l.text);
    });
    console.log("Front nav:", JSON.stringify(navLinks.slice(0, 30), null, 2));
  } catch (e) {
    console.error("ERROR:", (e as Error).message);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
