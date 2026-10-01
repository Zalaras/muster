# Review: stale-dirs-models-branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 2
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
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

## Browser review

# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 2
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at 5fc71f1, giving `bin/musterd`. Each test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-XXXX`, a path with a space), its own `-tmux-socket` inside that dir (the harness teardown kills it), the E2E stub `claude` via `-claude-bin`, and `-repo-poll 200ms`. Driven in headless Chromium through throwaway specs built on the committed helpers. The specs are deleted; `git status --porcelain` shows only the two sibling review parts.

I read the gates log in `gates-stale-dirs-models-branches-c2` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 540.

This cycle's web fix is 627d509 (a floor for the tile title, and one shared layout for the `↳` block). I measured it first, then re-drove the whole matrix.

Fixtures:
- A 60-character launch folder on an 80-character branch. Two sessions sit in it: one moves into a `.claude/worktrees/` worktree with a 44-character folder on an 83-character branch, and the other stays put.
- A short repo named `muster`, moved into `probewt`.
- A plain directory that is not a git repo, with no hooks posted (the no-data state).
- One-character and three-character session titles.
- A launch directory renamed away while its session is alive (REQ-2).
- A tmux window killed after a checkout (the dead state).
- A resumed-from-list session with no model.
- Viewports of 1280, 1100, 1024, 960, 900, 800 and 700 px.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **strip**: Tiles view, `#tiles-strip`, the same card template as the rail.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-10 | rail | data | two lines, folder over branch, each truncates on its own (comfortable and expanded) | pass | `.rf` 14,139–288,152 and `.rb` 14,152–288,165, both ellipsized (sw/cw 420/274 and 542/274), inside card 0–299; same boxes in expanded |
| REQ-10 | strip | data | two lines | pass | `.rf` 14,690–629,703 and `.rb` 14,703–629,716, inside strip card 0,636–640,800 |
| REQ-10 | rail | no data | `repo: null` gives one line, the basename, no slash | pass | `.r2` holds only `.rf`, text `muster-e2e-plain-…`; `.r2c` `[hidden]` with computed `display: none` |
| REQ-10 | rail, focus | daemon-down | the last snapshot keeps both lines | pass | after SIGTERM, `.rf`/`.rb` are still 274 px wide at y 171/184 under `#banner` 0,46–1280,78; Focus `.rf` and `.claude-at` are still drawn |
| REQ-11 | rail | data, compact | one line, inside the card | pass | `.r2` is `flex`, 130–143; `.rf` 14–131 and `.rb` 137–288 on the same top, both clipped |
| REQ-11 | strip | data, compact | one line | pass | `.rf` 14–279 and `.rb` 286–629 on one 747–760 line |
| REQ-12 | rail | data | `↳` block after the repo block, **same two-line shape** | FAIL | `.r2c` 14,167–288,197 is `grid`, lead 14–21, `.rf`/`.rb` at x 26–288, all ellipsized. But its lines are 15 px tall (line-height 15.19 px) while the `.r2` lines above are 13 px (`normal`). In cycle 1 the block was 26 px; it is now 30 px (Minor 1) |
| REQ-12 | rail | data, compact | `↳` block on one line | pass, with the same line-height gap | `.r2c` is `flex`, 145–160 (15 px), against `.r2` 130–143 (13 px) |
| REQ-12 | strip | data, comfortable and compact | `↳` block inside the card | pass | comfortable 718–748 and compact 762–777, inside cards that end at 800 |
| REQ-12 | rail | no data, dead | hidden | pass | `.r2c` `[hidden]` with computed `display: none` in both; API `claudeLocation: null` for the dead session |
| REQ-12 | rail | daemon-down, moved | the last snapshot stays | pass | `.r2c` still `grid` at 199–229, banner visible |
| REQ-13 | focus | data, moved, 1280 | caps on each line; `↳` block between repo and model; model whole | pass | repo `.rf`/`.rb` cw 131; `.loc > .sep` 553–560; `.claude-at` 566–701 (`grid`, gap 5 px); `.meta > .sep` 707–714; `.model` 720–890 with sw = cw 169; `.surfseg` starts at 902 |
| REQ-13 | focus | data, moved, 1100 | same | pass | name blocks are 42 and 44 px; `.model` 540–710 whole; `.surfseg` starts at 722 |
| REQ-13 | focus | data, moved, 1024 | name blocks shrink without overpainting; model whole | FAIL | `.claude-at` box is 440–445 (cw 5), but its `.rf` is drawn at 452–465, on top of `.meta > .sep` 451–458 and 1 px into `.model` (464). The repo `.rf` (416–430) likewise covers `.loc > .sep` (427–434). In the screenshot, `l… · ↳ w…` runs into the `·` (Major 1). Model 464–634 is whole |
| REQ-13 | focus | data, moved or unmoved, ≤ 960 | model never truncates | FAIL | `.meta` has `overflow: hidden`. At 960 its right edge is 570 while `.model` spans 435–604, so 34 px are clipped. At 900, `.meta` ends at 510 and the model reads `claude-haik`; `elementFromPoint` at the model's centre hits `DIV.mainhead`. At 800, `.meta` cw is 0. This holds for the unmoved long session and for the short-named moved one too (Major 2) |
| REQ-13 | focus | dead | ended age after the model | pass (carried over) | not re-driven this cycle; no change since cycle 1 touches `.ended-at`. Its hidden state measured `display: none` |
| REQ-13 | focus | no data | basename alone, no `↳`, model is the launch value | pass | `.rf` `muster-e2e-plain-…` 416–572; `.loc > .sep` and `.claude-at` `[hidden]` with `display: none`; `.model` `haiku` |
| REQ-14 | focus, tile | data, moved | four-line title | pass | `.wh` title is `<repo> / <branch>`⏎`<dir>`⏎`Claude is in <wt dir>`⏎`on <wt branch>`, matching `/api/state` `repo` and `claudeLocation` read in the same test |
| REQ-14 | tile | data, unmoved | two-line title | pass | `.wh` title is `<repo> / <branch>`⏎`<dir>` |
| REQ-15 | tile | data, long names, 1280 / 900 / 700 | the title keeps a floor and `.wh` gives way first (the cycle 1 Minor) | pass | `.nm` stays at its 75 px floor at every width (sw 154 / cw 75, `rework-s…`), where cycle 1 measured 21 and 12 px. `.wh` shrinks 369, then 179, then 79 px. The `.wh-claude` glyph stays inside `.thead` (1131–1137 in 642–1278; 751–757 in 452–898; 551–557 in 352–698), and `.ctxinfo` follows inside |
| REQ-15 | tile | data, short titles | the floor adds nothing beyond the mockup | pass, see Note 2 | `a`, `nb0` and `vanisher` each get a 75 px `.nm` box, so `.wh` always starts at +84 px. `c-long-names.html` `.thead .nm` has the same `min-width: 5rem` |
| REQ-15 | tile | no data, unmoved | glyph hidden | pass | `.wh-claude` `[hidden]` with computed `display: none` |
| REQ-16 | rail, focus | data, Instrument | glyph is `--fg-muted`, text `--fg-dim` | pass | `.lead` `rgb(178,182,195)` = `--fg-muted`; `.rf`/`.rb` `rgb(166,171,188)` = `--fg-dim`; neither matches `--rose` or `--amber` |
| REQ-16 | rail, focus | data, Light | same | pass | `.lead` `rgb(65,69,79)` = `--fg-muted`; `.rf` `rgb(73,77,92)` = `--fg-dim` |
| REQ-17 | focus | data | `button.rename` title is the display title | pass | `title="kbd-focus"` |
| REQ-17 | focus | data | keeps keyboard focus across a re-render | pass | arrived by `Tab` from the previous tabbable (the rail `Pin` button). After a real `git checkout -b` re-rendered the header and 1.5 s passed, the same tagged node was still `activeElement`, and `Enter` opened `input.name-edit` |
| REQ-1 | rail, focus | data | the branch follows a checkout with no hook | pass | `.rb` changed to `kbd-branch` after a real `git checkout -b` |
| REQ-1 | tile | data | same | pass | `.wh` changed to `<repo> / tiles-branch` |
| REQ-1 | rail | dead | keeps the last-known branch | pass | after `kill-window` and then a checkout of `after-death`, the API `repo.branch` and `.rb` both still read `before-death`; `alive: false`; `claudeLocation: null` |
| REQ-2 | rail | data, launch dir renamed away | keeps the last-known repo (cycle 1 daemon fix 02c9493) | pass | `/api/state` `repo` is identical before and after 2.5 s (about 12 poll ticks) with the directory gone; `.rf`/`.rb` still show the long folder and branch |
| REQ-9 | focus | no model (resumed from list) | `unknown`, then the id | pass (closes cycle 1 Note 1) | API `model: null`, so `.model` reads `unknown`; after `SessionStart` names `claude-sonnet-5-5`, the DOM shows `claude-sonnet-5-5` and the API has `{id, displayName}` both set to the id |
| REQ-9 | focus | data, bind with a different id | the id shows | pass | `SessionStart` with `claude-haiku-4-5-20251001` after a `haiku` launch makes `.model` read the id (this is the 169 px readout Major 2 measures) |
| W11 | rail | data, Instrument | matches `c-long-names.html` | FAIL | the mockup's `.r2`/`.r2b` set no line-height, so both blocks share one rhythm; the app's `↳` lines are 2 px taller (Minor 1) |
| W11 | tile | data, long names | matches the mockup tile header | pass | `.nm` `flex: 0 1000 auto; min-width: 5rem`, as the mockup's `.thead .nm` |
| §7.1 | tiles, focus | data | one live client per session | pass | `tmux list-clients` shows `muster-1:0` and `muster-2:0` with two sessions tiled, and only `muster-1:0` in Focus |
| §6.7 | all | daemon-down | daemon-down surfaced prominently | pass | `#banner` spans 0,46–1280,78, `display: block`, text `musterd unreachable — hook out…` |
| Hidden | rail, focus, tile | every toggled element | `[hidden]` computes `display: none` | pass | `.r2c`, `.claude-at`, `.loc > .sep`, `.ended-at` and `.wh-claude` are all `display: none` while hidden (the shared `.r2c[hidden], .mainhead .meta .claude-at[hidden]` rule) |

## Issues

### Critical

(none)

### Major

1. **[web-impl]** In the Focus header at a 1024 px window, with a moved session, the name blocks paint over the separators. `.mainhead .meta .loc .repo` and `.claude-at` shrink to cw 5 px. Their `.rf`/`.rb` keep their `min-width: 2ch` (14 px) floor and overflow, because nothing on the containers stops them shrinking below their children: `.claude-at` has `min-width: 0` from the shared rule.
   - Measured: `.claude-at .rf` 452–465 sits over `.meta > .sep` 451–458, and repo `.rf` 416–430 sits over `.loc > .sep` 427–434. The screenshot shows `l…` and `w…` colliding with the `·` glyphs.
   - Cycle 1 did not reach this state: its model was the 115 px display name. REQ-9 now shows the 169 px id (`claude-haiku-4-5-20251001`) until the status line arrives, which takes about 54 px from the name blocks.
   - Where: `web/src/style.css`, the `.mainhead .meta .loc` group.
   - A fix must make this true: at every width where the blocks are on screen, no `.rf`/`.rb` box extends past its container's box, and no box overlaps either `.sep` or `.model`. Either the containers keep the children's floor, or the blocks collapse together.
2. **[orchestrator:decision]** In the Focus header at ≤ 960 px (a half-screen window on a 1920 display), `.meta` (`overflow: hidden`) clips the model, which REQ-13 says never truncates.
   - Measured: at 960, 34 of 169 px are clipped; at 900 the model reads `claude-haik`; at 800 `.meta` is 0 px wide. This happens unmoved as well as moved, and with short names as well as long.
   - Edge case 24 and E11 bind 1280 only, so the e2e suite cannot see it. The masthead already accepts a truncated model at narrow widths (kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model).
   - **Option A**: REQ-13 holds at every width. Below the point where the meta's name blocks reach their floors, the blocks give way (hidden, or collapsed to the `↳` glyph) before the model loses a pixel. The title is already at its 6rem floor.
   - **Option B**: REQ-13 holds at ≥ 1024 px, the narrowest width at which the model still measures whole. Below that the model ellipsizes like the masthead's, and the plan and feature spec say so.

### Minor

1. **[web-impl]** On the rail card, the `↳` block's lines are taller than the repo block's. 627d509 moved `line-height: 1.35` into the shared `.r2c, .mainhead .meta .claude-at` rule, so on the card the `↳` lines are 15.19 px while `.r2`'s lines stay at `normal` (13 px).
   - Measured: comfortable `.r2c` is 167–197 (30 px), where cycle 1 measured 167–193 (26 px); compact `.r2c` is 15 px against `.r2`'s 13 px.
   - Why it fails: REQ-12 asks for "the same two-line shape", and the mockup's `.r2`/`.r2b` share one line height.
   - Where: `web/src/style.css`, the shared `.r2c` rule (about line 2173).
   - A fix must make this true: on the rail card and strip card, `.r2c`'s line boxes are the same height as `.r2`'s. The header's `.repo` and `.claude-at` already match each other at 15.19 px.

### Notes

1. **[note]** The cycle 1 Minor (the tile title squeezed to `r…`) is fixed. `.nm` holds its 75 px floor at 640, 450 and 350 px tiles, and `.wh` gives way first.
2. **[note]** The new 5rem floor also widens short titles. `a` and `nb0` each get a 75 px box, so the repo line starts about 50 px past the end of the text. `c-long-names.html` uses the same `min-width: 5rem`, so this matches the mockup. No change requested.
3. **[note]** I did not re-drive the daemon-down state in the Tiles view (tile and strip hosts) this cycle. Cycle 1 measured the banner and the rail/focus snapshot, and this cycle re-measured those. No change since cycle 1 touches the tile header's offline path.
4. **[note]** §7.4 (`scrollback: 0`) and §7.5 (pane styling) were not re-measured. The plan touches neither xterm nor pane contents.
5. **[note]** `$TMPDIR/muster-e2e-loc-FO3g6A` is a scratch repo dated 14:52, before this review's runs started (15:12). Some earlier run did not clean it up, and I left it alone.

## Maintainability review

# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Part verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle: the spawn prompt did not ask for a delta. Files with no change since the cycle 1 review commit (`2a12f7f`) keep their cycle 1 result, after a re-check against `git diff 2a12f7f..HEAD`. The files that diff touches (`cmd/musterd/main.go`, `internal/server/bgloop.go`, `internal/server/launcher.go`, `internal/server/reporefresh.go`, `web/src/style.css`) were re-read in full along with their siblings.

## Cycle 1 Minors

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| 1: `resolvePath` duplicates `claudecode.resolveTranscriptDir`, and the design line said no such helper existed | 02c9493 (Decisions only) | The new `design:` line names `launchtranscripts.go:54`, says it is the same body, and gives the reason it is not reused. The helper is unexported inside the Claude-format adapter, which is a leaf with no internal imports. A shared home would be a new leaf package, which needs kb ownership and a diagram edit. The false "found no helper" claim is withdrawn. The reason holds. The follow-up (`internal/<leaf>.ResolveDir`) is handed to the orchestrator, see Note 1. |
| 2: `deriveLocation` copies `repoContext`'s Branch/IsWorktree body | 02c9493 | The new `checkoutState(ctx, dir) (branch *string, isWorktree bool)` at `internal/server/launcher.go:336` is now the only caller of `gitutil.Branch` + `gitutil.IsWorktree` in `internal/server`. `repoContext` (`launcher.go:329`) and `deriveLocation` (`reporefresh.go:131`) both use it. A `design:` line explains why it skips `IsRepo`. |
| 3: size warnings with no reason (`parseFlags` 48, `server.New` 44, `claudecodetest.go` 630) | 02c9493 (Decisions) | The "Size warnings kept on purpose" bullet gives a reason for each one, and each reason fits the code. `parseFlags` is one statement per flag plus the validation switch. `New`'s doc comment already gives the composition-root reason, and this diff adds only a `register` line and a callback. `claudecodetest.go` is a flat list of independent payload builders. |
| 4: the `↳` block's layout written twice in `style.css` (4px vs 5px gap, `align-self` on one host only) | 627d509 | One selector list, `.r2c, .mainhead .meta .claude-at`, now declares the grid, the 5px gap, `min-width`, `line-height`, the `[hidden]` companion, the `.lead` span with `align-self: start`, and column 2 for `.rf`/`.rb` (`style.css:2177-2203`). What is left per host is a real difference: the card's margin, font and colour (`.r2c`, `style.css:2205`) and the header's 30ch/44ch caps (`.mainhead .meta .rf`/`.rb`, `style.css:739-753`). `rg` finds no other `.claude-at` layout rule. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings (`usage-poll`, `claude-theme-poll`) | n/a (one flag) | filelen 525, reason holds; funlen `parseFlags` 48, reason holds (fix attempt 1); funlen `run` 44, function untouched | pass (since cycle 1, only the help text changed) |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | `EnvelopedHookBody`, `SessionStartOpts` in-file | n/a | filelen 630, reason holds (fix attempt 1) | pass |
| internal/claudecode/interpret.go | per-arm `agent_id` reads in-file, doc.go | yes | — | pass (unchanged since cycle 1) |
| internal/claudecode/status.go | interpret.go | covered | — | pass (unchanged) |
| internal/gitutil/gitutil.go | `Branch`/`IsWorktree`/`IsRepo` in-file | yes | — | pass (unchanged) |
| internal/server/bgloop.go | usagepoll.go, themepoll.go, shellactivity.go, updatemanager.go | yes | — | pass (comment now names `repoRefreshFeature`) |
| internal/server/launcher.go | reporefresh.go (the second `checkoutState` caller), `repoContext` in-file | yes (`checkoutState` placement) | filelen 559 (was 553), reason given, see Note 2 | pass |
| internal/server/reporefresh.go | usagepoll.go, themepoll.go, launcher.go, updatemanager.go | yes | — | pass: `readRepoState`'s `(state, ok)` has one caller (`tick`), and the doc comment says what `ok` guards |
| internal/server/server.go | usage/theme/shellActivity registration lines | yes | funlen `New` 44, reason holds | pass (unchanged) |
| internal/server/sessionwire.go | `sessionWireRepo`, `toWireSession` in-file | n/a | — | pass (unchanged) |
| internal/session/CLAUDE.md | — | n/a | — | pass |
| internal/session/actions.go | liveness.go, reader.go | covered | — | pass (unchanged) |
| internal/session/apply.go | status.go, reader.go | covered | — | pass (unchanged) |
| internal/session/liveness.go | actions.go | covered | — | pass (unchanged) |
| internal/session/location.go | session.go, status.go | yes | — | pass (unchanged) |
| internal/session/machine.go | status.go | n/a | funlen `applyInput` 51, function untouched | pass (unchanged) |
| internal/session/manager.go | liveness.go, actions.go | yes | filelen 580, reason holds | pass (unchanged) |
| internal/session/repo.go | reader.go (`SetPlan`), title.go | yes | — | pass (unchanged) |
| internal/session/row.go | — | n/a | — | pass (unchanged) |
| internal/session/session.go | — | yes | — | pass (unchanged) |
| internal/session/status.go | apply.go | covered | — | pass (unchanged) |
| internal/session/writeorder.go | — | n/a | — | pass (unchanged) |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (unchanged) |
| internal/store/session.go | — | n/a | — | pass (unchanged) |
| web/src/protocol/session.ts | `parseRepoInfo`, `parseModelInfo` in-file | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/tiles.ts, render/sessions.ts | yes | — | pass (unchanged) |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts, render/tiles.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts, sessions/context.ts | yes | — | pass (unchanged) |
| web/src/style.css | `.mainhead .name` (`style.css:645`), `.r2 .rf` block (`:2163`), compact-density block (`:2420`) | yes | — | pass: `.thead .nm` gets `flex: 0 1000 auto; min-width: 5rem`, the same shape as `.mainhead .name` (`style.css:655-656`, `min-width: 6rem; flex: 0 1000 auto`), and its comment points to that rule |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Orchestrator follow-up from cycle 1 Minor 1. `resolvePath` (`internal/server/reporefresh.go:139`) and `claudecode.resolveTranscriptDir` (`internal/claudecode/launchtranscripts.go:54`) are still two copies of the same resolve-else-clean body. The reason for keeping both holds for this plan. The design line suggests one leaf `ResolveDir` as the follow-up, and that is a backlog item, not part of a fix wave.
2. **[note]** `repoContext` and `checkoutState` are git-reading helpers. Since cycle 1, two features share them (the launcher and the repo poll), but they live in `launcher.go`, which is 559 lines and already over the threshold. The design line's reason ("beside its other caller") is valid. A newcomer looking for "how the server reads a checkout" would still look in `reporefresh.go` before `launcher.go`. Taste only, no change asked.
3. **[note]** `tick` checks `isDir(t.Directory)` before the reads, and `readRepoState` checks it again after them (`reporefresh.go:86`, `:114`). The two checks guard different windows, and `readRepoState`'s doc comment explains why. They are not a duplicate.
4. **[note]** Each host still has its own per-line ellipsis rule: `.mainhead .meta .rf/.rb` (`style.css:739`, adds `min-width: 2ch` and the caps) and `.r2 .rf … .r2c .rb` (`style.css:2163`, `display: block`). Each rule covers both of its host's blocks, and the hosts differ for real, so this is not the cycle 1 split again.
5. **[note]** Shared state is unchanged since cycle 1 (cycle 1 Note 10 still holds). The fix wave adds no field and no new writer. `readRepoState`'s `ok` is local to one tick on the loop goroutine.
