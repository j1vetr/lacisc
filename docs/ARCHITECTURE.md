# Architecture

Detaylı "şu an nasıl çalışıyor" referansı. Hızlı operatör özeti için `replit.md`. Tarihsel kararlar için `docs/CHANGELOG.md`.

## Data sources & sync

- **Two data sources, one panel**: Satcom (Playwright scrape) + Tototheo Starlink (HTTP API). Source detection is **DB-backed** via `GET /api/station/kits/:kitNo/source` — no prefix guessing. Conflicts: Starlink wins.
- **Unified 30-min cron** (`scheduler.ts`): `:00`/`:30` UTC tick runs Starlink first then Satcom (`forceFull: true`). Manual "Şimdi Senkronize Et" goes through the same orchestrator.
- **Multi-account portals**: `station_credentials` holds N Satcom accounts; all data tables carry `credential_id` FK with cascade delete and partitioned unique indexes. `station_sync_logs.credential_id NULL` = aggregate wrap row.
- **Live progress** (`sync-progress.ts`): in-memory snapshot with `phase: idle|starlink|satcom` + per-phase counters. `GET /station/sync-progress` polled at 1.5s by `SyncProgressPanel`; global `SyncCompletionToast` polls at 3s and surfaces the result on any page.
- **Two-tier sync**: first sync (`firstFullSyncAt` null) walks **202601** → current; scheduled syncs only touch current + previous. Manual button always passes `forceFull: true`.
- **Per-(KIT × dönem) FV scrape**: bare `RatedCdrs.aspx` is server-capped, so each KIT is fetched separately via `?FC=ICCID&FV=KITPxxxx` to get an accurate footer.
- **Map + Measurements + CardDetails enrichment** (`scraper-enrichment.ts`): after CDR walk, three additional sources are scraped per sync — Map (per-account terminals JSON, lat/lng/active/offline → `station_kit_location`), Measurements (per-KIT hourly grid w/ download/upload Mbps + latency + ping-drop + obstruction + signal-quality min/avg/max → `station_kit_telemetry_hourly`, full-sync 80 pages / incremental 2 pages), CardDetails (per-KIT IMSI/IMEI/MSISDN, active plan + Opt Out / Step Alert thresholds, last session, subscription history → `station_kits` + `station_kit_subscription_history`). All best-effort `.catch(warn)`; final ratedCdrs link click returns scraper to the grid before downstream code runs.

## Auth & RBAC

- httpOnly Secure SameSite=Lax `auth_token` cookie (Bearer fallback for CLI). Per-token `jti` tracked in `admin_sessions`; revocation is instant.
- Double-submit `csrf_token` cookie echoed by `custom-fetch.ts` on mutations.
- Roles: `owner > admin > viewer > customer` (frontend rank `customer:-1`). `requireRole(min)` server-side; `ProtectedRoute minRole` + nav filter UI-side.
- **Customer role**: kullanıcı adı zorunlu / e-posta opsiyonel. KIT scope via `customer_kit_assignments`; backend filters `records.ts` and `starlink.ts` by `kit_no = ANY($1)`; unassigned KITs return 404 (existence not leaked).
- **Audit logs**: `audit_logs` jsonb meta, all auth/user/station mutations recorded with IP+UA+actor.
- **Hardening**: bcrypt cost 12 · 12+ char password policy · 5-fail account lock (15min) · login/change-password rate-limits · `helmet` · CORS allowlist from `REPLIT_DOMAINS` · `GET /readyz` (DB ping + sync summary + scheduler).

## Storage model

- `station_kit_daily` keeps every CDR row (idempotent re-sync).
- `station_kit_period_total` stores the portal **footer** (col12 GiB / col22 USD) — source of truth for monthly totals (no row-sum drift).
- Starlink mirrors with `starlink_terminal_daily` (cumulative cycle GB, deltas computed at read-time) and `starlink_terminal_period_total` (authoritative `poolPlanMonthlyUsage`).
- **AES-256-GCM** for portal credentials, Tototheo bearer token, and SMTP password in DB.

## Email alerts (Satcom only)

`floor(totalGib / step) * step` threshold per active period, idempotent via `last_alert_threshold_gib`, FIFO queue at 30s/mail. SMTP config in DB `email_settings` singleton (AES-GCM password, never returned to UI — `hasPassword` flag only).

## API & client

- **Contract-first API**: OpenAPI spec drives client hooks + server validation via Orval.
- **Custom fetch with auto-auth** (`lib/api-client-react/src/custom-fetch.ts`): `credentials:'include'` carries httpOnly cookie; mutations echo `csrf_token` to `x-csrf-token`; 401 → `/login` redirect. `setAuthTokenGetter()` for CLI/Expo Bearer.
- **Playwright externalized** in esbuild so it runs from `node_modules`.

## Performance

- DB indexes cover all list/KPI queries (active-period sweep, KIT detail composite, sync-logs ORDER BY/per-account).
- Vite `manualChunks` isolates Recharts, framer-motion, cmdk, lucide-react, react-query, react/wouter; routes are React.lazy + Suspense (login cold-start ~137KB gz).
- React Query defaults: `staleTime 30_000`, `gcTime 5min`, `retry 1` (exp backoff max 8s), `refetchOnReconnect: "always"`.
- Prometheus `/api/metrics` (dependency-free text format), optional `METRICS_TOKEN` Bearer.

## Product surface

- Yönetici girişi (JWT, httpOnly cookie)
- Panel: canlı sync paneli + KPI'lar (Toplam KIT / Toplam GiB / Aktif Dönem) + terminaller listesi + sistem sağlığı + manuel sync
- Terminaller: aktif dönem GiB'e göre sıralı; Satcom (turuncu) / Tototheo (mavi) rozetleri; satır → KIT detayı
- KIT detayı (`/kits/:kitNo`): kaynağa göre Satcom CDR tasarımı veya Tototheo zengin terminal tasarımı
- Senkronizasyon kayıtları: per-account + aggregate satırlar, durum rozetleri
- Ayarlar: `/settings` (Satcom hesaplar), `/settings/starlink` (Tototheo), `/settings/email` (SMTP), `/settings/danger` (wipe). Ortak `SettingsLayout` chrome.
- Yöneticiler: `/admin-users` rol-filtreli kullanıcı CRUD, müşteri rolünde inline KIT picker, ayrı `AssignKitsDialog`. `/audit-logs` filtreli sayfalı liste.
- Müşteri görünümü: yalnız Panel + Terminaller + Profilim; sadece atanmış KIT'leri görür.
- Komut paleti `Cmd/Ctrl+K`, kısayol yardımı `?`, `G P / G T / G S` iki-vuruşlu navigasyon.
- USD UI'dan kaldırıldı (DB'de tutuluyor, sadece GiB gösteriliyor).
