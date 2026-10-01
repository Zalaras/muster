# Correctness review: Stale Dirs, Models and Branches

**Plan**: stale-dirs-models-branches
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 57444 words (budget 20000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes: `reporefresh.go` `tick`, `SetRepoState` (one upsert, only on a real change, alive only) | Yes: `TestRepoPoll_BranchFollowsCheckouts`, `_DeadSessionIsNotPolled`, E1, the dead-neighbour E2E | pass |
| REQ-2 | Partly: `tick` skips a missing or non-directory path, but a directory that vanishes **between** `isDir` and the git reads gets `repo: null` (correctness Critical 2) | Yes: `TestRepoPoll_KeepsLastKnownWhenTheDirectoryIsGone`, REQ-2 E2E (2/10 failures in my soak) | **fail** |
| REQ-3 | Yes: `interpret.go` `mainAgentCwd`, `status.go` `statusDir` (`current_dir`, else `cwd`), `adoptClaudeDir` (absent or empty changes nothing) | Yes: `TestInterpret_Cwd`, `TestInterpretStatus_Cwd`, status-line E2E | pass |
| REQ-4 | Yes: any `agent_id`-marked event, plus `SubagentStart`/`SubagentStop`, gives nil `Cwd` | Yes: `TestInterpret_CwdIgnoredForSubagents`, both E6 tests | pass |
| REQ-5 | Yes: `Elsewhere`, `deriveLocation`, `SetRepoState` stale-reading guard, `markEnded` clears | Yes: `TestElsewhere` (14 rows), `TestRepoPoll_ClaudeLocationMatrix` ({alive, dead} × 13 places), E2, E3, E7 | pass |
| REQ-6 | Yes: `OnClaudeDirChange` → `nudge` (coalesced, non-blocking), fired after the persist | Yes: `TestNew_ClaudeDirChangeNudgesTheRepoPoll`, `TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge`, `repoPoll: "0"` E2E | pass |
| REQ-7 | Yes: `RecordLaunch`/`RecordResume` → `clearClaudeLocation` | Yes: `TestRecordLaunchAndResume_ClearClaudeDirAndLocation`, E7 | pass |
| REQ-8 | Yes: the only non-session reader of `ClaudeDir` is `reporefresh.go` (and the `server.go` nudge wiring) | Yes: E5 (reader + `/api/state` directory) | pass |
| REQ-9 | Yes: `applyBind` same id keeps the pointer, a different id or a nil model gives `{id, id}`; an empty id never reaches it (`modelID != ""`) | Yes: `TestApplyBind_ModelRule`, E8, E9, the late same-id E2E | pass |
| REQ-10 | Yes: `.r2 > .rf/.rb`, `renderRepoLines`, per-line ellipsis CSS | Yes: W1, render tests, E10 comfortable and expanded | pass |
| REQ-11 | Yes: compact flex rules | Yes: E10 compact | pass |
| REQ-12 | Yes: `.r2c` with `.lead` `↳`, bare location branch, basename fallback | Yes: W2, E2, non-git move E2E | pass |
| REQ-13 | Yes: `.meta .loc`, `.rf` 30ch, `.rb` 44ch, `.model { flex: none }` | Yes: E11 | pass |
| REQ-14 | Yes: `locationHover` on `.loc` | Yes: W3, E4 | pass |
| REQ-15 | Yes: `.wh` `title`, `.wh-claude` + `.sr-only` | Yes: tiles render tests, E2, E4 | pass |
| REQ-16 | Yes: `--fg-muted` glyph, `--fg-dim` text only | Yes: the colour E2E | pass |
| REQ-17 | Yes: `button.rename.title` = display title | Yes: mainhead render test, E12 | pass |
| DIAG | `store-schema` (0012 row and summary), `domain-model` (prose delta) applied and true. `daemon-components` (server → gitutil edge already there), `containers` (musterd → git), `web-components` (render → sessions), `one-launch-end-to-end` (launch reads unchanged) all still true | — | pass |

## Build & Tests

E2E tests: pass (540) · Daemon tests (race): pass (24 packages ok, 0 FAIL) · Web tests: pass (1993) · Daemon build: pass · Web build: pass · Lint: pass. All read from $GATES_LOG_DIR. Baseline lines: contrast pass (0 failures in 3 themes), versions pass, e2e-honest pass, kb-check pass, dead-refs pass (0 missing), e2e-lint pass, features pass, **comments FAIL** (`web/src/style.css:2429`), size WARN (review-maintainability's).

Reviewer soak (the diff repairs a flake, Repairs row 2, and ```checks soaks nothing): `make e2e-soak` could not build, because review-browser's untracked scratch `web/e2e/zz-review-browser.spec.ts` fails `tsc` and e2e-lint. So I ran the same soak on the 14:36 binary, which was built from this unchanged tree, under the exclusive gate lock: `npx playwright test e2e/card-location.spec.ts --repeat-each=10` → **248 passed, 2 failed**. Both failures were the REQ-2 test (correctness Critical 2).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D11 | `make test` | pass (deduped to test-race) |
| D12 | `make lint` | pass (`0 issues.`) |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass (77 files, 1993 tests) |
| W8 | `make web-lint` | pass (266 files) |
| E14 | `make e2e` | pass (540 passed, 4.7m) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. `TODO.md` group moved to `docs/history/todo-done.md`, design-system §5 Rail card / Tile / Focus mainhead updated, both diagram deltas applied, six ADRs `proposed` with `refs: plan:stale-dirs-models-branches` (the superseded one flips at Completion), both `deviation:` lines carry an ADR. Every Doc Delta line is true of the shipped code. One unamended log `doc-delta:` line is listed as correctness Major 2 `[orchestrator]` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | No `any` types in new web code | pass | No added line in the `web/src`/`web/e2e` diff has `: any`, `<any>` or `as any` |
| W10 | `↳` blocks and glyph use only neutral tokens | pass | `style.css`: `.r2c` text `--fg-dim`, `.r2c .lead` / `.claude-at .lead` / `.thead .wh-claude` `--fg-muted`, `.claude-at` inherits `.meta`'s `--fg-dim`. No state token. `make contrast` 0 failures |
| W11 | Rendered rail card, Focus header, tile header match `c-long-names.html` in Instrument and Light | pass on structure (CSS read). Rendered comparison is review-browser's | The DOM shape matches the mockup's `.pair`/`.lead2`/`.r2b`, with 30ch/44ch caps and `.model { flex: none }`. One divergence: the mockup's Focus `.pair .b` (branch line) is `--fg-muted`, while the shipped `.mainhead .meta .rb` inherits `--fg-dim` (Note 1) |
| D15 | No git subprocess while the manager lock is held | pass | `tick` copies through `RepoTargets()` (lock held only for the copy), runs `readRepoState` with the lock free, then `SetRepoState` takes the lock and runs no git. `nudge` is a non-blocking channel send |
| D16 | Working-directory key names only under `internal/claudecode/`; no production read of CwdChanged's target | pass | Searching `internal`/`cmd` outside `internal/claudecode` for `"cwd"`, `current_dir`, `new_cwd`, `"workspace"` and `agent_id` finds only a pre-existing `machine_turnstate_test.go` line, which is not in this diff. Tests use `claudecodetest.EnvelopedHookInDirectory`. `new_cwd` appears in no non-test Go file |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass: the key names live only in `internal/claudecode` (`interpret.go`, `status.go`, `claudecodetest`). `session`/`server` see only `StateInput.Cwd`/`StatusUpdate.Cwd` |
| 2 | No terminal-output state parsing | pass: location comes from hooks and the status line, branch from `git`. No `capture-pane` in new code |
| 3 | Non-blocking hook handler | pass: the handler is unchanged. `OnClaudeDirChange` runs on the ingest worker after the persist and is a coalescing non-blocking send |
| 4 | tmux via `-L muster` / sizing | pass: no tmux invocation added |
| 5 | No payload logging | pass: the one new log line (`repo poll: applying repo state failed`) carries only the error and session id |
| 6 | Empty-gauge honesty | pass: a null model reads `unknown` (`mainheadMeta`); a null `claudeLocation` renders nothing extra; a null branch is `—` as before |
| 7 | Identity on tmux target | pass: the poll keys on the Muster session id. `ClaudeDir` survives `/clear` (edge case 12) |
| 8 | No settings trespass | pass |
| 9 | No real `claude` | pass: E2E and Go tests use real `git` in temp repos (with per-command `-c user.*`) and synthesized hooks only |

## Issues

### Critical
1. **[web-impl]** The `comments` gate line failed: `web/src/style.css:2429` opens a new comment with the plan ID `REQ-11:`. Replace it with the reason itself (it already gives one: compact keeps one line, so the flex items each ellipsize inside the card), and cite `kb:adr/rail-repo-line-wraps-at-slash` if wanted.
2. **[daemon-impl]** REQ-2 is broken by a race in the repo poll: a launch directory that disappears **during** a tick is read as "not a git checkout", and the card permanently loses its last-known `repo`. `internal/server/reporefresh.go` `tick` checks `isDir(t.Directory)` and only then runs `readRepoState` → `repoContext` (`IsRepo`, then `Branch`, then `IsWorktree`). If the directory vanishes after the check, `git` fails, `branch` comes back nil and `SetRepoState` broadcasts `repo: null`. From the next tick on, the directory is gone, so it is skipped and the null stays. The same failure that E2E Validate's Repairs row 2 saw is still there after that repair: my soak of `card-location.spec.ts` at N=10 failed this test twice, `Expected: "muster-e2e-loc-lgWWyj /"` / `Received: "muster-e2e-loc-lgWWyj"` at `card-location.spec.ts:215`. Repair 2's `vanish()` (an atomic rename) removed the window where the directory existed without `.git`, but not this window, which is between the stat and the git reads. **Fix:** in `tick`, after `readRepoState`, re-check `isDir(t.Directory)` and drop the reading (do not call `SetRepoState`) when the directory has gone. Better still, separate "git failed" from "not a checkout", so that a transient git error or the 5 s `repoReadTimeout` expiring under load cannot null `repo` on a directory that still exists. The spec is correct as written, so this is not `[e2e-specs]`. The process gap: E2E Validate ran the test live and soaked it 250/250, but put the remaining cause on the spec ("not the REQ-2 scenario") instead of the daemon, and one green soak passed by luck.

### Major
1. **[daemon-impl]** The `-repo-poll` flag help text is false about the shipped behaviour. `cmd/musterd/main.go` says "0 disables the timer (the poll then runs only when Claude's reported directory changes)", but with `0` the poll also runs once at start, so a restarted daemon re-derives `claudeLocation` (`RepoRefreshConfig.Poll`'s own doc comment, `runTicked`, and the amended `kb:adr/lifecycle-branch-refreshed-by-repo-poll` all say so, and `TestRepoPoll_NoTimerStillTicksAtStartAndOnNudge` pins it). Make it say "runs at start and when Claude's reported directory changes".
2. **[orchestrator]** `daemon-implementation.md` has an unamended `doc-delta:` line: "`-repo-poll 0` still runs one tick at start, so the Protocol Contract's '… runs only on a nudge' should read 'runs at start and on a nudge only'". The plan's Protocol Contract (§ Daemon flag) still says "only on a nudge", and `## Doc Delta` does not reflect the change. `docs/protocol.md` is already right ("start, every `-repo-poll`, and on a nudge"), so this is a plan-text amendment, or an explicit "no spec change" disposition, before doc-reconcile. The log's other two `doc-delta:` lines are already handled: the lifecycle `go:` glob gained `internal/server/reporefresh*.go` in `bfbf46a`, and the `ingest.go` line concerns the plan's Affected Files, not a document. The Doc Delta's ingest sentence stays true.

### Minor
1. **[daemon-impl]** `internal/server/bgloop.go`'s `runTicked` doc comment names the new poller `repoRefresher`. No type has that name: it is `repoRefreshFeature`, which the `bgLoop` comment a few lines above spells correctly.

### Notes
1. **[note]** For review-browser (W11): `c-long-names.html` colours the Focus header's branch line `--fg-muted` (`.pair .b`), while the shipped `.mainhead .meta .rb` inherits `--fg-dim`. The plan does not pin the launch block's branch colour (REQ-16 covers only the `↳` blocks). Whether the rendered header matches the mockup is the browser part's call.
2. **[note]** D5's "an unchanged `Cwd` persists nothing" holds for `ApplyStatus` and for the nudge. `Apply` persists every event anyway, as before. The impl log says so, and I read it as within the criterion.
3. **[note]** D17 is proven by its effect (a dead session keeps a stale branch while an alive twin in the same tick updates), not by counting subprocesses, because `gitutil`'s run seam is package-private. The mutation check (`tick` polling dead sessions) fails the test, so the assertion is not vacuous.
4. **[note]** Repairs honesty: both rows keep their assertions. Row 1 measures one line's height with a probe in `.r2`'s own font. Row 2 replaces `rm -rf` with an atomic rename. Nothing was deleted or weakened. Row 2's root-cause analysis was incomplete (Critical 2), but the assertion it protects is correct and is what exposed the daemon race.
5. **[note]** The deviation that keeps `claudeLocation` as last known when the launch directory is gone (ADR amended) means `docs/protocol.md`'s "null iff" for `claudeLocation` has one unlisted exception: a moved session whose launch directory was deleted. Claude cannot then report being back in that directory, so the gap is harmless. doc-reconcile may want to add one clause.
6. **[note]** My soak could not use `make e2e-soak`, because review-browser's untracked `web/e2e/zz-review-browser.spec.ts` (`TS6133`, unused `page`) fails `web-build` and e2e-lint while it is present. That file must be gone before the orchestrator commits or re-gates.
