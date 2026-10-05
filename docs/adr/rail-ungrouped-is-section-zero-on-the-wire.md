---
id: rail-ungrouped-is-section-zero-on-the-wire
type: decision
status: accepted
date: 2026-10-05
summary: Group endpoints address the Ungrouped section as id 0; a session with no group has groupId null; Ungrouped's place and collapsed flag persist in kv.
features: [rail, lifecycle, groups]
tags: [store]
files: [internal/store/store.go, internal/server/sessions.go, web/src/api/sessions.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** The Ungrouped section has a header like any group — it collapses and its position among the sections is draggable — but it is not a group: it cannot be renamed or deleted and no row represents it.

**Options.** (A) A reserved `rail_group` row that every query must special-case and that must never be deleted or renamed. (B) Separate endpoints for Ungrouped (`PUT /api/ungrouped`). (C) Address Ungrouped as id `0` in `PUT /api/groups/{id}` (collapsed only) and in `PUT /api/groups/order`; keep `groupId: null` on the session, since null is this protocol's word for absence; persist Ungrouped's `pos` and `collapsed` in `kv` under `rail_ungrouped`.

**Decision.** C. Real group ids start at 1 (rowids), so `0` is free and reads as "the section that is not a group". Two spellings exist on purpose: a session's group is a value or absent; a section in a layout operation always has an identity.

**Consequences.** `PUT /api/groups/0 {name}` is a 400, `DELETE /api/groups/0` is a 400. An absent `rail_ungrouped` key reads as last place, expanded, so a store that predates groups needs no backfill.
