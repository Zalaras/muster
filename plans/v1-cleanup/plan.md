# Plan: v1 Cleanup

**Created**: 2026-09-06
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: harness-only
**Fixture plan**: none — no new spec; the E2E deliverable is comment corrections across five
existing specs plus `helpers/picker.ts`, and a cleanup-guard fix in `plain-shell.spec.ts`,
none of which changes a daemon fixture.
**Description**: Close the pre-v1 tail — the `internal/server` tmux test seams, the shared
socket helper, and the twelve review Minors left open at approved reviews.

## Overview

Everything in `TODO.md`'s pre-v1 sections is closed except a tail of small items and one
test-infrastructure follow-up. This plan closes both so that cutting v1 (deleting `--v0`
from `release.yml`) is a separate, deliberate one-commit act with nothing outstanding
behind it.

The substantial half is the `internal/server` test seams the 2026-09-06 test-strategy
audit named as a follow-up (`docs/design/test-strategy.md` §Decision, "Option 1"): the
package builds a real tmux server per test in ~45 of its tests, including many that only
exercise 404/409/cookie/JSON plumbing. `internal/session` already proves the pattern with
consumer-side `PaneChecker`/`PaneSnapshotter`/`Killer` interfaces; this extends it one
layer out to `internal/server`'s two remaining concrete reaches — session creation
(`NewSession`/`NewNamedSession`) and attach (`termbridge.Attach`).

The rest is a sweep of Minors left open at approved reviews across `order-sidebar`,
`embed-dashboard`, `file-drop-fix`, `fix-auto-mode-select`, `claude-status-fixes`,
`shortcut-fixes` and `plain-terminal-session`. Each is dead code, a wrong comment, a
missing guard, or a one-token style correction — no behaviour a user relies on changes,
with two exceptions called out explicitly below (REQ-13's in-flight notice and REQ-15's
separator colour).

**Measured baseline** (`go test -count=1 ./...`, this machine, 2026-09-06): `internal/server`
26.9 s, `cmd/musterd` 15.0 s, `internal/tmux` 10.2 s, all others ≤ 8.6 s. Inside
`internal/server`: 421 tests, 22.46 s of summed test time, of which the four tmux-heavy
files are 70 tests and 12.53 s (`plainshell` 19/4.33 s, `shells` 7/3.40 s, `terminal`
17/3.16 s, `sessions` 27/1.64 s). No single test dominates — it is a long tail of ~0.2–0.8 s
tmux spawns.

**Honest expectation, so nobody is surprised at review**: REQ-3's keep-real list leaves 25
of those 70 tests on a real tmux server, because their assertions genuinely are about
tmux-observable effects. The 20 tests that move are worth roughly **4–5 s**, taking
`internal/server` to ~22 s and the `go test ./...` wall to ~22 s (packages run in parallel,
so the wall is set by the slowest package). The primary win is **not** wall time: it is
removing ~20 process forks per run from the package that `docs/design/test-strategy.md`
identified as load-sensitive, which is what made `make test` intermittently red. Any
criterion below that reads as a speed claim is stated as a measurement to record, never as
a threshold to gate on — a timing gate on a shared machine is a flake generator.

## Requirements

### Must Have

- [ ] REQ-1: `internal/server` gains a consumer-side `paneSpawner` interface covering the
      tmux calls its own code makes — `NewSession`, `NewNamedSession`, `PaneExists`,
      `KillWindow`, `KillSession` — defined in `internal/server` because it is the
      consumer, satisfied by `*tmux.Client` (the shape `internal/session`'s `PaneChecker`
      already sets). `sessionLauncher` and `shellRegistry` hold it instead of
      `*tmux.Client`.
- [ ] REQ-2: `internal/server` gains a `paneConn` interface (`io.ReadWriter` plus
      `Resize(ctx, cols, rows) error` and `Close() error` — exactly what `terminal.go`
      calls on a bridge today, and what `*termbridge.Bridge` already satisfies) and an
      `attachFunc` type opening one onto a tmux target. `terminalConn.bridge`, both
      terminal handlers and the three pump/resize helpers take `paneConn`.
- [ ] REQ-3: Every test in `terminal_test.go`, `plainshell_test.go`, `shells_test.go` and
      `sessions_test.go` whose assertion is **not** about a tmux-observable effect runs
      against fakes and starts no tmux server. The keep-real list is fixed by this plan
      (see Implementation Notes → Keep-real list) and is not the test agent's judgement
      call.
- [ ] REQ-4: One shared per-test tmux socket helper replaces the copy-pasted
      `os.MkdirTemp` + `t.Cleanup(kill-server)` idiom at its eight sites, preserving the
      ~104-byte `sun_path` property each copy documents.
- [ ] REQ-5: `shellRegistry.spawned` is deleted; `Ensure` and `Kill` behave identically
      (`PaneExists` is the source of truth, `mu` already makes `Ensure` safe).
- [ ] REQ-6: A nil `Config.Locator` returns `500 internal_error` from
      `POST /api/sessions/{id}/locate` instead of panicking the handler.
- [ ] REQ-7: `locate.Locator`'s unread `walkCap` and `spotlightTimeout` fields are deleted;
      `DefaultWalkCap`/`DefaultSpotlightTimeout` stay where the finders consume them.
- [ ] REQ-8: `handlePinSession` and `handleSetOrder` send a fixed string in their 500
      bodies, like every other handler in the package, not `err.Error()`.
- [ ] REQ-9: `checkWebDist` takes the embedded `fs.FS` as a parameter so its fatal branch
      (nothing on disk, nothing embedded) is deterministically testable; `run()` passes the
      real `webui.FS()`.
- [ ] REQ-10: `maxRailPosLocked`'s doc comment describes what it returns (the largest
      `RailPos`, or `-1` when there are none).
- [ ] REQ-11: `Makefile`'s `clean` recipe carries the same `# Historic:` note as
      `.gitignore` saying why the retired `web/dist` path is still swept.
- [ ] REQ-12: The notice show/clear/auto-hide logic is one module both `terminal/pane.ts`
      and `render/dead.ts` delegate to, replacing the two near-identical copies the
      `plain-terminal-session` review recorded as mirroring "exactly".
- [ ] REQ-13: An in-flight `Locating <name>…` notice stays visible until its outcome
      replaces it; only outcome notices auto-hide after 5 s. `showDeadSurfaceNotice`'s
      existing behaviour is unchanged — every one of its callers is already an outcome.
- [ ] REQ-14: The two comments describing behaviour the `fix-auto-mode-select` fix removed
      (`web/src/api.ts`, `web/src/render/launch.ts`) name both callers and say the function
      takes `null` directly.
- [ ] REQ-15: The pinned-block separator reads as a boundary rather than another hairline:
      `.card.pinned-last` and `.strip .card.pinned-last` use `--edge` — the existing token
      whose documented role is "boundaries that must be seen on their own, ≥ 3:1" — instead
      of `--line-control`. No new token, so no theme block and no mockup changes.
- [ ] REQ-16: `web/e2e/subagent-status.spec.ts`'s E7 variable is named for the field it
      holds (`stateSinceBefore`), and its neighbouring comment names that field.
- [ ] REQ-17: The six E2E comments naming pre-`shortcut-fixes` chords name the shipped
      ones.
- [ ] REQ-18: The "DEAD tile with its directory removed" test in
      `web/e2e/plain-shell.spec.ts` cannot leak its scratch directory when an assertion
      throws, using the `cleaned`-guard-plus-`finally` shape its Focus-variant neighbour
      already uses.

### Should Have

- [ ] REQ-19: `make test`'s `internal/server` runtime after REQ-3 is recorded in
      `docs/design/test-strategy.md`'s measurement table beside the 2026-09-06 numbers, so
      the follow-up the audit opened is closed with evidence rather than a claim.

## Protocol Contract

**No protocol changes.** No WS message, HTTP endpoint, request or response shape is added,
removed or altered. REQ-6 changes only *which* error a nil-`Locator` misconfiguration
produces — from a panic (no response at all) to the `500 internal_error` the endpoint's
existing contract already documents (`docs/protocol.md` §3.14), so the wire shape is the
one already specified:

```json
{ "error": { "code": "internal_error", "message": "string" } }
```

REQ-8 changes only the `message` string inside that same envelope for two endpoints
(`POST /api/sessions/{id}/pin`, `PUT /api/sessions/order`), from the Go error text to a
fixed string. The `code` is unchanged and no test or client asserts the message text.

## Schema Changes

No schema changes required.

## UI Specifications

Two surfaces change; neither adds an element.

### Views

- **Terminal pane notice** (`role="status"`, `terminal/pane.ts`) — unchanged in position,
  markup and wording. Only its dismissal timing changes: the in-flight `Locating <name>…`
  text now persists until the outcome replaces it (REQ-13). Every outcome text keeps the
  existing 5 s auto-hide.
- **Rail / strip pinned-block separator** (`.card.pinned-last`) — unchanged in position and
  thickness (1px). Colour moves from `--line-control` to `--edge` (REQ-15).

### User Flows

1. User drags a file onto a live terminal pane. The pane shows `Locating <name>…` and
   keeps showing it for as long as the daemon takes — previously it vanished at 5 s while
   the request was still running, leaving no indication anything was happening.
2. The daemon answers. The outcome notice (pasted path, `not_located`, `ambiguous`, or an
   API failure) replaces the in-flight text and auto-hides 5 s later, as before.
3. User pins a session. The rule below the last pinned card is now visibly a boundary
   rather than reading like the ordinary divider between two cards.

### States

- **No data yet**: unchanged — the notice element is `hidden` with empty text until
  something calls it. Neither REQ touches an "unknown" rendering; no gauge, count or
  readout is involved.
- **Daemon down**: unchanged. A drop while the daemon is unreachable already produces the
  `not_connected` outcome notice, which is an outcome and so still auto-hides.
- **No pinned sessions**: unchanged — no card carries `pinned-last`, so no separator
  renders and REQ-15 has no visible effect.

### Testable UI Elements

No element is added, removed or renamed, so no locator changes. Listed for the two
elements whose behaviour the criteria assert:

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Terminal pane notice | `status` | `Locating <name>…` in flight; outcome text after | Existing `role="status"` element; REQ-13 changes only how long the in-flight text stays |
| Pinned-block separator | — | — | A CSS border on the last pinned `.card`; no accessible name, asserted by computed style if at all |

## Affected Files

### Daemon

- `internal/server/server.go` — `paneSpawner`/`paneConn`/`attachFunc` declarations
  (REQ-1, REQ-2); `Config` gains optional `TmuxClient paneSpawner` and `Attach attachFunc`
  overrides, both nil-defaulting to today's real construction; `Server.tmuxClient` becomes
  the interface.
- `internal/server/sessions.go` — `sessionLauncher.tmux` becomes `paneSpawner` (REQ-1);
  fixed 500 strings in `handlePinSession`/`handleSetOrder` (REQ-8).
- `internal/server/shells.go` — `shellRegistry.tmux` becomes `paneSpawner` (REQ-1);
  `spawned` map deleted (REQ-5).
- `internal/server/terminal.go` — `terminalConn.bridge`, both handlers and
  `pumpPTYToSocket`/`pumpSocketToPTY`/`applyResizeFrame` take `paneConn`; the two
  `termbridge.Attach` call sites go through `attachFunc` (REQ-2).
- `internal/server/locate.go` — nil-`Locator` guard (REQ-6).
- `internal/locate/locate.go` — delete the two unread fields from `Locator`, `New` and
  `NewWithFinders` (REQ-7).
- `internal/session/manager.go` — `maxRailPosLocked` doc comment (REQ-10).
- `cmd/musterd/main.go` — `checkWebDist` signature and its `run()` call site (REQ-9).
- `internal/tmux/tmuxtest/` (new) — the shared per-test socket helper (REQ-4). A separate
  package, not `internal/tmux`'s own test file, because `internal/server`,
  `internal/termbridge` and `cmd/musterd` all need it and Go test files are not importable.
- `Makefile` — `clean` recipe comment (REQ-11).

### Web

- `web/src/terminal/notice.ts` (new) — the shared notice controller (REQ-12), operating on
  the minimal `{ hidden, textContent }` element shape `render/dead.ts`'s `fakeRefs()`
  fixture already fakes, so it is unit-testable without a DOM or xterm.
- `web/src/terminal/pane.ts` — `showNotice` delegates to the new module and distinguishes
  in-flight from outcome (REQ-12, REQ-13).
- `web/src/render/dead.ts` — `showDeadSurfaceNotice` delegates to the new module, keeping
  its own behaviour (REQ-12).
- `web/src/api.ts` — comment correction (REQ-14).
- `web/src/render/launch.ts` — comment correction (REQ-14).
- `web/src/style.css` — `.card.pinned-last` and `.strip .card.pinned-last` (REQ-15).

### Daemon tests (daemon-tests only)

- `internal/server/terminal_test.go`, `plainshell_test.go`, `shells_test.go`,
  `sessions_test.go` — migration per REQ-3's keep-real list; the fakes themselves.
- `internal/server/locate_test.go` — nil-`Locator` case (REQ-6).
- `internal/locate/locate_test.go` — compile fallout from REQ-7, if any.
- `cmd/musterd/webdist_test.go` — the fatal branch REQ-9 makes testable, replacing the
  comment block at `:64-79` that documents why it could not be tested.
- `internal/tmux/tmux_test.go`, `internal/termbridge/termbridge_test.go`,
  `cmd/musterd/open_test.go`, `cmd/musterd/onexit_test.go` — adopt REQ-4's helper.

### Web tests (web-tests only)

- `web/src/terminal/notice.test.ts` (new) — REQ-12/REQ-13 under fake timers.
- `web/src/render/dead.test.ts` — existing mirror assertions must still pass unchanged; if
  the extraction moves where they belong, they move rather than weaken.

### E2E (e2e-specs only)

- `web/e2e/subagent-status.spec.ts` — REQ-16.
- `web/e2e/shell.spec.ts:28`, `web/e2e/helpers/picker.ts:11`, `web/e2e/views.spec.ts:112`,
  `web/e2e/rail-order.spec.ts:582,584`, `web/e2e/terminal.spec.ts:407` — REQ-17.
- `web/e2e/plain-shell.spec.ts` — REQ-18.

## Edge Cases

1. `Config.TmuxClient` left nil — every existing caller, `main` included. The server builds
   the real `tmux.New(cfg.TmuxSocket)` exactly as today, so no production path changes and
   no call site outside tests passes an override. → D1
2. `Config.Attach` left nil. The server uses `termbridge.Attach` against its own client,
   as today. → D2
3. A fake spawner returns an error from `NewNamedSession`. `handleCreateShell` still
   answers `500 shell_spawn_failed` with the same envelope — the seam must not change which
   error surfaces. → D9
4. `Kill` on a registry with shells for several session ids. Only the target id's tmux
   session is killed; the bystanders survive. Asserted against the fake for call-shape and,
   separately, on real tmux by the keep-real test that already covers kill scoping. → D4
5. Nil `Locator` and a drop request. `500 internal_error` with the protocol's envelope, no
   panic, and the server stays serving. → D6
6. An outcome notice arrives while an in-flight notice is on screen. The outcome text
   replaces it and auto-hides 5 s later — the in-flight notice must not leave a suppressed
   timer that swallows the outcome's own. → W2
7. `showNotice(null)` while an in-flight notice is showing. The element clears and no timer
   is left armed to fire against a later, unrelated notice. → W3
8. Two notices in flight on two panes at once. Each surface's timer is independent —
   `dead.ts` already keys timers per element via `WeakMap`; the extracted module must keep
   that property rather than collapsing to one module-level timer. → W4
9. The shared socket helper used from a test whose name is very long. The socket path stays
   under AF_UNIX's ~104-byte `sun_path` limit, which is the entire reason the six copies
   avoid `t.TempDir()` for the socket itself. → D5
10. `checkWebDist` with assets embedded *and* `-web-dist` set. Precedence is unchanged: the
    on-disk directory wins as the dev override. → D7
11. A theme with no `--edge` value. Not reachable — all three theme blocks define it
    (`style.css:40,91,135`) and the design system requires a token to exist in every block.
    → untested: no such state exists to drive.
12. A test on the keep-real list accidentally migrated to fakes. It would still pass while
    asserting nothing about tmux — the failure mode is silent, which is why the list is in
    this plan rather than left to judgement. → D3

## Acceptance Criteria

### Daemon

- **D1**: With `Config.TmuxClient` nil, the server constructs its tmux client from
  `Config.TmuxSocket` exactly as before this plan.
- **D2**: With `Config.Attach` nil, terminal attach goes through `termbridge.Attach`.
- **D3**: Every test named on this plan's keep-real list still exercises a real tmux
  server.
- **D4**: `shellRegistry.Kill(id)` kills only that id's tmux session and leaves another
  session's shell running.
- **D5**: The shared socket helper produces a socket path short enough to bind from a test
  with a long name.
- **D6**: `POST /api/sessions/{id}/locate` against a server with a nil `Locator` returns
  `500 internal_error` rather than panicking.
- **D7**: `-web-dist` continues to take precedence over the embedded assets.
- **D8**: `checkWebDist` returns the fatal error naming both remedies when nothing is on
  disk and nothing is embedded.
- **D9**: A spawn failure from the plain-shell path still answers `500 shell_spawn_failed`.
- **D10**: `shellRegistry` has no write-only state.
- **D11**: `locate.Locator` has no unread fields.
- **D12**: `handlePinSession` and `handleSetOrder` do not put Go error text in a response
  body.

### Web

- **W1**: An in-flight notice stays visible past 5 s.
- **W2**: An outcome notice replacing an in-flight one auto-hides 5 s after it appears.
- **W3**: Clearing a notice leaves no armed timer.
- **W4**: Two notice elements time out independently of each other.
- **W5**: `showDeadSurfaceNotice`'s existing contract is unchanged by the extraction.

### E2E

- **E1**: The full Playwright suite passes with no new spec added.
- **E2**: No E2E comment names a keyboard chord that the app does not bind.
- **E3**: `plain-shell.spec.ts`'s DEAD-tile test removes its scratch directory even when an
  assertion throws.

### Automated Checks

```checks
D13 make test
D14 go build ./...
D15 make lint
W6 make web-build
W7 make web-test
E1 make e2e
```

### Reviewer-Verified

- **D3**: the keep-real list is honoured in both directions — every test on it still builds
  a real tmux server, and no test off it does. Read the four files' server-construction
  call sites against Implementation Notes → Keep-real list; a migrated keep-real test
  passes while asserting nothing, so the compiler cannot catch this.
- **D5**: the shared helper is used at all eight sites and the `sun_path` rationale
  survives as a comment on the helper rather than being lost with the copies.
- **D7**, **D8**: `-web-dist` precedence and the fatal branch's two-remedy wording.
- **D10**, **D11**, **D12**: the dead state, the dead fields and the error bodies are gone.
- **W5**: `dead.test.ts`'s mirror assertions pass unchanged, or moved verbatim.
- **E2**: the six comments name shipped chords. Note for the fixer: `rail-order.spec.ts:582-586`
  describes a *past* decision, so `⌥⌘1–9` is the right replacement there rather than a rewording.
- **REQ-15**: the separator reads as a boundary against ordinary card dividers in all three
  themes — a judgement, not a contrast number (`--line` and `--line-control` are both
  documented as exempt from the contrast bar).
- **REQ-19**: the recorded `internal/server` runtime is a real measurement from this branch,
  with the invocation named, not an estimate.

## Implementation Notes

### Keep-real list (REQ-3)

These tests assert a tmux-observable effect — PTY stream, geometry, liveness, pane env,
kill scoping, real client attachment — and **keep a real tmux server**. Everything else in
these four files moves to fakes. This list is the plan's, not the test agent's.

`terminal_test.go` (12): `StreamsPTYOutputAndAcceptsInput`, `ResizeFrameAppliesRealGeometry`,
`ResizeFrameIsClampedToTheProtocolBounds`, `UnparseableResizeFrameIsIgnoredNotFatal`,
`SecondSocketSupersedesTheFirst`, `SupersedesMidTyping`, `SupersedesOnRefocus`,
`KillingTheTmuxSessionCloses4001AndNudgesLiveness`,
`KillingOneSessionAmongMultipleNeverMisroutesToAnother`,
`TakeoverNeverLeavesTwoClientsAttachedAtOnce`,
`ClientInitiatedCloseTearsDownThePTYPromptly`, `ShutdownClosesOpenTerminalSocketsNormally`.

`plainshell_test.go` (8): `HandleShellTerminal_StreamsPTYOutputAndAcceptsInput`,
`HandleShellTerminal_RunsInTheSessionsOwnDirectory`,
`HandleShellTerminal_SecondSocketSupersedesFirstButNeverTheClaudeSocket`,
`HandleTerminal_OpeningClaudeSocketNeverSupersedesAnOpenShellSocket`,
`HandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness`,
`HandleShellTerminal_KilledExternallyClosesSocketWith4001`,
`HandleRemoveSession_KillsBothTmuxSessionsForThatSessionOnlyAnotherSurvives`,
`HandleEndSession_LeavesShellRunning`.

`shells_test.go` (4): `EnsureSpawnsATmuxSessionNamedMusterIDShell`,
`EnsurePaneEnvironmentNeverCarriesMusterSession`,
`RespawnsAfterExternalKillWithNoMusterSession`, `KillRemovesOnlyItsOwnSession`.

`sessions_test.go` (1): `TestLauncher_SuccessfulLaunchEndToEnd` — it exists to prove a real
tmux window is spawned running a stub binary, which is the assertion.

The 20 that move: `terminal_test.go`'s four 404/409/cookie tests; `plainshell_test.go`'s
seven `HandleCreateShell_*`, `HandleShellTerminal_NoShellIs409NoShell`,
`HandleShellTerminal_UnknownSessionIs404`, `HandleShellTerminal_AttachOnlyNeverSpawns` and
`TestShellLifecycle_NeverWritesAnySQLiteRow`; `shells_test.go`'s
`EnsureIsIdempotentNoSecondSpawn`, `ConcurrentEnsureOnlySpawnsOnce`,
`KillIsANoOpWhenNoShellExists`; `sessions_test.go`'s
`TestLauncher_CorruptSettingsFileRefusesAndRollsBackTheSessionRow` and
`TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault`.

Three of those move from a tmux oracle to a call-shape assertion against the fake —
`EnsureIsIdempotentNoSecondSpawn`, `ConcurrentEnsureOnlySpawnsOnce` and
`AttachOnlyNeverSpawns` all assert "no second spawn", which the fake states directly
(a spawn count) rather than inferring it from tmux. That is a strengthening, not a
weakening: the current versions can only observe that a session exists, not that it was
created once.

### Seam shape (REQ-1, REQ-2)

Follow `internal/session/manager.go:19-35` exactly — the interface is declared in the
consuming package with a doc comment saying so, and `*tmux.Client` satisfies it without
knowing. `Config` gains nil-defaulting overrides in the shape `Config.Locator`,
`Config.UsageTokenFile` and `Config.ClaudeConfigFile` already use, so a zero-value `Config`
keeps behaving as it does today (`server.go`'s existing "zero values are safe for tests"
contract).

`termbridge.Attach` takes `*tmux.Client` concretely and returns `*termbridge.Bridge`, which
a test cannot fabricate — it holds a live PTY. That is why REQ-2 is two declarations, not
one: `paneConn` is the consumer-side view of a bridge (`Read`, `Write`, `Resize`, `Close`
— verified as the complete set `terminal.go` calls), and `attachFunc` returns that
interface rather than the struct. `internal/termbridge` itself is unchanged.

### Notice module (REQ-12, REQ-13)

`pane.ts:309-325` and `dead.ts:133-153` are the same fifteen lines twice; the
`plain-terminal-session` review recorded the duplication as deliberate mirroring ("mirrors
`TerminalSurface.showNotice` exactly"). Extract rather than patch both, so REQ-13's
distinction exists in one place. Keep `dead.ts`'s per-element `WeakMap` timer keying (Edge
Case 8) — it is the more careful of the two implementations, and `pane.ts`'s single
instance field is a special case of it.

REQ-13 changes `pane.ts` only. Every `showDeadSurfaceNotice` caller is a failure path
(`main.ts:576-581`), so its 5 s auto-hide stays correct and `dead.test.ts:220` must keep
passing as written — a fix that "corrects" both is wrong, and this is the most likely
mistake in the plan.

### Design system (REQ-15)

`--edge` is chosen because `docs/design/design-system.md` §1 already defines its role as
"boundaries that must be seen on their own, ≥ 3:1", which is exactly what the pinned-block
boundary is, and because it is defined in all three theme blocks. Adding a new token would
require editing every theme block *and* the reference renders (§1: values are transcribed
from `mockups/`), which is disproportionate to the finding. Thickness stays 1px — REQ-9 of
`order-sidebar` specified a hairline and the complaint was legibility, not weight.

### Doc upkeep (orchestrator)

- `TODO.md`: tick the two Pre-v1 Cleanup items (`internal/server` handler tests, the socket
  helper dedupe) and the loose Minors this plan closes — the `fix-auto-mode-select`
  follow-up, the E7 rename, the six chord comments, plus the un-checkboxed follow-up prose
  under `order-sidebar` (2)(3)(5), `embed-dashboard` (1)(2), `file-drop-fix` (all three) and
  `plain-terminal-session` (1)(2).
- `docs/design/test-strategy.md`: REQ-19's measurement row, and close the §Decision
  sentence that names these two as open follow-ups.
- `SPEC.md`: no changelog entry — no decision changes. Say so rather than inventing one.
- `docs/protocol.md`: unchanged; this plan has no delta to merge.

### Not in this plan

- Cutting v1 (deleting `--v0` from `release.yml`) — deliberately one separate commit.
- The `make canary` assertion for `CLAUDE_CODE_SCROLL_SPEED` — needs a real `claude`, which
  the pipeline cannot run.
- `t.Parallel()` in `internal/server` — a bigger lever than these seams, but it adds
  exactly the concurrent load `docs/design/test-strategy.md` measured as the cause of the
  2026-09-03 flakes. Reconsider once the forks this plan removes are gone.
- `plan-lint.sh` check 7's self-trip (a negative-grep check's own line matches the "plan
  text contains the banned pattern" scan, so any `! rg` check fails its own lint —
  reproduced against `plans/m4-hook-lifetime`). Why this plan authors no negative greps.
