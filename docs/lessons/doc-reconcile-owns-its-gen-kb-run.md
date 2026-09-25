---
id: doc-reconcile-owns-its-gen-kb-run
type: lesson
status: active
date: 2026-09-22
summary: Two consecutive runs told doc-reconcile not to run gen-kb, contradicting its own definition; one agent reverted every generated file with git checkout to obey.
features: []
tags: [pipeline]
roles: [orchestrator]
files: [.claude/agents/doc-reconcile.md, .claude/skills/orchestrate/SKILL.md]
tests: []
refs: [plan:rail-card-improvements-2, plan:rail-card-improvements, .claude/agents/doc-reconcile.md]
---

**What happened.** `doc-reconcile`'s definition requires it to finish with `make gen-kb && make check-kb`, so the files its spec edits regenerate ride its own commits. Two consecutive runs' orchestrators told it not to, reasoning the generated files should ride the orchestrator's commit. In the first, the agent ran it, saw the conflicting instruction, and reverted every generated file with `git checkout --`; in the second it ran it and disclosed it.

**Cost.** A revert-and-re-do in one run, a correction round-trip in the next — because § Step 7 divides ownership of files but never said who runs the generator.

**The lesson.** `doc-reconcile` owns the `gen-kb` run after its own edits. Where a pipeline instruction and an agent's definition disagree, the definition wins and the instruction is the defect: an agent told to skip a required step either undoes the work or leaves the tree stale.
