# S6 — Terminal scroll: why it is slow, and what actually fixes it

**Date:** 2026-09-03 · **Verdict:** issue [#13](https://github.com/Zalaras/muster/issues/13) is
two separate problems with different answers. The "no scrollback affordance" half is **not
fixable** in Muster as currently configured — and not caused by tmux. The "scrolling is slow"
half is real, quantified below, and has a **one-env-var fix** that changes no architecture.

Investigated because the reported cause ("`scrollback: 0` / tmux owns scrollback") turned out
to be wrong. It is not tmux that takes scrollback away — it is Claude Code.

## Versions

| Component | Version |
|---|---|
| tmux | 3.7b (`/usr/local/bin/tmux`) |
| Claude Code | **2.1.259** (`~/.local/bin/claude`), model `claude-haiku-4-5-20251001` |
| Go | go1.26.6 darwin/amd64 |
| macOS | 26.6.1 |

> **Version drift — read before citing these numbers.** `docs/claude-code-pin.md` pins
> **2.1.246**; the installed binary had auto-updated to **2.1.259**. Every measurement here is
> against 2.1.259 and must be re-confirmed against the pinned build before being treated as
> binding. This is the designed, accepted drift described in `canary-fields.md`.

**Method.** A throwaway Go probe (`creack/pty`) spawns a command under a PTY at a fixed
80×24-style geometry, dumps every byte it emits to a file with per-read millisecond
timestamps, and kills it. tmux always on a dedicated socket. The scratch repo lives in `/tmp`,
**outside `~/Documents`**, so no ancestor `CLAUDE.md` leaks into the probe session (the
`test/rig/newprobe.sh` warning). `CLAUDE_*` env vars are stripped from the probe's environment
so it is not treated as a child session. `capture-pane` is the screen oracle throughout.

---

## 1. Claude Code owns the alternate screen — tmux does not

On a **bare PTY with no tmux anywhere**, Claude Code's TUI emits:

```
ESC[?1049h ESC[2J ESC[H ESC[?1000h ESC[?1002h ESC[?1003h ESC[?1006h
```

Enter alt screen, clear, home, then mouse tracking (1000/1002/1003) with SGR encoding (1006).

The trust prompt that precedes the TUI renders in the **normal** buffer; the switch happens
when the real TUI starts.

**Consequence.** `web/src/terminal/pane.ts`'s `scrollback: 0` is *documentation of a fact, not
a cause*. Raising it changes nothing: in the alt screen xterm.js never accumulates lines.
Removing tmux changes nothing either. This corrects the framing in `S4-findings.md` §5, which
attributed the alt screen to tmux ("tmux drives the outer terminal into the alternate
screen") — true of what xterm.js *sees*, but the application does it independently.

## 2. There is no scrollback anywhere in the stack

With Claude Code running under tmux, `capture-pane -p -S -2000` returns **exactly the visible
screen** — not one line more. Controlled A/B, identical prompt ("list the numbers 1 to 60"),
identical 100×30 geometry:

| condition | visible lines | history (`-S -2000`) |
|---|---|---|
| alt screen **on** (today's config) | 30 | **30** — nothing retained |
| alt screen **off** (§5) | 30 | **76** — 46 lines retained |

So today tmux holds **zero** history. **tmux copy-mode would open onto an empty buffer.**

> `TODO.md`'s #13 entry prescribes "a design pass on surfacing copy-mode from the browser".
> That work would ship nothing. The entry also states that a wheel gesture "reaches tmux
> copy-mode instead" — it does not; with `mouse off` the wheel goes to Claude Code (§5).

## 3. tmux's redraw costs 19.4× the bytes

Same five keystrokes, same 120×40 geometry, idle-subtracted:

| condition | idle bytes | keystroke bytes | vs direct |
|---|---|---|---|
| A — direct PTY, no tmux | 0 | 295 | 1.0× |
| B — `tmux attach` (**today's path**) | 1,759 | 5,736 | **19.4×** |
| C — `tmux -CC` control mode | 0 | 618 | **2.1×** |

Two things worth noting beyond the ratio. tmux emits **1,759 bytes while completely idle**,
against direct's zero — a constant background repaint that crosses the WebSocket for nothing.
And condition B set only 7 of Muster's 9 server options, **omitting
`terminal-features ,xterm-256color:RGB`**, so this tmux emitted short 256-colour sequences
where Muster's emits long truecolor ones. **19.4× is therefore an under-estimate of the
production path.**

## 4. Control mode carries raw application bytes

The tmux wiki states `%output` is "exactly what the application running in the pane sent to
tmux". Verified: decoding the captured `%output` payloads back through their octal escapes
yields **742 application bytes from 1,033 wire bytes**.

The residual 2.1× in §3 is therefore entirely protocol overhead, and is irreducible:

- **1.39×** octal escaping — every `ESC` becomes the four characters `\033`; all bytes < 32
  and `\` are escaped.
- **13 bytes per line** of `%output %0 …CRLF` framing.

`-CC` closes **94%** of the gap between today's path and no-tmux-at-all, while leaving session
identity, reconcile, liveness and the test suite untouched.

## 5. The wheel moves ~1 line per notch — this is the actual complaint

Claude Code owns the wheel (it requests mouse tracking, §1), so scroll distance per gesture is
Claude Code's decision, not tmux's and not xterm's. Measured over 10 wheel notches, 100×30,
identical 120-line transcript:

| setting | top line moved | lines per notch |
|---|---|---|
| **default** | 98 → 89 | **0.9** |
| `CLAUDE_CODE_SCROLL_SPEED=5` | 98 → 49 | **4.9** |
| `CLAUDE_CODE_SCROLL_SPEED=15` | 98 → 2 | ≥9.6 — **floor-limited** (hit the top of the transcript); linearity above ~10 unconfirmed |

For reference, **one PageUp moves 17 lines** on the same screen. The wheel is ~17× worse than
the key Claude Code's own tmux banner recommends. Crossing a 500-line transcript costs ~550
notches, each paying a full §3 repaint.

`CLAUDE_CODE_SCROLL_SPEED` is linear and sets lines-per-notch directly; default is 1.

## 6. Undocumented Claude Code env vars

Not in `--help`, not in public docs — found by reading strings out of the binary. Adjacent
strings (`lastWheelTime`, `lastWheelDownTime`, `pendingArrowBoost`, `should be an integer,
got `) indicate wheel events are translated to arrow keys with an integer multiplier.

| variable | status |
|---|---|
| `CLAUDE_CODE_SCROLL_SPEED` | **measured** — integer, linear, lines per wheel notch (§5) |
| `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` | **measured** — suppresses `1049h` *and* mouse tracking; real scrollback then accumulates (§2) |
| `CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL` | untested |
| `CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT` | untested |
| `CLAUDE_CODE_FORCE_SYNC_OUTPUT` | untested |

**These are internal and unsupported.** They may change semantics or vanish on any upgrade.
Anything Muster depends on must be asserted by `make canary` alongside the pin, and the
variable *names* must live in `internal/claudecode/` (hard rule: no Claude-Code-format
knowledge outside that package).

## 7. Options, ranked by benefit-per-unit-of-work

| fix | effect | cost |
|---|---|---|
| **`SCROLL_SPEED=5`** | **5× fewer round trips** for the same travel | one env var at launch; `internal/tmux/tmux.go:109` already takes an `env` map |
| `-CC` control mode | 9.3× fewer bytes per trip | `termbridge` becomes a control-mode parser; input moves to `send-keys`; resize to `refresh-client -C` |
| drop tmux | 19.4× fewer bytes per trip | identity (`tmux_target`), reconcile, liveness and dead-session snapshot all rewritten |
| `DISABLE_ALTERNATE_SCREEN` + drop tmux + `scrollback > 0` | native local scrolling, zero round trips, scrollbar returns | all of the above, plus unknown TUI cost |

They **compose** — `SCROLL_SPEED` reduces the number of repaints; `-CC` reduces the cost of
each one. The first is nearly free and attacks the felt problem directly.

**Not the bottleneck:** Muster loads only `FitAddon` (no `@xterm/addon-webgl`), but
`S4-findings.md` §6 already measured keystroke→frame at p50 **5.0 ms** / p95 **12.2 ms** *with
tmux in the loop*, and WebGL's headline advantage is large scrollback — of which there is
none. Worth trying, ranked last, **unmeasured here**.

## 8. Follow-ups

- `TODO.md` #13 — split it. "No scrollback affordance" → won't fix, with §1/§2 as the reason;
  the copy-mode prescription and the "wheel reaches copy-mode" claim are both wrong.
- `canary-fields.md` — add a `SCROLL_SPEED` assertion **if** it is adopted.
- Re-confirm every number against pinned **2.1.246** before treating it as binding.
- `SPEC.md` §5's `-CC` row records the option as skipped on a polling-latency premise; §3/§4
  give it a bandwidth rationale that premise never considered.
