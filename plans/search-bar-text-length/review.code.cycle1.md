# Correctness review: search-bar-text-length

**Plan**: search-bar-text-length
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 15713 words (budget 30000)

Record: `plan.md`, commits `c66d1438` (tests, red-first) and `df2d7388` (fix), `69adc095` (spec
sentence), the gate run in `$GATES_LOG_DIR`. No implementation or test logs exist (the main session
wrote both, per the orchestrator). The branch diff against `main` touches `web/src/reader/find.ts`,
`web/src/style.css`, `web/src/reader/find.test.ts`, `web/e2e/reader-search.spec.ts`,
`web/e2e/helpers/reader-search.ts`, `docs/features/reader-find/spec.md`, `TODO.md`,
`docs/history/todo-done.md` and the plan directory. It changes no Go.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `countText` (`web/src/reader/find.ts:64-66`) returns `No results` when `query === ""`. The only caller (`web/src/features/readerfind.ts:168`) passes it through while the bar is open | Yes. `find.test.ts` › `countText (W3)` rows `[0,0,""]` and `[0,5,""]` → `No results`. E2E `reader-search.spec.ts:224` (bar just opened) and `:681` (query backspaced to empty), plus both new width tests | pass |
| REQ-2 | Yes. The same branch returns `No results` for `count === 0`, and `<i> of <n>` otherwise as before | Yes. Unit row `[0,0,"x"]`. E2E `:674`, `:686`, `:690`, `:931`, `:1144` and `:1195` (a Write hook leaves zero matches), all moved from `no matches` to `No results` | pass |
| REQ-3 | Yes. `.find-count { min-width: 10ch }` (`style.css:1547`) and the `.reader.compact .find-count { min-width: 6ch }` override deleted, so a compact tile also reserves 10ch at its own font size. The bar is `font-family: var(--mono)`, so `No results` and `999 of 999` are both exactly 10ch | Yes. Two new E2E tests (`reader-search.spec.ts:1348` Focus, `:1363` 3×2 tile) assert left edge and width within ±0.5 px across empty → `1 of 3` → miss. **Measured that they discriminate** (scratch probe on this build, Chromium 1280×720): with the pre-fix CSS injected, the bar at `1 of 3` was 24.6 px narrower in the tile (204.28 → 179.72) and 20.3 px narrower in Focus (286.95 → 266.63), so both tests go red on the old CSS. The query box is not clamped in the tile (67.5 px = its 11ch basis), so the tile test is not vacuous. With the fix, an injected `999 of 999` held the bar at exactly the `No results` width in both hosts (204.28 / 286.95 px) | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` for `find.ts` and `style.css`). No module added, moved or re-layered, so it is still true. The plan has no `## Diagrams` delta | — | pass |

## Build & Tests

E2E tests: pass (963 passed, 0 flaky, `17-e2e.log`) · Daemon tests (race): **FAIL** (`02-test.log`: `internal/server` › `TestWrapperReply_PrintsTheBodyOnlyOnA2xx/200_with_a_body`, `signal: killed`; every other package ok) · Web tests: pass (2761) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; Biome clean) · Contrast: pass (54 pairs × 3 themes, 0 failures) · kb check: pass (610 records, 0 problems) · e2e-lint: clean · features-scope: pass · comment-checks: clean · comment ledger: no added blocks · size-warn: 0 hits · versions: fresh. All read from `$GATES_LOG_DIR`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `cd web && npx vitest run src/reader/find.test.ts` | pass (`18-W1.log`: 30 passed) |
| E1 | `cd web && npx playwright test reader-search.spec.ts` | pass (`19-E1.log`: 50 passed) |
| W2 | `make web-lint` | pass (deduped to the baseline `web-lint` line, `06-web-lint.log`: 338 files checked, no fixes) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The `#102` block moved from `TODO.md` to `docs/history/todo-done.md` with a done line. There are no logs, so there are no `deviation:` or `doc-delta:` lines. `kb ls --status proposed` for reader and reader-find is empty, as expected. The Doc Delta (the count reads `No results` while the query is empty or matches nothing, `<i> of <n>` otherwise, and the bar keeps one width) is true of the code and was measured above. One stale sentence in an accepted ADR is filed as correctness Major 1 `[orchestrator]` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | In Chrome, the opened bar shows `No results` between the query box and ↑, with no blank gap | pass (Chromium) | On this build, Focus, bar just opened: the count's text is `No results` and the element is 67.73 px wide, which is 10ch of the bar's monospace font, so its own text fills the reserved width. The tile reads 61.42 px for the same text. This was measured in Playwright's Chromium, not a desktop Chrome window, so `review-browser` owns the on-screen look |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (no Go changed, no Claude-Code format knowledge in the web diff) |
| 2 | Terminal-output state parsing | pass (n/a) |
| 3 | Blocking hook handler | pass (n/a) |
| 4 | Bare tmux / resize-pane | pass (n/a) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass. The count is not a gauge. Its empty-query branch now names the state (`No results`) instead of rendering blank |
| 7 | Identity on `session_id` | pass (n/a) |
| 8 | Settings trespass | pass (n/a) |
| 9 | Real `claude` outside canary | pass. The new E2E tests fake Claude Code through `envelopedSessionStart` and launch only the stub |

Design tokens: no colour, font or spacing literal added. The `ch` min-width replaces an existing
`ch` min-width. `.find-count` keeps `font-variant-numeric: tabular-nums`, and no `hidden`
toggling changed. Fixture shape: both new tests take the test-scoped `daemon` fixture, as the
plan's **Fixture plan** header says. Repairs: there is no `## Repairs` table. The six
`no matches` → `No results` and two `/^$/` → `No results` edits are the plan's
"Existing tests this breaks". Each one is an exact-text assertion that got stricter, not weaker.

## Issues

### Critical
1. **[daemon-tests]** The `make test-race` gate line is red.
   `TestWrapperReply_PrintsTheBodyOnlyOnA2xx/200_with_a_body` failed with `signal: killed` at
   10.60 s (`02-test.log`; `internal/server/settings_shell_reply_test.go:64` via `:127`, the
   6 s `exec.CommandContext` budget in `runWrapperCapture`). The `internal/server` package ran
   432 s under the full parallel race sweep.
   - **Not caused by this plan.** The branch changes no Go file, and the test is green alone
     (the orchestrator's isolated `-count=3` re-run: `ok … 11.178s`).
   - **It recurs.** The same `signal: killed` under load is recorded in
     `plans/cache-timing/daemon-implementation.md:37` and
     `plans/claude-version-watch/daemon-implementation.md:83`. Its sibling
     `TestWrapperReply_AnAnswerThatNeverComesPrintsNothing` timing flake is in
     `plans/effort/daemon-implementation.md:54`. None of these became a `TODO.md` entry.
   - **What a fix must make true.** The test passes under the full `make test-race` load. Every
     assertion stays: exit 0, stdout byte-for-byte on 2xx and empty otherwise, stderr empty.
   - **Routing.** Whether this rides this web-only `/fix` plan or is split off is the
     orchestrator's routing call. The gate line is red either way, and an isolated re-run does
     not clear it.

### Major
1. **[orchestrator]** `docs/adr/reader-find-query-follows-file-switch.md:20` (accepted) is now
   false about behaviour this plan shipped. Its Consequences say "A re-render that leaves no
   matches shows `no matches` with the bar still open", but the count now reads `No results`
   (`find.ts:65`; E2E `reader-search.spec.ts:1195`). The decision itself (the query is kept, the
   bar stays open) is unchanged and still true; only the quoted string is stale. **What a fix
   must make true:** no record under `docs/` says the count reads `no matches`. That can be an
   amendment to the Consequences wording, which is not the decision, or a superseding note,
   whichever doc upkeep allows for an accepted ADR. This does not block approval.

### Minor

None.

### Notes
1. **[note]** The REQ-3 tests reach the `999 of 999` bound only because the bar is monospace. The
   width tests use `1 of 3` (6 chars) against `No results` (10 chars). In `var(--mono)`,
   `No results` and `999 of 999` are both exactly 10ch, so any reserve below 10ch fails the test,
   and that covers the longest count. If the bar's font ever stops being monospace, the tests
   would no longer cover `999 of 999`.
2. **[note]** The Doc Delta has already been promoted into `docs/features/reader-find/spec.md` by
   `69adc095`, ahead of review. That is normally `doc-reconcile`'s step. The sentence matches what
   shipped (measured above), so `doc-reconcile` should find it already true rather than append it
   again.
