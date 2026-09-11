---
id: tiles-live-top-n-snapshot-rest
type: decision
status: superseded
date: 2026-08-16
summary: In Tiles the live grid holds the top N sessions by attention and every other session is a snapshot card; density sets N and every tile's geometry.
features: [tiles]
tags: [ux]
files: [web/src/render/tiles.ts, web/src/sessions/live.ts]
tests: [web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md, kb:adr/surfaces-one-live-client-per-session]
supersedes: []
---
**Context.** Tiles wanted several live terminals at once, but the one-live-client law and the modest session count meant only a bounded grid could be live, and the rest had to be represented some other way.

**Options.** (A) Every session live in a scrolling grid. (B) A fixed-size live grid filled by attention rank, with the remainder as a strip of static snapshot cards. (C) A live grid with no strip; overflow hidden.

**Decision.** B. The density control chooses the grid shape and thereby N, and changes every tile's geometry at once.

**Consequences.** Grid membership follows the attention comparator, so a change of state can move a session in or out of the live grid. That churn is what the superseding record removes by making membership sticky after view entry.
