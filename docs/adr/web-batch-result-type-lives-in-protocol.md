---
id: web-batch-result-type-lives-in-protocol
type: decision
status: accepted
date: 2026-10-05
summary: The daemon's batch result shape (done, skipped, failed) is decoded in protocol/batch.ts, shared by api/sessions.ts and api/groups.ts.
features: [actions, rail]
tags: []
files: [web/src/protocol/batch.ts, web/src/api/sessions.ts, web/src/api/groups.ts]
tests: []
refs: [plan:groups, plans/groups/web-implementation.md, kb:adr/actions-bulk-stop-remove-are-daemon-batches]
supersedes: []
---
**Context.** The plan's hint placed the batch result parser in `api/groups.ts`. Both `api/sessions.ts` (the batch Stop and Remove) and `api/groups.ts` (delete-group's `sessions` outcome) decode the same shape, and `api/` modules import only `decode` and `http`.

**Options.** (A) Parse in `api/groups.ts` and import it from `api/sessions.ts`, an `api`-to-`api` import the layering does not have. (B) A `protocol/batch.ts` module beside the other wire parsers, imported by both.

**Decision.** B, the existing layering: wire shapes decode in `protocol/`, `api/` composes requests.

**Consequences.** A third batch endpoint reuses the parser; `protocol/batch.ts` is pure and unit-testable on its own.
