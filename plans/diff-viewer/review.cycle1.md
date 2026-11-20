# Review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: diff-viewer

**Plan**: diff-viewer
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 57095 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 button appears/disappears, ended session too | Yes (`features/diff.ts` 5 s poll, no `alive` check) | E1, E14, R1 | pass |
| REQ-2 open in place, close by button / `Close diff viewer` / Escape / segment | Yes (`focus.ts` mountViewer; segment handler calls `diff.close`) | E4, E5, E6, R23 | pass |
| REQ-3 scopes, default scope, base stated | Yes (`gitdiff.resolveBase`, `pickScope`) | D5, E7, E8, R7 | pass |
| REQ-4 staleness bar, Refresh keeps scroll/ticks/comments | Yes (`diffviewer.counts` / `applyLatest` / `refresh`) | E9, E10, W5 | pass |
| REQ-5 comments kept across reload/restart/window | Yes | E12, D9 | pass |
| REQ-6 ticks kept; a changed change reads unticked | Yes (content-keyed `changeKey`) | E13, W7 | pass |
| REQ-7 comments follow code; outdated | Yes (`diffplace.ts`) | E15, W1, W2, R20 | pass |
| REQ-8 lifetime: ended, resume, restart, Remove | Yes | E14 (diff-review), D8 (INV test), D13 | pass |
| REQ-9 flush right, row no taller, absent when clean / not a repo | Yes | R1, R2, R4, E2 | pass |
| REQ-10 no segment selected while open | Yes (`clearSurfaceSegmentSelection`) | R5, E4 | pass |
| REQ-11 file sections, rename, binary note, Files list, `No changes` | Yes | R6, R7, E7 | pass |
| REQ-12 Unified / Split, view remembered | Yes | R8, R9, R10 | pass |
| REQ-13 word highlight | Yes (`diffwords.ts`) | W8, R11 | pass |
| REQ-14 Review after/before flip, placeholders | Yes | R12 | pass |
| REQ-15 change and file ticks, progress, Reset | Yes | R13-R15, E13 | pass |
| REQ-16 change map | Yes | R16 | pass |
| REQ-17 `+`, drag, shift-click, box heading | Yes | R17, E12 | pass |
| REQ-18 card, Resolve / Reopen / Delete | Yes | R18, E12 | pass |
| REQ-19 Comments (n), Resolved (n) closed, jump unfolds | Yes | R19, W3 | pass |
| REQ-20 Review keys, Escape order | Yes | R21-R23 | pass |
| REQ-21 marking distinct in both themes | Yes (6 tokens in each of the 3 theme blocks) | R24, `make contrast` | pass |
| REQ-22 terminal refits when the row changes | Yes (ResizeObserver on the main slot) | E16 | pass |
| REQ-23 no tile button; terminal in tile | Yes | R27, E17 | pass |
| REQ-24 no comment in an issue snapshot, nothing logged | Yes (snapshot is an allow-list struct; logs carry only `err` + id) | D10 **untested** (Major 2) | pass (code) |
| REQ-25 reading never writes the repository | **No**: the reader rewrites the index (Critical 1) | D3 test exists but passes about 5 runs in 6 | **FAIL** |
| REQ-26 never cut off; 256 KiB / NUL untracked read as binary | Yes | D7's >3,000-line half untested (Major 2) | pass (code) |
| REQ-27 counts only for the focused session, in Focus, not while hidden | Yes (`polling()` in `features/diff.ts`) | E2E REQ-27 test; the hidden-page pause **untested** (Major 3) | pass (code) |
| REQ-28 `Not saved, musterd unreachable`; `Couldn't read the diff: …` | Yes | R26, R29, R30, E2E REQ-28 tests | pass |
| DIAG | `kb:diagram/store-schema`, `kb:diagram/domain-model` (plan deltas), `kb:diagram/daemon-components` (named by `kb for internal/server/diff.go`) | — | **fail** (Major 4) |

## Build & Tests

E2E tests: pass (259, scoped to 22 files; `c1d/03-e2e.log`) · Daemon tests (race): pass on re-run (`c1b/05-D4.log`); red in `c1/23-D4.log` on `TestRead_NeverWritesTheRepository`, which is a real product defect (Critical 1) · Web tests: pass (3360) · Daemon build: pass · Web build: pass · Lint: pass (0 issues). Read from the cycle-1 gate runs `gates-diff-viewer-c1` → `c1b` → `c1c` → `c1d` (= `$GATES_LOG_DIR`), each re-running only the lines red before; no gate re-run by this reviewer.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (`c1/22-D1.log`) |
| D2 | `go build ./...` | pass (`c1/01-build.log`, empty) |
| D3 | `make lint` | pass (`c1/03-lint.log`, 0 issues) |
| D4 | `make test-race` | pass on re-run (`c1b/05-D4.log`); first run red on `TestRead_NeverWritesTheRepository` — not a flake, see Critical 1 |
| D5 | `make check-render-fixtures` | pass (125 scenarios up to date) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (3360) |
| W3 | `make web-lint` | pass |
| R1 | `make render-test` | pass on re-run (`c1b/01-render-test.log`, 543); first run red on `groups.spec.ts:581`, outside this plan |
| E1 | `make e2e` | pass (scoped, `c1d/03-e2e.log`, 259); earlier reds `embedded.spec.ts:64/75` and `shell-scroll.spec.ts:377/196` are outside this plan (Note 4) |
| K1 | `make check-kb` | pass (717 records, 0 problems) |
| SOAK | Repairs row 5 (focus test flake) | `make e2e-soak SPEC=e2e/diff.spec.ts N=10 GREP='toolbar and side-panel controls keep focus'`: 10 passed (51 s), run by this reviewer |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — `TODO.md:63` "Code diff viewing" not ticked or moved; the plan's two diagram deltas not applied (Major 4); both impl logs' `deviation:` lines still read `→ ADR: pending` (Major 5); the Doc Delta's diff line (REQ-1 to REQ-28 as product truth, and `docs/features/diff/spec.md` "never writes to the repository") asserts REQ-25, which the code does not support until Critical 1 is fixed. The focus and surfaces Doc Delta sentences are true of the code. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| V1 | no `any` in new web code | pass | `rg ': any\b|as any|<any>|any\[\]'` over `web/src/{features,render}/diff*.ts`, `web/src/api/diff.ts`: no hits |
| V2 | no innerHTML with interpolated diff or comment text | pass | no `innerHTML` / `insertAdjacentHTML` / `outerHTML` in those files; text goes through `el(…, text)` / `writeText` |
| V3 | no diff line, file content or comment text to a logger | pass | the only log calls are `internal/server/diff.go:108` and `diffreview.go:113`: `Err(err)` + `session_id`; the errors are exit statuses or "N changed files but M patch blocks", never content; no `console.*` in the web diff modules |
| V4 | every git invocation carries a timeout and `WaitDelay` | pass | every call goes through `Reader.run` = `runGit` (`internal/gitdiff/gitdiff.go:85`): `context.WithTimeout(30 s)`, `cmd.WaitDelay = 2 s` |
| V5 | viewer matches `prototype/02`–`10` and changed-notice option A | structure pass; pixel comparison is review-browser's | toolbar, bar, body, change map, side panel built in that order (`render/diffchrome.ts`); the bar uses `--warn` / `--warn-line` with a filled `Refresh` |
| V6 | size row: button flush right, note at left | pass | `.sizenote { margin-right: auto }`, `.diffbtn { margin-left: auto }` (`web/src/style.css:2146–2165`); R2 asserts flush right from 1440 to 700 px |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude Code field names in the new Go or web files |
| 2 | Terminal-output state parsing | pass — none |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux | pass — no tmux invocation added (E16 reads geometry through `daemon.tmuxDisplay`) |
| 5 | Payload logging | pass — see V3 |
| 6 | Empty-gauge dishonesty | pass — no summary means no button (`diffButtonText(null)` is null); the viewer reads `Loading…` until a read answers |
| 7 | Identity on `session_id` | pass — the review is a column of the Muster session row |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass — none; scratch commits pass identity with `-c user.*` per command (`internal/gitdiff/gitdiff_test.go:20`, `internal/server/renderfix.go:263`, `internal/server/diff_test.go:268`) |

## Issues

### Critical
1. **[daemon-impl]** Reading a diff rewrites the repository's index file (taking `index.lock`) whenever a tracked file is stat-dirty but content-identical — a file re-saved unchanged, touched, or racily clean. That breaks REQ-25, INV-6, D3 and `kb:adr/diff-read-only-git-cli` ("nothing refreshes the index … or takes optional locks"). `trackedFiles` (`internal/gitdiff/tracked.go:41–49`) runs the porcelain `diff <ref> --raw` and `--patch`; porcelain diff refreshes and writes the index on a stat-only mismatch, and `--no-optional-locks` / `GIT_OPTIONAL_LOCKS=0` do not stop it. Reproduced in a scratch repo, git 2.50.1 (Apple Git-155), with the exact flags `runGit` passes (`--no-optional-locks`, `GIT_OPTIONAL_LOCKS=0`, `diff -M HEAD --raw -z --`):
   ```
   control (no stat-only change):
   8b0a9c56...  index
   8b0a9c56...  index        (unchanged)
   after touch of the unchanged f.txt:
   Nov 20 00:37:16 2026 index
   fce26769...  index        (rewritten by the --raw read)
   Nov 20 00:37:18 2026 index
   ```
   The first gate's red (`gates-diff-viewer-c1/23-D4.log`, `gitdiff_test.go:430`) is this defect, not noise: the `a.txt` entry's stat seconds move from `0x6aff701b` to `0x6aff701c` and the index is rewritten. The test's same-bytes rewrite of `a.txt` is caught only when it crosses a second boundary, hence about one run in six; the test agent's `gc.auto=0` / `maintenance.auto=false` change did not touch the cause. Real cost: the dashboard polls every 5 s, so this rewrites the developer's index and races `index.lock` against Claude's and the developer's own add and commit. For the fix: plumbing `diff-index` leaves the index alone but lists a stat-dirty file under `--raw` that `--patch` omits (measured: 2 raw entries, 1 patch block), so a bare swap would trip the raw/patch pairing into `500 diff_failed`. A fix must make true: no read (summary, either scope) changes any byte under the repository's git directory or creates a lock file, for a checkout holding stat-dirty unchanged files; every response stays contract-shaped, and a stat-only change moves no fingerprint.
   id: internal/gitdiff/tracked.go:trackedFiles:porcelain-diff-refreshes-index | confidence: 97

### Major
1. **[daemon-tests]** `TestRead_NeverWritesTheRepository` (`internal/gitdiff/gitdiff_test.go:413`) catches Critical 1 only when its same-bytes rewrite of `a.txt` lands in a new second (about 1 run in 6), so it passed through authoring and two of three gate runs. It must set `a.txt`'s mtime clearly apart from the index's (for example `os.Chtimes` two seconds off) so it fails on every run against today's reader and passes on every run after the fix. `daemon-tests.md` § Notes also says the cause was detached commit-time maintenance and that "a temporary probe wrapping every reader git call (40 repos) saw none of them change the index"; the gate log shows a reader call did, so that note should be corrected, not carried forward.
   id: internal/gitdiff/gitdiff_test.go:TestRead_NeverWritesTheRepository:nondeterministic | confidence: 92
2. **[daemon-tests]** Two daemon acceptance criteria have no test. **D7**'s second half, "a file of more than 3,000 changed lines is listed whole": only the 256 KiB and NUL untracked rules are tested (`gitdiff_test.go:218`). **D10**, "an issue snapshot of a session with comments contains none of their text": no test captures an issue snapshot for a session with a stored review. Each needs a test that fails if the reader capped a tracked file's lines, or if `buildIssueSnapshot` (`internal/server/issuesnapshot.go:113`) started carrying `DiffReview`.
   id: internal/gitdiff+internal/server:D7-D10:untested | confidence: 85
3. **[web-tests]** **W4**'s "pauses while the page is hidden" (edge case 20) has no test at any level: `rg visib` over `web/src/features/*.test.ts`, `web/render/diff.spec.ts` and `web/e2e/diff*.spec.ts` finds nothing, and `web-tests.md` declined `features/diff.ts` as DOM-bound. The focused-only and Focus-only halves are covered by the E2E REQ-27 test. A test must show no `diff/summary` request while the page is hidden and one on its return to visible (a render test can stub `document.hidden`, dispatch `visibilitychange` and count routed requests).
   id: web/src/features/diff.ts:polling:hidden-pause-untested | confidence: 80
4. **[orchestrator]** Three diagrams depict changed code and were not updated. `kb:diagram/store-schema` still reads "migrations 0001-0020" with no `diff_review` column, and `kb:diagram/domain-model` has no diff-review line on `Session`; both are the plan's own `## Diagrams` deltas, listed in its orchestrator doc upkeep. `kb:diagram/daemon-components` (named by `kb for internal/server/diff.go`) lacks the new `internal/gitdiff` adapter and its `server` relation.
   id: docs/diagrams:store-schema+domain-model+daemon-components:stale | confidence: 95
5. **[orchestrator]** Both `deviation:` lines still end `→ ADR: pending` (`daemon-implementation.md` § Decisions, render fixtures opt-in; `web-implementation.md` § Fix Attempt 1, harness writes left at 404). The records exist, are `proposed` with `refs: [plan:diff-viewer]`, and describe what shipped (`kb:adr/process-render-fixtures-record-diff-opt-in`, `kb:adr/process-render-harness-diff-writes-default-404`); only the arrows need to name them.
   id: plans/diff-viewer:deviation-arrows:pending | confidence: 90

### Minor
1. **[orchestrator]** `docs/adr/diff-read-only-git-cli.md` frontmatter carries `supersedes: []` twice (lines 11–12), and its `files: []` / `tests: []` are empty although `internal/gitdiff/*` and `TestRead_NeverWritesTheRepository` are its subject and guard.
2. **[orchestrator]** `TODO.md:63` "Code diff viewing" is not ticked or moved to `docs/history/todo-done.md` (plan § Doc upkeep).

### Notes
1. **[note]** The E9 busy-source test (`web/e2e/diff.spec.ts:421`) is load-sensitive per `test-specs.md` § Handoff (27/30 and 29/40 at load average 100–250; green in this cycle's gate). Its cost driver is the summary reading both scopes' full diffs, untracked files included, on every 5 s poll (`gitdiff.Summary`, a recorded design choice for D1/D14). The completion sweep is where it will show; review-maintainability may weigh the poll's cost.
2. **[note]** With no merge base between HEAD and the default branch, `base` reads `HEAD (…) — no default branch found` (`internal/gitdiff/gitdiff.go:226`) although one was found. It is one of the three strings the contract lists, so it is contract-true, only imprecise.
3. **[note]** `whatChanged` falls back to `its contents changed` when the fingerprint moved but no file's path or lines differ (only the base, a status or a rename pairing changed). The plan names no text for that case, and an empty tail would be worse.
4. **[note]** Outside-plan reds this cycle — `embedded.spec.ts:64/75` (scratch daemon never healthy), `shell-scroll.spec.ts:377/196` (a typed `for i in …` garbled by zsh under load), render `groups.spec.ts:581` — each match known load symptoms (`kb:lesson/concurrent-e2e-across-worktrees-goes-red`), passed alone and in later runs, and touch nothing this plan changed; no regression tag.

## Browser review

# Browser review: diff-viewer

**Plan**: diff-viewer
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 13103 words (budget 30000)
**Rig**: `make web-build build` at 3943a416 (`bin/musterd` v0.30.4-27-g3943a416-dirty, dirty = the orchestrator's untracked plan files only); per-test scratch daemons from `web/e2e/helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-0ddb5980-*` (contains a space), tmux socket `<data dir>/tmux.sock`, the shared E2E stub `claude`; headless Chromium 1280×720 (plus 900×600 and 1280×500), through a throwaway spec `web/e2e/zz-browser-review.spec.ts` that has since been deleted. The gates log (`gates-diff-viewer-c1d`) is all green: size, e2e-level, e2e 259 passed.

## Matrix

Hosts: **focus** (main slot plus size row), **tiles**, **pop-out**. States: **no data** (summary answers held by a route), **data**, **daemon-down** (scratch daemon SIGTERMed).

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/9 | focus | no data | no button, row holds the note alone | pass | `#diff-button` display none; `#sizerow` 694–720 (h 26), text = size note only |
| REQ-1 | focus | data | button appears after a file change, no reload | pass | `1 file +1 −1 · View diff ›` once the held summary was released; `/api` summary uncommitted 1/+1/−1 |
| REQ-9 | focus | data | button flush right, row no taller | pass | row 300–1280 × 694–720 (h 26) in every state measured: note only, note+button, note+button+💬, open, docs (button only), ended (button only). Button right 1264 = row right − 16 px padding; note left 316 |
| REQ-9 | focus | data | hover title states both scopes | pass | `Uncommitted: 1 file +1 −1 · Branch: 1 file +1 −1` |
| REQ-9 | focus (docs) | data | row shows holding only the button | pass | `#sizenote` display none; row h 26, text `1 file +1 −1 · 💬 1 · View diff ›` |
| REQ-9 | focus (ended) | data | row shows holding only the button | pass | `#dead-surface` 95–694; row h 26 with the button alone |
| REQ-22 | focus | data | terminal refits, no clipped row, no page scroll | pass | `terminalFitProblems` = [] with the button and with 💬; size note 130×24 = tmux `window_width`/`window_height` 130×24; page scrollHeight 720 = innerHeight |
| REQ-2 | focus | data | viewer replaces the pane inside its host | pass | `section[aria-label=Diff]` 300–1280 × 95.4–694: top = `#mainhead` bottom 95.4, bottom = `#sizerow` top 694; no page scroll at 1280×720 or 900×600 |
| REQ-2 | focus | data | button reads Close diff ×; close by button/×/Escape | pass | `… · 💬 1 · Close diff ×`; the button closed it and `claude` was re-selected; Escape closed it (E.finalEscape, J.esc2) |
| REQ-10 | focus | data | no segment looks selected while open | pass | open: all three `aria-pressed=false`, bg `rgba(0,0,0,0)`, colour 166,171,188. Closed: claude bg 28,32,41, colour 232,230,225 |
| REQ-3 | focus | data | scopes, default scope, base stated | pass | `5 files · +4 −5 · against HEAD (8dd2da0)` = oracle base; Branch `6 files · +6 −5 · against main @ 2d2e1df` = oracle, plus `src/committed.txt` |
| REQ-11 | focus | data | file heads status/path/counts, rename, binary, fold, Files list | pass | heads match `/diff` oracle file by file (`renamed src/old-name.txt → src/new-name.txt +0 −0`); `Binary file not shown` ×1; fold → `aria-expanded=false`, 0 rows; side panel lists all 5 |
| REQ-11 | focus | no data | viewer reading shows Loading… | pass | with `/diff?scope=` held: `.dv-loading` 131–178, text `Loading…` |
| REQ-12 | focus | data | Unified: one column, both numbers, red/green | pass | `.dv-row.del` bg 58,26,32; `.dv-row.add` bg 22,48,31; row h 18.4 |
| REQ-12 | focus | data | Split: old left, new right, rows lined up, readable | **FAIL** | every file section is a 128 px column side by side (`.dv-files.split` computed `display:flex`); cells 64 px wide, code wraps one character per line, split row h 129 vs Unified 18.4 (Critical 1) |
| REQ-13 | focus | data | word highlight stronger, in every view | pass | Unified `<del>diff</del>` bg 107,42,51 on row 58,26,32; `<ins>code</ins>` 31,90,51 on 22,48,31; one `ins` in Split and in Review |
| REQ-14 | focus | data | Review after/before flip, placeholder | pass | labels `after`×5; a pointer click on the last change → `before`; a pure removal shows `nothing here after the change` placeholder |
| REQ-15 | focus | data | pointer tick folds; folded row reopens | pass | click `Mark change reviewed` → `✓ reviewed · +1 −1`, `1 / 5 changes reviewed`; click on the folded row → unfolded, still 1/5 |
| REQ-15 | focus | data | tick by `x` folds the change | **FAIL** | `j j x`: progress 1/5 → 2/5, `.dv-folded` count stays 0 (Major 2) |
| REQ-15 | focus | data | file tick box, mixed, fold, unfold without unticking | pass | tick app.txt → `aria-expanded=false`, checked, 5/5; unfold → expanded true, still checked, 3 folded changes; Reset → 0 |
| REQ-16 | focus | data (3 changes) | one mark per change, state | pass | 3 marks of 14 px inside the map 131–694; after the file tick: `unreviewed`,`reviewed`,`reviewed` |
| REQ-16 | focus | data (200 changes) | every mark reachable | **FAIL** | map 162.4–694 (h 531.6), `overflow:hidden`, scrollHeight 1006; marks 106–200 lie below the box (mark 200 top 1161) and cannot be reached by pointer (Major 1) |
| REQ-17 | focus | data | `+` shown on hover only, box heading | pass | `.dv-plus` opacity 0 → 1 on hover, `Comment on line 4`; box `Commenting on line 4` |
| REQ-17 | focus | data | number click + shift-click selects, tinted apart | pass | `Commenting on lines 2–4`; selected rows bg 43,58,94 (≠ add 22,48,31 / del 58,26,32) |
| REQ-17 | focus | data | comment box keeps focus and text across a poll | pass | `activeElement` was the same textarea (probe attribute kept) after 6.5 s; value `hello there` |
| REQ-18 | focus | data | card, gutter bar, resolve row, expanded Delete | pass | `Lines 2–4 Edit Resolve`; rows carry an inset 3 px 110,168,254 bar; `✓ Resolved · Line 15 · jump here` `aria-expanded` false → true showing `Delete`+`Reopen`; Delete → 0 rows, oracle 0 comments |
| REQ-19 | focus | data | Comments (n) counts open only; list; jump unfolds | pass | `Comments (1)` → after Resolve `Comments (0)`, `Resolved (1)`, button drops `💬`; entry `src/app.txt:15` click into a folded file → card in view (406 within 131–694) |
| REQ-20 | focus | data | j/k/Space/x/Shift+X, Escape order | pass (see Notes 2) | j/k move `.current`; Space → `before` and back; Escape: box first, then selection (sel 0, viewer still open), then the viewer |
| REQ-4 | focus | data | bar pinned under toolbar, lines move by bar height only | pass | bar 131.4–169.4 = toolbar bottom 131.4, unchanged after a further 1500 px scroll; the probe row went 179.25 → 217.25 (= bar h 38); scrollTop 3000 kept |
| REQ-4 | focus | data | Refresh keeps scroll, removes bar, keeps ticks/comments | pass | scrollTop 4500 → 4500, bar gone, new file listed; summary oracle 2 files +161 −160 |
| REQ-5/6/8 | focus | data | comment and ticks after reload, restart, second window | pass | `2 / 4 changes reviewed`, 2 folded, `Comments (1)`, `💬 1` in all four reads (saved, reload, `daemon.restart()`, new context) |
| REQ-6 | focus | data | a change whose lines changed comes back unticked | pass | after both ticked changes were edited: `0 / 4 changes reviewed` |
| REQ-7 | focus | data | comment follows its line; outdated when gone | pass | moved down 2 → card `Line 5` on `charlie three`; line deleted → list `review.txt:3 outdated charlie three follow me`, 0 cards |
| REQ-21 | focus | data | marking distinct in light and dark | pass | light add 220,243,224 / del 251,224,226 / ins 166,224,180 / sel #d4e1fa / comment #1f5fbf; dark 26,51,34 / 59,31,36 / 37,96,58 / #2d3f63 / #74adf5 |
| REQ-27/INV-5 | focus | data | the other session shows only its own | pass | B focused: no viewer, `1 file +3 −3 · View diff ›`; back to A: its viewer is still open |
| REQ-23 | tiles | data | no diff button; tile shows the terminal; viewer back in Focus | pass | 0 buttons, `#sizerow` display none, tile + terminal region 1 each; Focus → viewer 300–1280 × 95–694 again |
| REQ-2..21 | tiles | — | viewer surfaces | N/A — plan § Views: Tiles unchanged, no way into the diff | |
| all | pop-out | — | — | N/A — there is no `/doc.html` host for the viewer or the size row (plan § Views) | |
| REQ-28 | focus | daemon-down | button keeps counts; banner | pass | `#banner` 0–1280 × 46–78 `musterd unreachable — hook output…`; the button kept `2 files +5 −3 · Close diff ×` 6 s later |
| REQ-28 | focus | daemon-down | comment save fails keeping its box | pass | `Not saved, musterd unreachable` colour 232,207,90 = `--warn` #e8cf5a; textarea kept `survives down` |
| REQ-28/EC21 | focus | daemon-down | tick write fails | pass | `1 / 4 changes reviewed  Reset  Not saved, musterd unreachable`; change stays folded |
| REQ-28 | focus | daemon-down | Refresh fails with reason and Refresh | pass | `.dv-error` `Couldn't read the diff: musterd unreachable`, 1 Refresh button |
| §6/§7 | focus/tiles | all | honesty and terminal rules | pass | no cost, no "Done", the daemon-down banner is shown; the tile holds one terminal region; the size note equals tmux geometry |
| Hidden | focus/tiles | all | `[hidden]` computes `display:none` | pass for this plan | every leak found was `SPAN.ended-at` in `#mainhead` (Note 3), nothing of this plan's |

## Issues

### Critical
1. **[web-impl]** Split view does not work. `.dv-files` gets the view name as a class (`dv-files split`), which picks up the dashboard's existing global `.split { display: flex; flex: 1 }` (`web/src/style.css:721`). Every file section then sits side by side as a ~128 px column in the 700 px body. Measured on `standardRepo` at 1280×720: the `.dv-srow` grid columns are `64.0156px 64.0156px`, file sections run across from left 300, the code wraps one character per line, and a split row is 129 px tall against Unified's 18.4 px (screenshot taken). REQ-12's Split ("old left and new right with a change's rows lined up") cannot be read. A fix must make file sections stack vertically in Split, as they do in Unified, with each `.dv-srow` spanning the body's width, so a short line is one row tall. Uncommitted, Branch and the Review/Unified views are unaffected.
   id: web/src/style.css:.dv-files.split:split files laid side by side | confidence: 97

### Major
1. **[web-impl]** The change map clips marks when there are many changes, and the clipped ones cannot be reached (REQ-16, plus the lead the previous attempt left). `.dv-map` has `overflow: hidden`, and `.dv-mark` has `min-height: 3px` with a 2 px gap. With 200 changes in one file (Review, 1280×720): the map box is 162.4–694 (531.6 px) but its content is 1006 px tall, and marks 106–200 lie below the box (mark 200 top 1161.4). No scrollbar exists and wheel scrolling is suppressed, so a pointer user cannot reach those marks. (Playwright's `click()` reached mark 200 only by scrolling the hidden overflow programmatically.) A fix must keep one clickable mark per change inside the map box at any change count, by scaling the marks or by letting the map scroll.
   id: web/src/style.css:.dv-map:marks clipped past ~105 | confidence: 92
2. **[web-impl]** A change reached by `j`/`k` (and, from the same path, a change-map click or a Comments jump) does not fold when it is ticked. `showChange` adds the change's key to `s.reopened` (`web/src/features/diffreviewui.ts`), and the fold rule is `isTicked && !reopened`. Measured: `j j x` moved progress from `1 / 5` to `2 / 5 changes reviewed`, but the `.dv-folded` count stayed 0. A pointer tick on a change never navigated to folds (`✓ reviewed · +1 −1`). REQ-15 says a change's tick folds it. A fix must make every tick (key `x`, the tick button, the file tick) fold the change, whether or not it was ever the current change. "Reopened" should last only until the next tick.
   id: web/src/features/diffreviewui.ts:showChange:visited change never folds | confidence: 88
3. **[render-tests]** R9 and R25 could not have failed for Critical 1. R9 checks only that the new cell's x is right of the old cell's midpoint and that their tops are level, and both hold inside a 128 px squashed column. R25 compares row heights on a row whose code is `}`, a single character that never wraps. The specs must assert that Split's file sections are stacked, with each `.dv-srow` as wide as the scroll body, and compare row heights on a line long enough to wrap if a column were squashed.
   id: web/render/diff.spec.ts:R9 R25:could not catch squashed split | confidence: 85

### Minor

### Notes
1. **[note]** While musterd is down, the button keeps its last counts without an age, as plan § States specifies. The daemon-down banner shows at the same time (0–1280 × 46–78), so this was not filed as a §6.8 violation. Raise it if the developer wants an age on the counts.
2. **[note]** `x` and `Shift+X` toggle rather than only tick. After `x` had ticked review.txt's only change, `Shift+X` dropped progress from 1/3 to 0/3 (`shiftX` passes `state !== "all"`). This matches the tick buttons' toggle, but the plan's wording is "ticks". No change requested unless the developer reads REQ-20 strictly.
3. **[note]** Outside this plan: `#mainhead .ended-at` carries `[hidden]` but computes a non-`none` display on a live session (kb:lesson/display-rule-overrides-hidden-attribute). This branch does not touch `.ended-at`.
4. **[note]** Not re-measured in the browser, and left to the existing specs: the Review keys while focus is in the terminal or a text field (INV-4: R22, R23), `directory_missing` (R29, D11), and the shell surface's refit (E16, green in the gates log). Two scratch data dirs `$TMPDIR/muster e2e-0ddb5980-Ls7RbZ` and `…-YCuWu9`, dated 2026-11-19 23:05, predate this review and were left alone.

## Maintainability review

# Maintainability review: diff-viewer

**Plan**: diff-viewer
**Part verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 18935 words (budget 30000)
**Scope**: 40 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/gitdiff/gitdiff.go | internal/gitutil/gitutil.go, internal/commentpass/gitdiff.go, internal/locate/spotlight.go | yes | none | Major 1 |
| internal/gitdiff/tracked.go | internal/gitutil/gitutil.go, internal/commentpass/gitdiff.go | yes | none | note 2 |
| internal/gitdiff/untracked.go | internal/gitutil/gitutil.go | yes (runner only; ls-files not mentioned) | none | Major 1 |
| internal/server/diff.go | note.go, reader.go, shells.go, respond.go, usage.go | yes | none | pass |
| internal/server/diffreview.go | note.go, rename.go, rail.go, effort.go, groups.go, locate.go | yes | none | Minor 1 |
| internal/server/server.go | (composition root) | n/a | funlen `New` 55>40, pre-existing | pass (one-line registration) |
| internal/server/renderfix.go | renderfix_scenarios*.go | yes | filelen 574, reason holds | note 4 |
| internal/server/renderfix_normalise.go | renderfix.go | n/a (one line) | none | pass |
| internal/server/renderfix_scenarios_diff.go | renderfix_scenarios_notes.go, _shortcuts.go, _reader.go, renderfix.go | yes | none | note 3 |
| internal/server/renderfix_scenarios_shortcuts.go | renderfix_scenarios_rail.go, _usage.go | n/a | none | pass |
| internal/server/CLAUDE.md | generated trailer | n/a | none | pass |
| internal/session/diffreview.go | note.go, writeorder.go | yes | none | pass |
| internal/session/row.go | — | n/a (field mapping) | none | pass |
| internal/session/session.go | — | yes | none | pass |
| internal/session/writeorder.go | note.go | n/a | funlen `restoreChangedFields` 61>60, new on this branch | Minor 2 |
| internal/session/CLAUDE.md | generated trailer | n/a | none | pass |
| internal/store/session.go | migrations, row.go | n/a | funlen `UpdateSession`/`scanSession` 71, filelen 561, pre-existing | note 5 |
| internal/store/migrations/0021_diff_review.sql | 0019_restart.sql, 0020_scratchpad.sql | n/a | none | pass |
| web/src/api/diff.ts | api/reader.ts, api/http.ts | yes | none | pass |
| web/src/features/CLAUDE.md | generated trailer | n/a | none | pass |
| web/src/features/diff.ts | notes.ts, usage.ts, groupsselect.ts | yes | none | pass |
| web/src/features/diffbutton.ts | notesview.ts, render/diffbody.ts | yes | none | Minor 4 |
| web/src/features/diffcomments.ts | notesedit.ts, notessave.ts | yes | none | Minor 6 |
| web/src/features/diffmodel.ts | notesgeometry.ts | yes | none | Major 3 |
| web/src/features/diffplace.ts | notesgeometry.ts | yes | none | Minor 4 |
| web/src/features/diffreviewui.ts | notessave.ts | yes | none | Minor 6 |
| web/src/features/diffviewer.ts | notes.ts, reader.ts | yes | none | note 6 |
| web/src/features/diffviewerstate.ts | notespanelstate.ts | yes | none | Minor 6 |
| web/src/features/diffwords.ts | reader/ (find matcher) | yes | none | Major 3 |
| web/src/features/focus.ts | tiles.ts, notes.ts | no | none | Minor 5 |
| web/src/features/notes.ts | — | n/a | none | note 7 |
| web/src/main.ts | (composition root) | n/a | none | pass (one-line registration) |
| web/src/render/CLAUDE.md | generated trailer | n/a | none | pass |
| web/src/render/diffbody.ts | confirm.ts, notespanel.ts, readerfind.ts, masthead.ts | yes | none | Major 3, Minor 4 |
| web/src/render/diffchrome.ts | dom.ts, masthead.ts, notespanel.ts | yes | none | Major 2, Minor 3 |
| web/src/render/diffcomment.ts | confirm.ts, notespanel.ts | yes | none | Minor 3 |
| web/src/render/diffrows.ts | dom.ts, readerfind.ts | yes | none | Major 3 |
| web/src/render/diffside.ts | notespanel.ts | yes | none | pass |
| web/src/render/surfaceseg.ts | — | n/a (one helper) | none | pass |
| web/src/style.css | `.btn` (l.3192), `.seg-btn` (l.292) blocks | no | none | Minor 7 |

## Issues

### Critical

None.

### Major

1. **[daemon-impl]** `internal/gitdiff` runs the same git queries `internal/gitutil` already owns, with a second runner, instead of reusing or generalising them. Conventions § Design: "Reuse before add ... What it finds is reused or generalised, never copied, whatever Decisions says." The `design:` line names `gitutil.runGit` and gives its reason for a new runner (lock-free env, 30 s timeout). It does not mention that the same argv is also copied:
   ```
   internal/gitutil/gitutil.go:127:	out, err := g.run(ctx, dir, "git", "ls-files", "-co", "--exclude-standard", "-z")
   internal/gitdiff/untracked.go:21:	out, err := r.git(ctx, top, "ls-files", "-co", "--exclude-standard", "-z")
   internal/gitutil/gitutil.go:73:	out, err := g.run(ctx, dir, "git", "rev-parse", "--show-toplevel")
   internal/gitdiff/gitdiff.go:107:	out, err := r.run(ctx, dir, "git", "rev-parse", "--show-toplevel")
   internal/gitutil/gitutil.go:145:func runGit(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
   internal/gitdiff/gitdiff.go:87:func runGit(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
   ```
   `gitutil.ListFiles`'s own doc says it is "the one place that runs `git ls-files` at all, so a caller never carries its own git argv". `splitNul` (untracked.go:28) also repeats `listFiles`'s NUL split (gitutil.go:131–135). After the fix, the daemon must have exactly one git subprocess runner for a checkout, and each of `ls-files -co --exclude-standard -z` and `rev-parse --show-toplevel` must exist in one place. The lock-free env and the timeout can become an option of that one runner, or the diff reader can move under the package that owns it. The not-a-repo distinction (exit 128 → `ErrNotRepo`) must survive the move.
   id: internal/gitdiff/gitdiff.go:runGit:second git runner copies gitutil | confidence: 85

2. **[web-impl]** `writeText` (`web/src/render/diffchrome.ts:180`) is a byte-for-byte copy of `setText` in `web/src/dom.ts:42`. Conventions § Design: "Reuse before add".
   ```
   web/src/dom.ts:42:export function setText(el: HTMLElement, text: string): void {
   web/src/dom.ts:43:  if (el.textContent !== text) el.textContent = text;
   web/src/render/diffchrome.ts:180:export function writeText(node: HTMLElement, text: string): void {
   web/src/render/diffchrome.ts:181:  if (node.textContent !== text) node.textContent = text;
   ```
   `render/context.ts`, `render/notes.ts`, `render/repolines.ts` and `render/restartpanel.ts` import `setText` from `../dom`. The diff modules (`features/diff.ts`, `diffcomments.ts`, `diffreviewui.ts`, `diffviewer.ts`) import the copy, 15 call sites in all. After the fix, one helper exists and every diff module uses it.
   id: web/src/render/diffchrome.ts:writeText:copy of dom setText | confidence: 95

3. **[web-impl]** `render/` now imports from `features/`, which reverses the directory layering every other render module follows. `rg -n 'from "\.\./features/' web/src/render` returns only the new diff builders:
   ```
   web/src/render/diffbody.ts:2:import type { Change, Entry, FileModel } from "../features/diffmodel";
   web/src/render/diffrows.ts:1:import type { Entry } from "../features/diffmodel";
   web/src/render/diffrows.ts:2:import { entryLine } from "../features/diffmodel";
   web/src/render/diffrows.ts:3:import type { Seg } from "../features/diffwords";
   ```
   Conventions § Composition roots says `render/` holds the DOM half only and takes the computed value as a parameter. `web/src/render/CLAUDE.md` says "a builder takes the computed value, never the raw data". `kb:diagram/web-components` draws features above render and says the graph is acyclic. `features → render` (`diffviewer.ts:8–11`) plus `render → features` is now a directory cycle. After the fix, no module under `web/src/render/` imports from `web/src/features/`. The model and segment shapes the builders read must live where both directories may import them, or the builders must take render-owned inputs. `entryLine` (a decision) must be computed before the builder is called.
   id: web/src/render/diffrows.ts:imports:render imports features | confidence: 90

### Minor

1. **[daemon-impl]** The three diff review writes pass the request context straight into the manager: `internal/server/diffreview.go:68` `PutDiffComment(r.Context(), …)`, `:80` `DeleteDiffComment(r.Context(), …)` and `:101` `UpdateDiffTicks(r.Context(), …)`. Every sibling manager write wraps it: `note.go:57` `f.manager.SetNote(context.WithoutCancel(r.Context()), id, note)`, and the same in `rename.go:78`, `rail.go:53/85/126`, `effort.go:32` and `groups.go:139/181/225/251/275`. Conventions § Design: "Match the siblings". No `design:` line gives a reason. As written, a client that goes away mid-request cancels the persist, and the in-memory review is restored. Each sibling avoids exactly that. After the fix, the diff review writes follow the siblings' context rule, or a `design:` line says why they differ.
   id: internal/server/diffreview.go:handlePutComment:request ctx cancels persist | confidence: 85

2. **[daemon-impl]** This branch adds a `funlen` hit, `internal/session/writeorder.go:209 restoreChangedFields` (61 > 60), by adding the `DiffReview` restore line, and gives it no reason. The daemon log's `design: size:` line says "No funlen/dupl hit on touched files", which the gates' size log contradicts. The pre-existing hits on touched files (`server.go:138 New`, `store/session.go UpdateSession`/`scanSession`, `store/session.go` at 561 lines) are listed there too. Conventions § Design, "Size is read, not obeyed", and kb:adr/process-size-linters-warn-never-fail. After the fix, Decisions gives a reason for the new hit that holds: one restore line per field is a flat list, not interleaved concerns. Do not split the function only to silence the warning.
   id: internal/session/writeorder.go:restoreChangedFields:funlen hit no reason | confidence: 90

3. **[web-impl]** There are two private `button()` builders, `web/src/render/diffchrome.ts:33` `function button(text: string, className = "dv-btn"): HTMLButtonElement` and `web/src/render/diffcomment.ts:22` with the same signature. They differ only in the `aria-pressed` default. Conventions § Design: "Reuse before add". After the fix, one builder serves both.
   id: web/src/render/diffcomment.ts:button:duplicate button builder | confidence: 90

4. **[web-impl]** The diff modules compose the same display text in more than one place:
   - "+a −d": `features/diffbutton.ts:15` `countsText` and `render/diffbody.ts:42` `countsLabel`.
   - The minus sign: declared at `diffbutton.ts:4` `MINUS`, `diffbody.ts:36` `MINUS` and `diffrows.ts:16` `SIGNS.del`.
   - The singular or plural line label: `features/diffplace.ts:13` `lineLabel` and `features/diffcomments.ts:38` `headingFor` both branch on `lines.includes("–")`.

   Conventions § Design: "One owner per concept". `web/src/render/CLAUDE.md`: "a builder never composes a second copy". After the fix, each of these strings has one owner in `features/` that render takes as a value.
   id: web/src/render/diffbody.ts:countsLabel:counts text composed twice | confidence: 85

5. **[web-impl]** `features/focus.ts` gains a new seam, `FocusDeps.diff { viewerRoot, mounted, close }`, which lets the diff viewer take over the main slot. It also gains a new `ResizeObserver` on `#main-terminal-slot` that refits the selected surface (`focus.ts:164–169`). Neither has a `design:` line. Before this, the terminal refit only on the render pass (`focus.ts:267`). Question 7 and conventions § Design: "the shape is the implementer's, reported ... as a `design:` line per new type, module or seam". After the fix, `web-implementation.md` Decisions says why focus asks diff for the slot root, and why the refit moved onto a ResizeObserver, including what it reused or matched.
   id: web/src/features/focus.ts:FocusDeps.diff:seam without design line | confidence: 75

6. **[web-impl]** `ViewerState.comments` and `ViewerState.ticks` each have two writers: the write path in `diffcomments.ts`/`diffreviewui.ts`, and `load()`'s review read (`diffviewer.ts:134–139`). The ordering between them is guarded only for ticks, by `flushPending` before a load. Comment writes have no guard. Interleaving: Save on a new draft sends the PUT (`diffcomments.ts:165`). Before it answers, Refresh calls `load()`, whose `fetchDiffReview` is served after the PUT applied, so `s.comments` is replaced with a list that already holds the comment. Then the PUT's continuation runs `s.comments.push(comment)` (`:170`), and the comment renders twice until the next load. With Resolve instead (`write`, `:110–119`), `Object.assign(comment, patch)` mutates an object `load()` has already discarded. Consecutive tick flushes are not serialised either: `flush` (`diffreviewui.ts:94`) has no in-flight guard, so an add and a remove of one key can be in flight together. The windows are small on localhost, but they are real. Conventions § Design: "Shared state names its writers and its guard". After the fix, a load's review read can neither lose nor duplicate an in-flight comment write, and consecutive tick posts reach the daemon in the order they were made.
   id: web/src/features/diffcomments.ts:saveDraft:load overwrites in-flight write | confidence: 65

7. **[web-impl]** `web/src/style.css` adds a second button and segmented-control family, `.dv-btn`/`.dv-btn.primary` (l.5436–5454) and `.dv-seg`/`.dv-seg-btn`/`.dv-tab` (l.5412–5434). The existing families are `.btn`/`.btn.key` (l.3192, design-system §5) and `.seg-btn` (l.292, design-system §4.1). No `design:` line says why the viewer cannot use them. Conventions § Design: "Reuse before add", "Match the siblings". After the fix, the viewer's controls use `.btn`/`.seg-btn` with a `dv-` modifier for what really differs, or a `design:` line states the reason, for example a look from the accepted prototype.
   id: web/src/style.css:.dv-btn:second button family | confidence: 70

### Notes

1. **[note]** For `review-work` (DIAG): `kb:diagram/daemon-components` does not show the new `internal/gitdiff` package or the `server → gitdiff` edge (`docs/diagrams/daemon-components.md:64,94` show only `gitutil`). If Major 3 is not fixed, `kb:diagram/web-components` would also need the `render → features` edge.
2. **[note]** `internal/gitdiff/tracked.go:170 parseRanges`/`parseRange` and `internal/commentpass/gitdiff.go:26 hunkRE`/`startHunk` both parse `@@ -a,b +c,d @@`. `commentpass` is a dev tool that does not ship and needs less, so no change is asked.
3. **[note]** `renderfix_scenarios_diff.go:245 diffChangeKey` is a Go port of `features/diffmodel.ts:36 hash`/`changeKey`. The `design:` line states it and names the render test that catches drift, so the reason holds.
4. **[note]** `renderfix.go` is past 500 lines (574). The reason in Decisions (it was already 564 on main) holds. Its "564 → 579" figure is stale after the comment pass.
5. **[note]** The size log's test-file hits (`gitdiff_test.go:92 TestRead_TrackedChangeShapes`, `:269 TestRead_BranchScopeBases`, `server/diff_test.go:186 TestHandleDiffRead`) are `funlen`, not `dupl`. No test work is asked from this part.
6. **[note]** `features/diffviewer.ts:104,109` builds the error and loading nodes itself with render's `el`. It is a small DOM write in a controller, and folding it into the render builders would be tidier.
7. **[note]** `features/notes.ts:56` still names its element `sizenoteEl` although it now looks up `#sizerow`.
8. **[note]** `features/diffbutton.ts` also holds the viewer's summary line, change notice and error text (`summaryLine`, `whatChanged`, `diffErrorText`), so its name undersells it next to the `notes<concern>` siblings.
