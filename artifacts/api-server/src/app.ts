import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { csrfGuard } from "./lib/csrf";

const app: Express = express();

// Behind the Replit shared proxy → trust X-Forwarded-* so req.ip / secure flag
// reflect the real client.
app.set("trust proxy", 1);

// Content-Security-Policy: scoped to the API origin only. The SPA is served by
// a separate Vite/static origin behind the shared proxy and gets its own CSP
// from there — the API never returns HTML so we can lock down everything.
const isProd = process.env.NODE_ENV === "production";
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
        // API-only — no scripts/styles/images served. JSON only.
        connectSrc: ["'self'"],
        ...(isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
  })
);

// CORS: in production restrict to REPLIT_DOMAINS allowlist; in dev allow same
// proxy origin and the Replit dev domain. Always send credentials so the
// httpOnly auth cookie travels.
function buildCorsAllowlist(): string[] {
  const list: string[] = [];
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    for (const d of replitDomains.split(",")) {
      const t = d.trim();
      if (t) list.push(`https://${t}`);
    }
  }
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) list.push(`https://${dev}`);
  // Local proxy origin used by the workspace preview pane (dev only).
  if (!isProd) list.push("http://localhost", "http://localhost:80");
  const extra = process.env.CORS_ALLOWLIST;
  if (extra) {
    for (const d of extra.split(",")) {
      const t = d.trim();
      if (t) list.push(t);
    }
  }
  return list;
}
const allowlist = buildCorsAllowlist();
// Production'da CORS allowlist boşsa hızlı başarısızlık ver — aksi halde
// REPLIT_DOMAINS unutulduğunda canlıda her cross-origin istek 'CORS reddedildi'
// hatasıyla kapanır (sessiz lockout). Boot'ta apaçık hata daha güvenli.
if (isProd && allowlist.length === 0) {
  throw new Error(
    "CORS allowlist is empty in production. Set REPLIT_DOMAINS (comma-separated) or CORS_ALLOWLIST."
  );
}
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      // No-Origin requests (server-to-server, curl) → allow.
      if (!origin) return cb(null, true);
      if (allowlist.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS reddedildi: ${origin}`));
    },
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(csrfGuard);

app.use("/api", router);

export default app;
