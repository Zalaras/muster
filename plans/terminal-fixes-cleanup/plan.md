# Plan: Terminal Fixes Cleanup

**Created**: 2026-09-21
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: shell-keys.spec.ts daemon (auto-focus needs the sole session); shell-scroll.spec.ts daemon (asserts tmux copy-mode state for the only session); shell-activity.spec.ts daemon (indicator assertions depend on which session is auto-focused)
**Features**: surfaces, theme
**Description**: The shell surface's three rough edges — a pip that reads as an alert, Option-Arrow emitting `3D`, and the wheel cycling shell history instead of scrolling — fixed without touching the Claude pane.

## Overview

Three reported issues (#31, #33, #45) all land on the plain shell surface and nowhere else.
The developer confirmed that Option-Arrow and wheel-scrolling both already work correctly in
the Claude pane, and measurement explains why: Claude Code reads the CSI modifier form of the
arrow keys natively, and it enables its own mouse tracking, so xterm.js reports the wheel to it
instead of falling back to cursor keys. A plain interactive shell does neither, so both inputs
misbehave there and only there.

The wheel fix is the substantial one. `tmux attach-session` puts the browser terminal on the
alternate screen (measured: it emits `ESC [ ? 1049 h`), so xterm-side scrollback can never hold
anything and `scrollback: 0` (design-system §7.4) stays correct. The only real buffer is tmux's
own pane history, which — unlike the Claude pane, whose inner app owns the alternate screen —
a plain shell genuinely fills. Turning tmux's own `mouse on` would scroll it, but once tmux
requests mouse tracking xterm.js routes every mousedown to the application and drag-to-select
stops working. So the daemon drives copy-mode directly instead: tmux `mouse` stays off, xterm
never learns any app wants the mouse, selection is untouched, and a new client→server control
frame on the shell socket carries the wheel.

The pip goes away entirely (#31) and is replaced by something that carries real information:
a spinner while the shell is running foreground work, and a tick when that work finishes.
Busy-ness comes from tmux's own process tracking (`#{pane_current_command}` plus
`#{alternate_on}`), never from pane content — `capture-pane` remains a test oracle only.

## Requirements

### Must Have

- [ ] REQ-1: A running shell, idle at its prompt, puts no indicator in the `claude | shell | docs`
  segment. The pip's dedicated colour token (the one `kb:adr/theme-shell-pip-own-token` introduced) is
  removed from all three theme blocks in `web/src/style.css` and from both of its
  `web/scripts/contrast-pairs.json` entries.
- [ ] REQ-2: While a session's shell is running a foreground command that is doing work rather
  than waiting for the user, that session's `shell` segment shows a spinner, in the Focus mainhead and in every tile footer that renders the segment.
- [ ] REQ-3: When the foreground command returns to the shell prompt while the spinner is
  showing, the spinner is replaced by a tick. A command that never raised a spinner never
  raises a tick.
- [ ] REQ-4: The tick clears when the user next selects that session's `shell` surface. If the
  `shell` surface is already the selected surface when the work finishes, the tick clears
  itself ~3 s later instead.
  - **Amended 2026-09-21 (orchestrator, mid-run):** this holds for a tick raised by a *live*
    `shellActivity` message. A tick *restored from a snapshot gap* always self-clears after
    ~3 s regardless of the selected surface. The two cases are indistinguishable on the wire
    (the daemon emits the same `shellsBusy` omission for "command finished" and "shell killed
    by a restart"), and requiring the persisting form on that path makes edge case 4 / E8
    unsatisfiable — measured: the indicator sat at `data-act="done"` for 20 s after a daemon
    restart with nothing scheduled to clear it. Recorded as
    `kb:adr/surfaces-snapshot-restored-tick-always-self-clears`; evidence in
    `plans/terminal-fixes-cleanup/web-implementation.md` § Decisions.
- [ ] REQ-5: Option+Left and Option+Right move the cursor by a word in a shell surface.
- [ ] REQ-6: Cmd+Left and Cmd+Right move the cursor to the start and end of the line in a
  shell surface.
- [ ] REQ-7: The mouse wheel over a shell surface scrolls that shell's tmux history and never
  reaches the shell as cursor keys, so it can no longer cycle command history.
- [ ] REQ-8: Dragging with the mouse across a shell surface still selects text in the browser,
  exactly as it does today.
- [ ] REQ-9: The Claude surface's keyboard handling, wheel handling and byte stream are
  unchanged by this plan.
- [ ] REQ-13: A program that sits waiting for input never holds the spinner on — including one
  on the **normal** screen, such as a language REPL or Claude Code run with its alternate
  screen disabled.
- [ ] REQ-14: A command that does its work silently — `sleep`, a quiet `go build`, a
  network-bound download — raises the spinner and the tick just like a noisy one.

### Should Have

- [ ] REQ-10: Typing while a shell is scrolled back returns it to the live bottom first, so
  keystrokes always reach the shell rather than being consumed as copy-mode motions.
- [ ] REQ-11: The spinner appears only once work has run for at least ~600 ms, so a fast
  command does not flash a spinner and a tick.

### Nice to Have

- [ ] REQ-12: Scrolling a shell that has no history yet does not put the pane into copy-mode.

## Protocol Contract

Delta against `docs/protocol.md`. Two additions; nothing existing changes shape.

### WS: UI→daemon `scroll` (text frame, `kb:anchor/terminal.shell-ws` only)

```json
{ "type": "scroll", "lines": "int — signed; >0 scrolls back into history, <0 scrolls toward the live bottom. Magnitude clamped to [1, 200]." }
```

Sent by the dashboard on a wheel gesture over a shell surface, coalesced to at most one
frame per animation frame. The daemon translates it into tmux copy-mode commands against
`muster-<id>-shell`: if the pane is not already in copy-mode and `#{history_size}` is greater
than zero it issues `copy-mode -e`, then `send-keys -X -N <magnitude> scroll-up` or
`scroll-down`. `copy-mode -e` makes tmux leave copy-mode by itself once the pane is scrolled
back to the bottom, so no explicit exit frame exists. Scrolling past either end clamps and is
not an error. The resulting pane redraw arrives over the same socket as ordinary binary PTY
output, so no new server→client frame kind is introduced.

**Not accepted on `kb:anchor/terminal.ws`.** The Claude pane's socket treats `scroll` as what
it already is for any unknown text frame — ignored and logged, never fatal — and the dashboard
never sends one from a `claude` surface.

### WS: daemon→UI `shellActivity` (on `/ws`, the state stream)

```json
{ "type": "shellActivity", "sessionId": "int — the Muster session whose shell this is",
  "busy": "bool — true while the shell's foreground command is not the shell itself, is not on the alternate screen, and holds the pane's tty in canonical mode (i.e. no interactive line-editor or TUI is in charge)" }
```

Broadcast on every observed change of a shell's busy flag, from a ~1 s poller reading
`#{pane_current_command}`, `#{alternate_on}` and `#{pane_tty}`, then one `TIOCGETA` ioctl per
shell to read that tty's line discipline. It carries no
`since` and no ordering guarantee beyond the socket's own. It is deliberately **not** a
`Session` field and adds no session state: a shell is still not a session
(`kb:adr/surfaces-shell-is-attach-target-not-session`). It has to travel on `/ws` rather than
the shell socket because the shell socket only exists while the `shell` surface is selected,
and the whole point of the tick is that it survives being away from that surface.

`snapshot` gains one top-level key so a reconnecting dashboard re-syncs without waiting for a
transition:

```json
{ "shellsBusy": "int[] — session ids whose shell is busy right now; [] when none, always present" }
```

## Schema Changes

No schema changes required. Shell activity is polled state with no persistence — a daemon
restart re-derives it, and reconcile kills every `muster-<n>-shell` session at startup anyway.

## UI Specifications

### Views

- **Focus mainhead** (`.mainhead .surfseg`) — the `shell` segment gains the activity indicator.
- **Tile footer** (`.tfoot .acts .surfseg`) — the same component, same indicator, smaller size.

Both are the one component in `web/src/terminal/surfaceswitch.ts`, built once per host and
mutated on render, per `docs/conventions.md`'s "focusable controls inside the render tick are
reused, never rebuilt".

### User Flows

1. The user opens a shell and runs `go test ./...`. Within ~1 s the `shell` segment shows a
   spinner, in the mainhead and in that session's tile footer.
2. The user switches to the `claude` surface while the tests run. The spinner stays visible on
   the `shell` segment.
3. The tests finish. The spinner becomes a tick and stays.
4. The user clicks `shell`. The tick clears as the surface is selected.
5. Had the user still been on the `shell` surface at step 3, the tick would have appeared and
   cleared itself ~3 s later.
6. The user scrolls the wheel up over the shell. The pane scrolls back through real output.
   Scrolling back down to the bottom returns to the live prompt with no explicit action.
7. The user drags across some output. It selects, and copies, exactly as before.

### States

- **No data yet**: before any shell exists for a session, the segment renders exactly as it does
  for a session that has never had one — three buttons, no indicator. There is no "unknown"
  gauge here to get wrong; absence of a shell and an idle shell are deliberately
  indistinguishable (REQ-1), which is the whole point of #31.
- **Data**: spinner while busy, tick after busy→idle, nothing otherwise.
- **Daemon down**: the segment's buttons are already disabled while the WS is down (existing
  behaviour). The indicator freezes at whatever it last showed rather than inventing a state,
  and `shellsBusy` in the next `snapshot` re-synchronises it on reconnect.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Surface segment group | `group` | `Surface` | unchanged (`role="group" aria-label="Surface"`) |
| `claude` segment | `button` | `claude` | unchanged |
| `shell` segment | `button` | `shell` | accessible name stays exactly `shell` in **every** indicator state — the indicator is `aria-hidden` (INV-3) |
| `docs` segment | `button` | `docs` | unchanged |
| Shell activity indicator | — | — | `span.shellact` inside the `shell` button, carrying `data-act="busy"` or `data-act="done"`. Its **presence and `data-act` value** are the contract, as `span.pip`'s presence was; no implicit ARIA role, so the locator strategy is e2e-specs' call |

The removed pip span and its colour token have no entry here any more; nine existing
assertions in `plain-shell.spec.ts` and `reader.spec.ts` reference the pip locator helper in
`web/e2e/helpers/shell.ts` and are the test agents' to retire.

### Invariants

- **INV-1 — the Claude surface is untouched.** From every reachable state (focused pane, tile,
  after a theme switch, after a reclaim on a superseded socket, with a shell open on the same
  session, with shells open on *other* sessions), a `claude` surface never installs the wheel
  handler, never installs the key handler, and never sends a `scroll` frame. Assert from each
  of those source states, not just the convenient one.
- **INV-2 — no mouse tracking is ever requested for a shell.** tmux's `mouse` option is `off`
  globally and is never set on for any session or window by this plan. Assert by reading the
  option back after a shell spawn, after a scroll, and after a copy-mode auto-exit; and assert
  no mouse-enable sequence (`?1000h`, `?1002h`, `?1003h`, `?1006h`) ever reaches the browser.
  This invariant is what REQ-8 rests on.
- **INV-3 — the `shell` button's accessible name is exactly `shell`.** In all four indicator
  states (absent, busy, done, and during the ~3 s self-clearing tick), and at both sizes.
- **INV-4 — activity is per session and never bleeds.** With three sessions each holding a
  shell, one shell going busy changes exactly one segment in the mainhead and exactly one tile
  footer; the bystanders' segments are unchanged. Scrolling one shell never puts another
  session's pane into copy-mode.

### Carried-over measurements

- `kb:adr/surfaces-scrollback-affordance-not-built` (**rejected**) is re-checked against this
  plan and **still holds where it was measured**. Its premise is that Claude Code owns the
  alternate screen, leaving tmux's history empty, so there is nothing to scroll and a
  copy-mode surface would open onto an empty buffer. Re-measured 2026-09-21: true for the
  Claude pane; false for the plain shell, whose tmux pane accumulated 179 lines of real
  history in the same rig. The plain shell surface did not exist when that ADR was written
  (it landed two days later, in plan `plain-terminal-session`). This plan therefore **narrows**
  that ADR to the Claude pane rather than reversing it, and does not reintroduce either claim
  it forbids: the wheel still does not reach copy-mode by itself (measured — tmux with
  `mouse off` swallows injected SGR mouse bytes and does nothing), and no design pass on a
  copy-mode surface is proposed. The daemon issues copy-mode commands; the browser gets a
  redraw.
- `kb:adr/surfaces-scroll-speed-via-launch-env` and `kb:fact/scroll-speed-env-present` are
  re-checked and unaffected: `CLAUDE_CODE_SCROLL_SPEED` governs the Claude pane's wheel, which
  this plan does not touch (INV-1). The shell pane carries no Muster session environment
  (`kb:adr/surfaces-shell-pane-carries-no-session-env`), so the variable was never in play there.
- design-system §7.4 (`scrollback: 0` in xterm.js) is re-checked and **stays as written**,
  now for a second measured reason: `tmux attach-session` emits `ESC [ ? 1049 h`, so the
  browser terminal is always on the alternate buffer and xterm-side scrollback is unreachable
  for either surface.

## Affected Files

### Daemon

- `internal/tmux/tmux.go` — add `ScrollCopyMode(ctx, target string, lines int) error` (the
  `copy-mode -e` / `send-keys -X -N n scroll-up|scroll-down` pair, with the `history_size` and
  `pane_in_mode` reads it needs), `CancelCopyMode(ctx, target string) error`
  (`send-keys -X cancel`, REQ-10), and `ListPaneActivity(ctx) ([]PaneActivity, error)` — one
  `list-panes -a -F '#{session_name} #{pane_current_command} #{alternate_on} #{pane_tty}'`
  invocation
  covering every shell on the socket (measured: one exec regardless of shell count).
  `serverOptions` is **not** touched: `mouse` stays `off` (INV-2).
- `internal/server/terminal.go` — decode the `scroll` text frame on the shell route only and
  dispatch it; cancel copy-mode before writing input bytes when the pane is in a mode (REQ-10).
- `internal/tty/canonical.go` *(new)* — `IsCanonical(tty string) (bool, error)`: opens the tty
  `O_RDONLY|O_NONBLOCK|O_NOCTTY` and reads `ICANON` off a `TIOCGETA` ioctl via
  `golang.org/x/sys/unix`. Measured not to disturb the running shell. `go.mod` promotes
  `golang.org/x/sys` from indirect to a direct requirement; no new module is added.
- `internal/server/shellactivity.go` *(new)* — the ~1 s poller, modelled on
  `internal/server/usagepoll.go`: derives `busy` as "foreground command differs from the
  shell's own basename **and** `alternate_on` is 0 **and** the pane's tty is in canonical
  mode", holds the current busy set, broadcasts a
  `shellActivity` message on each change, and exposes `Current()` for the snapshot builder.
- `internal/server/ws.go` — add `shellsBusy` to the `snapshot` payload.
- `internal/server/server.go` — one-line registration of the poller.
- `internal/tmux/CLAUDE.md`, `internal/server/CLAUDE.md` — the hand-written halves, if the new
  seams warrant a line.

### Web

- `web/src/terminal/pane.ts` — install, for `kind === "shell"` only, a custom key handler
  (Option+Left/Right → `ESC b` / `ESC f`; Cmd+Left/Right → `0x01` / `0x05`) and a custom wheel
  handler that suppresses xterm's cursor-key fallback and emits the coalesced `scroll` frame.
  Both guarded so a `claude` surface installs neither (INV-1).
- `web/src/terminal/shellkeys.ts` *(new)* — the pure key→bytes mapping, so it is Vitest-testable
  without a DOM.
- `web/src/terminal/shellactivity.ts` *(new)* — the pure reducer over `shellActivity` messages
  and surface selections that produces `"none" | "busy" | "done"` per session, including the
  REQ-11 onset delay and the REQ-4 clearing rules. No DOM, no socket.
- `web/src/terminal/surfaceswitch.ts` — delete the pip element and all its wiring; render
  `span.shellact` from the reducer's verdict, `aria-hidden` (INV-3).
- `web/src/protocol.ts` — the `shellActivity` message and `snapshot.shellsBusy` validators.
- `web/src/features/surfaces.ts` — own the reducer's state; clear on surface selection.
- `web/src/style.css` — remove the pip's colour token from all three theme blocks, and the two
  pip rules (mainhead and tile-footer sizes); add `.shellact` (spinner keyframes and tick), monochrome —
  `--fg-dim` for the spinner, `--fg` for the tick, so no state hue acquires a second meaning
  and no new theme token is introduced.
- `web/scripts/contrast-pairs.json` — remove both entries for the pip's colour token (the
  exemption and the `hueBand` range), or the contrast gate fails on a token that is gone.
- `web/e2e/helpers/shell.ts` — replace the pip locator and its token assertion with a
  `shellActivity` locator. **web-impl owns this file**, not e2e-specs.

### Doc upkeep (the orchestrator's, not an impl track's)

- `docs/protocol.md` — merged at approval, before the pipeline runs (see below).
- `docs/features/surfaces/spec.md`, `docs/features/theme/spec.md` — per the Doc Delta.
- `docs/adr/` — the four `proposed` ADRs listed under Implementation Notes.
- `spikes/S7-shell-surface-inputs.md` — already written at approval; the measured tmux,
  xterm.js and shell behaviours live there, **not** in `docs/facts/`, whose records require a
  Claude Code `verified` version and are for Claude-Code-format facts.
- `kb:diagram/daemon-components` — the new `internal/tty` package joins the adapters group,
  in the same commit as the code (CLAUDE.md doc upkeep).
- `TODO.md` → `docs/history/todo-done.md` — the "Together — the shell tab (#31, #33, #45)"
  block moves across at Completion.

## Edge Cases

1. The shell exits (`exit`) while busy — the `4001 pane_ended` close already reverts the surface;
   the poller must also drop the session from the busy set rather than leaving a stuck spinner.
   → E7
2. The shell exits while a tick is showing — the tick goes with the segment's reset to the
   default state. → E7 (shared with edge case 1)
3. Work finishes during a WS disconnect — no `shellActivity` arrives; the next `snapshot`'s
   `shellsBusy` omits the session, and the reducer must treat "was busy, now absent from
   snapshot" as a completion and show the tick. → W6
4. The daemon restarts mid-command — reconcile kills every `muster-<n>-shell` session, so the
   shell is gone, not merely idle; the reducer clears to `none`, not to a tick. → E8
5. A command finishes and another starts within the tick window — the spinner replaces the
   tick immediately; the pending 3 s timer is cancelled, never left to fire over the spinner.
   → W7
6. A command shorter than the REQ-11 onset delay — no spinner, and therefore no tick either.
   → W8
7. The user runs `vim` in the shell — `alternate_on` is 1, so this is not busy and no spinner
   appears, for as long as vim runs. Measured. → D5
8. A nested `claude` in the shell, default config — it enters the alternate screen when its
   TUI starts (`spikes/S6-scroll-bandwidth.md` §1), so `alternate_on` is 1 and it is never
   busy, exactly like case 7. → untested: indistinguishable from case 7 at the seam under
   test, and running a real `claude` in E2E is forbidden by CLAUDE.md.
9. A background job (`sleep 30 &`) — tmux reports the shell as the foreground command, so this
   is correctly not busy. Measured. → D5 (shared with edge case 7)
10. Wheel over a shell with no history at all — `history_size` is 1 on a fresh pane, so the
    guard is "greater than zero", and REQ-12's case is really "nothing to scroll to"; the pane
    enters copy-mode and the very next scroll-down exits it. Acceptable; asserted as
    "no crash, and the pane is not left in copy-mode after scrolling back down". → E9
11. Wheel scrolled past the top of history — tmux clamps (measured: 181 of 181) and returns 0.
    → E9 (shared with edge case 10)
12. Typing while scrolled back — the daemon cancels copy-mode before writing the bytes, so the
    keystroke reaches the shell and the pane jumps to the live bottom. → E10
13. A `scroll` frame arrives on the Claude socket (a bug, or a stale client) — ignored and
    logged, exactly as any unknown text frame already is; never fatal. → D6
14. Two sessions' shells busy at once — two independent spinners, no cross-talk. → E11
15. The WS reconnects while three shells are busy — `shellsBusy` carries all three and the
    reducer restores three spinners without firing three ticks. → W9
16. A shell surface is superseded (`4000`) while busy — the spinner is driven by `/ws`, not the
    shell socket, so it keeps updating regardless of which surface holds the live socket. → E12
17. The wheel is used over a `docs` surface — there is no `TerminalSurface` there at all
    (`kb:spec/reader`, INV-1 of plan markdown-viewing), so nothing is installed and the reader
    scrolls natively. → untested: no code path is added or changed for `docs`.
18. A nested `claude` run with `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` (a measured, real
    configuration — `spikes/S6-scroll-bandwidth.md` §5) — `alternate_on` is 0, so that gate
    does not save us. The tty gate does: its TUI reads keypresses, so the tty is in raw mode
    and it is never busy. → D8
19. Claude Code's trust prompt, which renders in the **normal** buffer before the TUI starts
    (`spikes/S6-scroll-bandwidth.md` §1) — `alternate_on` is 0, but it is waiting on a
    keypress, so the tty is raw and it is not busy. → D8 (shared with edge case 18)
20. A language REPL on the normal screen (`python3`, `node`, `psql`) sitting at its prompt —
    readline holds the tty in raw mode, so it is not busy, and exiting it raises no tick.
    Measured. → D8 (shared with edge case 18)
21. A command that does its work silently and burns no CPU (`sleep 9`, a quiet `go build`, a
    network-bound download) — the tty stays canonical, so it **is** busy and does raise a
    spinner and a tick. Measured; this is why the tty gate was chosen over an
    output-activity or CPU-delta gate, both of which missed this case. → D9
22. A program that reads stdin in canonical mode with no line editor — bare `cat`, `head`
    with no argument — reads as busy for as long as it waits. Accepted false positive: it is
    the one shape the tty gate cannot separate from work, it is rare in an interactive shell,
    and it self-clears the moment the command ends. → untested: no daemon-side branch
    distinguishes it, so there is nothing to assert beyond D8's rule itself.

## Acceptance Criteria

### Daemon

- **D1**: `tmux.ScrollCopyMode` enters copy-mode with `-e` only when the pane is not already in
  a mode.
- **D2**: `tmux.ScrollCopyMode` issues a single `send-keys -X -N <n>` rather than `n` separate
  invocations.
- **D3**: the `scroll` frame's `lines` magnitude is clamped to `[1, 200]`.
- **D4**: `ListPaneActivity` reads every shell on the socket in one `tmux` invocation.
- **D5**: a pane whose `alternate_on` is 1 is never reported busy, whatever its
  `pane_current_command`.
- **D8**: a pane whose foreground command differs from the shell but whose tty is in raw mode
  is not reported busy.
- **D9**: a pane running a silent, zero-CPU command (`sleep`) in canonical mode **is** reported
  busy.
- **D10**: reading a pane's tty mode does not disturb the running shell.
- **D6**: a `scroll` frame on `kb:anchor/terminal.ws` is ignored and logged, and does not close
  the socket.
- **D7**: the tmux server options this daemon applies still contain `mouse off`, and the plan
  adds no per-session or per-window `mouse` override anywhere (INV-2).

### Web

- **W1**: Option+Left over a shell surface sends `ESC b`, and Option+Right sends `ESC f`.
- **W2**: Cmd+Left sends `0x01` and Cmd+Right sends `0x05`.
- **W3**: the key handler and the wheel handler are installed for `kind === "shell"` and for no
  other kind (INV-1).
- **W4**: a wheel gesture produces at most one `scroll` frame per animation frame.
- **W5**: the `shell` button's accessible name is exactly `shell` in all four indicator states
  (INV-3).
- **W6**: a session that was busy and is absent from the next `snapshot.shellsBusy` resolves to
  the `done` indicator.
- **W7**: a new busy period cancels a pending tick timer rather than letting it fire later.
- **W8**: work shorter than the onset delay produces neither a spinner nor a tick.
- **W9**: restoring three busy sessions from `shellsBusy` yields three spinners and zero ticks.
- **W10**: no `any` types in the new web modules.
- **W11**: the spinner and tick resolve to `--fg-dim` and `--fg`, not to any of the four state
  hues.

### E2E

- **E1**: typing in a shell, pressing Option+Left twice and typing a character inserts it at a
  word boundary, verified against the tmux `capture-pane` oracle.
- **E2**: Cmd+Left then a character inserts at the start of the line.
- **E3**: the same key presses over a Claude surface are unchanged (INV-1).
- **E4**: a wheel-up over a shell surface with real history puts that shell's pane into
  copy-mode with a non-zero `#{scroll_position}`.
- **E5**: wheeling back down to the bottom leaves copy-mode by itself — `#{pane_in_mode}` is 0
  with no explicit action.
- **E6**: a wheel-up over a shell surface never inserts a character into the shell's command
  line (the #45 symptom itself).
- **E7**: a shell that exits while busy leaves no spinner and no tick behind.
- **E8**: a daemon restart mid-command clears the indicator to nothing rather than to a tick.
- **E9**: wheeling up hard on a shell with little history clamps without error and is not left
  in copy-mode after scrolling back down.
- **E10**: typing while a shell is scrolled back delivers the keystroke to the shell and returns
  the pane to the live bottom.
- **E11**: with two sessions' shells busy, exactly the two matching segments show spinners.
- **E12**: a shell surface superseded while busy still tracks the spinner through `/ws`.
- **E13**: dragging across a shell surface produces a non-empty browser text selection (REQ-8,
  the guarantee INV-2 exists to protect).
- **E14**: the pip's colour token survives nowhere in the web tree.
- **E15**: the pip element and its E2E locator helper survive nowhere in the web tree.

### Automated Checks

Negative-grep scope: `web/e2e/` and `*.test.ts` **are** inside the net for the two pip-removal
checks (E14, E15). Nothing legitimately needs those strings after this plan — the pip is
gone from the product, so a test still naming it is a test that was not retired, which is
exactly what the check should catch. `web/e2e/helpers/shell.ts` is listed under web-impl's
Affected Files for precisely this reason.

```checks
D1 make test
D2 go build ./...
D3 make lint
D7 ! rg -n "\"mouse\", \"on\"|mouse on" internal/ --glob '!*_test.go'
W1 make web-build
W2 make web-test
W10 ! rg -n ": any\b" web/src/terminal
E14 ! rg -n -e "--shell-pip" web/src web/scripts web/e2e
E15 ! rg -n -e "pipEl" -e "shellPip" web/src web/e2e
E1 make e2e
```

### Reviewer-Verified

- **W5**: the `shell` button's accessible name is exactly `shell` in all four indicator states —
  needs the accessibility tree, not a grep.
- **W11**: the spinner and tick resolve to `--fg-dim`/`--fg` and to no state hue.
- **D5**: `alternate_on` gating reads correctly against the measured table in the fact record.
- **INV-1**: read `pane.ts` and confirm both handlers are unreachable for `kind !== "shell"`.
- **INV-2**: confirm no code path sets tmux `mouse` on, and that no mouse-enable sequence
  reaches the browser for a shell.

## Doc Delta

**surfaces** — becomes true:
- `docs/features/surfaces/spec.md` states that the shell surface's wheel scrolls the pane's tmux
  history, driven by a `scroll` control frame the daemon translates into copy-mode commands,
  and that tmux mouse mode stays off so browser text selection is preserved.
- It states that Option+Arrow and Cmd+Arrow are translated to their readline equivalents on a
  shell surface only.
- It states that a shell reports a busy flag derived from tmux's foreground command and
  alternate-screen flag, and that the segment shows a spinner while busy and a tick once work
  finishes.

**surfaces** — stops being true:
- "A running shell shows a pip with its own token." — deleted; a running, idle shell now shows
  nothing.
- The sentence "tmux owns scrollback, so xterm keeps none and no scroll affordance is built
  (kb:adr/surfaces-scrollback-affordance-not-built)" is narrowed: xterm still keeps none, but
  "no scroll affordance is built" now holds for the Claude pane only.

**theme** — becomes true:
- `docs/features/theme/spec.md` need not gain anything; the pip's token was never named there.

**theme** — stops being true:
- Nothing in the spec body. The retired claim lives in
  `kb:adr/theme-shell-pip-own-token`'s consequence "a new theme must supply it", which the
  superseding ADR retires.

## Out of scope

- Raising tmux's `history-limit` above its default 2000 lines for shell sessions. Scrolling
  works against whatever history tmux keeps; changing the depth is a separate, easily-reversed
  knob and nobody has reported hitting the ceiling.
- A visible scrollbar or position indicator in the shell surface. The wheel now scrolls real
  history, which is what #45 actually asked for; a rendered scrollbar over a remote buffer is a
  design pass of its own.
- Option/Cmd+Arrow in the Claude pane. They already work there (developer-confirmed, and
  measured: Claude Code reads the CSI modifier form natively).
- Copy-mode search, or any other tmux copy-mode command beyond scrolling.

## Implementation Notes

### Decisions this plan makes (each becomes a `status: proposed` ADR at approval)

- `surfaces-shell-scroll-via-daemon-copy-mode` — the wheel on a shell surface is a control
  frame the daemon turns into tmux copy-mode commands, rather than tmux `mouse on`. Options
  weighed: (A) tmux `mouse on` per shell session — measured working, but xterm.js's
  `shouldForceSelection` then gates selection behind `altKey && macOptionClickForcesSelection`
  on macOS, costing drag-to-select; (B) inject SGR mouse bytes as PTY input with mouse off —
  measured **dead**, tmux swallows them; (C) the daemon drives copy-mode — measured working
  with selection fully intact. C. `supersedes: []`, but `refs` must cite
  `kb:adr/surfaces-scrollback-affordance-not-built` and explain the narrowing.
- `surfaces-scrollback-affordance-claude-pane-only` — narrows the rejected ADR above to the
  Claude pane, recording that the plain shell postdates it and that its premise was
  re-measured and does not hold there. `supersedes: [surfaces-scrollback-affordance-not-built]`.
- `surfaces-shell-busy-from-tmux-process-state` — shell busy-ness is derived from
  `#{pane_current_command}`, `#{alternate_on}` and the pane tty's line discipline, never from
  pane content. Records that this
  does not breach the "never derive state by parsing terminal output" hard rule: it is tmux's
  own process tracking through its query API, and `capture-pane` remains a test oracle only.
  Records the discriminator: a program **waiting for the user** puts the tty in raw mode (zsh's
  zle, readline, any TUI, Claude Code's trust prompt), while a **batch command** leaves it
  canonical — so "is a line editor in charge" answers "is this work?" directly, where process
  name alone cannot. Records the two gates that were measured and **rejected as weaker**: an
  output-activity gate (`#{window_activity}`) and a CPU-delta gate both correctly excluded
  REPLs but both wrongly excluded silent, zero-CPU work such as `sleep` or a quiet build; the
  tty gate gets all six measured cases right and is one ioctl rather than a sampled heuristic.
  Records the one accepted false positive: a program reading stdin in canonical mode with no
  line editor (bare `cat`) reads as busy. Records the rejected alternative, OSC 133
  semantic-prompt markers, and **why it is not the better option it looks like**: (a) it would
  not fix the REPL case at all — the shell emits `133;C` when `python3` starts and nothing
  until it exits, so a REPL reads as a running command for its whole life; (b) tmux 3.7 parses
  only `133;A` and `133;C`, purely to drive copy-mode's `next-prompt`/`previous-prompt`,
  exposes no format for them and ignores `133;D`, so there is no exit status to be had;
  (c) reading them would mean sniffing the PTY byte stream, which the daemon only holds while
  the shell surface is mounted — precisely when the tick is pointless; and (d) emitting them
  would mean injecting startup hooks per shell dialect into the user's own `$SHELL -i`
  (`internal/server/shells.go`), against the spirit of
  `kb:adr/surfaces-shell-pane-carries-no-session-env`.

### Measurements on record

All of the below are written up in `spikes/S7-shell-surface-inputs.md` (tmux 3.7b /
xterm.js 6.0.0, 2026-09-21). They are terminal-stack facts, not Claude-Code-format facts, so
they are a spike rather than a `docs/facts/` record:

- `tmux attach-session` emits `ESC [ ? 1049 h`, so the browser terminal is always on the
  alternate buffer and xterm-side scrollback is unreachable for either surface.
- xterm.js falls back to emitting cursor keys on the wheel whenever `!buffer.hasScrollback`;
  with `scrollback: 0` that is always, which is the direct cause of #45.
- xterm.js emits `ESC [ 1 ; 3 D` for Option+Left and consults `macOptionIsMeta` only for
  printable keys, so both zsh and bash print a literal `3D`; `ESC b` / `ESC f` are correct in
  both. Cmd+Arrow emits nothing at all today (`if (e.metaKey) break`).
- With tmux `mouse off`, injected SGR mouse sequences are swallowed — no copy-mode, no garbage
  in the pane.
- `copy-mode -e` auto-exits when the pane is scrolled back to the bottom; `send-keys -X -N n`
  takes a repeat count; scrolling past the top clamps.
- `#{pane_current_command}` reports the shell's own name when idle and when a job is
  backgrounded, and the foreground command otherwise; `#{alternate_on}` is 1 for vim and less
  and 0 for streaming work.
- tmux 3.7b consumes OSC `133;A` and `133;C` only to power copy-mode's
  `next-prompt`/`previous-prompt`; it exposes no format for them and ignores `133;D`, so a
  shell's command-finished status and exit code are not obtainable from tmux.
- The pane tty's `ICANON` flag (via a `TIOCGETA` ioctl) separates work from waiting: canonical
  for `sleep`, a streaming loop and bare `cat`; raw for an idle zsh prompt, an idle `python3`
  REPL, `vim` and a pager. Reading it does not disturb the running shell.
- `#{window_activity}` advances only while the pane produces output, and a foreground-process
  CPU-time delta is non-zero only while it computes. Both were measured and rejected as busy
  gates: each correctly excludes an idle REPL but each wrongly excludes silent, zero-CPU work
  (`sleep 9` showed no output and a 0.00 s CPU delta). Recorded so neither is re-proposed.

### Gotchas

- `internal/tmux` is the only package that may know tmux's command surface; the poller and the
  WS handler call through it, never `exec` tmux themselves.
- Everything Claude-Code-format-specific stays in `internal/claudecode/` — nothing in this plan
  belongs there, and a fix that wants to reach into it is a sign the boundary is being violated.
- The `scroll` frame must not be sent from a `docs` surface: there is no `TerminalSurface` at
  all for `docs` (`plan markdown-viewing` INV-1).
- Do not reintroduce `resize-pane` anywhere near the copy-mode work; sizing stays
  `pty.Setsize` + `resize-window` (kb:lesson/resize-pane-silent-noop).
- The poller must not run a `tmux` invocation when no shell exists — a `list-panes -a` on an
  empty socket is wasted work every second for the common case.
- A spinner animated in CSS keyframes costs nothing when hidden, but must not run in the 1 s
  render tick; it is a class toggle, not a re-render.
