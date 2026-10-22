---
id: process-fix-sweep-soft-batch-cap
type: decision
status: accepted
date: 2026-10-22
summary: A /fix sweep batches four entries by default, a soft cap the developer overrides with --batch-size or at the stop; the fresh-process sweep stands.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/fix/SKILL.md, .claude/skills/fix-batch/SKILL.md, .claude/skills/land/SKILL.md, scripts/sweep.py, Makefile, CLAUDE.md]
tests: []
refs: [kb:adr/process-session-enters-worktree-in-place, kb:adr/process-land-decides-proposed-backlog, kb:lesson/decision-made-inside-a-fix-wave, kb:fact/print-mode-spawns-subagents-and-fires-subagent-stop, kb:fact/print-mode-untrusted-workspace-loads-skills-but-not-allow-list]
supersedes: [process-fix-sweep-fresh-process-per-batch, process-small-track-for-fixes]
---
**Context.** The sweep record capped a batch at four entries with no stated reason. After the
first sweep the developer wanted to run nine bugs as one batch to see how it does, and ruled
there should be no hard cap. What a bigger batch risks: it lands all or nothing, one process
carries every fix and is likelier to compact, and one review covers the whole diff.

**Options.** (A) Keep four as a hard cap. (B) No cap. (C) Four by default, overridable.

**Decision.** C, the developer's choice. `/fix` selects entries from `## Bugs` and `## Tweaks`,
researches them in parallel, stops once, and batches them: same file → same batch, then work
type and feature, at most `--batch-size N` entries (default 4; the developer may also set it at
the stop, up to one batch for the whole sweep). It commits `plans/<sweep>/sweep.json`.
`scripts/sweep.py` runs up to `--parallel N` batches, each `claude -p "/fix-batch <sweep> <n>"`
in `../<repo>-<sweep>-<n>` with an empty context and no `CLAUDE*` or `MUSTER_SESSION` in its
environment, and squash-merges each completed branch onto local `main` serially, ticking the
entries itself. A batch never asks: a missed decision is written to `batch-result.json` as a
`question`, the batch fails, the developer answers in the research file, `resume` re-runs it.
`/land --sweep` is the one push and the proposals pass.

**Consequences.** Unchanged from the superseded record: a `-p` process spawns subagents
(kb:fact/print-mode-spawns-subagents-and-fires-subagent-stop), its permissions come from
`--allowedTools` (kb:fact/print-mode-untrusted-workspace-loads-skills-but-not-allow-list), and
parallel batches queue on the gate lock. A batch over four is the developer's trade: a slower,
riskier land for fewer full sweeps.
