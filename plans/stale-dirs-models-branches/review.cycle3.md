# Review: stale-dirs-models-branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code needs-changes, browser needs-changes, maintainability needs-changes

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
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

## Browser review

# Browser review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 37403 words (budget 20000)
**Rig**: built fresh with `make web-build build` at 02f7861, giving `bin/musterd`. Each test got its own scratch `-data-dir` (`$TMPDIR/muster e2e-XXXX`, a path with a space) and its own `-tmux-socket` inside that dir, which the harness teardown kills. Each also got the E2E stub `claude` via `-claude-bin` and `-repo-poll 200ms`. Driven in headless Chromium through one throwaway spec built on the committed helpers. The spec is deleted, and so are the 12 filler repos my probe left in `$TMPDIR`. `git status --porcelain` shows nothing of mine (see Note 6).

I read the gates log in `gates-stale-dirs-models-branches-c3` and did not re-run it. It shows 0 failed lines: `web-build` is green and `e2e` passed 561.

This cycle's web fixes are 4e465fe and 4f5d64d. They make the Focus model never truncate (decision A), let the name blocks give way whole, wrap the header below about 976 px, and fix the card's `↳` line height. I measured them first, then re-drove the matrix.

Fixtures:
- **Long names**: a 60-character launch folder on an 80-character branch, moved into a `.claude/worktrees/` worktree with a 60-character name.
- **Short names**: `muster` on `main`, moved into `probewt`.
- **Bypass**: the long-named session with `bypassPermissions` kept by its hooks, so the header carries the `bypass` chip.
- **Ended**: an ended session.
- **No data**: a plain non-git directory with no hooks.
- **Dead**: a tmux window killed, and a checkout racing the kill.
- **Model**: a `sonnet` launch rebound to `claude-sonnet-5-5`.
- **Titles**: `rework shift-swap approval`, which is 206 px wide at its natural width.
- **Widths**: 1440, 1280, 1100, 1024, 1000, 976, 975, 960, 900, 800 and 700 px, and then back to 1280.

## Matrix

Hosts:
- **rail**: Focus view, `#sessions`.
- **strip**: Tiles view, `#tiles-strip`.
- **focus**: `#mainhead`.
- **tile**: `article.tile .thead`.

The pop-out (`/doc.html`) is the docs reader and has no repo readout, so it is N/A in every row.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-13 | focus | data, all 7 fixtures, 1440–700 | the model never truncates (cycle 2 Major 2, decision A) | pass | at every one of 77 width × fixture cells `.model` has sw = cw (169/169 for the id, 34/34 for `haiku`), and `elementFromPoint` 2 px inside each end hits `.model`. Examples: 960 is 599.8–769.2, 800 is 439.8–609.2, 700 is 516.7–686 |
| REQ-13 | focus | data, moved and unmoved, long and short | no `.rf`/`.rb` paints over a `·` or the model (cycle 2 Major 1) | pass | every block on the first line has its `.rf`/`.rb` inside the block, and the centre hit-test finds the line itself. A block that gives way sits wholly below `.loc` and is clipped (1024: repo block top 85.4 = `.loc` bottom 85.4; hit-test misses). A visible `·` glyph never overlaps a line box |
| REQ-13 | focus | data | blocks give way whole, `↳` first, then repo | pass | long moved: 1280 shows both; 1100 shows repo only (`↳` block at 85.4–115.8, below the clip); 1024 shows neither. The committed ADR text says repo first; an uncommitted working-tree edit corrects it (Note 6) |
| REQ-13 | focus | data, 976–1024 and 800 | no blank space while the title is ellipsized | FAIL | 1024 long moved: `.name` 314–404 (cw 90, `rework sh…`) while `.loc` 416–464.2 holds no visible block, a 48 px blank strip. Short unmoved at 1024: the same 48 px, with `muster / main` hidden though it is only 54 px wide. Also 24 px at 1000, 32.6 px at 900 once the status line shortens the model, 59.6 px with the bypass chip at 1100 and 44.5 px ended at 1100 (Minor 1) |
| REQ-13 | focus | data, resize sweep | widening the window never shows less | FAIL, decision | short unmoved: 1100 shows the repo and a 141 px title; 1024–976 show no repo and a 90 px title; 975 shows the repo and the full 206 px title. Long moved: both blocks, repo, none, both, repo, none, repo from 1280 down to 700. At 900, after the status line arrives (model `Haiku 4.5`, 61 px), the header stays on one row with no repo (Minor 2) |
| REQ-13 | focus | data, narrow | header wraps, controls on screen (kb:adr/focus-mainhead-wraps-to-second-row-when-narrow) | pass | 976 gives a 49.4 px header; 975 gives 80.4 px (46–126.4) with End/Resume/Remove on row 2 (773.4–961, y 91.4–116.4). Every button is inside the viewport at every width; `scrollWidth` = viewport width at every width |
| REQ-13 | focus | data, wrap | the terminal refits when the header grows | pass | 976 has tmux `89x28` and 28 xterm rows; 975 has tmux `89x26` and 26 xterm rows. The slot starts at the header bottom (95.4 or 126.4) |
| REQ-13 | focus | data, bypass chip | chip, then meta, nothing overlapping | pass, with the Minor 1 blank | chip 416.4–468.9, `.meta` from 480.9; the model is whole at every width |
| REQ-13 | focus | ended | ended age after the model, no `↳` | pass | 1280: `.model` 640.5–809.8, then `.ended-at` 809.8–889.5 `·ended now`; `.claude-at` `display: none`; the hover is two lines |
| REQ-13 | focus | no data | basename alone, model `haiku` | pass | `.rf` `muster-e2e-plain-…` 416–571.8, no `.rb`; `.claude-at` `display: none`. It too gives way at 900 (Minor 1 blank, 59.7 px) |
| REQ-13 | focus | daemon-down, 900 | the last snapshot stays and the banner shows | pass | `#banner` 0,46–900,78; the header moves to 78–127.4; the model `Haiku 4.5` 448.6–509.5 is whole |
| REQ-13 | focus | back to 1280 | settled after a narrow pass | pass | every fixture re-measures identically to its first 1280 read |
| REQ-14 | focus | data, moved / unmoved / ended / no data | `.loc` title has 4 / 2 / 2 / 2 lines | pass | moved short: `muster / main`⏎`<dir>`⏎`Claude is in <wt>`⏎`on worktree-probewt`. Ended keeps 2 lines (`claudeLocation` null when dead). No data: basename⏎dir |
| REQ-10 | rail | data, comfortable and expanded | two lines, each truncating on its own | pass | `.rf` 14,138.8–288,151.8 (sw/cw 420/274) over `.rb` 151.8–164.8 (542/274), inside card 0–299 |
| REQ-11 | rail | data, compact | one line | pass | `.rf` 14–130.7 and `.rb` 137.4–288 share top 129.7, both clipped |
| REQ-12 | rail, strip | data, three densities | `↳` lines as tall as the repo lines (cycle 2 Minor 1) | pass | comfortable: `.r2` 26, `.r2c` 26, every line 13 px. Compact 13 / 13. Expanded 26 / 26. Strip 26 / 26 (`.r2` 794.3–820.3, `.r2c` 822.3–848.3) |
| REQ-12 | rail, strip | data | glyph gap unchanged after 4f5d64d | pass | `.lead` 14–25.8 (5 px padding inside), `.rf` from 25.8; cycle 2 had the lead at 14–21 and `.rf` at 26 |
| REQ-12 | rail | daemon-down / no data / dead | carried over | pass (cycle 2) | not re-driven on the rail; 4e465fe/4f5d64d change only the `.r2c` grid tracks and padding, which the data rows above re-measure |
| REQ-12 | strip | daemon-down | the last snapshot stays | pass | after SIGTERM the banner is 0,46–700,93 with `display: block`, and the strip `.r2c` is still `grid` |
| REQ-15 | tile | data, moved, 1280 / 900 / 700 | `.wh` one line, `↳` glyph inside `.thead` | pass | `.wh-claude` 850–856 in 642–1278; 660–666 in 452–898; 551–557 in 352–698; `.nm` holds its 75 px floor. `.wh` title has the 4 hover lines |
| REQ-15 | tile | data, unmoved | glyph hidden | pass | `.wh-claude` computed `display: none`; the title has 2 lines |
| REQ-16 | rail | data, Instrument | glyph `--fg-muted`, text `--fg-dim` | pass | `.lead` `rgb(178,182,195)`, `.rf`/`.rb` `rgb(166,171,188)`, the same values cycle 2 matched to the tokens |
| REQ-16 | rail, focus | data, Light | same | pass (cycle 2) | not re-measured: no colour rule changed this cycle (Note 3) |
| REQ-17 | focus | data, 900 (wrapped) | keyboard focus survives a re-render | pass | `Tab` from `button.rename` goes `claude`, `shell`, `docs`, `End`. After a real `git checkout -b kbd-new` re-rendered the repo block and 1.5 s passed, the same tagged `End` node was still `activeElement` |
| REQ-1 | rail | dead | keeps the last-known branch | pass | `kill-window`, then checkout `after-death`: API `repo.branch` `main`, `.rb` `main`, `alive: false`, `claudeLocation: null` |
| REQ-1 | rail | dead, checkout racing the kill | UI and API agree | pass | both read `racing` and `alive: false`. Whether the checkout landed before death is not separable from outside (Note 4) |
| REQ-9 | focus | data | a bind with a different id shows the id | pass | `sonnet` changes to `claude-sonnet-5-5` in the DOM; API `{id, displayName}` both `claude-sonnet-5-5` |
| §7.1 | tiles | data | one live client per session | pass | `tmux list-clients` returns `muster-3`, `muster-4`, `muster-5`, `muster-2` for 4 tiles, no duplicates |
| §6.7 | focus, tiles | daemon-down | daemon-down surfaced prominently | pass | `#banner` `display: block`, `musterd unreachable — hook output…`, in both views |
| Hidden | focus, rail, tile | every toggled element | `[hidden]` computes `display: none` | pass | `.claude-at` (unmoved, ended, no data), the first `.loc > .sep`, `.ended-at` and `.wh-claude` are all `display: none` while hidden |

## Issues

### Critical

(none)

### Major

(none)

### Minor

1. **[web-impl]** In the Focus header, when no name block fits on the first line, `.loc` still keeps the width it would give them as blank space, and the title stays ellipsized beside it.
   - Measured: at 1024 (long or short names, moved or not), `.name` is 314–404 (cw 90 of its 206 px natural width, `rework sh…`) and `.loc` 416–464.2 holds nothing visible: a 48 px blank strip before the model. The same happens at 1000 (24 px), at 900 once the status line arrives (32.6 px, model `Haiku 4.5`), at 900 with no data (59.7 px), at 1100 ended (44.5 px) and at 1100 with the bypass chip (59.6 px). The screenshot at 1024 shows `rework sh…`, a gap, then `claude-haiku-4-5-20251001`.
   - Cause: the meta grows ahead of the title (grow 1000 against 1) up to its max-content, which counts blocks that then wrap under the clip.
   - Where: `web/src/style.css`, `.mainhead .name` / `.mainhead .meta` / `.mainhead .meta .loc`.
   - A fix must make this true: whenever `.name` is ellipsized (scrollWidth > clientWidth), `.loc`'s box is no wider than its visible blocks plus their separators, with a 1 px tolerance.
2. **[orchestrator:decision]** The Focus header's location readout comes and goes as the window narrows, because the header wraps only when the model alone no longer fits. Wider windows can show less.
   - Measured, short names, unmoved: 1100 shows `muster / main` and a 141 px title; 1024–976 show no repo and a 90 px title; 975 wraps and shows the repo and the whole 206 px title.
   - Measured, long names, moved: from 1280 down to 700 the header shows both blocks, then repo only, none, both, repo, none, repo.
   - In the steady state, after the status line confirms a short display name, the 900 px header stays on one row with no repo at all.
   - kb:adr/focus-model-never-truncates-name-blocks-give-way accepts "may show no repo readout". It does not address the readout returning at a narrower width.
   - **Option A**: accept it. The header stays one row whenever the model and actions fit, and the name blocks are what give way. The cost is the flicker above, and no repo on a 976–1024 px window. The rail card still shows the repo.
   - **Option B**: the header wraps as soon as the repo block would drop below its floor. The repo readout then shows at every width where a second row can hold it, and narrowing never brings it back. The cost is that the header is 80 px instead of 49 px over a wider band (measured: 31 px less terminal, 2 rows at 975), which includes the 1024 px window.

3. **[e2e-specs]** `mainheadFitProblems` (`web/e2e/helpers/card-location.ts`) checks overlap, containment and the viewport. It never compares blank `.loc` width against a truncated title, so the narrow-width tests (card-location.spec.ts, 6 widths × 3 states) could not have failed for Minor 1.
   - A fix must make this true: the helper reports a `.loc` wider than its visible blocks while `.name` is ellipsized.

### Notes

1. **[note]** Cycle 2's issues are fixed as measured:
   - Major 1: no overpaint at any width.
   - Major 2 (decision A): the model is whole at every width, 1440 down to 700.
   - Minor 1: the card's `↳` lines are 13 px, the same as the repo lines, in all three densities and on the strip.
2. **[note]** A name block that gives way is clipped, not removed. It keeps a laid-out box below `.loc` and stays in the accessibility tree, so a screen reader reads a repo or `↳` line the eye cannot see. web-impl recorded this as a known limit of the CSS-only approach. It would go away under any fix for Minor 1 or decision Minor 2 that hides blocks with `display: none`.
3. **[note]** REQ-16 in Light was not re-measured. 4e465fe and 4f5d64d change no colour declaration, and cycle 2 measured it.
4. **[note]** In a checkout run concurrently with `kill-window`, the dead card reads `racing` in both the DOM and `/api/state`. The checkout most likely completed before the window died, so this is consistent with ff19fac (a reading taken before death is dropped only when it was in flight at death), but a browser probe cannot separate the order.
5. **[note]** §7.4 (`scrollback: 0`) and §7.5 (pane styling) were not re-measured. The plan touches neither xterm nor pane contents.
6. **[note]** The working tree holds uncommitted edits I did not make: `docs/adr/focus-mainhead-wraps-to-second-row-when-narrow.md` and `docs/design/design-system.md` §5 now say the `↳` block hides before the repo block. That matches what I measured, and the committed text says the reverse. Statement accuracy is review-work's. `$TMPDIR/muster-e2e-loc-FO3g6A` (14:52) and the 15:33–15:47 `muster-e2e-loc-*` dirs pre-date this review; I left them alone.

## Maintainability review

# Maintainability review: Stale dirs, models and branches

**Plan**: stale-dirs-models-branches
**Part verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 42147 words (budget 20000)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. This is a full cycle, because the spawn prompt did not ask for a delta. Cycle 2's part had no agent-tagged issues. Files with no change since the cycle 2 review commit (`6dfe798`) keep their cycle 2 result, which I re-checked against `git diff 6dfe798..HEAD`. That diff touches 7 files: `internal/server/reporefresh.go`, `internal/session/{liveness,repo,session,writeorder}.go`, `web/src/render/mainhead.ts` and `web/src/style.css`. I re-read each of them in full with its siblings, plus `web/index.html`'s `.meta` markup.

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | in-file flag siblings | n/a (one flag) | filelen 525, funlen `parseFlags` 48: both reasons hold; funlen `run` 44: function untouched | pass (unchanged since cycle 2) |
| internal/claudecode/CLAUDE.md | (generated trailer) | n/a | — | pass |
| internal/claudecode/claudecodetest/claudecodetest.go | in-file builders | n/a | filelen 630, reason holds | pass (unchanged) |
| internal/claudecode/interpret.go | doc.go, in-file arms | yes | — | pass (unchanged) |
| internal/claudecode/status.go | interpret.go | covered | — | pass (unchanged) |
| internal/gitutil/gitutil.go | in-file | yes | — | pass (unchanged) |
| internal/server/bgloop.go | usagepoll.go, themepoll.go | yes | — | pass (unchanged) |
| internal/server/launcher.go | reporefresh.go | yes | filelen 559, reason holds | pass (unchanged) |
| internal/server/reporefresh.go | launcher.go, usagepoll.go | yes | — | pass. The one-field change copies `t.Epoch` into the reading the same way `ClaudeDir` is already carried |
| internal/server/server.go | registration lines | yes | funlen `New` 44, reason holds | pass (unchanged) |
| internal/server/sessionwire.go | in-file | n/a | — | pass (unchanged) |
| internal/session/CLAUDE.md | — | n/a | — | pass |
| internal/session/actions.go | liveness.go | covered | — | pass (unchanged) |
| internal/session/apply.go | status.go | covered | — | pass (unchanged) |
| internal/session/liveness.go | actions.go, repo.go | covered (repoEpoch design line) | — | pass. `repoEpoch++` sits beside the other death-time clears (`pendingResumeClaudeSessionID`, `ClaudeLocation`), before `post` is taken |
| internal/session/location.go | session.go | yes | — | pass (unchanged) |
| internal/session/machine.go | status.go | n/a | funlen `applyInput` 51, function untouched | pass (unchanged) |
| internal/session/manager.go | liveness.go | yes | filelen 580, reason holds | pass (unchanged) |
| internal/session/repo.go | reader.go, liveness.go | yes ("stale-reading guard is a death counter…") | — | pass, see Note 1 |
| internal/session/row.go | — | n/a | — | pass (unchanged) |
| internal/session/session.go | `pendingResumeClaudeSessionID`, `ClaudeLocation` declarations | yes | — | pass. The guard and the single writer are named where the field is declared (`session.go:181`) |
| internal/session/status.go | apply.go | covered | — | pass (unchanged) |
| internal/session/writeorder.go | `CheckSessionFieldCoverage` (`:295`) | covered | — | pass. `repoEpoch` is in both the restore call and `restoredSessionFields`, and the reflection check covers unexported fields too (`t.Field(i).Name`) |
| internal/store/migrations/0012_claude_dir.sql | 0011_turn_state.sql | n/a | — | pass (unchanged) |
| internal/store/session.go | — | n/a | — | pass (unchanged) |
| web/src/protocol/session.ts | in-file parsers | n/a | — | pass (unchanged) |
| web/src/render/mainhead.ts | render/tiles.ts, index.html `.meta` | covered ("`.sep` stays two elements") | — | pass. The new comment names the markup that `requireElement(".sep", loc)`'s first-match depends on |
| web/src/render/repolines.ts | render/context.ts | yes | — | pass (unchanged) |
| web/src/render/sessions.ts | render/context.ts | covered | — | pass (unchanged) |
| web/src/render/tiles.ts | render/sessions.ts | covered | — | pass (unchanged) |
| web/src/sessions/card.ts | sessions/paths.ts | yes | — | pass (unchanged) |
| web/src/style.css | `.rnav .sep` (`:1519`), `.crumbs .sep` (`:2914`), shared `.r2c, .claude-at` rule (`:2232`), `--block-floor` (`:774`, `:780`) | yes (CSS give-way vs ResizeObserver, `.sep` stays markup, shared-rule fix) | — | Minor 1 |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** The Focus header's new give-way layout uses three pairs of hand-copied lengths. Each pair has to stay equal or the layout breaks, and nothing in the CSS ties the two copies together. This cites `docs/conventions.md` § Design, "One owner per concept … Two places that must agree will not". The three pairs:
   - `web/src/style.css:748` `.loc { height: 2.7em }` and `:758` `.loc::before { height: 2.7em }` are both `2 × line-height` from `:751` `line-height: 1.35`. If someone changes the line-height and not both heights, the clip no longer starts at the second flex line. That brings back the half-drawn block this rule exists to prevent.
   - `:780` `--block-floor: calc(1ch + 5px + 8ch)` copies the glyph gap that is set at `:2245` `.claude-at .lead { padding-right: 5px }`, in the shared rule. If the gap changes, the `↳` block's floor drifts away from its contents.
   - `:805` `.loc .sep { left: -1.875ch }` is worked out by hand from `:770` `margin-right: 2.75ch` (`-(2.75ch + 1ch) / 2`, which centres the dot in the margin).

   The same diff already names one length, `--block-floor`, so this would not be a new pattern here. A fix must make each of these lengths live in one place, so the other uses are derived from it (`calc`/`var`) and cannot drift. The rendered layout must stay the same.

### Notes

1. **[note]** I checked `repoEpoch` (`internal/session/session.go:186`) against question 3. Its one writer is `markEnded`, which holds `Manager.mu` (`liveness.go:220`; `rg "Alive = false" internal` lists only that site). Its readers, `RepoTargets` and `SetRepoState` (`repo.go:37`, `:59`), take the same lock. The gate's `test` line ran `go test -race -count=1 ./...`. The one interleaving left is a reading snapshotted between the bump and a rollback after a failed persist. That reading carries epoch N+1 against a restored N, so it is dropped and the next tick re-reads it. That is a lost reading, not a race. `rg -i "epoch|generation|incarnation" internal --glob '!*_test.go'` lists only this field, so it is not a second copy of an existing counter.
2. **[note]** The comment on the shared `↳` rule (`style.css:2225`) still says the header adds only "its ellipsis caps". The header now also sets the block's floor, its margin and its line-height (`:766-781`, `:751`). Whether the comment is accurate is for `review-work` to judge.
3. **[note]** Cycle 2 Notes 1 to 4 still apply as written: `resolvePath` and `resolveTranscriptDir` are still two copies (an orchestrator follow-up), `checkoutState` still lives in `launcher.go`, `isDir` is still checked twice, and each host still has its own ellipsis rule. None of the files they cite changed except `reporefresh.go`, and its change was one field.
