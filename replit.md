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
- **Multi-account portals**: `station_credentials` artık birden fazla hesap tutar (her birinin kendi `label`, `username`, `firstFullSyncAt`'i var). Tüm veri tabloları (`station_kits`, `station_kit_daily`, `station_kit_period_total`, `station_sync_logs`) `credential_id` kolonu + FK (ON DELETE CASCADE) ile bu hesaba bağlanır; unique index'ler `(credential_id, kit_no, period[, cdr_id])` olarak partition'lı. KITP kodları globally unique varsayıldığından `station_kits.kit_no` PK olarak kalır. `station_sync_logs.credential_id NULL` = aggregate ("tüm hesaplar") wrap satırı.
- **Sync orchestrator** (`api-server/src/lib/sync-orchestrator.ts`): `POST /station/sync-now` artık fire-and-forget. Orchestrator aktif tüm hesapları sırayla işler, her biri için ayrı sync log + per-account credentials state günceller; biten her hesabın sonucu `accountResults`'a eklenir.
- **Live progress** (`api-server/src/lib/sync-progress.ts`): in-memory snapshot (running flag, account/period/kit sayaçları, current labels, son ~50 event). `GET /station/sync-progress` polling endpoint; UI 1.5sn aralıkla çağırır. Scraper `runSync({reportProgress:true})` ile her dönem/KIT başlangıcında ve her done/failure'da hook'ları tetikler.
- **Per-CDR daily storage**: `station_kit_daily` keeps every CDR row (PK on `credential_id, kit_no, period, cdr_id`) so syncing the same period multiple times is idempotent. `station_kit_period_total` stores the portal **footer** (col12 GiB / col22 USD) per `(credential_id, kit_no, period)` — this is the source of truth for monthly totals (avoids row-sum drift).
- **Two-tier sync**: first sync after `firstFullSyncAt` is null walks every period from **202601** → current; subsequent syncs only touch current + previous period. The flag is set on first successful run.
- **Per-(KIT × dönem) FV scrape**: bare grid `RatedCdrs.aspx` is server-capped at ~100 satır toplam, dolayısıyla bir KIT'in 50+ CDR'ı varsa kesilirdi (KITP00409812/202604: 955 GiB → 774 GiB). Sync artık her dönemde `?FC=ICCID&FV=KITPxxxx` ile her KIT'i ayrı ayrı çekiyor; tek sayfaya sığan footer = gerçek dönem grand-total. To re-fetch historical periods, wipe `firstFullSyncAt` to retrigger a full backfill: `UPDATE station_credentials SET first_full_sync_at = NULL WHERE id = X;` then trigger sync.

## Product

- Yönetici girişi (JWT)
- Panel: canlı sync akış paneli (sadece çalışırken/sonuç varken görünür) + KPI'lar + terminaller listesi (8/12) + sistem sağlığı + manuel sync (4/12)
- Terminaller: aktif dönem footer toplamlarına göre sıralı; satır → KIT detayı
- KIT detayı (`/kits/:kitNo`): aktif dönem KPI'ları + günlük seyir (ComposedChart: GiB barları + USD çizgisi) + per-CDR satır tablosu (servis sütunlu) + aylık özet
- Senkronizasyon kayıtları: scraper çalışmaları, durum rozetleri (per-account + aggregate satırlar)
- Ayarlar: çoklu portal hesabı yönetimi (CRUD + per-account test/wipe), global tehlike bölgesi

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
- **Footer + ALL rows require `pageSize` bump**: DevExpress grid defaults to **25 rows/page** per session. If a period has more than 25 CDRs, the footer (col22) shows ONLY the first page's subtotal — e.g. 774 GiB instead of the real 955 GiB — and `parseGrid()` only sees those 25 rows. Fix: call `setGridPageSize(page, 200)` after every `selectPeriod()` and **before** `parseGrid()`. This invokes DevExpress's own pager handler `ASPx.GVPagerOnClick(gridId, '200')` (same callback the footer's "Page size" dropdown fires) and polls DOM `[id^='..._DXDataRow']` until the row count grows or stabilises. Footer also only renders when grid is single-page, so `200` is safe headroom.

## Pointers

- `.local/skills/pnpm-workspace` — workspace conventions
- `lib/api-spec/openapi.yaml` — full API contract
- `lib/db/src/schema/index.ts` — DB schema
- `scripts/src/dump-kit-page.ts` — Playwright debug helper for portal probes
