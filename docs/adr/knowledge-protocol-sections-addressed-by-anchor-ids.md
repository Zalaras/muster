---
id: knowledge-protocol-sections-addressed-by-anchor-ids
type: decision
status: accepted
date: 2026-09-11
summary: Protocol sections are addressed by stable anchor ids in HTML comments, not section numbers; every citation is an anchor token the kb check validates.
features: [knowledge]
tags: [pipeline]
files: [docs/protocol.md, tools/kb/anchors.tsv, internal/kb/anchor.go, internal/kb/cite.go]
tests: []
refs: [docs/history/protocol-changelog.md, docs/conventions.md, kb:anchor/conventions]
supersedes: []
---
**Context.** Code comments, plans, tests and history all cited the protocol by section number. Inserting a section renumbered everything after it, so citations rotted silently, and one section had grown to hold three messages under a single number.

**Options.** (A) Keep numbers and renumber citations by hand on every insertion. (B) Give every section a stable id in an HTML comment on the line before its heading, drop the numbers from headings, cite by an anchor token everywhere, and have the knowledge tool resolve and validate every token in the tree.

**Decision.** B. An id table maps the old numbers to ids for readers of the frozen history, whose section numbers refer to the numbering of their day.

**Consequences.** No wire change and no version bump. A citation to a missing anchor fails the check the same way a citation to a missing record does. The overgrown section is split into one heading per message. A feature spec's protocol list names anchors, so the generated contract per feature is derived rather than copied.
