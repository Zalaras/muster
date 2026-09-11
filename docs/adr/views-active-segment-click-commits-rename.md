---
id: views-active-segment-click-commits-rename
type: decision
status: accepted
date: 2026-09-03
summary: Clicking the already-pressed view segment commits an open rename instead of cancelling it and sends no prefs request; switching views still cancels.
features: [views, rename]
tags: [ux]
files: [web/src/main.ts, web/src/features/rename.ts]
tests: [web/e2e/rename.spec.ts, web/e2e/views.spec.ts]
refs: [docs/history/spec-changelog.md, plan:claude-status-fixes, kb:adr/rename-muster-owned-title-override-wins, kb:adr/views-focus-and-tiles-peers]
supersedes: []
---
**Context.** The view switcher's pointer-down listeners cancelled any open rename unconditionally, so pressing the already-active segment discarded a typed title with no request sent, while the same gesture on an unrelated button committed it. The plan's implementation note said to leave those listeners alone; its own requirement said otherwise.

**Options.** (A) Keep the unconditional cancel and document it. (B) A click on the pressed segment behaves like any other blur and commits; secondary buttons never cancel; an actual view switch still cancels because the editor's surface is leaving.

**Decision.** B, the requirement as written overruling the implementation note.

**Consequences.** A no-op click on the switcher sends no prefs request. The rename editor's commit-on-blur contract holds everywhere except a real view change. A future control placed in the masthead inherits the same expectation.
