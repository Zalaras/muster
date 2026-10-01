# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: approved
**Cycle**: 5
**Pack**: kb: pack 57973 words (budget 20000)

This is a verification cycle the developer asked for. It is a full review of what changed, not a §0 delta cycle, because cycle 4 left agent-tagged Majors open. At the developer's instruction, the orchestrator made the cycle 4 fixes itself. The commits since `review_commits[4]` (`3a4a3a6`) are:

- `65b108b`: docs, the give-way order
- `7f47a09`: state
- `dfb8100`: web, `fitMainheadMeta`, the pane `ResizeObserver` and `--loc-cap`
- `2b69b3c`: tests, the unit fake, the e2e helper and the tiny-name fixtures
- `2ad0ac2`: the decision record and the ADR's Consequences
- `dcd5b17`: archive
- `949f640`: the web log's Fix Attempt 5. This landed after the gate run, but it changes only a plan log.

No daemon file changed. Browser Minor 3 is settled as option A (`decisions/claude-at-may-reappear-on-wrap`), and I did not reopen it. I read every changed source and test file in full. Files this cycle did not touch keep their cycle 1–4 results.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-9 | Yes (no daemon change this cycle) | Yes (unchanged; race suite green) | pass |
| REQ-10 – REQ-12 | Yes (unchanged) | Yes | pass |
| REQ-13 | Yes, per decisions A and B, and now per decision A of cycle 4. `fitMainheadMeta` (`web/src/render/mainhead.ts`) first clears `--loc-cap`. It returns early if the meta is not laid out, or if the `↳` block is shown and on `.loc`'s first line. Otherwise it sets `--loc-cap` to the repo block's right edge plus its `margin-right`, minus `.loc`'s left edge. `style.css` uses the cap twice: as `.loc`'s `max-width`, and inside the track minimum `min(var(--floor) + var(--sep-gap), var(--loc-cap, 100vw))`. The fit always measures with the cap cleared, so it cannot feed on its own result. It runs last in `renderMainhead` and from a `ResizeObserver` on `section.main`. That pane is `flex: 1; min-height: 0` (`style.css:606`), so its size does not depend on the header and the observer cannot loop. Hiding the header (`offsetParent === null`) clears the cap. The model still never truncates, and the repo block still never hides. | Yes. `blankProblems` now runs at every width, not only while the title is ellipsized. The `tiny` name set (`api` / `main`, moved `wt`) is added to the 6 widths × 3 states and to both sweeps, which makes 18 + 2 new tests. A viewport resize with no render pass is exactly the `ResizeObserver` path, and the sweep (1440→700→1440) exercises it. Red proof per the web log: 20 of 66 fail on the pre-fix product code, and 66/66 pass with the fix. | pass |
| REQ-14 – REQ-17 | Yes (unchanged) | Yes | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` on `render/mainhead.ts` and `features/focus.ts`). This cycle adds no module or import edge: `features/focus.ts` already imported `render/mainhead`, and now imports one more symbol from it. The diagram's claims are unaffected. | — | pass |

## Build & Tests

All of this is read from `$GATES_LOG_DIR` (`…/gates-stale-dirs-models-branches-c5`), which has 0 failed lines:

- E2E tests: pass (603 passed, 4.8m)
- Daemon tests (race): pass (all packages `ok`, 0 FAIL)
- Web tests: pass (77 files, 1993 tests)
- Daemon build: pass
- Web build: pass
- Lint: pass (`0 issues.`; web lint 266 files)

Baseline lines:

- contrast: pass (43 pairs × 3 themes, 0 failures)
- versions: pass
- e2e-honest: pass (empty log)
- kb-check: pass (492 records, 0 problems)
- dead-refs: pass (0 missing)
- e2e-lint: clean
- features: pass
- comments: `comment-checks: clean`
- size: WARN (16 hits). This belongs to review-maintainability, and none of the hits is in a file this cycle touched.

I ran no soak. This cycle repairs no flaky spec.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (603 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The TODO tick is in `docs/history/todo-done.md:2127-2137`. Both focus ADRs are `proposed` with `refs: plan:stale-dirs-models-branches`. Cycle 4 Major 1's false order is corrected in the wrap ADR, the cycle 2 ADR (summary and Consequences), `design-system.md` §5 and `doc-delta.md`. The new `doc-delta.md` sentences are supported by the code: "The location readout never holds room it does not show … the model follows the location text at every width" holds by `--loc-cap`, and "The `↳` block may show again at a narrower width once the header has gained a row" holds by decision A. One `[orchestrator]` Minor: the ADRs' `files:` lists (Minor 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | `fitMainheadMeta` is typed with `HTMLElement` throughout. The fake's new `style`/`props`/`offsetParent` members are typed. |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | No colour declaration changed. Contrast reports 0 failures. |
| W11 | Card, Focus header and tile header match `c-long-names.html` | pass on the CSS read. The rendered comparison is review-browser's. | The fit only removes width that `.loc` held but did not draw. |
| D15 | No git subprocess under the manager lock | pass | No Go change this cycle |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | No Go change this cycle |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: TS, CSS and tests only, with no Claude-Code key names |
| 2 | No terminal-output state parsing | pass: the fit measures the header's own DOM boxes and never touches pane text |
| 3 | Non-blocking hook handler | pass: not touched |
| 4 | tmux via `-L muster` / sizing | pass: no tmux added |
| 5 | No payload logging | pass |
| 6 | Empty-gauge honesty | pass: `.model` still renders `unknown` for a null model (unchanged) |
| 7 | Identity on tmux target | pass: not touched |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass: the e2e fixtures post synthesized hooks only |

## Cycle 4 findings re-checked

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| correctness Major 1 `[orchestrator]`: the title clause reversed, and the cycle 2 ADR contradicting decision B | `65b108b`, `2ad0ac2` | Diff read. All three places now say "the `↳` block hides whole first … then the title shortens; the repo block never hides". The cycle 2 ADR's summary now reads "the ↳ block gives way first and the header wraps before the repo block would". Its Consequences point to the wrap ADR. Its Decision paragraph keeps the original wording, which is a record of what A decided, and the fix asked only for the summary and Consequences. `make gen-kb` output (`docs/INDEX.md`, `features/focus/INDEX.md`, `.claude/rules/focus.md`) rides the same commit, and kb-check is green. |
| correctness Major 2 `[web-impl]`: the `.mainhead .name` comment was false for folder lines under 8 ch | `dfb8100` | The comment now says the title is ellipsized only while `.meta` sits at its floor, and that room `.loc` would not show (a `↳` block that gave way, a folder line under the floor) is trimmed by `--loc-cap`. Both are true of the shipped code. The gap is closed, not reworded. |
| browser Minor 1 `[web-impl]`: blank `.loc` for short lines and for a `↳` block that gave way | `dfb8100` | Code read (see REQ-13). Both cases cap `.loc` at the repo block plus its `·` room. Grid track sizing clamps `.loc`'s max-content contribution by its `max-width`, so the track and `.meta` shrink with it, and the model follows. When the `↳` block is shown, its own `margin-right` already makes the content at least the track minimum for any realistic name. The tiny moved sweep agrees: green at every 16 px step. The live measurement is review-browser's. |
| browser Minor 2 `[e2e-specs]`: the helper was blind except while the title was ellipsized, and had no sub-floor fixture | `2b69b3c` | `blankProblems` no longer returns early on a whole title: the ellipsis now only annotates the message. `NAME_SETS.tiny` (`api`, no branch, worktree `wt`) runs at the 6 widths × unmoved/moved/ended and in both sweep directions × unmoved/moved. The comments that called the sub-floor case "deliberately not covered" are gone, in both the spec and the helper. |
| browser Minor 3 `[orchestrator:decision]` → A | `2ad0ac2` | `decisions/claude-at-may-reappear-on-wrap/decision.md` records outcome A. It landed in the wrap ADR's Consequences and in `doc-delta.md`. The code does not suppress the reappearance, and the fit measures with the cap cleared each time, so the `↳` block shows wherever it fits. |

## Issues

### Critical
None.

### Major
None.

### Minor
1. **[orchestrator]** Both focus ADRs list `files: [web/src/style.css]` only. The behaviour they decide now also lives in `web/src/render/mainhead.ts` (`fitMainheadMeta`) and in `web/src/features/focus.ts` (the `ResizeObserver`). Because of that, `kb for web/src/render/mainhead.ts` does not surface `kb:adr/focus-mainhead-wraps-to-second-row-when-narrow` or `kb:adr/focus-model-never-truncates-name-blocks-give-way`. Someone editing the fit would not be pointed to the decisions it serves.
   - Fix: add `web/src/render/mainhead.ts` to the wrap ADR's `files:`, and to the cycle 2 ADR's if wanted. Then run `make gen-kb`.

### Notes
1. **[note]** `repoProblems` changed in `2b69b3c` in two ways. Its floor is now `min(--floor, repoNatural)`, where `repoNatural` is the widest `.rf`/`.rb` `scrollWidth`. Its tolerance is now 1 px, where it was `EPS` (0.5 px).
   - The `min` is required by design: a folder line under the floor is drawn at its own width, and the ADR's "never below its floor" means "never squeezed".
   - The extra 0.5 px allows for `scrollWidth` being an integer. For the long and short sets, `repoNatural` is at least the floor, so there the only change is the 0.5 px.
   - I do not count this as a weakening. No Repairs row records it, because the orchestrator made the change, not e2e-specs: `test-specs.md` has no cycle 4 section. The red proof and the change are logged in `web-implementation.md` Fix Attempt 5 instead.
2. **[note]** Every `renderMainhead` pass now forces one synchronous layout: `removeProperty` followed by `getBoundingClientRect`. It is a single read on one header per pass. Whether this costs anything at the render rate is outside a statement review. This is the first `ResizeObserver` in `web/src`, and the web log's precedent check says so. The shape belongs to review-maintainability.
3. **[note]** The `100vw` in `var(--loc-cap, 100vw)` is a no-cap sentinel inside `min()`, which cannot take `none`. It is not a spacing value, so the design-token rule does not apply to it.
4. **[note]** I wrote no scratch spec, and the only file I wrote is this one. `plans/stale-dirs-models-branches/review.maintainability.md` is untracked in the tree: it is review-maintainability's in-flight part.
