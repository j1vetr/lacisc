import { createDecipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { db, stationCredentials } from "@workspace/db";
import { desc } from "drizzle-orm";
import { chromium, type Page } from "playwright";

const OUT = "/tmp/portal-explore";

function decrypt(ciphertext: string): string {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error("ENCRYPTION_KEY missing");
  const key = Buffer.from(keyHex, "hex");
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

async function dump(page: Page, slug: string): Promise<void> {
  const html = await page.content().catch(() => "");
  await fs.writeFile(path.join(OUT, `${slug}.html`), html);
  await page
    .screenshot({ path: path.join(OUT, `${slug}.png`), fullPage: true })
    .catch(() => {});

  // Extract structured info: title, h1/h2/h3, all label-like text + value siblings,
  // table headers + first data rows.
  const probeSrc = `(() => {
    const d = document;
    const text = (n) => (n?.textContent || '').replace(/\\s+/g,' ').trim();
    const all = (sel) => Array.from(d.querySelectorAll(sel));

    const headings = ['h1','h2','h3','h4'].flatMap(t => all(t).map(text)).filter(Boolean);

    // Collect key/value pairs: <td class*='label'>X</td><td>Y</td>, or
    // span/label adjacent to input/span value.
    const kv = [];
    all("tr").forEach(tr => {
      const cells = Array.from(tr.querySelectorAll("td,th")).map(text);
      if (cells.length === 2 && cells[0] && cells[1] &&
          cells[0].length < 60 && /[A-Za-z]/.test(cells[0])) {
        kv.push({ k: cells[0], v: cells[1] });
      }
    });
    // Also dl/dt/dd
    all("dl").forEach(dl => {
      const dts = Array.from(dl.querySelectorAll("dt"));
      const dds = Array.from(dl.querySelectorAll("dd"));
      dts.forEach((dt, i) => kv.push({ k: text(dt), v: text(dds[i]) }));
    });
    // Also <label for=X>Y</label> + #X
    all("label[for]").forEach(lbl => {
      const id = lbl.getAttribute("for");
      const target = id ? d.getElementById(id) : null;
      if (target) {
        const v = target.value || target.textContent || '';
        kv.push({ k: text(lbl), v: (v||'').trim().slice(0,200) });
      }
    });

    // ASP.NET label spans (id starts with 'lbl' or contains '_lbl')
    all("[id*='lbl' i], [id*='Label' i], [id*='_lbl']").forEach(el => {
      const t = text(el);
      if (t && t.length < 200) kv.push({ k: el.id, v: t });
    });

    // Tables (column headers + first 3 rows)
    const tables = all("table").map(t => {
      const headers = Array.from(t.querySelectorAll("th")).map(text).filter(Boolean);
      const rows = Array.from(t.querySelectorAll("tr")).slice(0, 4)
        .map(tr => Array.from(tr.querySelectorAll("td,th")).map(text));
      return {
        id: t.id || null,
        cls: t.className || null,
        rowCount: t.querySelectorAll("tr").length,
        headers: headers.slice(0, 30),
        sampleRows: rows.filter(r => r.some(c => c)),
      };
    }).filter(t => t.rowCount > 0).slice(0, 10);

    // All anchor links on the page (dedup)
    const links = Array.from(new Set(all("a[href]").map(a =>
      (a.getAttribute('href') || '') + ' :: ' + text(a)
    ))).filter(s => s && !s.startsWith('# ::') && !s.startsWith('javascript:')).slice(0, 80);

    return {
      url: location.href,
      title: d.title,
      headings: Array.from(new Set(headings)).slice(0, 20),
      kvCount: kv.length,
      kv: kv.slice(0, 120),
      tables,
      links,
    };
  })()`;
  const probe = await page.evaluate(probeSrc).catch((e) => ({ error: String(e) }));
  await fs.writeFile(
    path.join(OUT, `${slug}.json`),
    JSON.stringify(probe, null, 2)
  );
  console.log(`  → ${slug}: html(${html.length}) + screenshot + probe`);
}

async function login(
  page: Page,
  baseUrl: string,
  username: string,
  password: string
): Promise<void> {
  console.log(`[login] ${baseUrl}/Account/Login`);
  await page
    .goto(`${baseUrl}/Account/Login`, { waitUntil: "networkidle" })
    .catch(async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
    });
  const userInput = page
    .locator(
      "input[name='Email'], input[id='Email'], input[name='UserName'], input[id='UserName'], input[name*='user' i], input[id*='user' i], input[type='email'], input[type='text']:not([type='hidden'])"
    )
    .first();
  await userInput.fill(username);
  const passInput = page.locator("input[type='password']").first();
  await passInput.fill(password);
  const submit = page
    .locator(
      "button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Giriş'), button:has-text('Sign in')"
    )
    .first();
  await Promise.all([
    page
      .waitForNavigation({ waitUntil: "networkidle", timeout: 25000 })
      .catch(() => {}),
    (await submit.count()) > 0 ? submit.click() : passInput.press("Enter"),
  ]);
  console.log(`[login] now at ${page.url()}`);
}

async function gotoMenu(page: Page, baseUrl: string, hrefMatch: string): Promise<boolean> {
  // Prefer clicking via menu link to preserve session context
  const link = page
    .locator(`a[href*='${hrefMatch}' i]`)
    .first();
  if ((await link.count()) > 0) {
    await Promise.all([
      page
        .waitForNavigation({ waitUntil: "networkidle", timeout: 25000 })
        .catch(() => {}),
      link.click(),
    ]);
    return true;
  }
  // Fallback to direct goto
  await page
    .goto(`${baseUrl}/${hrefMatch}`, { waitUntil: "networkidle", timeout: 25000 })
    .catch(() => {});
  return /\/Account\/Login/i.test(page.url()) === false;
}

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true });
  const [creds] = await db
    .select()
    .from(stationCredentials)
    .orderBy(desc(stationCredentials.createdAt))
    .limit(1);
  if (!creds) throw new Error("No station_credentials");
  const password = decrypt(creds.encryptedPassword);
  const baseUrl = new URL(creds.portalUrl).origin;
  console.log(`baseUrl=${baseUrl} user=${creds.username}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    await login(page, baseUrl, creds.username, password);

    // 1. Landing / dashboard (after login lands on /)
    await dump(page, "00-landing");

    // 2. RatedCdrs (already known but probe again for context)
    await page
      .goto(`${baseUrl}/ratedCdrs.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "01-ratedCdrs");

    // Capture the global menu/nav links from landing for reference
    const menuLinks = (await page.evaluate(`(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ href: a.getAttribute('href') || '', text: (a.textContent||'').trim() }))
        .filter(l => /\\.aspx/i.test(l.href) || /^\\?/.test(l.href))
        .filter(l => !/CardDetails|CdrDetails/i.test(l.href));
    })()`)) as Array<{ href: string; text: string }>;
    const uniq = Array.from(new Map(menuLinks.map(l => [l.href, l])).values());
    await fs.writeFile(path.join(OUT, "_menu.json"), JSON.stringify(uniq, null, 2));
    console.log(`menu links: ${uniq.length}`);

    // 3. CardDetails for one KIT (use direct URL — session cookie carries)
    const kitNo = "KITP00097437";
    await page
      .goto(`${baseUrl}/CardDetails.aspx?ICCID=${kitNo}`, {
        waitUntil: "networkidle",
      })
      .catch(() => {});
    await dump(page, `02-CardDetails-${kitNo}`);

    // 4. customerDetails
    await page
      .goto(`${baseUrl}/customerDetails.aspx?CustomerID=24418`, {
        waitUntil: "networkidle",
      })
      .catch(() => {});
    await dump(page, "03-customerDetails");

    // 5. SimCardPivot
    await page
      .goto(`${baseUrl}/SimCardPivot.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "04-SimCardPivot");

    // 6. ChargesOverview
    await page
      .goto(`${baseUrl}/ChargesOverview.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "05-ChargesOverview");

    // 7. ChargesOverviewBar
    await page
      .goto(`${baseUrl}/ChargesOverviewBar.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "06-ChargesOverviewBar");

    // 8. ChargesDetails (default)
    await page
      .goto(`${baseUrl}/ChargesDetails.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "07-ChargesDetails");

    // 9. ChargesDetails preset: Detailed Report
    await page
      .goto(
        `${baseUrl}/ChargesDetails.aspx?IsPublic=1&Preset=Detailed+Report`,
        { waitUntil: "networkidle" }
      )
      .catch(() => {});
    await dump(page, "07b-ChargesDetails-Detailed");

    // 10. PricePlans
    await page
      .goto(`${baseUrl}/PricePlans.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "08-PricePlans");

    // 11. LoadCardInfo
    await page
      .goto(`${baseUrl}/LoadCardInfo.aspx`, { waitUntil: "networkidle" })
      .catch(() => {});
    await dump(page, "09-LoadCardInfo");

    // 12. Traffic monitor trigger history (alerts)
    await page
      .goto(
        `${baseUrl}/Reports/ReportTrafficMonitorTriggerHitory.aspx`,
        { waitUntil: "networkidle" }
      )
      .catch(() => {});
    await dump(page, "10-TrafficMonitorTriggerHistory");

    // 13. CdrDetails example (one CDR id from ratedCdrs)
    await page
      .goto(`${baseUrl}/CdrDetails.aspx?CdrID=103267440.21`, {
        waitUntil: "networkidle",
      })
      .catch(() => {});
    await dump(page, "11-CdrDetails-sample");

    console.log(`\n✓ Done. Inspect ${OUT}/`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
