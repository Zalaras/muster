---
id: surfaces-shell-control-in-tile-footer
type: decision
status: accepted
date: 2026-09-05
summary: The tile's surface control lives in the footer action row, not the specced header, because a header control truncated every title at the dense grid.
features: [surfaces, tiles]
tags: [ux]
files: [web/src/render/tiles.ts, web/src/style.css]
tests: [web/e2e/plain-shell.spec.ts, web/e2e/tiles.spec.ts]
refs: [docs/history/spec-changelog.md, plan:plain-terminal-session, docs/design/ux-flows.md, kb:adr/surfaces-shell-is-attach-target-not-session]
supersedes: []
---
**Context.** The segmented control that swaps a tile between its Claude and shell surfaces needed a home. The spec placed it in the tile header beside the title and repository line.

**Options.** (A) The header, as specced. (B) The footer's action row, beside the existing actions.

**Decision.** B, decided by measuring against the shipped header rather than the mockup: in the header the control truncated every title and repository line at the densest grid, while the footer showed no overflow at either measured width. The mockup's pessimistic floor came from the mockup, not the build.

**Consequences.** The Focus mainhead keeps its control where the spec put it; only the tile moved. Tile headers stay title-only. A future tile control starts from the footer, and any claim about fit is measured on the shipped build.
