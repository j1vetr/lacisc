---
name: React Query auth-redirect loop via shared query cache clear
description: Why calling queryClient.clear() (or invalidating a shared query key) inside an auth-guard's error-redirect effect can cause an unbounded request storm, and the safer pattern.
---

When multiple components subscribe to the same query key (e.g. a parent
route guard and a nested child guard both calling a "who am I" identity
query), do NOT call `queryClient.clear()` (or invalidate that key) inside an
effect that reacts to that query's error state before redirecting away.

**Why:** Clearing/invalidating resets every sibling observer of that key back
to a loading state. If a parent component conditionally renders the child
guard based on the query's result, the loading flip un-mounts the child. When
the query then re-settles (still erroring, e.g. still logged out) the parent
re-mounts a *brand new* child instance — with a fresh `useRef`/state — which
independently fires its own "redirect on error" effect again, calling
`clear()` again, ad infinitum. A one-shot ref guard inside the child cannot
stop this because the child itself is being destroyed and recreated on every
cycle, not just re-rendered. This can run for hundreds of requests per page
load, and any interviewing full-page-reload guard elsewhere (e.g. a
`window.location.href` in a shared fetch client) can mask it (bounding the
loop by the browser's real navigation replacing the JS context) rather than
fixing it — the storm becomes visible/unbounded only once such a guard is
removed.

**How to apply:** For a redirect triggered by an auth query's error state,
just navigate (SPA route change) — do not also clear/invalidate the shared
query cache in the same effect. If a parent and a child both read the same
auth query and only the child performs the redirect, move the error handling
and redirect entirely into the parent (or wherever the query is first read)
so the child guard is never mounted at all for the unauthenticated case,
instead of letting parent and child both subscribe and duplicate the
error-handling logic.
