# Review: session-notes

**Plan**: session-notes
**Verdict**: approved
**Cycle**: 4
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Session notes

**Plan**: session-notes
**Part verdict**: approved
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

## Browser review

# Browser review: Session notes

**Plan**: session-notes
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 15485 words (budget 30000)
**Rig**: `make web-build build` at f50b2d5f (clean tree apart from the other reviewers' untracked parts), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, and the E2E stub `claude`. Headless Chromium at 1440×900, throwaway `web/e2e/zz-rb-notes-c4.spec.ts` (6 tests: 2 journeys × 3 storage states), run in the foreground with `--workers=1` over four runs, then deleted. Fixture teardown killed each daemon and ran `tmux -S … kill-server`. Afterwards `pgrep` found no `musterd` or `tmux -S` process, and `git status --porcelain` shows only the other reviewers' parts.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c4`: 0 failed lines. `21-e2e.log` shows 637 passed and `04-web-build.log` is green, so the app I drove is the one that ships.

**Scope.** Since cycle 3 (4f8bce4c) the `web/src` changes are `theme.ts` (`writeThemeHint`'s default storage is now `safeLocalStorage()`) and `features/reader.ts` (all five `window.localStorage` sites now call `safeLocalStorage()`). A grep of `web/src` finds no other raw `localStorage` or `sessionStorage` access outside `storage.ts`. The two inline first-paint scripts in `index.html` and `doc.html` are wrapped in try/catch. I re-measured cycle-3 Major 1 and every path the two changed files reach, in three storage states:
- **normal**.
- **getter throws**: `window.localStorage` and `window.sessionStorage` throw `SecurityError` when read, as Chrome does when site data is blocked.
- **methods throw**: the storage object exists, but every property read on it (`length`, `key`, `getItem`, `setItem`, `removeItem`) throws `SecurityError`, through a Proxy.

The rest of the cycle-2 and cycle-3 matrices is carried forward. The code that renders those cells has not changed, and the smoke cells below re-measured the same numbers.

Hosts: **focus** (the glyph, the anchored panel, the rail card and the reader) and **tiles**. **pop-out `/doc.html`** is N/A for notes, because notes have no `/doc.html` host. States: **data**, **daemon-down** (SIGTERM through `daemon.kill()`, with the banner confirmed `display:block`) and **daemon-down → up**.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 / REQ-11 (cycle-3 Major 1) | focus (anchored) | down → up, getter throws | text typed while down is re-sent on reconnect with no input, and the status clears | pass | after `daemon.restart()` the banner went `display:none`. 1419 ms after the restart, exactly one PUT `{"note":"first while down"}` left with no keystroke. `/api/state` note = `first while down`. `.st` is empty. `pageerror` list `[]`. In cycle 3 this cell failed: no PUT left in 9 s, and the snapshot dispatch threw |
| REQ-10 / REQ-11 | focus (anchored) | down → up, methods throw | same | pass | one PUT `{"note":"first while down"}` 1424 ms after the restart, `/api/state` matches, `.st` is empty, no `pageerror` |
| REQ-10 / REQ-11 | focus (anchored) | down → up, normal | same, plus the draft is kept in storage | pass | while down, `muster.note-draft.1` = `"first while down"`. After the restart, one PUT after 1422 ms, `/api/state` matches, `.st` is empty, no `pageerror` |
| REQ-11 | focus (anchored) | daemon-down, all three | the unsaved status shows in `--warn` | pass | `.npanel .ph .st` reads `unsaved, musterd unreachable`, colour rgb(232,207,90), which equals the resolved `--warn`. Display block, opacity 1, visibility visible, in every state |
| REQ-10 | focus (anchored) | daemon-down, all three | the editor keeps keyboard focus across a render tick | pass | the same TEXTAREA node is still `document.activeElement` after 1.2 s, in every state |
| surfaces (cycle-3 observation) | focus | down → up, all three | the focused terminal's socket reopens after a reconnect | pass | a `TerminalSocketTracker` counted `/ws/terminal/` opens: 1 before the kill, 2 in total after the restart, live count 1 after a further 1.5 s. So there is one live client (§7). In cycle 3 this socket did not reopen in the getter-throws state |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block, opacity 1, text `musterd unreachable — …`, in every state |
| theme hint (theme.ts change) | focus | data, getter / methods throw | picking a theme by pointer applies it with no error | pass | a real click on the `Light` radio in Settings sets `html[data-theme]` = `light`, and body background rgb(243,242,238) after a 1.2 s tick. The hint read throws `SecurityError` (nothing stored), there is no `pageerror`, and after a reload the theme is still `light` (from the daemon pref) |
| theme hint | focus | data, normal | the hint is written for first paint | pass | `muster.theme-hint` = `{"theme":"light","family":"unknown"}`, and `light` after a reload |
| reader memory (reader.ts change) | focus (reader) | data, normal | the last-open file is remembered per session across a session switch and a reload, and forgotten on Remove | pass | opened `TODO.md` in A, switched to B and back: bar `TODO.md`. `muster.reader.1` present. After a reload the bar still reads `TODO.md`. After Remove, no `muster.reader.*` keys are left |
| reader memory | focus (reader) | data, getter / methods throw | the reader opens, renders and acknowledges a write with no error | pass | the reader lists `TODO.md` and `docs/`, and a click renders `TODO`. A routed Write hook for the open file leaves no changed dot (count 0). No `pageerror`. After a switch away and back (the instance is disposed), the reader shows `nothing open — pick a file`, which is expected with no storage to remember in (Note 1). Before this change the constructor's raw `window.localStorage` read threw in the getter state |
| REQ-15 / edge case 9 | focus | data, all three | Remove with another session present takes the removed session out and keeps the survivor | pass | A had a live reader instance, so `forget()` ran. A's card count 0, B's card 1, mainhead `rb-b-…`. `/api/state` sessions `[2]`. No `pageerror` in any state |
| REQ-9 / REQ-6 / REQ-18 | focus | data after Remove, all three | a note on the survivor saves, and the marker shows | pass | typed `b note` + Escape: `/api/state` note = `b note`, rail card `Has a note` count 1. Anchored panel at 314,80.7, size 400×77.8 |
| REQ-18 (tile) | tiles | data, all three | the tile header's note marker shows after a view switch | pass | Meta+\ switches to Tiles: 1 visible tile. The tile's `.mk` is computed `display:flex`, width 11 px. There is no visible `.npanel`. No `pageerror` |
| all other cycle-2 and cycle-3 rows | focus / tiles | all | as in `review.browser.cycle2.md` and `review.browser.cycle3.md` | carried forward | no code that renders them changed since 4f8bce4c |
| all rows | pop-out `/doc.html` | all | — | N/A — notes have no `/doc.html` host. The reader pop-out shares `reader.ts`, but it is not a notes surface, and its storage paths are the same `safeLocalStorage()` calls measured above | |

## Issues

### Critical
None.

### Major
None. Cycle-3 Major 1 is fixed: the cells above show the re-send, the cleared status and the reopened terminal socket in both blocked-storage variants.

### Minor
None.

### Notes
1. **[note]** With storage blocked, the reader's per-session memory (the last-open file and cleared dots) lasts only while its instance does. After a session switch disposes the instance, the reader comes back with `nothing open — pick a file`. This is the expected way to degrade, since there is nowhere to keep the memory, and it is an improvement on cycle 3, where the reader constructor threw in the getter state. No change requested.
2. **[note]** With storage blocked there is no first-paint hint, so a reload starts from the bare `:root` theme until the daemon's prefs arrive. I measured only the settled `light` after the reload, not the first frame. This is by design per the `index.html` comment. No change requested.
3. **[note]** REQ-11's "nothing shows while a save is merely in flight" is still not measured in the running app, for the same reason as cycles 2 and 3: W5 and R8 own it.
4. **[note]** **[e2e-specs]** The new committed journey `blockStorageAndCollectErrors` (notes.spec.ts) covers only the getter-throws variant. That variant is the one that failed, so the journey would have caught Major 1. I measured the methods-throw variant by hand above, and it passes.

## Maintainability review

# Maintainability review: Session notes

**Plan**: session-notes
**Part verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 19994 words (budget 30000)
**Scope**: a delta re-review. Cycle 3 approved this part with no agent-tagged issues. The diff is `git diff 4f8bce4c..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, which touches 2 files: `web/src/theme.ts` (+2/−2) and `web/src/features/reader.ts` (+6/−5). Both changes come from fix commit 6c815fff.

## Delta

| Prior Minor | Fix commit | Verified how | Result |
|---|---|---|---|
| None. Cycle 3 had no Critical, Major or Minor issues. | — | `plans/session-notes/review.maintainability.cycle3.md`: § Critical, § Major and § Minor each read "None." | n/a |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/theme.ts | storage.ts, features/updaterestart.ts, features/notes.ts | yes (web-implementation.md, latest fix attempt, lines 140 and 162) | none | pass |
| web/src/features/reader.ts | storage.ts, features/notes.ts, features/updaterestart.ts, reader/memory.ts | yes (lines 141, 153 and 162) | filelen 686; the reason holds | pass, Notes 1–2 |

The per-file questions, asked of the delta:

1. **Does this already exist?** Nothing new was added. Both files now call the existing `safeLocalStorage()` seam (`storage.ts:101-103`) where they used to touch the global directly. `rg -n "window\.localStorage|window\.sessionStorage|\blocalStorage\b|\bsessionStorage\b" web/src --glob '!*.test.ts'` now finds the globals only inside the seam itself, plus one comment:
   ```
   web/src/storage.ts:1:// The one localStorage seam and safe-JSON helper pair: …
   web/src/storage.ts:98:  return guardedStorage(() => sessionStorage);
   web/src/storage.ts:102:  return guardedStorage(() => localStorage);
   web/src/features/updaterestart.ts:2:// `sessionStorage` handoff, …   (comment)
   ```
   Every storage access in `web/src` outside tests now goes through `storage.ts`.
2. **Does it match its siblings?** Yes.
   - `theme.ts:49`'s new default parameter, `storage: Pick<StorageLike, "setItem"> = safeLocalStorage()`, has the same shape as `updaterestart.ts:102`'s `storage: StorageLike = safeSessionStorage()`.
   - The theme.ts import line stays a single `../storage` import, like `updaterestart.ts:18` and `notes.ts:17`.
   - reader.ts looks up storage at each call site, while `notes.ts:54-55` and `updaterestart.ts:102` look it up once at init. Line 153 of web-implementation.md gives the reason: a storage that is blocked at first read must not stay unavailable. That is a stated reason, so this is fine (see Note 1).
3. **Shared state.** No change. All the storage calls in reader.ts run on the main thread, inside existing synchronous handlers. No new writer was added.
4. **Layer crossed?** No. Neither file is a composition root, and neither imports protocol types into `render/`.
5. **Patterns.** None were introduced.
6. **Size.** Gate log `19-size.log` reports `web/src/features/reader.ts:1: file is 686 lines (threshold 500) (filelen)`. Line 159 of web-implementation.md gives the reason: the file was already over the threshold, and this fix added one import line.
   - Measured: the file is 698 lines on `main`, 685 at `4f8bce4c` and 686 now.
   - The reason holds. Splitting the file only to clear the warning is not what the fix should be (kb:adr/process-size-linters-warn-never-fail).
   - No `dupl` lines appear.
7. **Seams explained?** No new seam was added. The `design:` line at line 162 explains the reuse.
8. **Diagram.** No new module was added and no dependency edge changed.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The `design:` line in web-implementation.md (line 162) has a precedent that does not match the code. It says `reader.ts` looks up storage at each call "like notes.ts does". But `features/notes.ts:54-55` looks it up once at init (`const sessionStore = safeSessionStorage(); const drafts = createDraftStore(safeLocalStorage());`), and so does `updaterestart.ts:102`, through the default parameter of `initUpdateRestart`. `theme.ts:49` is the actual per-call precedent.
   - This does not affect the code: the reason on line 153 holds on its own.
   - It does leave two lookup policies among the storage callers, with nothing saying which one a new caller should pick.
   - No change is asked for.
2. **[note]** Cycle 3's Note 2 still applies. The header comment at `storage.ts:1-5` says "the one localStorage seam and safe-JSON helper pair". The module now also holds `listKeys`, `removeItem` and the two accessor guards, and it is now the only place in `web/src` that touches either storage global.
