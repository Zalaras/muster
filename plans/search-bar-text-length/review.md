# Review: search-bar-text-length

**Plan**: search-bar-text-length
**Verdict**: approved
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: search-bar-text-length

**Plan**: search-bar-text-length
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 25305 words (budget 30000)

**What I read:** `plan.md`, the merged cycle-1 review (`review.cycle1.md`) and the gate run in
`$GATES_LOG_DIR` (`gates-search-bar-text-length-c2`, 19 lines). I also read
`git diff f236b176..HEAD`, which is the fix wave: `e8b2136e`, `5a3160f9` and `133e672f`. Last, I
read the whole branch diff against `main`.

**What changed since cycle 1:** only `internal/server/settings_shell_reply_test.go` (a test),
`docs/adr/reader-find-query-follows-file-switch.md:20`, and plan-directory files. Nothing under
`web/` changed. The REQ rows below are cycle 1's evidence, rechecked against the unchanged files
(`find.ts:64-66`, `style.css:1545`).

**Logs:** none exist. The main session wrote every commit, so there are no `deviation:` or
`doc-delta:` lines to check.

This is not a delta cycle, because cycle 1 had a Critical. The review covers everything.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `countText` returns `No results` when `query === ""` (`web/src/reader/find.ts:65`) | Yes. `find.test.ts` › `countText (W3)` has empty-query rows. E2E `reader-search.spec.ts` covers the bar just opened and the query backspaced to empty | pass |
| REQ-2 | Yes. The same branch returns `No results` when `count === 0`. Otherwise it returns `<i> of <n>` | Yes. A unit row with zero matches. Every E2E `no matches` assertion now reads `No results` | pass |
| REQ-3 | Yes. `.find-count` reserves 10ch, and the compact 6ch override is gone. The bar is monospace, so `No results` and `999 of 999` are both 10ch | Yes. The Focus and 3×2 tile width/left-edge tests (±0.5 px) pass in `19-E1.log`. Cycle 1 showed both go red on the old CSS | pass |
| DIAG | `kb:diagram/web-components` (for `find.ts`, `style.css`) and `kb:diagram/daemon-components` (for the test file). The cycle-2 change is test-only and changes no imports, and the web modules are unchanged. There is no plan `## Diagrams` delta | — | pass |

## Build & Tests

- E2E tests: pass (963 passed, none failed or flaky, `17-e2e.log`).
- Daemon tests (race): **pass**. Every package is `ok` in `02-test.log`, including `internal/server` (307.7 s under the full parallel sweep). This was cycle 1's red line.
- Web tests: pass (2761).
- Daemon build: pass.
- Web build: pass. The only warning is the existing chunk-size one.
- Lint: pass (golangci-lint 0 issues; Biome 338 files clean).
- Contrast: pass (54 pairs × 3 themes, 0 failures).
- kb check: pass (610 records, 0 problems).
- e2e-lint: clean.
- features-scope: pass. It widened **Touches** to `ingest` for the test file, committed as `133e672f`.
- comment-checks: clean.
- comment ledger: no added blocks.
- size-warn: 0 hits.
- versions: fresh.
- e2e-honest and features-inventory: empty logs, so they pass.

All results are read from `$GATES_LOG_DIR`. The run reports 0 failed lines.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `cd web && npx vitest run src/reader/find.test.ts` | pass (`18-W1.log`: 30 passed) |
| E1 | `cd web && npx playwright test reader-search.spec.ts` | pass (`19-E1.log`: 50 passed) |
| W2 | `make web-lint` | pass (deduped to the baseline `web-lint` line, `06-web-lint.log`: 338 files, no fixes) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. `#102` is in `docs/history/todo-done.md` and gone from `TODO.md`. There are no logs, so there are no `deviation:` or `doc-delta:` lines, and there are no `proposed` ADRs for reader or reader-find. The Doc Delta (the count reads `No results` while the query is empty or matches nothing, `<i> of <n>` otherwise, and the bar keeps one width) is true of the code. It is already in `docs/features/reader-find/spec.md:18-20`. Cycle 1's Major 1 is fixed: `grep -rn "no matches"` over `docs/` (excluding `docs/history/`), `web/src`, `web/e2e`, `SPEC.md` and `README.md` finds only the ADR's prose phrase "leaves no matches", and the ADR's quoted count string now reads `No results` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | In Chrome, the opened bar shows `No results` between the query box and ↑, with no blank gap | pass (carried from cycle 1, web unchanged) | Cycle-1 browser part: in Focus and the pop-out there is 4 px from the query box to the text and 4 px from the text to ↑, which equals the spacing between the arrows. A compact tile has 2 px / 2 px. `git diff f236b176..HEAD` touches nothing under `web/` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The test change uses only `claudecode.WriteWrapperScripts`, `MergeSettings`, `PromptTitleReply` and the `claudecodetest` builders. No Claude-Code field names are hand-written in `internal/server` |
| 2 | Terminal-output state parsing | pass (n/a) |
| 3 | Blocking hook handler | pass. The wrapper's own `curl --max-time 2` is unchanged. Only the test's outer kill limit moved |
| 4 | Bare tmux / resize-pane | pass (n/a, no tmux in the changed test) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass. The empty-query branch names the state (`No results`) instead of rendering blank |
| 7 | Identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass. `MergeSettings(nil, …)` builds settings in memory, and scripts go to a `t.TempDir()` data dir |
| 9 | Real `claude` outside canary | pass. The tests run `sh` + `curl` against `httptest` servers |

**Cycle-1 Critical 1 `[daemon-tests]` fix: verified.**

- **The cause is gone.** `runWrapperCapture` no longer takes a per-call budget. It kills the wrapper only after the shared `wrapperHangGuard` (30 s, `settings_shell_reply_test.go:54`), well above the 10.6 s the loaded run took.
- **Every listed assertion is intact.** `require.NoError` on exit (`:68`), `assert.Equal(tt.want, stdout)` byte-for-byte (`:128`), and the empty-stdout/stderr asserts (`:129`, `:132-133`) are unchanged. The fix asked for exactly this.
- **The test still fails on a hang**, just at 30 s.
- **Speed is still asserted.** The comment says speed is checked elsewhere, and it is: `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing` keeps `assert.Less(time.Since(start), 5*time.Second)` (`:163`).
- **Measured green.** The `internal/server` package passed inside the full `make test-race` sweep (`02-test.log`).

**Cycle-1 Major 1 `[orchestrator]` fix: verified.** The ADR's Consequences sentence now quotes `No results`. Its Decision paragraph is byte-identical, so this is not an edit to an accepted decision.

**Plan Edge Case 2** was reworded as cycle-1 browser note 2 asked: `1000 of 1234`, 12 characters, the bar widens by two characters. That matches the 13.55 px (2ch) review-browser measured.

**Design tokens:** no web change since cycle 1, and cycle 1 found it clean.

**Fixture shape:** the new E2E tests take the `daemon` fixture, as the **Fixture plan** header says.

**Repairs:** there is no `## Repairs` table. The edited E2E assertions are the plan's "Existing tests this breaks", each moved to a stricter exact text.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** The speed assertion that `wrapperHangGuard`'s comment relies on (`TestWrapperReply_AnAnswerThatNeverComesPrintsNothing`, `<5 s`, `:163`) is the sibling that cycle 1 traced to a recorded load flake (`plans/effort/daemon-implementation.md:54`). It passed in this run. If it goes red under a future `make test-race`, the same reasoning applies: its margin is 3 s over curl's 2 s limit, and the cost it measures is mostly starting the process under load. I am not asking for a change.
2. **[note]** **Touches** `ingest` is correct as Touches rather than Features. The only `ingest` file changed is a test, and no `ingest` behaviour, spec sentence or contract changed.
