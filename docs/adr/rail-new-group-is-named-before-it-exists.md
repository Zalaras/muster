---
id: rail-new-group-is-named-before-it-exists
type: decision
status: accepted
date: 2026-10-05
summary: The rail's inline new-group editor is a client-pending section; nothing is sent until Enter with a non-empty name, so the daemon never holds an unnamed group.
features: [rail, groups]
tags: [ux]
files: [web/src/features/rail.ts, web/src/render/sessions.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** The spec wants a new group to appear as a section with its name in an edit field, kept on Enter and discarded on Escape or an empty name. Names are 1–40 characters after trimming.

**Options.** (A) Create the group with a placeholder name, then rename it; Escape deletes it. (B) Render a pending section client-side with the input focused; Enter POSTs the trimmed name and the real section replaces the pending one on the `groups` message; Escape, blur or an empty name removes the pending section with no request.

**Decision.** B. Option A would broadcast a placeholder to a second window and leave a group behind if the editor was abandoned by a reload. From a selection or the launch dialog the name is typed first for the same reason.

**Consequences.** The Ungrouped header and the filter appear only once the group exists. The pending section is the one piece of rail chrome not derived from wire state.
