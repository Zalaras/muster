# Review: M2 — Terminal panes

**Plan**: m2-terminal
**Verdict**: approved

Review cycle 2. Cycle 1's seven Criticals, two Majors and nine Minors were all fixed
across three fix waves; cycle 1's own review is preserved at `review.cycle-1.md`.

Every automated gate is green (59/59 E2E full-suite regression sweep, 268 web unit, all 7
Go packages, lint 0 issues, all 9 authored acceptance checks). More importantly, **all
five of cycle 1's browser-only Criticals were re-measured by hand in this cycle against a
real daemon with seven real tmux sessions, and all five are genuinely fixed** — not merely
diffed. That matters because cycle 1's four worst defects were invisible to the test suite
by construction; this cycle the suite grew the assertions that would have caught them
(`expectTileGeometryMatchesTmux`, `totalAttachedClients()`, three multi-session Go death
tests, and two new E2E regression tests), so the blind spot itself is closed, not just its
symptoms.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 terminal bridge | Yes | Yes (D1/D2, E1/E2) | pass — verified by hand: typed `K`, pane echoed `stub-echo:K` after a daemon restart |
| REQ-2 one-live-client (INV-1) | Yes | Yes (D3, E3, 3 supersede tests + takeover-ordering poll) | pass — takeover now evicts+tears down inside the lock *before* attach; verified 1 client after a second-tab supersede and after reclaim |
| REQ-3 resize | Yes | Yes (D4, E4, E8/E10 in Tiles) | pass in Focus **and** Tiles — verified 151×34 / 95×12 / 63×12 all matching the tmux oracle exactly |
| REQ-4 tmux topology + options | Yes (amended) | Yes (D8) | pass — `detach-on-destroy on` per the cycle-1 amendment; all 11 options confirmed live via `show-options` |
| REQ-5 socket path | Yes | Yes (D9/D12) | pass — daemon, harness, Go tests and `test/rig/newprobe.sh` all on scratch-dir paths |
| REQ-6 PTY env & EOF | Yes | Yes, incl. multi-session (D5/D6 + 2 new ≥2-session tests) | pass — killed `muster-4` with 6 others on the socket: clean EOF, no client hop |
| REQ-7 Focus live pane | Yes | Yes | pass — verified incl. rail-card refocus |
| REQ-8 Tiles view | Yes | Yes (E8/E9 + typable-across-tick regression) | pass — tile typable after 3.5 s / 3+ render ticks; `stub-echo:REV` reached only `muster-3` |
| REQ-9 view switcher | Yes | Yes (E5/E7) | pass |
| REQ-10 prefs | Yes | Yes (E5/E6/D10/D11) | pass — `{"view":"focus","density":"3x2"}` survived a real daemon restart |
| REQ-11 geometry moves (INV-3) | Yes | Yes — both halves now | pass — geometry *moved* 151×34→95×12→63×12→151×34 across switches; strip sessions never resized |
| REQ-12 snapshots never attach (INV-2) | Yes | Yes, browser **and** daemon oracle | pass — attach-client count equalled live-surface count at every step, exactly one per session |
| REQ-13 degraded states | Yes | Yes (E12/E13 + multi-tile kill) | pass — dead tile reads `stopped` + "session ended"; daemon-down banner + overlay; reattach after restart |
| REQ-14 ⟳n compaction | n/a (M1) | Yes (E14) | pass |
| REQ-15 sizenote / tile footers | Yes | Yes — footers now oracle-checked, not pattern-matched | pass |
| REQ-16 scrollback | Correctly absent | D5 grep | pass |

## Build & Tests

E2E tests: **pass** (59/59, `make e2e`, full suite — regression sweep clean, run twice)
Daemon tests: **pass** (`go test ./... -count=1`, all 7 packages, uncached)
Web tests: **pass** (268 tests, 13 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` → 0 issues)

## Acceptance Checks

Every line run verbatim from the repo root.

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
| E1 | `make e2e` | pass (59 passed) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D12 | every test tmux client gets a scratch-dir path, no bare `-L` | pass | `internal/tmux/tmux_test.go:29`, `internal/termbridge/termbridge_test.go:29,44`, `internal/server/sessions_test.go:170` all build `<MkdirTemp>/tmux.sock` with `t.Cleanup`. Deliberately **not** `t.TempDir()` — documented at `tmux_test.go:22-28`: a test-name-rooted path plus `/tmux.sock` overflows AF_UNIX's ~104-byte `sun_path` limit on macOS. I hit this exact failure myself while setting up manual verification, so the deviation is correct, not a shortcut; D12's intent (scratch dirs that get deleted, no shared-dir litter) holds. `/private/tmp/tmux-501/` empty after a full uncached `go test ./...` **and** after `make e2e` |
| D13 | `pty.Setsize` before the tmux window resize; EIO = clean EOF | pass | `internal/termbridge/termbridge.go:80-88` (Setsize then `ResizeWindow`, both always), `:64-70` (`errors.Is(err, syscall.EIO)` → `io.EOF`) |
| D14 | no state derived from PTY/captured bytes | pass | `rg capture-pane cmd/ internal/ web/src` → **zero** hits anywhere in the code trees; `DisplayVar` is oracle-only, called from tests/helpers |
| D15 | ingest paths untouched, no payload logging, no adapter leak | pass | `git diff --stat internal/server/ingest.go internal/claudecode/` → empty (both untouched); D4 grep clean; hook timeout is 2 s (`internal/claudecode/settings.go:14-15,195`) |
| W4 | no `any` in new web code | pass | `rg ':\s*any\b|as any\b|<any>|: any\[' web/src web/e2e` → no matches |
| W5 | nothing inside the terminal container restyled | pass | `rg xterm web/src/style.css` → no matches; only `.terminal-surface`/`.terminal-body`/`.terminal-overlay` (the frame) styled |
| W6 | switcher/density/tiles/overlays follow design-system tokens | pass | All 23 hex literals in `style.css` sit inside the `:root` block (lines 7-45); zero hard-coded colours in components. `[hidden]` companions: all 9 M2-toggled elements map 1:1 to a rule (`.terminal-overlay`, `.sizenote`, `.tiles-view`, `.grid`, `.strip`, `.tools`, `.placeholder`, `.terminal-slot`, `#view-focus`). `tabular-nums` on `.sizenote`, `.tfoot`, `.thead .ctxinfo`, `.thead .tm`, `.card .timer`, `.railhead .n`. Segment controls use `--panel2`/`--paper` when pressed, never a state colour; `.tfoot .marker.live { --teal }` matches the reference render `d-tiled.html:117` verbatim |
| W7 | `surfaceDiff` is the only thing opening/closing sockets | pass | `new TerminalSurface(` appears once (`main.ts:309`, inside `diff.toOpen`); `dispose()` once (`main.ts:304`, inside `diff.toClose`) |
| E15 | INV-1/2/3 asserted from every source state in Named Invariants | pass | INV-1: no-prior-socket, same-page refocus, second context, mid-typing, **plus** a 2 ms `#{session_attached}` max-poll proving the ordering. INV-2: Focus, 2×2, 3×2, after view switch, after promotion, after a death — browser tracker **and** daemon-side `totalAttachedClients()` at each step. INV-3: both halves — unchanged width for strip sessions *and* `expect(after).not.toBe(baseline)` for a continuing-live tile |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/` only) | pass — `internal/claudecode/` and `ingest.go` both untouched; D4 grep clean |
| 2 | No terminal-output state parsing | pass — `capture-pane` absent from every code tree; state comes only from hooks + `PaneExists` |
| 3 | No blocking hook handler | pass — ingest untouched; registered hook timeout 2 s |
| 4 | tmux always via dedicated socket; `pty.Setsize` + `resize-window`, never `resize-pane` | pass — every exec goes through `socketFlag()`; the only `-L` is the default-socket branch and its unit test; D5 grep clean |
| 5 | No payload logging | pass — keystrokes are binary and never logged; the one text-frame log line is now capped at 200 bytes |
| 6 | No empty-gauge dishonesty | pass — `renderSizenote(null)` hides the line rather than rendering `0×0`; `ctx unknown` / `5h unknown` observed live |
| 7 | Session identity on the tmux target | pass — `muster-<id>:@<n>`; `session_id` untouched |
| 8 | No `~/.claude/settings.json` / `CLAUDE_CONFIG_DIR` | pass — only project-scoped `.claude/settings.local.json` |
| 9 | No real `claude` outside canary/probes | pass — stub only, in harness and Go tests; the sole `claude` exec is the pre-existing `--version` pin check |

## Manual Verification

Built `bin/musterd`, ran it on a scratch data dir with the harness's echo stub as
`-claude-bin` and a scratch-path `-tmux-socket`, launched **seven** sessions, and drove the
dashboard in Chromium at 1440×900. Every cycle-1 Critical was re-measured in the
configuration that originally exposed it.

**Cycle-1 Critical 1 (Tiles never refit) — fixed.** Focus showed sizenote `151×34 · one
live client · geometry owned by this pane` against `muster-1` at `151x34` (exact match).
Switching to Tiles refit all four live tiles to `95×12`, footers read `95×12`, and
`list-sessions` reported `muster-1..4` at `95x12` — geometry genuinely *moved* off
`151x34`. Density 2×2→3×2 refit every continuing tile to `63×12` with tmux agreeing on all
five. Cycle 1 measured a 119×34 grid stranded in a 597×311 tile with no tile refitting at
all; that is gone.

**Cycle-1 Critical 2 (tile untypeable after ~1 s) — fixed.** Clicked into repo3's tile,
waited **3.5 s** (past three full render ticks); `document.activeElement` was still that
tile's `xterm-helper-textarea`. Typed `REV` + Enter → `stub-echo:REV` appeared in
`muster-3` and nowhere else.

**Cycle-1 Critical 3 (`detach-on-destroy off` misrouted keystrokes) — fixed.**
`kill-session -t muster-4` with six other sessions on the socket: the client exited
cleanly, `list-clients` showed exactly three (one per remaining live tile) with **no hop**
onto another session, the repo4 tile rendered "session ended" with footer marker
`stopped`, and typing `Z`+Enter into the dead tile reached **no pane at all** (checked all
six survivors). Cycle 1's worst finding — prompts delivered to the wrong Claude Code — does
not reproduce.

**Cycle-1 Critical 4 (PTY/attach-client leak) — fixed.** Tiles→Focus tore down four attach
clients *immediately* (1 client, 1 process, measured at t+0). A rail-card refocus from
repo1 to repo6 on an idle pane left exactly one attach process at t+1 s, t+2 s and t+3 s.
Cycle 1 measured two processes persisting until output was forced into the stale pane.

**Cycle-1 Critical 5 (dead tile still `live`) — fixed.** repo4's footer read `stopped`
alongside the "session ended" overlay, while the three healthy tiles read `live`.

**Also confirmed by hand:**

- **INV-1 supersede + reclaim**: a second tab focusing repo6 left the first tab showing
  "live view opened in another window — click to take back" with exactly one attach client
  server-side; clicking the overlay reclaimed it (still one client, geometry back to
  151×34).
- **INV-3 negative half**: strip sessions never resized — `muster-5/6/7` sat at `80x24`
  through the Tiles switch, and `muster-7` stayed `80x24` through the density change.
- **REQ-4 options live**: `default-terminal tmux-256color`, `terminal-features[3]
  xterm-256color:RGB`, `escape-time 0`, `status off`, `window-size manual`, `mouse off`,
  `aggressive-resize off`, `destroy-unattached off`, **`detach-on-destroy on`**,
  `prefix None`, `prefix2 None`.
- **REQ-5**: the socket file was created at the given path (`-S` branch).
- **Degraded states**: SIGTERM tore down all attach clients while the seven tmux sessions
  survived (`destroy-unattached off` doing its job — claude keeps running); the UI showed
  the `musterd unreachable` banner, `reconnecting…`, and "disconnected — daemon down" on
  the terminal. After restart: banner hidden, `connected`, overlay cleared, density pref
  `3x2` still pressed, and a fresh `K` → `stub-echo:K` round trip.
- **Console**: only a favicon 404 (pre-existing) and the expected reconnect errors during
  the daemon-down window. No JS exceptions.

Everything in this section is a live observation. **Nothing was left running**: scratch
daemon killed, scratch tmux server killed, scratch dirs and `.playwright-mcp/` removed;
`pgrep -fl 'tmux attach-session'` and `pgrep -fl musterd` both exit 1, and
`/private/tmp/tmux-501/` is empty.

## Cycle-1 Issue Disposition

| Cycle-1 issue | Status | How verified |
|---|---|---|
| Critical 1 `[web-impl]` Tiles never refit | fixed | Live measurement (above) + `main.ts:238-255` inserts into the grid before `refit()` + E2E `expectTileGeometryMatchesTmux` at 3 source states |
| Critical 2 `[web-impl]` tile untypeable | fixed | Live 3.5 s focus-survival + round trip; `reconcileTilesGrid` updates in place, `bodySlot.replaceChildren` guarded; new E2E regression test |
| Critical 3 `[daemon-impl]` detach-on-destroy misroute | fixed | Live 7-session kill; `tmux.go:79` `detach-on-destroy on`; REQ-4 amendment recorded in plan.md; `destroy-unattached off` re-verified by measurement, not carried over |
| Critical 4 `[daemon-impl]` PTY teardown leak | fixed | Live refocus/view-switch measurements; `terminal.go:191-193` `cancel(); bridge.Close(); <-ptyDone`, with `ctx.Err()` guarding against a spurious 4001/Nudge; new Go test asserts teardown within 300 ms |
| Critical 5 `[web-impl]` dead tile says `live` | fixed | Live `stopped` marker; `tiles.ts:85` driven by `alive`, not geometry nullability; `tiles.test.ts` updated **and** extended with the alive/geometry cross-cases |
| Critical 6 `[e2e-specs]` INV-3 "moves" half unasserted | fixed | `helpers/terminal.ts:97-120` re-reads both sides inside the poll (a stale footer times out); `views.spec.ts:270` `expect(continuingAfterWidth).not.toBe(continuingBaselineWidth)` |
| Critical 7 `[daemon-tests]` single-session death only | fixed | 3 new tests: `TestAttach_KillingOneOfTwoSessionsNeverMisroutesTheClientToTheOther`, `TestHandleTerminal_KillingOneSessionAmongMultipleNeverMisroutesToAnother` (dying/survivor/bystander), `TestHandleTerminal_ClientInitiatedCloseTearsDownThePTYPromptly` |
| Major 1 `[daemon-impl]` takeover after attach | fixed | `terminal.go:65-81` — eviction and `attach()` both inside the registry lock, in that order; `TestHandleTerminal_TakeoverNeverLeavesTwoClientsAttachedAtOnce` polls `#{session_attached}` every 2 ms and asserts max ≤ 1 |
| Major 2 `[web-impl]` prefs failure swallowed | fixed | `main.ts:114-127` `reportPrefsFailure` on both call sites |
| Minors 1-7 | fixed | Sizenote reserved before first fit; `Attach` comment corrected; `closeAll` clears the map; marker text `live`/`stopped` per design-system §5; `Canvas`/`CanvasText` system-colour fallbacks; 200-byte log cap; daemon-side INV-2 oracle added |
| Minor 8 (tmux litter) | fixed | `/private/tmp/tmux-501/` empty after a full uncached Go suite and after `make e2e` |
| Minor 9 (plan defect) | fixed | REQ-4 amended in `plan.md:56-63` with the measurement that justified it; `destroy-unattached` re-examined and documented in `tmux.go:57-67` |

Spot-check of the repair claims: no `test.skip`, `test.fixme`, `.only`, or
container-level `toBeVisible()` substitution anywhere in `web/e2e` or `web/src`; the
`## Repairs` tables' "assertion still covers" column holds on inspection (repair 4 in
particular made INV-1 *stricter* by proving control bytes survive a takeover, and repair 7
replaced an accidental shared daemon with per-test isolation). No wire shape was invented —
REQ-14 reuses the pre-existing `rawPreCompact` fixture, and everything else drives the real
bridge against the real stub.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** `#view-switcher` has no `role="group"` / `aria-label`, while its sibling
   density control does (`web/index.html:13` vs `:45` `role="group" aria-label="Density"`).
   Both buttons are individually named and `aria-pressed` is correct, so this is polish,
   not a barrier — but the two segmented controls should be built the same way.
2. **[web-impl]** A dead tile's header chrome isn't dimmed the way its own rail/strip card
   is: `updateTileChrome` sets `root.className = \`tile ${vm.stateClass}\``
   (`web/src/render/tiles.ts:32`) and drops `vm.ended`, whereas
   `buildSessionCardElement` appends `" ended"` (`web/src/render/sessions.ts:28`, styled at
   `style.css:723`). Not a design-system §6 violation — the tile does say "session ended"
   and `stopped`, so nothing is asserted falsely, and the plan's States section scopes
   greying to strip/rail cards — but the same session rendering greyed in the strip and
   full-brightness in the grid is an odd seam.
3. **[daemon-impl]** `terminalRegistry.takeover` holds the single registry mutex across
   `attach()` (`internal/server/terminal.go:65-81`), which serializes PTY spawns across
   *all* sessions, not just the contended one. This is deliberate and correct for REQ-2 (and
   the doc comment explains why the simpler evict/register split was rejected), and entering
   Tiles at 3×2 attached all six tiles with no perceptible delay in my live run — but a
   per-session lock would give the same ordering guarantee without the global serialization.
   Worth a note for when tile counts grow.
4. **[e2e-specs]** E7's ⌘1 assertion (`web/e2e/views.spec.ts`) checks that the expected
   session's terminal region appears, but doesn't pair it with a `toHaveCount(0)` on the
   previously-focused one the way `terminal.spec.ts`'s rail-card-swap test does — so it
   would still pass if ⌘1 mounted a new surface without unmounting the old. INV-2 is
   asserted with exact counts elsewhere (E11), so nothing is actually uncovered.
5. **[e2e-specs]** The dead-session-focus test asserts `tracker.liveCount` is 0, which is a
   *net* gauge: a socket that opened and then closed also nets to zero. A cumulative
   "never opened" counter (or a `page.on('websocket')` assertion on total opens) would
   assert REQ-13's "no attach attempt" literally. D7's 409 test covers the server side.
6. **[e2e-specs]** E13 asserts the daemon-down banner with a bare
   `getByRole("alert")).toBeVisible()` — no text assertion, so any alert satisfies it.
7. No routing tag (doc staleness): `test-specs.md`'s `## Coverage` table still reflects the
   authoring pass — REQ-15's row reads "tile footer geometry **pattern**" and REQ-11's lists
   only E10, both of which its own `## Fix Attempt 1` superseded. The table, not the tests,
   is out of date.
8. No routing tag (observation, not a defect): a `-tmux-socket` path longer than AF_UNIX's
   ~104-byte `sun_path` limit fails inside tmux with "File name too long" rather than being
   rejected up front by the daemon. I hit this while setting up manual verification. The Go
   tests already document and design around it (`tmux_test.go:22-28`), and every real caller
   uses a short path, so this is a note for a future ergonomics pass, not something M2 should
   hold for.
