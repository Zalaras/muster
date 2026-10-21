# Correctness review: Session notes

**Plan**: session-notes
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 74860 words (budget 30000)

Cycle 4 was granted by the consensus decision `review-cycle-exhaustion-theme-storage`
(kb:adr/notes-blocked-storage-fixed-in-run-cycle-four) to fix cycle 3's browser Major 1. That issue
was a Major, not a Minor, so §0's delta rule does not apply as written. The diff is narrow, though:
`git diff 4f8bce4c..HEAD` changes two non-test source files, `web/src/theme.ts` and
`web/src/features/reader.ts`. It also adds one test case to `web/src/theme.test.ts` and two journeys
to `web/e2e/notes.spec.ts`. The rest is plan logs, the decision files and generated kb indexes. I
read §3–§6 in full over those files and checked them against the decision's scope. Rows for code
the diff does not reach are carried over from cycle 3 (`review.code.cycle3.md`).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-9, REQ-11 … REQ-14, REQ-16 … REQ-23 | Yes. The diff does not touch their code | As in cycle 3 | pass |
| REQ-10 (unsaved text re-sent on load and reconnect) | Yes, now also when storage is blocked. `theme.ts:49`: `writeThemeHint`'s default is `safeLocalStorage()`, so the theme feature's `snapshot` listener (`features/theme.ts:32`, which passes no storage) can no longer throw inside `emit`. That throw was what aborted notes' later re-send listener. `guardedStorage` (`storage.ts:84`) catches the getter's throw and returns a stub whose `setItem` throws, and `writeJson` then catches that | E2E `notes.spec.ts:814` blocks the `localStorage`/`sessionStorage` getters before load, types while musterd is down, restarts it, and asserts the status clears, the text arrives with no keystroke, and no `pageerror`. Red before the fix (`toHaveText("")` timed out on `unsaved, musterd unreachable`) and green in gate 21. W: `theme.test.ts` "does not throw when reading the localStorage global throws" fails with the old `= localStorage` default (web-tests.md: `1 failed`) and is green in gate 05 (2991, +1) | pass |
| REQ-15 / edge case 9 (Remove) | Yes. The reader's `sessionRemoved` listener (`reader.ts:654`) calls `forget(safeLocalStorage(), id)`, and `forget` → `removeItem` swallows the stub's throw. Notes' cleanup in the same emit now runs | E2E `notes.spec.ts:842`: the decision's remove-while-blocked assertion. The removed card leaves, the survivor takes the header with its note intact, `/api/state` no longer has the removed session, and the `pageerror` list is empty. Red before the fix (`["storage is blocked" x3]`) | pass |
| Decision scope | Honoured. All six sites moved: `theme.ts:49` and reader `:158` (ctor), `:215`/`:217` (`commitMemory`), `:222` (`handleStorage`) and `:654` (`sessionRemoved`). `rg -n '\blocalStorage\b\|\bsessionStorage\b' web/src --glob '!*.test.ts'` finds only `storage.ts:1` (a comment), `:98`, `:102` and a comment at `updaterestart.ts:2`, and `rg 'window\.localStorage'` finds nothing. **No bus change**: the diff touches no file other than these two under `web/src` outside tests. The inline first-paint scripts (`index.html:17`, `doc.html:12`) were already in try/catch | — | pass |
| DIAG | kb:diagram/web-components, named by `kb for` for both files. Its prose (lines 36–38: "`localStorage` is reached through one seam, `storage.ts`, … by reader memory, the first-paint theme hint and unsaved note drafts") and its edges `reader → storage` and `theme → storage` are now more exactly true than before. No module or edge was added | — | pass |

## Build & Tests

E2E tests: pass (637, full: gate 21 ran `make e2e-run SPECS=''`; `notes.spec.ts` 23/23, both blocked-storage journeys included) · Daemon tests (race): pass (27 packages ok, 0 FAIL) · Web tests: pass (2991 in 104 files) · Render tests: pass (407) · Daemon build: pass · Web build: pass (built in 1.95s) · Lint: pass (golangci-lint 0 issues; biome 406 files clean). All read from $GATES_LOG_DIR (`gates-session-notes-c4`, 0 failed lines). The diff repairs no flaky spec, so no soak was owed. e2e-specs ran a 5× soak of `notes.spec.ts` (115 passed) anyway.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D9 | `make test` | pass (02-test.log, deduped to test-race: 27 packages ok, 0 FAIL) |
| D10 | `make lint` | pass (03, 0 issues) |
| D11 | `go build ./...` | pass (01, empty) |
| D12 | `make check-render-fixtures` | pass (06, 105 scenarios up to date) |
| W7 | `make web-test` | pass (05, 2991 passed) |
| W8 | `make web-build` | pass (04, built in 1.95s) |
| W9 | `make web-lint` | pass (09, 406 files clean) |
| W10 | `make contrast` | pass (10, 54 pairs × 3 themes, 0 failures) |
| R14 | `make render-test` | pass (08, 407 passed) |
| E13 | `make e2e` | pass (21, 637 passed) |
| K1 | `make check-kb` | pass (14, 628 records, 0 problems) |
| gates | render-lint, e2e-lint, e2e-honest, features-inventory, versions, features scope, comments, comment ledger | pass (07, 15, 13, 11, 12, 16, 17, 18) |
| gates | size / e2e-level | WARN only. 19 is review-maintainability's (`features/reader.ts` 686 lines was already over the threshold, and the fix added one import line). 20 is the census, and it has no `notes.spec.ts` line |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The new kb:adr/notes-blocked-storage-fixed-in-run-cycle-four is `proposed`, carries `refs: plan:session-notes` and describes what shipped: six sites on `safeLocalStorage()`, the bus unchanged, the `rg` check true, and the regression journey covering reconnect and Remove. With it, `kb ls --feature notes --status proposed` lists eight notes ADRs. Both cycle-4 log entries say `doc-delta: none`, and that holds: no feature spec or `docs/protocol.md` sentence describes behaviour under blocked storage (`rg -i 'storage\|blocked'` over the theme, reader and notes specs finds only theme's `web:` glob). No log carries a `deviation:` line |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | No `any` in new web code | pass | The diff's `+` lines in `theme.ts`, `reader.ts`, `theme.test.ts` and `notes.spec.ts` contain no `any` |
| V2 | Neutral tokens only; unsaved uses `--warn`, never `--amber` | pass | Carried from cycle 3. The diff has no CSS |
| V3 | Matches header option A, marker option C, `panel.html` | pass (structure) | Carried from cycle 3. The diff has no markup |
| V4 | No part of a note reaches Claude Code | pass | Carried from cycle 3. The diff touches no launch, hook or `internal/claudecode` path |
| V5 | Rendered through the reader's sanitizing renderer | pass | Carried from cycle 3. The `reader.ts` change is to storage arguments only |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The diff has no Go code |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. Not touched |
| 4 | tmux on a dedicated socket; no `resize-pane` | pass. Not touched. The new journeys use the `daemon` fixture's private socket |
| 5 | No payload logging | pass. Not touched |
| 6 | Empty-gauge honesty | pass. Not touched |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass. The new journeys launch through `launchNoted`, which uses the E2E stub |

## Delta (cycle 3 issue verified)

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 browser Major 1 `[web-impl]` "with `window.localStorage` throwing, a note typed while musterd was down is not re-sent on reconnect" | `6c815fff` (fix), `c05653b0` (unit), `f0854f6b` (E2E) | Diff read; see the REQ-10, REQ-15 and scope rows. The fix took the reviewer's first branch ("`writeThemeHint`'s default goes through `safeLocalStorage()`"), not bus isolation, as the decision chose. It also closed the five reader sites the reviewer's one line would have missed. The regression journey the browser review's note 3 asked for exists, with the decision's Remove assertion beside it. Both are red before the fix and green in gate 21. Whether the focused terminal's `/ws/terminal/1` now reopens in this state, a symptom with the same cause, is review-browser's to measure |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `test-specs.md`'s header line `**Live run**: 21/21 passing` was not updated with `**Tests created**: 23`. The `## Fix Attempt 4` section records `23 passed`, and gate 21 agrees.
2. **[note]** The new `theme.test.ts` case ends with `Reflect.deleteProperty(globalThis, "localStorage")` rather than restoring the property it replaced. It is the file's last case, and Vitest isolates files, so nothing reads the global afterwards. A later case added below it would find no `localStorage`.
3. **[note]** The reader's memory paths under blocked storage (constructor, `commitMemory`, `handleStorage`) have no test of their own. Only `forget` is exercised, through the Remove journey. web-tests.md gives the reason: they cannot be reached as units without the DOM. Each one ends in `readJson`/`writeJson`, which tolerate the stub's throws and are unit-covered.
4. **[note]** The new ADR lists `features: [notes, theme, reader]`, and theme and reader are still under **Touches**. No `deviation:` or `doc-delta:` line names their specs, and no sentence in their specs changed, so this is not the "promote to Features" Minor. The orchestrator may still prefer to promote them when the ADR is accepted.
5. **[note]** The review pack is 74,860 words against a 30,000 budget.
