---
id: views-focus-and-tiles-peers
type: decision
status: accepted
date: 2026-08-16
summary: The dashboard has two peer views, Focus and Tiles, switched from the masthead or a chord, with the choice persisted daemon-side.
features: [views, focus, tiles]
tags: [ux]
files: [web/src/features/views.ts, internal/server/prefs.go, web/src/render/masthead.ts]
tests: [TestHandlePutPrefs_SetsViewOnlyLeavesDensityUntouched, web/e2e/views.spec.ts]
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md, kb:anchor/prefs.put, kb:anchor/ws.prefs]
supersedes: []
---
**Context.** One mockup put a single live pane beside a rail; another tiled several live terminals in a grid. Both fit the chosen visual direction and served different moments: serving one session versus watching many.

**Options.** (A) Ship one view only. (B) Ship both as peers with identical masthead, state colours, attention ordering and degraded states, differing only in how live surfaces are laid out. (C) Ship Tiles as a modal overlay of Focus.

**Decision.** B. The view is switched from the masthead or a keyboard chord and the choice persists across reloads and daemon restarts as a daemon-owned preference alongside tile density.

**Consequences.** The masthead is laid out with the switcher slot present from the first milestone so adding the second view moves nothing. Both views obey the one-live-client law, so switching moves geometry ownership rather than duplicating it. Anything shown in one view's chrome must be shown in the other's by rule.
