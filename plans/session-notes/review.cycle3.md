# Review: session-notes

**Plan**: session-notes
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Session notes

**Plan**: session-notes
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 74649 words (budget 30000)

Delta re-review. Cycle 2 left only Minors open for pipeline agents. The diff `206717da..HEAD` touches
`web/src/storage.ts`, `web/src/features/notesdrafts.ts`, `web/src/render/CLAUDE.md` and
`internal/server/CLAUDE.md`, plus the two impl logs and the plan's archived review files. Every
source change is inside a Minor's stated scope, so §3–§6 were not re-read. The requirement,
reviewer-verified and hard-rule rows below are carried over from cycle 2 (`review.cycle2.md`) and
re-checked only where the delta reaches them. I also checked cycle 2's orchestrator Major 1, which
`9d3b350d` addressed.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-8, REQ-10 … REQ-23 | Yes. Unchanged since cycle 2; the delta touches none of their code | As in cycle 2 | pass |
| REQ-9 | Yes. `storedIds` is now `listKeys(storage).flatMap(idOf)`. `listKeys` returns `[]` when storage throws, the same as the removed inline loop, and `get`/`pending` still read `typed` first | W4, `notesdrafts.test.ts:142` (a `throwingStorage()` whose `length`/`key` throw: `pending()` yields the typed entry, then `[]` after `drop`), `notessave.test.ts` refusing-storage block, E3–E5 | pass |
| DIAG | kb:diagram/web-components. Storage is still reached through the one seam, `storage.ts`, and `listKeys` sits there beside `readJson`/`writeJson`/`removeItem`. No module or edge was added. The daemon diagrams are untouched by the delta | — | pass |

## Build & Tests

E2E tests: pass (635, full: the gate ran `make e2e-run SPECS=''`; `notes.spec.ts` 21/21) · Daemon tests (race): pass (27 packages ok, 0 FAIL) · Web tests: pass (2990 in 104 files) · Render tests: pass (407) · Daemon build: pass · Web build: pass (built in 1.92s) · Lint: pass (golangci-lint 0 issues; biome 406 files clean). All read from $GATES_LOG_DIR (`gates-session-notes-c3`). The diff repairs no flaky spec, so no soak was owed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D9 | `make test` | pass (02-test.log, deduped to test-race: 27 packages ok, 0 FAIL) |
| D10 | `make lint` | pass (03-lint.log, 0 issues) |
| D11 | `go build ./...` | pass (01-build.log, empty) |
| D12 | `make check-render-fixtures` | pass (06, 105 scenarios up to date) |
| W7 | `make web-test` | pass (05, 2990 passed) |
| W8 | `make web-build` | pass (04, built in 1.92s) |
| W9 | `make web-lint` | pass (09, 406 files clean) |
| W10 | `make contrast` | pass (10, 54 pairs × 3 themes, 0 failures) |
| R14 | `make render-test` | pass (08, 407 passed) |
| E13 | `make e2e` | pass (21, 635 passed) |
| K1 | `make check-kb` | pass (14, 627 records, 0 problems) |
| gates | render-lint, e2e-lint, e2e-honest, features-inventory, versions, features scope, comments, comment ledger | pass (07, 15, 13, 11, 12, 16, 17, 18) |
| gates | size / e2e-level | WARN only (19 is review-maintainability's; 20 is the census, with no `notes.spec.ts` line) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Seven `proposed` notes ADRs carry `refs: plan:session-notes` (`kb ls --feature notes --status proposed`). No log carries a real `deviation:` line. `TODO.md` #95 is ticked at Completion, per the plan. Cycle 2's orchestrator Major 1 is closed by `9d3b350d`: design-system § Note panel now says that in a narrow panel the title gives way first, then the status ellipsizes with its full text in the hover `title`, so the controls stay in the box. `doc-delta.md` § "Amended from web-implementation.md § Fix Attempt 1 (review cycle 1)" names the notes-spec unsaved-status sentence (`spec.md:49`) for doc-reconcile to qualify. Both statements match `style.css:4814-4830` (`.who` `flex: 0 8 auto`, `.st` `flex: 0 1 auto; min-width: 0; text-overflow: ellipsis`) and `notespanel.ts:189` (`refs.status.title = view.status`). Both cycle 3 log entries say `doc-delta: none`, and that holds: `listKeys` and the CLAUDE.md edits change no behaviour a doc describes |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | No `any` in new web code | pass | Cycle 2 evidence holds. The delta's `+` lines in `storage.ts`/`notesdrafts.ts` contain no `any` |
| V2 | Neutral tokens only; unsaved uses `--warn`, never `--amber` | pass | Carried from cycle 2. The delta has no CSS |
| V3 | Matches header option A, marker option C, `panel.html` | pass (structure) | Carried from cycle 2. Pixel match is review-browser's |
| V4 | No part of a note reaches Claude Code | pass | Carried from cycle 2. The delta touches no launch, hook or `internal/claudecode` path |
| V5 | Rendered through the reader's sanitizing renderer, never raw HTML | pass | Carried from cycle 2. The delta has no render code |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The delta has no Go code |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass. Not touched |
| 4 | tmux on a dedicated socket; no `resize-pane` | pass. Not touched |
| 5 | No payload logging | pass. Not touched |
| 6 | Empty-gauge honesty | pass. Not touched |
| 7 | Identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 correctness Minor 1 `[daemon-impl]` server `CLAUDE.md` Owns omits `note.go`, Features omits `notes` | `05fe0caa` | Diff read. The Owns enumeration now ends "`effort.go` (effort-warning dismiss), `note.go` (note)", and Features reads "… lifecycle, notes, rail …". Only the hand-written lines changed; the trailer is untouched, and K1 is green |
| cycle 2 correctness Minor 2 `[web-impl]` render `CLAUDE.md` omits the note builders and `notes` | `0551d4ea` | Diff read. Owns now names "the session note (`notes.ts`, `notespanel.ts`)" ahead of "with `anchored.ts` placing those overlays", which is true: `features/notes.ts:5` imports `placeAnchored` for the panel. Features now includes `notes`. Three gotcha lines were trimmed to stay inside the 400-word budget (the fix log gives the reason). Each trimmed line is still true: `dead.ts`'s two hosts are still both named, and the reader still rebuilds only on a signature change |
| cycle 2 maintainability Minor 1 `[web-impl]` `notesdrafts.ts` guards key listing itself | `0551d4ea` | Diff read. `storage.ts:66` `listKeys` walks `length`/`key(i)` in one try/catch, skips `null` keys and returns `[]` on a throw. It sits beside `readJson`/`writeJson`/`removeItem` and takes the same `Pick<…>` parameter shape. `notesdrafts.ts` has no try block now (`rg "try \{"` finds none). Behaviour is unchanged: a throwing storage lists nothing, which `notesdrafts.test.ts:142` exercises through a `throwingStorage()` whose `length` throws (W7 green) |
| cycle 2 correctness Major 1 `[orchestrator]` narrow-panel status ellipsis missing from docs | `9d3b350d` | See the DOC row |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** `web/src/render/CLAUDE.md`'s Owns line now has one closing parenthesis too many. The fix closed the rail-overlay list at "`groupdialogs.ts`)" but kept the old list's closing ")" after "filling a select's options". Every statement in the line is still true.
2. **[note]** `listKeys` has no unit case of its own in a `storage` test; the impl log handed one to wave 2, and it was not written. Its one behaviour (a throwing storage lists nothing) is covered through the draft store at `notesdrafts.test.ts:142`, and foreign keys are filtered out by `idOf` in the existing cross-window cases. No coverage gap at the behaviour level.
3. **[note]** For review-maintainability's earlier note 5: `internal/server/CLAUDE.md` still does not name `nullable.go`. No Minor asked for it.
4. **[note]** The review pack is still 74,649 words against a 30,000 budget.

## Browser review

# Browser review: Session notes

**Plan**: session-notes
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 15485 words (budget 30000)
**Rig**: `make web-build build` at ae9622b8 (clean tree apart from the other reviewers' untracked parts), `bin/musterd` per test via `helpers/fixtures.ts` `daemon`: a fresh scratch data dir under `$TMPDIR/muster e2e-<owner>-…` (with a space), `-S <dataDir>/tmux.sock`, and the E2E stub `claude`. Headless Chromium at 1440×900, throwaway `web/e2e/zz-rb-notes-c3.spec.ts` run in the foreground with `--workers=1` (4 tests, three runs), then deleted. Fixture teardown killed each daemon and ran `tmux -S … kill-server`.

Gates log `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-session-notes-c3`: 0 failed lines. `21-e2e.log` shows 635 passed and `04-web-build.log` is green, so the app I drove is the one that ships.

**Scope.** Since cycle 2 (206717da) the only `web/src` changes are `storage.ts` (the new `listKeys`) and `features/notesdrafts.ts` (`storedIds` now calls it). `storedIds` feeds `pending()`, which three paths use: the snapshot handler (re-send on load and reconnect, and dropping drafts of sessions that no longer exist), `flushAll` on `pagehide` and `visibilitychange`, and nothing else. I re-measured every cell those paths reach, in three storage states: **normal**, **storage blocked, getter throws** (`window.localStorage` throws on access, the way Chrome behaves when site data is blocked), and **storage blocked, methods throw** (the object exists, but `length`, `key`, `getItem`, `setItem` and `removeItem` all throw). After that I ran a smoke pass over the cycle-2 geometry and visibility cells to confirm they still hold. The rest of the cycle-2 matrix (`review.browser.cycle2.md`) is carried forward unchanged, because no code that renders it has changed.

Hosts: **focus** (the glyph, the anchored and popped panel, and the rail card) and **tiles**. **pop-out `/doc.html`** is N/A, because notes have no `/doc.html` host. States: **no data**, **data**, and **daemon-down** (SIGTERM through `daemon.kill()`, with the banner confirmed `display:block`).

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 (stale drafts) | focus | no data, normal storage | on load, a stored draft for a session that does not exist is dropped. Keys that are not drafts are left alone | pass | seeded `muster.note-draft.9999`, `muster.note-draft.abc` and `muster.unrelated-note-x`, then reloaded. `9999` is removed. `abc` (not an integer id) and the foreign key are kept. Session 1's `/api/state` note stays `null`, so nothing was sent for a bad key. No `pageerror` |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down, normal storage | the typed text is kept in local storage per session, and the unsaved status shows in `--warn` | pass | `localStorage` `muster.note-draft.1` = `"kept across page close"`. `.st` reads `unsaved, musterd unreachable`, colour rgb(232,207,90) = `--warn`, display block, opacity 1. Banner `display:block` |
| REQ-10 | focus | daemon-down → up, normal storage | a draft kept by a page that is gone is re-sent by the next page load with no action | pass | the tab was closed while musterd was down (its `pagehide` keepalive PUT failed), then `daemon.restart()` and a new tab in the same context. `/api/state` note = `kept across page close`. `muster.note-draft.1` removed and the other keys untouched. Glyph `ng has`, rail `Has a note` count 1. After a reload the panel shows the text. No `pageerror` in either tab. This is the path `listKeys` now serves |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down → up, storage blocked (methods throw) | text kept in the open page, unsaved status, re-sent on reconnect, status clears | pass | `.st` `unsaved, musterd unreachable` in `--warn`. Editor value `first while down`, the same TEXTAREA still `activeElement` after 1.2 s. After restart the PUT `{"note":"first while down"}` leaves with no action, `/api/state` matches, and `.st` is empty. No `pageerror`, so the `listKeys` catch path holds |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down, storage blocked (getter throws) | text kept, unsaved status in `--warn` | pass | `.st` `unsaved, musterd unreachable`, rgb(232,207,90). Editor keeps `first while down` and focus across 1.2 s |
| REQ-10 / REQ-11 | focus (anchored) | daemon-down → up, storage blocked (getter throws) | the kept text is re-sent on reconnect with no action, and the status clears | **FAIL** | the banner goes `display:none`, but no PUT leaves in 9 s. `/api/state` stays `first` and `.st` still reads `unsaved, musterd unreachable` with musterd reachable. A `pageerror` is thrown from the snapshot dispatch (Major 1). One more keystroke sends `first while down!` and clears the status |
| REQ-9 | focus | data, storage blocked (both) | the first save reaches the daemon | pass | PUT `{"note":"first"}` and `/api/state` = `first` in both variants |
| REQ-6 | focus | no data → data | glyph muted, then foreground; keyboard focus kept across a tick | pass | `ng`, rgb(166,171,188) = `--fg-dim`, opacity 0.55, then `ng has`, rgb(232,230,225) = `--fg`. `activeElement` stays `Note` after 1.2 s; Enter opens the panel |
| REQ-7 | focus (anchored) | no data | panel under the glyph | pass | glyph 314–327 × 63.7–76.7; panel 314–714 × 80.7–152.5 |
| REQ-12 / REQ-14 | focus (popped) | data | Pop out lands inside the slot | pass | panel 1056–1416 × 119.4–419.4, inside `section.main` 300–1440 × 95.4 (mainhead bottom)–900 |
| REQ-17 | tiles | data | the popped panel is hidden in Tiles and comes back at the same rectangle | pass | Tiles: `[hidden]`, computed `display:none`. Back in Focus: 1056,119.4 360×300 |
| REQ-18 | focus (rail card) | data | marker shown | pass | `.mk` computed display flex |
| REQ-19 | focus (rail card) | data | the hover opens a read-only tooltip | pass | at 600 ms: display block, `pointer-events:none`, text `Note read-only hello body`, box 277–577 × 181.8–286.8 |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` display block in every daemon-down cell |
| all other cycle-2 rows | focus / tiles | all | as in `review.browser.cycle2.md` | carried forward | no rendering code changed since 206717da. The smoke rows above re-measured the same numbers |
| all rows | pop-out `/doc.html` | all | — | N/A — notes have no `/doc.html` host | |

## Issues

### Critical
None.

### Major
1. **[web-impl]** With browser storage blocked so that reading `window.localStorage` throws, a note typed while musterd was down is not re-sent when musterd comes back. The panel keeps saying `unsaved, musterd unreachable` after the banner has cleared, and the text reaches the daemon only on the next keystroke. The cause is older than this plan and is not the `listKeys` change: `web/src/theme.ts` `writeThemeHint(hint, storage = localStorage)` evaluates the `localStorage` global in its default parameter. The theme feature's `snapshot` listener therefore throws (stack: `Mc` ← theme `a()` ← `emit` ← `onSnapshot`), and the throw aborts the later `snapshot` listeners in the same emit, notes' re-send among them. In the same state, the focused terminal's `/ws/terminal/1` was not reopened after the reconnect either. A fix must make the snapshot reach the notes handler when storage is blocked: `writeThemeHint`'s default goes through `safeLocalStorage()`, or the bus isolates a throwing listener, or both. The plan's "wrap every read and write" (Technical Context) and REQ-10's "re-sent on reconnect" then hold in this state. The fix is one line outside this plan's diff, so the orchestrator may route it to `/fix` rather than this run.

### Minor
None.

### Notes
1. **[note]** REQ-11's "nothing shows while a save is merely in flight" is still not measured in the running app. A request cannot be held open without a network stub, so W5 and R8 own it (as in cycle 2).
2. **[note]** A draft key whose suffix is not an integer (`muster.note-draft.abc`) is ignored and never cleaned up. It is harmless (it is never sent and nothing shows) and the behaviour is the same as before `listKeys`. No change requested.
3. **[note]** **[e2e-specs]** No committed spec or render test drives blocked storage, so Major 1 could not fail any gate. The regression test for the fix needs a journey that blocks the `localStorage` getter before load, types while musterd is down, restarts it, and asserts the PUT with no further input.

## Maintainability review

# Maintainability review: Session notes

**Plan**: session-notes
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 19994 words (budget 30000)
**Scope**: delta re-review. Cycle 2's only open agent-tagged issue was a Minor. The diff is `git diff 206717da..HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, which touches 4 files: `web/src/storage.ts`, `web/src/features/notesdrafts.ts`, and the hand-written prose of `internal/server/CLAUDE.md` and `web/src/render/CLAUDE.md`.

## Delta

| Prior Minor | Fix commit | Verified how | Result |
|---|---|---|---|
| Minor 1: `notesdrafts.ts` `storedIds` guarded key listing itself, the only storage access outside `storage.ts` | 0551d4ea | `web/src/storage.ts:66-77` has a new `listKeys(storage: Pick<KeyedStorage, "length" \| "key">): string[]`. It sits beside `readJson`, `writeJson` and `removeItem`, and uses the same `Pick<…>` parameter shape they do. A throwing storage still returns `[]`, so behaviour is unchanged. `notesdrafts.ts:34-36` `storedIds` is now one line, `listKeys(storage).flatMap((key) => idOf(key) ?? [])`, and has no try block of its own. Re-running the cycle-2 loop now names only the owner: `for f in $(rg -l "try \{" --glob '!*.test.ts' web/src); do rg -q -i storage "$f" && echo "$f"; done` → `web/src/storage.ts`. `rg -n "storage\.length\|\.key\(" web/src --glob '!*.test.ts'` finds only `storage.ts:69-70`. The `design:` line in web-implementation.md Fix Attempt 3 says why the shape was chosen. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/storage.ts | features/notesdrafts.ts, reader/memory.ts, theme.ts, features/updaterestart.ts | yes (Fix Attempt 3) | none | pass, Note 2 |
| web/src/features/notesdrafts.ts | storage.ts, reader/memory.ts | yes (Fix Attempt 3) | none | pass, Note 1 |
| internal/server/CLAUDE.md | — (hand-written Owns and Features lines only) | doc-only | — | pass |
| web/src/render/CLAUDE.md | — (hand-written prose only) | doc-only | — | Note 3 |

The size log `19-size.log` has 10 hits. None of them is on a file in this delta, and there are no `dupl` lines. The cycle-2 size notes carry over unchanged.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** In `features/notesdrafts.ts:17`, `idOf(key: string | null)` still accepts `null` and checks for it with `key === null`. Now that `listKeys` filters out null keys (`storage.ts:71`), that branch can never run. Narrowing the parameter to `string` would drop the dead branch. This is taste, so no change is asked for.
2. **[note]** The header comment in `storage.ts:1-5` still calls the module "the one localStorage seam and safe-JSON helper pair". It now holds four helpers and the accessor guards. `listKeys` has no doc comment, while `readJson` and `removeItem` each have one. Neither point is a defect.
3. **[note]** For review-work, about doc truth in `web/src/render/CLAUDE.md`:
   - The new Owns text closes the `(railsections.ts …` parenthesis after `groupdialogs.ts`. The `)` that ends the sentence after "options" now has no opening partner.
   - The trims made to stay within the 400-word budget dropped where `reader.ts` stores its signature ("in the container's `dataset`"). That was a locator a reader could use.
