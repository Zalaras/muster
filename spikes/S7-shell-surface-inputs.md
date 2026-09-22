# S7 — The shell surface's three inputs: wheel, Option-Arrow, and "is it busy?"

**Date:** 2026-09-21 · **Verdict:** issues
[#31](https://github.com/Zalaras/muster/issues/31),
[#33](https://github.com/Zalaras/muster/issues/33) and
[#45](https://github.com/Zalaras/muster/issues/45) are all shell-only, all explained, and all
fixable without touching the Claude pane. Two design questions that looked like trade-offs —
"scrolling costs you text selection" and "silent commands can't raise an indicator" — turned
out to have answers; both are recorded below with the measurements that killed the weaker
options.

Feeds `plans/terminal-fixes-cleanup/`.

## Versions

| Component | Version |
|---|---|
| tmux | 3.7b (`/usr/local/bin/tmux`) |
| xterm.js | 6.0.0, addon-fit 0.11.0 (pinned, `web/package.json`) |
| macOS | 26.6.1 (darwin 25.6.0) |
| Shells under test | `/bin/zsh`, `/bin/bash` 3.2 |

Method throughout: a real tmux server on a scratch socket, attached through a `pty.fork()`ed
`tmux attach-session`, driven by writing bytes to the attach PTY. `capture-pane` and
`display-message -p` are the oracles. No Claude Code was launched — every finding here is
about tmux, xterm.js and the shell, and the Claude Code findings this spike leans on were
measured in `S6-scroll-bandwidth.md`.

---

## 1. The browser terminal is always on the alternate screen — because of tmux, this time

`tmux attach-session` emits, before anything else:

```
ESC[?1049h ESC[22;0;0t ESC[?1h ESC= ESC[H ESC[2J …
```

So whichever surface is attached, xterm.js is on the alternate buffer.

**Consequence.** `scrollback: 0` (design-system §7.4) is right, and raising it is inert: the
alternate buffer accumulates no scrollback. Note this does **not** contradict `S6` §1 — there
the point was that *Claude Code* emits `1049h` on a bare PTY with no tmux in the loop. Both are
true, and they stack: for a Claude pane the alternate screen is entered twice over.

## 2. Why the wheel cycled shell history (#45)

xterm.js's wheel handler, `node_modules/@xterm/xterm/lib/xterm.js`:

```js
if (!this.buffer.hasScrollback) {
  if (t.deltaY === 0) return false;
  if (coreMouseService.consumeWheelEvent(t, …) === 0) return this.cancel(t, true);
  const i = ESC + (decPrivateModes.applicationCursorKeys ? "O" : "[") + (t.deltaY < 0 ? "A" : "B");
  return this.coreService.triggerDataEvent(i, true), this.cancel(…)
}
```

The guard is `!hasScrollback`, which `scrollback: 0` makes permanent. So with no application
mouse tracking the wheel becomes cursor-up/down — and zsh cycles history. A Claude pane escapes
this only because Claude Code enables its own mouse tracking (`S6` §1), so
`consumeWheelEvent` claims the event first.

## 3. Scrolling without losing selection

The obvious fix is tmux `mouse on`. It works, and it costs selection.

| option | scrolls? | selection? | evidence |
|---|---|---|---|
| A — tmux `mouse on` on the shell session | **yes** | **no** | per-session `mouse on` overrides global `off`; tmux then requests `?1000h ?1002h ?1006h`, and xterm.js's `shouldForceSelection` gates selection behind `altKey && macOptionClickForcesSelection` on macOS (not shiftKey) |
| B — `mouse off`, inject SGR wheel bytes as PTY input | **no** | yes | tmux swallows them: `pane_in_mode` stayed 0, and no garbage reached the pane |
| C — `mouse off`, daemon drives copy-mode | **yes** | **yes** | below |

Option C, measured:

```
tmux requested mouse tracking?      none — browser selection intact
copy-mode -e                        -> pane_in_mode 1
send-keys -X -N 5  scroll-up        -> scroll_position 5     (-N repeat count works)
send-keys -X -N 20 scroll-up        -> scroll_position 25
send-keys -X -N 9999 scroll-up      -> scroll_position 181 of history 181  (clamps)
3x scroll-down back to the bottom   -> pane_in_mode 0        (the -e flag auto-exits)
bytes streamed to the browser        1697                    (redraw arrives as ordinary PTY output)
```

Two further findings that shape the design:

- A shell's tmux pane holds **real history** (179 lines after a loop), unlike a Claude pane,
  which holds none (`S6` §2). This is why the won't-fix in
  `kb:adr/surfaces-scrollback-affordance-not-built` narrows rather than reverses.
- Typing while scrolled back is consumed as copy-mode motion — typing `echo hello` moved
  `scroll_position` from 25 to 3. `send-keys -X cancel` force-exits, after which typing reaches
  the shell normally. So the daemon should cancel copy-mode before writing input.

tmux's default `WheelUpPane` binding is
`if -F "#{||:#{alternate_on},#{pane_in_mode},#{mouse_any_flag}}" { send -M } { copy-mode -e }`,
which is where the `-e` auto-exit comes from and why a full-screen app inside the shell would
keep the wheel for itself.

## 4. Option-Arrow emits `3D` (#33)

xterm.js, keyCode 37: `o.key = a ? ESC+"[1;"+(a+1)+"D" : …` — Alt contributes 2 to the modifier,
so Option+Left sends `ESC [ 1 ; 3 D`. `macOptionIsMeta` is consulted only for printable keys,
never for arrows. Driven into a real pane:

| sequence | zsh | bash 3.2 |
|---|---|---|
| `ESC [ 1 ; 3 D` (what xterm.js sends) | `…gamma3DX` — literal `3D` | `…gamma3DX` |
| `ESC b` | `…beta Xgamma` — word back | same |
| `ESC f` | word forward | same |
| `ESC DEL` | deletes a word — already correct | same |
| `0x01` | line start | same |

Cmd+Arrow emits **nothing** today: xterm.js breaks out on `if (e.metaKey)`. Claude Code reads
the CSI modifier form natively, which is why only the shell is affected.

## 5. Telling work from waiting (#31's spinner)

A shell has no hooks, so "is it busy?" has to be read from outside the pane. Four candidate
gates, all measured on the same rig:

| case | truth | `pane_current_command` | `alternate_on` | output activity | CPU Δ/1.5 s | tty mode |
|---|---|---|---|---|---|---|
| idle zsh prompt | waiting | `zsh` | 0 | silent | 0.00 s | **raw** |
| `sleep 9` | **work** | `sleep` | 0 | silent | 0.00 s | **canonical** |
| streaming loop | **work** | `sleep` | 0 | moving | — | **canonical** |
| silent CPU-heavy loop | **work** | `Python` | 0 | silent | 1.52 s | **canonical** |
| `python3` REPL, idle | waiting | `Python` | 0 | silent | 0.00 s | **raw** |
| `vim` | waiting | `vim` | **1** | silent | — | **raw** |
| pager | waiting | — | 0 | silent | — | **raw** |
| background job `sleep 30 &` | waiting | `zsh` | 0 | — | — | raw |
| bare `cat` | waiting on stdin | `cat` | 0 | silent | 0.00 s | canonical ← false positive |

**Verdict.** The tty's line discipline is the discriminator: a program waiting for the user
holds the tty in **raw** mode (zsh's zle, readline, any TUI), a batch command leaves it
**canonical**. Read with a `TIOCGETA` ioctl on `#{pane_tty}`, opened
`O_RDONLY|O_NONBLOCK|O_NOCTTY` — measured not to disturb the running shell.

**Output activity (`#{window_activity}`) and CPU delta are both rejected as strictly weaker.**
Each correctly excludes an idle REPL, but each wrongly excludes silent zero-CPU work: `sleep 9`
showed no output *and* a 0.00 s CPU delta, so a quiet `go build` would have raised no indicator.
Recorded here so neither is re-proposed.

`#{window_activity}` is a unix-epoch-seconds stamp advancing only while the pane produces
output; one `list-panes -a -F '…'` invocation reads every shell on the socket regardless of
how many are open.

## 6. OSC 133 is not the escape hatch it looks like

Shell integration (`133;A` prompt start, `133;C` command output start, `133;D;<exit>` finished)
looks like the exact answer. It is not, here:

- It would **not** fix the REPL case. The shell emits `133;C` when `python3` starts and nothing
  until it exits, so a REPL reads as a running command for its whole life — the same false
  positive the tty gate exists to kill.
- **tmux 3.7 parses only `133;A` and `133;C`**, purely to drive copy-mode's
  `next-prompt`/`previous-prompt`. It exposes no format for them and ignores `133;D`, so the
  exit status is not obtainable.
- Reading them would therefore mean sniffing the PTY byte stream, which the daemon holds only
  while the shell surface is mounted — precisely when the indicator does not matter.
- Emitting them at all would mean injecting startup hooks per shell dialect (`ZDOTDIR`,
  `--rcfile`, …) into the user's own `$SHELL -i`.
