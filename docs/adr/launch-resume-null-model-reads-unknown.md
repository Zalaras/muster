---
id: launch-resume-null-model-reads-unknown
type: decision
status: accepted
date: 2026-09-28
summary: A session resumed from the list with no recorded model shows "unknown" as its model rather than omitting the model clause.
features: [launch, focus]
tags: [user-decision]
files: [web/src/sessions/card.ts]
tests: []
refs: [plan:resume-and-dangerously-allow, plans/resume-and-dangerously-allow/decisions/resumed-null-model-reads-unknown/decision.md]
supersedes: []
---
**Context.** A transcript may record no model. The plan's States row says the session reads `unknown`; the first implementation omitted the model clause.

**Options.** (A) Render `model unknown`. (B) Omit the clause, as for any null model.

**Decision.** A, the developer's call.

**Consequences.** The mainhead meta carries a model word for every resumed session.
