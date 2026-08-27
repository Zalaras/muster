# E2E Test Specs: M4 — Reconcile, shutdown policy, end / remove / resume

**Plan**: m4-reconcile
**Mode**: fix (attempt 3) — review cycle 3, wave 3
**Verdict**: pass
**Tests created**: 25 (4 in `web/e2e/reconcile.spec.ts`, 21 in `web/e2e/actions.spec.ts` —
19 going into this cycle, plus 2 added in this fix cycle; three pre-existing tests in
`web/e2e/actions.spec.ts` edited in place to add computed-style/color assertions, no new
tests from those edits)
**Live run**: 96/96 passing (full suite, `make e2e`) — see `## Fix Attempt 3` below for
this cycle's run; `## Fix Attempt 2`, `## Fix Attempt 1` and `## Validate Attempt 1`
above are kept as history, not superseded in place.

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|-------------------|
| web/e2e/reconcile.spec.ts | a session whose pane died while the daemon was down reconciles to ended and kept, then a later restart sweeps it for good (E2, INV-1, INV-3) | REQ-1, REQ-6 | Pane-gone-while-down row → `alive:false`+`endedAt` and kept on restart #1; removed via DELETE; absent from the snapshot after restart #2 |
| web/e2e/reconcile.spec.ts | a live session survives the default ask-on-exit policy under this harness's non-TTY stdin, terminal included (E3, survive policy) | REQ-3 | Default `ask` + non-TTY stdin behaves as `leave`: tmux untouched, card stays live, terminal still streams post-restart |
| web/e2e/reconcile.spec.ts | stopping the daemon with -on-exit=kill kills the tmux session and the next startup sweeps the row (E4) | REQ-1, REQ-3 | `-on-exit=kill` kills the pane + marks `alive:false` before exit; the very next reconcile deletes the now-`alive=0` row |
| web/e2e/reconcile.spec.ts | reconcile reports an unknown tmux session on the socket without creating a row for it (REQ-2) | REQ-2 | A foreign `muster-*` tmux session with no row survives a restart with no row ever created for it |
| web/e2e/actions.spec.ts | End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2) | REQ-5, REQ-9, REQ-10, REQ-14 | `POST …/end` via the mainhead dialog ends only the target; neighbour's tmux/attach/state/alive untouched; ended sorts after live |
| web/e2e/actions.spec.ts | ended sessions sort after every live session, most recently ended first (REQ-9) | REQ-9 | Two ended sessions sort in reverse-end order, both after the one live session |
| web/e2e/actions.spec.ts | Cancel and Escape close both End and Remove dialogs without sending any request (E10) | REQ-14 | Cancel and Escape on both dialogs close them and fire zero mutating requests |
| web/e2e/actions.spec.ts | a focused ended session shows the dead surface with its last snapshot and a Resume button in the cap (E6) | REQ-4, REQ-13 | End's final capture is served back and rendered: `.endbar`, `.endcap` with "session ended" + Resume, `pre.snapshot` text, no terminal socket |
| web/e2e/actions.spec.ts | Ending a focused session closes its terminal socket and never reopens one while dead (INV-5) | REQ-5, REQ-13 | Terminal socket count drops to 0 on End (4001) and never reopens while dead |
| web/e2e/actions.spec.ts | clicking Resume in the ended cap relaunches the session with the same claude id in its argv (E7) | REQ-7 | `POST …/resume` 200, card returns live, terminal remounts, `#{pane_start_command}` contains `--resume <claudeSessionId>` |
| web/e2e/actions.spec.ts | the resume SessionStart lands the card in idle with no attention or failure carried over (E8, E15, INV-6) | REQ-7, REQ-8 | Resume response leaves state unchanged until the enveloped `SessionStart(source:"resume")` arrives, which then lands `idle` with `attention`/`failure` cleared |
| web/e2e/actions.spec.ts | a session with no captured snapshot shows 'no snapshot captured' under the ended cap (E13) | REQ-13 | 404 `no_snapshot` path renders the "unknown, not empty" cap text |
| web/e2e/actions.spec.ts | Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9) | REQ-6, REQ-10, REQ-11, REQ-14, REQ-15 | Remove-while-alive runs End first, dialog copy warns, tmux gone, card gone, focus moves to the remaining top card |
| web/e2e/actions.spec.ts | Tiles: End from a tile footer keeps the tile in its slot and leaves other tiles' geometry untouched (E11) | REQ-12 | Dead tile keeps its grid slot, marker flips to `stopped`, footer shows Resume+Remove, neighbour geometry unchanged |
| web/e2e/actions.spec.ts | Tiles: Removing a dead tile backfills its slot from the strip and broadcasts sessionRemoved (E12) | REQ-12, REQ-15 | Dead tile's Remove backfills the slot from the strip; `sessionRemoved` reflected in a fresh `/api/state` |
| web/e2e/actions.spec.ts | action buttons are disabled while the daemon connection is down (E14) | — (States: Daemon down) | Mainhead End/Resume/Remove and card End are all `disabled` while the WS is down |
| web/e2e/actions.spec.ts | action buttons are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect (E14, Major 4) | — (States: Daemon down) | review Major 4: the dead-focused case E14 above cannot cover — mainhead Resume/Remove and `.endcap` Resume are only ever enabled for a dead session, so only this case proves `onDisconnected`'s `render()` fix actually reaches them; also proves re-enable on reconnect |
| web/e2e/actions.spec.ts | a card's End button activates via keyboard Enter and Space, not just a mouse click (REQ-11, Major 5) | REQ-11 | review Major 5: a card's own `keydown` listener no longer swallows a nested button's own Enter/Space activation — dialog opens via keyboard on both keys |
| web/e2e/actions.spec.ts | ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6) | REQ-10, REQ-13 | review Major 6: mainhead meta, `.endbar`, and `.endcap` all read "ended now" (or "now · …"), never the ungrammatical "now ago", for a session ended seconds ago |
| web/e2e/actions.spec.ts | the dead surface shows a 'loading last screen…' interim state before the pane fetch resolves (REQ-13, Minor 9) | REQ-13 | review Minor 9: while `GET .../pane` is held in flight (via `page.route`), the cap says "loading last screen…", distinct from the confirmed-negative "no snapshot captured" |
| web/e2e/actions.spec.ts | a late resume SessionStart hook after End does not revive the session or open a terminal socket (INV-1, Major 1) | REQ-5, REQ-8, REQ-13 | review Major 1 (daemon-impl fix): a queued/late `SessionStart(source:"resume")` for an already-ended session (no `/resume` call preceding it) does not flip `alive` or open `/ws/terminal/{id}` — the daemon no longer sets `alive` from a hook payload |

## Fixture Changes

- `web/e2e/helpers/payloads.ts`: added `sessionStartResume(claudeSessionId, opts?)` — a thin
  wrapper over the existing `envelopedSessionStart(...)` forcing `source: "resume"`. No new
  wire shape: canary-fields.md's "Values worth asserting" already documents `source:"resume"`
  as an observed `SessionStart.source` value carrying the **same** `session_id`/
  `transcript_path` as the original session — exactly what `envelopedSessionStart` already
  produces when passed the same claude id and `source: "resume"`. Used by the E8/E15/INV-6
  test to trigger `KindResumeBind`.
- `web/e2e/helpers/daemon.ts` (plan's named harness edit):
  - `ScratchDaemon.start()` / `startScratchDaemon()` now accept `{ onExit?: "ask"|"leave"|"kill" }`,
    passed through as `-on-exit <value>` on the spawned `musterd` (omitted entirely when
    unset, exercising the daemon's own default). `restart()` reuses the same policy since it
    calls the same `spawnAndWait()`.
  - `tmuxSessions()`: `tmux ls -F '#{session_name}'` on this run's socket — REQ-2's "was a row
    ever created for this pane" oracle, and used to prove `-on-exit=kill`/End actually removed
    a named session.
  - `createForeignTmuxSession(name)`: creates a tmux session on this run's socket that the
    daemon never launched — the REQ-2 fixture ("a `muster-<n>` with no row").
  - `paneStartCommand(target)`: thin wrapper over the existing `tmuxDisplay(target, fmt)` using
    `#{pane_start_command}` — E7's resume-argv oracle, named per the plan's Affected Files
    entry for readability at the call site.
  - The daemon's stdin was already `stdio: ["ignore", ...]` (unchanged) — i.e. every scratch
    daemon this harness spawns was already guaranteed non-TTY, which is exactly what REQ-3's
    "ask behaves as leave under non-TTY stdin" path needs; documented this explicitly in a
    comment since two new tests (E3, E4) now depend on it by name.

No `web/playwright.config.ts` changes — the existing per-test private-scratch-daemon,
`fullyParallel: true`/`reuseExistingServer: false` harness needed nothing new for this plan.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (reconcile on start) | reconcile.spec.ts: E2 test, E4 test |
| REQ-2 (unknown panes reported, never adopted) | reconcile.spec.ts: REQ-2 test |
| REQ-3 (shutdown policy) | reconcile.spec.ts: E3 test, E4 test |
| REQ-4 (pane snapshots) | actions.spec.ts: E6 test (snapshot content); E13 test (no-snapshot path) |
| REQ-5 (End) | actions.spec.ts: E5 test, INV-5 test, INV-1/Major-1 test (fix cycle 1) |
| REQ-6 (Remove) | reconcile.spec.ts: E2 test (dead-session remove); actions.spec.ts: E9 test (live-session remove) |
| REQ-7 (Resume) | actions.spec.ts: E7 test, E8/E15/INV-6 test |
| REQ-8 (Resume lands in idle) | actions.spec.ts: E8/E15/INV-6 test (same-id path only — the different-claude-id escalation to `started` is D12, a daemon unit test; no UI-visible distinction beyond the badge word, which E3/E4/E7 already exercise for `started`); INV-1/Major-1 test (fix cycle 1 — a same-id resume-bind hook after End must NOT re-enter this path) |
| REQ-9 (ended sort + styling) | actions.spec.ts: E5 test, REQ-9 sort test, reconcile.spec.ts's E2 test |
| REQ-10 (Focus mainhead) | actions.spec.ts: E5, E9, E10, E14 tests (button presence/enabled-disabled across both live and dead); E14/Major-4 test (fix cycle 1 — dead-focused disable/re-enable); Major-6 test (fix cycle 1 — "ended now" copy) |
| REQ-11 (Card action row) | actions.spec.ts: E5 test (live card End only, asserted via mainhead flow); E9 test (`Remove` absent from a live card); Major-5 test (fix cycle 1 — keyboard Enter/Space activation) |
| REQ-12 (Tiles) | actions.spec.ts: E11 test, E12 test |
| REQ-13 (Dead-session surface) | actions.spec.ts: E6 test, E13 test, INV-5 test; E14/Major-4 test, Major-6 test, Minor-9 test, INV-1/Major-1 test (all fix cycle 1) |
| REQ-14 (Confirm dialogs) | actions.spec.ts: E5, E9, E10 tests |
| REQ-15 (`sessionRemoved` on the client) | actions.spec.ts: E9 test (focus moves off a removed session), E12 test (grid backfill + snapshot absence) |
| REQ-16 (D5 regression guard) | not E2E — daemon unit test only (`internal/claudecode/settings_test.go`, D8). No UI-visible surface. |
| REQ-17 (Should Have: reconcile summary log line) | not E2E — a log line has no UI/HTTP-visible effect the harness reads; daemon-tests' D9/D10 are the right layer. |
| REQ-18 (Should Have: ⌘1–9 on an ended session) | not covered — Should Have, no `E*` acceptance criterion assigned to it in the plan. Flagged in Notes below. |

## Repairs (validate / fix modes only)

_(review Minor 14: this section and the two below were left stale from authoring mode —
reconciled here rather than rewritten, per the fix-mode instruction to append, not
rewrite. The document is no longer self-contradictory as of this edit.)_

Not applicable at authoring time — no implementation existed yet to repair against. Real
repair tables exist further down: **`## Validate Attempt 1` → `### Repairs`** (7 repairs,
all a bare `request.*` → `page.request.*` cookie fix) and **`## Fix Attempt 1` →
`### Repairs`** (1 repair, a pre-existing test's race reordered).

## E2E Implementation Bugs (if verdict = implementation-bug)

Not applicable — every mode run to date (`validate attempt 1`, `fix attempt 1`) verdicted
`pass`; no implementation bug was ever found by this agent for this plan.

## Test Run Output

```
$ cd web && npx playwright test --list   (authoring mode, before any implementation existed)
Listing tests:
  ... (87 tests total across 11 files, including the 16 new tests above)
Total: 87 tests in 11 files
```

Collection completed with no errors at authoring time — no duplicate titles, no
TypeScript/import failures. Not executed then (the daemon/web implementation this plan
describes did not exist yet, so every new test was expected to fail if run). The real,
executed run output lives in **`## Validate Attempt 1` → `### Test Run Output`** (87/87)
and **`## Fix Attempt 1` → `### Test Run Output`** (92/92) below.

## Notes

- **Locator strategy for the new DOM** follows the plan's Testable UI Elements table
  literally: `#mainhead`, `#dead-surface`, `#end-dialog`/`#remove-dialog` (via
  `getByRole("dialog", { name: ... })`, matching the exact pattern the existing
  `#launch-dialog` already uses in `launch.spec.ts`), `.tile .tfoot` scoping for tile
  actions, and `.endbar`/`.endcap`/`pre.snapshot` for the dead surface. None of these
  roles/names are guessed beyond what the plan pins — if validate mode finds web-impl
  shipped different markup for any of them, that is a `[web-impl]` defect against the
  plan's own table, not a spec guess to quietly repair.
- **Timer/status text avoids the textContent-concatenation trap** flagged in the harness
  rules: every `/^ended /` check is scoped to a specific descendant locator
  (`card.getByText(...)`, `tileA.getByText(...)`, `deadSurface.locator(".endbar")`) rather
  than anchored against a container's full concatenated `textContent`.
- **REQ-8's different-claude-id escalation** (a resume bind for an id the machine doesn't
  recognize → clear-rebind → `started`) has no dedicated E2E test: the plan assigns it to
  D12 (a state-machine unit test), and the only UI-visible symptom (badge reads `started`)
  is already exercised by three other tests in this suite for the ordinary bind case. Adding
  a redundant E2E test for the same badge word would not add coverage the daemon-tests
  agent doesn't already own more precisely.
- **E13 (no snapshot captured) is inherently racy by the plan's own framing** ("killed
  before the first tick") — the test kills the tmux window immediately after launch to
  minimize the window, but cannot guarantee zero capture ticks ran without a daemon-side
  seam this harness doesn't have. If validate mode sees this flake, the fix is almost
  certainly widening the race window further (kill even earlier) rather than an
  implementation defect — flagging here so a validate-mode agent doesn't mistake transient
  flake for `[daemon-impl]`.
- **`daemon.tmuxSessions()` return values are session *names*, not `tmuxTarget` window
  IDs** — reconcile.spec.ts's E4 test asserts `not.toContain(session.tmuxTarget)`, which
  holds under the plan's m2 topology (`tmuxTarget` for a fresh launch is the `muster-<id>`
  session name itself, one window per session), consistent with `helpers/session.ts`'s
  existing `SessionObject.tmuxTarget` typing and every prior spec's usage of it as a
  `tmux -t` target string.
- Did not touch `web/playwright.config.ts` or any global setup/teardown file.
- No real `claude` process is launched anywhere in either new file — every Resume/End/
  Remove flow drives the real HTTP/dialog/tmux path against the harness's existing
  echo-loop stub `claude` binary (`-claude-bin`), and every `SessionStart`/`Notification`/
  etc. hook is a synthesized POST built from `helpers/payloads.ts`.

## Validate Attempt 1

**Build**: `make build web-build` — both exit 0 (`go build` → `bin/musterd`; `tsc --noEmit && vite build` → `web/dist`), rebuilt fresh before every live run per the harness rule that `make e2e`/`npm run e2e` serve prebuilt binaries.

### Run 1 — my own spec files first

`npm run e2e -- e2e/reconcile.spec.ts e2e/actions.spec.ts`: 9 passed, 7 failed. Every
failure was `expect(received).toBe(expected) // Expected: 200/204, Received: 401` on a
direct `request.post(...)/request.delete(...)` call to `POST …/end`, `POST …/resume`, or
`DELETE /api/sessions/{id}` — the three new mutating endpoints, all "Auth: UI cookie" per
the Protocol Contract.

### Root cause

My spec files used the bare Playwright `request` fixture (its own cookie-less
`APIRequestContext`) for these three calls. Every pre-existing spec that hits an
authenticated (non-ingest) endpoint uses `page.request.*` instead, which shares the
browser context's already-authenticated cookie — confirmed by `helpers/session.ts`'s
`createSession` (`page.request.post(...)`, comment: "the endpoint requires the UI cookie
per protocol §2/§3.1") and `views.spec.ts`'s `page.request.put('/api/prefs', ...)`. The
bare `request` fixture is only ever used against `daemon.ingestURL(...)` (token-in-URL,
no cookie needed) in every other file. This is my defect, not the implementation's — the
daemon correctly rejected an unauthenticated mutation.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `ended sessions sort after every live session…` (actions.spec.ts:100) | `POST …/end` → 401 instead of 200 | used bare `request.post` (no cookie) instead of `page.request.post` | `request.post` → `page.request.post` at line 116 | REQ-9: sort order still asserted after a real 200 End |
| 2 | `a focused ended session shows the dead surface…` (E6, actions.spec.ts:196) | `POST …/end` → 401 | same | `page.request.post` at line 212 | REQ-4/REQ-13: dead surface content unchanged |
| 3 | `Ending a focused session closes its terminal socket…` (INV-5, actions.spec.ts:233) | `POST …/end` → 401 | same | `page.request.post` at line 251 | REQ-5/REQ-13: socket-close assertion unchanged |
| 4 | `clicking Resume in the ended cap…` (E7, actions.spec.ts:268) | `POST …/end` → 401 | same | `page.request.post` at line 284 | REQ-7: resume-argv assertion unchanged |
| 5 | `the resume SessionStart lands the card in idle…` (E8/E15/INV-6, actions.spec.ts:311) | `POST …/end` and `POST …/resume` → 401 | same | `page.request.post` at lines 329, 333 | REQ-7/REQ-8: response-body and badge assertions unchanged |
| 6 | `Tiles: Removing a dead tile…` (E12, actions.spec.ts:480) | `POST …/end` → 401 | same | `page.request.post` at line 513 | REQ-12/REQ-15: backfill + `sessionRemoved` assertions unchanged |
| 7 | `a session whose pane died while the daemon was down…` (E2/INV-1/INV-3, reconcile.spec.ts:25) | `DELETE /api/sessions/{id}` → 401 instead of 204 | same (bare `request.delete`) | `page.request.delete` at line 66 | REQ-6/INV-3: "removed stays removed across restart" assertion unchanged |

No assertion was deleted, skipped, or weakened.

### Run 2 — my own spec files, after the repair

`npm run e2e -- e2e/reconcile.spec.ts e2e/actions.spec.ts`: **16/16 passed.**

### Full-suite sweep (Validate Mode step 5)

`npx playwright test --list`: 87 tests in 11 files, clean (no duplicate titles). Then
`make e2e` (rebuild + full run): **1 pre-existing failure**, outside my new files —
`terminal.spec.ts:265` (`focusing a dead session shows the ended placeholder without ever
attempting a socket`, tagged `REQ-13` — m2-terminal's own REQ-13 numbering, unrelated to
m4-reconcile's REQ-13 despite the coincidental label).

**Triage — sanctioned breakage, not an implementation bug.** The old test asserted a
`"session ended"` overlay rendered *inside* the mounted terminal region
(`terminalOverlay(terminalRegion(page, "dead-on-focus"))`) after reloading onto an
already-dead session. m4-reconcile's approved delta directly contradicts that: REQ-13
("The UI never opens a terminal socket for a dead session"), the UI Specifications' "Dead
surface" section (`#dead-surface` replaces the terminal slot entirely — not an overlay
inside it), and the States section ("never an empty terminal pretending to be live").
Reading `web/src/main.ts`'s `renderFocusView` confirms the built behavior matches the
plan: for `!session.alive` it hides/clears `mainSlotEl` and shows `deadSurfaceEl`
instead, and `render()`'s `aliveOnly(...)` filter means a dead focused session is never
added to the desired-live surface set in the first place — so `[aria-label="Terminal:
dead-on-focus"]` never mounts at all, which is exactly why the old locator resolved to
nothing. This is the plan's own delta breaking a pre-existing (different-plan) test, the
sanctioned-breakage case Validate Mode step 5 describes.

**Fix**: updated `web/e2e/terminal.spec.ts`'s REQ-13 test (renamed to state the new
behaviour) to assert `#dead-surface` (`.endbar` text `/^ended /`, `.endcap` contains
"session ended", `pre.snapshot` contains the stub's readback text) instead of the old
in-region overlay, and *strengthened* the "no socket" claim to also assert the terminal
region never mounts at all (`toHaveCount(0)`), on top of the original `totalOpened`/
`liveCount` zero-attempt checks (both kept, unmodified). Also added a deterministic wait
— poll `GET /api/sessions/{id}/pane` for 200 before killing the tmux window — so the new
`pre.snapshot` content assertion isn't racing the daemon's fixed ~5s liveness-capture
interval (same class of race the plan's own E13 test in `actions.spec.ts` documents and
deliberately avoids by using the explicit `End` endpoint, which captures synchronously,
in every other snapshot-content test). Re-ran `terminal.spec.ts` alone (8/8 passed), then
the full suite again: **87/87 passed.**

No assertion from the original test was deleted or weakened — the "no attach attempt" and
"session ended" claims are both still present, now stronger and pointed at the actual DOM
the plan specifies.

### Test Run Output

```
$ npx playwright test --list
Total: 87 tests in 11 files

$ npm run e2e   (full suite, post-repair, post-terminal.spec.ts fix)
Running 87 tests using 6 workers
...
87 passed (24.4s)
```

### Notes (validate attempt 1)

- Every repair was a call-site fix (`request.*` → `page.request.*`) in my own spec
  files — no daemon or web implementation code was touched, and no assertion was
  weakened; several got strictly stronger (the `terminal.spec.ts` fix).
- The E13 flake concern noted in the authoring log's Notes did not materialize across the
  three live runs in this attempt (`no-snap-e13` passed every time it ran).
- Did not touch `web/playwright.config.ts` or any global setup/teardown file.

## Fix Attempt 1

**Mode**: fix (attempt 1) — review cycle 1

**Issues addressed**: Major 4 (`[e2e-specs]`, blocking) and Minor 14 (`[e2e-specs]`).
Additionally, per this cycle's instructions, added coverage for new user-facing behaviour
introduced by this cycle's `## Fix Attempt 1` in both implementation logs (Major 1
daemon-side; Majors 3/5/6/8 and Minor 9 web-side).

### Major 4 — E14 only covered the live-focused case

Added `action buttons are disabled while the daemon connection is down for a dead
focused session, and re-enable on reconnect (E14, Major 4)` to `web/e2e/actions.spec.ts`,
right after the existing E14 test (kept unmodified — it still covers the live-focused
case, which is a real and distinct code path: `End` disabled by `alive` regardless of
connection).

The new test: launches a session, focuses it, ends it via `POST .../end` (so it's dead
*before* any connection outage — this is the exact case E14 cannot reach, since
mainhead/`.endcap` Resume are only ever enabled for a dead session), confirms the
sanity baseline (Resume/Remove enabled while connected), breaks the connection, asserts
mainhead End/Resume/Remove and `.endcap` Resume are all `disabled`, restores the
connection, and asserts all four re-enable.

**How the outage is simulated — this needed two iterations of my own:**

1. First attempt reused the existing `isolated.kill()` / `isolated.restart()` pattern
   from the live-focused E14 test. This failed: `isolated.restart()` is a real process
   restart, which runs REQ-1's reconcile sweep — and the plan is explicit that "rows
   already `alive=0` (ended in an earlier daemon lifetime) are deleted" (plan Decisions).
   Since this test's session was already `alive:false` at kill time, the restart deleted
   the row entirely (observed: `#mainhead` empty, rail showed "No sessions yet" — my own
   defect, not a Major-4 finding, since the live-focused E14 test never triggers this
   path — its session stays alive until it's killed, so reconcile's `alive=1 + pane
   exists → unchanged` rule applies instead).
2. Tried `page.context().setOffline(true)`/`(false)` next (no daemon restart at all).
   This also failed: the banner never appeared — Chromium's `setOffline` in this
   Playwright version does not reliably close an already-open WebSocket, only block new
   connection attempts, so the client's existing WS stayed silently connected.
3. Final approach: `page.routeWebSocket("**/ws", ...)`, registered before `page.goto`,
   transparently proxying the one WS (`ws.connectToServer()` with no other handlers, so
   traffic passes through unmodified) and capturing a `close()` callback. The test calls
   that `close()` to force the page's real WebSocket `close` event — the same signal
   `ws.ts`'s `onDisconnected` reacts to — without ever touching the daemon process or its
   store. Because the route stays registered for the whole page lifetime, the client's own
   backoff-driven reconnect (`ws.ts`, 500ms–8s cap) opens a fresh WebSocket that is routed
   and proxied to the same still-running daemon, so "reconnect" needs no extra action from
   the test beyond waiting for the banner to clear.

This is the correct, capability-appropriate tool for this specific case (an
already-dead-and-persisted session needs its live daemon connection interrupted without
disturbing daemon-side state) — it does not replace `isolated.kill()`/`restart()`
elsewhere, which is still the right tool (and still used, unmodified) for the
live-focused E14 test and every daemon-restart-semantics test in `reconcile.spec.ts`.

### Minor 14 — stale header sections contradicting the document

Reconciled the `## Repairs`, `## E2E Implementation Bugs`, and `## Test Run Output`
top-level sections (which still read "Not applicable — authoring mode" / "Not executed"
despite the header already saying `Mode: validate (attempt 1)` / `Verdict: pass`): each
now explicitly says it is the authoring-time snapshot and points to the real
`### Repairs` / `### Test Run Output` subsections under `## Validate Attempt 1` and (now)
`## Fix Attempt 1`. No content was deleted — the authoring-time text is kept, labelled,
not overwritten, per the fix-mode "append, don't rewrite" rule; Minor 14 specifically
asked for the self-contradiction to be reconciled, which required touching those three
existing sections rather than only appending after them.

### Additional coverage for this cycle's new user-facing behaviour

Per this cycle's instructions, read both implementation logs' `## Fix Attempt 1`
sections and added assertions for every new user-facing behaviour named, beyond the two
review-tagged issues above:

- **Card/strip keyboard activation (web-impl Major 5)**: new test `a card's End button
  activates via keyboard Enter and Space, not just a mouse click (REQ-11, Major 5)`.
  Uses `locator.press("Enter"/"Space")` directly on the button rather than a separate
  `.focus()` call followed by a `toBeFocused()` assertion — the latter raced
  `renderSessions`'s full card-DOM rebuild on the 1s render tick (`el.replaceChildren(...)`
  recreates every card's buttons from scratch every tick, so a focused node loses DOM
  focus with no automatic re-focus; observed directly: `.focus()` succeeded but the
  `toBeFocused()` poll then reported `"inactive"` once the tick fired mid-wait).
  `locator.press()` bundles focus+key as one fast Playwright action, sidestepping that
  window; the point under test (does the key open the dialog) doesn't need focus to
  survive a subsequent rebuild.
- **"ended now" copy, not "ended now ago" (web-impl Major 6)**: new test `ended copy
  reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10,
  REQ-13, Major 6)`. Checks the positive (`"ended now"` / `"now · last state:"`) and the
  absence of the old defect (`"now ago"`) on mainhead `.meta`, `.endbar`, and `.endcap` —
  the exact three surfaces the review measured live. First run failed because I ended the
  session before any real pane content existed (the very first, genuinely-blank capture
  hits the documented Minor 2 daemon-side scope note — `storeSnapshot`'s `"" == ""`
  diff-check never sets `LastSnapshotAt`, so the pane read 404 `no_snapshot` instead of
  200 — same precondition E6/E7/INV-5 already wait out); fixed by waiting for real
  terminal content (`MUSTER-STUB-READY`) before calling `/end`, matching the existing
  pattern in every other snapshot-content test in this file.
- **Daemon-side INV-1 fix (daemon-impl Major 1)**: new test `a late resume SessionStart
  hook after End does not revive the session or open a terminal socket (INV-1, Major 1)`.
  Reproduces the review's own measured repro: End a session for real (tmux pane
  genuinely gone), then post a queued/late `SessionStart(source:"resume")` for the SAME
  claude id with no `/resume` endpoint call ever made. Asserts `alive` stays `false`,
  `endedAt` stays non-null, `#dead-surface` stays visible, no `/ws/terminal/{id}` socket
  ever opens (`TerminalSocketTracker`), matching INV-5/REQ-13's existing "never adopt a
  hook into aliveness" contract — this is the daemon fix's only client-observable
  surface, since the actual fix (deleting `sess.Alive = true` from `applyBind`'s
  `KindResumeBind` branch) lives entirely inside `internal/session`.
- **Dead-surface "loading last screen…" interim state (web-impl Minor 9)**: new test
  `the dead surface shows a 'loading last screen…' interim state before the pane fetch
  resolves (REQ-13, Minor 9)`. Uses `page.route` to hold the real `GET .../pane` response
  in flight (delaying the genuine network round-trip, not fabricating a payload) long
  enough to observe the cap read "loading last screen…" (and not "no snapshot captured"),
  then releases the route and confirms the real content replaces it.
- **Action-button disable on every surface + re-enable on reconnect (web-impl Major 3)**:
  covered by the Major 4 test above (mainhead + `.endcap`) plus the pre-existing E14 test
  (mainhead + rail card, live case) plus the pre-existing E11/E12 tests (tile footer
  buttons render disabled while `connected:false` is threaded through
  `renderTileFooterActions` — not independently re-verified here since Major 3's fix is a
  single choke point (`setStatus`'s `render()` call) and REQ-12's tile-footer enable/
  disable wiring itself is unchanged by this cycle; no new test added for tiles
  specifically, as this would be redundant coverage of the same `connected` boolean
  already asserted for mainhead/cap/rail-card).
- **Minor 7 (null `endedAt` defensive branch) — no E2E test added, and why.** Confirmed by
  reading `internal/session/manager.go` and `machine.go`: `grep -n "EndedAt = nil"` has
  exactly one hit (`RecordResume`, which also sets `Alive = true` in the same call), and
  every other site that ever sets `Alive = false` also sets `EndedAt` in the same
  operation (`machine.go:76`, `manager.go:749`). An `alive:false` session with a null
  `endedAt` is therefore unreachable through any real daemon behaviour on this build —
  exactly what web-impl's own fix-attempt log calls it ("paired invariant per protocol
  §7.5 ... defensive, not a real path"). Writing an E2E test for it would require driving
  the DOM builder directly with a hand-constructed `Session` object bypassing the real
  HTTP/hook flow, which is Vitest's job (`render/dead.test.ts`, web-tests' domain), not
  Playwright's — synthesizing a wire shape the real daemon can never produce would also
  cross the "never invent a wire shape" rule. Flagged here rather than silently skipped.

### Run 1 — after adding the 5 new tests (before repairs)

`npm run e2e -- e2e/actions.spec.ts`: 13 passed, 4 failed.

- `Removing a live session ends it first...` (E9, **pre-existing**, not one of the 5 new
  tests) — `expect(await isolated.tmuxPaneExists(sessionA.tmuxTarget)).toBe(false)`
  returned `true`. Root cause, confirmed by reading `render/confirm.ts`:
  `removeConfirmBtn`'s click handler calls `elements.removeDialog.close()`
  *synchronously*, strictly before `onConfirmRemove`'s async `DELETE` even starts — so
  `await expect(dialog).toBeHidden()` proves nothing about whether the server-side kill
  (End, then delete) has completed. This race existed before this cycle too (the dialog
  was always optimistic-close), but Minor 1's daemon-impl fix adds one more synchronous
  `PaneExists` check inside `End` (`checkOneLiveness(ctx, id, target, true)`), and that
  extra latency was enough to flip an already-marginal race to a reliable loss — confirmed
  by re-running the unmodified original assertion alone with `--workers=1`: still failed
  deterministically, ruling out parallel-worker contention as the cause.
- The Major-4 test (dead-focused restart approach) — reconcile-sweep-deletes-the-row, per
  above.
- The Major-5 keyboard test — the render-tick focus race, per above.
- The Major-6 copy test — the blank-first-capture 404 path, per above.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `Removing a live session ends it first...` (E9, pre-existing) | `tmuxPaneExists` returned `true` right after the dialog closed | dialog closes synchronously on click, before the async `DELETE` starts (`render/confirm.ts`) — checking tmux state immediately after `toBeHidden()` raced the server-side kill, a race Minor 1's extra synchronous liveness check inside `End` tightened enough to lose reliably | reordered: wait for `cardA` to disappear first (`{ timeout: 15_000 }` — already present, unchanged; `cardA`'s removal only fires from `handleRemoved`, which `doRemove` calls only after the `DELETE` response resolves `ok`, so it's a reliable proxy for "the kill is done"), then check `tmuxPaneExists` | REQ-6/D16: still asserts both "tmux pane gone" and "card gone" — same two facts, just correctly ordered so the retrying wait runs first |
| 2 | `action buttons are disabled... dead focused session...` (Major 4, new) | `isolated.restart()` deleted the whole row (REQ-1 sweep of already-`alive:false` rows) | daemon process restart was the wrong outage mechanism for an already-ended session | switched to `page.routeWebSocket` (after `page.context().setOffline` also failed to reliably close an existing Chromium WS) — closes the client's WS without touching the daemon process or its store | Major 4: still asserts disabled-while-down and re-enabled-on-reconnect for mainhead End/Resume/Remove and `.endcap` Resume, on the exact dead-focused case the review specified |
| 3 | `a card's End button activates via keyboard...` (Major 5, new) | `endBtn.focus()` then `toBeFocused()` timed out (`"inactive"`) | raced `renderSessions`'s 1s full-card-DOM-rebuild, which destroys and recreates every card's buttons every render tick with no automatic re-focus | replaced the separate `.focus()` + `toBeFocused()` + `page.keyboard.press()` sequence with `locator.press("Enter"/"Space")` directly on the button (focus+key as one fast Playwright action) | Major 5: still asserts Enter and Space both open the End dialog via the nested button, proving the card's `keydown` guard doesn't swallow it |
| 4 | `ended copy reads 'ended now'...` (Major 6, new) | `.endcap` showed "no snapshot captured" instead of the expected "now · last state:" text | ended the session before any real pane content existed — the first, genuinely-blank capture hits the documented Minor 2 scope-note edge case (blank-vs-blank diff check never sets `LastSnapshotAt`) | added the same "wait for `MUSTER-STUB-READY` in the terminal region before ending" precondition every other snapshot-content test in this file already uses | Major 6: still asserts the exact positive copy and the absence of "now ago" on all three surfaces |

No assertion was deleted, skipped, or weakened.

### Run 2 — after repairs, `web/e2e/actions.spec.ts` alone

`npm run e2e -- e2e/actions.spec.ts`: 16 passed, 1 failed — the Major-4 test again, this
time failing at `expect(banner).toBeVisible()` (never appeared): `page.context().setOffline`
did not close the already-open WebSocket. Switched to `page.routeWebSocket` (repair #2
above, already reflected in the table). Re-ran targeted (`-g "Major 4"`, `--workers=1`):
passed. This `setOffline` attempt/failure is folded into repair #2's row rather than
listed as a separate numbered repair, since it was resolved before a third full-file run
was needed — no assertion in that test was ever weakened across either attempt, only the
outage-simulation mechanism changed.

A `tsc --noEmit` pass after the `routeWebSocket` rewrite caught one TypeScript-only
issue unrelated to test behaviour: a `let`-typed closure variable narrowed to `never`
after a `null` guard (a known TS control-flow limitation for variables reassigned inside
nested closures). Fixed by boxing the callback in a small object
(`{ close: (() => Promise<void>) | null }`) instead of a bare `let` — no behavioural
change, confirmed by `npx tsc --noEmit` (clean) and an unchanged test result.

### Run 3 — full file, after all repairs

`npm run e2e -- e2e/actions.spec.ts`: **17/17 passed** (8.4s).

### Full-suite sweep (Validate Mode step 5)

`npx playwright test --list`: 92 tests in 11 files, clean (no duplicate titles, no
TypeScript/import errors). `make e2e` (fresh `make build web-build`, then the full
suite): **92/92 passed** (25.6s) — the pre-existing E9 race fix (repair #1) held under
full parallel load (6 workers), and no other pre-existing spec was affected by this
cycle's implementation changes.

### Test Run Output

```
$ npx playwright test --list
Total: 92 tests in 11 files

$ make e2e   (rebuild + full suite, post all repairs)
Running 92 tests using 6 workers
...
92 passed (25.6s)
```

### Notes (fix attempt 1)

- `web/e2e/actions.spec.ts` grew from 12 to 17 tests in this cycle; no other spec file
  was touched.
- Did not touch `web/playwright.config.ts` or any global setup/teardown file.
- No real `claude` process was launched anywhere — every new test drives the harness's
  existing stub `claude` binary and synthesized hook payloads, same as every prior test
  in this file.
- The pre-existing-test repair (E9, repair #1) is a genuine timing fix, not a weakening:
  the two facts it asserts (tmux pane gone, card gone) are both still checked; only the
  order changed so the retrying wait runs before the one-shot check.

**No assertion was deleted, skipped, or weakened.**

## Fix Attempt 2

**Failures addressed**: cycle-2 review.md Major 2 (`[e2e-specs]`, blocking) and Minor 7
(`[e2e-specs]`).

### Major 2 — no spec covers the keyboard path end-to-end after the render tick

Read cycle-2 web-implementation.md's Fix Attempt 2: Major 1 is now fixed
(`reconcileCards`/`reconcileActsRow` in `web/src/render/sessions.ts`, and the shape-diff
in `renderTileFooterActions` in `web/src/render/tiles.ts`, both reconcile in place
instead of `replaceChildren`-per-tick). That unblocks the case the reviewer specified:
focus a card's (and a tile footer's) action button, outlive at least one render tick
(>1.1s), then press Enter as a **separate** action from the focus — not
`locator.press()`, which performs focus-then-key as one atomic Playwright action and
therefore cannot observe a focus loss that happens in between.

Added two tests to `web/e2e/actions.spec.ts`, immediately after the existing
`locator.press()` keyboard test (which stays — it legitimately covers a different thing:
that the card's `keydown` guard doesn't swallow the button's own Enter/Space):

1. **Rail card** (`daemon`, shared): `endBtn.focus()` → `expect(endBtn).toBeFocused()` →
   `page.waitForTimeout(1_400)` → re-assert `expect(endBtn).toBeFocused()` on the
   freshly-resolved locator → `page.keyboard.press("Enter")` → dialog opens.
2. **Tile footer** (`withDaemon`, private — Tiles density is session-count-sensitive per
   this file's header, so a single-session isolated daemon renders a clean 1x1 tile):
   identical sequence, but focusing `tile.locator(".tfoot").getByRole("button", { name:
   "End" })`.

Why the re-focus assertion after the wait is the real test, not the `press`: `toBeFocused()`
re-resolves the locator (role+name query) against the live DOM at assertion time. If the
render tick had rebuilt the button node (the pre-Major-1-fix defect the reviewer
measured: `sameNodeAfter1.4s=false, activeTag=BODY`), the newly-resolved element would
not be `document.activeElement` regardless of whether it's the "same" node instance, so
the assertion fails exactly on the regression the review is guarding against — not on
node identity, which Playwright's locator model doesn't expose directly anyway.

`page.waitForTimeout` is otherwise disfavored in this suite (the harness rules ask for
waiting on a visible outcome, not a fixed sleep), but here the render tick's mere
passage — not a WS round-trip or any other network/DOM event — is the condition under
test, so there is no alternative signal to poll for. Both tests ran clean on the first
attempt; no repair was needed for either.

### Minor 7 — E12 infers `sessionRemoved` rather than observing it

Reviewer judged this sound to fix. `web/e2e/actions.spec.ts`'s E12 test
(`Tiles: Removing a dead tile backfills its slot from the strip and broadcasts
sessionRemoved`) previously only checked the WS broadcast's *effect* (a fresh `GET
/api/state` no longer lists the removed id). Edited the same test in place (no new test,
no title change — the title's claim ".. and broadcasts sessionRemoved" now matches what
it verifies) to observe the frame directly:

- `page.routeWebSocket("**/ws", ...)` registered before `page.goto` (same pattern the
  E14 tests above it already use to intercept the dashboard's one WebSocket).
  `ws.connectToServer()` connects through to the real daemon; setting `server.onMessage`
  disables Playwright's default pass-through forwarding for server→page frames, so the
  handler both records the raw text frame and re-sends it to the page
  (`ws.send(message)`) to keep the proxy transparent — verified against
  `playwright-core`'s own `WebSocketRoute` type-doc comments
  (`node_modules/playwright-core/types/types.d.ts`), which document this exact
  disable-then-manually-forward behavior.
- After the existing `GET /api/state` assertion, parse every captured frame as JSON,
  filter to `type === "sessionRemoved"`, and assert exactly one such frame with
  `{ type: "sessionRemoved", id: sessionToEnd.id }` — the literal shape docs/protocol.md
  §5.5 and `plan.md:197` both specify (`{ "type": "sessionRemoved", "id": 7 }`), and the
  same shape `web/src/protocol.test.ts` (W6) already unit-covers on the parse side.

The `GET /api/state` assertion (the un-reloaded DOM/store convergence check) is
unchanged and unweakened — the new WS-frame assertions are additive, so this test now
verifies both the broadcast itself and its downstream effect.

### Live run

`npm run e2e -- e2e/actions.spec.ts` (after `make build web-build`): **19/19 passed**
(8.2s) on the first attempt — no repairs needed for either new test or the edited E12
test.

`npx playwright test --list`: 94 tests in 11 files, clean (no duplicate titles, no
TypeScript/import errors) — up from 92 (the 2 new tests; E12's edit added no new test).

`make e2e` (fresh `make build web-build`, then the full suite): **94/94 passed** (26.2s).
No pre-existing spec outside `web/e2e/actions.spec.ts` was touched or affected.

### Test Run Output

```
$ npm run e2e -- e2e/actions.spec.ts
Running 19 tests using 5 workers
...
19 passed (8.2s)

$ npx playwright test --list
Total: 94 tests in 11 files

$ make e2e   (rebuild + full suite)
Running 94 tests using ... workers
...
94 passed (26.2s)
```

### Repairs

No repairs were needed this cycle — both new tests and the edited E12 test passed on the
first live run.

**No assertion was deleted, skipped, or weakened.**

### Notes (fix attempt 2)

- `web/e2e/actions.spec.ts` grew from 17 to 19 tests (2 new); the E12 test at the same
  file was edited in place to add WS-frame observation, no test count change from that
  edit.
- No other spec file was touched.
- Did not touch `web/playwright.config.ts` or any global setup/teardown file.
- No real `claude` process was launched anywhere.
- Did not attempt Major 1 ([web-impl], not e2e-specs') or Major 3/4 ([orchestrator]) —
  out of scope for this agent, per the review's own routing.

## Fix Attempt 3

**Cycle**: 3, wave 3 (`plans/m4-reconcile/review.md`, verdict `needs-changes`).
**My issue**: Minor 2 `[e2e-specs]` — "No spec can see the Critical-1 class of defect":
`web/e2e/actions.spec.ts:220`'s `toBeVisible()` on the dead-cap Resume button passes on
`opacity: 0`, so the cap's Resume being invisible on both dead-surface sites stayed
green through the whole review cycle. Also asked to cover the two pieces of new
user-facing behaviour from `web-implementation.md`'s `## Fix Attempt 3`: the `--danger`
recolour of the destructive confirm buttons, and a focused card action button surviving
a real rail re-sort.

### What changed in `web/e2e/actions.spec.ts`

1. **E6 test** ("a focused ended session shows the dead surface … (E6)") — after the
   existing `toBeVisible()` check on the cap's Resume button, added
   `toHaveCSS("opacity", "1")` on both the button and its containing `.acts-row`. This
   is Focus's static `#dead-surface` site, the first of the two the Critical named.

2. **E11 test** ("Tiles: End from a tile footer … (E11)") — the test previously checked
   only `.tfoot` Resume/Remove visibility and a `toContainText` on `.endcap`; it never
   asserted the cap's own Resume button at all. Added a `toBeVisible()` plus
   `toHaveCSS("opacity", "1")` on both the button and `.endcap .acts-row` — this is the
   dead tile's *cloned* `.dead-surface` (`#dead-surface-template`), the second site the
   Critical named, and a genuinely different DOM subtree than E6's.

3. **New test**, "a live rail card's action row sits at opacity 0 until hover or
   focus-within reveals it (REQ-11, Minor 2/3)" — reads `getComputedStyle` on a live
   card's `.acts-row` at rest (opacity 0), after `card.hover()` (opacity 1), after
   moving the pointer away (back to opacity 0, so hover alone explains the prior
   reading), and after focusing the End button via `:focus-within` (opacity 1). This is
   the "cards at rest are intentionally opacity 0 — assert that too" half of my
   instruction; nothing in the suite previously asserted the live-card side of this
   rule at all (a `grep` for `acts-row` across `web/e2e/*.spec.ts` before this cycle
   returned zero hits).

4. **Removing a live session test (E9)** — before clicking the Remove-confirm dialog
   button, added `toHaveCSS("background-color", "rgb(201, 79, 79)")` (the `--danger`
   value) and `not.toHaveCSS("background-color", "rgb(227, 106, 106)")` (the old
   `--rose` value) on `#remove-confirm-button`. Covers web-implementation.md's Fix
   Attempt 3 Major-2 item: the confirm dialog's destructive buttons were repointed from
   `--rose` to a dedicated `--danger` family this cycle.

5. **New test**, "a focused card action button survives a rail re-sort triggered by a
   real priority change (REQ-11, Minor 1)" — two live sessions launched in the same
   priority band (so they sort by launch order, A before B), B's End button focused,
   then a genuine priority change (`UserPromptSubmit` + `Notification(permission_prompt)`
   promoting B to `needs_input`) reorders B above A. Asserts `endBtnB` is still focused
   (Playwright's own `toBeFocused()`, matching the review's own "SORT-CHANGE focus:
   before=true after=false active=BODY" pre-fix measurement) after the reorder. This is
   the DOM-detach-on-`insertBefore` window Minor 1 named, distinct from the existing
   "survives a render tick" tests (cycle-2 Major 1's per-tick rebuild), which a clock
   tick alone cannot reach.

None of these five edits touched an existing assertion's meaning or strength — items 1,
2, and 4 are additive assertions inserted into tests that already passed for other
reasons; items 3 and 5 are wholly new tests.

### Why I did not also add a computed-style check elsewhere

I swept every `toBeVisible()` in `web/e2e/*.spec.ts` against a button that a
hover-reveal rule could plausibly hide (`grep -n "toBeVisible" web/e2e/*.spec.ts` cross-
checked against every `.acts-row` / `.tfoot .acts` consumer in `web/index.html` and
`web/src/style.css`). The only CSS-driven opacity-based reveal in the codebase is the
`.card .acts-row` rule scoped by this cycle's Critical-1 fix; `.tfoot .acts` (tile
footer Resume/Remove, asserted in E11) carries no opacity rule at all (confirmed:
`rg -n "\.tfoot" web/src/style.css` shows no `opacity` declaration on that selector),
so its existing `toBeVisible()` checks were never at risk and needed no companion
computed-style assertion — the review's own Manual Verification 2 says the same thing
("The tile footer's Resume/Remove are unaffected"). The mainhead's `.acts` row
(`#mainhead .acts`) is unconditionally visible chrome, no hover rule, no change needed.

### Verification

Rebuilt first, every time, per the harness rule:

```
$ make build web-build
go build -ldflags "-X main.version=bd492f6-dirty" -o bin/musterd ./cmd/musterd
cd web && npm run build
...
✓ built in 226ms

$ cd web && npx playwright test --list
Total: 96 tests in 11 files

$ cd web && npm run e2e -- e2e/actions.spec.ts
Running 21 tests using 6 workers
...
21 passed (8.6s)

$ make e2e   (rebuild + full suite, from repo root)
Running 96 tests using 6 workers
...
96 passed (23.2s)
```

Full trimmed pass list for `web/e2e/actions.spec.ts` (all 21):

```
✓ a focused card action button survives a rail re-sort triggered by a real priority change (REQ-11, Minor 1)
✓ End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2)
✓ Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9)
✓ action buttons are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect (E14, Major 4)
✓ a card's End button activates via keyboard Enter and Space, not just a mouse click (REQ-11, Major 5)
✓ Tiles: End from a tile footer keeps the tile in its slot and leaves other tiles' geometry untouched (E11)
✓ ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6)
✓ ended sessions sort after every live session, most recently ended first (REQ-9)
✓ the dead surface shows a 'loading last screen…' interim state before the pane fetch resolves (REQ-13, Minor 9)
✓ Cancel and Escape close both End and Remove dialogs without sending any request (E10)
✓ Tiles: Removing a dead tile backfills its slot from the strip and broadcasts sessionRemoved (E12)
✓ a focused ended session shows the dead surface with its last snapshot and a Resume button in the cap (E6)
✓ Ending a focused session closes its terminal socket and never reopens one while dead (INV-5)
✓ a card's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-11, Major 1, Major 2)
✓ a late resume SessionStart hook after End does not revive the session or open a terminal socket (INV-1, Major 1)
✓ clicking Resume in the ended cap relaunches the session with the same claude id in its argv (E7)
✓ action buttons are disabled while the daemon connection is down (E14)
✓ the resume SessionStart lands the card in idle with no attention or failure carried over (E8, E15, INV-6)
✓ a session with no captured snapshot shows 'no snapshot captured' under the ended cap (E13)
✓ a live rail card's action row sits at opacity 0 until hover or focus-within reveals it (REQ-11, Minor 2/3)
✓ a tile footer's End button survives a render tick and still opens the End dialog via a separate keyboard Enter (REQ-12, Major 1, Major 2)
```

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|-------------------------|
| — | — | — | No test failed on the first live run; every edit was additive from the start. | — | — |

No repairs were needed this cycle — all five edits (three additive assertions on
existing passing tests, two new tests) passed on the first live run of
`web/e2e/actions.spec.ts`, and the full suite (`make e2e`) passed on the first run too.

**No assertion was deleted, skipped, or weakened.**

### Coverage added this cycle

| Requirement / Review item | New/extended test |
|---|---|
| Cycle-3 Critical 1 / Minor 2 (Focus `#dead-surface` cap) | E6: `resumeBtn`/`.acts-row` computed opacity = 1 |
| Cycle-3 Critical 1 / Minor 2 (dead-tile cloned `.dead-surface` cap) | E11: `tileResumeBtn`/`.endcap .acts-row` computed opacity = 1 |
| Cycle-3 Minor 2/3 (live card at-rest opacity, hover/focus-within reveal) | new: "a live rail card's action row sits at opacity 0 until hover or focus-within reveals it" |
| Fix Attempt 3 Major 2 (`--danger` recolour, not `--rose`) | E9: `#remove-confirm-button` computed `background-color` |
| Fix Attempt 3 Minor 1 (focus survives a real rail re-sort) | new: "a focused card action button survives a rail re-sort triggered by a real priority change" |

### Notes (fix attempt 3)

- `web/e2e/actions.spec.ts` grew from 19 to 21 tests (2 new); the E6, E11, and E9 tests
  were edited in place to add computed-style assertions, no test-count change from
  those edits.
- No other spec file was touched.
- Did not touch `web/playwright.config.ts` or any global setup/teardown file.
- No real `claude` process was launched anywhere; no throwaway measurement spec was
  used this cycle (unlike web-impl's Fix Attempt 3, I did not need to gather any
  live number I couldn't just assert directly in the target spec).
- No live defect found while writing or running these tests — every assertion added
  passed against the rebuilt binary/bundle on the first try, consistent with
  web-implementation.md's Fix Attempt 3 claiming the Critical/Major/Minor items it
  addressed are genuinely fixed.
