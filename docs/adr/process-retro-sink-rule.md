---
id: process-retro-sink-rule
type: decision
status: accepted
date: 2026-11-07
summary: A retro finding becomes exactly one of a check, a guarded fact, or an episode lesson no build pack loads; prose only after a control/treatment probe.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/retro/SKILL.md, docs/lessons/worktree-shares-git-config.md, docs/lessons/main-session-gate-list-dropped-check-kb.md]
tests: []
refs: [kb:adr/process-boundaries-enforced-by-hooks, kb:adr/process-doc-upkeep-backstop-in-orchestrator, plans/_audit/agentic-practice-review-2026-11-05.md]
---
**Context.** The retro's net-zero-lines rule did not stop growth: pipeline prose doubled to
65,000 words in two months, lessons reached 75, and each run met a new rule. The field review's
evidence is that the count of live constraints, not their layout, degrades compliance
(breakdown past five or six simultaneous constraints; sharp loss after compaction), that
consolidated lesson banks end below no memory at all, and that practitioners who keep
instruction files small test a sentence before adding it and delete what a script now holds.

**Options.** (A) Keep proposing the smallest sentence. (B) Route every finding to a sink that
is not prose, and let prose in only with a measured effect.

**Decision.** B. A zero-exception rule becomes a hook, gate, lint or verdict field, and the prose
it replaces is deleted where its reader runs after the check. A measured Claude Code behaviour
becomes a fact with a guard test. A judgement with no check becomes an episode: a lesson with
`roles: [retro]`, found by `kb find` and read only by the retro's own pack (the record model
requires one role), carried by no build or review pack. A sentence is added only when
two fresh Haiku runs of the same trivial task, with and without it, differ and the outputs are
pasted in the retro. A lesson a check now covers moves to `roles: [retro]` in the same retro.

**Consequences.** Packs shrink as checks accumulate instead of growing with them; retros produce
code and records more often than sentences; the lessons directory keeps its history. Two lessons
moved to episodes with this decision (the git identity guard, the check-kb gate list); the
module-side change that would also drop guarded lessons from packs automatically is for the kb
repository.
