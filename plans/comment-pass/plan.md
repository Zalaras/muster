# Plan: comment-pass

**Status**: Approved
**Work Type**: tooling (no release; a plan and a commit, not an `/orchestrate` run)
**Features**: comment-pass

## Problem

Comments were governed by prose in five pipeline files and one regex script, and review owned
their truth and style. Across `plans/*/review*.md`, 94 of 576 agent-tagged findings concerned a
comment; 20 of 24 recent cycles had one; 4 cycles (mermaid-support c2–c4,
new-session-improvement c3) plus 3 in the groups run were spent on a single comment each, at the
cost of three Opus reviewers, a fix wave, a gate run and a delta re-review. Instructions cannot
move the model's prior; the diff can be enforced.

## Decision

A mechanical pass the orchestrator runs once per review cycle before the gates
(kb:adr/process-comment-pass-owns-code-comments):

1. `go run ./tools/commentpass strip <plan> --out <dir>` — snapshot and remove every comment
   the branch added to production code, plus pre-existing comments naming a removed
   identifier; write `candidates.md` / `candidates.json`.
2. A fresh Sonnet `comment-judge` (Read + Write, plan withheld) reads `candidates.md` and writes
   `verdicts.json`.
3. `go run ./tools/commentpass apply` — reconstruct from the snapshot minus drops, append the
   cycle to `plans/<plan>/comment-pass.json`, commit by pathspec.
4. `go run ./tools/commentpass verify` in the baseline gates — every added comment block is a
   ledger keep.
5. A reviewer's `[note]` naming a false or stale comment → `go run ./tools/commentpass drop`.

No stamp in code; the ledger does the bookkeeping. Directives are never candidates. Review files
no finding on a comment at any severity. Out of scope: test files (the `comment-checks.py` hook
stays), legacy comments on `main`.

## Changes

- `tools/commentpass`, `internal/commentpass` (+ tests), `internal/kb/pack.go` (no role packs
  § Comments), `internal/kb/roles_test.go`.
- `.claude/agents/comment-judge.md`; impl, test and review agents lose their comment prose.
- `.claude/skills/orchestrate/SKILL.md` Step 6 item 1 and Review Retry Logic; `review-scale.md`;
  `worker-rules.md`; `gates.sh` (`comment-ledger` baseline line); `orch-state.py`
  (`comment-only` removed); `retro/SKILL.md`.
- `docs/adr/process-comment-pass-owns-code-comments.md`, `docs/features/comment-pass/spec.md`,
  `docs/diagrams/pipeline-execution-order.md`, `docs/conventions.md` § Comments,
  `docs/lessons/comment-truth-is-plan-wide-not-diff-wide.md` (retired), `tools/CLAUDE.md`.

## Verification

- `go test ./internal/commentpass/ ./tools/commentpass/ ./internal/kb/` — scratch-repo
  fixture, no real Claude.
- `make lint test check-kb refs`; `make gen-kb` leaves no diff.
- Rehearsal: replay a landed commit on a scratch branch, run strip, spawn the judge by hand
  (Haiku and Sonnet on the same candidates), apply, verify; `rehearsal.md` records the rates.
