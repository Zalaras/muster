# Daemon Implementation: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Mode**: initial
**Pack**: `go run ./tools/kb pack --plan terminal-fixes-cleanup --role daemon-impl` — 10648 words
(over the 8000 budget; WARN, not an error), sections rules 1234 / features 2088 / decisions 5050 /
facts 251 / lessons 2017 / runbooks 2 — features `surfaces`, `theme`.

## Changes

| File | Action | What and Why |
|------|--------|---------------|
| `internal/tty/canonical.go` | created | `IsCanonical(ttyPath string) (bool, error)` — opens the tty `O_RDONLY\|O_NONBLOCK\|O_NOCTTY` and reads `ICANON` off a `TIOCGETA` ioctl via `golang.org/x/sys/unix` (D8/D9/D10, kb:adr/surfaces-shell-busy-from-tmux-process-state). |
| `internal/tmux/tmux.go` | modified | Added `PaneActivity` + `ListPaneActivity` (one `list-panes -a` invocation, D4), `ScrollCopyMode` (D1/D2, returns `entered bool` so the caller's copy-mode state tracking is accurate on the REQ-12/edge-case-10 no-op path) and `CancelCopyMode` (REQ-10). Split `DisplayVar`'s body into an unexported `displayVar` so production code (`ScrollCopyMode`'s `#{pane_in_mode}`/`#{history_size}` read) can share it while `DisplayVar` itself stays documented test-oracle-only. |
| `internal/server/terminal.go` | modified | Added `shellScroller` interface, `shellTextFrame`, `clampScrollLines` (D3), `pumpShellSocketToPTY` and `applyShellTextFrame` — the shell socket's own read-loop variant that decodes `scroll` in addition to `resize` and cancels copy-mode before every input write while `inCopyMode` (REQ-10). Factored `applyResizeFrame`'s inline logging into `logUnknownTextFrame`, shared by both frame decoders (D6: a `scroll` frame on the Claude socket still falls through `applyResizeFrame`'s existing "unknown Type" path unchanged — no code there needed to move). |
| `internal/server/shells.go` | modified | `shellFeature` gained a `scroll shellScroller` field (from `Config.ShellScroll`, defaulting to the real tmux client) and now calls `pumpShellSocketToPTY` instead of the shared `pumpSocketToPTY`. `shellRegistry` gained `activeIDs` + `markActive`/`HasAny` so the activity poller can skip its own tmux exec entirely when no session has ever opened a shell (plan Gotchas). |
| `internal/server/shellactivity.go` | created | `shellActivityFeature` (poller + snapshot contribution) and `shellActivityPoller`, modelled on `usagepoll.go`/`themepoll.go`'s Start/Stop/loop/tick shape. Ticks every 1s (`shellActivityPollInterval`), skips the tick entirely when `shellRegistry.HasAny()` is false, otherwise calls `ListPaneActivity` once, filters to shell panes via `tmux.IsShellSessionName`, gates on `AlternateOn`/basename before the `tty.IsCanonical` ioctl (D5/D9's cheaper-check-first ordering), and diffs the new busy set against the previous tick to broadcast one `shellActivity` message per session whose flag changed — the diff itself is what covers E7 (shell exits while busy) and E8 (daemon restart) without special-casing either: both just mean the session drops out of the next tick's pane list. |
| `internal/server/state.go` | modified | Added `Snapshot.ShellsBusy []int64` (`json:"shellsBusy"`, always non-nil) and initialized it in `buildSnapshot()`. |
| `internal/server/server.go` | modified | Added `Config.ShellScroll shellScroller` (nil → real tmux client, independent of `Config.TmuxClient`'s override — production copy-mode calls always want the real tmux, per the field's own doc comment). Registered `s.shellActivity` right after `s.theme` (before `s.update`), wired `shells.HasAny`/`tmuxClient.ListPaneActivity` into it. |
| `internal/tmux/CLAUDE.md` | modified | One added Invariants bullet distinguishing `ListPaneActivity`/copy-mode format reads (tmux's own process/mode tracking) from `CapturePane` (pane content) under the existing "never derive state by parsing terminal output" rule. |
| `go.mod` / `go.sum` | modified | `go mod tidy` promoted `golang.org/x/sys` from `// indirect` to direct (internal/tty's new import) — no new module added. |

## Decisions

Nothing here deviates from the plan's Affected Files or Protocol Contract. One implementation
choice not spelled out by the plan at that level of detail:

- `shellFeature.scroll` is a separate injectable field from `shellRegistry.tmux` (a `paneSpawner`),
  rather than adding `ScrollCopyMode`/`CancelCopyMode` to the existing `paneSpawner` interface.
  Extending `paneSpawner` would have required every existing fake implementing it (in
  `shells_test.go`/`sessions_test.go`/`server_test.go`) to gain the two new methods just to keep
  compiling — a test-file edit outside this agent's remit. A narrower `shellScroller` interface,
  defaulting to the real `*tmux.Client` in `server.go`, needed no existing test double to change
  and gives daemon-tests its own seam to fake independently of session-spawning behaviour.
- `shellRegistry.activeIDs` tracks "has Ensure run for this id and Kill not yet" rather than a
  precise live-shell count: a shell that exits via `exit` is not removed from the set until
  `Remove`'s `Kill` call. This only affects `HasAny`'s poll-skip optimisation (a few extra idle
  ticks in that window, never a stuck indicator — the busy diff itself, not this set, is what
  clears E7/E8), and keeping it simple avoided adding a second signal path the poller would have
  to reconcile against tmux's own truth.

Every daemon-side REQ/D criterion the plan lists is implemented: D1 (`ScrollCopyMode`'s
not-already-in-a-mode guard), D2 (single `send-keys -X -N`), D3 (`clampScrollLines`), D4
(`ListPaneActivity`'s one exec), D5/D8/D9 (`shellActivityPoller.tick`'s gate ordering), D6
(`scroll` on the Claude socket falls through `applyResizeFrame`'s existing unknown-frame path),
D7 (`serverOptions` untouched — `mouse off` still the only tmux mouse setting anywhere in
`internal/`, checked below), D10 (`tty.IsCanonical` opens `O_NONBLOCK`, never writes).

## Handoff

**Build status**: `go build ./...` exits 0.

`gofmt -l .` clean, `go vet ./...` clean, `make lint` — 0 issues (full tree, including test
files). `golangci-lint run --tests=false ./...` reports 2 pre-existing `unused` findings
(`(*Server).buildIssueSnapshot` in `internal/server/issue.go:541`, `(*Server).loadPrefs` in
`internal/server/prefs.go:160`) — both methods this plan never touches, only reachable from
`_test.go` callers the `--tests=false` flag excludes; not evidence of anything this plan broke.
`python3 .claude/skills/orchestrate/scripts/dead-refs.py` — 631 references checked, 0 missing.

**Sanctioned test breakage — two frozen tests contradicted by this plan's approved Protocol
Contract and Affected Files, not fixable without editing a test file:**

1. `internal/server/server_test.go:27` — `TestNew_RegistersLifecycleFeaturesInStartOrder`
   asserts `require.Len(t, lifecycles, 4, "exactly four features implement lifecycle: ingest,
   usage, theme, update")`. The plan's own Affected Files line ("internal/server/server.go —
   one-line registration of the poller") requires a fifth lifecycle feature
   (`shellActivityFeature`, Start/Stop backing the 1s poller) registered after `theme`. Needs a
   new `require.Len(t, lifecycles, 5, …)` plus a fifth `assert.Same(t, srv.shellActivity,
   lifecycles[4], …)` line — registration order (ingest, usage, theme, shellActivity, update) is
   fixed in `server.go` and this agent may not change the test's assertions itself.
2. `internal/server/state_test.go:20` — `TestBuildSnapshot_M0Shape` pins the exact
   `buildSnapshot()` JSON with `assert.JSONEq`, no `shellsBusy` key. The plan's Protocol Contract
   adds `snapshot.shellsBusy` as a new always-present top-level key
   (`docs/protocol.md` line ~809, already merged); `buildSnapshot()` now sets it to `[]`. Needs
   `"shellsBusy": []` added to the pinned JSON literal.

Reproduced just now: `go test ./internal/server/... -run
'TestNew_RegistersLifecycleFeaturesInStartOrder|TestBuildSnapshot_M0Shape' -v` — both FAIL with
exactly the shape difference described above (full diff pasted from the run: lifecycles has 5
items not 4; the marshaled snapshot gains one `"shellsBusy":[]` key the pinned literal lacks).
Every other package in `go test ./internal/... -count=1` passes; `internal/server`'s other tests
all still pass — these are the only two failures, and both are this exact, expected, sanctioned
shape change.

No other test files need changes for anything in this agent's scope.
