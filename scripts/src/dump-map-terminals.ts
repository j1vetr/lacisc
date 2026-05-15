import { createDecipheriv } from "node:crypto";
import { db, stationCredentials, stationKits } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";
import { chromium } from "playwright";

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

const CRED_ID = parseInt(process.argv[2] ?? "3", 10);
// Test ilk N KIT (varsayılan 5)
const LIMIT = parseInt(process.argv[3] ?? "5", 10);

const PRIORITY: RegExp[] = [
  /^(ship\s*name|vessel\s*name|gemi\s*ad[ıi]?)$/i,
  /^(ship|vessel|gemi)$/i,
  /(ship|vessel)\s*name/i,
  /^(customer\s*name|customer)$/i,
  /^(installation\s*site|site\s*name|location)$/i,
  /^(kit\s*description|description|name)$/i,
];

async function main() {
  const [cred] = await db
    .select()
    .from(stationCredentials)
    .where(eq(stationCredentials.id, CRED_ID))
    .limit(1);
  if (!cred) throw new Error(`Credential ${CRED_ID} bulunamadı`);

  const password = decrypt(cred.encryptedPassword);
  const baseUrl = cred.portalUrl.replace(/\/$/, "");
  console.log(`[test] label=${cred.label}  baseUrl=${baseUrl}  limit=${LIMIT}`);

  // KIT4.../KIT3... formatındaki adı boş KIT'leri al
  const kits = await db
    .select({ kitNo: stationKits.kitNo, shipName: stationKits.shipName })
    .from(stationKits)
    .where(
      and(
        eq(stationKits.credentialId, CRED_ID),
        or(isNull(stationKits.shipName), eq(stationKits.shipName, ""))
      )
    )
    .limit(LIMIT);

  console.log(`[test] Adı boş ${kits.length} KIT seçildi: ${kits.map((k) => k.kitNo).join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto(`${baseUrl}/Account/Login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("input[type='text'], input[type='email']").first().fill(cred.username);
  await page.locator("input[type='password']").first().fill(password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
  console.log(`[test] login sonrası: ${page.url()}\n`);

  for (const k of kits) {
    const detailUrl = `${baseUrl}/CardDetails.aspx?ICCID=${encodeURIComponent(k.kitNo)}`;
    await page.goto(detailUrl, { waitUntil: "networkidle", timeout: 20000 });
    const finalUrl = page.url();
    const isError = /ErrorPage/i.test(finalUrl);

    if (isError) {
      console.log(`  ${k.kitNo} → ❌ ErrorPage`);
      continue;
    }

    const pairs: Record<string, string> = await page
      .evaluate(() => {
        const out: Record<string, string> = {};
        document.querySelectorAll("tr").forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("td, th"));
          if (cells.length >= 2) {
            const label = (cells[0].textContent || "").trim().replace(/[:：]\s*$/, "");
            const value = (cells[1].textContent || "").trim();
            if (label && value && label.length < 80 && !out[label]) out[label] = value;
          }
        });
        return out;
      })
      .catch(() => ({} as Record<string, string>));

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

    const statusIcon = shipName ? "✅" : "⚠️ (ad yok)";
    console.log(`  ${k.kitNo} → ${statusIcon} "${shipName ?? ""}"  [${Object.entries(pairs).slice(0,4).map(([k,v]) => `${k}=${v}`).join(" | ")}]`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
