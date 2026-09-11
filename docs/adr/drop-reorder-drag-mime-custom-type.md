---
id: drop-reorder-drag-mime-custom-type
type: decision
status: accepted
date: 2026-09-03
summary: Internal tile and rail reorder drags carry a Muster-specific MIME type instead of text/plain, so a dragover can tell a reorder from dragged text.
features: [drop, rail, tiles]
tags: [ux]
files: [web/src/render/dragreorder.ts, web/src/render/tiledrag.ts, web/src/render/dropguard.ts]
tests: [web/e2e/rail-order.spec.ts, web/e2e/tiles.spec.ts, web/e2e/drop.spec.ts]
refs: [docs/history/spec-changelog.md, plan:file-drop-fix, kb:adr/drop-daemon-locates-original-never-stages, kb:adr/rail-whole-card-drag-drop-decides-pin, kb:adr/tiles-drag-reorder-header-handle-insert-shift]
supersedes: []
---
**Context.** Once the dashboard handled foreign drops, its dragover handler had to distinguish Muster's own reorder drags from a text selection dragged in from elsewhere. Both had been plain text, so the plan's edge case for a dragged selection landing on a pane was unsolvable as worded.

**Options.** (A) Keep plain text and infer intent from the drag's origin or payload. (B) Give the reorder drags their own application MIME type; nothing reads the value, only the type.

**Decision.** B, settled during the run rather than at planning.

**Consequences.** A dragover sees a Muster type and treats the drag as a reorder; anything else is foreign and goes to the drop guard. The reorder specs drive real HTML5 drags, so the change is covered without new tests. Any future internal drag uses the same type.
