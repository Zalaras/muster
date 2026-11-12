# Correctness review: claude-tmp-files

**Plan**: claude-tmp-files
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 67244 words (budget 30000)

This is a delta re-review over the cycle-2 review commit ef28dc19 to HEAD 8988afec (four commits: 0d94e5b9 docs, 2b3ee0ff fix, 6f35cdd9 test, 8988afec chore). The only shipped source file the diff touches is `web/src/style.css`; the rest are render specs and helpers, ADRs, generated indexes, `TODO.md` and plan files. §1–§2 were run in full. §3–§6 cover the files the diff touches.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1–REQ-8, REQ-10–REQ-13 | Yes, unchanged since cycle 2: the delta touches no daemon, protocol, `render/` or `features/` code | Yes, as in cycle 2 | pass |
| REQ-9 (nav section, per the Views *Amended* note now citing kb:adr/reader-nav-scrolls-as-one-column) | Yes. `.rnav .tree, .outline, .plan-slot, .scratch-rows { flex: none }` (`web/src/style.css:2057-2062`) with no per-section `overflow`, `min-height` or 40% cap. `.rnav` keeps `overflow: hidden auto` (`style.css:1773`), which makes it the only scroller. An empty `.scratch-rows` therefore takes its natural 0 px. | Yes. `web/render/reader-scratch.spec.ts` covers Focus 900/600/360 and the compact 3×2 tile at 600/450, folded and unfolded, on the large fixture. It checks that every section has clientHeight == scrollHeight and no `overflow-y` auto/scroll, that `.rnav` scrolls, that at the nav's end the last tree row and last outline row are inside the nav, that at the top the summary row is inside it, and that a folded section is a 0 px strip. An unfolded session with nothing to list is also a 0 px strip. `web/render/reader.spec.ts` checks that the #67 large-tree case reaches each last row by scrolling the nav. | pass |
| REQ-9 bare row age | Unchanged | Unchanged | pass |
| #67 folder path wraps (prior Minor 1) | Yes. The clamp is gone and `.rnav .hd .dir` is `min-width: 0; overflow-wrap: anywhere` (`style.css:1811-1814`). | Yes. "the Files header's folder path wraps rather than clamping" runs in Focus and in a tile: no line-clamp 1, no ellipsis, not clipped, height over 1.5 lines. | pass |
| DIAG | `go tool kb for web/src/style.css` names only `kb:diagram/web-components`, a module diagram. CSS section heights are not depicted, so it is unaffected. | — | pass |

## Build & Tests

All results below were read from `$GATES_LOG_DIR` (…/gates-claude-tmp-files-c3, 0 failed lines). That run started at 16:40. HEAD 8988afec was committed at 16:40:50 and is plan files only, so the tree the gates ran is the shipped one.

- **E2E**: pass, 272 tests scoped to 27 files (`21-e2e.log`, includes `reader-scratch.spec.ts`). The full sweep runs at Completion.
- **Daemon tests (race)**: pass. `02-test.log`, and `22-D1.log` every package `ok`, no `FAIL`.
- **Web tests**: pass, 112 files and 3267 tests (`05-web-test.log`).
- **Render**: pass, 499 tests (`08-render-test.log`).
- **Daemon build**: pass (`01-build.log` empty).
- **Web build**: pass (`04-web-build.log`).
- **Lint**: pass. `03-lint.log` reads "0 issues."; `09-web-lint.log` reads "No fixes applied.".
- **Size**: the WARN lines (`19-size.log`, 11 hits) are review-maintainability's.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`22-D1.log`) |
| D2 | `go build ./...` | pass (deduped to the gates' build line, `01-build.log`) |
| D3 | `make lint` | pass ("0 issues.", `03-lint.log`) |
| D5 | `make check-render-fixtures` | pass ("render fixtures up to date (116 scenarios)", `06-render-fixtures.log`) |
| W1 | `make web-build` | pass (`04-web-build.log`) |
| W2 | `make web-test` | pass (3267/3267) |
| R1 | `make render-test` | pass (499 passed) |
| E1 | `make e2e` | pass, scoped (272 passed); the full sweep runs at Completion |
| gate | web-lint / contrast (54 pairs ×3, 0 failures) / e2e-lint / render-lint / kb check (698 records, 0 problems) / versions / comments / comment-ledger / features / e2e-honest / features-inventory | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

DOC detail:
- The new `docs/adr/reader-nav-scrolls-as-one-column.md` is `proposed`, `refs: plan:claude-tmp-files` and `supersedes: [reader-nav-sections-shrink-without-floor]`. Its Decision matches the CSS: natural height, `.rnav` the one scroller.
- The withdrawn `reader-nav-too-short-for-fixed-rows-out-of-scope` record and its `proposed-backlog.md` entry are gone. Nothing outside the `review*` archives still names it (`rg`).
- `doc-delta.md`'s new reader line ("scrolls as one column … every row is reachable by scrolling the nav in every host") matches the CSS and the render measurements. The pop-out shares the non-compact rules and is not measured separately.
- `docs/features/reader/spec.md` carries no sentence about per-section shrink or scroll, so nothing needs a stops-being-true line.
- No `docs/`, `README.md` or `web/**/CLAUDE.md` sentence claims per-section scrolling (`rg`).
- Fix Attempt 4 records no `deviation:` line. That is correct: the change is the developer's decision, carried by its own ADR, and the #67 wrap is restored, not changed.
- The `TODO.md` Tweak was filed at the developer's request, symptom plus expected behaviour.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | the delta's TS is render-test helpers and specs only, with no `any` |
| V2 | summary row, chips, `tmp` badge and row ages match the mockup | pass (unchanged) | The delta changes only section heights and the `.dir` clamp. Measuring the look on screen is review-browser's job. |
| V3 | `scratchpad_dir` read only in `internal/claudecode` | pass | no Go file in the delta |
| V4 | no new watcher or poll | pass | no `.ts` source file in the delta |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: no Go in the delta |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: untouched |
| 4 | tmux via `-L muster` / sizing | pass: untouched |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: chip logic untouched; an empty scratch area is now 0 px, not a blank strip |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary | pass |

Design tokens: the CSS hunk removes rules and adds `flex: none` only. It adds no literal and no font. `.plan-slot` and `.scratch-rows` are never toggled through `hidden` (`rg` over `web/src`), so they need no `[hidden]` companion.

## Delta

My cycle-2 part had no Critical and no Major of its own. The critic struck the one Major, and the orchestrator says it applied that fix before the merge. The Minor below is listed for the orchestrator's check, not re-ruled.

| Prior issue (id) | Status | Fix commit | Verified how |
|---|---|---|---|
| Minor 1 `web/src/style.css:.rnav .hd .dir:unlogged-clamp-all-hosts` `[web-impl]` | resolved (orchestrator's to confirm) | `2b3ee0ff` | Diff read: the clamp, `overflow: hidden` and `-webkit-box` are removed, leaving `min-width: 0; overflow-wrap: anywhere`. Two render tests (Focus and tile) assert the path wraps and is not clipped. |

The prompt carries no `counter:` or `refute:`.

Test honesty: the render repairs replace assertions that pinned the superseded per-section model (`overflow-y: auto` on tree, outline and scratch, the 22 px floor, the 40% cap, the one-line clamp). Each is replaced by its opposite under the new ADR, not deleted. Every replacement guards against passing vacuously:
- `expectSectionsNaturalHeight` requires `.tree` and `.outline` to be present.
- `reader.spec.ts` asserts the nav really overflows before it checks reach.
- The unfolded cases assert three scratch rows and a non-zero `.scratch-rows`.

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** `docs/adr/reader-nav-scrolls-as-one-column.md` has `tests: []`, but the render cases in `web/render/reader-scratch.spec.ts` ("every section takes natural height and the nav scrolls …") now guard the decision. The orchestrator may want to name the spec there when it flips the ADR at Completion. Nothing is requested here.
2. **[note]** For review-browser: the render harness measured the new layout in Focus and in the 3×2 tile. The pop-out was not measured separately (Fix Attempt 4 says it shares the non-compact rules). Tab order and keyboard focus on a row lower in the now-scrolling nav are observed properties outside my scope.
3. **[note]** For doc-reconcile: the reader spec's "the plan slot pinned on top" stops-being-true line is still the right edit. The new natural-height sentence is the only nav-layout claim it needs to add.
