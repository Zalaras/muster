---
id: process-features-scope-answered-by-widening-header
type: decision
status: accepted
date: 2026-09-23
summary: When features-scope fails because a plan edits files other features own, the plan's Features header widens to every owner; the gate is not loosened mid-run.
features: []
tags: [pipeline, consensus]
files: [.claude/skills/orchestrate/scripts/features-scope.sh, .claude/agents/doc-reconcile.md]
tests: []
refs: [plan:new-session-improvement, plans/new-session-improvement/decisions/features-scope/decision.md, kb:adr/connection-installed-claude-classified-never-refused, kb:adr/process-size-linters-warn-never-fail]
supersedes: []
---
**Context.** `features-scope.sh` fails when a changed source file has an owning feature (by spec
glob) that the plan's `**Features**` header leaves out. `kb pack` keys on the header, so a missing
feature leaves agents without that feature's records. On its first multi-owner run, the
new-session-improvement plan tripped it on twelve lines. `sessions.go` is co-owned by actions,
rail and rename. Five files are owned by connection alone. `pane.ts` is owned by surfaces.

**Options.** (A) Widen the header to every owning feature. (B) Loosen the gate so a file passes
when any of its owners is in the header, and add only the features that own a file outright.

**Decision.** A, by consensus in a decide debate. B as framed did not pass the gate: the five
connection-only files still failed. A working B would have needed connection anyway, and
connection holds the accepted ADR this plan's model refusal must be read against. B would also
have required a second doctrine edit (doc-reconcile Step 1 enforces the same rule). All B saved
was pack words, and pack size only warns.

**Consequences.** This plan's header names eight features. Every later pack (reviewers,
doc-reconcile) grows by about 11 000 words, which is acceptable because the budget warns and never
fails. Whether the gate should adopt an any-owner rule for future plans is left open as a proposal,
not decided here.
