# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 57444 words (budget 20000)

This is a full cycle, not a delta: cycle 1 had Criticals. Since `review_commits[1]` (`2a12f7f`), the non-plan diff is `627d509` (`web/src/style.css`) and `02c9493` (`cmd/musterd/main.go`, `internal/server/{bgloop,launcher,reporefresh}.go`), plus the plan amendment `4a4ecc9`. I re-read those files in full where they changed. Cycle 1's findings on everything else still hold against an unchanged tree.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `reporefresh.go` `tick` → `SetRepoState` | Yes: `TestRepoPoll_BranchFollowsCheckouts`, `_DeadSessionIsNotPolled`, E1, dead-neighbour E2E | pass |
| REQ-2 | Yes, now. `readRepoState` returns `(state, ok)`, with `ok = ctx.Err() == nil && isDir(t.Directory)` after the git reads. `tick` skips `SetRepoState` on `!ok`, which closes cycle 1's stat-to-git window and the timeout window | E2E yes: REQ-2 test 250/250 in my soak (was 248/250). The new `ok` branch has no deterministic unit test (Major 1) | pass (coverage gap: Major 1) |
| REQ-3 | Yes (unchanged) | Yes | pass |
| REQ-4 | Yes (unchanged) | Yes | pass |
| REQ-5 | Yes. `deriveLocation` now reads branch and worktree flag through `checkoutState`, with the same calls in the same order, so behaviour is unchanged | Yes: `TestRepoPoll_ClaudeLocationMatrix`, E2/E3/E7 | pass |
| REQ-6 | Yes (unchanged) | Yes | pass |
| REQ-7 | Yes (unchanged) | Yes | pass |
| REQ-8 | Yes (unchanged) | Yes | pass |
| REQ-9 | Yes (unchanged) | Yes | pass |
| REQ-10 | Yes. The `↳` block layout is now one selector list for `.r2c` and `.mainhead .meta .claude-at`. Host-only rules stay per host | Yes: W1, E10 | pass |
| REQ-11 | Yes (compact rules unchanged; the comment was reworded) | Yes: E10 compact | pass |
| REQ-12 | Yes | Yes: W2, E2 | pass |
| REQ-13 | Yes. `.meta .rf`/`.rb` keep their 30ch/44ch caps. `.thead .nm` gains `flex: 0 1000 auto; min-width: 5rem`, which is what `c-long-names.html:89` has | Yes: E11 | pass |
| REQ-14 | Yes | Yes: W3, E4 | pass |
| REQ-15 | Yes | Yes | pass |
| REQ-16 | Yes: the shared `.lead` rule keeps `--fg-muted` and `.r2c` keeps `--fg-dim` | Yes: colour E2E | pass |
| REQ-17 | Yes | Yes: E12 | pass |
| DIAG | `daemon-components` (gitutil row, `server → gitutil`), `one-launch-end-to-end` (step 37 "is this a repo, which branch, is it a worktree": `repoContext` still does exactly that, now through `checkoutState`), `store-schema`, `domain-model`: true. `web-components`: the `render/` box says "28 modules". There are 29 on `main` and 30 here, because this plan added `render/repolines.ts` (Major 2) | — | **fail** |

## Build & Tests

E2E tests: pass (540 passed, 4.2m) · Daemon tests (race): pass (24 `ok`, 0 FAIL) · Web tests: pass (77 files, 1993) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`, web lint 266 files clean). All read from `$GATES_LOG_DIR` (`…/gates-stale-dirs-models-branches-c2`). Baseline lines: contrast pass (43 pairs × 3 themes, 0 failures), versions pass, e2e-honest pass, kb-check pass (490 records, 0 problems), dead-refs pass (0 missing), e2e-lint clean, features pass (actions included), comments **pass** (`comment-checks: clean`, cycle 1's red line is fixed), size WARN (review-maintainability's).

Reviewer soak (02c9493 fixes the REQ-2 flake, and ```checks soaks nothing): `make e2e-soak SPEC=card-location.spec.ts N=10`, run in the foreground on a clean tree, gave **250 passed (3.0m)**. Cycle 1's run of the same soak gave 248/250, with both failures in REQ-2.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (540 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Cycle 1's `[orchestrator]` Major 2 is resolved by `4a4ecc9`, which amends § Daemon flag in the plan to say that `0` still runs once at start. The plan says this is not a wire change, and that is true (`docs/protocol.md` already said "start, every `-repo-poll`, and on a nudge"). The new log entries add no `deviation:` and no `doc-delta:` lines. The `design:` lines are maintainability's. Every Doc Delta line is still true: the REQ-2 fix strengthens "a dead card keeps its last-known branch" and contradicts no line. The `web-components` count is filed separately as Major 2 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | Cycle 2 touches only `style.css` in `web/`. Cycle 1's evidence stands |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | Shared `.lead` → `--fg-muted`. `.r2c` → `--fg-dim`. `.claude-at` inherits `.meta`'s `--fg-dim`. No state token. `make contrast` 0 failures |
| W11 | Rendered card, Focus header, tile header match `c-long-names.html` | pass on CSS read; the rendered comparison is review-browser's | `.thead .nm` now has the mockup's own `flex:0 1000 auto;min-width:5rem` (`c-long-names.html:89`). The impl log measured `.nm` at 75 px for tile widths 398–638 px |
| D15 | No git subprocess under the manager lock | pass | Unchanged shape. The extra `isDir` in `readRepoState` is a stat outside the lock, and `checkoutState` runs inside `readRepoState`/`repoContext` with no lock held |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | `rg 'hook_event_name|rate_limits|permission_mode|current_dir|"cwd"'` over the four changed Go files finds nothing |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the changed Go files contain no Claude-Code key names |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: not touched |
| 4 | tmux via `-L muster` / sizing | pass: no tmux added |
| 5 | No payload logging | pass: no new log line |
| 6 | Empty-gauge honesty | pass: the `!ok` path keeps last-known rather than writing `repo: null` for an unread directory |
| 7 | Identity on tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass |

## Cycle 1 findings re-checked

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| correctness Critical 1 `[web-impl]`: `comments` gate red on `style.css:2429` `REQ-11:` | `627d509` | Diff read. The comment now opens with the reason and cites `kb:adr/rail-repo-line-wraps-at-slash`. Gate line 14: `comment-checks: clean` |
| correctness Critical 2 `[daemon-impl]`: REQ-2 race nulls `repo` | `02c9493` | Diff read. A post-read `isDir` covers the stat-to-git window, and `ctx.Err()` covers timeout and shutdown. Soak 250/250. A deterministic test is missing (Major 1) |
| correctness Major 1 `[daemon-impl]`: `-repo-poll` help false | `02c9493` | `main.go:163` now reads "runs at start and when Claude's reported directory changes", which matches `runTicked` and `TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge` |
| correctness Major 2 `[orchestrator]`: unamended `doc-delta:` | `4a4ecc9` | Plan § Daemon flag amended, and the wording matches the shipped behaviour |
| correctness Minor 1 `[daemon-impl]`: `runTicked` names `repoRefresher` | `02c9493` | `bgloop.go:42` now says `repoRefreshFeature` |
| browser Minor 1 `[web-impl]`: tile title squeezed | `627d509` | The CSS matches the mockup's floor. The live measurement is review-browser's |
| maintainability Minors 1–4 | `02c9493`, `627d509` | The shape is review-maintainability's. On the statement side: the new `checkoutState` doc comment ("the one place both are read, for the launch directory … and for the directory Claude is working in") is true (`rg 'gitutil\.(Branch|IsWorktree)' internal --glob '!*_test.go'` → only `checkoutState`). The new `.r2c, .claude-at` comment ("Each host adds only its own ground") is true of the rules that follow |

## Issues

### Critical
None.

### Major
1. **[daemon-tests]** The cycle-1 Critical 2 fix has no deterministic test. The new `ok == false` branch of `readRepoState` (`internal/server/reporefresh.go`, `return state, ctx.Err() == nil && isDir(t.Directory)`) and `tick`'s `if !ok { continue }` are covered only by the REQ-2 E2E. That test hit the race 2 times in 250 before the fix, so it is a probabilistic guard. Delete the `!ok` check and every Go test still passes. `TestRepoPoll_CancelledContextReadsNothing` covers only the loop-start `ctx.Err()` return in `tick`, not the per-read deadline. Both paths can be tested deterministically from package `server`, with no new seam:
   - (a) Call `readRepoState` with a `session.RepoTarget` whose `Directory` does not exist. This is the "vanished after tick's stat" case, because `readRepoState` itself does not stat first. Assert `ok == false`.
   - (b) Call it on a real checkout with an already-cancelled context. Assert `ok == false`.
   - (c) Call it on a real checkout with a live context. Assert `ok == true` and the branch, so the guard is not vacuous.
2. **[orchestrator]** `kb:diagram/web-components` (`docs/diagrams/web-components.md:55`) says `render/` has "28 modules". `main` has 29 non-test `.ts` files there, and this branch has 30, because the plan added `render/repolines.ts`. The diagram was already stale before this plan, and the plan made it more so. While editing it: `features/` says 24 and has 26, and `api/` says 8 and has 10. Both counts are the same on `main` and here, so neither drift comes from this plan. Diagram upkeep is doc work, so this item does not block approval. In cycle 1 I marked DIAG pass without counting; maintainability Note 6 had flagged it.

### Minor
None.

### Notes
1. **[note]** `readRepoState`'s doc comment says that a git failure on an existing directory "for any other reason" stays "not a checkout". The impl log argues this is a persistent condition, so the null is the honest reading. I accept that for REQ-2, whose scenario is a deleted directory. A transient non-timeout git failure on a live checkout (for example an `index.lock` race during a user's checkout) can still null `repo` for one tick. The next tick restores it, because the directory is still a checkout, so the damage is a one-tick flicker, not a permanent loss.
2. **[note]** The shared `↳` block rule now gives the rail card's `.r2c` `min-width: 0` and `line-height: 1.35`, which it inherited before. The Focus header's column gap went from 4 px to 5 px. The impl log states both changes. Whether either is visible is review-browser's to measure.
3. **[note]** The working tree was clean when I started, with no scratch spec present. I wrote no files besides this one.
