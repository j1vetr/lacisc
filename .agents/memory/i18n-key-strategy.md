---
name: i18n translation key strategy (admin-panel)
description: How react-i18next keys are chosen in the Station Satcom admin panel — read before adding/extending translations.
---

Turkish source strings are used AS the i18next key itself (e.g. `t("Kullanıcı adınız")`), not synthetic keys like `login.username`.

**Why:** the UI was originally Turkish-only and default language stays Turkish; using the literal string as key means the `tr` resource dictionary can stay empty (i18next falls back to the key when no translation exists) instead of duplicating every Turkish string into a `tr.ts` file.

**How to apply:**
- When wrapping a new string: `t("<exact Turkish text>")`, then add that same key to `en.ts`, `ru.ts`, `ar.ts`, `zh.ts`, `es.ts` under `src/i18n/resources/`. Never add it to a `tr` dictionary (there isn't one).
- Interpolated strings use `{{var}}` i18next syntax: `t("...{{var}}...", { var })`.
- Language preference persists to localStorage only (key `ssa-lang`), never the DB — see `src/i18n/config.ts`.
- Backend error/status messages: no `code` field was introduced. Since Turkish source text already IS the key, the API keeps returning Turkish `{ error: "..." }` strings unchanged, and the frontend wraps every displayed `err.message` in `t(err.message)` at the toast/UI call site (falls back to the raw Turkish string if a key is missing — safe degradation). All ~60 static Turkish strings sent by `api-server` routes/middlewares were added as keys to the 5 resource dictionaries. When adding a NEW backend-facing error string, add the matching key to `en/ru/ar/zh/es.ts` too, or it will silently render in Turkish for other languages.

**Diagnosing "this text doesn't switch language" reports:** because untranslated keys silently fall back to rendering the Turkish key, a missing dictionary entry and a missing `t()` wrap look identical to the user. In practice it has almost always been the latter (raw JSX text never wrapped in `t()`) — this recurred across the login screen, the authenticated-panel switcher, and KIT detail pages. Grep the flagged file(s) for Turkish-specific characters (`[şŞçÇğĞıİöÖüÜ]`) that are NOT already inside a `t(...)` call and are not code comments; wrap each hit in `t("<exact Turkish text>")` before assuming a dictionary key is missing.
