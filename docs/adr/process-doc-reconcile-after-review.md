---
id: process-doc-reconcile-after-review
type: decision
status: accepted
date: 2026-09-15
summary: The present-tense documents are reconciled by a dedicated agent after review approves, replacing the orchestrator's backstop ownership of them.
features: []
tags: [pipeline]
files: [.claude/agents/doc-reconcile.md, .claude/skills/orchestrate/SKILL.md, .claude/skills/orchestrate/doc-upkeep.md]
tests: []
refs: [kb:adr/process-doc-upkeep-backstop-in-orchestrator, kb:adr/knowledge-diagrams-are-mermaid-records]
supersedes: [process-doc-upkeep-backstop-in-orchestrator]
---
**Context.** `docs/features/<name>/spec.md` is present-tense truth that `kb pack` feeds every agent
as fact, yet nothing updated its content: `plan-lint.sh` only checked the file existed. The backstop
meant to catch this reads implementation logs and explicitly does not re-read source, so it sees what
changed, never what a feature now is — the view that appends history instead of editing a
description. It also ran while the testers ran, against a tree the fix waves then changed.

**Options.** (A) Keep the orchestrator as owner and add feature specs to its checklist. (B) Stage the
claims at plan time and have a dedicated agent promote them after review approves, verifying each
against the code its frontmatter names.

**Decision.** B. The staging half is the mechanism the pipeline already proves twice — the protocol
delta merged on approval, and ADRs flipped `proposed`→`accepted` at completion. The agent half
answers the backstop's own weakness: a reader who knows what shipped is necessary but not sufficient,
because the durable record states what *is*, and only the code settles that. Review keeps judging the
staged claims, so the adversarial read is not lost; what moves is the recording, out of a loop that
re-paid for it every cycle.

**Consequences.** The split is records to the orchestrator, present-tense documents to
`doc-reconcile`: it owns `docs/features/*/spec.md` and `docs/protocol.md`, never `SPEC.md`, which it
reports on instead. It is a real pipeline step, so a claim the code contradicts reopens review rather
than being quietly weakened, and a feature set wider than the plan's header blocks the run as the
planning defect it is. Implementation agents report `doc-delta:` lines; the orchestrator amends the
staged delta before the agent runs. The 800-word spec budget makes the deletions half of a delta
mandatory rather than optional.
