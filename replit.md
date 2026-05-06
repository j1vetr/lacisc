# Station Satcom Admin Panel

Full-stack admin panel that scrapes CDR billing data from the Station Satcom portal and displays it in a Cursor.com-inspired Türkçe operations dashboard.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push --force` — push DB schema changes (dev only). `--force` is required when columns/tables are dropped.

**Required env vars:** `JWT_SECRET`, `ENCRYPTION_KEY` (64-char hex), `DATABASE_URL`, `SESSION_SECRET`.

**Default admin credentials:** `admin@example.com` / `admin123456`

## Stack

- pnpm workspaces · Node 24 · TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind v4 + shadcn/ui + Recharts + wouter + react-query
- Backend: Express 5 · Drizzle ORM · PostgreSQL · Zod (`zod/v4`)
- Codegen: Orval (OpenAPI → React Query hooks + Zod)
- Auth: JWT (jsonwebtoken) + bcrypt
- Scraper: Playwright headless Chromium (esbuild-externalized)

## Where things live

```
artifacts/
  admin-panel/        # React+Vite frontend (path: /)
    src/pages/        # login, dashboard, kits, kit-detail, sync-logs, settings
  api-server/         # Express backend (path: /api)
    src/routes/       # auth.ts, station.ts, records.ts, health.ts
    src/lib/          # scraper.ts, crypto.ts, scheduler.ts, logger.ts
lib/
  db/                 # Drizzle schema (admin_users, station_credentials,
                      #   station_kits, station_kit_daily,
                      #   station_kit_period_total, station_sync_logs)
  api-spec/           # openapi.yaml + Orval config
  api-client-react/   # Generated React Query hooks + custom-fetch w/ auto Bearer
  api-zod/            # Generated Zod schemas
scripts/              # @workspace/scripts — debug/dump utilities
```

See `lib/db/src/schema/index.ts` and `lib/api-spec/openapi.yaml` for source-of-truth schemas.

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives client hooks + server validation via Orval.
- **AES-256-GCM** for portal credentials in DB; `ENCRYPTION_KEY` must be 64 hex chars.
- **Custom fetch with auto-auth** (`lib/api-client-react/src/custom-fetch.ts`): injects `Authorization: Bearer` from `localStorage.auth_token`; 401 → logout + `/login` redirect.
- **Playwright externalized** in esbuild so it runs from `node_modules`, not bundled.
- **Per-CDR daily storage**: `station_kit_daily` keeps every CDR row (PK on `kit_no, period, cdr_id`) so syncing the same period multiple times is idempotent. `station_kit_period_total` stores the portal **footer** (col12 GiB / col22 USD) per `(kit_no, period)` — this is the source of truth for monthly totals (avoids row-sum drift).
- **Two-tier sync**: first sync after `firstFullSyncAt` is null walks every period from **202601** → current; subsequent syncs only touch current + previous period. The flag is set on first successful run.

## Product

- Yönetici girişi (JWT)
- Panel: KPI'lar (toplam KIT / GiB / USD / aktif dönem) + terminaller listesi (8/12) + sistem sağlığı + manuel sync (4/12)
- Terminaller: aktif dönem footer toplamlarına göre sıralı; satır → KIT detayı
- KIT detayı (`/kits/:kitNo`): aktif dönem KPI'ları + günlük seyir (ComposedChart: GiB barları + USD çizgisi) + per-CDR satır tablosu (servis sütunlu) + aylık özet
- Senkronizasyon kayıtları: scraper çalışmaları, durum rozetleri
- Ayarlar: portal bilgileri, bağlantı testi, otomatik sync aralığı

## Design system

- Cursor.com inspired warm cream canvas (#f7f7f4) + warm ink (#26251e)
- Tek CTA rengi: Cursor Orange (#f54e00) — sadece ana eylemlerde
- Inter (UI) + JetBrains Mono (sayısal/kod/KIT ID)
- Hairline-only depth (1px #e6e5e0), drop-shadow yok
- tr-TR (`src/lib/format.ts`); tüm UI Türkçe

## User preferences

- Tüm arayüz Türkçe
- Cursor.com'un editöryel sakinliği
- Eski tablolar (CDR records, daily snapshots) tamamen silindi — geriye dönük migration yok

## Gotchas

- Never run `pnpm dev` at workspace root — use `restart_workflow`.
- Scraper requires Playwright Chromium; `pnpm approve-builds` may be needed.
- `ENCRYPTION_KEY` must be exactly 64 hex chars.
- `pnpm --filter @workspace/db run push` is interactive when it sees rename candidates. After dropping legacy tables drizzle-kit will ask "renamed from X?". Drop them manually first (`DROP TABLE IF EXISTS ... CASCADE`) **before** `push --force` to avoid the prompt.
- **Portal session is fragile**: never `page.goto('/ratedCdrs.aspx')` straight after login — click the menu link instead (`a[href*='ratedCdrs.aspx' i]`). After landing on ratedCdrs the **direct URL `?FC=ICCID&FV=<iccid>`** is safe and is how the scraper isolates a single KIT.
- **Volume parsing**: portal uses **binary units (GiB/MiB/KiB)**. The grid also has a "0 Bytes" in-bundle cell at col20 — the **grand total is col22**, the **GiB volume is col12**. The fixed grid map is: `col4=service · col9=tarih · col12=GiB · col20=USD-bundle · col22=USD-grand · col23=period(YYYYMM) · col24=cdrId`. Footer cells follow the same indices.
- **Period combo**: live combo `window['ctl00_ContentPlaceHolder1_ctl00_ctl00']`. The portal has **NO refresh button** and `SetValue/SendPostBack/PerformCallback/__doPostBack` all silently fail to re-query the grid. The ONLY working trigger is to **simulate the real click**: open the dropdown via `#..._B-1Img`, then click the `<tr>:has-text("YYYYMM")` row inside `#..._DDD_L_LBT`. This fires DevExpress's actual `SelectedIndexChanged` handler. After click, **poll grid `row[23]` (period column)** until it equals the requested period — the callback is async and naive parsing reads stale data (off-by-one). Filter periods `>= 202601` and `<= current YYYYMM`. See `selectPeriod()` in `scraper.ts`.
- **Ship-name enrichment**: KIT detail (`CardDetails.aspx?ICCID=...`) requires iframe context — direct goto returns ASP.NET ErrorPage. Click the link from ratedCdrs grid; cache the result in `station_kits.ship_name` so we only visit each detail page once.
- **First-full-sync flag**: `station_credentials.first_full_sync_at` is set only after the first successful walk completes. If you wipe the DB you must clear this column (or wipe credentials) for the scraper to redo the historical backfill.
- **Footer requires `pageSize=50`**: DevExpress grid only renders the footer when there is a single page. The portal user must have its per-user `pageSize` preference set to 50 server-side; otherwise `parseGrid()` will see an empty footer and `station_kit_period_total` will read 0.

## Pointers

- `.local/skills/pnpm-workspace` — workspace conventions
- `lib/api-spec/openapi.yaml` — full API contract
- `lib/db/src/schema/index.ts` — DB schema
- `scripts/src/dump-kit-page.ts` — Playwright debug helper for portal probes
