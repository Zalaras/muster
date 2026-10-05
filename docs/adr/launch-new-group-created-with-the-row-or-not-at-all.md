---
id: launch-new-group-created-with-the-row-or-not-at-all
type: decision
status: accepted
date: 2026-10-05
summary: A launch naming a new group inserts the group row right before the session row and the rollback deletes it, so a failed launch creates neither.
features: [launch, rail]
tags: [store]
files: [internal/server/launcher.go, internal/server/launchergroup.go, internal/session/grouplaunch.go, web/src/features/launch.ts, web/src/api/launch.ts]
tests: []
refs: [plan:groups, kb:spec/rail, plans/groups/daemon-implementation.md]
supersedes: []
---
**Context.** The launch dialog's Group row offers "New group…" with a name field, and the spec says group and session are one request — both or neither.

**Options.** (A) The dashboard creates the group first, then launches; a refused launch leaves an empty group behind. (B) `POST /api/sessions` carries `newGroup`; the daemon validates it after the model pre-check and before any side effect, inserts the group row at the same point it inserts the session row, and the existing rollback deletes the group when the spawn or record step fails.

**Decision.** B. The launcher already has a rollback for the row; the group joins it. A `groupId` for an existing group is checked at the same point (404 `unknown_group`); `groupId` and `newGroup` together are a 400.

**Consequences.** No `groups` broadcast ever names a group whose launch failed: the group is held out of every snapshot and broadcast until the launch is recorded, so another window's group change in between cannot leak it. The one exception is a store-write failure in the record step itself, after the group was announced — then the daemon deletes the group and announces it gone, because clients were already told of it. A daemon crash between the group insert and the end of the launch leaves an empty group row visible after restart; nothing sweeps it and the developer deletes it (plans/groups/daemon-implementation.md, Decisions). The `201` Session object carries `groupId`, and its railPos puts it at the end of its section. The Resume tab's request form carries the same two keys.
