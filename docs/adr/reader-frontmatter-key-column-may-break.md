---
id: reader-frontmatter-key-column-may-break
type: decision
status: accepted
date: 2026-09-23
summary: The frontmatter table has a fixed layout with a 40% key column that keys wrap inside, so a long key never forces horizontal scroll in a tile.
features: [reader]
tags: [ux]
files: [web/src/style.css]
tests: []
refs: [plan:frontmatter, kb:adr/reader-frontmatter-flat-table-raw-fallback]
supersedes: []
---
**Context.** The plan asked for the frontmatter table's key column never to wrap, and separately required that the table never force horizontal scroll in a compact tile. The browser review measured the two in conflict: in a 3×2 tile with the file explorer open, keys real files carry (`disable-model-invocation`, `verified_claude_code_version`) pushed the article wider than its box and squeezed the value column to a few characters per line.

**Options.** (A) Keep the key column on one line and accept horizontal scroll for long keys. (B) Give the table a fixed layout with the key column at a set share of the width, and let a key wrap inside it.

**Decision.** B, with the key column at 40%. The no-horizontal-scroll requirement is the one the plan states as observable; the single-line key was an implementation hint that contradicted it. A cap alone did not hold, because an automatic table layout treats a maximum width as a hint; the fixed layout makes the share binding.

**Consequences.** Every frontmatter table gives its key column 40% of the width, including one whose keys are all short. A long key may wrap across lines in a narrow tile, and the value column always keeps the other 60%.
