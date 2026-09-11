# S4 — Terminal Bridge PoC: findings

**Date:** 2026-08-16 · **Verdict: GO** on SPEC §2.4's architecture (tmux → PTY → WebSocket → xterm.js),
with four corrections to the spec (§7 below).

## Versions

| Component | Version |
|---|---|
| tmux | 3.7b (`/usr/local/bin/tmux`) |
| Claude Code | 2.1.233 (`~/.local/bin/claude`), model `claude-haiku-4-5-20251001` |
| Go | go1.26.1 darwin/amd64 (likely Rosetta — perf numbers indicative) |
| Node / npm | v22.22.2 |
| `@xterm/xterm` | 6.0.0 |
| `@xterm/addon-fit` | 0.11.0 |
| `github.com/coder/websocket` | v1.8.15 |
| `github.com/creack/pty` | v1.1.24 |
| Chrome | 151.0.7922.138 (headless-ish, chrome-devtools-mcp profile) |
| macOS | 26.6.1 |

Spike code: `ccc-spike/termbridge/` (throwaway). Screenshots: `ccc-spike/screenshots/`.

**Render oracle.** Every "match" below means `window.__dumpBuffer()` (xterm.js visible buffer)
was compared line-for-line against `tmux -L ccc-term capture-pane -p -t <session>`, normalised
only for trailing whitespace. This is an objective diff, not an eyeball of a screenshot.
Screenshots are a secondary human record, produced by the page rasterising its own DOM through
an SVG `foreignObject` (the browser MCP could only write into the real repo, which was off-limits).
Note the rasteriser substitutes a few exotic glyphs (`❯` renders as `>`); the buffer dump is
authoritative, and it always had the correct codepoint.

---

## 1. Verdict table

| # | Question | Result | Evidence | Screenshot |
|---|---|---|---|---|
| E0 | Does the plumbing work at all against `bash`? | **PASS** | Colorised `ls -laG` and `less /etc/services` (alt-screen enter, page, exit) all diffed identical to `capture-pane`; no residue after quitting `less` | `e00-plumbing-ls-color.png`, `e00-plumbing-less-altscreen.png` |
| E1 | Does xterm.js render Claude's TUI exactly as tmux sees it? | **PASS** | Every single diff taken across E1–E12 at correct geometry returned `nDiff: 0` — welcome box, Unicode borders, `👋` emoji, `╌` diff rules, spinner rows | all |
| E2 | Do modal / alt-screen surfaces render and dismiss cleanly? | **PASS** | Trust prompt, `/help`-style slash menu (21 lines), plan mode, and a Write permission prompt each matched exactly; after Escape the line count returned to baseline with **zero** residue rows | `e02-trust-prompt.png`, `e02-slash-menu.png`, `e02-plan-mode.png`, `e02-permission-prompt.png`, `e02-after-permission-dismiss.png` |
| E3 | Does the thinking spinner animate in place? | **PASS** | Glyph changed `✻`→`✶` on the same row across 120ms samples; cursor pinned at (2,42) for 16 consecutive samples; non-empty line count constant; captured live text `✶ Nucleating… (1s · ↓ 25 tokens)` | `e03-spinner-live.png` |
| E4 | Does the full input matrix survive the bridge? | **PASS** | All 12 inputs verified by inspecting `term.onData` bytes, not by trusting the keypress — table in §3 | `e04-bracketed-paste.png`, `e04-escape-interrupt.png` |
| E5 | Single-client resize across 60/80/120/200 cols | **PASS** | With `pty.Setsize` + `resize-window`, all five widths gave `nDiff: 0`, Claude's separator spanned exactly the new width, zero orphaned wrapped lines | `e05-resize-pty-only-manual.png` (the *failure* mode, for contrast) |
| E6 | Two clients, same size, shared mode | **PASS** | Both browser buffers byte-identical to each other and to `capture-pane`; typing in either appeared in both; tmux saw exactly **one** client | `e06-fanout-tabA.png`, `e06-fanout-tabB.png` |
| E7 | **Two clients, different sizes** (decisive) | **PASS** | At least one cell is stable for both clients simultaneously — matrix in §2 | `e07-*.png` (6 files) |
| E8 | External Terminal attach | **PASS** | With per-window `window-size manual` the browser pane was completely unaffected by an external 80×24 attach (`nDiff: 0`, still interactive). Both `attach -r` and `attach -f ignore-size` also exclude the external client from sizing even under `smallest` | `e08-external-attach-smallest.png` (the unmitigated failure) |
| E9 | Keystroke→render latency, idle | **PASS** | n=100: **p50 5.0ms, p95 12.2ms, max 39.4ms** (bar was p95 < 50ms) | — |
| E10 | Throughput / does it stay interactive | **PASS** | 1.06 MB/s sustained, 2.71 MB/s peak; catch-up lag **51ms** after a 50MB burst; latency *under* load p95 **9.8ms**; heap flat | — |
| E11 | Late joiner | **PASS** | Correct full screen **31ms after WS open** (149ms from iframe creation) for **3,350 bytes**, via `tmux refresh-client`. No `capture-pane` seeding needed | `e11-late-joiner.png` |
| E12 | Resilience (reload / bridge restart / detach-all) | **PASS** | All three: `claude` still running, conversation (`2 + 2 = 4`) intact, `nDiff: 0`, still interactive afterwards | `e12-after-bridge-restart.png` |
| E13 | Scrollback & mouse (scouting) | **n/a** | tmux owns scrollback outright; Claude Code requests mouse mode `any` — details in §5 | — |

---

## 2. E7 — the decisive matrix

Tab A = 200×30, Tab B = 80×30, both live on the same Claude session. Verdicts:
**stable** = mis-sized but coherent and fully readable · **degraded** = readable with artifacts or lost content · **broken** = unusable.

| mode | `window-size` | tmux clients | A (200 cols) | B (80 cols) | Verdict |
|---|---|---|---|---|---|
| **shared** | manual | **1** (80×30) | 80-col content in a 200-col grid; `nDiff: 0`; empty right margin | perfect, `nDiff: 0` | **stable** for both |
| **shared** | smallest / largest / latest | **1** | identical to above — the option is **inert**, tmux never has a second client to negotiate with | — | **stable** for both |
| shared | manual, *narrow client loses* | 1 (200×30) | perfect | **content past col 80 silently lost**; welcome box clipped mid-word, input box dislocated | **degraded** |
| perclient | manual (window 120×30) | 2 | full content + `│` + 80 cols of `·` padding | clipped at col 80, `nDiff: 13` | degraded |
| **perclient** | **smallest** (window 80×30) | 2 | full 80-col content + `│` + 120 cols of `·` padding — coherent | **perfect, `nDiff: 0`** | **stable** for both |
| perclient | largest (window 200×30) | 2 | perfect, `nDiff: 0` | clipped, `nDiff: 13` | degraded |
| perclient | latest | 2 | **thrashes** — typing in A resized the window to 200×30 (A perfect, B broken); typing in B resized back to 80×30 (B perfect, A padded) | " | **broken** |

**The asymmetry that drives every decision:** a client whose grid is **wider** than the byte
stream degrades gracefully (content is simply left-aligned with dead space to the right, and it
still diffs clean against `capture-pane`). A client whose grid is **narrower** than the stream
**silently loses every column past its width** — xterm clips rather than wraps, because tmux
emits absolute cursor positioning per row. There is no visual cue that content is missing.

---

## 3. E4 input matrix (bytes verified at `term.onData`)

| Input | Bytes emitted | Effect in Claude Code | Result |
|---|---|---|---|
| Enter | `0d` | submitted / confirmed trust prompt | PASS |
| **Escape** (idle) | `1b` | no-op at an idle prompt (Claude's own behaviour) | PASS |
| **Escape** (menu open) | `1b` | dismissed slash menu, zero residue rows | PASS |
| **Escape** (turn running) | `1b` | **interrupted in 102ms** → `⎿ Interrupted · What should Claude do instead?` | PASS |
| Ctrl-C | `03` | cleared the input box; session survived | PASS |
| Ctrl-D | — | not exercised (would exit the session; byte path already proven by Ctrl-C) | not tested |
| Up / Down | `1b 4f 41` / `1b 4f 42` | recalled and cleared prompt history | PASS |
| Left / Right | `1b 4f 44` / `1b 4f 43` | cursor moved within the input | PASS |
| Backspace | `7f` | deleted one char | PASS |
| Tab | `09` | completed `@REA` → `@README.md`; **Chrome did not steal focus** | PASS |
| **Shift+Tab** | `1b 5b 5a` | cycled manual → accept-edits → plan mode | PASS |
| `/` | `2f` | opened the slash menu (21 lines, exact match) | PASS |
| **Multi-line paste** | `1b 5b 32 30 30 7e … 1b 5b 32 30 31 7e` | arrived as **ONE** chunk wrapped in `\e[200~`/`\e[201~`; landed as a 3-line paste, **not 3 Enters** | PASS |

Arrow keys use **SS3** (`ESC O x`), not CSI — Claude Code enables DECCKM (application cursor
keys). Anything that synthesises arrow keys server-side must emit SS3, not `ESC [ A`.

---

## 4. The four decisions

### (a) Shared PTY vs per-client attach → **SHARED PTY**

One `tmux attach-session` per session, under one bridge-owned PTY, with all WebSocket clients
fanning out from that single byte stream.

Evidence: in every shared-mode cell `tmux list-clients` returned exactly **one** row, so tmux's
size-negotiation rules never fire at all — `window-size` becomes inert (E7 row 2). All browser
buffers were byte-identical to each other and to `capture-pane` (E6, `identical: true`). A late
joiner is fully repainted for 3,350 bytes via `refresh-client` (E11). Per-client attach costs a
tmux client process per viewer, and its best cell (`perclient` + `smallest`) is strictly worse
than shared: it forces a dotted dead zone into the wide client permanently, and it hands an
external Terminal attach the power to resize the session.

The one thing shared mode gives up: **all viewers share one geometry**. That is the cost that
answers (c).

### (b) Which tmux `window-size` the real build should use → **`manual`**

Under the shared-PTY design the option is inert for the browser (only one client exists), so it
is chosen entirely for its effect on *external* clients. With per-window `window-size manual`,
an external Terminal attaching at 80×24 left the browser pane untouched (E8, `nDiff: 0`). With
`smallest`, the same attach shrank the window and gave the browser 32 rows of `·` padding.

This is also self-enforcing: `resize-window -x/-y` **sets the per-window `window-size` option to
`manual`** as a side effect, so simply driving resizes puts the window in the right mode. Note
the corollary — once latched, the global option cannot release it; only
`setw -t <window> window-size <mode>` (or `resize-window -A`) clears it.

Defence in depth for E8: attach external viewers with `-r` (read-only) or `-f ignore-size`.
Both were verified to exclude the client from size negotiation even under `smallest`, while a
plain attach dropped the window to 80×24 immediately.

### (c) SPEC open question #5: one renderer size per session vs resize-on-focus → **ONE SIZE PER SESSION**

The shared PTY makes this structural rather than a preference: there is exactly one byte stream
at exactly one geometry, so a second live view at a different size is not a rendering choice, it
is a second, mis-sized copy.

The asymmetry in §2 decides how to pick that size. Since a **wider** grid degrades gracefully but
a **narrower** grid silently loses content, the rule is:

> **The session's geometry must be ≤ the smallest grid that is currently rendering it live.**

Concretely, for Muster:
- The session's size is set by the **dashboard's terminal pane** — the one place the session is
  actually read — applied when the pane opens and on viewport resize (debounced 100ms).
- The **session list must not open a second live client at a different size.** Show a static
  last-known snapshot, or render the same stream into a grid at least as large and scale it
  visually. A live 40-col thumbnail next to a live 200-col pane is the one configuration that
  is guaranteed to lose content.
- Resize-on-focus is *mechanically* fine — all five widths in E5 landed with `nDiff: 0`, correct
  separator width and no orphaned wrapping — but each change costs a full Claude TUI repaint, and
  it breaks any other view open at the time. Prefer one stable size; only resize when the pane's
  own viewport changes.

### (d) `resize-window` vs `pty.Setsize` vs both → **BOTH**, and SPEC's `resize-pane` is wrong

Three separate experiments, three separate failures:

| Approach | Result |
|---|---|
| `tmux resize-pane -x -y` (what SPEC §2.4 says) | **Exits 0 and silently does nothing.** Window stayed 90×28. It is not the primitive for a single-pane window. |
| `pty.Setsize` alone, `window-size manual` | tmux client resized, **window did not**. At 60 cols the browser clipped 100-col content; at 140 cols it got 30 rows of `·` padding. |
| `pty.Setsize` alone, `window-size latest`, fresh window | Works — window followed (60×20, 150×40, 100×30 all `nDiff: 0`). But `latest` is exactly the mode E7 showed thrashing with two clients, so this is not a usable configuration. |
| `resize-window` alone (PTY left at old size) | **Truncates.** Window 130×35 painted into a 100-col PTY → the browser lost 24 columns (`tmuxMaxLineLen: 124` vs `xtermMaxLineLen: 100`). |
| **`pty.Setsize` then `resize-window`** | **Correct at 60/80/100/120/200 cols, `nDiff: 0` every time.** |

Both are required and they do different jobs: `pty.Setsize` sizes the region the tmux *client*
paints into; `resize-window` sizes the *window* the application lays out against.

---

## 5. E13 — scrollback & mouse (scouting, non-gating)

- **tmux owns scrollback outright.** In steady state xterm reports
  `buffer.type: "alternate"`, `baseY: 0`, `length === rows` — xterm.js accumulates **zero**
  scrollback, because tmux drives the outer terminal into the alternate screen and repaints
  whole screens. xterm's own scrollbar and wheel-scroll therefore have nothing to scroll.
  Set `scrollback: 0` in the real build to make that explicit rather than accidental.
- **Claude Code wants mouse reporting**: `mouseTrackingMode: "any"` (DECSET 1003) plus SGR
  encoding (1006). It also enables `applicationCursorKeysMode`, `applicationKeypadMode`, and
  `bracketedPasteMode`.
- **Wheel already works end-to-end**: a wheel event produced `ESC[<64;1;1M` / `ESC[<65;1;1M` and
  went upstream to Claude Code. With `set -g mouse off` this is the right behaviour — the wheel
  belongs to the application. Turning tmux's `mouse on` (which Claude Code's own startup banner
  suggests: *"tmux detected · scroll with PgUp/PgDn · or add 'set -g mouse on' … for wheel
  scroll"*) would **take the wheel away from Claude Code** and give it to tmux copy-mode.
  Recommendation: leave `mouse off`; revisit only if users want tmux-level history scrollback in
  the browser, which would need an explicit copy-mode UI.

---

## 6. Numbers

**Latency (keystroke → rendered frame, measured in-page around `term.write`'s callback)**

| Condition | n | p50 | p95 | max |
|---|---|---|---|---|
| Idle | 100 | **5.0 ms** | **12.2 ms** | 39.4 ms |
| Under load (neighbouring pane flooding) | 60 | **5.1 ms** | **9.8 ms** | 16.0 ms |

**Throughput**

| Metric | Value |
|---|---|
| `find / -xdev` sustained (browser-side bytes) | **1.06 MB/s** average over 8.0s (8.52 MB) |
| Peak 250ms window | **2.71 MB/s** |
| 50 MB burst (`yes … \| head -c 50000000`) | producer emitted 50 MB; **browser received 21 MB** — tmux coalesces screen updates rather than forwarding the raw stream |
| **Catch-up lag** | **51 ms** — browser saw the completion marker 51ms after `capture-pane` did |
| Chrome renderer CPU | ~0% idle; **120–136%** of one core during a 200 MB firehose |
| `termbridge` CPU / RSS | 59% / **16 MB** during the same firehose |
| Browser JS heap | 34–37 MB used, flat — no unbounded growth |

The 200 MB firehose is a deliberately absurd load; a real Claude Code session never approaches
it. The meaningful result is that interactivity and catch-up held throughout.

---

## 7. Corrections to SPEC.md

1. **§2.4, line "`tmux resize-pane` must be driven to match the rendered size to avoid wrap
   artifacts" — FALSIFIED.** `resize-pane` exits 0 and silently no-ops on a single-pane window.
   Replace with: *"the daemon must call `pty.Setsize` on the attach PTY **and**
   `tmux resize-window -t <session> -x C -y R`; both are required."*
2. **`docs/research/claude-session-manager-handoff.md` §11, "call `tmux resize-pane -x -y` to match your
   grid" — same falsification, same fix.**
3. **§9 open question 5 — RESOLVED.** One renderer size per session; the size is set by the
   dashboard's terminal pane and must be ≤ the smallest live view. See §4(c). The reason is
   structural (shared PTY = one stream at one geometry), not aesthetic.
4. **§2.4, "sessions run in tmux panes/windows created by the daemon"** — should say **windows**
   (one window per session, one pane per window). Sizing is a window-level operation; the
   pane-level vocabulary is what produced correction 1.
5. **§5, "Skip `-CC` control mode unless polling proves too slow"** — the premise is stale for
   display. The PTY attach is push-based; there is no polling loop to be too slow.
   `capture-pane` remains valuable, but as a **test oracle** (it is what made every PASS in this
   spike objective), not as the display path.
6. **New constraint for §5/§6:** tmux's `window-size` is a **per-window** option, and
   `resize-window -x/-y` latches it to `manual` for that window. A global
   `set -g window-size <x>` will not override a latched window; only
   `setw -t <window> window-size <x>` or `resize-window -A` clears it. Any reconcile logic that
   assumes the global option is in force will be wrong.
7. **Not falsified, but untested here:** §2.6 (token/cookie auth) and §8 security were
   explicitly out of scope for this spike — the bridge ran with `InsecureSkipVerify` and no auth.

---

## 8. Carry-over appendix — the only part that survives into the real build

### 8.1 `tmux.conf` (loaded with `-f`, so the user's own `~/.tmux.conf` is never involved)

```tmux
set -g default-terminal "tmux-256color"      # verified present on this machine; fall back to
                                             # screen-256color if infocmp fails, or tmux dies
                                             # with an obscure error
set -as terminal-features ",xterm-256color:RGB"  # pass 24-bit colour through to xterm.js
set -sg escape-time 0                        # REQUIRED: Escape is Claude's interrupt. Default
                                             # 500ms makes it feel broken. Verified: interrupt
                                             # landed in 102ms.
set -g status off                            # the status bar would eat a row and break the
                                             # 1:1 xterm rows <-> tmux rows mapping
set -g window-size manual                    # external Terminal attaches must not resize the
                                             # session out from under the browser (E8)
set -g history-limit 20000
set -g mouse off                             # leave the wheel to Claude Code (E13)
setw -g aggressive-resize off
set -g destroy-unattached off                # the daemon detaches all the time; sessions must
                                             # survive having zero clients
set -g detach-on-destroy off
set -g exit-empty off                        # see 8.5
```

### 8.2 Exact tmux invocations

```sh
# server + session creation. -x/-y are REQUIRED: a detached new-session is 80x24 regardless.
# -e is REQUIRED: a process spawned by a Go daemon has no LANG (see 8.3).
tmux -L muster -f <conf> new-session -d -s <name> -x <C> -y <R> -c <cwd> \
     -e LANG=en_US.UTF-8 -e LC_ALL=en_US.UTF-8 '<claude command>'

# the one attach, under the bridge's PTY
tmux -L muster attach-session -t <name>

# resize: BOTH of these, in this order
#   1. pty.Setsize(ptmx, &pty.Winsize{Cols: C, Rows: R})
#   2. tmux -L muster resize-window -t <name> -x C -y R

# late joiner: full repaint for ~3.3KB, no capture-pane seeding needed
tmux -L muster refresh-client -t <client-tty>

# test oracle only, never the display path
tmux -L muster capture-pane -p -t <name>

# external human viewer, sizing-safe
tmux -L muster attach -r -t <name>            # or: attach -f ignore-size -t <name>
```

Use a **dedicated socket** (`-L muster`) so Muster never touches the user's default tmux server.

### 8.3 The LANG trap (this one makes a working bridge look totally broken)

A process spawned by a Go daemon inherits no `LANG`/`LC_ALL`/`LC_CTYPE`. Without them tmux
decides the terminal is not UTF-8 capable and falls back to the ACS alternate character set.
**Measured directly** by attaching the same live session twice and diffing the raw byte streams:

| Attach env | UTF-8 box chars | `ESC(0` (ACS shift-in) |
|---|---|---|
| `LANG` unset | 0 | present — borders emitted as `qqqqqqqq…` and `x` |
| `LANG=en_US.UTF-8` | **561** | **0** |

Set `TERM=xterm-256color`, `LANG=en_US.UTF-8`, `LC_ALL=en_US.UTF-8` explicitly in **both** the
attach process env *and* the `new-session -e` env.

### 8.4 EIO handling (macOS)

The PTY master read returns `EIO` as a `*os.PathError` wrapping `syscall.EIO` — **not**
`io.EOF` — when the child exits. Treat it as a clean EOF or you log spurious errors and risk
spinning:

```go
n, err := ptmx.Read(buf)
if err != nil {
    var pe *os.PathError
    if errors.As(err, &pe) && errors.Is(pe.Err, syscall.EIO) {
        // clean EOF: the tmux client exited
    }
    // ... tear down, mark attach dead, cmd.Wait()
}
```

Open the PTY explicitly (`pty.Open()`, wire `tty` to all three stdio, `SysProcAttr{Setsid: true,
Setctty: true}`, then **close `tty` in the parent**) — if the parent keeps the slave open, the
read never sees EIO at all.

### 8.5 Other things that cost time here

- **Binary WebSocket frames in both directions**, non-negotiable. Text frames would split UTF-8
  sequences across PTY read boundaries and produce mojibake indistinguishable from a rendering
  bug. Control messages are the only text frames: `{"type":"resize","cols":C,"rows":R}`.
  On the browser side, `ws.binaryType = 'arraybuffer'` and `term.write(new Uint8Array(data))`.
- **Serialise WebSocket writes** — one writer goroutine per connection fed by a buffered
  channel. Concurrent writes from the PTY pump and any control path will panic `coder/websocket`.
  Drop slow clients rather than stalling the PTY pump (a blocked client must never back-pressure
  the terminal).
- **Debounce resize ~100ms.** Every pixel of a viewport drag otherwise fires fit → `resize-window`
  → full Claude repaint.
- **Send an initial resize on WebSocket open.** Passing cols/rows in the connect URL sizes the
  PTY but not the tmux window; without an explicit resize the first frame arrives with the
  window at its old geometry (this produced a screen full of `·` padding on the very first run).
- **Gate `FitAddon.fit()` on `document.fonts.ready`** and a non-zero container, or it computes
  the wrong cols/rows.
- **`@xterm/xterm`'s CSS must be loaded** or the terminal is invisible and mis-measured. The UMD
  build puts `Terminal` and `FitAddon` on `globalThis` — no bundler needed.
- **Default DOM renderer was used throughout.** WebGL was not tested and should be treated as
  unknown, not broken.
- **One unexplained event, recorded honestly:** during an early E7 cell the tmux server exited
  entirely (`[server exited]`, all sessions gone, `claude` killed). No crash report was produced,
  so it exited cleanly — i.e. every session's process ended. It did **not** reproduce when the
  exact sequence was re-run. Suspected interaction with orphaned attach clients left by a bridge
  restart. Mitigations now in the config above: `exit-empty off` plus a daemon-owned keepalive
  session, so a transient loss of all sessions cannot take the server (and every other session)
  down with it. Worth watching for during the real build.
- **Client accounting**: the spike's WS client map briefly over-counted during rapid page
  navigations (4 registered for 2 live tabs) before settling. The spike has no reconnect logic;
  the real build needs deliberate reaping on connection close.

---

## 9. What this spike deliberately did not build

No auth/token/origin checks (`InsecureSkipVerify` was on), no session registry, no persistence,
no hook or status-line ingestion, no UI beyond a full-page terminal, no TypeScript/bundler/
framework, no tests, no structured logging, no reconnect logic. None of that is evidence for or
against anything in this document.
