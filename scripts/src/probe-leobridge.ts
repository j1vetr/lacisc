import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Page, type Request, type Response } from "playwright";

const OUT_DIR = "/tmp/leobridge-probe";
const BASE = "https://leobridge.spacenorway.com";
const LOGIN_URL = `${BASE}/accounts/login/?next=/`;

const USER = process.env.LEO_USER ?? "";
const PASS = process.env.LEO_PASS ?? "";

if (!USER || !PASS) {
  console.error("Set LEO_USER and LEO_PASS env vars");
  process.exit(1);
}

interface NetEntry {
  method: string;
  url: string;
  status?: number;
  ct?: string;
  reqBody?: string;
}

async function dump(page: Page, label: string): Promise<void> {
  const html = await page.content().catch(() => "");
  await fs.writeFile(path.join(OUT_DIR, `${label}.html`), html);
  await page
    .screenshot({ path: path.join(OUT_DIR, `${label}.png`), fullPage: true })
    .catch(() => {});
  console.log(`  → ${label}: ${html.length} chars + screenshot`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  const net: NetEntry[] = [];
  page.on("request", (req: Request) => {
    if (/\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|css|ico)(\?|$)/i.test(req.url())) return;
    net.push({
      method: req.method(),
      url: req.url(),
      reqBody:
        req.method() !== "GET" ? (req.postData() ?? "").slice(0, 500) : undefined,
    });
  });
  page.on("response", async (res: Response) => {
    if (/\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|css|ico)(\?|$)/i.test(res.url())) return;
    const e = net.find((n) => n.url === res.url() && n.status === undefined);
    if (e) {
      e.status = res.status();
      e.ct = res.headers()["content-type"] ?? "";
    }
  });

  try {
    console.log(`[1] Login → ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 30000 });
    await dump(page, "01-login-page");

    // Identify form fields
    const formInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")).map((i) => ({
        name: i.getAttribute("name"),
        id: i.id,
        type: i.type,
        placeholder: i.placeholder,
      }));
      const csrf = (
        document.querySelector("input[name='csrfmiddlewaretoken']") as HTMLInputElement | null
      )?.value;
      const formAction = (document.querySelector("form") as HTMLFormElement | null)?.action;
      return { inputs, csrf: csrf ? csrf.slice(0, 16) + "…" : null, formAction };
    });
    console.log("  Form:", JSON.stringify(formInfo, null, 2));

    await page
      .locator("input[name='username'], input[name='login'], input[type='text']:not([type='hidden'])")
      .first()
      .fill(USER);
    await page.locator("input[type='password']").first().fill(PASS);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {}),
      page.locator("button[type='submit'], input[type='submit']").first().click(),
    ]);
    console.log(`  post-login URL: ${page.url()}`);
    await dump(page, "02-post-login");

    // Capture all links + nav structure on the dashboard
    const navInfo = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          text: (a.textContent || "").trim().slice(0, 60),
          href: (a as HTMLAnchorElement).href,
        }))
        .filter((l) => l.text && !l.href.startsWith("javascript:"));
      // dedupe
      const seen = new Set<string>();
      const unique = links.filter((l) => {
        const k = `${l.text}|${l.href}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const tables = Array.from(document.querySelectorAll("table")).map((t) => {
        const headers = Array.from(t.querySelectorAll("thead th, thead td")).map(
          (th) => (th.textContent || "").trim()
        );
        const firstRow = t.querySelector("tbody tr");
        const cells = firstRow
          ? Array.from(firstRow.querySelectorAll("td")).map((td) =>
              (td.textContent || "").trim().slice(0, 80)
            )
          : [];
        const rowCount = t.querySelectorAll("tbody tr").length;
        return { headers, firstRow: cells, rowCount };
      });
      return { links: unique.slice(0, 80), tables, title: document.title };
    });
    console.log("\n[2] Dashboard nav:");
    console.log(JSON.stringify(navInfo, null, 2));

    // Try to find "ship" / "terminal" / "kit" links
    const candidates = navInfo.links.filter((l) =>
      /ship|terminal|kit|vessel|asset|device|gemi/i.test(l.text + l.href)
    );
    console.log("\n[3] Ship-like candidates:", candidates.length);
    candidates.slice(0, 10).forEach((c) => console.log(`  - ${c.text} → ${c.href}`));

    // Try clicking into the first table row OR first ship-like link
    let target: string | null = null;
    if (navInfo.tables.length > 0 && navInfo.tables[0].rowCount > 0) {
      // Find link inside first row
      const rowLink = await page.evaluate(() => {
        const a = document.querySelector("table tbody tr a") as HTMLAnchorElement | null;
        return a ? a.href : null;
      });
      if (rowLink) target = rowLink;
    }
    if (!target && candidates.length > 0) target = candidates[0].href;

    if (target) {
      console.log(`\n[4] Drill into: ${target}`);
      await page.goto(target, { waitUntil: "networkidle", timeout: 30000 });
      await dump(page, "03-detail");
      const detailInfo = await page.evaluate(() => {
        const title = document.title;
        const h1 = (document.querySelector("h1, h2")?.textContent || "").trim();
        // Pull all label-value pairs from common layouts
        const dlPairs = Array.from(document.querySelectorAll("dl")).flatMap((dl) => {
          const dts = Array.from(dl.querySelectorAll("dt"));
          const dds = Array.from(dl.querySelectorAll("dd"));
          return dts.map((dt, i) => ({
            label: (dt.textContent || "").trim(),
            value: (dds[i]?.textContent || "").trim().slice(0, 120),
          }));
        });
        const tableHeaders = Array.from(document.querySelectorAll("table")).map(
          (t) => ({
            headers: Array.from(t.querySelectorAll("thead th, thead td")).map(
              (th) => (th.textContent || "").trim()
            ),
            rowCount: t.querySelectorAll("tbody tr").length,
            firstRow: Array.from(
              t.querySelector("tbody tr")?.querySelectorAll("td") ?? []
            ).map((td) => (td.textContent || "").trim().slice(0, 80)),
          })
        );
        // Cards / panels
        const panels = Array.from(
          document.querySelectorAll(".card, .panel, .widget, [class*='card'], [class*='panel']")
        )
          .slice(0, 20)
          .map((p) => ({
            heading: (p.querySelector("h2, h3, h4, .title, .header")?.textContent || "").trim().slice(0, 60),
            text: (p.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200),
          }))
          .filter((p) => p.heading);
        return { title, h1, dlPairs, tableHeaders, panels };
      });
      console.log("\nDetail page structure:");
      console.log(JSON.stringify(detailInfo, null, 2));
    } else {
      console.log("\n[4] No target to drill into.");
    }

    // Probe common API paths
    console.log("\n[5] Probing common JSON/API paths:");
    const apiPaths = [
      "/api/",
      "/api/v1/",
      "/api/terminals/",
      "/api/ships/",
      "/api/vessels/",
      "/api/assets/",
      "/api/devices/",
      "/api/usage/",
      "/usage/",
      "/terminals/",
      "/ships/",
    ];
    for (const p of apiPaths) {
      const url = `${BASE}${p}`;
      const r = await page.request.get(url, { failOnStatusCode: false }).catch(() => null);
      if (!r) continue;
      const status = r.status();
      const ct = r.headers()["content-type"] ?? "";
      const bodySnip = (await r.text().catch(() => "")).slice(0, 200);
      console.log(`  ${status} ${ct.padEnd(28)} ${url}  →  ${bodySnip.replace(/\s+/g, " ")}`);
    }

    // Save all network entries
    await fs.writeFile(
      path.join(OUT_DIR, "network.json"),
      JSON.stringify(net, null, 2)
    );
    console.log(`\n[6] Captured ${net.length} requests → network.json`);

    // Highlight likely API/XHR calls
    const apiLike = net.filter(
      (n) =>
        (n.ct && /json|xml/i.test(n.ct)) ||
        /\/api\/|\.json($|\?)/i.test(n.url)
    );
    console.log(`\nLikely API calls (${apiLike.length}):`);
    apiLike.slice(0, 30).forEach((n) =>
      console.log(`  ${(n.status ?? "?").toString().padEnd(4)} ${n.method.padEnd(5)} ${n.url}`)
    );
  } catch (e) {
    console.error("ERROR:", (e as Error).message);
    await dump(page, "99-error");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
