---
id: process-fix-sweep-fresh-process-per-batch
type: decision
status: accepted
date: 2026-10-22
summary: /fix takes any number of Bugs and Tweaks, asks everything once, then a loop runs them as fresh claude -p batches landed on local main; /land --sweep pushes.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/fix/SKILL.md, .claude/skills/fix-batch/SKILL.md, .claude/skills/land/SKILL.md, scripts/sweep.py, Makefile, CLAUDE.md]
tests: []
refs: [kb:adr/process-session-enters-worktree-in-place, kb:adr/process-land-skill-is-the-landing-ritual, kb:adr/process-land-decides-proposed-backlog, kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion, kb:adr/process-playwright-runs-exclusive-on-machine, kb:lesson/decision-made-inside-a-fix-wave, kb:lesson/subagent-never-woken-by-harness]
supersedes: [process-small-track-for-fixes]
---
**Context.** The small track ran one backlog group per `/fix`: two stops before any change,
two more in `/land`, 38–122 minutes a run whatever the entry count. The developer wants to say
"fix all the bugs", answer every question up front, and not babysit. Batches in one session
fill its context, compaction cannot be triggered from inside, and a subagent cannot spawn the
impl and test agents.

**Options.** (A) A sweep skill on top of `/fix`. (B) One session running batches in sequence.
(C) `/fix` is the interview; each batch is a fresh `claude -p` process in its own worktree,
driven by a loop script that also lands.

**Decision.** C, the developer's choice. `/fix` selects entries from `## Bugs` and `## Tweaks`,
researches them in parallel, stops once, batches them (same file → same batch; then work type
and feature; at most four) and commits `plans/<sweep>/sweep.json`. `scripts/sweep.py` runs up to
`--parallel N` batches, each `claude -p "/fix-batch <sweep> <n>"` in `../<repo>-<sweep>-<n>`
with an empty context and no `CLAUDE*` or `MUSTER_SESSION` in its environment, and
squash-merges each completed branch onto local `main` serially, ticking the entries itself. A batch never asks: a missed decision is written to `batch-result.json`
as a `question`, the batch fails, the developer answers in the research file, `resume` re-runs it; the batch's own `/retro` records the miss. `/land --sweep` is the one push and the
proposals pass. Red test first, the comment pass, scoped gates and one full sweep per batch
are unchanged; reviewers are chosen from the diff.

**Consequences.** To measure on the first run: a `-p` process spawns subagents and fires
`SubagentStop` as an interactive one does, and `--allowedTools` with the project allowlist
covers the pipeline's commands. Parallel batches queue on the gate lock (`GATES_LOCK_WAIT`
raised). Landing refuses on a dirty primary.
