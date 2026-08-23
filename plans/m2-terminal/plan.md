# Plan: M2 — Terminal panes

**Created**: 2026-08-23
**Status**: completed
**Work Type**: full-stack
**Description**: PTY↔WebSocket bridge to tmux, xterm.js live panes in Focus, the Tiles view, the view switcher with persisted prefs, plus the two queued M1 follow-ups (⟳n compaction E2E, tmux sockets in scratch dirs).

## Overview

M2 makes sessions *usable* from the dashboard: the Focus view's main area becomes a live
terminal (xterm.js over a daemon-owned PTY attached to tmux), and the Tiles view ships as
direction A's second peer surface — a grid of live tiles plus a snapshot strip. Every
mechanism here was measured by the 2026-08-16 spike (`spikes/FINDINGS.md` §7): shared
single-client attach, `window-size manual`, `pty.Setsize` **then** `tmux resize-window`,
`scrollback: 0`, binary WS frames, EIO-as-EOF, and the one-live-client law.

Two structural decisions were settled in planning (2026-08-23, with Damian):

1. **One tmux session per Muster session.** A tmux client attaches to a tmux *session*
   and shows one window; Tiles needs up to 6 concurrent live surfaces, so M1's
   one-shared-session layout cannot serve it. Launch now creates `muster-<id>` (a single
   window running claude) instead of a window inside the shared `muster` session. This is
   exactly the topology the sizing matrix measured. New sessions get tmuxTarget
   `muster-<id>:@<n>`; pre-M2 rows point at long-dead windows and need no migration.
2. **Sticky tile membership.** The live grid is top-N-by-attention *at view entry and
   density change only*; afterwards membership changes only by user action (clicking a
   strip card promotes it, demoting the lowest-priority live tile). A terminal never
   vanishes mid-keystroke; the strip's state colours are the escalation signal.

Also settled: `GET /api/sessions/{id}/pane` is **deferred to M4** (the mockups render no
terminal content in rail/strip cards — they are metadata cards, already built in M1);
prefs persist both `view` and `density`.

## Requirements

### Must Have

- [ ] REQ-1: **Terminal bridge.** `GET /ws/terminal/{id}` upgrades to a WebSocket bridged
      to a daemon-owned PTY running `tmux attach` against that session's tmux session.
      Binary frames carry raw bytes both directions, verbatim — the daemon transforms
      nothing.
- [ ] REQ-2: **One-live-client law, server-side (INV-1).** At most one terminal socket
      per session; a new connection supersedes the old one, which is closed with code
      4000 (reason `superseded`) and its PTY torn down before the new attach starts.
- [ ] REQ-3: **Resize.** A client text frame `{"type":"resize","cols":C,"rows":R}`
      applies `pty.Setsize` **then** `tmux resize-window`, in that order, never the
      forbidden pane-level primitive (FINDINGS §7(d)). Client debounces ~100 ms.
- [ ] REQ-4: **tmux topology + options.** Launch creates tmux session `muster-<id>`
      (single window, claude as the command, `-e` env as today). The daemon applies the
      spike's carry-over options to every server/new session on the muster socket:
      `default-terminal tmux-256color`, `terminal-features ,xterm-256color:RGB`,
      `escape-time 0`, `status off`, `window-size manual`, `mouse off`,
      `aggressive-resize off`, `destroy-unattached off`, `detach-on-destroy on`, and
      `prefix None` (keystrokes must pass through to claude; the daemon drives tmux only
      via CLI commands, never via prefix keys).
      *Amended in review cycle 1 (2026-08-23): the spike's `detach-on-destroy off` was
      measured against the M1 shared-session topology; under structural decision 1
      (one tmux session per Muster session) `off` makes a destroyed session's attach
      client hop to another Muster session, misrouting keystrokes into the wrong
      claude (review.md Critical 3, verified by control experiment). `on` makes the
      client exit so the PTY EOFs and 4001/liveness fire as REQ-6 requires.
      `destroy-unattached off` was re-examined and stays correct: sessions must
      survive with no dashboard viewer attached.*
- [ ] REQ-5: **Socket-path support (M1 follow-up).** `-tmux-socket` accepts a filesystem
      path: a value containing `/` is used with `-S`, otherwise `-L` (default `muster`
      keeps working). The E2E harness, per-test Go tests (`t.TempDir()`), and `test/rig`
      all move to per-run socket paths inside scratch dirs that already get deleted.
- [ ] REQ-6: **PTY environment & EOF.** The attach PTY runs with `TERM=xterm-256color`
      and `LANG=en_US.UTF-8` set explicitly; a PTY read returning EIO is treated as clean
      EOF (macOS). On EOF the daemon closes the socket with code 4001 (reason
      `pane_ended`) and nudges the liveness poll for that session.
- [ ] REQ-7: **Focus live pane.** The Focus main area renders the focused session's
      terminal (xterm.js 6.0.0 + addon-fit 0.11.0, `scrollback: 0`, nothing restyled
      inside the pane). Clicking a rail card moves focus: old socket closed, new one
      opened, initial `resize` sent from the new container's fitted geometry.
- [ ] REQ-8: **Tiles view.** Grid of live tiles (each its own terminal socket) + snapshot
      strip cards (same metadata as rail cards) for every other session. Density control
      2×2 (N=4) / 3×2 (N=6). Clicking a strip card promotes it, demoting the
      lowest-priority live tile (by the §3.4 sort order); a session dying in a live tile
      shows an "ended" placeholder in place — membership does not reshuffle.
- [ ] REQ-9: **View switcher.** Masthead segmented control (the slot M1 laid out) +
      **⌘\\** toggle. **⌘1–9** focuses session *n* of the sorted list (Focus: focus it;
      Tiles: promote it / focus its tile). ⌘N keeps its existing launch-modal meaning.
- [ ] REQ-10: **Prefs.** `PUT /api/prefs` accepts `view` and/or `density`, persists to kv
      (single key, JSON), returns 204, and re-broadcasts the full prefs object as a
      `prefs` WS message to all UI sockets (INV-4). Both survive reload and daemon
      restart. Defaults: `view:"focus"`, `density:"2x2"`.
- [ ] REQ-11: **Geometry moves, never duplicates (INV-3).** Only a session's live
      surface drives its geometry. View switches and density changes resize only the
      sessions whose live surface actually changed; sessions that are snapshots in both
      configurations are never resized.
- [ ] REQ-12: **Snapshot cards never attach (INV-2).** Rail cards and strip cards open no
      terminal socket, ever — the number of open `/ws/terminal/` sockets equals the
      number of live surfaces in the current view.
- [ ] REQ-13: **Degraded states.** Daemon down: terminal sockets die, the existing banner
      shows, each terminal gets a "disconnected" overlay; on reconnect the client
      reattaches the current view's live surfaces. Focusing a dead session (`alive:
      false`): no attach attempt — an "ended" placeholder (snapshot content deferred to
      M4). Superseded (4000): overlay saying the live view moved to another window.
- [ ] REQ-14: **⟳n compaction counter (M1 follow-up).** E2E asserts the context row
      pattern `/ctx unknown ⟳\d+/`: one synthesized PreCompact → `⟳1`, a second → `⟳2`.
      Rendering already exists; this is a plan table row + a test.

### Should Have

- [ ] REQ-15: Focus view's sizenote line (a-instrument mockup): `<cols>×<rows> · one live
      client · geometry owned by this pane`; tile footers show their real geometry
      (d-tiled `tfoot`).

### Nice to Have

- [ ] REQ-16: Wheel-into-copy-mode scrollback. **Explicitly out of scope for M2** —
      noted here only so nobody "helpfully" adds xterm scrollback instead.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval).

### WS: `GET /ws/terminal/{id}` — refinement of §6 (the section reserved to this plan)

**Auth**: UI cookie on the upgrade + the §2 Origin check. Pre-upgrade errors (plain HTTP):
- 401 `unauthorized` — no/invalid cookie.
- 404 `not_found` — unknown session id.
- 409 `not_attachable` — session exists but `alive` is false.

**Frames**:
- **Binary server→client**: raw PTY output bytes, verbatim (xterm.js writes them; the
  UTF-8 decoding is xterm's, so multi-byte sequences may split across frames — byte
  order is the only guarantee).
- **Binary client→server**: raw input bytes (keystrokes, bracketed paste).
- **Text client→server** (the only JSON on this socket):

```json
{ "type": "resize", "cols": 210, "rows": 52 }
```

`cols` clamped to [20, 500], `rows` to [5, 300]; an unparseable or unknown text frame is
ignored and logged (never fatal). The client sends one `resize` immediately after open
(the attach PTY starts at 80×24 until it arrives) and then debounced ~100 ms.

**Close codes** (server-initiated):
- `4000` `superseded` — a newer socket claimed this session (one-live-client law).
- `4001` `pane_ended` — PTY EOF: the tmux session/pane is gone. The daemon also nudges
  the liveness poll, so a `sessionUpsert` with `alive:false` follows shortly.
- Normal close (1001) on daemon shutdown.

There are no server→client text frames in M2.

### HTTP: PUT /api/prefs — refinement of §3.3

**Auth**: UI cookie (401 `unauthorized` without it).
**Request** (at least one field; unknown fields ignored):

```json
{ "view": "focus | tiles — optional", "density": "2x2 | 3x2 — optional" }
```

**Response**: 204, no body. The full prefs object is then broadcast to every UI socket:

```json
{ "type": "prefs", "prefs": { "view": "tiles", "density": "3x2" } }
```

**Errors**:
- 400 `invalid_request`: body not JSON, no known field present, or a field with a value
  outside its enum.

`snapshot.prefs` (§5.2) gains `density` alongside `view`. Persisted in kv; defaults
`{"view":"focus","density":"2x2"}` before any PUT.

### §3.4 GET /api/sessions/{id}/pane — deferred to M4

Not implemented in M2 (planning decision 2026-08-23): the mockups render no terminal
content in rail/strip cards — "snapshot" means *static metadata card*, not screenshot.
The one real consumer is the dead-session case, which belongs with M4's resume flow.
§3.4's row moves to the M4 line of the milestone map.

### §5.3 tmuxTarget format note

Sessions launched from M2 onward carry `tmuxTarget` of the form `"muster-7:@1"` (their
own tmux session). The field stays opaque to the UI; pre-M2 rows keep their old format.

## Schema Changes

No schema changes required (prefs live in the existing `kv` table under one JSON key).

## UI Specifications

Design authority: `docs/design/design-system.md` + mockups `a-instrument.html` (Focus)
and `d-tiled.html` (Tiles). The dashboard restyles **nothing** inside a terminal — xterm
output is the one region design-system tokens don't reach.

### Views

- **Focus** (exists since M1): rail unchanged; the main area becomes the focused
  session's live terminal, with the sizenote line under it (REQ-15). Default focus on
  load: top of the §3.4 sort order. Focus choice is *not* persisted (recomputed).
- **Tiles** (new): grid of N live tiles (2×2 → 4, 3×2 → 6) + snapshot strip along the
  bottom. Tile = header (state dot, title, repo/branch, ctx, timer) + terminal body +
  footer (geometry, live/snapshot marker). Strip card = the M1 card content on its side
  (title, state badge, timer, repo/branch + ctx line, last-activity/reason line).
- **Masthead** (both views): segmented Focus/Tiles control fills the M1 slot; the
  density control renders only in Tiles.

### User Flows

1. **Focus a session**: click rail card → its card highlights, main terminal swaps
   (old socket closes, new opens, fitted `resize` sent). Typing lands in claude;
   Escape and Shift+Tab pass through (measured, FINDINGS §7).
2. **Switch views**: masthead control or ⌘\\ → `PUT /api/prefs {"view":…}` → on the
   `prefs` echo (or optimistically) the view swaps; live surfaces are diffed — sessions
   live in both views at the same geometry are left alone; changed ones get
   close/open/resize.
3. **Change density**: 2×2 ⇄ 3×2 → `PUT /api/prefs {"density":…}` → grow promotes the
   next sessions by sort order into the freed slots; shrink demotes the lowest-priority
   live tiles. Every remaining tile refits and resends `resize`.
4. **Promote from strip**: click strip card → it replaces the lowest-priority live tile;
   the demoted session becomes a strip card. New session launched while in Tiles: fills
   a free live slot if the grid has one, else joins the strip.
5. **⌘1–9**: index into the full sorted list. Focus view: focus it. Tiles: promote it
   (no-op beyond focus if already live). ⌘\\ toggles views. ⌘N unchanged.

### States

- **No sessions yet**: Focus main area and Tiles grid show the existing empty-state
  treatment ("no sessions — ⌘N to launch"); no terminal DOM, no sockets.
- **No data / unknown**: card fields keep M1's rules (`ctx — unknown` etc.). A live tile
  whose session has null context shows the unknown text in its header, never an empty
  gauge.
- **Daemon down**: existing banner; every terminal gets a "disconnected — daemon down"
  overlay; frozen last-drawn content stays visible; on `hello` the client reattaches.
- **Session dead** (`alive:false`): live surface shows "session ended" placeholder
  (offers nothing until M4's resume); strip/rail card greys out per M1.
- **Superseded** (close 4000): overlay "live view opened in another window — click to
  take back", clicking reclaims (new socket supersedes the other window).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| View switcher: Focus | `button` | `Focus` | segmented control in masthead; `aria-pressed` reflects selection |
| View switcher: Tiles | `button` | `Tiles` | as above |
| Density: 2×2 | `button` | `2×2` | Tiles only; `aria-pressed` |
| Density: 3×2 | `button` | `3×2` | Tiles only; `aria-pressed` |
| Focused terminal region | — | container carries `aria-label` `Terminal: <title>` | xterm.js owns the inner DOM — locate the container, not xterm internals |
| Live tile | — | tile header contains the session title | article-shaped; locator strategy is e2e-specs' call |
| Strip card | — | contains session title text | click target for promotion |
| Rail card context row | — | `/ctx unknown ⟳\d+/` | REQ-14; exists since M1 in `web/src/sessions/card.ts` |
| Terminal overlay (down/superseded/ended) | — | `/disconnected|another window|session ended/` | one overlay element per live surface |
| Empty state | — | `/no sessions/i` | both views |

### Named Invariants

Tested from **every reachable source state**, not the convenient one (m1-sessions
lesson):

- **INV-1 one-live-client**: at most one open terminal socket per session, server-side.
  New connect supersedes (4000) — asserted from: no prior socket, same-page refocus,
  second browser context, and mid-typing.
- **INV-2 snapshots-never-attach**: open `/ws/terminal/` socket count == live-surface
  count — asserted in Focus, in Tiles at both densities, after view switches, after a
  promotion, and after a live session dies.
- **INV-3 geometry-single-writer**: a session with no live surface is never resized —
  asserted across view switch, density change and promotion via the tmux oracle
  (`#{window_width}` unchanged for strip sessions).
- **INV-4 prefs-echo**: every accepted `PUT /api/prefs` produces exactly one `prefs`
  broadcast carrying the full object, to every connected UI socket.

## Affected Files

### Daemon

- `internal/tmux/tmux.go` — topology: `NewWindow` → per-Muster-session
  `NewSession(id, dir, env, command)` returning `("muster-7:@1", "%12")`; drop
  `ensureSession`'s placeholder window; apply REQ-4's options (server-wide ones once per
  socket, window ones per new session); socket flag accepts a path (`-S` iff it contains
  `/`); `AttachArgv(sessionName)` helper for the bridge; `ResizeWindow(target, cols,
  rows)`; `DisplayVar(target, fmt)` (test oracle); `PaneExists`/`KillWindow` unchanged
  in behaviour.
- `internal/termbridge/` (new package) — PTY lifecycle over `creack/pty`: spawn the
  attach argv with `TERM`/`LANG` set, read pump (EIO = clean EOF), write, `Resize`
  (`pty.Setsize` then tmux resize via the tmux client), `Close`.
- `internal/server/terminal.go` (new) — `/ws/terminal/{id}`: auth + Origin check,
  404/409 pre-upgrade, per-session takeover registry (4000), frame pumps, resize
  control frames (clamped), 4001 + liveness nudge on EOF.
- `internal/server/prefs.go` (new) — `PUT /api/prefs`: validation, kv persistence,
  broadcast.
- `internal/server/state.go` — `PrefsInfo` gains `Density`; snapshot reads kv.
- `internal/server/ws.go` — `prefs` broadcast plumbing.
- `internal/server/server.go` — routes, config passthrough (socket value, browse-root
  style), termbridge wiring.
- `internal/server/sessions.go` — launch calls `NewSession`; env unchanged (LANG already
  set since M1).
- `internal/session/manager.go` — export a `Nudge(sessionID)` for the PTY-EOF liveness
  poke (poll loop already exists).
- `cmd/musterd/main.go` — `-tmux-socket` flag help mentions path form.
- `go.mod` / `go.sum` — add `github.com/creack/pty` (validated by spike S4).
- `test/rig/newprobe.sh` — per-run socket path in its scratch dir (REQ-5).

### Web

- `web/src/terminal/pane.ts` (new) — xterm wrapper: `scrollback: 0`, fit addon, binary
  socket to `/ws/terminal/{id}`, onData → binary frames, debounced resize frames,
  close-code → overlay state, dispose.
- `web/src/sessions/live.ts` (new, pure — Vitest target) — tile membership:
  `initialLive(sessions, n)`, `promote(live, id, n, sessions)`,
  `applyDensity(live, n, sessions)`, `surfaceDiff(before, after)` (which sessions to
  close/open/resize). Sticky rules encoded here.
- `web/src/render/tiles.ts` (new) — grid + strip rendering.
- `web/src/render/sessions.ts` — Focus main area hosts the terminal container + sizenote.
- `web/src/render/masthead.ts` — segmented Focus/Tiles control + density control.
- `web/src/main.ts` — view state, keyboard (⌘\\, ⌘1–9), prefs sync, surface manager
  (owns which pane.ts instances exist; applies `surfaceDiff`).
- `web/src/api.ts` — `putPrefs`.
- `web/src/protocol.ts` — `Prefs` gains `density`; parser updated.
- `web/src/style.css` — tiles grid/strip/tile chrome, terminal container, overlays,
  density/switcher controls (tokens per design-system).
- `web/playwright.config.ts` — **owned by web-impl** if any change is needed (none
  anticipated).

### E2E (e2e-specs)

- `web/e2e/terminal.spec.ts` (new) — bridge round-trip, takeover, geometry oracle,
  pane-ended, daemon-down overlay + reattach.
- `web/e2e/views.spec.ts` (new) — switcher, ⌘\\/⌘1–9, persistence across reload and
  `restart()`, density, promotion, INV-2 socket counting (Playwright `page.on('websocket')`).
- `web/e2e/sessions.spec.ts` — the ⟳n rows (REQ-14).
- `web/e2e/helpers/daemon.ts` — **stub claude upgraded** from the sleep loop to an echo
  loop: prints `MUSTER-STUB-READY`, then `stub-echo:<line>` per input line, then sleeps
  forever on EOF (never exits — existing launch/liveness specs unaffected). Harness
  passes `-tmux-socket <dataDir>/tmux.sock` (REQ-5) and gains a tmux oracle helper
  (`tmuxDisplay(target, format)`).

## Edge Cases

1. **Takeover from a second window** — the older socket gets 4000; its xterm freezes
   under the superseded overlay; clicking reclaims (supersedes back). No flapping: a
   socket only opens on user action or view render, never on the overlay's own signal.
2. **Session dies while attached** — PTY reads EOF (EIO), server sends 4001, nudges
   liveness; UI swaps to the ended placeholder when `alive:false` arrives (the overlay
   covers the gap).
3. **`/clear` while attached** — same pane, same tmux session: the bridge is unaffected;
   the state machine handles the rebind exactly as in M1.
4. **Daemon restart mid-session** — tmux server is a separate process: panes and claude
   survive; only the bridge dies. Banner shows; on `hello` the client reattaches its
   current live surfaces; tmux repaints the whole screen on attach so no content is lost.
5. **Resize storms** (window dragging, density flapping) — client debounces ~100 ms;
   server applies frames sequentially per session; clamps reject garbage.
6. **Split UTF-8 across frames** — binary frames + xterm's stateful decoder handle it;
   the daemon must never re-chunk on anything but byte boundaries (it streams verbatim).
7. **Fewer sessions than N** — grid shows only real tiles; empty slots collapse (no
   placeholder tiles); strip hides when empty.
8. **Prefs PUT races two windows** — last write wins; both converge on the broadcast.
9. **Unknown/invalid resize values** — clamped or dropped (logged); never kill the
   socket over a bad control frame.
10. **Hook loss / unordered events** — unchanged from M1; nothing in M2 derives state
    from terminal bytes (hard rule: capture/attach are display + oracle only).

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon

- **D1**: `/ws/terminal/{id}` streams a real tmux pane's output to the client (Go
  integration test on a `t.TempDir()` socket: spawn `sh`, attach, read prompt bytes).
- **D2**: bytes written to the socket reach the pane's process (send `echo hi\n`, oracle
  via capture-pane).
- **D3**: a second socket for the same session closes the first with code 4000.
- **D4**: a resize frame results in `#{window_width}`/`#{window_height}` matching the
  requested cols/rows (oracle: `DisplayVar`).
- **D5**: killing the tmux session closes the socket with 4001.
- **D6**: within the liveness poll interval after 4001, the session broadcasts
  `alive:false`.
- **D7**: connecting to a session with `alive:false` is rejected 409 `not_attachable`.
- **D8**: launch creates tmux session `muster-<id>` whose window shows `window-size
  manual` in `show-options`.
- **D9**: a `-tmux-socket` value containing `/` creates the socket file at that path.
- **D10**: `PUT /api/prefs` persists across a daemon restart (kv oracle or `/api/state`).
- **D11**: every accepted prefs PUT broadcasts one `prefs` message to all connected UI
  sockets (INV-4).
- **D12**: Go tests create no socket files under tmux's shared tmp directory (all test
  Clients get `t.TempDir()` paths).

### Web

- **W1**: the web build passes.
- **W2**: web unit tests pass, including `sessions/live.ts` membership tables (sticky
  rules from every starting configuration: entry, promotion, density grow/shrink, death,
  new-session-with-free-slot).
- **W3**: xterm instances are constructed with `scrollback: 0`.
- **W4**: no `any` types in new web code.
- **W5**: nothing inside the terminal container is restyled by dashboard CSS.
- **W6**: switcher, density control, tiles and overlays follow
  `docs/design/design-system.md` tokens.
- **W7**: `surfaceDiff` output is what drives socket open/close/resize — no render path
  opens a socket outside the surface manager.

### E2E

- **E1**: focusing a launched session renders `MUSTER-STUB-READY` inside the terminal.
- **E2**: typing `hello` + Enter renders `stub-echo:hello` (full round-trip).
- **E3**: focusing the same session from a second browser context overlays the first
  with the superseded message (INV-1).
- **E4**: after focusing, the tmux oracle reports window geometry equal to the pane's
  fitted cols/rows.
- **E5**: switching to Tiles via the masthead control survives a page reload.
- **E6**: the chosen view survives a daemon `restart()`.
- **E7**: ⌘\\ toggles the view; ⌘1 focuses the first sorted session.
- **E8**: switching density 2×2 → 3×2 promotes the next sessions by sort order into the
  new slots.
- **E9**: clicking a strip card promotes it and demotes exactly the lowest-priority live
  tile.
- **E10**: across a density change, a session that stayed in the strip has unchanged
  `#{window_width}` (INV-3).
- **E11**: the open terminal-socket count equals the live-surface count in Focus, in
  Tiles at both densities, and after a promotion (INV-2).
- **E12**: killing the stub's tmux session shows the ended placeholder on its live
  surface.
- **E13**: stopping the daemon shows the banner and the disconnected overlay; after
  `restart()` the focused terminal streams again.
- **E14**: one synthesized PreCompact renders the context row matching
  `/ctx unknown ⟳1/`, a second updates it to `⟳2` (REQ-14).

### Automated Checks

Every line is `<ID> <single-line shell command>`, run from the project root; a check
passes iff its command exits 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
D5 ! rg -n "resize-pane" cmd/ internal/ web/src web/e2e
W1 make web-build
W2 make web-test
W3 rg -q "scrollback: 0" web/src
E1 make e2e
```

Notes on the negative greps (authoring rules):

- **D4** (adapter boundary): test files are **in scope** deliberately — tests obtain wire
  strings via the exported `claudecodetest` builders (the m0 lesson), never literals.
- **D5** (forbidden resize primitive): scope is the four code trees only; `plans/`,
  `docs/` and `spikes/` mention the primitive when citing FINDINGS §7(d) and are
  deliberately outside the net. Test files are in scope — no test needs the string
  either; code comments should cite "FINDINGS §7(d)" rather than naming it. Dry-run
  against this plan: the pattern appears only in this file, which the scope excludes.
- **W3** is a positive grep: the literal option must appear in `web/src` (pane.ts).

### Reviewer-Verified

- **D12**: read the Go tests — every `tmux.New` in tests receives a `t.TempDir()` path;
  none uses a bare `-L` name.
- **D13**: the resize path applies `pty.Setsize` before the tmux window resize, and the
  bridge treats EIO as clean EOF.
- **D14**: no state is ever derived from PTY/captured bytes (hard rule) — capture is
  test-oracle only.
- **D15**: hook/status ingest paths are untouched by the bridge (no payload logging, no
  new knowledge outside `internal/claudecode/`).
- **W4**, **W5**, **W6**, **W7** as stated above.
- **E15**: INV-1/INV-2/INV-3 assertions cover every source state listed in Named
  Invariants, not just the happy path.

## Implementation Notes

- **Everything sizing-related is measured** — cite `spikes/FINDINGS.md` §7 rather than
  re-deriving: shared attach keeps `tmux list-clients` at one row; `window-size manual`
  protects against external attachers (defence in depth: external viewers should use
  `-r`/`-f ignore-size`, worth a line in README); `pty.Setsize` sizes the client's
  paint region, the window resize sizes the app's layout — both, in that order.
- **Missing PTY env looks like a broken bridge** (boxes render as `qqqq`): the
  `TERM`/`LANG` on the attach PTY (REQ-6) is load-bearing, not cosmetic.
- **Escape latency**: `escape-time 0` is load-bearing too — the 500 ms default swallows
  Claude Code's interrupt key.
- **`prefix None`** was not in the spike's config; it's added so `C-b` reaches claude.
  If tmux version quirks surface, `set -g prefix None` + `set -g prefix2 None` is the
  fallback; verify manually during daemon-impl (evidence in the PR/commit).
- **Stub upgrade compatibility**: the echo stub must still never exit (M1 liveness specs
  depend on the pane staying alive) — banner line, read loop, then sleep loop on EOF.
- **Playwright websocket counting** (INV-2/E11): `page.on('websocket')` sees opens;
  track closes via the `close` event; filter URLs on `/ws/terminal/`.
- **Takeover reclaim loop guard**: sockets open only from user action or view render.
  The superseded overlay's click is a user action; nothing auto-reconnects on 4000.
- **tmux server options vs session options**: server-wide (`escape-time`,
  `default-terminal`, `terminal-features`) apply once per socket server; the rest are
  global session options (`set -g`) applied after the first `new-session` — tmux
  auto-starts the server on first command, so "apply options" runs right after any
  create that found no server.
- **Doc upkeep on completion**: tick the four M2 TODO items + the two queued plan items;
  protocol changelog entry (this delta); `interior tmux topology` note in tmux.go's
  package comment must be rewritten by daemon-impl (it documents the M1 layout).
