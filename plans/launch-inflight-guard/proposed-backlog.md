# Proposed backlog: launch-inflight-guard

Proposals only — nothing here is filed. `/land` puts each to the developer.

### Dropping an edited comment in the comment pass deletes its pre-existing text
- **Summary**: `commentpass apply` removes an `edited` candidate's whole block on drop, so the lines that predate the plan go with the new ones; it should revert to the candidate's `previously` text instead.
- **Source**: comment-judge cycle 1 ("dropping the candidate would drop the whole comment"); the /fix session overrode that one verdict to keep so `renderModelRowState`'s 21-line focus rule survived.
- **Change requested**: no — a tool gap the judge noticed and could not act on; the override is recorded as the keep's reason in `plans/launch-inflight-guard/comment-pass.json`.
- **Suggested section**: Pre-v1 › tooling (the comment-pass feature).
- **Pre-existing**: yes; this branch does not touch `internal/commentpass`.

### A dialog reopened while an earlier launch is in flight gives no reason for its disabled Launch
- **Summary**: cancel mid-flight and reopen: Launch shows disabled with no explanation, and the earlier answer then closes the reopened dialog, dropping what was typed.
- **Source**: review cycle 1 browser Note (the one note the reviewer suggested for this file); review-work Note 3 observes the same consequence of plan edge case 4.
- **Change requested**: no — a `[note]`; the disabled face is this plan's guard working as specified, the closing part predates it.
- **Suggested section**: Pre-v1 › the launch dialog.
- **Pre-existing**: partly; the close-on-answer predates this branch, the silent disabled face is new.

### `orch-state.py retry review` sets `review_cycle` one too high on its first use
- **Summary**: the first `retry review` of a run increments `retry_counts.review` before `review_cycle()` falls back to it, so a run with no `review_cycle` yet lands on 3 instead of 2; the /fix session set it back to 2 by hand.
- **Source**: observed in this run after `archive` printed `"review_cycle": 3` with one merged cycle on record.
- **Change requested**: no — pipeline tooling, outside the plan; a one-line fix (read `review_cycle(s)` before incrementing the retry count, or seed `review_cycle` at `init`).
- **Suggested section**: pipeline tooling (a plan-and-commit change, no release).
- **Pre-existing**: yes; `.claude/skills/orchestrate/scripts/orch-state.py`.

## Decisions (the developer, 2026-10-06)

- Dropping an edited comment in the comment pass deletes its pre-existing text — not doing as a tool change: the behaviour is intended, the pass re-verifies an existing comment whole. The judge's brief now says so (`bf03cbfc` on `main`: `.claude/agents/comment-judge.md` and the candidates.md preamble). Not filed.
- `orch-state.py retry review` sets `review_cycle` one too high on its first use — already done: fixed on `main` as `d9811330` (the cycle is read before the retry count moves). Not filed.
- A dialog reopened while an earlier launch is in flight gives no reason for its disabled Launch — not doing.
