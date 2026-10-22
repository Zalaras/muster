# Plan: fix-sweep

**Status**: Approved
**Work Type**: tooling (no release; a plan and a commit, not an `/orchestrate` run)
**Features**: none (pipeline docs and scripts)

## Problem

`/fix` ran one backlog group per invocation with two developer stops before any change and two
or three more in `/land`; six recent runs took 38–122 minutes each regardless of entry count,
with review at 15–30 minutes and the full E2E sweep at 9 minutes per run. The developer wants to
point it at any number of Bugs and Tweaks ("fix all the bugs"), answer every question once, and
have it finish unattended. Running batches in one session fills its context; compaction cannot be
forced from inside a session; a subagent cannot spawn the pipeline's agents.

## Decisions (settled with the developer 2026-10-22)

- `TODO.md` is restructured first: Features, Enhancements, Bugs, Tweaks, Tooling and docs
  (landed 5eef501f); triage files by kind (kb:adr/triage-section-by-kind).
- A session enters its sibling worktree in place with `EnterWorktree`; no second session
  (kb:adr/process-session-enters-worktree-in-place, landed 7518b4ef).
- `/fix` is adjusted, not wrapped: it becomes the interview. Each batch runs as a fresh
  `claude -p` process in its own worktree, driven by `scripts/sweep.py`, which also lands each
  completed batch on local `main` and ticks its entries. Batches run `--parallel N` at a time.
  State lives in `plans/<sweep>/sweep.json` (static, committed) and `sweep-state.json`
  (runtime, committed by `/land --sweep`). (kb:adr/process-fix-sweep-fresh-process-per-batch)
- No parking: anything a batch would have to ask is asked at the one stop; a batch that still has
  to ask fails with the question written out, and its retro names what the interview missed.
- The batch picks its reviewers from the diff: browser review only when `web/src` changed,
  maintainability for a refactor or a wide diff.

## Changes

1. `scripts/sweep.py` — `start | resume | status | tick`; `make sweep | sweep-status |
   sweep-resume`.
2. `.claude/skills/fix/SKILL.md` rewritten as the interview; new
   `.claude/skills/fix-batch/SKILL.md` carrying the old steps 2–8, unattended.
3. `.claude/skills/land/SKILL.md` § Sweep mode: commit the state file, verify every batch landed,
   proposals from every batch, one push.
4. ADR superseding `process-small-track-for-fixes`; `CLAUDE.md` workflow step 4.

## Verification

- `python3 scripts/sweep.py tick` dry-run on two real entries moved both blocks under the right
  `## ` headings in the history file with the ✅ stamp after the issue link (restored after).
- `python3 -m py_compile scripts/sweep.py`; `make check-kb` green.
- A Haiku `claude -p` probe from a scratch repo (2026-10-22, 2.1.308, two runs, $0.08):
  nested launch with the env scrub works; a subagent spawns and the project `SubagentStop`
  hook fires with `agent_type` and `cwd`; `--allowedTools Bash` runs an unlisted command while
  the untrusted workspace ignores the project allow list; a project skill and `CLAUDE.md` load.
  Recorded as `kb:fact/print-mode-spawns-subagents-and-fires-subagent-stop` and
  `kb:fact/print-mode-untrusted-workspace-loads-skills-but-not-allow-list`.

## Out of scope

- `/work-status` reading `sweep-state.json`.
- A Muster-driven sweep (sessions launched through the dashboard) — the post-v1 "Let an agent
  drive Muster" entry.
