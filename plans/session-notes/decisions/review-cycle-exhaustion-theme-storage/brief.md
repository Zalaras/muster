# Decision brief: review-cycle-exhaustion-theme-storage

**Question**: Review cycle 3 of 3 ended `needs-changes` on one browser Major outside the plan's diff — grant a fourth cycle and fix it in this run, or stop the run blocked?
**Source**: plans/session-notes/review.md (cycle 3), browser part Major 1; `/orchestrate` § Review Cycle Exhaustion
**Option A**: Grant one extra review cycle (cycle 4) and fix it in this run — web-impl wave 1, an e2e/render regression test, gates, delta re-review — so the branch lands with REQ-10 holding under blocked storage.
**Option B**: Stop the run blocked at review per Review Cycle Exhaustion, leaving the branch un-approved, and record the bug for a separate /fix after the developer returns.

## Context
- The developer started this run from mobile and is away overnight. Their instruction, verbatim:
  "Use the decider for any decisions or issues as I'm going off for the night and would like the run completed".
  A standing memory (feedback-unattended-run-defer-to-decider) says: unattended → no questions, every decision goes to the decide skill, never push or /land.
- Cycle 3: code part approved, maintainability part approved, browser part needs-changes (this Major only). Gates: 32 lines, 0 failed, full E2E 635/635.
- Retry budget for review is 3 (`.claude/skills/orchestrate/SKILL.md` § Verdicts and budgets, § Review Cycle Exhaustion). Exhaustion normally asks the developer: (a) more cycles, (b) fix manually, (c) abort.
- The defect predates this plan (`web/src/theme.ts` `writeThemeHint(hint, storage = localStorage)`), but it breaks this plan's REQ-10 in the blocked-storage state; the plan's Implementation Notes say "Wrap every read and write" of browser storage.
- Nothing lands without the developer: `/land` is theirs either way.

## Pinned reading list (both advocates read all of it before turn 1)
- plans/session-notes/review.md — browser part Major 1 and note 3 (quoted below); the header
- plans/session-notes/review.cycle2.md, review.cycle1.md — headers only (how the cycles went)
- plans/session-notes/plan.md — REQ-9, REQ-10, REQ-11, Implementation Notes (Browser storage hint), Out of scope
- .claude/skills/orchestrate/SKILL.md — § Verdicts and budgets, § Review Cycle Exhaustion, § Fix Wave Ordering § Rules (plan amendments; new behaviour gets coverage)
- .claude/skills/fix/SKILL.md — what the small track would cost instead
- /Users/damian/.claude/projects/-Users-damian-Documents-code-Projects-muster/memory/feedback-unattended-run-defer-to-decider.md
- web/src/theme.ts (writeThemeHint), web/src/storage.ts (safeLocalStorage), web/src/app.ts (the event bus emit)
- docs/adr/notes-unsaved-text-kept-in-browser-until-acknowledged.md

## The issue, verbatim
1. **[web-impl]** With browser storage blocked so that reading `window.localStorage` throws, a note typed while musterd was down is not re-sent when musterd comes back. The panel keeps saying `unsaved, musterd unreachable` after the banner has cleared, and the text reaches the daemon only on the next keystroke. The cause is older than this plan and is not the `listKeys` change: `web/src/theme.ts` `writeThemeHint(hint, storage = localStorage)` evaluates the `localStorage` global in its default parameter. The theme feature's `snapshot` listener therefore throws (stack: `Mc` ← theme `a()` ← `emit` ← `onSnapshot`), and the throw aborts the later `snapshot` listeners in the same emit, notes' re-send among them. In the same state, the focused terminal's `/ws/terminal/1` was not reopened after the reconnect either. A fix must make the snapshot reach the notes handler when storage is blocked: `writeThemeHint`'s default goes through `safeLocalStorage()`, or the bus isolates a throwing listener, or both. The plan's "wrap every read and write" (Technical Context) and REQ-10's "re-sent on reconnect" then hold in this state. The fix is one line outside this plan's diff, so the orchestrator may route it to `/fix` rather than this run.

Note 3: **[note]** **[e2e-specs]** No committed spec or render test drives blocked storage, so Major 1 could not fail any gate. The regression test for the fix needs a journey that blocks the `localStorage` getter before load, types while musterd is down, restarts it, and asserts the PUT with no further input.

## Rules
Up to 3 turns each, ≤400 words per turn, advocate-a opens. Argue from the pinned docs and
measurable consequences; cite file:line; steelman before rebutting; concede when convinced.
Append each turn to debate.md before sending it. The ending turn's author reports once to
`main`. Agent names: advocate-a (Option A), advocate-b (Option B).
