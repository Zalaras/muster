---
id: nongoal-containers-as-isolation
type: decision
status: rejected
date: 2026-08-16
summary: Containers are never Muster's isolation model; not everything runs cleanly in them and they are resource hungry.
features: [launch]
tags: [never, user-decision]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/launch-hybrid-mru-directory-memory]
supersedes: []
---
**Context.** Several session managers run each agent in a container so that its edits and commands are sandboxed from the host. Muster launches sessions into real checkouts on Damian's machine.

**Options.** (A) Offer a containerised launch mode, or make containers the default isolation. (B) Isolation by directory and git worktree only, with Claude Code's own permission modes as the guard.

**Decision.** B, marked never. Damian's tooling does not all run cleanly in containers, and the resource cost on a laptop running several sessions is unacceptable.

**Consequences.** No container runtime dependency, no image management and no volume mapping in the launch flow. Worktrees are the only isolation the roadmap contemplates.
