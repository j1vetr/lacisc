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
    src/pages/        # login, dashboard, cdr-records, kits, sync-logs, settings
    src/components/   # layout.tsx + shadcn/ui components
    src/lib/          # format.ts, utils.ts
  api-server/         # Express backend (path: /api)
    src/routes/       # auth.ts, station.ts, records.ts, health.ts
    src/lib/          # scraper.ts, crypto.ts, scheduler.ts, logger.ts
    src/middlewares/  # auth.ts (requireAuth JWT middleware)
lib/
  db/                 # Drizzle schema + client (admin_users, station_credentials, station_cdr_records, station_sync_logs)
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

- Login with JWT auth
- Dashboard: KPI cards (total KITs, GB, USD, active period) + last sync status + quick actions
- CDR Records: paginated, sortable, filterable table with CSV export
- KIT Summary: aggregated usage/billing per terminal with click-through to CDRs
- Sync Logs: history of all scraper runs with color-coded status and duration
- Settings: configure portal URL/credentials, test connection, toggle background sync

## User preferences

_Populate as you build_

## Gotchas

- Never run `pnpm dev` at workspace root — use `restart_workflow` instead.
- Scraper requires Playwright Chromium; `pnpm approve-builds` may be needed if bcrypt build scripts are blocked.
- `ENCRYPTION_KEY` must be exactly 64 hex chars or crypto operations will throw.
- Settings endpoint returns 404 (not 500) when no credentials configured yet — frontend handles this gracefully.

## Pointers

- See `.local/skills/pnpm-workspace` for workspace conventions
- See `lib/api-spec/openapi.yaml` for full API contract
- See `lib/db/src/schema.ts` for DB schema
