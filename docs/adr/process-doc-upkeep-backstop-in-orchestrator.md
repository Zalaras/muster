---
id: process-doc-upkeep-backstop-in-orchestrator
type: decision
status: accepted
date: 2026-08-16
summary: Documentation upkeep after a plan is verified and amended by the orchestrator as a backstop step, replacing the inherited pipeline's mechanical changelog check.
features: []
tags: [pipeline]
files: [.claude/skills/orchestrate/SKILL.md, CLAUDE.md, .claude/skills/plan-work/SKILL.md]
tests: []
refs: [docs/history/todo-done.md, kb:adr/process-land-skill-is-the-landing-ritual, kb:adr/process-real-verification-post-run-by-pipeline]
supersedes: []
---
**Context.** The pipeline was adapted from another project whose gate failed a run when the changelog had no new entry. Muster's upkeep is not one file: a finished backlog item moves to history, a settled or changed decision gets a changelog entry and a spec edit, a measured wire-format fact gets a record, and the protocol document must match what shipped.

**Options.** (A) Keep a mechanical check that some changelog file changed. (B) A backstop step in the orchestrator that reads the implementation logs, checks each upkeep rule, fixes what is missing in a commit of its own, and says so in the completion summary, with the root guide binding every session to the same rules.

**Decision.** B. A file-changed check is satisfied by a meaningless line; the rules need a reader who knows what shipped.

**Consequences.** The spec and backlog files are never listed under an implementation track; upkeep addressed to the orchestrator lives in the plan's implementation notes. The backstop runs while the testers run and is re-verified at completion, and never writes a verdict before the review exists. Routine implementation of already-settled decisions needs no entry.
