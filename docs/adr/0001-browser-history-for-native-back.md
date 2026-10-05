---
status: accepted
---

# Use browser-history entries for native Back without URL routing

Natball Insights will represent user-entered destinations, task screens, drawers, and modal layers as browser-history UI entries so Android Back unwinds the visible interface before it exits the installed PWA. Match Event tab changes and automatically derived Match states will not create history entries, and the app will not introduce addressable URLs or deep-link routing; reload and cold launch will continue to resolve the appropriate task from durable Match state. This preserves native Back behaviour and unsaved in-memory work without taking on a URL-routing contract the offline coaching workflow does not need.

## Consequences

The active UI layer must be coordinated above individual components so a single history transition can close the topmost layer deterministically. Automated acceptance tests must cover nested overlays, destination changes, draft preservation, and exit readiness at the unobstructed Match root.
