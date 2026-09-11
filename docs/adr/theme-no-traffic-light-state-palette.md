---
id: theme-no-traffic-light-state-palette
type: decision
status: rejected
date: 2026-08-29
summary: A green, orange and red traffic-light palette for the tile state dot was not adopted; state colours come only from the design system's state tokens.
features: [tiles, theme]
tags: [ux]
files: [web/src/style.css, docs/design/design-system.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:move-tiles, docs/design/design-system.md]
supersedes: []
---
**Context.** The backlog item for the Tiles grid floated a green, orange and red palette for the state dot in each tile title. The dot already existed, coloured per state from the design system's tokens.

**Options.** (A) Adopt the traffic-light palette for the dot. (B) Keep the state tokens, whose rule is that a state colour may mean only that state, and add a hover title carrying the state word.

**Decision.** A is rejected; B stands. Green and red would carry meanings the token rule reserves for other states, and orange would collide with the attention colour.

**Consequences.** A tile carries no state text, so the hover title is what explains the colour. Any future palette change goes through the design system, not a single surface.
