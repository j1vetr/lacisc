---
name: Display-name override surfaces
description: Manual ship-name override (display_name) must win on every name surface; checklist of surfaces to update when adding new ones.
---

Rule: any API response, alert, or matcher that emits or matches a ship name must use `displayName ?? sourceName` (JS) or `COALESCE(display_name, <source col>)` (SQL). Sync never touches `display_name`.

**Why:** Users manually correct garbled provider names; a single missed surface (e.g. assignable-kits modal, email alerts, location endpoints) shows the stale name and looks like a bug.

**How to apply:** When adding any new endpoint/report/alert that shows a ship name, coalesce with display_name. Known surfaces (all covered as of Aug 2026): terminal lists + details (3 sources), fleet-map, Satcom location endpoints, assignable-kits (admin-users), WhatsApp lookups (lib/whatsapp.ts), email alerts (lib/alerts.ts), ship-quota name matching (matches display_name too).
