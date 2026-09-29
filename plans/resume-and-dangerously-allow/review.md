# Review: resume-and-dangerously-allow

**Plan**: resume-and-dangerously-allow
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code, browser, maintainability
**Part verdicts**: code approved, browser approved, maintainability approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: approved
**Cycle**: 3
**Pack**: `kb: pack 44423 words (budget 20000)`

This is a full cycle, not a §9 delta: cycle 2 had an agent-tagged Major. The non-test code diff since the cycle-2 review (`8f050bf..HEAD`) is four daemon files in 4500836 and two web files in 3f45762. Both were read in full. Every other requirement was verified in cycle 2 against code this cycle leaves unchanged, and the result is carried forward.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-5 | Yes (unchanged since cycle 2) | Yes | pass |
| REQ-6 | Yes. The text now says "bound to it or pending a resume of it" (4804f20), and that matches `AliveByClaudeSessionID` | Yes: D3–D8, D16, pending E2E | pass |
| REQ-7 … REQ-11 | Yes (unchanged) | Yes | pass |
| REQ-12 | Yes. The amended text (bound or pending, for both 409s) matches `launchResume` and `Resume`, which both go through `AliveByClaudeSessionID` under `LockClaudeSession` | Yes: D11, D12, pending 201→409 E2E, actions.spec not_resumable (soaked, see Build & Tests) | pass |
| REQ-13 … REQ-15 | Yes (unchanged) | Yes | pass |
| INV-1 … INV-4 | Yes (unchanged) | Yes | pass |
| States: null model | Yes (unchanged) | Yes | pass |
| DIAG | Plan `## Diagrams` sequence (`plan.md:187`, now `alt held by an alive row (bound or pending a resume)`), `kb:diagram/containers`, `daemon-components`, `web-components`, `store-schema` | — | pass. The sequence diagram now matches the code. The cycle-3 code diff (comment text, one unreachable `default` arm, one type moved between modules) changes nothing any diagram shows |

## Build & Tests

E2E tests: pass (497/497) · Daemon tests (race): pass (every package `ok`, 0 `FAIL`) · Web tests: pass (1929/1929, 77 files) · Daemon build: pass · Web build: pass · Lint: pass (golangci 0 issues, Biome clean on 262 files). All of these come from `$GATES_LOG_DIR` (`gates-resume-and-dangerously-allow-c3`).

Baseline gate lines:
- contrast: pass (43 pairs × 3 themes, 0 failures)
- versions: pass
- e2e-honest: pass
- **kb-check: FAIL.** The same three unowned e2e files as before (`web/e2e/bypass.spec.ts`, `helpers/resume.ts`, `past-sessions.spec.ts`). The developer accepted this until Step 7 doc-reconcile registers them. It has not grown since cycle 1.
- dead-refs: pass (3333 checked, 0 missing)
- e2e-lint: pass
- **features: FAIL.** The same two minor `ingest` touches (`claudecodetest/transcripts.go`, `e2e/helpers/payloads.ts`). The developer declined to widen **Features**. Neither file changed this cycle.
- comments: pass
- size: WARN. This belongs to `review-maintainability`.

Flake soak: I ran `make e2e-soak SPEC=e2e/actions.spec.ts N=10` myself. That spec's not_resumable race is Repairs row 3 of the cycle-1 fix wave, and the ```checks block does not soak it. Result: **170 passed, 0 failed (1.1 m)**. The `expect.poll` on `claudeSessionId` holds. It is a real fix, not a lucky run.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `make build` | pass (17-D0.log) |
| D17 | `! rg -n '"custom-title"\|"ai-title"\|"last-prompt"\|\.claude/projects' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D17.log is empty) |
| D18 | `make test` | pass (deduped to 02-test.log, run with race) |
| D19 | `make lint` | pass (deduped to 03-lint.log) |
| W0 | `make web-build` | pass (deduped to 04-web-build.log) |
| W10 | `make web-lint` | pass (deduped to 06-web-lint.log) |
| W11 | `make web-test` | pass (deduped to 05-web-test.log) |
| E0 | `make e2e` | pass (deduped to 16-e2e.log, 497 passed) |
| K1 | `make check-kb` | **FAIL** (10-kb-check.log). These are the three unowned e2e files the developer accepted until doc-reconcile, so the line is not routed |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. 4804f20 carries the pending-resume amendment to REQ-6, REQ-12, the sequence diagram, protocol.md's `not_resumable` (`docs/protocol.md:326`) and the guard ADR summary. 8a582bf shortened that summary to "holds it (bound or resuming)" to fit the budget, and it stays true. protocol.md's `openSessionId` comment (line 372) and the Contract's `already_open` line (plan line 43) already say "bound to, or pending a resume of". The Doc Delta's "actions: Resume is also refused when another alive session holds the same Claude session id" uses "holds", which covers both cases. The four `proposed` ADRs carry `refs: plan:resume-and-dangerously-allow`. No `deviation:` lines. The superseded `doc-delta:` line 43 is still to be excluded at Step 7, as the orchestrator said in cycle 1 |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | no `any` in new web code | pass | The 3f45762 diff adds only a type import and moves an interface |
| R1 | chip and danger button use `--danger`, never `--rose` | pass | No style change this cycle |
| R2 | exactly one filled button | pass (code) | Unchanged |
| R3 | real verification on haiku | not yet run | This runs after the pipeline, in the main session |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. D17 is green, and the new comments name no Claude Code format outside `internal/claudecode/` |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler / ≤2 s timeouts | pass (no hook code touched) |
| 4 | tmux `-L muster` / sizing | pass (no tmux code touched) |
| 5 | No payload logging | pass. The new `default` arm logs `directory` and the error, not a hook payload |
| 6 | Empty-gauge honesty | pass (unchanged) |
| 7 | Identity on the tmux target | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary | pass |

## Cycle 2 issues

| Cycle-2 issue | Fix commit | Verified how |
|---------------|------------|--------------|
| code Major 1 `[daemon-impl]` stale permission-mode comments (`launch.go` `LaunchParams`, `session.go` "four") | `4500836` | Diff read. `LaunchParams`' doc now says `BuildArgv` never re-validates, and that validating or deliberately not validating is the caller's job. The field comment says any non-empty value is sent verbatim, and empty omits the flag. Both are true of `BuildArgv` (`launch.go:69-70`: `if p.PermissionMode != "" { … "--permission-mode", p.PermissionMode }`). `session.go:47` now reads "one of PermissionModes", with no count |
| code Major 2 `[orchestrator]` pending-resume amendment missing from REQ-6, REQ-12, the diagram, `not_resumable` and the guard ADR | `4804f20`, `8a582bf` | Diff read. All five texts now cover bound and pending. The generated `actions/contract.md` and the INDEX files were regenerated in `94172e5` |
| maintainability Minor 1 (`claudeLocks` Forget invariant) | `4500836` | Maintainability owns the verdict on this one. For correctness: the new comment's claim about `keyedlock.Locks.Forget` ("a later Lock allocates a fresh *sync.Mutex that shares no exclusion with anyone still queued on the old one") matches `keyedlock.go:38-47` |
| maintainability Minor 2 (past-sessions error switch has no `default`) | `4500836` | Maintainability owns the verdict. For correctness: the arm is unreachable today, because `validateLaunchDirectory` (`launcher.go:163-170`) returns only the two sentinels, so the contract is unchanged. See Notes 1 |
| maintainability Minor 4 (`PastRow`/`PastRowView` declared twice) | `3f45762` | Maintainability owns the verdict. For correctness: both new comments are true. `features/launchmodels.ts:7` imports `ModelRowState` from `render/launch`, and `rename.ts`, `connectionversion.ts`, `tiles.ts` and `surfaces.ts` all import from `../render/` |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The new `default` arm in `handleListPastSessions` would send `500 internal_error`. `docs/protocol.md` § pastsessions.list does not list that response. No input reaches the arm today, so the contract still holds. If a third validation error is ever added, that change should also add the response to the contract.
2. **[note]** Cycle-2 Notes 1 and 2 still apply, and doc-reconcile may want to act on them. The Resume action now passes an unlisted latched mode verbatim. The pending claim lives in memory only, so it does not survive a daemon restart.
3. **[note]** The `kb-check` and `features` lines are red, as described above. The developer accepted both. They are listed here so the backstop can see them: doc-reconcile's registration of the three e2e files should turn `kb-check` green.

## Browser review

# Browser review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 26542 words (budget 20000) — WARN exceeds budget
**Rig**: `make web-build build` at 84bdf43 (HEAD; the code is unchanged since 4500836). Per-test scratch daemons came from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-XXXX` (the path has a space), a `-S` tmux socket inside it, a scratch `-claude-projects-dir`, and the stub `claude` at `$TMPDIR/muster e2e-stub-cd75a542396fd84f/claude`. Driven in headless Chromium at 1280×800 by one throwaway spec, `web/e2e/zz-browser-probe.spec.ts`, under `bin/gatelock run --exclusive`. The spec is deleted. Fixture teardown killed every daemon and tmux server: `pgrep` finds no `musterd` or `tmux -S`. `git status --porcelain` shows only the other reviewers' part files.

Gates log (`gates-…-c3`): `e2e` passed 497 and `web-build` is green, so I drove the app that will ship. `check-kb` and `features-scope` are red; both are known and accepted.

Scope for this cycle: the two changes since cycle 2 are 3f45762 (the `PastRowView` type moved into `render/launchpast.ts`, type-only) and 4500836 (a default 500 arm in `GET /api/past-sessions`, plus comment changes). I re-measured the Resume tab's rows, chips, footer and selection end to end. I also re-measured the chip in the resumed session's hosts, the list's error states and daemon-down. Cells outside the Resume tab that cycle 2 passed on code that has not changed since are carried forward, not re-driven (Note 2).

## Matrix

Hosts: **dialog** (the launch modal's Resume tab), **focus** (rail card and mainhead), **tiles** (tile `.thead`). No pop-out host exists for this plan.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-8 / REQ-9 | dialog | 5 transcripts, one bound to an alive session | rows newest first, head count | pass | head `Claude sessions in probe-rows-… · 5`. Row order matches `lastActiveAt`: plain 1m, bypass 1h, open 2h, untitled 1d, dontAsk 2d. `/api/past-sessions` returns the same order |
| REQ-9 | dialog | row bound elsewhere | disabled, reads `open in Muster` | pass | `sess-open` is `disabled` with no `aria-pressed`, text `Open one2hopen in Muster`, `.lp` rgb(166,171,188). API `openSessionId:1` |
| REQ-9 / default selection | dialog | data | first enabled row selected | pass | `sess-plain` `aria-pressed=true`, others `false` |
| REQ-11 | dialog | bypass row, 112-char title | chip inside the row, title ellipsises | pass | chip 910,475–963,488 inside row 281,467–999,508. `.t` 293–904, sw 800 > cw 611. Chip `display:block`, opacity 1, visible, bg rgb(194,70,70), fg white |
| REQ-11 | dialog | non-bypass rows (`acceptEdits`, none, `dontAsk`) | no chip | pass | `.chip-danger` absent on all four rows |
| REQ-11 / INV-2 | dialog | bypass row selected by pointer | danger face, one line | pass | `Resume without checks`, `btn key-danger`, box 817,633–983,658 (166×25). `#launch-target` sw 1456 > cw 439 (ellipsised). Footer 281,621–999,670, horizontally inside the dialog's 280–1000 column. I measured the dialog's height on the New tab only (Note 3) |
| REQ-11 | dialog | non-bypass row selected | ordinary face | pass | `Resume`, `btn key`, 918–983 (plain, untitled and dontAsk rows alike) |
| REQ-2 | dialog | Resume tab, bypass row | New tab's bypass warning not shown | pass | `#bypass-warning` `display:none` in every footer read |
| edge 3 | dialog | untitled row selected | footer `(untitled)` | pass | `Resume (untitled) in <path>` |
| cycle-1 Major 1 | dialog | filter matches nothing | footer shows no target | pass | list `No sessions match`, footer `Resume —`, button disabled |
| cycle-1 Major 1 | dialog | selected row filtered out | deselected | pass | bypass selected, then `Plain` typed: one row, `aria-pressed=false`, footer `Resume —`, disabled |
| REQ-14 | dialog | typing in the filter by keys | keeps focus | pass | activeElement is `past-filter` 1.2 s after typing `zzzz` |
| cycle-1 Major 3 | dialog | keyboard selection (Space) | focus stays on the row | pass | filter, Tab ×2 → `sess-byp`, Space. After 1.2 s activeElement is still `sess-byp`, which is pressed, and the footer switched to the danger face. The next Tab goes to `sess-untitled` (it skips the disabled `sess-open`) |
| cycle-1 Major 3 | dialog | keyboard selection (Enter) | same | pass | Enter on `sess-untitled`: after 1.2 s focus is still there, footer `Resume (untitled) …` |
| REQ-10 / REQ-12 | focus | Resume clicked on the bypass row | argv | pass | pane start command `"…/muster e2e-stub-…/claude" --resume sess-byp --permission-mode bypassPermissions`. `/api/state`: id 2, alive, `permissionMode {bypassPermissions, seed}` |
| INV-4 | dialog | that resume still pending (alive, not bound) | row holds the id | pass | `claudeSessionId:null` in state. Reopened list: `sess-byp` disabled, `…bypass1hopen in Muster`. Default selection skips it (`Plain newest`) |
| REQ-9 | dialog | after `SessionStart{source:"resume"}` binds it | still disabled | pass | state `claudeSessionId:"sess-byp"`, API `openSessionId:2`, row disabled |
| REQ-4 | focus rail card | resumed bypass session | chip | pass | chip 14,277–67,290 inside card 0,210–299,387, `display:inline`, opacity 1. The bystander (`default`) card chip is `display:none` |
| REQ-4 | focus mainhead | same | chip | pass | chip 688,77–740,90 inside mainhead 300,46–1280,122, `display:block` |
| REQ-10 / decision displayName | focus mainhead | resumed, model recorded | model shown | pass | `.meta` `probe-rows-… · claude-opus-4-1-20250805` |
| REQ-4 | tiles `.thead` | same | chip | pass | chip 1018,95–1071,108 inside `.thead` 642,86–1278,117, `display:block` |
| REQ-8 / truncated | dialog | 205 transcripts | 200 rows reachable, truncation line | pass | head `· 200`. `#past-list` `overflow-y:auto`, sh 8256 > ch 231. Wheel scrollTop → 8024. `.trunc` `Showing the newest 200` at 595–628, inside the list 408–639. Clicking `Row 199` presses it; footer `Resume Row 199 in …` |
| edge 7 / E8 | dialog | transcript deleted between list and POST | 404 message, then refetch | pass | `#launch-error` `display:block`, `no Claude Code session with that id in this directory`. After the refetch there are 200 rows, the first is `Row 1` (the deleted `Row 0` is gone) |
| States: fetch failed (404 dir) | dialog | directory removed, tab re-entered | error line, disabled | pass | `Couldn't read sessions — try again`. Head has no count. Footer `Resume —`, disabled. `#launch-error` `display:none` |
| 4500836 default 500 arm | API | a validation error that is neither sentinel | 500 `internal_error` | N/A: unreachable | `validateLaunchDirectory` returns only `errLaunchDirNotAbsolute` or `errLaunchDirNotFound`. The two arms still hold: relative and empty → 400 `invalid_request`, a missing path → 404 `not_found` |
| States: daemon-down | dialog | Resume re-entered after SIGTERM | error line, disabled | pass | `Couldn't read sessions — try again`, footer `Resume —`, disabled |
| States: daemon-down | dialog / page | — | surfaced prominently | pass | `#banner` `display:block` at 0,46–1280,78: `musterd unreachable — hook output in open panes is Muster's absence, not session failure.` |
| States: daemon-down | dialog | list showing, no refetch | stale rows | note | 200 rows and an enabled `Resume` stay until the tab is re-entered (carried from cycle 1; Note 4) |
| States: no data | dialog | directory with no transcripts | empty line | pass (cycle 2, unchanged path) | not re-driven; `renderPastList` is untouched except for its parameter type |
| REQ-1/2/3/5/7, REQ-13, §7 | dialog / focus / tiles | — | New tab, bypass warning, trust note, tabs, terminal rules | pass (cycle 2, carried) | no web code outside the `PastRowView` type moved since cycle 2 (Note 2) |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** The two changes since cycle 2 have no visible effect. 3f45762 is type-only: the rows, chips, the footer and selection by pointer and by keyboard all measure as they did in cycle 2. 4500836's new default arm cannot be reached through the running app, since `validateLaunchDirectory` returns only the two sentinel errors. It is a defensive arm, and the 400 and 404 arms beside it still hold.
2. **[note]** Carried forward rather than re-driven, because the code under them has not changed since cycle 2's pass:
   - the New tab (the bypass segment, its warning, the `auto` restore);
   - tab keyboard navigation and the dialog's accessible name;
   - the trust-prompt note;
   - the latch-follows-mode chip rows;
   - `dontAsk` resumed verbatim;
   - `already_open` / `not_resumable` from the mainhead Resume.

   The strip-card chip and the light theme stay unmeasured, as in cycle 2 Note 5.
3. **[note]** The dialog changes height with the list's content. The footer's Resume button sits at y 633 with 5 rows, 564 with `No sessions match` or the error line, and 652 with 200 rows. So the primary button moves under the pointer when a filter keystroke empties the list. I measured the dialog box only on the New tab (280,136–1000,664), so the Resume tab's vertical containment rests on cycle 2's measurement. Horizontally, the footer stays inside 281–999 in every state. It is outside this plan's requirements, so no change is requested.
4. **[note]** Carried from cycles 1–2: when the daemon dies while the Resume list is showing, the stale rows and an enabled `Resume` stay until the tab is re-entered. The global banner is up, so the honesty rule holds.
5. **[note]** Carried from cycle 2 Note 2: a title with no break opportunity pushes the mainhead's actions off-screen. This is an existing layout defect and a backlog item.

## Maintainability review

# Maintainability review: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 31121 words (budget 20000) (WARN pack exceeds budget of 20000 words)
**Scope**: 32 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`. The spawn prompt did not say the previous cycle's open issues were only Minors, so this is a full-scope review, not a delta. `git diff --stat 8f050bf..HEAD` (cycle 2's review commit to HEAD) shows that 6 of the 32 files changed since cycle 2. I asked the per-file questions again of those 6, with their siblings open. The other 26 are byte-identical to what cycle 2 reviewed, so their cycle 2 result stands; they are listed in cycle 2's Files table.

## Prior cycle (cycle 2) issues

| Prior issue | Fix commit | Verified how | Result |
|---|---|---|---|
| Minor 1: `claudeLocks` invariant kept in a plan log | 4500836 | The declaration at `internal/session/manager.go:130-145` now states the rule ("no caller ever calls Forget on an entry here, and none should") and the reason: a Forget lets a later Lock get a fresh `*sync.Mutex` that does not exclude anyone still queued on the old one, which reopens the double-claim. It also states the growth trade-off. The reason is tied to `keyedlock.Locks.Forget`'s own doc (`internal/keyedlock/keyedlock.go:37-47`), and that doc does say this. The pointer into `plans/` is gone. | fixed |
| Minor 2: past-sessions error switch had no `default` arm | 4500836 | `internal/server/launcherpastlist.go:74-76` adds `default:` → `f.log.Error()…` + `writeJSONError(w, 500, "internal_error", msgInternalError)`. This matches `handleBrowse`'s arm (`internal/server/browse.go:68-70`): same status, same code, same `msgInternalError` constant (`respond.go:34`). `f.log` is the feature's existing `zerolog.Logger` field (`launcherpastlist.go:50`). | fixed |
| Minor 3: two size warnings had no reason | 4500836 (log) | `daemon-implementation.md` Fix Attempt § Decisions (lines 387-403) adds two `size:` lines. **manager.go filelen 551**: the reason is "comment weight, not new logic". `git diff main...HEAD -- internal/session/manager.go` with comment and blank lines removed leaves about 20 code lines (`claudeLocks`, `LockClaudeSession`, the `pendingResumeClaudeSessionID` set, `AliveByClaudeSessionID`, the `*string` model). The rest of the +82 is comments, so the reason holds. **`launchResume` funlen 61**: the reason is "one coherent check-then-spawn body; the tipping line is a comment inside the lock block". I re-read `launcherpast.go:50-127`. It runs one straight sequence (validate → find → lock+check → repoContext → TouchRepo → settings → argv → spawn) and does not interleave concerns, so the reason holds. | fixed |
| Minor 4: `PastRow` / `PastRowView` declared twice | 3f45762 | `rg -n 'PastRow\b\|interface PastRow' web/src` finds one declaration, `export interface PastRowView` at `render/launchpast.ts:23`. `features/launchpastlist.ts:6` imports it (`import type { PastRowView } from "../render/launchpast"`). `rg -n 'from "\.\./features' web/src/render` finds only two `*.test.ts` files, so no production file imports features/ from render/. Dependencies now run features/ → render/, as `launchmodels.ts:7` does. | fixed |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| internal/claudecode/launch.go | launchtranscripts.go | n/a (comment-only edit) | none | pass |
| internal/server/launcherpastlist.go | browse.go, respond.go | yes | none | pass |
| internal/server/launcherpast.go (unchanged since cycle 2; size reason newly given) | launcher.go | yes | funlen `launchResume` 61, reason holds | note |
| internal/session/manager.go | keyedlock/keyedlock.go, apply.go, writeorder.go | yes | filelen 551, reason holds | note |
| internal/session/session.go | manager.go | n/a (comment-only edit) | none | pass |
| web/src/features/launchpastlist.ts | launchmodels.ts | yes (Fix Attempt Decisions) | none | pass |
| web/src/render/launchpast.ts | render/launch.ts, reader.ts | yes (Fix Attempt Decisions) | none | pass |
| 26 other files in the branch diff | as in cycle 2 | as in cycle 2 | unchanged since cycle 2 (`15-size.log`: main.go filelen 513 / funlen ×2, launcher.go filelen 553, `New` 43, `applyInput` 52 pre-existing, launch.ts filelen 731; each has its cycle 2 reason) | pass (cycle 2) |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** `plans/resume-and-dangerously-allow/web-implementation.md:235` still holds the old `design:` line, which says `render/launchpast.ts`'s local `PastRow` "deliberately duplicates `PastRowView`'s shape". The Fix Attempt entry at line 320 supersedes it, and the code matches the new entry. The log contradicts itself, but only the log. No change requested.
2. **[note]** Cycle 2 Note 3 still applies. The two resume paths take `claudeLocks` and `locks` in opposite orders, and no deadlock is reachable because a Resume aimed at the fresh row returns on `sess.Alive` before it asks for `claudeLocks`. Nothing in this cycle's diff changes either path.
3. **[note]** For `review-work` (comment truth): the reworded `LaunchParams.PermissionMode` comment (`internal/claudecode/launch.go:33-39`) and the `ValidPermissionMode` doc (`internal/session/session.go:47`) are statements. I did not judge them here.
