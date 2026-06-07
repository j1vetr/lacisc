---
name: WhatsApp alert delivery model
description: Durable invariants for the Station Satcom WhatsApp threshold-alert pipeline (wpileti.com gateway). Read before touching whatsapp.ts send/queue/flush logic.
---

# WhatsApp alert delivery — durable invariants

The threshold-alert sender targets wpileti.com, an unofficial WhatsApp gateway whose
anti-spam engine silently parks messages ("Mesaj bekleniyor") when the same contact
receives several messages in a short window — even when the HTTP response is `200 OK`.

**Decision (be consistent with this):** alerts are batched and sent **once per day** at a
panel-configurable hour (`whatsapp_settings.daily_send_hour`, default 13:00 Europe/Istanbul),
NOT per sync round. Alerts persist to the `whatsapp_pending_alert` table; a 60s interval
timer (`runDailyDigestIfDue`) flushes them when the daily window opens.

**Why:** per-round sending (the old in-memory `pendingDigest` + end-of-round flush) produced
N messages on days with N sync rounds, which tripped the gateway's anti-spam and stranded
messages in pending. Daily batching = at most one message series per receiver per day.

**Two invariants that must survive any refactor:**
1. The daily-window claim (`last_daily_flush_date = today`) must be **rolled back if the flush
   throws**, otherwise the day stays marked "sent" and zero messages go out that day.
2. The idempotency claim (`whatsapp_alert_state`) and the `whatsapp_pending_alert` INSERTs
   must happen in **one `db.transaction`**. If they split and the process crashes between them,
   the claim persists but no pending row exists → that threshold never re-fires → the user
   never gets the message.

**Known accepted tradeoff:** `flushPendingDigests` deletes pending rows *after* enqueueing to
the in-memory `sendQueue`. A crash in that tiny window loses that day's messages (at-most-once).
This matches the pre-existing architecture; do not "fix" it into at-least-once without
weighing the duplicate-message anti-spam risk.

Full detail: `docs/CHANGELOG.md` (2026-06-07 entry) and the WhatsApp gotchas in `replit.md`.
