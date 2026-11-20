# Correctness review: diff-viewer

**Plan**: diff-viewer
**Verdict**: needs-changes
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
