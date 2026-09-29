---
id: launch-resume-one-alive-row-per-claude-session
type: decision
status: accepted
date: 2026-09-28
summary: A resume from the list always creates a new Muster session; no path may leave two alive sessions bound to one Claude session id.
features: [launch, actions]
tags: [state-machine, user-decision]
files: [internal/server/launcher.go, internal/session/manager.go]
tests: []
refs: [plan:resume-and-dangerously-allow, kb:adr/lifecycle-resume-rebinds-existing-session]
supersedes: []
---
**Context.** A listed session may already belong to a dead Muster row, or be open in an alive
one. The developer asked for no special cases by origin.

**Options.** (A) Reuse a dead Muster row bound to the same id. (B) Always create a new row, and
refuse whatever would put two alive rows on one conversation.

**Decision.** B. A resume from the list of an id bound to an alive session is refused
`already_open`; the Resume action on a dead row is refused `not_resumable` while another alive
row holds its id.

**Consequences.** A dead row and a new one can share a Claude id; only one may be alive.
