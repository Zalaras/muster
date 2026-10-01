# E2E Test Specs: Status Inconsistencies

**Plan**: status-inconsistencies
**Mode**: validate (attempt 1)
**Pack**: kb: pack 32938 words (budget 20000)
**Verdict**: pass
**Tests created**: 17 new (subagent-status.spec.ts 8, rail-cards.spec.ts 9 incl. rewrites counted separately in Tests) and 5 existing rewritten, 1 deleted
**Live run**: 72/72 passing across the five spec files after one repair; full suite 515/515; soaks 10x green for all five files

## Tests

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/subagent-status.spec.ts | a prompt-less idle_prompt leaves an idle card idle with no attention (E1, REQ-1) | REQ-1 / E1 | prompt-less Notification POST; card stays idle, attention/failure null, stateSince unchanged | collection-only (fails today: card reads needs input) |
| web/e2e/subagent-status.spec.ts | an unmarked PostToolBatch moves a card waiting on ExitPlanMode from needs input to planning (E2, REQ-2) | REQ-2 / E2 | PermissionRequest{ExitPlanMode} then PostToolBatch under plan mode; card to planning, attention null | collection-only (fails today: stays needs input) |
| web/e2e/subagent-status.spec.ts | subagent-marked tool activity leaves a main-agent permission wait on needs input, and the main agent's own PostToolUse then ends it (E3, REQ-3) | REQ-3 / E3 | subagent PreToolUse/PostToolUse keep needs input and `attention.since`; main PostToolUse control ends it | collection-only (fails today: card reads working) |
| web/e2e/subagent-status.spec.ts | a subagent-raised permission wait survives main-agent and second-subagent activity and ends on the owning subagent's PostToolUse (REQ-3, INV-B) | REQ-3, INV-B | owner = agent-1; main and agent-2 activity do not clear; agent-1 does | collection-only |
| web/e2e/subagent-status.spec.ts | a main Stop while a subagent owns the permission wait keeps needs input and its attention (REQ-8) | REQ-8, REQ-5 | main Stop with a running task keeps needs_input + attention; backgroundTasks 1 | collection-only |
| web/e2e/subagent-status.spec.ts | a working card whose transcript gains an interrupt line for its current prompt reads idle within 10 s (E4, REQ-4) | REQ-4 / E4 | transcript file at the hooks' transcript_path gains `[Request interrupted by user]`; idle within 10 s, attention/failure null, lastActivity unchanged | collection-only |
| web/e2e/subagent-status.spec.ts | declining a permission prompt, an interrupt for tool use, takes a needs input card to idle and clears its attention (E4, REQ-4) | REQ-4 | `...for tool use]` line from needs_input | collection-only |
| web/e2e/subagent-status.spec.ts | an interrupt line for an older prompt id leaves a working card working until the current prompt's line arrives (REQ-4) | REQ-4 (D8) | 6 s hold over more than one poll tick; then the p2 line lands idle | collection-only |
| web/e2e/rail-cards.spec.ts | a Stop with one running shell shows '1 background task' on an idle card (E5, REQ-5, REQ-6) | REQ-5, REQ-6 / E5 | line text, title, opacity 1 (not hover-revealed), state idle, wire `backgroundTasks` 1 | collection-only |
| web/e2e/rail-cards.spec.ts | a Stop listing two running tasks, one already finished, counts only the running ones and pluralises the line (E5, REQ-5, REQ-6) | REQ-5, REQ-6 | `2 background tasks`, completed entry not counted | collection-only |
| web/e2e/rail-cards.spec.ts | a later Stop with an empty background_tasks list removes the line (E6, REQ-5, REQ-6) | REQ-5, REQ-6 / E6 | line gone, wire count 0 | collection-only |
| web/e2e/rail-cards.spec.ts | an ended card shows no background line even though its last Stop listed a running task (REQ-6, INV-C) | REQ-6, INV-C | ended card hides `.bg-tasks` | collection-only |
| web/e2e/rail-cards.spec.ts | a live rail card has no End button, on hover and while current (E7, REQ-7, INV-D) | REQ-7, INV-D / E7 | zero End/Resume/Remove buttons at rest, hover, current; `.acts-row` hidden and empty | collection-only (fails today: End present) |
| web/e2e/rail-cards.spec.ts | a live strip card in Tiles has no End button (E8, REQ-7, INV-D) | REQ-7, INV-D / E8 | strip card (5 sessions, 2x2) has no End; live tile footer End still present | collection-only |
| web/e2e/rail-cards.spec.ts | ending from the mainhead ends only that session, and its card then offers Resume and Remove in that order (E9, REQ-7) | REQ-7 / E9 | mainhead End with 2 live sessions; neighbour alive; ended card buttons `["Resume","Remove"]` | collection-only |
| web/e2e/rail-cards.spec.ts | the mainhead's End button activates via keyboard Enter and Space, not just a mouse click (REQ-7, REQ-11, Major 5) | REQ-7 (rewrite) | focus + real key on mainhead End; card has no End | ran-green-at-authoring (pin): 3 passed (4.2s) with the two tests below |
| web/e2e/rail-cards.spec.ts | the mainhead's End button keeps focus and node identity across a render tick and then opens the End dialog via a separate keyboard Enter (REQ-7, REQ-11, Major 1, Major 2) | REQ-7 (rewrite) | focus, node tag, >1 s tick, Enter; ends with card-has-no-End | collection-only (fails today only on its last line, End present on card) |
| web/e2e/rail-cards.spec.ts | an ended card's Remove button keeps focus and node identity across a render tick and activates via keyboard Enter and Space (REQ-7, REQ-11, Major 1, Major 5) | REQ-7 (rewrite) | nested-button keyboard and tick survival on the ended card | ran-green-at-authoring (pin): 3 passed (4.2s) |
| web/e2e/rail-cards.spec.ts | an ended rail card's action row sits at opacity 0 until hover or focus-within reveals it (REQ-7, REQ-11, Minor 2/3) | REQ-7 (rewrite) | computed opacity 0/1 on an ended, non-current card | ran-green-at-authoring (pin): 3 passed (4.2s) |
| web/e2e/rail-cards.spec.ts | a focused card control survives a rail re-sort triggered by a real priority change (REQ-7, REQ-11, Minor 1) | REQ-7 (rewrite) | Pin button focus + node identity across a real reorder; ends with card-has-no-End | collection-only (fails today only on its last line) |
| web/e2e/actions.spec.ts | action buttons are disabled while the daemon connection is down (E14) | REQ-7 (rewrite) | card End `toBeDisabled()` becomes `toHaveCount(0)`; mainhead assertions untouched | collection-only (fails today on that line only) |
| web/e2e/rail-layout.spec.ts | a card's Pin button keeps focus and node identity when a density button is clicked (E12, REQ-15) | REQ-7 (rewrite) | focus + identity of Pin across a density change; card has no End | collection-only (fails today on the last line) |
| web/e2e/terminal.spec.ts | a live rail card offers no End button, and the mainhead's End opens the confirm dialog without moving focus into a terminal (REQ-5, REQ-7, INV-3) | REQ-7 (rewrite) | mainhead End dialog, focus not in a terminal, both live cards have no End | collection-only (fails today on the last lines) |

## Deleted Tests

One test deleted (below); the other existing tests were retitled and adapted because their control left the live card; each keeps its original intent on a surface a user still has:

| Was | Now |
|---|---|
| rail-cards: "a card's End button activates via keyboard Enter and Space ..." (Major 5) | mainhead End keyboard test, plus the ended card's nested Remove for Major 5's nested-button case |
| rail-cards: "a card's End button survives a render tick ..." (Major 1/2) | mainhead End tick test, and Remove-on-ended-card tick + identity + Enter/Space test |
| rail-cards: "a live rail card's action row sits at opacity 0 ..." (Minor 2/3) | same computed-opacity test on an ended, non-current card (the live card's row no longer exists; E7 asserts that) |
| rail-cards: "a focused card action button survives a rail re-sort ..." (Minor 1) | same re-sort test on the Pin button, with identity tag |
| rail-layout: "a card's End button keeps focus and node identity when a density button is clicked (E12)" | same on the Pin button |
| terminal: "clicking a live card's End button opens the confirm dialog without selecting the session ..." (INV-3) | mainhead End opens the dialog without moving focus into a terminal, plus no End on either live card |
| actions: E14 line 681 (card End disabled) | `toHaveCount(0)` on the live card; mainhead lines unchanged |
| actions: "killing the pane then clicking End before the ~5s liveness poll notices shows no error and the card goes dead (E5)" | DELETED. Reason: developer: the UI path no longer exists (End removed from the live card). The mainhead End disables once the terminal socket closes (measured: `113 × element is not enabled`). |

## Fixture Changes

- `web/e2e/helpers/payloads.ts` (additive): `rawPostToolBatch`, `rawExitPlanModePermissionRequest`, `rawIdlePromptWithoutPromptId`, `interruptTranscriptLine`; `rawStop` now honours its already-declared `transcriptPath` option (default unchanged). Sources: kb:fact/plan-feedback-emits-only-post-tool-batch (PostToolBatch keys, `agent_id` on a subagent's), kb:fact/permission-suggestions-optional and kb:fact/plan-mode-hook-sequence (ExitPlanMode request keys), kb:fact/clear-idle-prompt-carries-no-prompt-id (the four keys, nothing else), kb:fact/interrupt-recorded-in-transcript (user line, `promptId`, exact text block), kb:fact/background-tasks-field (Stop entries).
- `web/e2e/helpers/interrupt.ts` (new): `transcriptPathIn`, `writeTranscript`, `appendTranscriptLine`.
- `web/e2e/helpers/session.ts` (additive): `SessionObject.backgroundTasks`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E1 |
| REQ-2 | E2 |
| REQ-3 | E3, subagent-raised wait test |
| REQ-4 | both E4 tests, the older-prompt test |
| REQ-5 | E5 (both), E6, the REQ-8 test (wire count) |
| REQ-6 | E5, E6, ended-card test |
| REQ-7 | E7, E8, E9 and the six rewritten tests |
| REQ-8 | the REQ-8 test |
| REQ-9 | not E2E: canary static tier (R3) |

## Handoff

1. Resolved by the developer: the pane-kill test in actions.spec.ts was deleted, since the UI path no longer exists (End removed from the live card).
2. E8 takes the per-test `daemon` fixture in rail-cards.spec.ts because docs/conventions.md §Testing makes `daemon` mandatory when a test changes daemon-global state (the Tiles view pref). Not a deviation.
3. **Needs an /interface-probe.** `PostToolBatch.tool_calls` element shape (sent as `[]`, never read), and the interrupt line's `message.content` nesting is now confirmed by the orchestrator against the probe capture, so the fixture needs no change (`interruptTranscriptLine` uses `message:{role:"user",content:[{type:"text",text}]}`).
4. The ExitPlanMode `PermissionRequest.tool_input` is sent as `{}` (the fact names no shape); Muster does not read it for this path.
5. REQ-8's and E4's poll-tick tests are 5-7 s each; E4's older-prompt test holds 6 s with `settleFor`.
6. Nothing needed in `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output

```
npx playwright test --list            -> Total: 515 tests in 44 files (clean)
sh scripts/e2e-lint.sh                -> e2e-lint: clean
npx tsc --noEmit                      -> clean
Live run (make web-build build first), pins: 3 passed (4.2s)
Live run of all new and rewritten tests: every failure is at the first assertion of new behaviour
  (card reads needs input/working/"element(s) not found" for .bg-tasks, End present on card,
   backgroundTasks undefined) - none at a locator defect.
```

## Notes

- The mainhead-End tests select the card with a click, then use `focus()` plus `page.keyboard` (never `locator.press()`).
- Interrupt tests write the transcript in the test's scratch directory and post that path as `transcript_path` in SessionStart, UserPromptSubmit and Stop.


## Validate Attempt 1

Rebuilt (`make web-build build`), ran the five files: 72 passed, 1 failed (the decline-permission E4 test, `needs input` never reached `idle`). Full sweep `make e2e`: 515 passed (3.4m). Soaks (`make e2e-soak N=10`): subagent-status 120/120, rail-cards 130/130, actions 160/160, rail-layout 120/120, terminal 200/200.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | declining a permission prompt, an interrupt for tool use, takes a needs input card to idle and clears its attention (E4, REQ-4) | card stayed `needs input` for 10 s | `rawPermissionRequest` hardcoded `transcript_path: "/tmp/t.jsonl"`, so the PermissionRequest re-pointed the session's transcript away from the file the test wrote the interrupt line to (a real hook repeats its own session's path) | added optional `transcriptPath` to `rawPermissionRequest` (default unchanged) and passed the session's path | REQ-4 unchanged: `...for tool use]` line takes needs_input to idle, attention and failure null |

No assertion was deleted, skipped, or weakened.

## Test Run Output

```
subagent-status: 12 passed (21.4s) after repair; full suite 515 passed (3.4m)
```
