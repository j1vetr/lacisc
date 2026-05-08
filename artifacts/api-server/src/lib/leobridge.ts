import { logger } from "./logger";

export interface LeobridgeConfig {
  portalUrl: string;
  username: string;
  password: string;
}

export interface LeoServiceLineTerminal {
  kitSerialNumber: string;
  active?: boolean;
  currentH3Cell?: { centerLat?: number; centerLon?: number } | null;
}

export interface LeoServiceLine {
  id: number;
  serviceLineNumber: string;
  nickname: string | null;
  active: boolean;
  address: {
    formattedAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  terminals: LeoServiceLineTerminal[];
}

export interface LeoDailyUsage {
  date: string; // YYYY-MM-DD
  priorityGb: number | null;
  standardGb: number | null;
}

export interface LeoBillingPeriod {
  id: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  totalPriorityGb: number | null;
  totalStandardGb: number | null;
  dailyUsages: LeoDailyUsage[];
}

interface CookieJar {
  sessionid?: string;
  csrftoken?: string;
}

function parseSetCookie(jar: CookieJar, headers: Headers): void {
  // Node 22 fetch exposes raw Set-Cookie via getSetCookie().
  const all =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    [];
  for (const raw of all) {
    const [pair] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const value = rest.join("=").trim();
    if (!name) continue;
    const key = name.trim().toLowerCase();
    if (key === "sessionid") jar.sessionid = value;
    else if (key === "csrftoken") jar.csrftoken = value;
  }
}

function cookieHeader(jar: CookieJar): string {
  const parts: string[] = [];
  if (jar.sessionid) parts.push(`sessionid=${jar.sessionid}`);
  if (jar.csrftoken) parts.push(`csrftoken=${jar.csrftoken}`);
  return parts.join("; ");
}

function extractCsrfFromHtml(html: string): string | null {
  const m = html.match(
    /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i
  );
  return m ? m[1] : null;
}

export class LeobridgeClient {
  private jar: CookieJar = {};
  private loggedIn = false;

  constructor(private cfg: LeobridgeConfig) {}

  private base(): string {
    return this.cfg.portalUrl.replace(/\/+$/, "");
  }

  async login(): Promise<void> {
    this.jar = {};
    const loginUrl = `${this.base()}/accounts/login/?next=/`;
    const getRes = await fetch(loginUrl, { redirect: "manual" });
    parseSetCookie(this.jar, getRes.headers);
    const html = await getRes.text();
    const csrf = extractCsrfFromHtml(html);
    if (!csrf) {
      throw new Error("Leo Bridge login formundan CSRF token alınamadı.");
    }
    const body = new URLSearchParams({
      csrfmiddlewaretoken: csrf,
      username: this.cfg.username,
      password: this.cfg.password,
      next: "/",
    });
    const postRes = await fetch(`${this.base()}/accounts/login/`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(this.jar),
        Referer: loginUrl,
        "User-Agent":
          "Mozilla/5.0 (Linux x86_64) AppleWebKit/537.36 LeoBridgeSync/1.0",
      },
      body: body.toString(),
    });
    parseSetCookie(this.jar, postRes.headers);
    // Django redirects (302) to `next` on success; stays 200 with form on
    // failure. A successful login also rotates sessionid.
    if (postRes.status !== 302 && postRes.status !== 301) {
      throw new Error(
        `Leo Bridge giriş başarısız (HTTP ${postRes.status}). Kullanıcı adı/şifre hatalı olabilir.`
      );
    }
    if (!this.jar.sessionid) {
      throw new Error("Leo Bridge giriş sonrası sessionid alınamadı.");
    }
    this.loggedIn = true;
  }

  private async ensureLogin(): Promise<void> {
    if (!this.loggedIn) await this.login();
  }

  private async getJson<T>(path: string): Promise<T> {
    await this.ensureLogin();
    const url = `${this.base()}${path}`;
    const headers = {
      Cookie: cookieHeader(this.jar),
      Accept: "application/json",
      // Portal probes show the API expects a same-origin Referer; sending it
      // matches the browser flow and avoids stricter checks rejecting us.
      Referer: `${this.base()}/`,
      "User-Agent":
        "Mozilla/5.0 (Linux x86_64) AppleWebKit/537.36 LeoBridgeSync/1.0",
    } as const;
    let res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) {
      // Session expired — re-login once and retry.
      logger.debug({ path, status: res.status }, "Leo Bridge re-login");
      this.loggedIn = false;
      await this.login();
      res = await fetch(url, {
        headers: {
          ...headers,
          Cookie: cookieHeader(this.jar),
        },
      });
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `Leo Bridge GET ${path} → HTTP ${res.status}: ${txt.slice(0, 160)}`
      );
    }
    return (await res.json()) as T;
  }

  async listServiceLines(): Promise<LeoServiceLine[]> {
    const data = await this.getJson<{ serviceLines: LeoServiceLine[] }>(
      "/api/starlink/service-lines"
    );
    return data.serviceLines ?? [];
  }

  async getServiceLine(serviceLineNumber: string): Promise<LeoServiceLine> {
    const safe = encodeURIComponent(serviceLineNumber);
    return this.getJson<LeoServiceLine>(
      `/api/starlink/service-line/${safe}`
    );
  }

  async getDataUsage(serviceLineNumber: string): Promise<LeoBillingPeriod[]> {
    const safe = encodeURIComponent(serviceLineNumber);
    return this.getJson<LeoBillingPeriod[]>(
      `/api/starlink/service-line/${safe}/data-usage`
    );
  }

  async listAlerts(): Promise<unknown[]> {
    // Returns whatever shape the portal exposes; intentionally typed as
    // unknown[] until alerts are surfaced in the UI.
    const data = await this.getJson<{ alerts?: unknown[] } | unknown[]>(
      "/api/starlink/alerts"
    );
    if (Array.isArray(data)) return data;
    return data.alerts ?? [];
  }
}

/** Convert an ISO date string (YYYY-MM-DD) to YYYYMM period key. */
export function periodFromStartDate(startDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-/.exec(startDate);
  return m ? `${m[1]}${m[2]}` : null;
}
