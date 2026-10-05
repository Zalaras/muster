# Correctness review: Rail groups

**Plan**: groups
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 66011 words (budget 20000)

Scope: a full review, not a delta cycle, because cycle 2 carried agent-tagged Majors. The code diff since `8a2bdd36` is limited to comments, the reworded test comment and the dialogs element hand-in, so the requirement verdicts below carry from cycle 2 and each was re-checked against that diff.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — unchanged since cycle 2; the new group dialog's lookups moved to `groups.ts` byte for byte | Yes — E1, E2; D11 | pass |
| REQ-2 | Yes — unchanged | Yes — E3; D11, D14 | pass |
| REQ-3 | Yes — unchanged | Yes — E6, E8; D8 | pass |
| REQ-4 | Yes — unchanged | Yes — E4 | pass |
| REQ-5 | Yes — `groupsdialogs.ts` now takes `GroupsDialogsElements` from its caller; same element ids, same `onConfirm` | Yes — E7; D9, D13 | pass |
| REQ-6 | Yes — unchanged | Yes — E7; D4 | pass |
| REQ-7 | Yes — unchanged | Yes — E14 | pass |
| REQ-8 | Yes — unchanged | Yes — E10; D12 | pass |
| REQ-9 | Yes — unchanged | Yes — E5; W7; D4 | pass |
| REQ-10 | Yes — unchanged | Yes — E27, the 640/639 pair | pass |
| REQ-11 | Yes — unchanged | Yes — E17–E19; D10, D16 | pass |
| REQ-12 | Yes — unchanged; `groupsselect.ts` already took its elements | Yes — E12, E13, E16 | pass |
| REQ-13 | Yes — unchanged | Yes — E14; W12 | pass |
| REQ-14 | Yes — unchanged | Yes — E15 | pass |
| REQ-15 | Yes — unchanged | Yes — E1, E7; W6 | pass |
| REQ-16 | Yes — unchanged | Yes — E8, E9; W6 | pass |
| REQ-17 | Yes — unchanged | Yes — E20, E22; W8 | pass |
| REQ-18 | Yes — unchanged | Yes — E8 | pass |
| REQ-19 | Yes — unchanged | Yes — E20, E21; W8 | pass |
| REQ-20 | Yes — unchanged | Yes — E6; D8 | pass |
| REQ-21 | Yes — unchanged | Yes — E25; D15 | pass |
| REQ-22 | Yes — unchanged; `ErrInvalidOrder`'s comment now names `runBatch` as a source, which matches `actions.go` | Yes — D9 | pass |
| REQ-23 | Yes — per-section `rebuild`; the `applyPin` comment now matches it | Yes — D4 | pass |
| REQ-24 | Yes — unchanged | Yes — E12 | pass |
| REQ-25 | Yes — unchanged | Yes — E10, E11 | pass |
| REQ-26 | Yes — unchanged | Yes — W5 | pass |
| REQ-27 | Yes — unchanged | Yes — E14 | pass |
| DIAG | `one-launch-end-to-end` true now: `launcher.go:389-394` discards only on final failure. `web-components` module counts true (33 and 37), but its features split still sums to 31 | — | fail — Major 2 |

## Build & Tests

E2E tests: pass (713) · Daemon tests (race): pass (24 packages `ok`, no FAIL) · Web tests: pass (2404) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; Biome clean, 302 files) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass (`01-build.log` empty) |
| test | `make test-race` | pass (`02-test.log`, no FAIL) |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass (chunk-size warning only) |
| web-test | `make web-test` | pass (2404) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass (43 pairs × 3 themes, 0 failures) |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass (empty) |
| kb-check | `make check-kb` | pass (522 records, 0 problems; the green re-run after the word-budget trim) |
| dead-refs | `dead-refs.py --all` | pass (3635 checked, 0 missing) |
| e2e-lint | `make e2e-lint` | pass |
| features | features-scope | pass |
| comments | comment-checks | pass |
| size | `make size-warn` | WARN (27 hits), review-maintainability's |
| e2e | `make e2e` | pass (713 passed) |
| D1 | `make test` | pass (deduped to test-race) |
| D2 | `go build ./...` | pass (deduped to build) |
| D3 | `make lint` | pass (deduped to lint) |
| D17 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (`17-D17.log` empty) |
| D18 | `make test-race` | pass (deduped to test) |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W3 | `make web-lint` | pass (deduped) |
| W4 | `make contrast` | pass (deduped) |
| W13 | `! rg -n ": any\b\|as any\b\|\.innerHTML = " web/src …` | pass (`18-W13.log` empty; Note 1) |
| E28 | `make e2e` | pass (deduped to e2e, 713 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — the `web-components` features split is still false (Major 2). The rest is fixed: the launch diagram, the design-system selection-bar size (`--fs-2xs`, matches `style.css:3997-4000`), and the module counts. Every `deviation:` line carries `→ kb:adr/…` or a stated no-ADR reason. The Doc Delta and `doc-delta.md` are unchanged since cycle 2, and no code since makes a line false. TODO ticks are correctly deferred until `approved`. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4–D16 | named daemon tests | pass | Unchanged since cycle 2 apart from one comment in `manager_writeorder_test.go`, and no assertion changed. Its wording is Major 1. |
| W5–W12 | Vitest coverage | pass | No web test changed; 2404 pass; no unit test imports `initGroupsDialogs` |
| W14 | main.ts registration only; no sibling controller imported | pass | `main.ts` unchanged. `groups.ts` imports only its own sub-controllers and now looks up both their markups, the `launch.ts` → `launchgroup.ts` shape |
| E1–E27 | driven live by review-browser | present | No spec file changed since cycle 2; each criterion is still named by a test in the four `groups*.spec.ts` files |
| copy | labels match the table verbatim | pass | The copy module is untouched; the dialog element ids are the same ones, moved |
| colour | no literal, state tokens only for their state | pass | No stylesheet change since cycle 2 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D17 green; this cycle's Go diff is comments only |
| 2 | Terminal-output state parsing | pass — none added |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux | pass — no tmux invocation added |
| 5 | Payload logging | pass — no log line added |
| 6 | Empty-gauge dishonesty | pass — no render branch changed |
| 7 | Identity on `session_id` | pass — unchanged |
| 8 | Settings trespass | pass — none |
| 9 | Real `claude` | pass — none launched |

## Cycle 2 fixes

| Cycle-2 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| correctness Major 1 `[daemon-impl]` `applyPin` comment claims rebuild renumbers 0..n-1 | `d1eb995a` | Comment read against `rebuild` (`railorder.go:205-243`). It now says rebuild renumbers only a duplicate-railPos candidate and moves entries only where a section breaks the invariant, which matches the code. `ErrInvalidOrder` now names `runBatch` too, also true. Comments only, no code change. |
| correctness Major 1 handoff, the same stale claim in `manager_writeorder_test.go` | `384f29eb` | Reworded. The new text is false in the corrupt case (Major 1). |
| correctness Major 2 `[orchestrator]` `web-components` counts | `836e9086` | The counts are now 33 and 37, which match `ls`. The controller and helper split was not recounted (Major 2). |
| correctness Major 2 `[orchestrator]` launch diagram rollback | `ef7e8ec0` | The retry branch keeps the held group, and `DiscardLaunchGroup` is a final-failure note. Both match `launcher.go:389-394`. |
| correctness Minor 1 `[web-impl]` stale package guides | `fdb5aed3`, `6bb10267` | The features guide names `groupsselect.ts`, `groupsdialogs.ts` and `batchplan.ts`. The render guide names `anchored.ts` and `options.ts`. The trim kept every name, and `check-kb` is green. |
| correctness Minor 2 `[orchestrator]` design-system bar-button size | `ef7e8ec0` | The doc says `--fs-2xs`, which matches `.selbar .btn`. |
| maintainability Minor 1 `[web-impl]` sub-controllers get markup differently | `fdb5aed3` | Diff read. Both sub-controllers now take `(app, elements, deps)`, `groupsdialogs.ts` no longer imports `requireElement`, and the element ids are unchanged. review-maintainability owns the shape verdict. |

## Issues

### Critical

None.

### Major

1. **[daemon-tests]** The reworded test comment claims something false about the corrupt-row repair this plan shipped. It is at `internal/session/manager_writeorder_test.go:151-152`, on `TestCreateSession_AfterRailReorderStillExceedsEveryExistingRailPos`. It says a corrupt duplicate row "is renumbered 0..n-1, which lowers values too. Either way no existing RailPos moves past nextRailPos". `rebuild`'s duplicate branch (`railorder.go:237-241`) sets each entry to its index, so values can rise. `LoadAll` seeds `nextRailPos` as max + 1 (`manager.go:313`). Three rows all holding railPos 0 seed it to 1, and the repair hands out 0, 1 and 2, so one value passes `nextRailPos`. The claim holds only for a rail whose railPos values are unique, which is the only state the test builds. Scope the sentence to that case, or say the corrupt-row repair can raise a value. No assertion needs to change.
2. **[orchestrator]** `kb:diagram/web-components` still miscounts the `features/` split (DIAG). The box says "33 modules", but its description is "18 stateful per-feature controllers … plus 13 DOM-free helpers", which sums to 31. `main.ts` registers 18 controllers. Of the other 15 modules, 4 are sub-controllers that hold DOM state: `launchresume.ts`, `launchgroup.ts`, `groupsselect.ts` and `groupsdialogs.ts`. The other 11 are DOM-free helpers. Cycle-2 correctness Major 2 asked for the two new sub-controllers in the split. The fix named them in the parenthetical but kept the numbers. Make it 18 controllers, 4 sub-controllers and 11 DOM-free helpers.

### Minor

None.

### Notes

1. **[note]** The W13 globs still do not reach `render/anchored.ts`, `render/options.ts`, `features/batchplan.ts`, `features/launchgroup.ts` or `features/launchgroupchoice.ts`. The same grep over those five files finds nothing.
2. **[note]** This is for daemon-impl, and no change is requested. The edge in Major 1 is also a latent behaviour. A corrupt duplicate-railPos rail that is reordered after `LoadAll` can renumber a session onto or past `nextRailPos`, so the next new session can share a railPos. The following rebuild repairs it. Main's whole-list renumber had the same edge, and the daemon never writes duplicates itself.
3. **[note]** The features guide's list of pure helpers omits `launchpastlist.ts`, which calls itself "Pure decisions". The omission predates this branch and is on `main` too.
4. **[note]** Cycle-2 correctness Notes 2–5 still stand unchanged. They cover the untested 500 branch of `writeBatchError`, two `sessions.order` points for doc-reconcile, `render/options.ts` calling itself the one option builder, and cycle-1 Notes 4–6.
