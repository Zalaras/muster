---
id: reader-frontmatter-flat-table-raw-fallback
type: decision
status: accepted
date: 2026-09-23
summary: A leading frontmatter block is split off before markdown parsing; flat key-value lines render as a table from text nodes, anything else as a raw block.
features: [reader]
tags: [ux, user-decision, security]
files: [web/src/reader/frontmatter.ts, web/src/reader/markdown.ts, web/src/style.css]
tests: []
refs: [plan:frontmatter, kb:adr/reader-markdown-rendered-in-browser, kb:adr/reader-diagram-svg-crosses-dompurify, kb:adr/reader-diagram-failure-keeps-source-with-reason]
supersedes: []
---
**Context.** The reader handed a file's bytes straight to the markdown parser, which reads a leading frontmatter block as a rule and a paragraph promoted to a second-level heading. Every kb record, agent and skill file opened with one heading made of its metadata, and that heading led the outline.

**Options.** (A) Hide frontmatter. (B) A collapsed disclosure. (C) A key/value table like GitHub's, with a raw fallback. (D) Full YAML parsing with nested tables.

**Decision.** C, at the developer's call, one row per key rather than GitHub's one header row, because a record's dozen keys as columns overflow a tile. Only flat key-value lines are interpreted; values are shown verbatim, and any other line sends the whole block to a raw preformatted block. No YAML library. The block never reaches the parser and never enters the outline.

**Consequences.** The table and the raw block are built with element creation and text content only, so no file byte is parsed as markup on this path and the sanitizer boundary holds as it does for a diagram's failure line. Metadata such as a superseded status stays visible. Nested YAML reads as raw text until a need for more appears.
