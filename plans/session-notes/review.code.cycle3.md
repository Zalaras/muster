# Correctness review: Session notes

**Plan**: session-notes
**Verdict**: approved
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
