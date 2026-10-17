# Correctness review: Docs Search Bar

**Plan**: docs-search-bar
**Verdict**: approved
**Cycle**: 4
**Pack**: kb: pack 16530 words (budget 30000)

This is a delta cycle: cycle 3's only open agent-tagged issues were Minors. I read `git diff 66d3baf2..HEAD`, which covers fix `b4dbef2f`, tests `f02d6b1e` and two `chore` state commits, and checked each cycle 3 Minor against it. The only non-test source change is 4 lines inside `renderFindBar` (`web/src/render/readerfind.ts:62-65`). That is exactly the scope of correctness Minor 1 / browser Minor 1, so I did not re-read §3–§6 in full. Requirement rows the diff does not touch carry over from cycle 3.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 – REQ-6 | Unchanged since cycle 3. The diff touches no icon, placement, matcher, highlight or count path | as cycle 3 | pass |
| REQ-7 | Yes. The `:has()` padding rule is unchanged. Compensation still runs only when `bar.hidden` flips with `top > 0`, so at scrollTop 0 the first line is still pushed clear of the bar (E10 green). The end-of-body clamp is fixed: `scrollTop` is now read before the flip and assigned absolutely (`readerfind.ts:62-65`) | E10, the 4 mid-document tests, and 8 new end / near-end tests (`reader-search.spec.ts:1785-1857`) | pass |
| REQ-8 – REQ-13 | Unchanged since cycle 3 | as cycle 3 | pass |
| DIAG | `kb:diagram/web-components`. The diff adds no module, import or edge | — | pass |

## Build & Tests

E2E tests: pass (956) · Daemon tests (race): pass (25 packages ok, 0 FAIL) · Web tests: pass (96 files, 2761) · Daemon build: pass · Web build: pass · Lint: pass. All read from `$GATES_LOG_DIR` (`gates-c4`, 0 failed lines).

- E2E: 956 passed (`17-e2e.log`). That is cycle 3's 948 plus the 8 new tests, and all 8 appear by name (`#668`–`#675`).
- Daemon tests: `02-test.log`.
- Web tests: `05-web-test.log`.
- Daemon build: `01-build.log` is empty.
- Web build: `04-web-build.log`. The chunk-size warning was already there before this plan.
- Lint: golangci-lint reports 0 issues (`03-lint.log`), and biome checked 337 files clean (`06-web-lint.log`).

The other gate lines are green too:
- contrast `07`: 54 pairs, 0 failures in each of the three themes
- features-inventory `08`: silent
- versions `09`: fresh
- e2e-honest `10`: silent
- kb check `11`: 607 records, 0 problems
- e2e-lint `12`: clean
- features-scope `13`
- comments `14`: clean
- comment-ledger `15`

The `16-size.log` WARN lines (features/reader.ts 698, render/reader.ts 559) are unchanged and belong to review-maintainability.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-test` | pass (deduped to `05-web-test.log`: 96 files, 2761 tests) |
| W4 | `make web-build` | pass (deduped to `04-web-build.log`) |
| W5 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| E1 | `make e2e` | pass (deduped to `17-e2e.log`: 956 passed) |
| C1 | `make check` | pass (`18-C1.log`: lint 0 issues, `go test` all ok, biome, vitest, contrast, e2e-lint, versions, kb check) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This fix wave's log (Fix Attempt 4) carries only a `design:` line: no `deviation:` and no `doc-delta:`. The plan's Doc Delta sentence and `doc-delta.md` are unchanged and still true. The fix shifts only `scrollTop`, and the padding that reserves the top while the bar is open is untouched |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W6 | no `any` types in new web code | pass | Grepped the added lines of `git diff main...HEAD -- web/src` for `\bany\b`: no hits |
| W7 | body never mutated by search | pass | Same added lines: no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `splitText` or `<mark`. The changed lines write only `body.scrollTop` |
| W8 | highlight/bar colours in all three themes | pass (tokens + gate) | No token or CSS change since cycle 3 (`git diff 66d3baf2..HEAD -- web/src/style.css` is empty). `make contrast` 54 pairs, 0 failures ×3 |
| W9 | Cmd+F is a binding-table row | pass | `shortcuts.ts` is untouched since cycle 3 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (web-only diff, 4 source lines) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass (no daemon change) |
| 4 | Bare tmux | pass (no tmux in the diff) |
| 5 | Payload logging | pass (no logging added) |
| 6 | Empty-gauge dishonesty | pass (no gauge path touched) |
| 7 | Session identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (the new tests use the shared `daemon` stub fixture) |

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 3 correctness Minor 1 `[web-impl]` "capture `scrollTop` before the flip and assign it absolutely" (same defect as browser Minor 1's `[web-impl]` half) | `b4dbef2f` | Diff read. `renderFindBar` now runs `const top = body.scrollTop;` before `refs.bar.hidden = barHidden`, then `if (top > 0) body.scrollTop = top + topPadding(body) - before;`. This is the change the cycle 3 probe (`probe-fixed.mjs`) showed holds at the bottom. Nothing else in the file changed. I traced the arithmetic. At the end: open sets `max0 + Δ`, the new max, and close sets `max0`. 10 px short: open sets `max0 − 10 + Δ`, close sets `max0 − 10`. At `top == 0` nothing moves, as before. The browser half is re-measured by review-browser |
| cycle 3 correctness Minor 2 `[e2e-specs]` "one case with the body scrolled to its maximum … red against HEAD, green after the fix" (same as browser Minor 1's `[e2e-specs]` half) | `f02d6b1e` | Diff read. `expectScrolledTextStillAcrossBar` gains a `where` argument: `mid` is the default, so the 4 cycle 2 tests are byte-identical in behaviour. `end` and `near-end` (10 px, inside Δ) are each run in Focus, the pop-out, 2×2 and 3×2. Each asserts paragraph 80's y after Escape and after the close button, both right away and a render tick later. `end` also asserts the body is still at its very end (`< 1` px), which is the "left short of its end" half of the symptom. Red proof (`test-specs.md` § Fix Attempt 3) used a scratch copy with the old `+=` restored: 8 failed, 4 passed, with Δ 22 at the end in Focus and 18 near the end in tiles, matching the reviewers' measurements. All 8 are green in `17-e2e.log`. The Repairs table is "none" and the diff only adds to the e2e file |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Still out of my scope and unchanged (a code comment the branch did not add): `web/src/features/shortcuts.ts:3-4` says "the one `window` keydown listener for every bound chord". ⌘F is a bound chord, but each reader root dispatches it. `doc-delta.md` § "Not a doc edit" routes this to the comment pass.
2. **[note]** Test honesty: the new tests repaired no flake, so no soak was due from me. The spec agent soaked `reader-search.spec.ts` 480/480 (`make e2e-soak … N=10`). The fixture shape is `daemon`, which matches the plan header.
