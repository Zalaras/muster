# Review: v1 Cleanup

**Plan**: v1-cleanup
**Cycle**: 1
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `paneSpawner` consumer-side interface | Yes — `internal/server/server.go:35-46`, `sessions.go:71`, `shells.go:22` | Yes — `fakes_test.go`'s `fakeTmux` satisfies it; 20+ tests drive it | pass |
| REQ-2 `paneConn` + `attachFunc` | Yes — `server.go:48-62`, `terminal.go:40,206,287,326,368,396` | Yes — `fakePaneConn`, `fakeTmux.attach` | pass |
| REQ-3 fakes for every non-tmux-observable test in the four files | Yes | Yes — 21 migrated functions; keep-real list honoured both directions (see Reviewer-Verified D3) | pass |
| REQ-4 one shared socket helper at eight sites | Yes — `internal/tmux/tmuxtest/tmuxtest.go` | Yes — `tmuxtest_test.go` D5 long-name test | pass |
| REQ-5 `shellRegistry.spawned` deleted | Yes — `shells.go` (field, both writes, constructor) | Yes — behaviour tests unchanged/green | pass |
| REQ-6 nil `Locator` → 500 not panic | Yes — `locate.go:66-74`, below body validation | Yes — `TestHandleLocateFile_NilLocatorIs500NotAPanic` + `_NilLocatorStillValidatesBodyFirst` | pass |
| REQ-7 `Locator`'s unread fields deleted | Yes — `internal/locate/locate.go:41-43,50,60-62` | n/a (structural; verified by reading) | pass |
| REQ-8 fixed 500 strings | Yes — `sessions.go:477,507` | Structural (D12 verified by reading) | pass |
| REQ-9 `checkWebDist` takes `fs.FS` | Yes — `cmd/musterd/main.go:303,317`; `run()` passes `webui.FS()` | Yes — 6 tests incl. the previously-untestable fatal branch | pass |
| REQ-10 `maxRailPosLocked` doc comment | Yes — `internal/session/manager.go:786-788` | n/a (prose) | pass |
| REQ-11 `Makefile clean` historic note | Yes — `Makefile:104` | n/a | pass |
| REQ-12 one shared notice module | Yes — `web/src/terminal/notice.ts`; `pane.ts` and `dead.ts` both delegate; no third copy (`noticeTimer`/`noticeTimers` grep clean) | Yes — `notice.test.ts` ×12, `dead.test.ts` unchanged | pass |
| REQ-13 in-flight notice persists | Yes — `notice.ts` `kind: "inflight"`, only caller `pane.ts:275` | Yes — unit + **browser-measured** (below) | pass |
| REQ-14 two corrected comments | Yes — `api.ts:51-57`, `render/launch.ts:101-105`; both name both callers and say `null` is taken directly | n/a (prose) | pass |
| REQ-15 separator uses `--edge` | Yes — `style.css:1441,1448` | **Browser-measured in all three themes** (below) | pass |
| REQ-16 `stateSinceBefore` | Yes — `subagent-status.spec.ts:176,190-193` | Suite green | pass |
| REQ-17 six chord comments | Yes — six sites, all named chords bound | Verified against `shortcuts.ts` (E2 below) | pass |
| REQ-18 cleanup guard | Yes — `plain-shell.spec.ts:407,423,438` | Guard read; both throw windows covered | pass |
| REQ-19 measurement recorded | Yes — `docs/design/test-strategy.md:134-152` | **Independently reproduced** (below) | pass |

## Build & Tests

E2E tests: **pass** (281/281, full suite, `make e2e`, 1.3m, exit 0 — a regression sweep over all 25 spec files, not just this plan's)
Daemon tests: **pass** (`make test`, every package `ok`)
Web tests: **pass** (`npm test`, 29 files / 1053 tests)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`make lint`, golangci-lint 0 issues)

Extra gates run beyond the plan's block, because the diff touches CSS tokens, E2E specs and
new concurrent test doubles:

- `make contrast` — instrument/dark/light, 43 pairs each, 0 failures.
- `make e2e-lint` — clean (confirmed run, not re-derived).
- `go test -race -count=1 ./internal/server/ ./internal/tmux/tmuxtest/ ./cmd/musterd/` — all
  `ok`. `fakePaneConn` spawns a goroutine from `Write` and `fakeTmux` keeps unguarded-read
  counters, so this was worth checking; it is clean.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D13 | `make test` | pass |
| D14 | `go build ./...` | pass |
| D15 | `make lint` | pass |
| W6 | `make web-build` | pass |
| W7 | `make web-test` | pass |
| E1 | `make e2e` | pass |
| DOC | `TODO.md` ticks + `docs/design/test-strategy.md` REQ-19 row (`0b1a27f`) | pass — every closed item is genuinely closed by this diff, and REQ-19's numbers are a real measurement (verified below). `SPEC.md`: correctly no entry (no decision changed). `docs/protocol.md`: correctly unchanged (no delta). |

Run via `.claude/skills/orchestrate/scripts/gates.sh v1-cleanup --checks-only`: 6 lines, 0 failed.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D3 | keep-real list honoured in **both** directions | pass | Mapped every `Test*` in the four files to its server-construction call site (`awk` over `newTerminalTestServer` / `newTestShellRegistry` / `newTestTmuxClient` / `tmux.New(` vs `newFakeTmuxTestServer` / `newFakeShellRegistry` / `newFakeTmux(`). All 25 plan-listed keep-real names build a real server: `terminal_test.go` 12/12, `plainshell_test.go` 8/8, `shells_test.go` 4/4, `sessions_test.go` 1/1 (`SuccessfulLaunchEndToEnd`). No test **off** the list builds one: the 4 terminal 404/409/cookie tests, the 8 `HandleCreateShell_*`, `NoShellIs409NoShell`, `UnknownSessionIs404`, `AttachOnlyNeverSpawns`, `ShellLifecycle_NeverWritesAnySQLiteRow`, the 3 shells-registry tests and `AutoPermissionModeSeedsLatchAndRepoDefault` all take fakes; `CorruptSettingsFileRefusesAndRollsBackTheSessionRow` builds a `sessionLauncher` with no tmux field at all. `launchRealSession` inside a fakes test routes through `srv.tmuxClient`, which is the fake — no real server. |
| D5 | helper used at all eight sites; `sun_path` rationale survives on it | pass | `tmuxtest.Socket` called from `tmux_test.go:27`, `termbridge_test.go:26,36`, `server/terminal_test.go:41`, `server/shells_test.go:63`, `server/sessions_test.go:226`, `musterd/open_test.go:74`, `musterd/onexit_test.go:140` — eight. Rationale lives once, on `tmuxtest.go:19-27`. The one surviving `os.MkdirTemp` (`tmux_test.go:178`) is the deliberate *nested*-path D9 test, not a copy. |
| D7 | `-web-dist` precedence | pass | `main.go:305-313` returns from the disk branch before `HasDashboard` is consulted; `TestCheckWebDist_DiskOverridePrecedenceOverNonEmptyDashboard` proves it with a non-empty embedded FS *and* an empty disk dir, so only the disk branch can have decided. |
| D8 | fatal branch names both remedies | pass | `main.go:318` asserts on both `make web-build` and `-web-dist`; `TestCheckWebDist_NothingOnDiskNothingEmbeddedIsFatal` pins both strings. The old 16-line "why this can't be tested" comment block is gone, replaced by the test. |
| D10 | no write-only shell state | pass | `shells.go` has `tmux` + `log` + `mu` only; `spawned` and both its mutations are gone. |
| D11 | no unread `Locator` fields | pass | `internal/locate/locate.go:41-43` — `finders` only, and it is read by `Locate`. |
| D12 | no Go error text in the two 500 bodies | pass | `sessions.go:477` `"pinning session"`, `:507` `"setting rail order"`. |
| W5 | `dead.test.ts` mirror assertions unchanged | pass | `web/src/render/dead.test.ts` does not appear in `git diff main...HEAD --stat` at all — unchanged, not moved, not weakened, and green through the new delegation. |
| E2 | no E2E comment names an unbound chord | pass | Grepped every `⌘`-bearing comment in `web/e2e` myself: `⌘↑` (×5, `launch.spec.ts`), `⌥⌘N` (×5), `⌥⌘0`, `⌥⌘1`, `⌥⌘1–9`. All match `web/src/shortcuts.ts`'s `BINDINGS` (`KeyN`+meta+alt, `Backslash`+meta, `ArrowUp`+meta, `Digit0`/`Digit1-9`+meta+alt). No bare-modifier survivor. |
| REQ-15 | separator reads as a boundary in all three themes | pass | Browser-measured (below) — `#6a7286` vs `#343a4a` (instrument), `#737a87` vs `#3a3f49` (dark), `#8a8983` vs `#cbc9c2` (light). In the captured rail render the pinned/unpinned rule is now clearly the strongest horizontal line on the surface. |
| REQ-19 | recorded runtime is a real measurement | pass | Re-ran `go test -count=1 ./internal/server/...` on this branch: **18.650s**, inside the recorded 18.58 / 18.61 / 18.67 spread. The invocation is named in the table. The baseline column matches the file's pre-existing 2026-09-06 numbers. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge added outside `internal/claudecode/` | pass — no new field name anywhere in the diff |
| 2 | No terminal-output state parsing | pass — no `capture-pane` added; `fakePaneConn` streams nothing and derives no state |
| 3 | No blocking hook handler | pass — ingest untouched |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — `tmuxtest.Socket` uses `-S <private path>`; `resize-pane` appears nowhere in the tree; `paneConn.Resize` still routes to `termbridge.Bridge.Resize` (`pty.Setsize` + `resize-window`), unchanged |
| 5 | No payload logging | pass — no new log line carries a payload |
| 6 | No empty-gauge dishonesty | pass — no gauge touched; REQ-13 makes the notice *more* honest (an in-flight request now says so instead of silently blanking) |
| 7 | Identity on the tmux target | pass — untouched |
| 8 | No settings trespass / `CLAUDE_CONFIG_DIR` | pass — grep clean |
| 9 | No real `claude` in tests/fixtures | pass — `launchRealSession`'s doc reaffirms the stub-argv rule; nothing execs `claude` |

## Design System Compliance

- **Tokens**: the only `style.css` change is `--line-control` → `--edge` on `.card.pinned-last`
  and `.strip .card.pinned-last`. No literal added; `--edge` already exists in all three
  `[data-theme]` blocks (`:40, :91, :135`). No retired token name (`--ink`, `--panel`,
  `--paper`, `--muted`, `--dim`, `--line2`) appears. `make contrast` green.
- **No web fonts**: none added.
- **State colour is meaning**: `--edge` is a neutral boundary token, not a state colour; the
  separator carries no state meaning, as REQ-9 of `order-sidebar` specified.
- **Tabular numerics**: no new time-varying value rendered.
- **`[hidden]` companions**: the only `hidden`-toggled element in the diff's path is
  `.terminal-notice`, which has its `[hidden] { display: none; }` companion at `style.css:789`.
  Confirmed empirically in the browser — the notice genuinely disappears, it does not merely
  set the attribute.
- **Honesty (§6)**: REQ-13 removes a dishonesty rather than adding one — the surface no longer
  goes blank while a locate request is still running. No cost display, no "Done" state, no
  enum-switching on `StopFailure.error`.
- **Terminal rules (§7)**: no change to client counts, geometry ownership, `scrollback`, or
  pane-content styling. `paneConn` is a type-level narrowing of the same bridge.

## Test Quality

- The three "no second spawn" migrations (`EnsureIsIdempotentNoSecondSpawn`,
  `ConcurrentEnsureOnlySpawnsOnce`, `AttachOnlyNeverSpawns`) genuinely strengthen: a spawn
  *count* on the fake replaces "a tmux session with this name exists", which could only ever
  prove a collision was avoided.
- `TestShellLifecycle_NeverWritesAnySQLiteRow`'s redesign keeps every assertion it had and
  gains one — the resize is now read back from `fakePaneConn.resize()` rather than inferred.
- Nothing tests a platform guarantee. No `t.Skip`/`test.skip`/`test.fixme` added anywhere in
  the diff (grepped).
- `test-specs.md`'s `## Repairs` table is empty and the log states no assertion was deleted,
  skipped or weakened — confirmed against the actual `web/e2e` diff, which is six comment
  edits, one variable rename and one `finally`-guard addition. Nothing vacuous.
- Fixture plan: "none — no new spec". Honoured; no spec file added or removed (25 files,
  281 tests, same as before), and no `helpers/fixtures.ts` change.

## Manual Verification

Ran the real app, not just the tests. Started a scratch `musterd` (`bin/musterd`, its own
`-data-dir`, its own `-tmux-socket` under a short private path, a stub `-claude-bin`,
`-usage-poll=0 -claude-theme-poll=0 -open=false`), created two sessions and drove the
dashboard in a browser. Teardown: daemon killed, tmux server killed, scratch artifacts
removed; `git status` shows only the orchestrator's own two files.

- **REQ-15, pinned-block separator.** Pinned session 1, then read the computed style of
  `.card.pinned-last` under each `data-theme`:
  instrument `rgb(106,114,134)` = `--edge` `#6a7286` (vs `--line-control` `#343a4a`);
  dark `rgb(115,122,135)` = `#737a87` (vs `#3a3f49`); light `rgb(138,137,131)` = `#8a8983`
  (vs `#cbc9c2`). `1px solid` in all three — thickness unchanged. Also captured the rail:
  the rule below the pinned card is now visibly the boundary and no longer reads as another
  card divider. Judgement: the finding is addressed.
- **REQ-13 / W1 / W2, notice timing.** Focused a session, dispatched a real `drop` with a
  `DataTransfer` carrying a `File`, with the locate request delayed so the in-flight window
  is observable. Sampled the live `role="status"` element every 500 ms:
  `Locating dropme.txt…` held from 0.0 s through **9.0 s** — past the old 5 s auto-hide;
  the outcome `Can't locate dropme.txt on disk — paste its path instead` replaced it at
  9.5 s and cleared between 14.1 s and 14.6 s, i.e. ~5 s after the **outcome**, not after
  the drop. That is exactly the plan's User Flows 1 and 2, and it also demonstrates edge
  case 6 (the in-flight notice left no suppressed timer that swallowed the outcome's).
- Console during the run showed only the expected 404s (`not_located` is the protocol's own
  outcome status, plus one from my own mistyped probe). No script errors.
- Incidental confirmation of the `docs/design/test-strategy.md` preflight seam: with a stub
  that ignored `--version`, startup blocked in `claudecode.InstalledVersion` — i.e.
  `-claude-bin` really is honoured for the version probe, and the AF_UNIX `sun_path`
  preflight really does fire (it rejected my first, over-long socket path with the exact
  103-byte message).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[daemon-tests]** `internal/server/terminal_test.go:32` — `newTerminalTestServer`'s doc
   comment says "Everything else in this file uses `newFakeTerminalTestServer`", but no such
   constructor exists; it is `newFakeTmuxTestServer` (`fakes_test.go`). A maintainer grepping
   the named symbol finds nothing. One-word fix.
2. **[daemon-tests]** `internal/server/terminal_test.go:51-54` — `launchRealSession`'s doc
   comment still promises "a real Muster session row **and a real backing tmux session
   running argv**". That is now false for its eighteen fakes-server callers in
   `plainshell_test.go`, where `srv.tmuxClient` is a `fakeTmux`, no process runs and `argv`
   is never executed. This is precisely the trap D3 exists to guard against — a helper whose
   name and comment both say "real" while doing nothing real — so it is worth a sentence
   saying the realness follows the server it is handed.
3. **[daemon-tests]** `internal/server/fakes_test.go` — `containsExit` hand-rolls a substring
   scan that `bytes.Contains(p, []byte("exit"))` does in one line, with no behavioural
   difference. Delete the helper and inline the stdlib call.

### Notes

1. **[note]** `internal/server/sessions.go:575` (`handleSetTitle`) still puts `err.Error()` in
   its 500 body — the same class REQ-8/D12 closed for `handlePinSession`/`handleSetOrder`.
   daemon-impl left it deliberately (REQ-8 names only two handlers) and that was the right
   call for this plan. Recording it so the last instance is visible; no change requested.
2. **[note]** `NoticeTarget.textContent` is typed `string` while `HTMLElement.textContent` is
   `string | null`. It compiles clean under `strict` with the repo's TS 7.0.2 and both real
   call sites pass a real element, so nothing is wrong today — noting it only because a TS
   or lib.dom bump is the kind of thing that would surface it. No change requested.
3. **[note]** `make test` runs without `-race`. I ran the three touched packages under the
   race detector myself and they are clean, so this plan ships nothing racy; adding `-race`
   to the gate is a separate, larger decision (it roughly doubles `internal/server`'s
   runtime, against the grain of what this plan just bought back). No change requested.
