# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 4
**Pack**: kb: pack 57929 words (budget 20000)

This is a full cycle, not a delta. Cycle 3 left agent-tagged Majors open: correctness Major 2 `[web-tests]`, plus the browser and maintainability Minors. This cycle's commits are `a3e1839` (decision record), `061f424` (web, `style.css` only), `03e77bd` (web tests), `da49b6b` (orchestrator docs), `0b95fc0` (e2e) and `fbf94a1` (state). No daemon file changed. Browser Minor 2 was settled by the developer as option B (`decisions/focus-header-wraps-before-repo-drops`), and I review against that outcome without reopening it. I read every change in full. Files this cycle did not touch keep their cycle 1–3 results.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-9 | Yes (no daemon change this cycle) | Yes (unchanged; race suite green) | pass |
| REQ-10 – REQ-12 | Yes. The shared `↳` rule now owns `--lead-gap: 5px`, and `.lead`'s `padding-right` and the header's `↳` floor read it. The computed value is unchanged (web-impl measured 5 px on both hosts) | Yes: the density line-height tests and E10/E2 are green in the gate run | pass |
| REQ-13 | Yes, per decisions A and B. `.meta`'s first track is `minmax(calc(var(--floor) + var(--sep-gap)), max-content)`. That makes `.meta`'s `min-content` (its flex basis) one repo block at its floor, plus the model and `.ended-at`, so the header wraps before the repo block can drop below its floor. The model still never truncates. The free-space priority is inverted: `.name` has `flex: 1000 1 6rem` and `.meta` has `flex: 1 1 min-content` | Yes: `repoProblems` and `blankProblems` are new in `mainheadFitProblems`. There are 18 new short-name width tests and 4 sweep tests (1440→700→1440 in 16 px steps). `mainheadTitleEllipsized` proves the blank check was live. e2e-specs records three red proofs, one per reverted rule | pass (but see Major 2 on the comment) |
| REQ-14 – REQ-17 | Yes (unchanged) | Yes | pass |
| DIAG | `kb:diagram/web-components` (from `kb for web/src/style.css` and the two test files). This cycle adds no module or import, so the diagram's claims are unaffected. The `features/` and `api/` counts are still off, as on `main` (cycle 3 Note 3) | — | pass |

## Build & Tests

E2E tests: pass (583 passed, 4.6m) · Daemon tests (race): pass (all packages `ok`, 0 FAIL) · Web tests: pass (77 files, 1993) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web lint 266 files). All of this is read from `$GATES_LOG_DIR` (`…/gates-stale-dirs-models-branches-c4`), which has 0 failed lines.

Baseline lines: contrast pass (43 pairs × 3 themes, 0 failures) · versions pass · e2e-honest pass (empty log) · kb-check pass (492 records, 0 problems) · dead-refs pass (0 missing) · e2e-lint clean · features pass · comments `comment-checks: clean` · size WARN (16 hits; review-maintainability's, and none is in a file this cycle touched).

No soak from me. This cycle repairs no flaky spec (the only Repairs row strengthens an assertion that never failed), and e2e-specs already ran `make e2e-soak SPEC=card-location.spec.ts N=10` → 680/680.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (583 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**. The TODO tick and the `proposed` ADRs with `refs: plan:` are in place, and cycle 3 Major 1's order error ("repo hides first") is corrected. But the new text says the reverse of what shipped about the title and the `↳` block, and the cycle 2 ADR still claims the repo readout may vanish. Both are in Major 1 `[orchestrator]` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | This cycle's TypeScript is test code only. The new `FitBlock`/`FitSnapshot` fields are typed, and `locSeps` is `FakeNode[]` |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | No colour declaration changed. Contrast reports 0 failures |
| W11 | Card, Focus header and tile header match `c-long-names.html` | pass on CSS read; the rendered comparison is review-browser's | Below the mockup's width, the header follows the two decided ADRs |
| D15 | No git subprocess under the manager lock | pass | No Go change this cycle |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | No Go change this cycle |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: CSS and tests only, no Claude-Code key names |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: not touched |
| 4 | tmux via `-L muster` / sizing | pass: no tmux added |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: `.model` still renders `unknown` for a null model (unchanged) |
| 7 | Identity on tmux target | pass: not touched |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass: the e2e fixtures post synthesized hooks only |

## Cycle 3 findings re-checked

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| correctness Major 1 `[orchestrator]`: give-way order backwards, and the Doc Delta missing the wrap | `a3e1839`, `da49b6b` | The repo-vs-`↳` order is now right (the repo block never hides), and `doc-delta.md`'s focus amendment carries the wrap and the third row. The same edit introduced a new false clause about the title: see Major 1 |
| correctness Major 2 `[web-tests]`: `fakeMeta` describes the wrong markup | `03e77bd` | Diff read against `web/index.html:80-89`. The fake now has two `.sep`s inside `.loc` and one in `.ended-at`, and the doc comment matches the real tree. The three tests assert `locSeps` hidden as `[true, false]` unmoved and `[false, false]` moved, so a renderer that toggled the last `.sep` would fail |
| browser Minor 1 `[web-impl]`: blank `.loc` beside an ellipsized title | `061f424` | CSS read: the title now takes free space first, so it is ellipsized only while `.meta` sits at its basis. Red proof 2 in test-specs turns `blankProblems` red on the old priority. One residual case remains, for folder lines under 8 characters: see Major 2. The live measurement is review-browser's |
| browser Minor 2 `[orchestrator:decision]` → B | `061f424` | Implemented as decided: `.meta`'s track minimum is the repo block's floor, so the wrap happens first. `repoProblems` asserts the repo block on `.loc`'s first line at every sweep width |
| browser Minor 3 `[e2e-specs]`: helper blind to blank `.loc` | `0b95fc0` | `blankProblems` reports `.loc` wider than its last first-line block plus its margin (1 px tolerance) while `.rename` is ellipsized, and the tests prove the title was ellipsized. The Repairs row is a strengthening: the title got longer and no assertion was removed |
| maintainability Minor 1 `[web-impl]`: three hand-copied length pairs | `061f424` | Diff read. `--loc-lh` and `--loc-h` feed `.loc`'s `line-height`, its height and `::before`'s height. `--lead-gap` feeds `.lead` and the `↳` floor. `--sep-gap` feeds the margins, the track minimum and `.sep { left }`. `--floor` feeds both block floors and the track minimum. No old literal (`2.7em`, `1.875ch`, `calc(1ch + 5px + 8ch)`) remains |

## Issues

### Critical
None.

### Major
1. **[orchestrator]** The give-way order is now documented backwards for the title, and the cycle 2 ADR still contradicts decision B.
   - **The title clause.** Three places say "as the row narrows the title gives up width first, then the `↳` block hides whole": `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md` (Decision), `docs/design/design-system.md:234-235` (§5 Focus mainhead) and `plans/stale-dirs-models-branches/doc-delta.md` (focus amendment). What shipped is the reverse. `061f424` gives `.name` `flex-grow` 1000 against `.meta`'s 1. As the row narrows, `.meta` absorbs the whole shortfall down to its basis first, and that basis has no `↳` block. Only then does the title shrink. web-impl's own log says so: Fix Attempt 4, item 4, "The title now outranks the `↳` block … gone from 1248 down". So does its `doc-delta:` line ("the title takes free space ahead of the meta"), and so do the `style.css` comments on `.mainhead .name` and `.mainhead .meta`. The Doc Delta did not carry that `doc-delta:` line as written. doc-reconcile would promote the false order verbatim into `docs/features/focus/spec.md`.
   - **The cycle 2 ADR.** `docs/adr/focus-model-never-truncates-name-blocks-give-way.md` still says, in its summary, "the repo and ↳ name blocks give way first". Its Decision says "those blocks hide or collapse". Its Consequences say "the Focus header may show no repo readout". Under decision B the repo block never hides. Both ADRs are `proposed` on this plan.
   - **Fix:** in all three places, say that the `↳` block gives way first (whole, never half-drawn), then the title ellipsizes, and that the repo block never hides. Then amend the cycle 2 ADR's summary and Consequences so that only the `↳` block gives way, and point it to the wrap ADR for the repo block. Run `make gen-kb`.
2. **[web-impl]** The new comment on `.mainhead .name` (`web/src/style.css`, the `flex: 1000 1 6rem` rule) is false for a folder line shorter than 8 characters.
   - **What it says:** "a title is only ever ellipsized while `.meta` sits at its floor, so `.loc` never holds room the title could have used".
   - **Why it is false:** `.loc`'s grid track has a fixed minimum, `var(--floor) + var(--sep-gap)` (8ch + 2.75ch). The repo block, though, is clamped to its text by `max-width: max-content`. So a folder line like `api /` or `web /` (5 ch) leaves about 3ch of blank space inside `.loc`, right beside the ellipsized title. That is exactly the cycle 3 browser Minor 1 condition. web-impl names this limit in its log (up to about 47 px). e2e-specs names it as uncovered, in the helper's doc comment and in the spec. Only the code comment states the opposite, as an absolute.
   - **Fix:** make the comment true, either by stating the short-folder exception, or by closing the gap so the track minimum follows the repo block's own width when that is under the floor. Whether the residual blank still counts as browser Minor 1 is review-browser's measurement.

### Minor
None.

### Notes
1. **[note]** The priority inversion in `061f424` has a product side. With a long title, the `↳` block now gives way to the title well above the wrap: web-impl measured it gone from 1248 px down with long names moved, and from 1312 px down with the bypass chip. Before this cycle, the `↳` block outranked the title. No requirement orders the two, and cycle 3 Minor 1 asked only that no blank `.loc` sit beside an ellipsized title. So I file only the doc statement (Major 1), not a decision. If the developer would rather keep the `↳` readout ahead of the title, that is a fresh `[orchestrator:decision]`.
2. **[note]** The "short names" fixture's folder is `muster-app`, whose folder line (`muster-app /`, 12 ch) is above the floor. So the suite deliberately never exercises Major 2's case, and both test files say so. If web-impl closes the gap instead of rewording the comment, a folder of under 6 characters would need its own row.
3. **[note]** `plans/stale-dirs-models-branches/review.maintainability.md` is untracked in the tree (review-maintainability's in-flight part). I wrote no scratch spec, and the only file I wrote is this one.
