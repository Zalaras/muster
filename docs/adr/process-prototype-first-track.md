---
id: process-prototype-first-track
type: decision
status: accepted
date: 2026-11-16
summary: Work that cannot be specified unseen starts as a throwaway prototype the developer works; the spec is drafted from it and the pipeline builds from the spec.
features: []
tags: [pipeline, user-decision]
files: [.claude/skills/proto/SKILL.md, .claude/skills/spec/SKILL.md, .claude/skills/plan-work/SKILL.md, scripts/worktree.sh, .claude/hooks/pretool-guard.py, .claude/hooks/pretool_guard_test.py, .claude/skills/orchestrate/scripts/orch-state.py, .claude/skills/orchestrate/scripts/orch_state_test.py, Makefile]
tests: []
refs: [kb:adr/process-boundaries-enforced-by-hooks, kb:adr/process-retro-sink-rule, kb:adr/process-pipeline-runs-in-sibling-worktree, kb:adr/process-cost-knobs-cache-effort-usage-column, plans/_audit/agentic-practice-improvements.md]
supersedes: []
---
**Context.** `/spec` interviews the developer about behaviour nobody has seen yet, so a surface's
requirements are written from imagination and corrected later, in review cycles or after landing,
where a change costs most. Static mockups show layout but cannot be used.

**Options.** (A) Keep the interview. (B) Prototype on the plan branch and harden it in place.
(C) A throwaway prototype on its own branch, worked until accepted, then discarded; the spec is
drafted from it and the pipeline builds from the spec and plan alone.

**Decision.** C, for work whose requirements cannot be written without seeing it (a new surface or
a protocol change); everything else keeps the interview. `/proto` runs in the main session with no
subagents, in a sibling tree on a `proto/` branch; `make proto-run` gives its daemon its own data
dir, tmux socket and port. Only the hard rules that protect the developer bind there; tests,
conventions and doc upkeep do not. Each feedback round is appended to a prototype log in the plan
folder; at done, screenshots go beside it and `/spec` drafts from both, asking only its approval
question. `/plan-work` drafts from the log, still needs approval, and drops the prototype at
Approval. The plan stays: every downstream role reads it. The prototype's code never reaches an
implementer: the guard denies merging a `proto/` branch and `orch-state.py init` refuses while one
exists for the plan. B was ruled out because a hack an implementer can read is a hack it ports.

**Consequences.** Three tracks: prototype-first, spec-first, `/fix`. A prototype-led run costs one
extra session; whether it buys fewer review cycles is measured on the first runs with the Δweekly
column, and the track is dropped if it does not. Changed minds recorded in the log become the
plan's proposed decisions.
