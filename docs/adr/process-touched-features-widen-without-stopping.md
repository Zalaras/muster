---
id: process-touched-features-widen-without-stopping
type: decision
status: accepted
date: 2026-10-06
summary: A Touches header names features a plan edits without changing; they pack as spec and contract only, the scope gate widens it itself, promotion is on evidence.
features: [knowledge]
tags: [pipeline]
files: [internal/kb/scope.go, .claude/skills/orchestrate/scripts/plan-lint.sh, .claude/skills/orchestrate/scripts/orch-state.py, .claude/skills/orchestrate/SKILL.md, .claude/agents/doc-reconcile.md, internal/kb/pack.go, tools/kb/main.go]
tests: [TestPack_TouchedFeaturesPackSpecAndContractOnlyExceptForReview, TestPlanTouches_ReadsTheOptionalHeader, TestRun_PackReadsTouchesFromThePlanAndTheFlag]
refs: [kb:adr/process-features-scope-answered-by-widening-header, kb:adr/process-features-header-widens-for-forced-fixture-repairs, kb:adr/process-features-widened-for-a-refactor-call-site, kb:adr/knowledge-pack-sections-scoped-by-role]
supersedes: [process-features-scope-answered-by-widening-header]
---
**Context.** The `**Features**` header was both the scope guard and the pack selector, so a
one-line call-site repair in another feature's file forced that feature in, and with it about
11,000 words of records into every agent's pack. Widening was the developer's call and stopped
the run: groups stopped twice (nine minutes and a forgotten ADR, then a second doc-reconcile
pass) and ended at fourteen features and 60k-word packs. The superseded decision left an
any-owner gate open as a proposal.

**Options.** (A) An any-owner gate, loosening the guard. (B) A second header, `**Touches**`,
for features the plan edits without changing, packed light and widened automatically. (C) Keep
stopping.

**Decision.** B. A touched feature packs as spec body and contract slice for every role except
`review`, which reads it in full as the safety net for a settled decision a light edit breaks.
The scope gate accepts a changed file when any owner is in either header, and `gates.sh` runs
`features-scope.sh --touch`, which appends a missing owner to `**Touches**` and passes; the
orchestrator commits that edit and never asks. Promotion to `**Features**` is the orchestrator's,
on evidence only: a `doc-delta:` line, a review issue naming the feature's behaviour, or a
doc-reconcile claim against its spec. `plan-lint` warns past five Features. The guard is not
loosened: every owner is still named somewhere, and doc-reconcile still blocks on a feature in
neither header.

**Consequences.** A plan names what it changes under Features and what it brushes under Touches,
and the pipeline never stops for file scope again. The fixture-repair and call-site ADRs are now
satisfied by a touch, not a widening. Review packs grow by the touched features' records; every
other pack shrinks by them.
