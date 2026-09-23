# Correctness review: Frontmatter

**Plan**: frontmatter
**Verdict**: approved
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
