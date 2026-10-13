# E2E Test Specs: State Issues

**Plan**: state-issues
**Mode**: validate (attempt 1)
**Pack**: kb: pack 23282 words (budget 30000)
**Verdict**: pass
**Tests created**: 26
**Live run**: 26/26 passing (file run 13.2s; full suite 763/763; soak N=10 260/260)

## Tests

All in `web/e2e/state-transitions.spec.ts` (fileDaemon, per the plan's Fixture plan header; every test launches its own `uniqueTitle` session). Helpers: `web/e2e/helpers/state-transitions.ts` (new), `web/e2e/helpers/payloads.ts` (additive).

Collection: `npx playwright test --list` → `Total: 763 tests in 52 files` (26 new), no error. `sh scripts/e2e-lint.sh` clean.

Pins: `npm run e2e -- e2e/state-transitions.spec.ts -g "regression"` → `6 passed (4.2s)`.
Full file at authoring: 6 passed, 20 failed. Every red is a new-behaviour assertion failing on the value the current tree produces, none a locator defect (the first failing assertion is quoted per row).

| Test Name | Requirement | What It Verifies | Live run |
|-----------|-------------|------------------|----------|
| a compaction begun on an idle card reads working, and its SessionStart for the same prompt lands idle (E1, REQ-6, REQ-8) | E1, REQ-6, REQ-8, INV-C | idle card + `PreCompact` (fresh prompt id) → badge working, compactions 1, attention/failure null; compact `SessionStart` same prompt id → idle with lastActivity/lastPrompt/compactions/backgroundTasks unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a compaction on a card that never had a turn reads working and then idle, never started (E1b, INV-C, REQ-6, REQ-8, #66) | REQ-6, REQ-8, INV-C | started card: PreCompact → working; compact SessionStart → idle, not started | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a compaction in a plan-mode session reads working, never planning, then lands idle (REQ-6) | REQ-6 | latch on plan after a plan-mode turn; PreCompact → working (the badge locator matches the whole word, so planning fails it) → idle | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a compaction inside a working turn only counts: no transition, and its SessionStart under a fresh prompt id changes nothing (E1c, REQ-7, REQ-9) | REQ-7, REQ-9 | working turn; PreCompact + compact SessionStart naming an id the turn never used → still working, stateSince unchanged, ⟳1, then the turn's Stop → idle | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a compaction inside a working turn whose SessionStart names the turn's own prompt changes nothing (E1d, REQ-7, REQ-9) | REQ-7, REQ-9 | the compact SessionStart naming the turn's own open current prompt is not a REQ-6 compaction prompt: no transition, stateSince unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a compact SessionStart on an idle card whose PreCompact was lost changes nothing (edge case 1, REQ-9) | REQ-9, edge 1 | idle + compact SessionStart with no PreCompact → idle, stateSince and lastActivity unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a compact SessionStart that arrives before its PreCompact is a no-op, and the later idle_prompt ends the compaction (edge case 3, REQ-8, REQ-9, REQ-2) | REQ-9, REQ-6, REQ-2, edge 3 | reordered pair: SessionStart no-op, PreCompact → working, idle_prompt for its prompt → idle, attention null | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| when a compaction's SessionStart is lost, or nothing was compacted, the idle_prompt naming its prompt lands idle, never needs input (edge cases 2 and 4, REQ-2, INV-B) | REQ-2, INV-B, edges 2, 4 | PreCompact only, then idle_prompt for it → idle, no `needs input` text, attention null | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a new prompt during a compaction is an ordinary turn, and the compaction's late SessionStart then changes nothing (edge case 7, REQ-9) | REQ-9, edge 7 | open compaction prompt, new UserPromptSubmit/Stop turn, then the compaction's SessionStart → idle, stateSince and lastActivity unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| SessionStart with source startup, clear and resume still lands started, started and idle (REQ-10 regression) | REQ-10 | startup bind → started; clear on a new session id → started; resume on the same id → idle | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt naming a prompt no hook opened leaves an idle card idle, then closes that prompt (E2, REQ-1, REQ-3, #87) | E2, REQ-1, REQ-3, INV-B | idle + orphan-prompt idle_prompt (local-command shape) → idle, never `needs input`, stateSince/lastActivity unchanged; an unmarked PostToolUse on that id is then a straggler (proves the prompt was closed) | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt for the prompt a Stop already closed changes nothing (REQ-4 regression) | REQ-4 | closed-prompt idle_prompt on an idle card changes nothing | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a straggler idle_prompt for a closed prompt arriving after the next turn started leaves the card working (edge case 13, REQ-4 regression) | REQ-4, edge 13 | p1 closed, p2 open and working; idle_prompt(p1) changes nothing | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt with no prompt_id after /clear changes nothing (REQ-4 regression) | REQ-4 | the prompt-less idle_prompt (kb:fact/clear-idle-prompt-carries-no-prompt-id) is inert | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt naming the open turn's prompt ends the turn: a working card lands idle with its earlier fields intact (E3, REQ-2) | E3, REQ-2 | working card, idle_prompt for the turn's prompt → idle, attention/failure null, lastActivity and backgroundTasks (1) unchanged; a late unmarked tool event cannot reopen the prompt | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt naming the open turn's prompt lands a planning card idle (REQ-2) | REQ-2 | planning source state → idle | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt naming a background subagent's fresh prompt id ends that stretch: working lands idle, never stuck on needs input (edge case 9, REQ-2, #72) | REQ-2, edge 9, #72 | Stop with a background task, subagent-marked PreToolUse under a fresh prompt id → working, idle_prompt for it → idle; a later marked PostToolUse on the closed id → working again | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt for the open prompt of a PermissionRequest leaves the card on needs input with the same wait (E4, REQ-1, REQ-3) | E4, REQ-1, REQ-3 | PermissionRequest wait + idle_prompt for the open prompt → still needs input, reason `permission`, attention.since and stateSince unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an idle_prompt on a subagent's permission wait keeps the wait, and the subagent's own next activity still clears it (edge case 10, REQ-3, REQ-5) | REQ-3, REQ-5, edge 10 | subagent PermissionRequest on a fresh open prompt, idle_prompt keeps it (permission, same since); the subagent's PostToolUse → working | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a subagent-marked event carrying dontAsk leaves a planning card planning and the latch on plan (E5, REQ-12, #70) | E5, REQ-12 | plan-launched, planning after a plan-mode UserPromptSubmit; marked PreToolUse with `permission_mode:"dontAsk"` → still planning, `permissionMode` `{plan, hook}` | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a main-agent event carrying acceptEdits still moves a planning card to working and the latch to acceptEdits (REQ-12 regression) | REQ-12 (main-agent unchanged) | unmarked PostToolUse acceptEdits → working, latch `{acceptEdits, hook}` | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a subagent-marked StopFailure for the closed prompt leaves an idle card idle, never failed (E6, REQ-13, #86) | E6, REQ-13 | idle after Stop + marked StopFailure (agent_id, closed p1) → idle, no `failed` text, failure null, stateSince and lastActivity unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a subagent's failure leaves the card idle, and the main agent's own background-completion turn failing then reads failed (edge case 18, REQ-13) | REQ-13, edge 18 | marked StopFailure → idle; `<task-notification>` UserPromptSubmit p2 → working; unmarked StopFailure → failed with the raw error | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a subagent-marked StopFailure while the main turn is open leaves the card working, and the turn's own Stop still lands idle (edge case 16, REQ-13) | REQ-13, edge 16 | working + marked StopFailure → working, failure null, stateSince unchanged; the turn's Stop → idle (no prompt closed) | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| a subagent-marked StopFailure during a permission wait keeps the card on needs input with the same wait (edge case 17, REQ-13) | REQ-13, edge 17 | needs input + marked StopFailure → needs input, failure null, attention.since unchanged | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |
| an unmarked StopFailure still fails the open turn, with its raw error and message (REQ-13 regression) | REQ-13 (unmarked unchanged) | working + unmarked StopFailure → failed, `failure.error` `rate_limit`, attention null | passing live at validate 1 (26 passed, 13.2s); soak 260 passed (1.5m) |

## Deleted Tests

None (new spec file; no existing spec rewritten).

## Fixture Changes

All additive in `web/e2e/helpers/payloads.ts` (existing callers' payloads are byte-identical; `subagent-status`, `sessions`, `gauges` and `rail-unread` specs re-ran green after the edit: `45 passed (35.1s)`).

- `envelopedSessionStart`: `source` accepts `"compact"`; new `promptId` option adds `prompt_id` to the payload only when given. Source: kb:fact/compact-hook-sequence (`SessionStart{source:"compact"}` carries the compaction's `prompt_id`; same `session_id`). Compact specs pass `model: null` (omitted) because no fact records `model` on a compact `SessionStart`.
- `rawPreCompact`: new optional `trigger: "manual"` (the only value measured; kb:fact/compact-hook-sequence). No `permission_mode` (kb:fact/permission-mode-presence-split). `custom_instructions` is never sent, see Handoff.
- `rawStopFailure`: new optional `agentId` adds `agent_id` only (kb:fact/subagent-stopfailure-carries-agent-id records `agent_id`, not `agent_type`, on this event).
- `TurnActivityOpts.permissionMode` accepts `"dontAsk"` (kb:fact/subagent-declared-mode-on-hooks); new `agentType` (default `"general-purpose"`, unchanged) threaded through `rawUserPromptSubmit`, `rawPostToolUse`, `rawPreToolUse`, `rawPostToolBatch`.
- `helpers/state-transitions.ts` (new): `HookFeed` (posts hooks for one claude session id and, in `persisted()`, waits until the event table holds every hook sent, then `settleFor` 500 ms, so a stays-unchanged assertion cannot pass because an event was not yet applied), `openBoundSession`, `finishTurn`, `snapshot`.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E2, E3, E4 tests; edge-case 2/4 test |
| REQ-2 | E3, planning-card, background-subagent (#72), edge 2/4, edge 3 tests |
| REQ-3 | E2 (unseen id closes it), E4, edge 10 |
| REQ-4 | three REQ-4 regression pins (closed id, edge 13, prompt-less) |
| REQ-5 | edge 10 (permission wait cleared only by the raising agent). The legacy-`idle` clause is unit-only (see Notes) |
| REQ-6 | E1, E1b, plan-mode compaction |
| REQ-7 | E1c, E1d |
| REQ-8 | E1, E1b, plan-mode compaction |
| REQ-9 | E1c, E1d, edge 1, edge 3, edge 7 |
| REQ-10 | REQ-10 regression pin (startup, clear, resume; the missing-source clause is unit-only, see Notes) |
| REQ-11 | unchanged scope; not an observable of the faked hooks (the sweep reads a transcript), existing `subagent-status.spec.ts` interrupt tests keep covering it |
| REQ-12 | E5, acceptEdits regression pin |
| REQ-13 | E6, edge 16, 17, 18, unmarked pin |
| INV-B | E2, edge 2/4, E3 (never `needs input` text asserted), E4 keeps permission |
| INV-C | E1b (never `started`), E1 |
| INV-A, INV-D | not asserted here; the unit D3 table owns the source-state cross |

## Repairs

None (authoring mode).

## Handoff

- **Plan inconsistency, INV-C vs REQ-9 / edge case 14.** INV-C says no compaction input from any source state ever results in `started`; REQ-9 and edge case 14 say a `SessionStart{compact}` on a different `session_id` still escalates to the clear-rebind, which lands `started`. One of them needs a qualifier. E2E does not drive the different-id case; the unit table (D3) must pick the reading. (`started` after `SessionStart{compact}` on the *bound* id is what E1b / E1c / E1d assert against.)
- **Needs `/interface-probe` (shapes not recorded, so not invented):**
  - `PreCompact.custom_instructions` — the fact names the key but not its value shape; it is omitted from the fixture (an optional field).
  - An **auto** compaction's `PreCompact` (`trigger:"auto"`, mid-turn): unmeasured, including which `prompt_id` it carries. E1c uses a fresh id and E1d the turn's own id, so REQ-7/REQ-9 are exercised under both possibilities; `trigger` is omitted from those payloads.
  - `SessionStart{source:"compact"}.model` presence — unmeasured; omitted.
  - The `agent_type` string the built-in `claude-code-guide` reports (E5 sends `"claude-code-guide"`, the agent's name; the daemon reads only `agent_id`) and whether its subagent `StopFailure` also carries `agent_type` (the fixture sends `agent_id` only, as the fact records).
- **Existing spec check:** `web/e2e/sessions.spec.ts:447` (E14) posts two `PreCompact` on a fresh (`started`) session and asserts only the `⟳1` / `⟳2` counter text, not a state; under REQ-6/REQ-7 the first lands `working` and the second only counts, so its assertions still hold. `gauges.spec.ts` E10 likewise asserts only the counter, then a Stop and a clear-rebind. No edit needed; the impl log's `## Handoff` should still confirm.
- No change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh` needed.

## Test Run Output

```
npm run e2e -- e2e/state-transitions.spec.ts -g "regression"
  6 passed (4.2s)

npm run e2e -- e2e/state-transitions.spec.ts          (full file, current tree)
  6 passed, 20 failed — each failure on a new-behaviour assertion, e.g.
  E3   expected /idle/i, received "needs input"      (idle_prompt on a working card)
  E6   expected /idle/i, received "failed"           (subagent-marked StopFailure)
  E1b  expected /working/i, received "started"       (PreCompact on a started card)
  E5   expected /planning/i, received "working"      (subagent dontAsk latched)
  E4   expected "permission", received "idle"        (attention.reason after idle_prompt)
```

## Notes

- Every stays-unchanged assertion follows `feed.persisted(page)` (event table holds every posted hook, then a 500 ms `settleFor`) and compares `stateSince` / `attention.since` before and after, so whole-second timestamp ties cannot make a changed state look unchanged (a differing state would differ by value anyway).
- Out of E2E by construction: the legacy `needs_input`/`idle` row (REQ-3 last clause, REQ-5 second sentence, edge 11) can only be persisted by an earlier daemon; `unread` (REQ-2/REQ-8) follows the terminal registry, and Focus attaches the focused session's terminal, so it is asserted by the unit tests; a missing `source` on `SessionStart` (REQ-10) is not a measured shape; edge cases 5 and 8 have no event to drive (plan marks them untested).
- Each red test fails at the first new-behaviour assertion, so the assertions after it in the same body (e.g. `lastPrompt`, `backgroundTasks`, the late-straggler checks) have not been executed against any tree yet; validate mode is where they first run.

## Validate Attempt 1

- Rebuild: `make web-build build` (run with `env -u MUSTER_SESSION -u TMUX`) before every run; binary `v0.20.2-47-gf3ba1492`, built from the daemon-impl tree.
- `npm run e2e -- e2e/state-transitions.spec.ts` -> `26 passed (13.2s)` on the first run: the 20 tests red at authoring are now green against the daemon-impl behaviour, and the 6 pins stay green. No debugging runs were needed.
- `npx playwright test --list` after the run -> `Total: 763 tests in 52 files`, no error.
- Full sweep `make e2e` -> `763 passed (6.1m)`; this includes `sessions.spec.ts` E14 and `gauges.spec.ts` E10 (the PreCompact counter tests flagged at authoring), which still hold.
- Soak `make e2e-soak SPEC=e2e/state-transitions.spec.ts N=10` -> `260 passed (1.5m)`.
- `git status --short` after the runs shows no tracked-file change from validation (no spec or helper edits were made).

### Repairs

None. No spec, helper or fixture was edited in this attempt. No assertion was deleted, skipped, or weakened.

### E2E Implementation Bugs

None.

### Handoff (validate)

The authoring Handoff stands: INV-C vs REQ-9/edge case 14 needs a qualifier in the plan (E2E does not drive the different-session-id compact `SessionStart`), and the `/interface-probe` candidates (PreCompact `custom_instructions`, auto-compaction `PreCompact` shape and its `prompt_id`, compact `SessionStart.model`, `agent_type` for `claude-code-guide`) remain unmeasured. No change to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh` is needed.
