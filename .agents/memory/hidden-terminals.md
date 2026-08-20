---
name: Hidden terminals feature
description: Surface checklist for the per-terminal "hidden" flag; where exclusion must be enforced when adding new endpoints.
---

# Hidden terminals ("Görünmez yap")

Rule: each source table (station_kits, starlink_terminals, leobridge_terminals) has a `hidden boolean NOT NULL DEFAULT false` column, keyed per source+kit number (updates apply to ALL credential rows of the kit). Hidden terminals must be excluded from **every** read surface except the admin restore list (`GET /admin/hidden-terminals`).

**Why:** user chose "tamamen kaybolsun" — hidden terminals must vanish from lists, fleet map, location endpoints, usage totals/summary, customer scope, assignable kits + assignment validation, WhatsApp & email alerts, and ship-quota name/serial matching (this also fixed double quota deduction when a ship moved between sources). Data is never deleted; restore brings everything back.

**How to apply:** when adding any new endpoint or job that reads terminal data, add a `hidden = false` filter (use `COALESCE(hidden,false)=false` on left joins). Deliberate exception: per-kit detail/daily/monthly/telemetry endpoints are NOT hidden-guarded for operator roles (list filtering + customer-scope gate deemed sufficient).

**classifyKitDb / classifyKitsDb must also skip hidden terminals.** If a hidden Satcom record shares a kitNo/serial with a visible Norway record, the classifier previously returned "satcom" → the Norway assignment was stored with source='satcom' → leobridge customer scope was empty → customer saw nothing. Both functions now add `COALESCE(hidden,false)=false` to all three source queries.

**Route prefix is authoritative for detail pages.** `/kits/:kitNo` always renders SatcomDetail, `/norway/:kitNo` always NorwayDetail, `/starlink/:kitNo` always StarlinkDetail. The DB classifier (`classifyKitDb`) is no longer consulted in `kit-detail.tsx` — it was routing Satcom URLs to Norway when the same serial existed in both tables with Norway being fresher.

**Hiding auto-removes customer assignments.** PATCH .../hidden with hidden=true now deletes the matching rows from `customerKitAssignments` (source-scoped). Without this, old assignment pre-populated the modal as selected even after hiding.

Production DB is external — schema changes are applied manually with idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; never `pnpm db push`.
