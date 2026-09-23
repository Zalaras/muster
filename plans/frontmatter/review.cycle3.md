# Review: frontmatter

**Plan**: frontmatter
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Frontmatter

**Plan**: frontmatter
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 14422 words (budget 8000) (WARN: pack exceeds budget of 8000)

This is a delta re-review (§9). Cycle 2's only open agent-tagged issues were Minors: correctness Minor 1 and maintainability Minor 1. I read `git diff b0bd83c..HEAD`, where `b0bd83c` is the cycle-2 review commit. The non-test source changes are the comment blocks in `web/src/style.css` and `web/src/features/reader.ts`. No CSS rule or code line changed, so the change stays inside maintainability Minor 1's stated scope. The only other source change is one test's setup block in `internal/server/reader_test.go`. The §3–§6 re-read is therefore skipped, and the cycle-2 tables below are carried forward against the same tree plus these comment and test edits.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-10 | Unchanged since cycle 2. No behavioural line changed in the delta | Unchanged, and D4's test now takes the planless-transcript route | pass (carried from cycle 2) |
| DIAG | `kb:diagram/web-components`, `kb:diagram/daemon-components`. The delta touches no structure either one depicts | — | pass |

## Build & Tests

E2E tests: pass (432) · Daemon tests (race): pass (20 packages ok, `internal/server` ok 101.6s) · Web tests: pass (1822, 44 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues; biome 179 files clean). All of these are read from `$GATES_LOG_DIR` (`gates-frontmatter-c3`, 0 failed lines). The same run shows these green too:
- contrast: 43 pairs × 3 themes, 0 failures
- versions: fresh
- e2e-honest: empty log
- kb check: 402 records, 0 problems
- dead-refs: 2883 checked, 0 missing
- e2e-lint: clean

The `WARN size` line (8 hits) belongs to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass (01-build.log, empty) |
| D8 | `make test` | pass (deduped to test-race, 02-test.log) |
| D9 | `make lint` | pass (03-lint.log, 0 issues) |
| D10 | `make test-race` | pass (02-test.log, 20 ok, no FAIL) |
| W11 | `make web-build` | pass (04-web-build.log, built) |
| W12 | `make web-test` | pass (05-web-test.log, 1822 passed) |
| W13 | `make web-lint` | pass (06-web-lint.log) |
| E7 | `make e2e` | pass (14-e2e.log, 432 passed) |
| K1 | `make check-kb` | pass (10-kb-check.log) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Cycle 2's `[orchestrator]` Major was fixed in `7e716b5`. `docs/adr/reader-frontmatter-key-column-may-break.md` now states a fixed layout with a 40% key column. Its Consequences say "Every frontmatter table gives its key column 40% of the width, including one whose keys are all short", which matches `style.css`. The new logs contain no `deviation:` or `doc-delta:` line. The Doc Delta is unchanged and still true |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D7 | retention rule in exactly one function | pass | The delta changes no daemon source. Cycle-2 evidence stands |
| W10 | `createElement` + `textContent` only | pass | `markdown.ts` and `frontmatter.ts` are untouched |
| W15 | no `any` | pass | The web delta is comments only |
| W16 | wraps in a 3×2 tile, no horizontal scroll | pass | The CSS rules are unchanged and the W16 E2E is green in 14-e2e.log |
| W17 | no heading holds frontmatter text | pass | The render path is unchanged |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The test uses the `claudecodetest` helper; no new Claude Code format knowledge sits outside `internal/claudecode/` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass (unchanged) |
| 4 | tmux socket / sizing | pass. No tmux in the delta |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass (unchanged) |
| 7 | Identity on tmux target | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass. None |

## Delta (delta re-review only)

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 correctness Minor 1 `[daemon-tests]`: `transcriptB` is never written, so D4's scan takes the missing-file branch instead of the planless-transcript branch | `ce81279` | I read the diff. `transcriptB` is now `filepath.Join(t.TempDir(), …)`, written with `claudecodetest.RawSessionEnd(claudeB, "other")`, which is the same planless fixture the D6 test (L507) and L611 use. So the three "names no plan" statements are now true. The new declaration comment says `transcriptA` is never reached by the rebind's scan and that A's own SessionStart scan runs before `SetPlan`. The test's sequencing confirms both (bindA → drain → SetPlan → rebindB). The test is green in 02-test.log. Nothing else in the test changed |
| cycle 2 maintainability Minor 1 `[web-impl]`: `style.css` and `reader.ts` comments narrate history | `3e25e62` | I read the diff. Only the comment blocks changed. `style.css:1035-1041` now states only the current reason: auto layout treats width as a hint, and `table-layout: fixed` makes it binding. That text matches the rules below it and the ADR. `reader.ts:449-451` now says only that the listing's plan is a fallback while `session` is unknown, which matches the `planPath` expression. No "since REQ-8", no "no longer" and no review-cycle story remains |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** In the new `style.css` comment, "the key column's 40% is a hard cap" is read together with "makes the column widths authoritative". Together they describe the fixed width accurately, and the maintainability Minor itself proposed this wording. No change is requested.

## Browser review

# Browser review: Frontmatter

**Plan**: frontmatter
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 6697 words (budget 8000) — rules 1340 · features 2408 · diagrams 0 · decisions 2465 · proposed 0 · facts 2 · lessons 474 · runbooks 2
**Rig**: `make web-build build` at 70e6306 (clean tree); `bin/musterd` started by the committed `daemon` fixture, with the space-bearing data dir `$TMPDIR/muster e2e-XXXX`, `-tmux-socket` at `<dataDir>/tmux.sock` and the shared stub `claude` (`$TMPDIR/muster e2e-stub-47b61c41d12a7b17/claude`); headless Chromium at 1280×720; a throwaway `web/e2e/zz-review-browser-probe.spec.ts` (2 probes, both ran to completion), since deleted. No musterd or tmux process is left, and `git status --porcelain` shows nothing of mine. Gates log c3: 0 failed lines (e2e 432 passed, web-build green).

## What changed since cycle 2, and the check that nothing rendered moved

Since cycle 2's measured tree (ff52e37), `web/src` changed only in two comments (3e25e62: `web/src/style.css` lines above `.md table.frontmatter`, and `web/src/features/reader.ts` `buildBarVM`). The daemon change is `internal/server/reader_test.go` only.

- **Byte oracle.** I built the ff52e37 `web/` tree with the same Vite into a scratch dir and ran `diff -rq -x '*.map'` against this cycle's `internal/webui/assets`. Every shipped non-sourcemap file is **identical**: `index-BrP-ENHg.css` sha1 `8c8f8268…` on both sides, and `index-CjNRDfHw.js` sha1 `cd0b49ac…` on both sides. Only the `.map` files differ, which is what a comment edit changes. The embedded dashboard is therefore byte-for-byte the one cycle 2 approved.
- **Re-measurement.** I also drove the running app again, with the same fixture set as cycles 1–2: `kb.md`, `skill.md`, `fact.md`, `long.md`, `raw.md`, `empty.md`, `crlf.md`, `unclosed.md`, `nofm.md`, `xss.md`. Every geometry figure that cycle 2 recorded for an identical fixture came back identical: focus th 272 / td 407 and kb table 386px; pop-out th 392 and kb 348px; tile th 82 / td 123 and kb 757px; outline scroll 1624 = max.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/2/5 | focus | data | flat block → table as first child, rows in file order, verbatim | pass | kb.md first=`TABLE.frontmatter`, 11 rows `id=reader-plan-sticky-once-named` … `supersedes=[]`; hr=0; table 332,150–1012,536 inside article 300,122–1044,720 |
| REQ-1/2/5 | tiles 3×2 | data | same | pass | same 11 rows, first=`TABLE.frontmatter`; table x 16–221 inside article 2–235 |
| REQ-1/2/5 | pop-out | data | same | pass | same 11 rows; table 32,57–1012,405 inside article 0,29–1044,720 |
| REQ-1 (CRLF/BOM/trailing ws) | focus / tiles / pop-out | data | recognised; body unaffected | pass | crlf.md rows `id=crlf`,`status=ok`; headings `H1:CRLF Body`; hr=0 in all three |
| REQ-3 | focus / tiles / pop-out | data | nested YAML → one `pre.frontmatter`, inner text verbatim | pass | textContent byte-equal to the inner block, incl. `notes: \|\n  # Not a heading\n…`; tables=0; only heading `H1:Raw Body` |
| REQ-4 | focus / tiles / pop-out | data | empty/comments-only → nothing, stripped | pass | empty.md first=`H1`, no table, no pre, hr=0 |
| REQ-5 | focus / tiles / pop-out | data | `<img onerror>` / `<script>` values literal | pass | td text `<img src=x onerror="window.__fmXss=1">`, `<script>window.__fmXss=2</script>`; img=0, script=0, `window.__fmXss` unset |
| REQ-6 / W17 | focus / tiles / pop-out | data | no heading from frontmatter (flat, raw, empty) | pass | kb.md headings=`["H2:Tail Heading"]`; raw.md `["H1:Raw Body"]`; empty.md `["H1:Empty Body"]`. Outline list text not captured, see Note 1 |
| REQ-6 | focus | data | outline pointer click reaches the body heading | pass | click `Tail Heading`: scrollTop 1624 = max 1624; `h2#tail-heading` top 627 inside article 122–720 |
| REQ-7 | focus / tiles / pop-out | data | no frontmatter / unclosed fence render as before | pass | nofm.md first=`H1`, later `---` kept (hr=1); unclosed.md first=`HR`, `H1:Unclosed Body` kept |
| REQ-10 / W16 | tiles 3×2, explorer open | data | no horizontal scroll; values and keys wrap | pass | article scrollW = clientW = 233 for all 10 fixtures; th 82 / td 123; thOverflow=0 on every th, incl. the 60-char key and `verified_claude_code_version` |
| REQ-10 | tiles 3×2, explorer closed | data | no horizontal scroll | N/A — not re-driven; the CSS/JS bundle is byte-identical to cycle 2, which measured 423 = 423 | |
| REQ-10 | focus | data | no horizontal scroll; `table-layout: fixed` | pass | scrollW = clientW = 744 for all 10 fixtures; computed `tableLayout: fixed` |
| REQ-10 | pop-out | data | same | pass | scrollW = clientW = 1044 for all 10 fixtures |
| Raw fallback reach | focus / tiles / pop-out | data | long raw line is reachable | pass | `pre.frontmatter` `overflow-x:auto`, scrollW 2342/1924/2342 > clientW 678/203/978; the article itself never scrolls horizontally |
| Visible | all hosts | data | table/pre computed visible | pass | display `table`/`block`, visibility visible, opacity 1 in every host |
| Settled / live re-render | tiles 3×2 | data | routed Write re-renders one table with the new values | pass | after the Write hook and a 1.5 s settle: rows `id=some-fact`,`status=two`,`extra=added`; first=`TABLE.frontmatter`; 233 = 233 |
| REQ-8 (E1) | focus | data | after a `/clear` pair, the slot keeps the plan and its badge | pass | `/api/state` plan `{path:…/probe-plan.md, exists:true}`; slot=1 `plan probe-plan.md`, badge=1, noplan=0 |
| REQ-8 | focus | data | opening the retained plan from the slot renders it | pass | pointer click on the slot: body first=`TABLE`, row `status draft`, `Probe Plan` |
| REQ-8 | tiles 3×2 | data | same retention | pass | slot=1, noplan=0; the bar is on `notes.md`, so badge=0 is correct; `/api/state` agrees |
| REQ-8 | pop-out | data | same retention | pass | slot=1, noplan=0; the bar is on `notes.md`, so badge=0; `/api/state` agrees |
| REQ-9 / ec 2,3,6,7,9 (daemon plan rules) | focus | data | straggler, out-of-order clear, deleted transcripts, new plan, deleted plan, restart | N/A this cycle — no daemon source changed since cycle 2 (only `reader_test.go`), and the committed E1/E2 specs are green in the c3 gate run; cycle 2 drove every one of these cells | |
| States: no data | all hosts | no data | no frontmatter node before a render | N/A — plan § States: frontmatter exists only after a render, and the host placeholder logic is unchanged | |
| States: daemon-down | tiles 3×2 | daemon-down | last render incl. table kept; down surfaced | pass | after SIGTERM: 11 rows, display table, 233 = 233; banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; reader status `musterd unreachable — showing last render` |
| States: daemon-down | pop-out | daemon-down | same | pass | xss.md table kept (2 rows), 1044 = 1044; status `musterd unreachable — showing last render` |
| States: daemon-down | focus | daemon-down | same | not measured — see Note 2 | |
| Keeps focus | all | data | — | N/A — the frontmatter path adds no focusable element | |
| Hidden | all | data | — | N/A — this plan adds no `[hidden]` toggling | |
| §6/§7 honesty & terminal | all | all | — | pass | no new gauge, cost, "Done" or pane styling; daemon-down is surfaced by the banner and the reader status line |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** My probe's outline-list selector did not match the nav's DOM. It returned `nav-closed` for every row, so I have no outline entry texts this cycle. REQ-6 rests on two things instead:
   - The body headings in every host: frontmatter produced no heading.
   - The focus outline click: `outlineEntry(region, "Tail Heading")` resolved and scrolled to max.

   Cycle 2 captured the lists: kb `["Tail Heading"]`, raw `["Raw Body"]`, empty `["Empty Body"]`. The bundle is byte-identical to that build, so I see no reason for them to have changed.
2. **[note]** The focus daemon-down cell was not measured. After SIGTERM, my `Meta+Backslash` did not leave Tiles. The `readerRegion(page, "probe")` I then measured was the tile's own reader: box 2,149–425,389, the same as the tiles row. So the measurement is not a focus reading, and I report nothing for that cell. Cycle 2 measured it on the identical bundle, with the table kept and the status line and banner present. Whether the view shortcut should work while the daemon is down belongs to the views feature, not to this plan.
3. **[note]** Cycle 2 Note 1 still stands, with the same geometry. The key column is a fixed 40% on wide hosts (272px in Focus, 392px in the pop-out). No change requested.

## Maintainability review

# Maintainability review: frontmatter

**Plan**: frontmatter
**Part verdict**: approved
**Cycle**: 3
**Pack**: `kb: pack 10993 words (budget 8000)`, over budget (WARN)
**Scope**: 14 files from `git diff main...HEAD -- cmd internal web/src` (tests excluded), unchanged from cycle 2. This cycle's delta against the cycle-2 review commit (`b0bd83c..HEAD`) touches only two in-scope files, `web/src/features/reader.ts` and `web/src/style.css`, both comment-only. It also touches one test file, `internal/server/reader_test.go`, which is outside the diff. All three were read line by line. The other 12 files have not changed since cycle 2 approved their shape.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| web/src/style.css | the surrounding `.md table` rules | n/a (comment only this cycle) | n/a | pass (cycle 2 Minor 1 resolved) |
| web/src/features/reader.ts | reader/*.ts (cycle 1/2) | n/a (comment only this cycle) | filelen 609 (610 on main) | pass (cycle 2 Minor 1 resolved) |
| internal/session/manager.go | unchanged since cycle 2 | yes | filelen 1810 (1751 on main); funlen `rowToSession`/`sessionToRow` are untouched by this branch and have only shifted lines | pass |
| internal/server/{reader,readerwire,sessionwire}.go, internal/session/session.go, internal/store/session.go, web/src/{protocol.ts,reader/frontmatter.ts,reader/markdown.ts} | unchanged since cycle 2 | yes / n/a | protocol.ts filelen 970 (967 on main, the growth is comments); `InsertSession` funlen predates this branch and is untouched | pass |

**Cycle 2 Minor 1 is resolved.**
- The `style.css:1035-1041` comment now states only the current constraint. Auto table layout treats `width`/`max-width` as a hint, and `table-layout: fixed` turns the key column's 40% into a hard cap. The Playwright measurements and the reference to the review cycle are gone.
- The `reader.ts:449-451` comment now says only that the listing's plan is a fallback while `session` is unknown. It cites `kb:adr/reader-plan-sticky-once-named`, and the REQ-8/E5 history is gone.

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** Cycle 2 Notes 1–6 still stand unchanged. Note 1 was the pre-existing check-then-act on `PlanPath` in `observeWrite`, and commit f8d4699 has now proposed it in `plans/frontmatter/proposed-backlog.md`. Note 2 was `os.Stat` under `Manager.mu`, and its stated reason still holds.
2. **[note]** The new `transcriptB` comment in `internal/server/reader_test.go:1068-1073` (test file, outside the diff) explains why the file is written for real by stating the current reason, with no history narration. `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` has a funlen hit (46 statements), but that function predates this branch and this cycle did not change it.
