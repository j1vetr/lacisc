import { createDecipheriv } from "node:crypto";
import { db, stationCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";
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

async function main() {
  const [cred] = await db
    .select()
    .from(stationCredentials)
    .where(eq(stationCredentials.id, CRED_ID))
    .limit(1);
  if (!cred) throw new Error(`Credential ${CRED_ID} bulunamadı`);

  const password = decrypt(cred.encryptedPassword);
  const baseUrl = cred.portalUrl.replace(/\/$/, "");
  console.log(`[dump-map] label=${cred.label} url=${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/Account/Login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("input[type='text'], input[type='email']").first().fill(cred.username);
  await page.locator("input[type='password']").first().fill(password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
  console.log(`[dump-map] login sonrası URL: ${page.url()}`);

  await page.goto(`${baseUrl}/Starlink/Telemetry/Map`, { waitUntil: "networkidle", timeout: 30000 });
  const html = await page.content();

  const m = html.match(/terminals\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (!m) {
    console.log("[dump-map] terminals JSON bulunamadı — ham script bloğu:");
    const scripts = html.match(/<script[\s\S]*?<\/script>/gi) ?? [];
    for (const s of scripts) {
      if (s.includes("terminals")) {
        console.log(s.substring(0, 2000));
        break;
      }
    }
    await browser.close();
    return;
  }

  let terminals: unknown[];
  try {
    terminals = JSON.parse(m[1]) as unknown[];
  } catch (e) {
    console.log("[dump-map] JSON parse hatası:", (e as Error).message);
    console.log("Ham snippet:", m[1].substring(0, 500));
    await browser.close();
    return;
  }

  console.log(`\n[dump-map] ${terminals.length} terminal bulundu`);
  console.log("\n=== İLK 5 TERMINAL (TÜM ALANLAR) ===");
  for (const t of terminals.slice(0, 5)) {
    console.log(JSON.stringify(t, null, 2));
    console.log("---");
  }

  console.log("\n=== TÜM ALAN ADLARI ===");
  const allKeys = new Set<string>();
  for (const t of terminals) allKeys.add(...[Object.keys(t as object)].flat());
  console.log([...allKeys].join(", "));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
