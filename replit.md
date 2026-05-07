# Station Satcom Admin Panel

Full-stack admin panel that unifies two satcom data sources — Station Satcom CDR billing (Playwright scraper) **and** Tototheo TM Starlink (HTTP API) — into a single Cursor.com-inspired Türkçe operations dashboard.

- Detaylı mimari: `docs/ARCHITECTURE.md`
- Tarihsel kararlar: `docs/CHANGELOG.md`
- **Bakım kuralı:** bu dosya operatör hızlı-referansı olarak kalsın. Yeni "Task #X şunu değiştirdi" anlatımları **CHANGELOG**'a, kalıcı mimari notlar **ARCHITECTURE**'a yazılır; `replit.md` sadece güncel komut/stack/gotcha tutar.

## Run

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push --force` — push DB schema changes (dev only)

**Required env vars:** `JWT_SECRET`, `ENCRYPTION_KEY` (64-char hex), `DATABASE_URL`, `SESSION_SECRET`.

**Bootstrap admin:** geliştirmede default `admin@example.com` / `admin123456` otomatik oluşturulur (uyarı log'lanır). **Üretimde** `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` (12+ kar., U/l/d/symbol) zorunlu — yoksa server boot etmez.

## Stack

- pnpm workspaces · Node 24 · TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind v4 + shadcn/ui + Recharts + wouter + react-query
- Backend: Express 5 · Drizzle ORM · PostgreSQL · Zod (`zod/v4`)
- Codegen: Orval (OpenAPI → React Query hooks + Zod)
- Auth: JWT (httpOnly cookie + Bearer fallback) + bcrypt + CSRF double-submit
- Scraper: Playwright headless Chromium (esbuild-externalized)

## Where things live

```
artifacts/
  admin-panel/        # React+Vite frontend (path: /)
  api-server/         # Express backend (path: /api)
lib/
  db/                 # Drizzle schema (source of truth)
  api-spec/           # openapi.yaml + Orval config
  api-client-react/   # Generated React Query hooks + custom-fetch
  api-zod/            # Generated Zod schemas
scripts/              # @workspace/scripts — debug/dump utilities
docs/
  ARCHITECTURE.md     # current architecture detail
  CHANGELOG.md        # historical decisions
```

See `lib/db/src/schema/index.ts` and `lib/api-spec/openapi.yaml` for source-of-truth schemas.

## Architecture (one-liners — see `docs/ARCHITECTURE.md` for detail)

- Two sources unified: Satcom (Playwright) + Tototheo Starlink (HTTP). DB-backed source detection via `GET /api/station/kits/:kitNo/source` (Starlink wins on conflict).
- Single 30-min cron (`scheduler.ts`) runs Starlink → Satcom (`forceFull`); manual sync uses the same orchestrator.
- Multi-account Satcom portals; all data tables `credential_id` FK + cascade.
- Auth: httpOnly cookie + per-`jti` `admin_sessions` (instant revoke) + CSRF double-submit. Roles `owner > admin > viewer > customer`.
- Customer scope via `customer_kit_assignments`; unassigned KITs return 404.
- Storage: per-CDR daily rows + portal-footer monthly totals (no row-sum drift). AES-256-GCM for portal/Tototheo/SMTP secrets.
- Email alerts (Satcom): step-threshold, idempotent per active period, 30s FIFO send queue.
- Contract-first API via Orval; custom fetch handles cookie + CSRF + 401-redirect.

## Design system

- Cursor.com inspired warm cream (#f7f7f4) + warm ink (#26251e); dark mode via `next-themes` (persist `ssa-theme`)
- Tek CTA rengi: Cursor Orange (#f54e00)
- Inter (UI) + JetBrains Mono (sayısal/KIT ID)
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
- `pnpm --filter @workspace/db run push` is interactive when it sees rename candidates. Drop legacy tables manually (`DROP TABLE IF EXISTS ... CASCADE`) **before** `push --force`.
- **Portal session is fragile**: never `page.goto('/ratedCdrs.aspx')` straight after login — click the menu link instead (`a[href*='ratedCdrs.aspx' i]`). After landing on ratedCdrs the **direct URL `?FC=ICCID&FV=<iccid>`** is safe and is how the scraper isolates a single KIT.
- **Volume parsing**: portal uses **binary units (GiB/MiB/KiB)**. Grid map: `col4=service · col9=tarih · col12=GiB · col20=USD-bundle · col22=USD-grand · col23=period(YYYYMM) · col24=cdrId`. Footer follows same indices. Grand total is **col22**, GiB is **col12**.
- **Period combo**: `SetValue/SendPostBack/PerformCallback/__doPostBack` all silently fail. The ONLY working trigger is to **simulate the real click**: open `#..._B-1Img`, then click `<tr>:has-text("YYYYMM")` inside `#..._DDD_L_LBT`. After click, **poll grid `row[23]`** until it equals the requested period. Filter periods `>= 202601` and `<= current YYYYMM`. See `selectPeriod()` in `scraper.ts`.
- **Ship-name enrichment**: `CardDetails.aspx?ICCID=...` requires iframe context — direct goto returns ASP.NET ErrorPage. Click from ratedCdrs grid; cache in `station_kits.ship_name`.
- **First-full-sync flag**: `station_credentials.first_full_sync_at` set only after first successful walk. To re-walk history: `UPDATE station_credentials SET first_full_sync_at = NULL WHERE id = X;` then trigger sync.
- **DevExpress 25-row default**: if a period has >25 CDRs, footer shows only the first page subtotal. Call `setGridPageSize(page, 200)` after every `selectPeriod()` and **before** `parseGrid()`. Footer only renders single-page, so 200 is safe headroom.

## Pointers

- `docs/ARCHITECTURE.md` — current architecture detail
- `docs/CHANGELOG.md` — historical decisions
- `.local/skills/pnpm-workspace` — workspace conventions
- `lib/api-spec/openapi.yaml` — full API contract
- `lib/db/src/schema/index.ts` — DB schema
- `scripts/src/dump-kit-page.ts` — Playwright debug helper for portal probes
