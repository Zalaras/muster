---
id: rail-groups-daemon-rows-whole-list-broadcast
type: decision
status: accepted
date: 2026-10-05
summary: Rail groups are daemon rows broadcast whole as one groups message on every change; membership is a per-session groupId riding the session upsert.
features: [rail, lifecycle, connection, groups]
tags: [store, ux]
files: [internal/server/state.go, internal/server/sessionwire.go, internal/session/manager.go, web/src/protocol/messages.ts, web/src/protocol/session.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** Groups must survive reload and restart and show in a second window within the same beat as a session upsert. The rail already has one daemon-owned ordering vocabulary (pinned, railPos) and one whole-object pattern for small shared state (prefs).

**Options.** (A) Client-only groups in local storage. (B) Per-group `groupUpsert` / `groupRemoved` messages, with membership on each group. (C) A `rail_group` table; one `groups` message carrying the whole list plus the Ungrouped section's layout on every change, the prefs pattern; membership as a `groupId` field on the session, carried by the ordinary `sessionUpsert`.

**Decision.** C. Membership belongs to the session because it is the same kind of thing as `pinned` and `railPos` (kb:adr/rail-order-daemon-owned-per-session-fields). The list is never more than a dozen long, so whole-list is the loss-tolerant shape; within one request the daemon sends `groups` before the upserts that join a new group and after the ones that leave a deleted group.

**Consequences.** Two windows stay in sync for free. A client still tolerates a `groupId` naming no known group by rendering the card in Ungrouped until the next message. Per-group messages would have made the ordering between a group's removal and its members' moves the client's problem.
