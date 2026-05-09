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

- Three sources unified: Satcom (Playwright), Tototheo Starlink (HTTP) and Leo Bridge / Space Norway (HTTP). DB-backed source detection via `GET /api/station/kits/:kitNo/source`; priority `starlink > leobridge > satcom`. Same-source / same-KIT collisions resolved by `MAX(updated_at)` (latest credential wins); detail endpoints also pin the period-total query to that credential.
- Single 30-min cron (`scheduler.ts`) runs Starlink → Leo Bridge → Satcom (`forceFull`); manual sync uses the same orchestrator.
- **All three sources are multi-account** (Task #27): `station_credentials`, `starlink_credentials`, `leobridge_credentials`. Every data table carries `credential_id` FK + cascade; orchestrators iterate active credentials with per-account isolation. CRUD UI parity: `/settings` (Satcom), `/settings/starlink` (Tototheo), `/settings/norway` (Norway) — all are list + dialog with Sync/Test/Düzenle/Sil. KIT detail header shows "Hesap: <label>" Pill via `accountLabel` on `StarlinkTerminalDetail` / `LeobridgeTerminalDetail`.
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

- **Üretime Task #27 geçişi**: `pnpm db push` ÇALIŞTIRMAYIN — drizzle-kit NOT NULL `credential_id` kolonlarını mevcut satırlara tek atışta eklemeye çalışıp patlıyor. Bunun yerine: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrate-task27-multi-account.sql`. Betik singleton `*_settings`'i 1 satır seed'e çevirir, terminal/daily/period_total satırlarını backfill eder, PK/index'leri kompozite çevirir, sync_logs tablolarını yaratır ve eski singleton'ları düşürür. İdempotenttir.
- **Multi-account UI (Task #27)**: Starlink + Norway artık Satcom paritesinde liste + dialog. Düzenleme'de boş token/şifre alanı **mevcut sırrı korur** (NOT NULL kolonu zedelenmesin diye backend açık değer beklemiyor — `null/undefined` = no-op). Hesap silme cascade ile bağlı tüm terminal/daily/period_total/sync_logs satırlarını temizler — onay dialog'u zorunlu.
- **Singleton `/starlink/settings` + `/leobridge/settings` GET endpoint'leri** geriye dönük uyum için duruyor (Dashboard'ın "lastSyncAt" rozeti hâlâ okuyor). UI artık yeni hesap işlemleri için yalnız `/api/{starlink,leobridge}/accounts` CRUD'unu kullanıyor; ileride bu endpoint'ler kaldırılabilir.
- **Same-KIT, multi-account**: aynı KIT birden fazla credential'da görünebilir. Detail endpoint'leri en son güncellenen satırı seçer **ve** dönem-totalini aynı credential'a bağlar (yoksa rozet "Hesap A" derken total "Hesap B"den gelirdi). `starlink-detail.tsx` ve `norway-detail.tsx` `accountLabel` Pill'i gösterir.

- **Atıl KIT keşfi (2026-05-09)**: KIT listesi eskiden sadece `gvRatedCdr` (CDR'lı KIT'ler) üzerinden çıkıyordu → portal'da telemetri/lokasyon üreten ama henüz hiç fatura/CDR olmamış SIM'ler ana listede kayboluyordu (örn. yeni eklenen veya test KIT'leri). Düzeltildi: `fetchKitLocations` ve `fetchHourlyTelemetry` parse ettikleri her unique `kitNo`'yu `station_kits`'a `onConflictDoNothing` ile seed eder (boş ship_name). `/station/kits` endpoint artık `FROM station_kits LEFT JOIN latest period_total` yapısında — atıl satırlar `lastPeriod/totalGib/totalUsd/lastSyncedAt = null` döner. UI (`kits.tsx`) bu sinyali `isIdle` flag'ine çevirip "Henüz kullanım yok" rozeti gösterir; ship-name zenginleştirmesi sonraki sync'te fatura üretirse gerçekleşir. Etkisi tüm hesaplar için otomatik.

- **Saatlik telemetri grid ID prefix (2026-05-09)**: `gvStarlinkMeasurementsOneHour` portal'da **`ctl00_ContentPlaceHolder1_` öneki OLMADAN** render ediliyor (diğer DevExpress grid'lerinden farklı). `scraper-enrichment.ts` `waitForMeasurementsRows`, `fireMeasurementsPager` ve `parseMeasurementsPage` artık çıplak `gvStarlinkMeasurementsOneHour` prefix'ini kullanıyor. Akış: `page.goto(/Starlink/Telemetry/Measurements)` → `fireMeasurementsPager("50", wake)` (page-size komutu grid'i AJAX ile uyandırır; PBL boş gridde no-op) → satırlar gelene kadar bekle → `fireMeasurementsPager("PBL")` (sıralama ASC, son sayfa = en güncel) → 7 (incremental) veya 14 (first-full) sayfa `PBP` ile geri yürü. Pager **page-size dropdown YOK** kullanıcı tarafında ama ASPx.GVPagerOnClick numerik komutu kabul ediyor.

- **Satcom multi-account PK fix (2026-05-09)**: Task #27 migration script `station_kits` ve `station_kit_location` tablolarını **atlamıştı** — ikisinin de PK'si tek sütun (`kit_no`) kalmıştı. Sonuç: 2. hesap eklenince `INSERT ON CONFLICT (kit_no)` upsert'i 1. hesabın satırını sessizce ezerek `credential_id`'yi flip ediyor → KIT'ler kayboluyor. Düzeltildi: schema'da composite `(credential_id, kit_no)` PK; scraper.ts ve scraper-enrichment.ts'deki `onConflictDoUpdate` ve update-where clause'ları credentialId'yi içerir; records.ts `station_kit_location ⋈ station_kits` join'i artık (kit_no, credential_id) üzerinden. Dev DB manuel `ALTER TABLE ... DROP CONSTRAINT pkey; ADD CONSTRAINT pkey PRIMARY KEY (credential_id, kit_no)` ile migrate edildi. Üretime aynı SQL uygulanmalı.

- **Leo Bridge (Norway)**: HTTP/JSON Django portal — login is CSRF token + session cookie. Always send same-origin `Referer` on API GETs; on 401/403 the client re-logs in once and retries. Norway KIT detail must NOT show plan/price (spec). Settings GET is `viewer`-readable (parity with Starlink) so dashboard/kits can detect activity for non-admin operators.

- Never run `pnpm dev` at workspace root — use `restart_workflow`.
- Scraper requires Playwright Chromium; `pnpm approve-builds` may be needed.
- `ENCRYPTION_KEY` must be exactly 64 hex chars.
- `pnpm --filter @workspace/db run push` is interactive when it sees rename candidates. Drop legacy tables manually (`DROP TABLE IF EXISTS ... CASCADE`) **before** `push --force`.
- **Portal session is fragile**: never `page.goto('/ratedCdrs.aspx')` straight after login — click the menu link instead (`a[href*='ratedCdrs.aspx' i]`). After landing on ratedCdrs the **direct URL `?FC=ICCID&FV=<iccid>`** is safe and is how the scraper isolates a single KIT.
- **Volume parsing**: portal uses **binary units (GiB/MiB/KiB)**. Grid map: `col4=service · col9=tarih · col12=GiB · col20=USD-bundle · col22=USD-grand · col23=period(YYYYMM) · col24=cdrId`. Footer follows same indices. Grand total is **col22**, GiB is **col12**.
- **Period combo**: `SetValue/SendPostBack/PerformCallback/__doPostBack` all silently fail. The ONLY working trigger is to **simulate the real click**: open `#..._B-1Img`, then click `<tr>:has-text("YYYYMM")` inside `#..._DDD_L_LBT`. After click, **poll grid `row[23]`** until it equals the requested period. Filter periods `>= 202601` and `<= current YYYYMM`. See `selectPeriod()` in `scraper.ts`.
- **Period combo lives ONLY on FV URL**: bare `/ratedCdrs.aspx` no longer renders the period combo on this portal (probe shows `comboFound:false, buttons:[], hasDoPostBack:false`). Before calling `readPeriodOptions`, navigate to the **first KIT's FV URL** (`?FC=ICCID&FV=KITPxxxx`). The combo materializes there, and DevExpress lazy-loads items so you must also click `#..._B-1Img` once before reading — otherwise `GetItemCount()` returns 1 (only the selected period). See the FV-navigation block right before `readPeriodOptions(page)` in `scraper.ts`.
- **Ship-name enrichment**: `CardDetails.aspx?ICCID=...` requires iframe context — direct goto returns ASP.NET ErrorPage. Click from ratedCdrs grid; cache in `station_kits.ship_name`.
- **First-full-sync flag**: `station_credentials.first_full_sync_at` set only after first successful walk. To re-walk history: `UPDATE station_credentials SET first_full_sync_at = NULL WHERE id = X;` then trigger sync.
- **DevExpress 25-row default**: if a period has >25 CDRs, footer shows only the first page subtotal. Call `setGridPageSize(page, 200)` after every `selectPeriod()` and **before** `parseGrid()`. Footer only renders single-page, so 200 is safe headroom.

- **Satcom GiB → GB (UI birimi)**: portal **GiB** (binary, 2^30) raporlar; UI tek tip **GB** (decimal, 10^9) gösterir. DB/scraper alan adları (`totalGib`, `volumeGib`, `optOutGib`, `stepAlertGib`, `last_alert_threshold_gib`) **legacy** — değerler GiB olarak yazılıp gösterimde `gibToGb()` (×1.073741824) uygulanır. Starlink/Leo Bridge zaten GB döndürür, onlara dönüşüm uygulanmaz. **E-posta eşik** mantığı (`thresholdStepGib`) artık **GB cinsinden** yorumlanır: `alerts.ts` Satcom totalGib'i GB'a çevirip karşılaştırır, `last_alert_threshold_gib` column'unda GB değer saklanır (ad legacy). Geçiş etkisi: önceki "100 (GiB)" eşik kayıtları artık "100 GB" olarak okunur — bir KIT 95 GiB (≈102 GB) iken last=0 ise yeni mantık 100 GB eşiğini geçilmiş sayar ve bir kerelik mail tetikleyebilir.

## Pointers

- `docs/ARCHITECTURE.md` — current architecture detail
- `docs/CHANGELOG.md` — historical decisions
- `.local/skills/pnpm-workspace` — workspace conventions
- `lib/api-spec/openapi.yaml` — full API contract
- `lib/db/src/schema/index.ts` — DB schema
- `scripts/src/dump-kit-page.ts` — Playwright debug helper for portal probes
