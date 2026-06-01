---
name: Monochrome-primary design migration
description: Pitfall when migrating a token-based design system from a colored brand accent to a monochrome primary.
---

# Monochrome `--primary` collapses bg-primary vs bg-foreground states

When a design migration removes the chromatic brand accent and makes `--primary`
monochrome (white in dark, near-black in light), any UI state that previously
relied on `bg-primary` / `text-primary` to *distinguish itself* from neutral
`bg-foreground` / `text-foreground` becomes invisible — both are now monochrome
and nearly identical.

**Why:** A colored `--primary` (e.g. orange) was doubling as a de-facto semantic
status color. Quota "warn" progress bars used `warn ? "bg-primary" : "bg-foreground"`;
once primary went monochrome the warn and normal bars looked the same.

**How to apply:** Before flattening `--primary` to monochrome, audit
`bg-primary` / `text-primary` usages. Any that encode *semantics* (warning,
active, threshold) must move to a dedicated semantic token (e.g. add `--warning`
amber with `--color-warning` in the `@theme` block, plus `:root` and `.dark`
values) rather than leaning on primary.

**Related rules for this kind of "single accent" system:**
- Reserve the one chromatic accent (here sky-blue) strictly for signal roles —
  focus ring, links, selection. Never use it as a CTA fill or glow.
- For light-mode link/text on white, verify WCAG AA (≥4.5:1). A blue at L~42%
  fails; drop to ~L38% to pass while keeping focus indicators (≥3:1) lighter.
