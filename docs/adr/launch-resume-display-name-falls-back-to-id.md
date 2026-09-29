---
id: launch-resume-display-name-falls-back-to-id
type: decision
status: accepted
date: 2026-09-28
summary: A session resumed from the list carries its transcript's model id as model.displayName until the status line confirms the name, as every launch does.
features: [launch]
tags: [user-decision]
files: [internal/session/manager.go]
tests: []
refs: [plan:resume-and-dangerously-allow, plans/resume-and-dangerously-allow/decisions/display-name-falls-back-to-id/decision.md]
supersedes: []
---
**Context.** A transcript records the model id, never its display name, which comes from the status
line once Claude Code runs. The approved contract said `displayName` is null until then; the daemon
already falls back to the id for every launch.

**Options.** (a) Send `null` for a resumed session only. (b) Send the id, as for any launch.

**Decision.** (b), the developer's call: one behaviour for every launch, and the card shows the id
for the few seconds before the status line names the model.

**Consequences.** `model.displayName` stays a non-null string on the wire. The web's tolerance of
`null` is unused by this path.
