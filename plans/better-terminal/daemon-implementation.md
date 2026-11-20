# Daemon Implementation: better-terminal

**Plan**: better-terminal
**Mode**: initial
**Pack**: kb: pack 29334 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | `TerminalSessionName(id,n)`, `ParseTerminalName`; `ShellSessionName` = terminal 1; `IsShellSessionName` accepts every terminal name; `ParseSessionName` no longer needs the `-shell` suffix test (a terminal name fails its integer parse) |
| `internal/session/reconcile.go` | modified | reconcile kills every terminal name found on the socket (REQ-7, INV-3) instead of rebuilding `muster-<id>-shell` |
| `internal/server/terminalnames.go` | created | in-memory developer names, effective name `shell N` (REQ-4, 12, 19) |
| `internal/server/shellregistry.go` | created | registry moved out of `shells.go` (size): `running` (ListSessions), `lowestFree`, `EnsureAny`, `New`, `Close`, `Kill` (every terminal) |
| `internal/server/shells.go` | modified | routes `POST /shell` (+`n`), `POST /shells`, `PUT /shells/{n}/name`, `DELETE /shells/{n}`, `GET /ws/shell/{id}/{n}` (replaces `/ws/shell/{id}`) |
| `internal/server/shellactivity.go` | modified | poller builds each session's terminal list per tick, broadcasts the whole list on change (`terminals`), `sync` for on-demand broadcast, forgets names of ended terminals; `shellActivity` no longer sent |
| `internal/server/state.go` | modified | `snapshot.terminals` replaces `shellsBusy` |
| `internal/server/terminal.go` | modified | `terminalKey` gains `n` (one-live-client per terminal); `Watched` and `closeSessionAndShell` cover every terminal socket |
| `internal/server/launcher.go` | modified | `paneSpawner` gains `ListSessions` |
| `internal/server/server.go` | modified | wiring: names store, activity feature built before the shell feature so `poller.sync` is handed in; registration order unchanged |
| `internal/server/renderfix.go`, `renderfix_scenarios_misc.go` | modified | fake tmux `ListSessions`; scenarios `terminals-two`, `terminals-two-tiles`, `terminals-ten`; shell-* scenarios now list their terminal |
| `web/render/fixtures/*.json` | regenerated | `make gen-render-fixtures` (snapshot shape) |

`update.go` unchanged: `Manager.ShellNames` matches via `IsShellSessionName`, which now covers every terminal, so the kill-shutdown count/kill and restart-impact cover all terminals (REQ-7, D6). `session/actions.go` likewise unchanged.

## Decisions

design: terminal list is derived from tmux each poll, not held as registry truth. `rg 'ListPaneActivity|paneActivityLister'` showed the poller already lists every pane each tick; the list, busy flag and exit detection (REQ-6, 17) fall out of the same read. Matched `themePoller`/`usagePoller` (bgLoop, function-field seam). Spawn/close/rename call `poller.sync` (a tick under `tickMu`) so the broadcast is immediate; shared state `terms` guarded by `mu`, tick/sync serialised by `tickMu`.
design: `terminalNames` (new type) — `rg 'names|map\[.*\]string' internal/server` found no store for ephemeral per-key strings. Writers: rename handler (`set`), registry (`forget` on spawn/close/Kill), poller (`forget` on observed gone); guard `mu`.
design: `shellRegistry` split to `shellregistry.go` because `shells.go` reached 612 lines; handlers stay in `shells.go`. `spawnInSession` is the one place both spawn handlers share the session lock, 404, directory check and 500 (matched the former `handleCreateShell`).
design: lowest free `n` and "lowest running" come from `ListSessions` (added to `paneSpawner`), never a bounded loop (plan hint). Under the registry's per-session lock.
design: `terminalKey.n` is 0 for the Claude surface; `Watched`/`closeSessionAndShell` scan keys by session id rather than enumerating `n`.
deviation: none to the contract. Bad body on rename is `bad_request`/`invalid body` per the plan (differs from the title route's `invalid_request`; the plan's contract wins).
Not done on purpose: closing a terminal's socket when the poller observes it gone (D3 "pane gone at poll") — the attach PTY ends with the pane and the pump closes that socket itself; no extra path added.
Size: `tmux.go` (798) and `terminal.go` (534) were already over 500; kept, no split warranted for a few functions.
Pre-existing lint finding: `internal/claudecode/interpret_transcript.go:37 scanInterrupt unused` is on main, untouched.

## Handoff

**Build status**: `go build ./...` exits 0; `go vet -tags renderfix` clean for non-test files; `golangci-lint run --tests=false ./...` reports only the pre-existing `scanInterrupt` unused finding above.

Test files that no longer compile or assert the old shapes (sanctioned breakage, plan Protocol Contract delta):
- `internal/server/actions_test.go`, `fakes_test.go` (`fakeTmux` must implement `ListSessions`), and any other `paneSpawner` fake (`shells_test.go` `blockingNamedSessionTmux`/`racyCollisionTmux`/`neverRespondingTmux`, `shells_remove_lock_test.go` wrapper).
- `internal/server/shells_test.go`, `shells_remove_lock_test.go`: `newShellRegistry(fake, names, log)` takes a `*terminalNames`; `Ensure` is now `EnsureAny` (returns `n`); `newShellFeature` takes a `changed func(context.Context)`.
- `internal/server/shellactivity_test.go`: `newShellActivityPoller(lister, canonical, hasShells, shellBase, interval, names, broadcast func(int64, []terminalWire), log)`; `shellActivity` messages replaced by `terminals`; `Current()` is a map.
- `internal/server/state_test.go`, `server_test.go`: `shellsBusy` → `terminals`.
- `internal/server/plainshell_test.go`: dials `/ws/shell/{id}/{n}`.
- `internal/tmux` name tests (add `ParseTerminalName` cases, D1) and reconcile tests if they read `classifiedTmuxNames.shellIDs` (now `shellNames []string`).
- `web/e2e` shell specs/helpers per the plan list.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `make check-render-fixtures` stale on `moved-to-worktree{,-compact,-expanded}.json` (nondeterministic `claudeLocation`).

**Root cause (measured)**: `renderRig.repoTick` called `repoRefreshFeature.tick`, which skips a session whose `readRepoState` returns ok=false (its 5 s `repoReadTimeout` or a ctx check expired). All ~50 scenarios run concurrently, so git occasionally stalls past the deadline; the tick then silently applies nothing and the card keeps `claudeLocation: null`. Instrumented run: `READ .../epsilon false true` (ok=false, Location derived) with no following `SetRepoState`, 1 in ~6 runs per scenario set.

**Changes made**: `internal/server/renderfix.go` — `repoTick` now reads each alive target with `readRepoState` and applies it with `SetRepoState`, retrying an unfinished reading (up to 5 attempts) and returning an error if it never completes; returns `error`. The five callers (`renderfix_scenarios.go` x2, `_focus.go`, `_misc.go` x2) now `return r.repoTick(ctx)`. Fixtures regenerated (`make gen-render-fixtures`): the three moved-to-worktree files now carry the populated `claudeLocation`. Production `tick` untouched. Same race path covers `added-dirs-long` (it uses `repoTick` via `reportAddedDirs`/`driveAddedDirsTwo`); all five `repoTick` call sites are closed by the one change.

**Blast radius**: `repoTick` is rig-only (`rg repoTick internal/server` lists only the five scenario call sites above); no production consumer.

**Repro re-run**: `make check-render-fixtures` x5 consecutive: exit 0 each (run1..run5 exit=0).

**Decisions**: design: retry loop lives in the rig, not in `tick`, because production deliberately keeps the last-known repo on a timed-out reading (kb:adr/lifecycle-branch-refreshed-by-repo-poll); it reuses `readRepoState`/`SetRepoState` rather than a new reader. `rg "readRepoState"` shows tick as the only other caller.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: correctness Major 2, Minor 2; maintainability Minor 2, 3, 4; orchestrator note on restored docs.

**Changes made**
- `internal/server/renderfix_scenarios_misc.go`: `terminals-two-tiles` now `withPrefs(driveTerminalsTiles, {"view":"tiles","density":"3x2"})`; `make gen-render-fixtures` rewrote `web/render/fixtures/terminals-two-tiles.json` (now `"density": "3x2"`). Only that fixture changed. Paths: the one scenario registration was the only source of the density.
- `internal/server/shells.go`, `terminal.go`: a terminal's attach pump now nudges `f.changed` on clean PTY EOF (the existing `terminalPump.nudge` seam; shells passed nil). Paths reaching "terminal observed gone": poll (unchanged), PTY EOF (closed now), explicit DELETE (already `f.changed`), rename/spawn (already `f.changed`). Consumers of `nudge`/`pumpPTYToSocket`: `terminalFeature.handleTerminal` (session liveness, unchanged) and `handleShellTerminal` (only callers; `rg "pumpPTYToSocket\("` shows no test calls). Session liveness is never nudged by a terminal.
- `shells.go`: `spawnInSession` returns bool; both handlers branch on it (matches `parseSessionID`/`sessionOr404`).
- `shellregistry.go`, `terminal.go` docs: edited to say EnsureAny/New/Close/Kill, terminals, ListSessions, spawnInSession, terminal-list poller; mutex/guard/writer notes kept.
- `terminalswire.go` (new): `terminalWire`/`terminalsMessage` moved out of `shellactivity.go` (the `usage.go`/`usagewire.go` split).
- `renderfix_tmux.go` (new): `renderTmux` fake moved out of `renderfix.go` (real seam: the fake tmux vs the rig); renderfix.go 600 -> 540 lines (main: 564).

**Decisions**
- design: `shellActivityFeature`/`shellActivityPoller`/`s.shellActivity` keep their names: they are still the pane-activity poll (`ListPaneActivity` + tty canonical check) and renaming them would break symbol references in `shellactivity_test.go`, `terminals_test.go`, `server_test.go` (test files I may not edit). The wire types now live in `terminalswire.go`, so the terminal-list wire is findable by name. Grep: `rg "usagewire"` sibling shape matched.
- design: `renderfix.go` stays 540 lines (warn, not fail): the remainder is the rig's launch/hook/ingest/capture helpers that share `renderRig` state; further splitting would only scatter one type's methods.
- doc-delta: none; code now honours the contract's "or by its attach PTY ending".

## Handoff (fix attempt 2)

**Build status**: `go build ./...` 0; `go vet` clean; `make lint` 0 issues; `go test -race ./internal/server/` ok.
Test follow-up: **[render-tests]** drops the spliced `find-docs-tiles-3x2` prefs frame and its comment from the terminals-two-tiles render spec; the fixture now carries 3x2 itself. No Go test files broken.

## Fix Attempt 3 (review cycle 2)

**Failures addressed**: maintainability Major 1, `internal/server/renderfix_tmux.go` had no `//go:build renderfix` constraint, so the render rig fake tmux compiled into production `internal/server`.
**Changes made**: `internal/server/renderfix_tmux.go` now starts with `//go:build renderfix` and a blank line, like every sibling `renderfix_*.go`.
**Paths reaching the defect**: one (the file lost the tag in b437aef2). `rg renderTmux|newRenderTmux` finds consumers only in renderfix.go and renderfix_scenarios_misc.go, both already tagged.
**Repro after**: `go list -f ... ./internal/server | tr " " "\n" | grep -c renderfix` printed `0` (before: `renderfix_tmux.go` listed).
**Evidence**: `go build ./...` ok; `go vet -tags renderfix ./internal/server/` ok; `go vet ./internal/server/` ok; `gofmt -l internal/server` empty; `make check-render-fixtures`: render fixtures up to date (119 scenarios).
**Decisions**: none; no deviation or doc-delta.
