# Measurements taken 2026-09-12 during planning

Taken by the planning session on the real machine, to re-verify S6 before it motivated a
rewrite. **Read S6's own version-drift warning too** — these supersede S6 only where they
overlap.

## Conditions

- tmux **3.7b** (`/usr/local/bin/tmux`), macOS 26.6.1, Go 1.26.6.
- A **dedicated scratch socket** per run, killed afterwards. Never the user's default server.
- **Muster's exact 11 server options** applied (the `serverOptions` list in
  `internal/tmux/tmux.go`), including `status off` and `terminal-features ,xterm-256color:RGB`.
  This is the gap S6 §3 flagged in its own condition B, which set only 7 of them.
- Geometry 120×40 for the bandwidth runs, 80×24 for the protocol probe.
- **The application under test was a silent stub, not Claude Code**: a shell that enters the
  alternate screen, prints two lines, and then blocks on `cat` forever. It emits **zero** bytes
  after startup. Every byte counted below is therefore tmux's own, not the application's.
  This is a deliberate choice — it isolates tmux's overhead — but see Limitations.

## 1. Bytes on the wire (silent application, so all of it is tmux overhead)

| | plain `tmux attach` (today) | `tmux -CC` |
|---|---|---|
| attach handshake (first 500 ms) | **12,941 B** | **78 B** |
| idle, 5 s | **6,407 B** | **0 B** |

Per-second buckets over 11 s on the plain-attach path, silent application:

```
  t= 0s:  12941 B      t= 4s:      0 B      t= 8s:      0 B
  t= 1s:      0 B      t= 5s:   6407 B      t= 9s:      0 B
  t= 2s:      0 B      t= 6s:      0 B      t=10s:      0 B
  t= 3s:      0 B      t= 7s:      0 B
```

**This corrects TODO.md and S6 §3 on the shape of the idle cost.** It is not a steady
1,759 B/s drip. It is a **full-screen repaint of ~6.4 KB fired sporadically** — once in this
11 s window — with true silence in between. The averaged figure is in the same ballpark; the
mechanism is different, and a reader who expects a steady drip will look for the wrong thing.
It is **not** the status bar: `status off` was set. What triggers tmux's periodic client
redraw was not identified, and the cadence was not characterised beyond this one window.

Under `-CC` the idle figure is exactly zero, not approximately zero.

S6 §3's per-keystroke numbers (5 keystrokes: 295 B direct / 5,736 B attach / 618 B control
mode) were **not** re-measured here.

## 2. Control-mode protocol probe

A throwaway `creack/pty` program spawned `tmux -CC attach-session -t probe` against a pane
already displaying `HELLO-EXISTING-SCREEN` / `LINE-TWO`, then wrote commands to its stdin.
Raw capture:

```
[  11ms  82B] "\x1bP1000p%begin 1789250048 292 0\r\n%end 1789250048 292 0\r\n%session-changed $0 probe\r\n"
--- writing: refresh-client -C 100x30
[1201ms 103B] "%begin ... 297 1\r\n%end ... 297 1\r\n%layout-change @0 b25d,80x24,0,0,0 b25d,80x24,0,0,0 *\r\n"
--- writing: send-keys -t probe -H 68 69 0d
[1701ms  48B] "%begin ... 300 1\r\n%end ... 300 1\r\n"
[1701ms  19B] "%output %0 hi\\015\r\n"
[1701ms  27B] "%output %0 \\012hi\\015\\012\r\n"
--- killing the session externally
[2512ms  19B] "%sessions-changed\r\n"
[2512ms   9B] "%exit\r\n\x1b\\"
READ END: EOF
```

Four findings, each load-bearing for Option A:

1. **Control mode does NOT replay the screen on attach.** The pane was displaying
   `HELLO-EXISTING-SCREEN` / `LINE-TWO`; the attach emitted `%begin`, `%end`,
   `%session-changed` and nothing else. The content was never sent. Plain `tmux attach` sends
   the whole screen (that is most of the 12,941 B above). **Option A must reconstruct the
   opening frame itself.**
2. **Input works over the control client's stdin.** `send-keys -H <hex>` written to the
   already-running process reached the pane. No subprocess fork per keystroke.
3. **`refresh-client -C 100x30` is accepted but does not resize the window.**
   `%layout-change` still reported `80x24`, because `window-size manual` is set
   (`internal/tmux/tmux.go` `serverOptions`). **`resize-window` is still required** — resize
   becomes two commands, not a replacement for one.
4. **Session death is clean**: `%exit`, then process exit, then PTY EOF. The existing
   `Bridge.Read` EIO→EOF mapping and the `4001 pane_ended` + liveness-nudge path in
   `internal/server/terminal.go` are untouched.

Framing details observed: the stream is wrapped in DCS (`ESC P 1000 p` … `ESC \`);
`%output` payloads are octal-escaped (`\015`, `\012`); notification lines end `\r\n` under a
PTY.

## 3. Terminal modes are recoverable from tmux format variables

On a pane that had emitted `ESC[?1049h` (alternate screen) and `ESC[?1000h ESC[?1002h
ESC[?1003h ESC[?1006h` (mouse tracking, SGR encoding) — i.e. exactly Claude Code's
configuration per S6 §1 — `display-message -p` returned:

```
alternate_on=1 any=1 sgr=1 all=1 button=0 std=0 utf8=0
```

So `#{alternate_on}`, `#{mouse_any_flag}`, `#{mouse_sgr_flag}`, `#{mouse_all_flag}`,
`#{mouse_button_flag}`, `#{mouse_standard_flag}` are all populated and can drive a
synthesized mode preamble. `#{pane_bracketed_paste}` returned **empty** on 3.7b — either not
a format variable under that name, or genuinely unset; not run down.

`capture-pane -e -p` returned the alternate-screen content correctly.

## Limitations — read before citing any of this

- **Claude Code was never run.** The application was a silent stub. Numbers in §1 therefore
  measure *tmux's* overhead in isolation and say nothing about the total byte volume of a real
  session, where Claude Code's own output dominates during a turn. A real-session A/B
  comparison is **unmeasured**.
- The idle repaint's **trigger and cadence are unidentified**; §1 observed exactly one such
  repaint in one 11 s window on one machine.
- **The reconstruction in §2 finding 1 was not built or tested.** That `capture-pane -e -p`
  plus a synthesized mode preamble plus a cursor position *would* faithfully restore a live
  Claude Code TUI is an **inference from §3, not a measurement**. Nobody has yet attached a
  real Claude Code pane over control mode and looked at the result.
- CPU, latency and battery were **not measured** on either path. S4 §6 measured
  keystroke→frame at p50 5.0 ms / p95 12.2 ms through the current path; there is no
  control-mode counterpart.
- Everything here is one machine, one tmux build, one run per condition. No repeats, no
  variance.
