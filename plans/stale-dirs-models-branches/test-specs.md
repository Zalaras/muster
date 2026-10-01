# E2E Test Specs: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Mode**: fix (attempt 2, review cycle 3)
**Pack**: kb: pack 49513 words (budget 20000) — rules 953 · features 15095 · diagrams 0 · decisions 16696 · proposed 0 · facts 12792 · lessons 3969 · runbooks 2 (WARN: exceeds budget)
**Verdict**: pass
**Tests created**: 25 new (`card-location.spec.ts`) + 1 rewritten in place (`rail-layout.spec.ts`); fix attempt 1 added 21 (18 Focus-header fit, 3 rail-card line-height)
**Live run**: fix attempt 2 (review cycle 3): full `make e2e` 583/583 passed, `card-location.spec.ts` soak 680/680 (68 x 10). Earlier, fix attempt 1: full `make e2e` 559 passed, 2 failed (both are routed implementation bugs below, tests left red). Validate attempt 1: 26/26, full suite 540/540

## Tests

Every `card-location.spec.ts` test asserts new behaviour and also needs the `-repo-poll` daemon flag, which does not exist yet (`flag provided but not defined: -repo-poll` — seen when I ran two of them to check where they fail). They are all `collection-only`.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/card-location.spec.ts | a checkout in the launch directory changes the card's branch with no hook posted, on the rail card and the Focus header (E1, REQ-1) | REQ-1, E1 | Real `git checkout -b` / `checkout main` in the launch repo moves `.r2 .rb` and the Focus `.repo .rb`; no hook posted | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a detached HEAD leaves no repo to show, so the card falls back to the folder name alone (REQ-1, edge case 2) | REQ-1, REQ-10, edge 2 | `git checkout --detach` → `.rf` is the bare basename (no slash), `.rb` count 0 | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a dead session keeps its last-known branch while a live neighbour follows its checkout, and resume re-reads it (REQ-1, edge case 27) | REQ-1, D17, edge 27 | Two repos; the ended session keeps `main` after a checkout while the live neighbour's `.rb` changes (proving the poll ran); resume then shows the new branch | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a launch directory deleted under a live session keeps the last-known branch while a neighbour still follows its checkout (REQ-2) | REQ-2 | Deleted launch directory keeps `<repo> /` and `main`; neighbour proves the poll ticked | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a main-agent hook whose cwd is a worktree under .claude/worktrees shows the ↳ block on the rail card, the Focus header and the tile header while the card stays on the launch directory (E2, REQ-5, REQ-12, REQ-13, REQ-15) | REQ-5, REQ-12, REQ-13, REQ-15, E2 | `.r2c` (`.lead` `↳`, `.rf` `probewt /`, `.rb` `worktree-probewt`), `.claude-at`, `.wh-claude` (visible, `↳`, hidden text `Claude is in <path>`); `.r2` block and `.wh` stay on the launch repo | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | the ↳ glyph is --fg-muted and the ↳ text --fg-dim, on the rail card and in the Focus header, never a state colour (REQ-16) | REQ-16 | Computed colours equal the live `--fg-muted` / `--fg-dim` values resolved by a probe element | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a status-line post whose workspace.current_dir is a worktree shows the ↳ block, and a later post from the launch directory clears it (REQ-3) | REQ-3 | Status-line source (`cwd` + `workspace.current_dir`) shows and clears `.r2c` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a hook cwd inside the launch checkout never shows ↳, and returning to the launch directory clears it (E3, REQ-5, edge case 4) | REQ-5, E3, flow 3 | Subdirectory → no `.r2c`; worktree → `.r2c`; subdirectory again and the launch directory itself → `.r2c` gone | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | the Focus header's location hover carries the repo, the directory and, while moved, where Claude is and its branch, and the rail card and tile header carry theirs (E4, REQ-14, REQ-15) | REQ-14, REQ-15, E4 | `.loc` `title` is 2 lines unmoved, the exact 4 lines moved; `.r2` / `.r2c` / `.wh` titles; branch oracles are `git rev-parse` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a move outside any checkout shows the folder name alone with no branch line, and a three-line hover (REQ-12, REQ-14, edge case 7) | REQ-12, REQ-14, edge 7 | Non-git move target: `.rf` basename, `.rb` count 0, 3-line hover | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | while Claude is in a worktree the docs reader and the session's directory stay on the launch directory (E5, REQ-8) | REQ-8, E5 | `GET /api/sessions/{id}/reader` `directory` and `/api/state` `directory` equal the launch directory while moved | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a subagent-marked hook whose cwd is a worktree shows no ↳, while the same cwd from the main agent does (E6, REQ-4, INV-4) | REQ-4, INV-4, E6 | Marked `PostToolUse` flips the badge to working (proof it was applied), `.r2c` stays hidden; positive control: main-agent hook with the same cwd shows it | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a subagent-marked hook naming a second worktree does not retarget an existing ↳ block (E6, REQ-4, INV-4) | REQ-4, INV-4 | A moved card keeps `mainwt /` after a marked event naming `subwt` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | ending a moved session removes its ↳ block and leaves a second moved session's, and resuming shows none until a new move is reported (E7, REQ-5, REQ-7) | REQ-5, REQ-7, E7 | Multi-session: end A (B unaffected), resume A (none), resume bind, then a new move shows it | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | one session's move never marks another session launched in the same directory (edge case 20, INV-1) | INV-1, edge 20 | Two sessions in one launch directory; only the mover gets `.r2c` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | with the repo timer disabled a reported move still shows, by the nudge alone (REQ-6, edge case 25) | REQ-6, D8 | `repoPoll: "0"`: a hook move still shows `.r2c` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a SessionStart naming a different model id shows the id, not the launch alias, until the status line confirms the display name (E8, REQ-9) | REQ-9, E8 | Launched as `sonnet`; `SessionStart` `claude-sonnet-5-5` → `.model` and the API show the id; a status post → `Sonnet 5.5` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a late SessionStart naming the same model id leaves the display name the status line confirmed (REQ-9, edge case 21) | REQ-9, edge 21 | Same-id rebind after confirmation keeps `Sonnet 5.5` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | a resumed-from-list session with no recorded model reads unknown, then shows the id a SessionStart names, never an empty string (E9, REQ-9, edge case 22) | REQ-9, E9 | `.model` `unknown`, then the id; API `displayName` equals the id and is non-empty | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | in comfortable density the rail card's folder and branch sit on two lines and each truncates at the end on its own, with the full text on hover (E10, REQ-10) | REQ-10, E10 | 60-char folder / 80-char branch: branch below folder; each `text-overflow: ellipsis`, `white-space: nowrap`, `overflow: hidden`, `scrollWidth > clientWidth`; `.r2` `title` | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | in expanded density the rail card's folder and branch sit on two lines and each truncates at the end on its own, with the full text on hover (E10, REQ-10) | REQ-10, E10 | Same, expanded density | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | in compact density the rail card's folder and branch stay on one line, clipped inside the card (E10, REQ-11, edge case 26) | REQ-11, E10, edge 26 | `.rf`/`.rb` on one line, `.r2` ≤ 1.5 line heights, `.rb` inside `.r2`, something clipped with an ellipsis | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | with a 60-character folder and an 80-character branch at 1280x800 the Focus header caps each line and the model is not clipped (E11, REQ-13) | REQ-13, E11, edge 24 | `.model` `scrollWidth <= clientWidth` and inside `.meta`; `.rf` / `.rb` clipped at exactly 30ch / 44ch (measured against a clone of the line) | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | the Focus header's session name carries its full text as a hover title, and follows a rename (E12, REQ-17) | REQ-17, E12 | `button.rename` `title` equals the display title, then the renamed title | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/card-location.spec.ts | the rename button keeps focus and node identity across a repo-poll re-render of the header (focus survival, REQ-1) | REQ-1, focus rule | Focused, tagged `button.rename` survives a branch-change re-render and a > 1 s tick | ran-green — 25/25 in `card-location.spec.ts` live; soak N=10: `250 passed (2.8m)` |
| web/e2e/rail-layout.spec.ts | a long title wraps to multiple lines in comfortable density and clamps to one line in compact, with title attributes on .name and .r2 throughout (E11, E13) | REQ-10 hover, E13 (rewritten) | `.name` wrap/clamp unchanged; `.r2` `title` equals `<repo> / main` in comfortable and compact | ran-green — whole file 12/12 live, full suite 540/540; soak N=10: `120 passed (55.1s)` |

## Deleted Tests

None. `rail-layout.spec.ts`'s E11 was rewritten in place (plan Affected Files): its `.r2` assertion compared `title` to the line's own `innerText`, which the wrap makes two lines. It now asserts `title` equals `<repo> / main` in both densities, on a real git launch directory (the old non-git directory would make `.r2` the bare basename). The title gains `, E13`; the `.name` assertions are untouched.

`actions.spec.ts` (`.meta` `toContainText("ended now")`) and `past-sessions.spec.ts` (`#mainhead .meta` `toContainText("unknown")`) read the meta as substrings, which stay true under the structured `.meta` (`.model` and the ` · ended <age>` tail sit inside it), so they need no rewrite. No other spec asserts the one-line repo text: `grep -n "(worktree)\|isWorktree\| / main\|repoLine\|cardRepoLine" web/e2e/*.spec.ts` found only the rail-layout line above.

## Fixture Changes

- `web/e2e/helpers/payloads.ts` (plan Affected Files): the hard-coded `cwd: "/tmp"` and status-line `workspace.current_dir: "/tmp"` are gone. Every builder takes an optional `cwd` (hooks: the common `cwd`, kb:fact/hook-payload-fields; status line: top-level `cwd` and `workspace.current_dir` set together, kb:fact/status-line-keys, kb:fact/cwd-follows-claude-mid-session) and omits it by default. `workspace.project_dir` and `added_dirs` stay. `rawHookMissingSessionId` lost its `cwd` too. Added optional `opts` to `rawNotification`, `rawExitPlanModePermissionRequest`, `rawPreCompact`, `rawSessionEnd`.
  Sanity run after the edit: `npx playwright test e2e/subagent-status.spec.ts e2e/sessions.spec.ts` → `24 passed (28.2s)`; the full sweep is validate's.
- `web/e2e/helpers/daemon.ts` (plan Affected Files, additive): `ScratchDaemonOptions.repoPoll?: string` → `-repo-poll`; omitted when unset, so no existing spec changes.
- `web/e2e/helpers/card-location.ts` (new): `scratchRepo(folderName?)` (real `git init -b main` plus one empty commit — an unborn branch reads as no branch — identity per command, never `git config user.*`; symlinks resolved), `scratchPlainDir`, `addClaudeWorktree` (real `git worktree add -b worktree-<name> <repo>/.claude/worktrees/<name>`), `addSubdirectory`, `startLocationDaemon` (`repoPoll` default `"200ms"`), `hookMover` (main-agent `UserPromptSubmit` on a fresh `prompt_id` per move, so the straggler guard never discards it), locators for `.r2 .rf/.rb`, `.r2c`, `#mainhead .meta .loc/.repo/.claude-at/.model`, `.thead .wh/.wh-claude`, and `hoverLines`.
- Shapes: every hook carrying `cwd` is a measured field (kb:fact/hook-payload-fields lists it on every hook; kb:fact/status-line-keys lists `cwd` and `workspace`). A subagent-marked event reuses the existing `agent_id`/`agent_type` builder (kb:fact/subagent-hooks-carry-agent-id). The `EnterWorktree` tool's own `PostToolUse` is not synthesized: its `tool_input` shape is unmeasured, so moves ride on `UserPromptSubmit` and the status line.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | checkout test (E1); detached HEAD; dead session + resume; focus survival |
| REQ-2 | deleted launch directory |
| REQ-3 | worktree hook (E2); status-line post |
| REQ-4 | both subagent-marked tests (E6) |
| REQ-5 | E2, E3, E7 |
| REQ-6 | repo timer disabled |
| REQ-7 | E7 |
| REQ-8 | E5 (reader + state directory), E2 (card stays on launch directory). The shell pane's start directory, file-drop root, resume's spawn directory and past-session matching are not driven here: daemon unit tests own them (plan D-criteria) |
| REQ-9 | E8, late same-id SessionStart, E9 |
| REQ-10 | E10 comfortable and expanded, detached HEAD (`repo: null` shape), E13 |
| REQ-11 | E10 compact |
| REQ-12 | E2, non-git move |
| REQ-13 | E2 (Focus block), E11 |
| REQ-14 | E4, non-git move |
| REQ-15 | E2 (`.wh-claude`), E4 (`.wh` title) |
| REQ-16 | the token-colour test |
| REQ-17 | E12 |

## Handoff

(Validate: the daemon flag landed; the three plan-wording readings under Handoff held against the real markup. No harness-file change needed.)

- **The daemon flag comes first.** Every `card-location.spec.ts` test starts its daemon with `-repo-poll`; until daemon-impl adds the flag they all fail at startup (`flag provided but not defined: -repo-poll`), which is a daemon-not-built signal, not a spec defect. Validate will be the first run against real markup.
- **Plan wording I resolved by reading, to be confirmed at validate:** (1) `.r2c .rb` is the location branch with no ` (worktree)` suffix, as REQ-12 and the UI spec say, though `claudeLocation.repo.isWorktree` is true for the fixture; (2) `.wh-claude` is asserted visible, with `↳` and `Claude is in <dir>` in its text content; (3) the cap test measures `.rf` / `.rb` against a clone of the line at `30ch` / `44ch` with ±1.5 px, which assumes the cap is the element's own `max-width`.
- **Fixture plan deviation, on purpose:** the REQ-6 test passes `repoPoll: "0"` rather than `"200ms"`, because the claim under test is that the nudge alone works.
- **Interactive-control rule:** the only focusable control in the Testable UI Elements table is the existing `button.rename`, whose activation (opening the editor) is rename.spec.ts's. This plan adds a `title` to it and re-renders the header on every repo-poll change, so the focus-survival test focuses it, tags the node and asserts identity across a branch-change upsert and a tick instead of activating it.
- **Not tested, by design:** the status-line fallback to a top-level `cwd` when `workspace.current_dir` is absent (REQ-3) — that shape is unmeasured, so it is a daemon unit test, not a fixture. A moved Focus header with long folder and branch names on both blocks is outside the plan's E11 and is not asserted.
- No change needed to `web/playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output

```
npx playwright test --list           -> Total: 540 tests in 45 files (card-location.spec.ts: 25)
sh scripts/e2e-lint.sh               -> e2e-lint: clean (biome clean, no sleeps, no @playwright/test import)
npx tsc --noEmit                     -> no output
npm run e2e:fixture-leak-check       -> clean
make web-build build                 -> built
npx playwright test e2e/rail-layout.spec.ts -g "E13"   -> 1 passed (6.1s)
npx playwright test e2e/subagent-status.spec.ts e2e/sessions.spec.ts -> 24 passed (28.2s)
npx playwright test e2e/card-location.spec.ts -g "E1, REQ-1|E12"
  -> scratch musterd exited unexpectedly (code 1): flag provided but not defined: -repo-poll   (expected: flag not built)
```

## Notes

- Waits are web-first. The only fixed holds are `settleFor()` (800 to 1200 ms) for stays-unchanged checks, and each follows a positive step that proves the poll or the hook was applied.
- Each test builds its own daemon, git repo and sessions; none depends on another's side effects.
- `launchBound` binds with the enveloped `SessionStart` (carrying `cwd` = the launch directory); after a resume the bind is posted from the new pane (`resumed.tmuxTarget`), as actions.spec.ts does.


## Validate Attempt 1

Rebuilt first (`make web-build build`), then `npm run e2e -- e2e/card-location.spec.ts e2e/rail-layout.spec.ts`: `37 passed (23.8s)` (after repair 1). Collection after the last edit: `Total: 540 tests in 45 files`; `tsc --noEmit` and `e2e-lint` clean. First full sweep: `539 passed, 1 failed` (repair 2). After repair 2: `make e2e` -> `540 passed (4.2m)`.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | in compact density the rail card's folder and branch stay on one line, clipped inside the card (E10, REQ-11, edge case 26) | `Expected: <= NaN / Received: 13` (web-impl smoke run) | `.r2` computes `line-height: normal`, so `parseFloat(getComputedStyle(r2).lineHeight)` is NaN | One line's height is now measured from a probe `<span>x</span>` appended to `.r2` in the card's own font, then removed | REQ-11: `.r2` height <= 1.5 x one line, plus the unchanged `sameLine`, `rbAfterRf`, `rbInsideR2` and `clipped > 0` assertions. Passes with the probe at 13 px against an `.r2` of 13 px. |
| 2 | a launch directory deleted under a live session keeps the last-known branch while a neighbour still follows its checkout (REQ-2) | Full sweep only (passed alone, 250/250 soak): `.rf` expected `muster-e2e-loc-FMKD3J /`, received `muster-e2e-loc-FMKD3J` (no repo) | `repoGone.cleanup()` is `rm -rf`, which is not atomic: a 200 ms repo-poll tick under 4-worker load landed while the directory still existed but `.git` was already gone. The daemon then correctly reads "directory, not a checkout" as no repo (`reporefresh.go` skips only a missing or non-directory path). That is not the REQ-2 scenario, a directory that is gone | New additive `vanish()` on the `helpers/card-location.ts` scratch dirs renames the launch directory to a sibling in one step; the test calls `vanish()` instead of `cleanup()`; `cleanup()` removes the leftover | REQ-2: after the directory is gone the card still shows `<repo> /` and `main` while the neighbour's checkout proves the poll ticked. Same assertions, unchanged. Soak 250/250 at N=10. |

No assertion was deleted, skipped, or weakened.

### Product observation (not a bug route)

A launch directory that exists but is no longer a checkout (`.git` removed, directory kept) clears `repo` to null, so the card falls back to the folder name alone. REQ-2 covers only a directory that is gone or not a directory; the plan does not pin this case, so it is not routed.

### Sweep and soak

```
make e2e (final)                                  -> 540 passed (4.2m)
make e2e-soak SPEC=e2e/card-location.spec.ts N=10 -> 250 passed (2.8m)
make e2e-soak SPEC=e2e/rail-layout.spec.ts N=10   -> 120 passed (55.1s)
```


## Fix Attempt 1 (review cycle 2)

No `[e2e-specs]` issue was tagged; this wave is the coverage the cycle's impl fixes added, plus the reported `card-location.spec.ts:155` failure. Rebuilt first (`make web-build build`).

### New tests (`web/e2e/card-location.spec.ts`, helper `mainheadFitProblems` in `helpers/card-location.ts`)

| Test | Requirement | What It Verifies | Live run |
|------|-------------|------------------|----------|
| `at <W>px the Focus header of a session that is <state>, with 60-character folder and 80-character branch names never clips the model, keeps every name block whole and keeps End, Resume and Remove on screen (REQ-13)` for W in 1280, 1024, 960, 900, 800, 700 and state in unmoved, moved, ended (18 tests) | REQ-13, kb:adr/focus-model-never-truncates-name-blocks-give-way, kb:adr/focus-mainhead-wraps-to-second-row-when-narrow | Bound with the full model id `claude-haiku-4-5-20251001` (the enveloped `SessionStart`, no status line). After resizing from 1280: `.model` text is the full id; `mainheadFitProblems` is `[]` (model `scrollWidth <= clientWidth` and inside `.meta` and the viewport; every `.rf`/`.rb` box inside its `.repo`/`.claude-at` and inside `.loc`; no first-line `.rf`/`.rb` box overlapping a visible `.sep` glyph or the model; name, model, surface switch and actions boxes pairwise disjoint; End/Resume/Remove boxes inside the viewport); and the three `#mainhead` buttons `toBeInViewport({ ratio: 1 })`. The moved state uses a 60-character worktree under `.claude/worktrees`; ended adds `.ended-at`. Invariants only, no breakpoint pixels | 17/18 ran-green (soak N=10 over these 17 plus the rest of the file: `440 passed (4.3m)`); **at 800px / moved: red 8/8, see bugs** |
| `in <density> density the rail card's ↳ block lines are exactly as tall as the repo block's lines (REQ-12, review cycle 2 Minor 1)` for comfortable, compact, expanded (3 tests) | REQ-12, cycle 2 browser Minor 1 | Moved session: `.r2c`, `.r2c .rf`, `.r2c .rb` heights equal `.r2`, `.r2 .rf`, `.r2 .rb` (+-0.5 px), both sides re-read inside the poll | ran-green (same soak) |

### Proof the new assertions can go red (deliberate breakage of `web/src/style.css`, each restored; `git status` afterwards showed only my spec files)

| Breakage | Result |
|----------|--------|
| `.mainhead .meta .model { display: inline-block; max-width: 12ch; overflow: hidden; text-overflow: ellipsis }` | the 1280 and 900 unmoved/moved tests red: `model clipped: scrollWidth 169 > clientWidth 81` (47 at 900) |
| `.mainhead { flex-wrap: nowrap }` and `.loc { overflow: visible }` | 900 and 800 red: `Remove 897.1-961.8 is outside the 900x800 viewport`, `End 774.2-818.5 is outside the 800x800 viewport` |
| `.repo, .claude-at { margin-right: 0 }` (separator drawn over the block) | 1280 and 960 red: `repo rb 416.0-714.0 overlaps a .sep glyph 701.3-708.1`, `claude-at rf 574.0-720.2 overlaps a .sep glyph 707.5-714.3` |
| `.r2c { line-height: 1.35 }` (the cycle 2 Minor 1 regression) | all 3 density tests red: `block: false, branch: false, folder: false` |

### `card-location.spec.ts` "a dead session keeps its last-known branch" (web-impl's one failure): reproduced, daemon defect

The whole-file soak (`make e2e-soak SPEC=e2e/card-location.spec.ts N=10`) was green (250 passed, 2.8m), as before: it spreads the load across many different tests. The test alone, `-g "dead session" --repeat-each=60` (4 workers, 60 daemons at once), fails: **10/60** on the first run, **21/60** on the instrumented run, with the same assertion every time (`Expected: "main"  Received: "dead-new"`, card-location.spec.ts:183).

Measurement, not inference: I temporarily instrumented `tick`, `markEnded` and `SetRepoState` (timestamps and pid to a scratchpad file; reverted with `git apply -R`, `git status` clean afterwards). The one failing session of a 20-run soak, one daemon:

```
16:14:19.930 tick-target id=1 alive=true            <- tick snapshot (RepoTargets): session still alive
16:14:19.932 MARK-ENDED id=1                        <- 2 ms later the session dies (the test then sees `ended` and runs git checkout -b dead-new)
16:14:20.319 tick-read-done id=1 ok=true            <- that tick's git reads finish 389 ms later (under 4-worker load)
16:14:20.319 DEAD-APPLY id=1                        <- SetRepoState applies the branch to the now-dead session
```

In the 60-run instrumented soak every failure had exactly one `DEAD-APPLY` line (21 failures, 21 lines). Cause: `tick` decides `!t.Alive` from the `RepoTargets()` snapshot, then runs the git reads outside the lock; `Manager.SetRepoState` (`internal/session/repo.go:53-56`) checks `!sess.Alive` but only to keep the old `ClaudeLocation`, then writes `Branch`/`IsWorktree` anyway. Its doc comment says a reading "for a session that has since died, is dropped rather than resurrected", which holds for the location only. A checkout made after the session ended, while a reading started before is in flight, changes the dead card.

Confirmed as the whole cause by a throwaway fix (`if !sess.Alive { unlock; return nil }` at the top of `SetRepoState`, reverted afterwards): the same 60-run soak went **60/60 passed (1.4m)**. The spec is honest: the checkout is made only after the card shows `ended`, so no alive tick could legitimately read it. Waiting a tick before the checkout would route around the defect, so the test stays as written and red.

### 800 px, moved session: a clipped `↳` block's `.rf`/`.rb` boxes sit past the block (Minor, never painted)

`at 800px ... that is moved`: deterministic, 8/8 and in the full sweep. At 800 px with the 60-character worktree the `.loc` row is about 5 px wide; the `↳` block wrapped to the clipped second line and shrank to 5.2 px (`min-width: 0`), but its grid's `auto` glyph column plus the 5 px gap is about 11 px, so the `.rf`/`.rb` boxes (grid column 2) are zero-width boxes at x 427.8, past the block's right edge 421.2. Failure: `claude-at rf 427.8-427.8 extends past its block 416.0-421.2`, same for `rb`. Everything else in that cell held (model whole, no overlap, actions on screen). It is not visible (the block is under the clip), but the decision says "No `.rf`/`.rb` box overflows its container", the orchestrator's brief says the same, and web-impl's own probe listed "every `.rf`/`.rb` box inside its `.repo`/`.claude-at`" as passing, so I kept the assertion as stated rather than exempting zero-width or clipped boxes.

## E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| `SetRepoState` writes `Branch`/`IsWorktree` to a session that died while its reading was in flight (only `ClaudeLocation` is protected) | `[daemon-impl]` | D17, edge case 27, REQ-1; `internal/session/repo.go` doc comment | A dead session keeps its last-known branch (`main`); a checkout made after the card shows `ended` never reaches it | `dead-new` on the dead card; 10/60 and 21/60 in a 60-way soak, 0/60 with `if !sess.Alive { return }` | a dead session keeps its last-known branch while a live neighbour follows its checkout, and resume re-reads it (REQ-1, edge case 27) |
| At 800 px a moved session's `↳` block wrapped under the clip leaves its `.rf`/`.rb` boxes past the block (grid `auto` glyph column wider than the shrunk block) | `[web-impl]` | kb:adr/focus-model-never-truncates-name-blocks-give-way ("No `.rf`/`.rb` box overflows its container") | every laid-out `.rf`/`.rb` box inside its `.claude-at` | `rf`/`rb` at 427.8-427.8 against block 416.0-421.2; invisible. A fix is `minmax(0, auto)` on the `↳` grid's first column in the header, or relaxing the invariant to painted boxes if the developer prefers (the orchestrator's call, not mine) | at 800px the Focus header of a session that is moved, with 60-character folder and 80-character branch names never clips the model, keeps every name block whole and keeps End, Resume and Remove on screen (REQ-13) |

## Handoff (fix attempt 1)

- Pack: `kb: pack 50959 words (budget 20000)` (WARN: exceeds budget).
- No change needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`. `make e2e-soak` takes only a file in `SPEC`; the single-test soaks ran as `bin/gatelock run --exclusive -- make e2e-soak-run SPEC="<file> -g '<title>'" N=<n>`.

## Test Run Output (fix attempt 1)

```
npx playwright test --list            -> Total: 561 tests in 45 files
npm run e2e:lint / tsc --noEmit       -> clean
soak, all but the two red tests, N=10 -> 440 passed (4.3m)
soak, dead-session test only, N=60    -> 10 failed, 50 passed (uninstrumented)
soak, dead-session test, throwaway fix -> 60 passed (1.4m)
soak, 800px moved test, N=8           -> 8 failed (deterministic)
make e2e (final)                      -> 2 failed, 559 passed (4.8m)
```

No assertion was deleted, skipped, or weakened. No existing test was edited in this wave; the two red tests are left red on purpose.


## Fix Attempt 2 (review cycle 3)

**Issue fixed**: browser Minor 3 `[e2e-specs]` — `mainheadFitProblems` never compared a blank `.loc` with a truncated title. Plus the coverage rule for web-impl's Fix Attempt 4: the developer's decision (outcome B, `focus-header-wraps-before-repo-drops`) and the blank-`.loc` fix.

**What changed** (`web/e2e/helpers/card-location.ts`, `web/e2e/card-location.spec.ts`; nothing else):
- `mainheadFitProblems` has two new invariants, both read in the same snapshot as the existing ones so a stale layout times out in the caller's poll instead of passing:
  - `blankProblems`: whenever `.name .rename` is ellipsized (`scrollWidth > clientWidth`), `.loc`'s right edge is no more than 1 px past the right edge of the last first-line block plus its computed `margin-right` (the block and its separator room). With no block on the first line the whole `.loc` is blank and is reported. This is the issue's required property: the helper reports a `.loc` wider than its visible blocks while the title is ellipsized.
  - `repoProblems`: the repo block (`.loc > .repo`) has a box, overlaps `.loc`'s first line (is not wrapped under the clip), sits inside `.loc`, and is at least 8ch wide (the floor, measured with a throwaway `width: 8ch` probe in `.loc`'s font, removed at once).
- New export `mainheadTitleEllipsized(page)`. The width tests use it to prove the blank check was live: at widths of 1024 and below the title must actually be ellipsized, so the check was not true by default.
- The title was too short ("loc-fit") to ever be ellipsized, so the blank check would have been vacuous. The Focus-header matrix now launches with a 66-character title. Nothing else in the 18 existing tests changed (same titles, same assertions, same fixtures).
- 18 new tests: the same 6 widths x 3 states with short names (folder `muster-app`, branch `main`). Review cycle 3 saw the blank on short names too, and they are what decision B is most about (a repo block that fits at one width must fit at every narrower one).
- 4 new sweep tests: one daemon, one session, window from 1440 to 700 px and back in 16 px steps (92 widths), long and short names x unmoved and moved. At every width the full invariant set holds, repo block on the first line included. This is the "narrowing never brings it back" decision as an invariant over a range, with no breakpoint named; the steps cover where cycle 3 saw the repo block vanish at 1024-976 and return at 975. Each sweep also asserts the title was ellipsized at more than a quarter of its widths, so the blank check is proven to have applied.
- The shared test body now lives in helpers inside the spec (`openFitSession`, `enterFitState`, `assertFocusHeaderFits`). The 18 long-name tests call it with the long names and keep their exact titles.

**Not covered, and why**: web-impl's known, inferred limit: a folder line shorter than the 8-character floor (`ab /`) can leave up to 7 characters (about 47 px) of blank in `.loc` beside an ellipsized title, because CSS has no `min(8ch, max-content)`. Every fixture's folder name is 8 characters or more (`muster-app`, the 60-character folder, the `muster-e2e-loc-` temp dirs). A short-folder test would fail on a limit web-impl has named as unfixable in CSS, and writing it as a pass would weaken the check. The helper's doc comment records the gap. The same applies to the "three rows" cost of B (ended age or bypass chip at 748 px and below): the `ended` rows exercise the three-row case at 700 and 800, and the invariants hold there; no row-count is asserted (that is a pixel outcome).

**Red proofs** (each: break `web/src/style.css`, `make web-build build`, run `-g "Focus header|sweeping"`, then `git checkout web/src/style.css` and rebuild):
1. Revert only decision B's grid track (`minmax(calc(var(--floor) + var(--sep-gap)), max-content)` -> `minmax(0, max-content)`): 40 failures, each "the repo block (top N) is below .loc's first line ..., clipped away" with "the repo block is Npx wide, under its 54.2px floor" (short names at every width, 1280 included, because the long title takes the free space).
2. Revert only the free-space priority (`.name` `flex: 1 1 6rem`, `.meta` `flex: 1000 1 min-content`): 2 failures, both `.loc 416.0-539.8 is 23.9px wider than its visible blocks and separators (ending at 516.0) while the title is ellipsized (scrollWidth 504 > clientWidth 90)` (the short-names moved test at 900 and the short-names moved sweep).
3. The whole cycle-3 style.css (`git show 061f424^:web/src/style.css`): 26 failures across widths 1024 to 700, with both repo-block and blank messages. The numbers match the review: 48.2 px blank at 1024, repo block under the clip at top 85.4, 23.8 px at 800, the repo block 5.2 px wide at 800.
After each restore `git status --short` showed only the two e2e files (and the orchestrator's `orchestration-state.json`, which is not mine).

**Runs**: `npx playwright test card-location.spec.ts` 68 passed (42.1 s); `make e2e` 583 passed (4.6m); `make e2e-soak SPEC=card-location.spec.ts N=10` 680 passed (6.9m). `npx tsc --noEmit` and `npx biome check` on both files are clean; `npx playwright test --list` Total 583 (561 + 22 new).

## Repairs (fix attempt 2)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | the 18 existing "at Npx the Focus header ... 60-character folder and 80-character branch names" tests | none failed; the review showed they could not have gone red for Minor 1 | the helper never compared blank `.loc` to a clipped title, and the 7-character title was never clipped | helper gains `blankProblems` and `repoProblems`; the launch title is now 66 characters; same test titles | REQ-13: every previous assertion kept (model whole, blocks whole, no overlap, actions on screen) plus blank-`.loc` and repo-on-first-line. Red proofs above |

No assertion was deleted, skipped, or weakened. The only change to an existing test is the session title it launches with (longer, so a stricter check is live); every previous assertion in it still runs.

## Handoff (fix attempt 2)

None. No change is needed in web-impl's gate-integrity files. No wire shape was touched.
