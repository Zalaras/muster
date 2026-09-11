---
id: focus-rail-plus-one-live-pane
type: decision
status: accepted
date: 2026-08-16
summary: The Focus view is a rail of static cards beside exactly one live pane, with account usage in a persistent masthead.
features: [focus, rail, usage]
tags: [ux]
files: [web/src/features/focus.ts, web/src/features/rail.ts, web/src/render/masthead.ts, web/src/render/sessions.ts]
tests: [web/e2e/sessions.spec.ts, web/e2e/focus-marker.spec.ts]
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md, kb:adr/surfaces-one-live-client-per-session]
supersedes: []
---
**Context.** The first mockups offered tabbed views and a lead-session chat panel, while the sizing spike had shown that a session may be rendered live at one geometry only.

**Options.** (A) Tabbed views with a chat panel for a lead session, as mocked. (B) A rail of session cards plus one focused live pane, usage in a masthead. (C) Usage behind its own tab.

**Decision.** B. Rail cards are static snapshots of metadata; the focused session is the only live surface in the view; account usage lives in a persistent masthead rather than behind a tab. The tabbed views and the lead-session chat panel are dropped.

**Consequences.** The layout applies the one-live-client law rather than excepting itself from it. Everything a card shows must come from state and status data, never from a live terminal. The masthead is always visible, so it carries the view switcher and daemon health as well.
