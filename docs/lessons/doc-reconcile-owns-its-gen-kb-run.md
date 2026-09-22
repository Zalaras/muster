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
**What happened.** `doc-reconcile`'s definition requires it to finish with `make gen-kb && make check-kb` and paste the result, so that the files its spec edits regenerate ride its own commits. Two consecutive runs' orchestrators told it not to, each reasoning that the generated files should ride the orchestrator's commit instead. In the first, the agent ran `gen-kb` as its definition says, noticed the conflicting instruction, and reverted every generated file with `git checkout --` before continuing. In the second it ran it and disclosed it, and nothing needed undoing.

**Cost.** A revert-and-re-do in one run, a correction round-trip in the next. Both avoidable: `orchestrate/SKILL.md` § Step 7 divides ownership of *files* between the agent and the orchestrator but never says who runs the generator, so the orchestrator improvises an instruction that contradicts the agent's system prompt.

**The lesson.** `doc-reconcile` owns the `make gen-kb && make check-kb` run that follows its own spec edits. Do not forbid it, and do not plan to regenerate on its behalf — an agent told to skip a step its definition requires will either obey the definition and undo the work, or obey the orchestrator and leave the tree stale. Where a pipeline instruction and an agent's definition disagree, the definition wins and the instruction is the defect.
