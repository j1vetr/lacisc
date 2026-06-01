---
name: Source selection — freshest wins
description: How multi-source (Satcom/Starlink/Leobridge) KIT conflicts are resolved and why stale rows are kept visible for manual deletion.
---

# Source selection: freshest wins

A single KIT can appear in more than one data source at the same time — most
commonly when a KIT physically moves from one provider to another (e.g.
Tototheo/Starlink → Norway/Leo Bridge) but the old source's row is never removed.

## Rule
- Conflict resolution selects the source with the **most recent timestamp**
  (`updated_at` / `lastSeenAt`). Source priority (`starlink > leobridge > satcom`)
  is **only a tie-break** when timestamps are equal.
- This lives in `pickWinner` (customer-scope), used by detail-routing
  classification, and is mirrored by cross-source dedup on the fleet map
  (Map keyed by kit number, freshest wins).

**Why:** the earlier design put source priority first, so a KIT that moved to a
new provider stayed pinned to the stale (higher-priority) source forever. The
business reality is "wherever the KIT reported most recently is where it is now."

**How to apply:** any new code that has to choose one source for a KIT across
Satcom/Starlink/Leobridge must sort by timestamp first, priority second — never
priority first.

## Stale rows are NOT auto-hidden in lists
The KIT list page intentionally does **not** cross-source dedup. Stale rows stay
visible so an admin can delete them manually (delete endpoints per source). The
fleet map dedups (one pin) but the list does not (so the stale entry remains
actionable).

**Why:** auto-hiding a stale row would make it impossible to clean up. Deletion
is a one-time cleanup, not a permanent block — if the KIT is still active in that
source, the next sync re-creates the row.

## Manual delete completeness
Per-source terminal delete must remove ALL kit-scoped rows in one DB
transaction: terminal snapshot + daily + period-total + `whatsapp_alert_state`
(matched by source + kit). Child tables FK to the credential, not the terminal,
so cascade does not cover them — they must be deleted explicitly. Leaving
`whatsapp_alert_state` behind would suppress expected re-alerts if the KIT later
returns in the same period.
