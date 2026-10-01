# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 57868 words (budget 20000)

This is a full cycle, not a delta: cycle 2 left agent-tagged Majors open (correctness Major 1, browser Majors 1–2). The fix commits are `4e465fe..02f7861`. Their non-plan diff touches `internal/server/reporefresh.go`, `internal/session/{liveness,repo,session,writeorder}.go`, `web/index.html`, `web/src/render/mainhead.ts`, `web/src/style.css`, two new test files' worth of additions, and four docs (a new ADR, the amended repo-poll ADR, `design-system.md` §5, and generated indexes). I read each changed source file in full where it changed. Files this cycle did not touch keep their cycle 1–2 results. Browser Major 2 was settled by the developer as Option A (kb:adr/focus-model-never-truncates-name-blocks-give-way). I review against that outcome and do not reopen it.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `SetRepoState` now drops a whole reading (branch and worktree flag included) when `!sess.Alive \|\| sess.repoEpoch != state.Epoch`. `markEnded` bumps `repoEpoch` under the lock, `RepoTargets` copies it out, and `readRepoState` carries it back. So a reading that was in flight when the session died never reaches the dead card, even after a resume. Every `Alive = false` write is in `markEnded` (`rg 'Alive = false' internal` → `liveness.go:210` only), so the epoch catches every death | Yes: `TestSetRepoState_DropsAReadingTakenBeforeTheSessionDied` (5 rows, death through the real `checkLiveness`, resume included), `_ADeathThatFailedToPersistDoesNotDropAGoodReading`, `_ASessionsDeathLeavesItsNeighboursReadingsApplying`, `TestReadRepoState_CarriesTheTargetsEpochBack`, plus the E2E dead-session test. My targeted soak of that test gave **60/60** (it failed 10/60 and 21/60 before the fix) | pass |
| REQ-2 | Yes (unchanged since cycle 2) | Yes. `TestReadRepoState_OkIsFalseWhenTheReadingCannotBeTrusted` now pins the `ok` guard with rows (a) missing directory, (b) cancelled context, (c) live checkout → `ok` with branch `main`. This closes cycle 2 correctness Major 1 | pass |
| REQ-3 – REQ-9 | Yes (unchanged) | Yes | pass |
| REQ-10, REQ-11 | Yes. Cycle 2 browser Minor 1 is fixed: `line-height: 1.35` left the shared `.r2c, .claude-at` rule and now sits only on `.loc` | Yes: E10, plus 3 new density tests asserting `.r2c`/`.rf`/`.rb` heights equal `.r2`'s (±0.5 px). The e2e log shows they go red on `.r2c { line-height: 1.35 }` | pass |
| REQ-12 | Yes. The shared `↳` grid is now `minmax(0, auto) minmax(0, 1fr)` with the glyph gap as `.lead` padding, so a squeezed block keeps its `.rf`/`.rb` boxes inside it (the 800 px wave-3 defect, `4f5d64d`). Compact still gets the same 5 px from the padding (the old flex `column-gap` is gone) | Yes: W2, E2, density tests, 800 px moved width test | pass |
| REQ-13 | Yes, at every width, per the decision. `.meta` is a grid whose `.loc` track can shrink to 0, with `flex: 1000 1 min-content`, so its basis is the model (plus `.ended-at`) and nothing can squeeze it narrower. `.mainhead` wraps its controls to a second row instead. `.loc` is a wrapping row clipped to one line, so a name block either fits whole or wraps under the clip. The 30ch/44ch caps are kept. `.meta` lost its `overflow: hidden` | Yes: 18 new width × state tests (1280/1024/960/900/800/700 × unmoved/moved/ended) through `mainheadFitProblems`, plus E11. The e2e log shows deliberate breakage turning them red | pass |
| REQ-14 – REQ-17 | Yes (unchanged; the `.loc` title is on the same element) | Yes | pass |
| DIAG | `daemon-components` (no import change this cycle: `repoEpoch` is a field, not a package edge) is true. `web-components` `render/` "30 modules" now matches the 30 non-test files, so cycle 2 Major 2's in-plan drift is fixed. `features/` (24 vs 26) and `api/` (8 vs 9) are pre-existing drift, not from this plan (Note 3) | — | pass |

## Build & Tests

E2E tests: pass (561 passed, 4.4m) · Daemon tests (race): pass (24 `ok`, 0 FAIL) · Web tests: pass (77 files, 1993) · Daemon build: pass · Web build: pass · Lint: pass (`0 issues.`; web lint 266 files clean). All read from `$GATES_LOG_DIR` (`…/gates-stale-dirs-models-branches-c3`), with 0 failed lines.

Baseline lines:
- contrast: pass (43 pairs × 3 themes, 0 failures)
- versions: pass
- e2e-honest: pass (empty log)
- kb-check: pass (492 records, 0 problems)
- dead-refs: pass (0 missing)
- e2e-lint: clean
- features: pass
- comments: `comment-checks: clean`
- size: WARN (review-maintainability's)

Reviewer soaks. `ff19fac` fixes a flake that the e2e-specs agent reproduced, and ```checks soaks nothing, so I ran both in the foreground:
- `make e2e-soak SPEC=card-location.spec.ts N=10` → **460 passed (4.7m)**.
- The whole-file soak was green before the fix too, so it cannot tell the fix from luck. I also ran the targeted repro `bin/gatelock run --exclusive -- sh -c "cd web && npx playwright test card-location.spec.ts -g 'dead session' --repeat-each=60"` → **60 passed (1.4m)**.
- I called playwright directly because `npm run e2e`'s lint step was red on review-browser's in-flight scratch spec `web/e2e/zz-review-browser-c3.spec.ts`. That file is not mine and not part of the tree under review.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race; 0 FAIL) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (561 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL**. The TODO group is in `docs/history/todo-done.md:2122`. Both new `deviation:` lines have `proposed` ADRs with `refs: plan:stale-dirs-models-branches`. But (a) web-impl's fix-attempt-2 `doc-delta:` (the header wraps below about 976 px, and the name blocks give way whole) is not reflected in the plan's `## Doc Delta` **focus** line, and (b) the new ADR and `design-system.md` §5 state the give-way order backwards. Both are under Major 1 (`[orchestrator]`). The daemon's new `doc-delta:` is covered by the existing lifecycle line ("A dead card keeps its last-known branch"), which the fix makes fully true. Every other Doc Delta line still holds |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | This cycle's web TypeScript change is one comment in `render/mainhead.ts`. The e2e helper uses typed `Rect`/`FitSnapshot` interfaces, and its single `as unknown as Element` cast is a `Range` passed to a rect reader |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | `.lead` keeps `--fg-muted`, `.r2c` keeps `--fg-dim`, and `.claude-at` inherits `.meta`'s `--fg-dim`. The diff adds no colour. Contrast 0 failures |
| W11 | Rendered card, Focus header, tile header match `c-long-names.html` | pass on CSS read; the rendered comparison is review-browser's | The card's `↳` lines now share `.r2`'s line height, as in the mockup. Below the mockup's width, the header's narrow-width behaviour follows the decided ADRs, not the mockup |
| D15 | No git subprocess under the manager lock | pass | `SetRepoState`'s new early return is a field compare under the lock. `readRepoState` (git) still runs between `RepoTargets()` and `SetRepoState`, with no lock held |
| D16 | Working-directory keys only under `internal/claudecode/` | pass | `rg 'current_dir\|"cwd"\|new_cwd' internal/session internal/server --glob '!*_test.go'` → nothing. The changed Go files add no Claude-Code key |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: no Claude-Code key names in the changed files |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass: not touched |
| 4 | tmux via `-L muster` / sizing | pass: no tmux added |
| 5 | No payload logging | pass: no new log line |
| 6 | Empty-gauge honesty | pass: a dropped reading keeps the last-known value rather than writing null. `.model` still renders `unknown` for a null model (unchanged) |
| 7 | Identity on tmux target | pass: `repoEpoch` is per session row, keyed by id |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass |

## Cycle 2 findings re-checked

| Prior issue | Fix commit | Verified how |
|-------------|------------|--------------|
| correctness Major 1 `[daemon-tests]`: `readRepoState`'s `ok` branch untested | `76dcaa2` | Diff read. All three rows I asked for are there: missing dir → `!ok`, cancelled ctx → `!ok`, live checkout → `ok` with `main`. Deleting the `ok` expression now fails rows (a) and (b) |
| correctness Major 2 `[orchestrator]`: `web-components` render count | (before `294a816`) | `docs/diagrams/web-components.md:55` reads "30 modules", and there are 30 |
| browser Major 1 `[web-impl]`: name blocks paint over separators at 1024 | `4e465fe`, `4f5d64d` | CSS read. The `.sep`s are zero-width boxes drawn into the block's right margin. The blocks have `min-width: 0` and `.rf`/`.rb` have `min-width: 0` (was `2ch`). Every `.rf`/`.rb` box must sit inside its block and `.loc`, and the e2e width tests assert that at all 6 widths × 3 states. The live measurement is review-browser's |
| browser Major 2 `[orchestrator:decision]` | decided A; `4e465fe` | Implemented as decided. The header-wrap consequence is a logged `deviation:` with its own proposed ADR |
| browser Minor 1 `[web-impl]`: card `↳` line height | `4e465fe` | `line-height` moved off the shared rule, and the three new density tests pin it |
| wave-3 product defect `[daemon-impl]`: in-flight reading reaches a dead card | `ff19fac`, `342bddd` | See REQ-1. Diff read, all death paths enumerated, targeted soak 60/60 |
| wave-3 product defect `[web-impl]`: squeezed `↳` block's lines leave the block at 800 px | `4f5d64d` | See REQ-12. The 800 px moved test is green in the gate run and the soak |

## Issues

### Critical
None.

### Major
1. **[orchestrator]** The narrow-width give-way is documented in the wrong order, and the plan's Doc Delta does not carry it.
   - **Wrong order.** `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md` (Decision) says "the repo block and then the `↳` block hide whole as space runs out". `docs/design/design-system.md` §5 Focus mainhead says the same ("the repo block and then the `↳` block hide whole"). What shipped is the reverse. In `.loc`'s wrapping row (`style.css`, the `.mainhead .meta .loc` group), the `↳` block comes after the repo block, so it wraps under the clip first. The repo block cannot wrap without taking the `↳` block with it. `style.css`'s own comment says "the row shows the repo block, then adds the `↳` block, only while each fits". web-impl's measurement in `web-implementation.md` (Fix Attempt 2) says "repo + `↳` block, then repo only, then nothing", and at 900 px "only the repo block".
   - **Fix:** the ADR's Decision and the design-system sentence should say the `↳` block hides first, then the repo block. The web log's `doc-delta:` ("hide whole, in that order") carries the same ambiguity and should not be promoted as written.
   - **Missing from the Doc Delta.** That `doc-delta:` line (the header takes a second row below about 976 px, and the name blocks hide whole) is not in the plan's `## Doc Delta` **focus** line. doc-reconcile promotes only the plan's delta, so `docs/features/focus/spec.md` would not learn either behaviour. Add both, with the corrected order, to the focus "becomes true" line.
2. **[web-tests]** `web/src/render/mainhead.test.ts:64-80` describes the wrong markup.
   - **What it says.** `fakeMeta()` and its doc comment claim to mirror `index.html` "as in the real tree": `.loc > [.repo, .sep, .claude-at]`, then `.sep`, `.model`.
   - **What shipped.** `4e465fe` moved the trailing `.sep` inside `.loc` (`web/index.html:85`). The real tree is now `.loc > [.repo > .rf, .sep, .claude-at > [.lead, .rf], .sep]`, then `.model` and `.ended-at`. So the comment is false about markup this plan shipped. The fake has also stopped testing what `render/mainhead.ts`'s new comment depends on: with two `.sep`s inside `.loc`, `requireElement(".sep", loc)` must toggle the first one and leave the last one shown. The fake has only one `.sep` in `.loc`, so a renderer that toggled the last one would still pass.
   - **Who saw it.** web-impl named this in its Fix Attempt 2 handoff to web-tests. No web-tests wave ran in cycle 2, so the handoff was dropped.
   - **Fix:** move the fake's second `.sep` into `loc` and update the comment. Then assert that while unmoved the first `.loc > .sep` is hidden and the last is not, and that while moved both show.

### Minor
None.

### Notes
1. **[note]** `internal/session/session.go:181` calls `markEnded` repoEpoch's "only writer". `restoreChangedFields` (`writeorder.go:221`) also writes it, when it rolls back a failed persist. That rollback is the generic one every listed field gets, and the comment's point (only a death advances it) holds. `TestSetRepoState_ADeathThatFailedToPersistDoesNotDropAGoodReading` documents the rollback. No change asked.
2. **[note]** `render/mainhead.ts`'s new comment says the last `.loc > .sep` "always shows". That is true of its `hidden` attribute, which nothing sets. When the name blocks give way, that `.sep` wraps and is clipped along with them (at 1024 px with the full model id, neither block is on the first line), so on screen it is not always drawn. The comment is about the toggle, so this is not filed.
3. **[note]** `kb:diagram/web-components` still says `features/` "24 modules" (26 exist) and `api/` "8 modules" (9 exist). Both counts are the same on `main`, so this plan did not cause them. It is a backlog item for diagram upkeep, not a fix wave.
4. **[note]** The new e2e width tests assert invariants: model whole, blocks whole, no overlap, actions on screen. They do not assert which block gives way first. That is consistent with "invariants, not breakpoints", but it means no test catches the order mismatch in Major 1.
5. **[note]** review-browser's scratch spec `web/e2e/zz-review-browser-c3.spec.ts` was present (untracked) while I ran my soaks, and it fails `e2e-lint`. That review cleans it up. I wrote no scratch spec, and the only file I wrote is this one.
