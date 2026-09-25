---
id: process-features-widened-for-a-refactor-call-site
type: decision
status: accepted
date: 2026-09-25
summary: A plan whose sibling-matching refactor forces a one-line call-site repair in another feature's file widens its Features header rather than revert the refactor.
features: [update, connection, surfaces]
tags: [consensus]
files: [internal/server/ws.go, internal/server/server.go, internal/server/shellactivity_test.go]
tests: []
refs: [plan:settings-update-failures, plans/settings-update-failures/decisions/features-scope-shellactivity-test/decision.md, kb:adr/process-composition-roots-registration-only]
supersedes: []
---
**Context.** Review asked that the WebSocket hub take its logger through its constructor like its 20 siblings, not by a patch in the composition root. The constructor's one other caller is a test in a `surfaces`-owned file. Repairing that call put `surfaces` in the branch diff, and the features-scope gate stopped the run: the plan's **Features** header named only update and connection.

**Options.** (A) Widen **Features** to include `surfaces`. (B) Revert the constructor change so the file stays untouched, either with the post-construction patch back or with a test-only zero-argument constructor.

**Decision.** A, reached by debate consensus at the developer's request. Both forms of B bring back the defect review measured: a composition-root field patch, and a hub whose zero-value logger silently drops the drain warning. A scope reason answers neither harm, and doc-reconcile would block on the unnamed file anyway.

**Consequences.** Later agents in the run read the surfaces records they don't strictly need (about +6k words per pack). The Doc Delta gains no surfaces claim, and surfaces has no proposed ADRs for Completion to accept.
