# Station Satcom Admin Panel

Full-stack admin panel that scrapes CDR billing data from the Station Satcom portal and displays it in a professional dark-themed operations dashboard.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

**Required env vars:**
- `JWT_SECRET` — secret for signing JWT tokens
- `ENCRYPTION_KEY` — 64-char hex key for AES-256-GCM credential encryption
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `SESSION_SECRET` — session secret

**Default admin credentials:** `admin@example.com` / `admin123456`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js**: 24, **TypeScript**: 5.9, **Package manager**: pnpm
- **Frontend**: React 18 + Vite + Tailwind CSS v4 + shadcn/ui
- **Backend**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Auth**: JWT (jsonwebtoken) + bcrypt
- **Scraper**: Playwright (headless Chromium)
- **Build**: esbuild (CJS bundle)

## Where things live

```
artifacts/
  admin-panel/        # React+Vite frontend (path: /)
    src/pages/        # login, dashboard, kits, kit-detail, sync-logs, settings
    src/components/   # layout.tsx + shadcn/ui components
    src/lib/          # format.ts, utils.ts
  api-server/         # Express backend (path: /api)
    src/routes/       # auth.ts, station.ts, records.ts, health.ts
    src/lib/          # scraper.ts, crypto.ts, scheduler.ts, logger.ts
    src/middlewares/  # auth.ts (requireAuth JWT middleware)
lib/
  db/                 # Drizzle schema + client (admin_users, station_credentials, station_cdr_records, station_sync_logs, station_kits, station_kit_daily_snapshots)
  api-spec/           # openapi.yaml + orval codegen config
  api-client-react/   # Generated React Query hooks + custom-fetch with auto Bearer token
  api-zod/            # Generated Zod schemas
```

## Architecture decisions

- **Contract-first API**: OpenAPI spec in `lib/api-spec/openapi.yaml` drives all client hooks and server validation via Orval codegen.
- **AES-256-GCM encryption**: Portal credentials stored encrypted in DB; `ENCRYPTION_KEY` must be 64-char hex.
- **Custom fetch with auto-auth**: `lib/api-client-react/src/custom-fetch.ts` reads `auth_token` from localStorage and injects `Authorization: Bearer` on every request; 401 responses trigger automatic logout + redirect to `/login`.
- **Playwright scraper externalized**: `playwright` is in the esbuild external list so it's not bundled; it runs headless Chromium to scrape `ratedCdrs.aspx`.
- **Orval zod mode:single**: Generates a single `api.ts` file; a post-codegen script in `lib/api-spec/package.json` rewrites `lib/api-client-react/src/index.ts` to fix barrel exports.

## Product

- Yönetici Girişi (JWT auth)
- Panel: KPI kartları (toplam KIT, GB, USD, aktif dönem) + Terminaller listesi (8/12) + Sistem Sağlığı (4/12, sync btn içinde)
- Terminaller: terminal başına toplam kullanım/faturalama, satır tıklama → KIT detay
- KIT Detay (`/kits/:kitNo`): aktif dönem KPI'ları + günlük seyir (Recharts dual-axis çizgi grafik + delta tablosu) + aylık özet tablosu
- Senkronizasyon Kayıtları: tüm scraper çalışmaları, renkli durum rozetleri (timeline pasteller)
- Ayarlar: portal bilgileri, bağlantı testi, otomatik sync ayarı

## Design system

- **Theme**: Cursor.com inspired — warm cream canvas (#f7f7f4), warm ink (#26251e)
- **Single CTA color**: Cursor Orange (#f54e00) — used scarcely on primary actions only
- **Fonts**: Inter (UI, weight 400/500/600) + JetBrains Mono (numeric/code/KIT IDs)
- **Depth**: hairline-only (1px #e6e5e0), no drop shadows
- **Locale**: tr-TR throughout (`src/lib/format.ts`); all UI strings in Turkish

## User preferences

- Tüm arayüz Türkçe olmalı
- Cursor.com'un editöryel sakinliği baz alınacak (krem zemin, tek turuncu CTA, hairline depth)

## Gotchas

- Never run `pnpm dev` at workspace root — use `restart_workflow` instead.
- Scraper requires Playwright Chromium; `pnpm approve-builds` may be needed if bcrypt build scripts are blocked.
- `ENCRYPTION_KEY` must be exactly 64 hex chars or crypto operations will throw.
- Settings endpoint returns 404 (not 500) when no credentials configured yet — frontend handles this gracefully.
- **Portal session is fragile**: direct `page.goto('/ratedCdrs.aspx')` after login loses the session and bounces to `/Account/Login?ReturnUrl=%2F/...`. Always reach protected pages by **clicking the menu link** from the welcome page (`a[href*='ratedCdrs.aspx' i]`).
- **Volume parsing**: portal uses **binary units (GiB/MiB/KiB)**, not GB/MB. Each row also contains a "0 Bytes" in-bundle cell that would overwrite the real usage if we picked the last match. Mapper collects all volume cells and picks the **largest** as `totalVolumeData`. Period column is `YYYYMM` (e.g. `202605`), no separator.
- **Daily snapshots are best-effort & idempotent per day**: `writeDailySnapshots()` runs at end of every successful sync and upserts one row per `(kit_no, period, today_YYYY-MM-DD)` into `station_kit_daily_snapshots`. Multiple syncs in the same day overwrite that day's row (we keep the latest value). The KIT detail "Günlük Seyir" view depends on this — it shows nothing until the first post-deploy sync completes.
- **KIT detail pages (`CardDetails.aspx?ICCID=...`) require iframe context**: direct `page.goto()` returns ASP.NET ErrorPage ("[Unknown Error]") even when authenticated. Must **click the link from the ratedCdrs grid** so ASP.NET keeps its viewstate/iframe wrapper. `enrichShipNames()` does this and caches the result in `station_kits` so we only visit each KIT detail page once. KITs whose ship name is still null are retried on each sync.

## Pointers

- See `.local/skills/pnpm-workspace` for workspace conventions
- See `lib/api-spec/openapi.yaml` for full API contract
- See `lib/db/src/schema.ts` for DB schema
