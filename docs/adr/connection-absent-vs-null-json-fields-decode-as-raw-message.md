---
id: connection-absent-vs-null-json-fields-decode-as-raw-message
type: decision
status: accepted
date: 2026-10-05
summary: A request field whose absence and null mean different things decodes as a non-pointer json.RawMessage, because a pointer cannot tell the two apart.
features: [rail, launch]
tags: []
files: [internal/server/sessions.go, internal/server/launcher.go, internal/server/launchergroup.go]
tests: []
refs: [plan:groups, plans/groups/daemon-implementation.md, kb:anchor/sessions.order, kb:anchor/sessions.create]
supersedes: []
---
**Context.** `groupId` on `PUT /api/sessions/order` and on `POST /api/sessions` has three meanings: absent (membership untouched), `null` (move to Ungrouped), an integer (join that group). The plan's hint was `*json.RawMessage`.

**Options.** (A) `*json.RawMessage` — nil for both `{}` and `{"groupId":null}`, so absent and null collapse into one case. (B) `json.RawMessage` by value — empty for an absent key, the literal `null` for a null one, the digits otherwise, which is the distinction the contract needs. `setTitleRequest` already uses B for the same reason.

**Decision.** B. Measured: `{}` → `""`, `{"groupId":null}` → `"null"`, `{"groupId":3}` → `"3"`; the pointer form reads nil for the first two.

**Consequences.** Any future field whose absence and null differ decodes the same way; a pointer is for fields where null and absent mean the same thing.
