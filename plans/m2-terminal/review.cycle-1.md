# Review: M2 — Terminal panes

**Plan**: m2-terminal
**Verdict**: needs-changes

Every automated gate is green (57/57 E2E, 263 web unit, all Go packages, lint 0 issues,
all 8 authored checks). The defects below were found by **driving the app in a browser
against a real daemon with five real tmux sessions** — a configuration no test in the
suite exercises. Four of the five criticals are invisible to the current tests by
construction, which is itself the most important finding: the Tiles view and multi-session
teardown are effectively untested.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 terminal bridge | Yes | Yes (D1/D2, E1/E2) | pass — verified by hand: typed `hello-from-review`, pane echoed `stub-echo:hello-from-review` |
| REQ-2 one-live-client (INV-1) | Partly | Partly | **fail** — Critical 3, Critical 4; ordering deviation (Major 1) |
| REQ-3 resize | Yes | Yes (D4/E4) | pass in Focus; **fail** in Tiles (Critical 1) |
| REQ-4 tmux topology + options | Yes | Yes (D8) | **fail** — `detach-on-destroy off` is actively harmful under decision 1 (Critical 3) |
| REQ-5 socket path | Yes | Yes (D9/D12) | pass |
| REQ-6 PTY env & EOF | Yes | Yes (single-session only) | **fail** for a socket with >1 session (Critical 3) |
| REQ-7 Focus live pane | Yes | Yes | pass — verified by hand incl. rail-card refocus |
| REQ-8 Tiles view | Yes | Membership only | **fail** — a tile cannot be typed into (Critical 2) |
| REQ-9 view switcher | Yes | Yes (E5/E7) | pass |
| REQ-10 prefs | Yes | Yes (E5/E6/D10/D11) | pass — verified `{"view":"tiles","density":"3x2"}` via `/api/state` |
| REQ-11 geometry moves (INV-3) | Partly | Half-asserted | **fail** — geometry never moves into a tile (Critical 1) |
| REQ-12 snapshots never attach (INV-2) | Yes client-side | Browser-side only | **fail** server-side (Critical 4) |
| REQ-13 degraded states | Yes | Yes (E12/E13) | pass in the tested paths; ended-state wrong in Tiles footer (Critical 5) |
| REQ-14 ⟳n compaction | n/a (M1) | Yes (E14) | pass |
| REQ-15 sizenote / tile footers | Yes | Sizenote yes, footer pattern-only | **fail** for tile footers (Critical 1) |
| REQ-16 scrollback | Correctly absent | D5 grep | pass |

## Build & Tests

E2E tests: **pass** (57/57, `make e2e`, full suite — regression sweep clean)
Daemon tests: **pass** (`go test ./... -count=1`, all 7 packages)
Web tests: **pass** (263 tests, 13 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` → 0 issues)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass (0 issues) |
| D4 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (no matches) |
| D5 | `! rg -n "resize-pane" cmd/ internal/ web/src web/e2e` | pass (no matches) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `rg -q "scrollback: 0" web/src` | pass (`web/src/terminal/pane.ts:80`) |
| E1 | `make e2e` | pass (57 passed) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D12 | every `tmux.New` in tests gets a scratch-dir path, no bare `-L` | pass | `internal/tmux/tmux_test.go:29` `newTestSocket`, `internal/server/sessions_test.go:175`, `internal/server/terminal_test.go:45`, `internal/termbridge/termbridge_test.go:33` all build `<scratch>/tmux.sock`. `ls -la /private/tmp/tmux-501/` after a full `go test ./... -count=1` shows no socket newer than 14:23 (pre-fix litter only) — no new shared-dir sockets created |
| D13 | `pty.Setsize` before the tmux window resize; EIO = clean EOF | pass | `internal/termbridge/termbridge.go:78-86` (Setsize then `ResizeWindow`), `:62-68` (`errors.Is(err, syscall.EIO)` → `io.EOF`) |
| D14 | no state derived from PTY/captured bytes | pass | `rg capture-pane` over the code trees: zero hits in `internal/`, `cmd/`, `web/src`; `DisplayVar` is oracle-only and called from tests/helpers only |
| D15 | ingest paths untouched, no payload logging, no adapter leak | pass | `internal/server/ingest.go` unmodified (`git status`); `internal/claudecode/` untouched; D4 grep clean |
| W4 | no `any` in new web code | pass | `rg ':\s*any\b\|as any\b\|<any>' web/src web/e2e` → no matches |
| W5 | nothing inside the terminal container restyled | pass | `rg 'xterm' web/src/style.css` → no matches; only `.terminal-surface`/`.terminal-body`/`.terminal-overlay` (the frame) are styled |
| W6 | switcher/density/tiles/overlays follow design-system tokens | pass with 1 minor | every colour resolves to a `:root` token; `[hidden]` companions present for all 18 toggled elements (audited `.hidden =` sites against `[hidden]` rules 1:1). Minor 5: `pane.ts` duplicates two token hexes as JS fallbacks |
| W7 | `surfaceDiff` is the only thing opening/closing sockets | pass | `new TerminalSurface(` appears once (`main.ts:241`), inside the `diff.toOpen` loop; `dispose()` once, in the `diff.toClose` loop |
| E15 | INV-1/2/3 asserted from every source state in Named Invariants | **fail** | Critical 6, Critical 7 — the missing source states are exactly where Criticals 1/3/4 live |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/` only) | pass |
| 2 | No terminal-output state parsing | pass — `capture-pane` absent from all code; `DisplayVar` oracle-only |
| 3 | No blocking hook handler | pass — ingest untouched |
| 4 | tmux always via dedicated socket; `pty.Setsize` + `resize-window`, never `resize-pane` | pass — every `exec` goes through `socketFlag()`; D5 grep clean |
| 5 | No payload logging | pass — see Minor 6 for a small caution on the resize-frame log |
| 6 | No empty-gauge dishonesty | pass — `5h unknown` / `7d unknown` / `ctx unknown` observed live |
| 7 | Session identity on the tmux target | pass — `muster-<id>:@<n>`, `session_id` untouched |
| 8 | No `~/.claude/settings.json` / `CLAUDE_CONFIG_DIR` | pass — only project-scoped `.claude/settings.local.json` |
| 9 | No real `claude` outside canary/probes | pass — stub only, in harness and Go tests |

## Manual Verification

Built `bin/musterd`, ran it on a scratch data dir with the harness's echo stub as
`-claude-bin` and a scratch `-tmux-socket` path, launched five sessions, and drove the
dashboard in Chromium.

Confirmed working by hand:

- **Focus stream + round trip**: `MUSTER-STUB-READY` rendered; typed `hello-from-review`,
  pane echoed `stub-echo:hello-from-review`.
- **Sizenote vs tmux oracle**: sizenote `119×34 · one live client · geometry owned by this
  pane`; `tmux display-message -p '#{window_width}x#{window_height}'` on `muster-1` →
  `119x34`. Exact match.
- **INV-3 (snapshot half)**: the four non-focused sessions stayed at `80x24` — never
  resized.
- **Focus refit on container change**: resizing the browser to 900×600 moved `muster-1`
  from `119x34` to `79x22`. The refit path works when the container is attached.
- **REQ-4 options (D8, live)**: `show-options -g` on the daemon's socket reports
  `window-size manual`, `prefix None`, `prefix2 None`, `escape-time 0`, `status off`,
  `mouse off`, `destroy-unattached off`, `detach-on-destroy off`,
  `default-terminal tmux-256color`, `terminal-features[3] xterm-256color:RGB`,
  `aggressive-resize off` (window). Topology: five sessions `muster-1`…`muster-5`, one
  window each.
- **Prefs**: `/api/state` returned `{'view': 'tiles', 'density': '3x2'}` after the
  masthead clicks.

Confirmed **broken** by hand (details in Issues):

- Tiles never refits: the session carried over from Focus kept a 119×34 grid inside a
  597×311 tile (overflowing it), its tmux window stayed 119×34, and its footer read
  `119×34`. After 2×2→3×2, *no* tile refit: all five slots became 397×359 while the tiles
  still rendered 79×12 / 52×14 and reported those in their footers.
- Keyboard focus inside a tile is lost within ~1 s: `document.activeElement` goes from the
  tile's xterm textarea to `BODY` after the 1 s tick. Clicked into `repo3`'s tile, waited
  1.6 s, pressed `l` then Enter — nothing reached the pane (`capture-pane` shows only
  `MUSTER-STUB-READY`).
- `tmux kill-session -t muster-4` (a live tile, four other sessions on the socket): no
  4001, no "session ended" overlay, footer still `live`; `list-clients` showed that
  session's attach client had **moved to `muster-2`**, which then had two clients. Typing
  `TYPED-INTO-REPO4-TILE` into the repo4 tile landed in **repo2's** pane
  (`capture-pane -t muster-2` shows `stub-echo:TYPED-INTO-REPO4-TILE`).
  Control experiment: `set -g detach-on-destroy on`, then `kill-session -t muster-3` → that
  client exited, the socket closed 4001, and the repo3 tile correctly showed
  "session ended".
- PTY teardown leak: fresh daemon, two sessions, one focused (1 `tmux attach-session`
  process). Clicked the other rail card — still exactly one terminal region in the DOM, but
  **two** attach processes / tmux clients. The old one only exited once I forced output
  into its pane (`send-keys`), which pins the cause to a blocked `bridge.Read`.

Everything in this section is a live observation, not a diff reading. Nothing was left
running: scratch daemons killed, both scratch tmux servers killed, scratch dirs and
`.playwright-mcp/` removed, `ps` shows zero `attach-session` processes.

## Issues

### Critical

1. **[web-impl]** Tiles surfaces never refit, so a live tile's geometry is never moved to
   it — `web/src/main.ts:197-210`. `renderTilesView` builds every tile with `buildTile`
   into a **detached** fragment, calls `surface.refit()` and `renderTileGeometry(...)` on
   it, and only then does `tilesGridEl.replaceChildren(...)`. `FitAddon.fit()` on a
   detached (zero-size) container is a no-op — `pane.ts:157-161` swallows it — so no
   `resize` frame is ever sent from Tiles, for any tile, on any path. Measured: a session
   carried from Focus into a tile kept 119×34 in a 597×311 tile with the tmux window still
   at 119×34; after 2×2→3×2 every tile slot became 397×359 and not one tile refit.
   This breaks REQ-11, REQ-15 ("tile footers show their **real** geometry"),
   design-system §4.2 ("switching moves ownership of geometry … a view change therefore
   resizes real tmux windows") and the plan's User Flow 3 ("every remaining tile refits and
   resends `resize`"). Every path is the same one: `render()` → `renderTilesView`, reached
   from the 1 s tick, `sessionUpsert`, the `prefs` broadcast, `promoteSession` and
   `focusNth`. Fix: insert the tiles into the grid **first**, then `refit()` and render the
   footer geometry (and consider making `refit()` report that it could not measure, so a
   silent no-op can't recur).

2. **[web-impl]** A live tile cannot be typed into for more than ~1 second —
   `web/src/main.ts:197`. `renderTilesView` unconditionally rebuilds the whole grid on
   **every** render pass, including the 1 s `setInterval(render, 1000)` tick; re-parenting
   the surface root blurs xterm's textarea, so `document.activeElement` drops to `BODY`
   within a second of the user clicking into a tile and subsequent keystrokes go nowhere
   (measured: `l`+Enter after 1.6 s never reached the pane). REQ-8 ships tiles as *live*
   terminals; a terminal you cannot type into is not live. Note Focus does not have this
   bug because `renderFocusView` guards re-parenting
   (`if (mainSlotEl.firstElementChild !== surface.root)`, `main.ts:172`) — the same
   guard/in-place-update approach is missing here. Fix: update tile chrome in place and
   only rebuild the grid when membership actually changes; never re-parent a mounted
   surface root.

3. **[daemon-impl]** `detach-on-destroy off` + one-tmux-session-per-Muster-session sends a
   dead session's attach client into **another Muster session**, misrouting keystrokes —
   `internal/tmux/tmux.go:55`. With ≥2 sessions on the socket, destroying one does not end
   its attach client; tmux moves it to another session. Measured consequences, all three
   from one `kill-session`: (a) no PTY EOF, so no `4001`, no `Nudge`-driven overlay and the
   tile still reads `live`; (b) INV-1 broken — the target session ends up with two attached
   clients (`list-clients` showed two on `muster-2`); (c) **input typed into the dead
   session's surface is delivered to a different session's Claude Code**
   (`stub-echo:TYPED-INTO-REPO4-TILE` appeared in `muster-2`'s pane). (c) is the serious
   one: prompts and keystrokes reaching the wrong agent is worse than a lost pane.
   Control experiment confirms the fix direction: with `detach-on-destroy on`, the client
   exits, `4001` arrives and the "session ended" overlay renders correctly.
   REQ-4 mandates `off` — a spike carry-over from the M1 shared-session topology that
   structural decision 1 invalidated. Per the pipeline rule this needed **escalation, not
   absorption**: raise the REQ-4 amendment (and check `destroy-unattached` for the same
   staleness) rather than shipping the measured-then-obsolete value.

4. **[daemon-impl]** A client-initiated socket close leaks the PTY, the tmux attach client
   and the handler goroutine until the pane happens to emit output —
   `internal/server/terminal.go:146-158`. `handleTerminal` blocks on `<-ptyDone` *before*
   its deferred `bridge.Close()`, while `pumpPTYToSocket` is parked in the blocking
   `bridge.Read(buf)` (`terminal.go:167`), which no context cancellation can interrupt.
   Nothing closes the PTY, so nothing unblocks the read. Measured: one rail-card refocus
   left two `tmux attach-session` processes with exactly one live surface in the DOM; the
   stale one exited only when I forced output into its pane. An idle Claude Code session
   (Needs-Input — the very state the user refocuses away from) emits nothing, so this can
   persist indefinitely. This breaks INV-2 server-side and REQ-2's "its PTY torn down", and
   leaves a second live client attached to a session the UI has moved on from. Every path
   that closes a surface reaches it: view switch, refocus, density shrink, demotion by
   promotion, page unload. Fix: close the PTY as soon as the socket-side pump returns (or
   arm a `context.AfterFunc(ctx, bridge.Close)`), and make sure the resulting read error is
   not mistaken for a real pane EOF — a spurious `4001`/`Nudge` for a live session must not
   be the cure.

5. **[web-impl]** A tile whose pane has ended still advertises itself as `live` —
   `web/src/render/tiles.ts:58-62`. The footer marker is derived from
   `surface.geometry !== null`, which is non-null for any surface that ever attached, so a
   session that dies **while attached** keeps the `live` marker (and its last geometry)
   forever. Measured directly: after killing `muster-3`, that tile rendered the
   "session ended" overlay and the footer marker `live` at the same time. Under
   design-system §6 this is the UI asserting something the daemon knows to be false (the
   daemon had already flipped `alive:false`, `endedAt` set). `web/src/render/tiles.test.ts:25`
   currently locks the wrong behaviour in ("renders … the 'live' marker when geometry is
   present"), so the fix needs the test updated too. Drive the marker from the session's
   `alive` plus the surface's overlay state, not from geometry nullability.

6. **[e2e-specs]** INV-3's "geometry **moves**" half is never asserted, which is exactly
   why Critical 1 shipped green — `web/e2e/views.spec.ts:188` (E10). E10 measures only that
   a session *still in the strip* has an unchanged `#{window_width}`; it passes just as
   happily when no live tile is resized either. E8's REQ-15 check
   (`views.spec.ts:111`) matches `/\d+\s*×\s*\d+/` — a pattern, so a stale or fabricated
   geometry satisfies it. Add: after a view switch, a density change and a promotion, the
   newly/continuing-live session's `#{window_width}`/`#{window_height}` must equal that
   tile's footer geometry (the E4 oracle, applied in Tiles).

7. **[daemon-tests]** Session death is only ever tested with a single tmux session on the
   socket, so Critical 3 is structurally invisible —
   `internal/server/terminal_test.go:391` (D5/D6) and
   `internal/termbridge/termbridge_test.go:147`. Both create one session, kill it, and
   assert EOF/4001; with nothing else on the socket the client has nowhere to hop, so it
   exits and the test passes. The plan's own Named Invariants require every reachable source
   state. Add a case with ≥2 sessions on the socket that kills the attached one and asserts
   (a) 4001 arrives, and (b) `tmux list-clients` shows no client on any *other* Muster
   session. A `#{session_attached} == 1` assertion per session would also catch Critical 4.

### Major

1. **[daemon-impl]** Takeover happens *after* the new attach, contradicting REQ-2 and the
   code's own comment — `internal/server/terminal.go:134-143`. `termbridge.Attach` runs at
   :134, `s.terminals.takeover(id, conn)` only at :143, so two PTYs/tmux clients coexist on
   that session for the duration of the attach. REQ-2 is explicit ("its PTY torn down
   **before** the new attach starts"), and `takeover`'s doc comment
   (`terminal.go:55-57`) claims "in that order, so the old PTY is gone before the new attach
   starts" — which the call order does not deliver. Either reorder (register/supersede,
   then attach) or fix the requirement and the comment; today the code and its own
   documentation disagree.

2. **[web-impl]** A failed `PUT /api/prefs` is silently swallowed —
   `web/src/main.ts:109,113` (`void putPrefs(...)`). `putPrefs` returns an `ApiResult`
   carrying the daemon's error, and both call sites discard it; a rejected or failed switch
   leaves the button un-pressed with no explanation. The daemon-down banner covers the
   common case, so this is not a §6 violation, but the error path deserves at least a log
   (the launch modal's inline-error precedent exists for exactly this).

### Minor

1. **[web-impl]** The initial Focus resize is measured before the sizenote line exists, so
   the first `resize` frame sent to tmux is one row too tall and is corrected only on the
   next 1 s tick — `web/src/main.ts:175-176` (refit before `renderSizenote` un-hides
   `#sizenote`). It self-corrects, but it is a real transient the E2E spec had to be
   rewritten around (`test-specs.md` Repair 5); sending the initial resize after the
   sizenote is laid out would remove both the wobble and the need for the poll.
2. **[daemon-impl]** `termbridge.Attach`'s doc comment says "ctx bounds only the spawn
   itself; the returned Bridge's lifetime is governed by Close, not ctx"
   (`internal/termbridge/termbridge.go:45-46`), but `exec.CommandContext` kills the process
   when ctx is done. The behaviour is right (ctx is the request context, whose lifetime is
   the bridge's); the comment is wrong and would mislead the next reader.
3. **[daemon-impl]** `terminalRegistry.closeAll()` closes every entry but never clears the
   map (`internal/server/terminal.go:82-89`), so a post-shutdown `takeover` would re-close
   already-closed conns. Harmless today (both closes are idempotent), untidy.
4. **[web-impl]** The tile footer says `live`/`ended`; design-system §5 specifies
   `live` or `stopped` (`web/src/render/tiles.ts:60`). Pick one and make the design doc and
   the code agree.
5. **[web-impl]** `pane.ts`'s `cssVar` fallbacks hard-code `#0d0f16` and `#e8e6e1`
   (`web/src/terminal/pane.ts:87-88`), duplicating `--term`/`--paper`. The token read is the
   right idea; a literal duplicate of a token's value is the thing §1 forbids. Fall back to
   a neutral keyword, or let xterm's own default stand.
6. **[daemon-impl]** `applyResizeFrame` logs the raw text frame on a parse failure
   (`internal/server/terminal.go:217`, `Str("frame", string(data))`). Keystrokes travel as
   binary and are never logged, so this is not a payload leak today — but it is the one
   place client bytes reach a log line, and a debug-level cap on length would keep it that
   way.
7. **[e2e-specs]** INV-2 is asserted only from the browser (`page.on('websocket')`,
   `views.spec.ts:240`). A daemon-side oracle — `tmux list-clients` count per session, or
   `#{session_attached}` — would have caught Critical 4 and costs one helper call.
8. No routing tag (housekeeping): daemon-impl's throwaway `prefix None` verification left
   two sockets in tmux's shared dir (`/private/tmp/tmux-501/muster-prefix-test-{default,none}`),
   the exact litter REQ-5 exists to prevent. Harmless, but worth deleting; ad-hoc
   verification scripts should use a scratch-dir socket too.
9. No routing tag (plan defect, for the record): REQ-4's option list was carried over from
   the spike without re-checking it against structural decision 1, which is how Critical 3
   became reachable. When that requirement is amended, `destroy-unattached off` deserves the
   same re-examination.
