# Re-levelling classification — lifecycle, ingest, surfaces, connection, actions, rename, drop, issue, theme, card-location (added-dirs)

Batch of the 2026-10-20 re-levelling (`plans/_audit/test-audit-2026-10-20-relevel.md`,
kb:adr/process-test-levels-journey-property-logic). Every test in the 23 files below is
classified; the owning feature is what `go tool kb for <path>` returns. Harness facts the
classification rests on (`web/render/helpers/harness.ts`): every unmocked `/api/**` is a 404
(`code: "render-harness"`), so `GET …/pane` reads as "no snapshot captured", `PUT /api/prefs`
never lands (a view or theme change is a fixture pref via `withPrefs`, or a pushed `prefs`
frame), terminal and shell sockets are accepted and silent (so a drop sees an "open" pane,
never a closed one), `/ws` always sends hello then snapshot at once (no "connecting", no
"lost"), and `dashboard.send(frame)` can push any parsed frame type: `sessionUpsert`, `prefs`,
`usage`, `sessionRemoved`, `claudeTheme`, `claudeCode`, `update`, `docChanged`,
`shellActivity`, `groups`.

Totals: 262 test blocks (263 runtime tests, one ×2 loop) → 227 journey, 35 property, 0 logic.

## `state-transitions.spec.ts` — 26 tests → 26 journey, 0 property, 0 logic

Feature: lifecycle. Every test posts hooks to the live daemon and reads the card plus `GET /api/state`.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a compaction begun on an idle card reads working, and its SessionStart for the same prompt lands idle (E1, REQ-6, REQ-8) | E1, REQ-6, REQ-8 | journey | PreCompact then compact SessionStart move the card |
| a compaction on a card that never had a turn reads working and then idle, never started (E1b, INV-C, REQ-6, REQ-8, #66) | E1b, INV-C | journey | hook sequence changes state |
| a compaction in a plan-mode session reads working, never planning, then lands idle (REQ-6) | REQ-6 | journey | hooks under plan mode |
| a compaction inside a working turn only counts: no transition, and its SessionStart under a fresh prompt id changes nothing (E1c, REQ-7, REQ-9) | E1c, REQ-7, REQ-9 | journey | stays-unchanged after persisted hooks, `stateSince` oracle |
| a compaction inside a working turn whose SessionStart names the turn's own prompt changes nothing (E1d, REQ-7, REQ-9) | E1d | journey | same |
| a compact SessionStart on an idle card whose PreCompact was lost changes nothing (edge case 1, REQ-9) | edge 1, REQ-9 | journey | hook loss handling |
| a compact SessionStart that arrives before its PreCompact is a no-op, and the later idle_prompt ends the compaction (edge case 3, REQ-8, REQ-9, REQ-2) | edge 3 | journey | reordered hooks |
| when a compaction's SessionStart is lost, or nothing was compacted, the idle_prompt naming its prompt lands idle, never needs input (edge cases 2 and 4, REQ-2, INV-B) | edges 2, 4 | journey | hooks |
| a new prompt during a compaction is an ordinary turn, and the compaction's late SessionStart then changes nothing (edge case 7, REQ-9) | edge 7 | journey | hooks |
| SessionStart with source startup, clear and resume still lands started, started and idle (REQ-10 regression) | REQ-10 | journey | three bind sources |
| an idle_prompt naming a prompt no hook opened leaves an idle card idle, then closes that prompt (E2, REQ-1, REQ-3, #87) | E2, REQ-1, REQ-3 | journey | hooks |
| an idle_prompt for the prompt a Stop already closed changes nothing (REQ-4 regression) | REQ-4 | journey | hooks |
| a straggler idle_prompt for a closed prompt arriving after the next turn started leaves the card working (edge case 13, REQ-4 regression) | edge 13 | journey | hooks |
| an idle_prompt with no prompt_id after /clear changes nothing (REQ-4 regression) | REQ-4 | journey | hooks (duplicates subagent-status E1, see Notes) |
| an idle_prompt naming the open turn's prompt ends the turn: a working card lands idle with its earlier fields intact (E3, REQ-2) | E3, REQ-2 | journey | hooks |
| an idle_prompt naming the open turn's prompt lands a planning card idle (REQ-2) | REQ-2 | journey | hooks |
| an idle_prompt naming a background subagent's fresh prompt id ends that stretch: working lands idle, never stuck on needs input (edge case 9, REQ-2, #72) | edge 9 | journey | hooks |
| an idle_prompt for the open prompt of a PermissionRequest leaves the card on needs input with the same wait (E4, REQ-1, REQ-3) | E4 | journey | hooks, `attention.since` oracle |
| an idle_prompt on a subagent's permission wait keeps the wait, and the subagent's own next activity still clears it (edge case 10, REQ-3, REQ-5) | edge 10 | journey | hooks |
| a subagent-marked event carrying dontAsk leaves a planning card planning and the latch on plan (E5, REQ-12, #70) | E5, REQ-12 | journey | mode latch from hooks |
| a main-agent event carrying acceptEdits still moves a planning card to working and the latch to acceptEdits (REQ-12 regression) | REQ-12 | journey | hooks |
| a subagent-marked StopFailure for the closed prompt leaves an idle card idle, never failed (E6, REQ-13, #86) | E6, REQ-13 | journey | hooks |
| a subagent's failure leaves the card idle, and the main agent's own background-completion turn failing then reads failed (edge case 18, REQ-13) | edge 18 | journey | hooks |
| a subagent-marked StopFailure while the main turn is open leaves the card working, and the turn's own Stop still lands idle (edge case 16, REQ-13) | edge 16 | journey | hooks |
| a subagent-marked StopFailure during a permission wait keeps the card on needs input with the same wait (edge case 17, REQ-13) | edge 17 | journey | hooks |
| an unmarked StopFailure still fails the open turn, with its raw error and message (REQ-13 regression) | REQ-13 | journey | hooks |

## `reconcile.spec.ts` — 5 tests → 5 journey, 0 property, 0 logic

Feature: lifecycle. Every test restarts its daemon.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a session whose pane died while the daemon was down reconciles to ended and kept, then a later restart sweeps it for good (E2, INV-1, INV-3) | E2, INV-1, INV-3 | journey | kill pane, restart, DELETE, restart |
| a live session survives the default ask-on-exit policy under this harness's non-TTY stdin, terminal included (E3, survive policy) | E3 | journey | restart, PTY streams after |
| stopping the daemon with -on-exit=kill kills the tmux session and the next startup sweeps the row (E4) | E4 | journey | daemon flag, tmux oracle |
| a session whose daemon is restarted while its pane stays alive comes back alive and attachable, with its target reconciled from tmux (E3) | session-lifecycle E3, REQ-9 | journey | restart, tmux oracle, PTY attach |
| reconcile reports an unknown tmux session on the socket without creating a row for it (REQ-2) | REQ-2 | journey | foreign tmux session, restart |

## `ingest.spec.ts` — 5 tests → 5 journey, 0 property, 0 logic

Feature: ingest. No DOM is asserted anywhere; every oracle is the daemon's HTTP status and its sqlite table.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2 | REQ-10, REQ-11 | journey | ingest POSTs, sqlite seq oracle |
| persists a status-line POST as an event with type status_line | REQ-10 | journey | ingest POST |
| rejects a wrong ingest token with 404 and persists nothing | REQ-12 | journey | auth on the ingest route |
| returns 200 for a malformed JSON hook body and persists nothing | REQ-13 | journey | drop path |
| returns 200 for valid JSON with no usable session_id and persists nothing | REQ-13 | journey | drop path |

## `ingest-envelope.spec.ts` — 1 test → 1 journey, 0 property, 0 logic

Feature: ingest.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| an enveloped SessionStart with a mismatched pane persists unrouted; the same event with the real pane binds it (E4, REQ-12, INV-CORROBORATE) | E4, REQ-12 | journey | pane corroboration against real tmux |

## `subagent-status.spec.ts` — 12 tests → 12 journey, 0 property, 0 logic

Feature: ingest (file) / lifecycle (behaviour). Hooks and transcript writes change the card.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| subagent permission after the parent Stop moves the card to needs input, and the unmarked Notification straggler that follows changes nothing (E2) | E2, REQ-2, REQ-3 | journey | hooks |
| #20's shape — attention latched under plan mode clears when activity arrives under auto, landing working not needs input (E4) | E4, REQ-4 | journey | hooks |
| a failed turn's note is cleared once the next turn starts, not carried into working (E7) | E7 | journey | hooks, `stateSince` moves |
| subagent tool activity past the parent Stop keeps the card working, with stateSince moving at each transition (E8) | E8, REQ-2 | journey | hooks |
| a prompt-less idle_prompt leaves an idle card idle with no attention (E1, REQ-1) | status-inconsistencies E1 | journey | hooks (duplicate, see Notes) |
| an unmarked PostToolBatch moves a card waiting on ExitPlanMode from needs input to planning (E2, REQ-2) | E2, REQ-2 | journey | hooks |
| subagent-marked tool activity leaves a main-agent permission wait on needs input, and the main agent's own PostToolUse then ends it (E3, REQ-3) | E3, REQ-3 | journey | hooks |
| a subagent-raised permission wait survives main-agent and second-subagent activity and ends on the owning subagent's PostToolUse (REQ-3, INV-B) | REQ-3, INV-B | journey | hooks |
| a main Stop while a subagent owns the permission wait keeps needs input and its attention (REQ-8) | REQ-8 | journey | hooks |
| a working card whose transcript gains an interrupt line for its current prompt reads idle within 10 s (E4, REQ-4) | E4, REQ-4 | journey | transcript read on the liveness tick |
| declining a permission prompt, an interrupt for tool use, takes a needs input card to idle and clears its attention (E4, REQ-4) | E4, REQ-4 | journey | transcript read |
| an interrupt line for an older prompt id leaves a working card working until the current prompt's line arrives (REQ-4) | REQ-4, D8 | journey | transcript read, 6 s hold |

## `plain-shell.spec.ts` — 21 tests → 21 journey, 0 property, 0 logic

Feature: surfaces. A real `$SHELL` in a real tmux pane throughout; every test spawns a shell through `POST …/shell`.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| switching to shell in Focus shows a live shell whose prompt responds to typed input, and switching back to claude shows the Claude pane again (E1) | E1, REQ-1 | journey | shell POST, typed round trip |
| a session never switched to shell has no muster-<id>-shell tmux session (E2) | E2 | journey | tmux oracle |
| the shell runs in the session's own directory (E3) | E3 | journey | `pwd` through the PTY |
| a shell started in Focus is still running after switching to Tiles and back (REQ-6, E4) | E4, REQ-6 | journey | tmux oracle across a view switch |
| a shell can be started on a session whose alive is false, and the claude segment still shows the dead surface (E5, edge case 13) | E5, REQ-7 | journey | end POST, shell POST on a dead session |
| typing exit closes the shell socket and swaps the visible surface back to Claude (E6, REQ-8) | E6, REQ-8 | journey | socket close 4001, respawn |
| running claude inside a shell leaves the parent session's state, stateSince, claudeSessionId and context untouched, and persists its events unrouted with a NULL session_id (E7, E15, INV-6, edge case 1) | E7, E15, INV-6 | journey | unbound hooks, sqlite oracle |
| after daemon.restart(), no muster-<n>-shell tmux session remains on the socket (E8, edge case 3) | E8 | journey | restart, tmux oracle |
| switching to shell with the directory removed shows the daemon's error in the surface's status notice and leaves the segment on claude (E9, REQ-12, edge case 4) | E9, REQ-12 | journey | the daemon's 409 drives the notice |
| switching to shell on a DEAD session with its directory removed shows the daemon's error in the dead surface's own notice, leaving the segment on claude (review Major 1, dead-session REQ-12 variant, edge cases 4+13) | REQ-12 | journey | daemon 409 on a dead session |
| switching to shell on a DEAD tile with its directory removed shows the daemon's error in that tile's own dead-surface notice, and a neighbouring tile is unaffected (review Major 1, dead-session REQ-12 variant, tile path) | REQ-12 | journey | daemon 409, tile path |
| tmux kill-session on a live shell closes its socket and does not change the parent session's state or alive (E10, edge case 6) | E10 | journey | tmux kill, socket close, 1 s hold |
| resuming a dead session that has a live shell leaves the shell running (E11, edge case 8) | E11 | journey | end, resume, tmux oracle |
| a second tab on the same session's shell supersedes the first, while a tab on that session's claude surface stays open (E12, INV-3) | E12, INV-3 | journey | one-live-client over real sockets |
| removing one session kills only its own shell; a second session's shell keeps running (E13, INV-4) | E13, INV-4 | journey | DELETE, tmux oracle |
| a file dropped on a shell surface pastes its escaped path (E14, REQ-11) | E14, REQ-11 | journey | locate + paste through the PTY |
| a shell surface's reported geometry matches its tmux window's geometry (E16, REQ-11) | E16 | journey | tmux geometry oracle |
| a tile footer renders the same segment as the mainhead, scoped per session (REQ-4) | REQ-4 | journey | the flip spawns a shell (POST); the initial pressed state is a property half, see Borderline |
| switching the Focus header to shell, docs and back to claude moves keyboard focus into each surface (REQ-2, E2) | focus-lands REQ-2, E2 | journey | shell spawn resolves, reader GETs |
| switching a tile's footer to shell moves keyboard focus into that tile's shell terminal (REQ-2, E3) | focus-lands E3 | journey | shell spawn |
| a shell spawn that resolves after focus moved into the rename field leaves focus in that field (R1, edge 5) | focus-lands R1, edge 5 | journey | a held shell POST resolving later |

## `terminal.spec.ts` — 20 tests → 20 journey, 0 property, 0 logic

Feature: surfaces. Every test mounts a live terminal over a real `/ws/terminal/{id}` socket against the stub.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| focusing a launched session streams the stub's readback and echoes typed input (E1, E2) | E1, E2 | journey | PTY round trip |
| clicking a rail card swaps the live terminal to the newly focused session (REQ-7) | REQ-7, INV-2 | journey | second session's readback streams |
| focusing the same session from a second browser context supersedes the first (E3, INV-1) | E3, INV-1 | journey | one-live-client |
| supersede reclaims cleanly even when the older client was mid-keystroke (INV-1) | INV-1 | journey | PTY line discipline |
| the tmux oracle's window geometry matches the terminal's own fitted size (E4) | E4, REQ-3 | journey | tmux geometry oracle |
| killing the stub's tmux session ends its live surface: socket closed, dead surface shown, region unmounted (E12) | E12, REQ-6 | journey | tmux kill, 4001, liveness |
| focusing a dead session shows the dead surface, never the terminal region, without ever attempting a socket (REQ-13) | REQ-13 | journey | real pane snapshot captured before the kill, socket-open count; the surface's structure is a property half, see Borderline |
| shows the disconnected overlay while the daemon is down, and streams again after restart | E13, REQ-13 | journey | kill, restart, reattach |
| clicking a rail card in Focus moves keyboard focus into its terminal with no second click, and the typed round trip proves it end to end (E1, E2, E9, REQ-1, REQ-4) | terminal-focus E1, E2, E9 | journey | typed round trip |
| re-clicking the already-focused session's card returns keyboard focus to its terminal after focus moved elsewhere (E3, REQ-2) | E3, REQ-2 | journey | needs the mounted live surface (stub readback awaited); DOM focus only otherwise |
| clicking a card's pin button pins the session, leaves the live pane unchanged, and never moves focus into a terminal (E4, REQ-5, INV-3) | E4, REQ-5, INV-3 | journey | pin PUT must succeed for `aria-pressed` to flip |
| a live rail card offers no End button, and the mainhead's End opens the confirm dialog without moving focus into a terminal (REQ-5, REQ-7, INV-3) | REQ-5, REQ-7, INV-3 | journey | two live sessions with mounted terminal; the dialog half is a property, see Borderline |
| choosing Resume or Remove… from an ended card's menu never selects the session or moves focus into a terminal (REQ-5, INV-3, plan rail-card-organise REQ-4) | REQ-5, INV-3 | journey | end POST, Resume fires a relaunch |
| clicking an ended session's card shows the dead surface and leaves keyboard focus on that card, never in a terminal (E5, REQ-6) | E5, REQ-6 | journey | end POST; the dead-click focus half is a property, see Borderline |
| dragging a rail card onto another in manual mode reorders the rail without changing focusedId or stealing focus from the terminal (E6, REQ-7, INV-4 source state (i): focus in the live terminal) | E6, REQ-7, INV-4 (i) | journey | reorder PUT must land for the order to change |
| dragging a rail card leaves focus untouched whether it started on an uninvolved card or the rail-sort select (INV-4 source states (ii), (iii)) | INV-4 (ii), (iii) | journey | reorder PUT |
| Enter on a keyboard-focused rail card selects the session but leaves focus on the card (E7, REQ-8) | E7, REQ-8 | journey | focus is client-side, but the mainhead swap is asserted with a live pane mounted; see Borderline |
| a 1s render tick never moves focus into a terminal when it starts outside one, and never steals it once inside (E8, INV-1 source state (a)) | E8, INV-1 (a) | journey | render tick over a live terminal |
| a sessionUpsert for the focused session doesn't move keyboard focus into its terminal (INV-1 source state (b)) | INV-1 (b) | journey | hook-driven upsert (portable with a pushed `sessionUpsert`, see Borderline) |
| a rail reorder from a state change in attention mode doesn't move keyboard focus into a terminal (INV-1 source state (c)) | INV-1 (c) | journey | attention sort needs the prefs PUT, hooks reorder |

## `shell-activity.spec.ts` — 12 tests → 7 journey, 5 property, 0 logic

Feature: surfaces. The indicator is driven by `snapshot.shellsBusy` and live `shellActivity` frames (`web/src/features/surfaces.ts`), both of which the render harness can supply (`dashboard.send({type:"shellActivity", sessionId, busy})`). What needs the daemon is tmux judging a real `sleep` busy.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a shell running a silent foreground command shows a spinner in both the mainhead and the tile footer, then a tick once it finishes (REQ-2, REQ-3, REQ-14) | REQ-2, REQ-3, REQ-14 | journey | tmux process state → busy flag |
| the spinner stays visible on the shell segment while the user is on the Claude surface, becomes a tick when the work finishes, and clicking shell clears the tick immediately (User Flows 1-4, REQ-2, REQ-3, REQ-4) | REQ-2–4 | journey | real busy transition; the click clears via a shell POST |
| a tick clears itself about 3s later when the shell surface was already selected when the work finished (REQ-4, User Flow 5) | REQ-4 | journey | real busy transition (portable with pushed frames + `settleFor`, see Borderline) |
| a shell that exits while busy leaves no spinner and no tick behind (E7, edge case 1) | E7 | journey | tmux kill of the shell |
| a daemon restart mid-command clears the shell activity indicator to nothing rather than to a tick (E8, edge case 4) | E8 | journey | restart |
| with two sessions' shells busy at once, exactly those two segments show spinners and a third idle shell shows none (E11, INV-4) | E11, INV-4 | journey | three real shells |
| a shell surface superseded by a second window while busy still tracks the spinner through /ws (E12) | E12 | journey | two contexts, real supersede |
| createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline) | INV-3 | **property** | the segment's accessible name "shell" and no indicator for a session not in `shellsBusy` — `three-states` |
| the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3) | rail-card-improvements-2 E7, E8, INV-3 | **property** | computed box per `data-act`; busy from a pushed `shellActivity` frame, done from a second frame |
| the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3) | E7, E8, INV-3 | **property** | same, Tiles host — needs a `view: "tiles"` pref in the fixture |
| under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2) | shell-pane-fixes REQ-2 | **property** | computed `animation-name` under `emulateMedia({reducedMotion})` for a busy indicator |
| without a reduced-motion preference the busy spinner still spins, on the mainhead and in a tile footer (REQ-2, edge case 1) | REQ-2, edge 1 | **property** | computed `animation-name` is `shellact-spin` |

## `shell-scroll.spec.ts` — 7 tests → 7 journey, 0 property, 0 logic

Feature: surfaces. Every oracle is tmux copy-mode state or `capture-pane`.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the tmux server's mouse option stays off once a shell is spawned (D7, INV-2) | D7, INV-2 | journey | tmux option oracle |
| dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8) | E13, REQ-8 | journey | needs real shell output rows to drag across (xterm selection overlay) |
| a wheel-up over a shell surface with real history enters copy-mode, and wheeling back down leaves it by itself with the mouse option still off (E4, E5, REQ-7, INV-2) | E4, E5 | journey | copy-mode via the PTY |
| a slow trackpad-shaped wheel gesture — many sub-line deltas, one flush per event — still scrolls the pane (REQ-7, review cycle 1 Major 1) | REQ-7 | journey | copy-mode oracle |
| a wheel-up over a shell surface never inserts a character into the shell's command line — the #45 symptom itself (E6) | E6 | journey | capture-pane oracle |
| wheeling up hard on a shell with almost no history clamps without error and is not left in copy-mode after scrolling back down (E9, REQ-12, edge case 10) | E9, REQ-12 | journey | copy-mode oracle |
| typing while a shell is scrolled back cancels copy-mode, returns to the live bottom, and still delivers the keystroke (E10, REQ-10) | E10, REQ-10 | journey | keystroke through the PTY |

## `shell-keys.spec.ts` — 5 tests → 5 journey, 0 property, 0 logic

Feature: surfaces.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| Option+Left twice, then a typed character, lands at the previous word boundary in a shell surface, verified against tmux capture-pane (E1, REQ-5) | E1, REQ-5 | journey | zsh line editor via the PTY |
| Option+Right, after Option+Left twice, lands a typed character at the next word boundary in a shell surface (REQ-5) | REQ-5 | journey | same |
| Cmd+Left, then a typed character, lands at the start of the line in a shell surface (E2, REQ-6) | E2, REQ-6 | journey | same |
| Cmd+Right, after Cmd+Left, lands a typed character at the end of the line in a shell surface (REQ-6) | REQ-6 | journey | same |
| Option+Left and Cmd+Left over a Claude surface are sent as xterm's own raw, untranslated bytes — both before any shell exists and after switching back from a shell on the same session (E3, INV-1) | E3, INV-1 | journey | bytes on the terminal socket, a shell spawned in between |

## `shell.spec.ts` — 4 tests → 1 journey, 3 property, 0 logic

Feature: surfaces (file ownership); the tests are the masthead and empty state.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| renders the masthead, connection status and empty sessions state after the WS handshake | Testable UI Elements | **property** | heading, "connected" after the fixture hello, rail's "No sessions yet" — `empty` |
| renders both usage readouts as the word unknown, never an empty gauge | REQ-16 | **property** | usage null in `empty` |
| shows the Claude Code version reported by hello | hello readout | **property** | duplicates `harness.spec.ts` R-smoke hello (weaker regex); fold into it |
| GET /api/state returns exactly the empty-daemon snapshot object once authenticated | snapshot shape | journey | the daemon's API body (a Go handler test would also falsify it) |

## `auth.spec.ts` — 7 tests → 7 journey, 0 property, 0 logic

Feature: connection. Every assertion is an HTTP status or cookie the daemon sets; the census's "4 of 7 touch no daemon" is a lint false negative (the `daemon()` closure pattern), see Notes.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| serves /healthz without authentication | healthz | journey | daemon route |
| shows the relaunch page for an unauthenticated visit to / | 401 page | journey | the daemon serves the 401 page |
| shows the relaunch page for a stale cookie | 401 page | journey | cookie check |
| rejects GET /api/state without the auth cookie with a JSON 401 | API 401 | journey | daemon route |
| exchanges the UI token for a session cookie and lands on the rendered shell | /auth redirect | journey | cookie minted by the daemon |
| gets a 401 relaunch page for a bad token at /auth | /auth 401 | journey | daemon route |
| rejects a WS upgrade whose Origin host does not match the daemon's own | WS origin | journey | daemon 403 |

## `resilience.spec.ts` — 7 tests → 7 journey, 0 property, 0 logic

Feature: connection.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| shows the daemon-down banner when the scratch daemon is killed, and clears it on restart | REQ-17, E12 | journey | kill, restart (the lost banner needs a closed `/ws`, which the harness does not expose) |
| a steady daemon-down produces no #banner mutations for its role=alert to re-announce | render idempotence | journey | needs the lost state; would be a property with `dashboard.close()`, see Borderline |
| keeps the same UI and ingest tokens across a restart on the same data dir | REQ-19 | journey | restart |
| does not re-apply migrations on a second startup against the same data dir | REQ-20 | journey | restart, sqlite |
| focus returns to the mainhead End button by node identity after a daemon drop and reconnect (E1, REQ-7, INV-FOCUS) | general-cleanup E1 | journey | kill, restart, reconnect |
| focus returns to a tile's End button by node identity after a daemon drop and reconnect (E2, REQ-7, INV-FOCUS) | E2 | journey | same |
| a pop-out that has never connected shows connecting…, never musterd unreachable, until its first hello (E3, REQ-8, INV-POPOUT-CONNECTING) | E3, REQ-8 | journey | needs a socket that withholds hello; the harness always sends it at once |

## `claude-version.spec.ts` — 8 tests → 3 journey, 5 property, 0 logic

Feature: connection. The readout is a pure function of `hello.claudeCode` (`features/connectionversion.ts`); a fixture's hello can carry any `{installed, status}` because the render rig sets `srv.claudeVersion.current` directly (`internal/server/renderfix.go` `newRenderRig`), so three one-line scenarios cover below/above/unknown.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9) | E1, edge 9 | **property** | readout for `status: "below"` — scenario `claude-version-below` |
| stub answering the verified ceiling: readout reads claude <ceiling> with no glyph in the readout (E2, Edge Case 9) | E2 | **property** | `status: "verified"` — every existing fixture (`empty`) |
| stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9) | E3 | **property** | `status: "above"` — scenario `claude-version-above` |
| stub whose --version fails: the dashboard still serves and the readout reads exactly claude unknown with the check-failed hover text, no glyph (E4, Edge Case 1) | E4, INV-3 | journey | "the daemon still serves" is the daemon's; the readout half is a property on `claude-version-unknown`, see Borderline |
| POST /api/issue/captures snapshot carries exactly the four claudeCode keys, status below, matching hello (E5) | E5 | journey | capture POST body |
| the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6) | E6 | **property** | DOM structure and an inert click — `claude-version-below` |
| a stub whose --version takes 7 s: the daemon serves within 3 s and the open dashboard's readout flips to the version with no reload (claude-version-watch REQ-1, REQ-2) | REQ-1, REQ-2 | journey | startup timing and the daemon's push |
| a stub whose --version takes 7 s: the Settings button holds its x while the readout flips from claude unknown to the version and warning glyph, no reload (claude-version-watch REQ-5) | REQ-5 | **property** | reserved width across unknown → below: open `claude-version-unknown`, then `dashboard.send({type:"claudeCode", …status:"below"})` and compare the readout's and `#settings-button`'s boxes |

## `embedded.spec.ts` — 4 tests → 4 journey, 0 property, 0 logic

Feature: connection. The claim is that the binary serves the dashboard from its embedded FS; every test needs that daemon (the census's 3/4 is the same lint false negative as auth).

| Test | Criteria | Level | Reason |
|---|---|---|---|
| fixture sanity: the scratch dir has no web/ or internal/ tree next to the copied binary | R7 | journey | fixture of the embedded daemon |
| serves the working dashboard from the embedded FS with no -web-dist flag: auth, masthead, WS connects | E1, REQ-1–8 | journey | embedded serving, cookie, WS |
| still gates the embedded static handler on the auth cookie (401 relaunch page) | R5 | journey | daemon route |
| serves /healthz without authentication from the embedded-serving daemon | sanity | journey | daemon route |

## `type-scale.spec.ts` — 1 test → 0 journey, 1 property, 0 logic

Feature: connection (file ownership); the claim is the type ramp.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10) | ui-text-and-focus E10, REQ-6, REQ-7 | **property** | computed root `font-size` and a card's `.name` font-size — `three-states` (the launch only exists to have a card) |

## `masthead-update-dot.spec.ts` — 1 test → 1 journey, 0 property, 0 logic

Feature: connection.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| during Update and restart the dot is pending with the restarting title while the updating banner shows, then ok after the new hello, agreeing with the banner at every render (E6, REQ-6, REQ-8, INV-1) | masthead-indicators E6, INV-1 | journey | a real update apply and daemon restart against a fake release server |

## `actions.spec.ts` — 16 tests → 13 journey, 3 property, 0 logic

Feature: actions. End/Resume/Remove POSTs, the real pane snapshot and connection drops are journeys; the dialogs and the dead surface's static copy are display.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2) | E5, INV-2, REQ-9 | journey | End POST, tmux oracle, attention sort |
| Cancel and Escape close both End and Remove dialogs without sending any request (E10) | E10 | **property** | dialog open/close is client-side; "no request" is a `page.on("request")` count the harness allows — `three-states` (focus a live card) |
| a focused ended session shows the dead surface with its last snapshot and a Resume button in the cap (E6) | E6, REQ-13 | journey | the snapshot text is the daemon's capture; structure and Resume opacity are a property half, see Borderline |
| Ending a focused session closes its terminal socket and never reopens one while dead (INV-5) | INV-5 | journey | socket count across End |
| clicking Resume in the ended cap relaunches the session with the same claude id in its argv (E7) | E7 | journey | relaunch, argv oracle |
| Resume is refused 409 not_resumable when another alive session already holds the same claude id (REQ-12) | resume-and-dangerously-allow REQ-12 | journey | daemon 409 |
| Resume is refused 409 not_resumable when the same claude id is held by a resume-bound session (REQ-12) | REQ-12 | journey | daemon 409 |
| the resume SessionStart lands the card in idle with no attention or failure carried over (E8, E15, INV-6) | E8, E15, INV-6 | journey | resume POST then hook |
| a session with no captured snapshot shows 'no snapshot captured' under the ended cap (E13) | E13 | journey | the daemon's `no_snapshot` 404 for a pane killed before the first tick (the harness's own 404 shows the same text for the wrong reason, see Borderline) |
| Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9) | E9, REQ-10, REQ-11 | journey | DELETE, tmux oracle; the dialog copy and `--danger` fill are a property half, see Borderline |
| action buttons are disabled while the daemon connection is down (E14) | E14 | journey | kill, restart |
| action buttons are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect (E14, Major 4) | E14, Major 4 | journey | needs a closed `/ws` and its reconnect; the harness exposes neither |
| ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6) | REQ-10, REQ-13, Major 6 | **property** | copy for a dead session whose `endedAt` is sub-minute — `dead-session` (check `ageAgo` at the fixture's negative age, see Properties to port) |
| the dead surface shows a 'loading last screen…' interim state before the pane fetch resolves (REQ-13, Minor 9) | REQ-13, Minor 9 | journey | a held real pane GET; the harness answers at once |
| a late resume SessionStart hook after End does not revive the session or open a terminal socket (INV-1, Major 1) | INV-1, Major 1 | journey | hook on a dead row |
| a session with no bound Claude id shows a disabled Resume control with a stated reason, on the mainhead and the dead cap (E7, W3) | session-lifecycle E7, W3 | **property** | disabled state and `title` for `claudeSessionId: null` on a dead session — new scenario `dead-unbound` |

## `rename.spec.ts` — 16 tests → 14 journey, 2 property, 0 logic

Feature: rename. A commit is `PUT …/title`; a view switch is `PUT /api/prefs` adopted from the broadcast, so every view-switch test needs the daemon.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| clicking the mainhead title opens a prefilled, selected field; Enter commits the new title everywhere (E4) | E4 | journey | the commit PUT and the rail's follow-through; the open-field half is a property, see Borderline |
| a status-line post's session_name never overrides an active title override (E5) | E5, INV-1 | journey | status post vs override |
| clearing the field reverts the title to Claude's last-known name (E6) | E6 | journey | PUT with empty title |
| pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7) | E7 | **property** | open, type, Escape, count PUTs — `three-states` |
| an override survives a daemon restart, on the mainhead/rail card, and in Tiles on both the strip card and the promoted tile's header (E8, E9) | E8, E9 | journey | restart, strip promote |
| renaming a live tile's header updates that tile, leaves a neighbour tile untouched, and reaches Focus's rail/mainhead; the header is undraggable only while editing (E11, E12) | E11, E12 | journey | PUT, view switch |
| a header drag still reorders the Tiles grid and opens no rename textbox (E13) | E13 | journey | reorder PUT |
| a status-line post arriving mid-edit leaves the open mainhead field's value and focus untouched (REQ-15, INV-4) | REQ-15, INV-4 | journey | status post mid-edit (portable with a pushed `sessionUpsert`, see Borderline) |
| switching to Focus via cmd-backslash while a tile rename is open sends no PUT and leaves the title unchanged (REQ-15) | REQ-15 | journey | the view must actually switch (prefs broadcast) |
| clicking the masthead Focus button while a tile rename is open sends no PUT and leaves the title unchanged (REQ-15) | REQ-15 | journey | same |
| switching to Tiles while the mainhead rename is open sends no PUT and leaves the title unchanged (REQ-15) | REQ-15 | journey | same |
| clicking the pressed view segment while its own rename editor is open commits instead of cancelling, on both the mainhead and a tile header (E5) | claude-status-fixes E5, REQ-6 | journey | title PUT count 1, prefs PUT count |
| a right-click on the inactive Tiles segment while a mainhead rename is open does not cancel it — no click fires, the blur commits, and the view stays Focus (E6, REQ-7) | E6, REQ-7 | journey | blur commit PUT |
| clicking an unrelated control (New session) still commits an open mainhead rename, per ordinary REQ-14 blur semantics | REQ-14 | journey | blur commit PUT |
| a rename works on a dead session (REQ-16) | REQ-16 | journey | PUT on a dead row |
| a 300-character unbroken mainhead title ellipsises in place and never pushes End, Resume or Remove out of view at 900px and 1400px | title fit | **property** | header geometry at two widths for a 300-character title — new scenario `long-title` (status line `session_name`, since the override caps at 100) |

## `drop.spec.ts` — 11 tests → 8 journey, 3 property, 0 logic

Feature: drop. Locate is a daemon POST and the paste lands in the PTY; the client-side guards are display.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| dropping a file that exists in the session directory pastes its escaped path, echoes it after Enter, and moves focus into the pane (E1, E11, REQ-2, REQ-11) | E1, E11 | journey | locate + PTY |
| a dropped filename containing a space is pasted backslash-escaped (E2, REQ-4) | E2, REQ-4 | journey | locate + PTY |
| dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3) | E3 | journey | the daemon's locate miss |
| dropping a file that matches two identical on-disk copies shows the ambiguous notice with the count (E4) | E4 | journey | the daemon's walk |
| shows a transient 'Locating …' notice while the locate request is in flight, then clears it on success (REQ-6) | REQ-6 | journey | a held real locate |
| dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1) | E5, REQ-1 | **property** | the document-level dragover/drop guard — `three-states` |
| dropping text/plain with no files pastes the text verbatim (E6, REQ-10) | E6, REQ-10 | journey | PTY echo |
| a file over 50 MiB shows the too-large notice and issues no locate request (E7) | E7, REQ-7 | **property** | client-side size gate before any request; the live surface mounts against the harness's silent socket — `three-states` |
| in Tiles, a drop on one live tile pastes only into that tile, leaving the other tile's content unchanged (E8, INV-4) | E8, INV-4 | journey | locate + PTY |
| a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) | E9, REQ-8 | **property** | the dead surface never mounts a drop target — `dead-session` (its kill/poll setup only produces a dead session) |
| a drop on a live pane whose socket is not open shows the not-connected notice and issues no request (REQ-8) | REQ-8 | journey | needs a closed terminal socket; the harness accepts every one |

## `issue-capture.spec.ts` — 13 tests → 12 journey, 1 property, 0 logic

Feature: issue. The dialog fires `POST /api/issue/captures` the instant it opens, so every dialog-content test needs the daemon; Submit gating depends on a held capture.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the Issue button is visible in both Focus and Tiles (REQ-1) | REQ-1 | **property** | masthead button and its opacity per view — `empty` for Focus plus a `view: "tiles"` fixture (or a pushed `prefs` frame) for Tiles |
| sentinel title/directory/last-assistant-message never leak into the preview, the capture response, or the posted GitHub body, with bystander sessions present (E1, INV-1) | E1, INV-1 | journey | capture POST, fake GitHub |
| the preview text at submit time is byte-identical to the body the fake GitHub receives, for an empty note and no sessions (E2, INV-2, Edge Case 15) | E2, INV-2 | journey | capture + filing |
| the preview text at submit time is byte-identical to the body the fake GitHub receives, for a note with backticks, a fence, a pipe and </details>, typed via real keystrokes (E2, INV-2) | E2, INV-2 | journey | same |
| filing succeeds against the fake GitHub server — Submit disables while the POST is in flight, the success line reads Filed <owner>/<repo>#<n> linked to the returned URL, and Close dismisses the dialog (E3) | E3, REQ-8 | journey | filing |
| a fake GitHub 403 leaves the dialog open with the form intact, shows the alert and selectable detail carrying issue_post_failed, re-enables Submit, and the fake token never appears in the daemon's log (E4, INV-3) | E4, INV-3 | journey | filing failure, daemon log |
| a dashboard-scope capture (— none (dashboard only) — selected) posts a body whose table has no session rows (E5) | E5 | journey | second capture POST |
| killing the daemon disables the Issue button and closes an open dialog; reconnecting re-enables it (E6) | E6 | journey | kill, restart |
| a session with no context yet renders unknown in the preview, never 0% (E7, REQ-12, Edge Case 16) | E7, REQ-12 | journey | the capture's markdown is the daemon's |
| Submit stays disabled until a non-whitespace title is entered via real keystrokes, disables again for whitespace-only, and Cancel closes the dialog (REQ-6, Edge Case 20) | REQ-6, edge 20 | journey | Submit enables only with a held capture, which the harness's 404 never grants |
| a capture consumed by a concurrent filing shows the capture_expired remedy sentence and keeps Submit disabled (Edge Case 2, Minor 3) | edge 2, Minor 3 | journey | daemon capture store |
| a 2xx GitHub body with no issue number/URL shows the filing failure state, never Filed <repo>#0 (Minor 4) | Minor 4 | journey | daemon parses the fake's body |
| a 200-character title made of two-byte UTF-8 runes is accepted, proving the client's UTF-16 maxlength gate and the daemon's rune-count gate agree (Minor 1) | Minor 1 | journey | client + daemon gates together |

## `theme.spec.ts` — 18 tests → 13 journey, 5 property, 0 logic

Feature: theme. `html[data-theme]` is adopted from the prefs broadcast and `data-claude-family` from the snapshot/`claudeTheme` frame; a fixture pref (`withPrefs(..., {theme})`) gives the theme, and the family can only be "unknown" in a recorded fixture (the render rig has no `ThemeConfig`), or pushed with `dashboard.send({type:"claudeTheme", family})`.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2) | E2, REQ-9 | **property** | dialog structure — `empty` |
| a fresh daemon with no config file paints Instrument/unknown and checks Follow Claude Code (E3) | E3 | **property** | `data-theme`/`data-claude-family` and the checked radio for `prefs.theme: "follow"`, family unknown — `empty` |
| choosing Dark sets html[data-theme=dark] without a reload and changes body's background from Instrument (E4) | E4, REQ-9 | journey | the PUT persists server-side (`/api/state`); the per-pref display is covered by the new `theme-dark` fixture |
| after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5) | E5, REQ-11 | **property** | the head hint reads `localStorage` the page wrote from the broadcast: open `theme-dark`, `addInitScript`, `page.reload()` (routes persist) — no daemon in the claim, see Borderline |
| after choosing Dark, a daemon restart plus reload still shows dark with the Dark radio checked (E6) | E6 | journey | restart |
| Focus: choosing Light re-themes the chrome and the live pane ground within one render, no reload (E7, INV-3 Focus) | E7, INV-3 | journey | live change via PUT + broadcast (portable with a pushed `prefs` frame, see Borderline) |
| Tiles: choosing a theme re-themes both live tiles' grounds (E8, INV-3 Tiles multi-instance) | E8, INV-3 | journey | same |
| with a fast poll, flipping the Claude config from dark to light changes data-claude-family within 2s; data-theme stays fixed under an explicit pref, then switches under Follow (E9) | E9, INV-2 | journey | the daemon's poll of a real config file |
| with pref pinned to Dark, flipping the Claude config to light changes only the pane ground, not data-theme (E10, INV-2) | E10, INV-2 | journey | poll |
| choosing Follow after Dark, with family light, resolves to light and persists follow across a reload (E11) | E11 | journey | PUT persistence |
| killing the daemon leaves both theme attributes unchanged while the banner shows; restarting re-applies them (E12, INV-4) | E12, INV-4 | journey | kill, restart |
| the header's disabled Resume button's computed style differs from the enabled Stop button, in each theme (E13) | E13 | **property** | computed colours per theme for a live Stop and a dead-unbound Resume — new scenario `stop-resume-pair` under three theme prefs |
| badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14) | E14 | **property** | badge `color` equals the theme's token — new scenario `four-badges` under three theme prefs |
| a scratch Claude config with malformed JSON yields data-claude-family=unknown with no error banner or console error (E15) | E15 | journey | the daemon reads the file |
| theme resolution walks follow×dark -> dark×dark -> follow×light -> light×dark (INV-1) | INV-1, INV-2 | journey | poll + PUTs (the resolution table itself is Vitest's `resolveTheme`; see Borderline) |
| a rejected PUT /api/prefs never persists or applies; the Settings dialog closes on daemon-down and the checked radio only ever reflects the broadcast (INV-7, INV-4) | INV-7, INV-4 | journey | kill, restart, `/api/state` |
| GET /api/state always carries prefs.theme and claudeTheme.family (REQ-10, REQ-15) | REQ-10, REQ-15 | journey | API body |
| an open pop-out follows a live theme change without reload (E5, REQ-9) | general-cleanup E5, REQ-9 | journey | two pages on one broadcast |

## `added-dirs.spec.ts` — 25 tests (26 with the ×2 loop) → 18 journey, 7 property, 0 logic

Feature: card-location. The daemon reads `workspace.added_dirs` from status posts and each directory's branch from disk on the repo poll; the suffix, the hover panel's rows and its placement are display for a given `session.addedDirs`. Every fixture here needs a status post carrying `added_dirs`, which `claudecodetest.StatusLineFullOpts` cannot yet express (its `workspace` is hardcoded to `added_dirs: []`).

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a status post with two added git directories shows +2 on the Focus header's folder line in --fg-muted, with the wire's repos read from disk, and the rail card and tile header show no suffix and keep their hover text (E1, REQ-1, REQ-5, REQ-6, REQ-8, INV-3) | E1 | journey | the wire's branches are read from real checkouts; the suffix/colour/rail/tile half is a property, see Borderline |
| a status post whose list is only the launch directory, under any spelling of it, leaves no suffix and an empty list, and a later post with directories brings it back (D1, D3, INV-2, INV-3) | D1, D3 | journey | normalisation per post |
| a post with no added_dirs key leaves the suffix and the list as they were, and a later shorter list lowers it (D2, REQ-1, edge case 1) | D2 | journey | per-post semantics |
| a relative entry resolves against the launch directory and a symlinked duplicate collapses to the first position (D4, REQ-2, edge cases 4 and 5) | D4, REQ-2 | journey | path resolution on disk |
| hovering the header readout opens a tooltip listing Location then Added directories · 2 with each folder, branch and path, and moving away closes it (E2, REQ-7, REQ-9, W2) | E2, REQ-7, REQ-9, W2 | **property** | panel rows, `pointer-events`, body-appended, open/close on hover for a given `addedDirs` — new scenario `added-dirs-two` (the wire check becomes the fixture's `addedDirs`) |
| a session that has reported no directories has no suffix and a panel showing Location alone, with no title on the readout (E2, REQ-7, W2, States: No data yet) | E2, W2 | **property** | `addedDirs: []` — `three-states` |
| while Claude is in an added checkout the panel lists the ↳ row and the added list together (REQ-7, W3) | REQ-7, W3 | **property** | panel with a moved row and added rows — new scenario `added-dirs-moved` |
| an added plain directory counts in +N and shows as its folder and path with no branch, gains the branch when it becomes a checkout and loses it again on a detached HEAD (E7, REQ-5, REQ-5a, edge case 17) | E7, REQ-5a | journey | `git init`/detach under the poll |
| a checkout of a new branch in an added directory shows in the panel within one repo-poll tick (E5, REQ-5) | E5, REQ-5 | journey | poll |
| an added directory removed under a live session stays listed with its last-known branch while a neighbour's checkout still refreshes (D9, REQ-5, edge case 12) | D9 | journey | directory vanishes under the poll |
| stopping the session removes the suffix and the panel's Added section (E3, REQ-3, INV-1, REQ-6) | E3, REQ-3 | journey | End POST |
| stopping one of two sessions that both have added directories empties only that one's list, and a straggler status post cannot refill the dead session (E3, D5, D7, INV-1, edge case 8) | E3, D5, D7 | journey | End, straggler post |
| a pane that dies without a SessionEnd empties the list through liveness, with the neighbour's list untouched (REQ-3, D5, INV-1, edge case 11) | REQ-3, D5 | journey | tmux kill, liveness |
| a pane that is gone when the daemon starts is ended by reconcile with an empty list (REQ-3, D5, INV-1) | REQ-3, D5 | journey | restart |
| a resumed session starts with no directories until its first status post reports them again (REQ-3, D5, edge case 9) | REQ-3, D5 | journey | resume |
| restarting the daemon while the session is alive keeps +2 and the branches in the panel (E4, REQ-4, D8) | E4, REQ-4, D8 | journey | restart |
| a /clear pair applied SessionEnd first keeps the list until the next post re-reports it, and the new id's post can change it (REQ-4, D6, edge cases 6 and 7) ×2 — `order` ∈ {`end-then-start` ("SessionEnd first"), `start-then-end` ("SessionStart first")} | REQ-4, D6 | journey | hook pair ordering |
| a long folder name ellipsizes before the +N suffix, which stays fully visible and the header keeps its fit invariants at every width (W4, REQ-6) | W4, REQ-6 | **property** | suffix hit-testing and `mainheadFitProblems` at 1280/1024/768/600 — new scenario `added-dirs-long` |
| with the daemon down the panel still opens on hover with the last-known directories and branches (W5, REQ-7, edge case 16) | W5, REQ-7, edge 16 | journey | needs the lost-connection state; the harness cannot drop `/ws` (though "no daemon answering" is trivially true there) |
| with the mouse resting on the readout an added directory's new branch shows in the open panel without reopening it (REQ-5, REQ-7, review cycle 1 browser Minor 1) | REQ-5, REQ-7 | journey | checkout under the poll (portable with a pushed `sessionUpsert`, see Borderline) |
| with the mouse resting on the readout the session ending drops the open panel's Added directories section and keeps the Location row (REQ-3, REQ-7, INV-1, review cycle 1 browser Minor 1) | REQ-3, REQ-7 | journey | End POST (same note) |
| an added subdirectory of an ordinary checkout reads isWorktree false and one inside a linked worktree reads true, each naming its checkout's top level (correctness Major 1, REQ-5) | Major 1, REQ-5 | journey | the daemon's git reading; no DOM asserted at all |
| a few added directories fit below the readout, so the panel sits under it inside the viewport (edge case 15, REQ-7) | edge 15 | **property** | panel placement for 3 plain directories at 1280×800 — new scenario `added-dirs-plain-3` |
| fifteen added directories do not fit below the readout, so the panel moves to the top of the viewport and still shows every row inside it (edge case 15, REQ-7, kb:adr/focus-location-panel-lists-every-row) | edge 15 | **property** | placement for 15 — `added-dirs-plain-15` |
| twenty-two added directories are all listed in the panel, none capped and no +K more line (edge case 15, kb:adr/focus-location-panel-lists-every-row) | edge 15 | **property** | 23 rows, no "+K more" — `added-dirs-plain-22` |

## Properties to port

Existing scenarios: `empty`, `three-states`, `dead-session`, `moved-to-worktree`, `groups`, `long-names`, `usage-known`, `docs`, plus the density and focus-header variants. Every fixture's hello carries `claudeCode {installed: "2.1.300", status: "verified"}`, `prefs.theme: "follow"`, `claudeTheme.family: "unknown"`, `shellsBusy: []`.

| Test | Fixture state needed | Harness gap |
|---|---|---|
| shell.spec.ts "renders the masthead, connection status and empty sessions state after the WS handshake" | `empty` | none |
| shell.spec.ts "renders both usage readouts as the word unknown, never an empty gauge" | `empty` (`usage.fiveHour`/`sevenDay` null) | none |
| shell.spec.ts "shows the Claude Code version reported by hello" | `empty`; already asserted more strongly by `harness.spec.ts` "(R-smoke) hello" — delete rather than port | none |
| type-scale.spec.ts "the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10)" | `three-states` | none |
| claude-version.spec.ts E1 "default stub answers below the verified floor…" and E6 "the readout holds no button or link…" | new `claude-version-below`: drive sets `r.srv.claudeVersion.current` to `{Installed: "2.0.0", Status: below}` (same seam `newRenderRig` uses); the hello then carries it | none |
| claude-version.spec.ts E2 "stub answering the verified ceiling…" | `empty` (`status: "verified"`, `installed` = `verified`); the E2E's `observedVersionRange()` oracle becomes the fixture's own `hello.claudeCode.verified` | none |
| claude-version.spec.ts E3 "stub answering one patch above the verified ceiling…" | new `claude-version-above`: `Status: above`, `Installed` one patch over `verified` | none |
| claude-version.spec.ts REQ-5 "…the Settings button holds its x while the readout flips from claude unknown to the version and warning glyph, no reload" | new `claude-version-unknown`: `Status: unknown`, `Installed: nil`; then `dashboard.send({type:"claudeCode", claudeCode:{installed:"2.0.0", floor, verified, status:"below"}})` (shape per kb:anchor/ws.claude-code) and compare boxes before/after | none — the "serves within 3 s" half of its sibling REQ-1/REQ-2 test stays E2E |
| actions.spec.ts "Cancel and Escape close both End and Remove dialogs without sending any request (E10)" | `three-states`, click the first live card; the `alive` re-read via `getState` is dropped (nothing can change it) | none |
| actions.spec.ts "ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6)" | `dead-session`, but its `endedAt` is `FIXTURE_EPOCH + 1 min` while the page clock starts at the epoch: confirm `formatAge` yields the sub-minute bucket for a negative age, else add `dead-session-now` whose `markDead` stamps the epoch (the rig's `nextSecond` advances by seconds; the cap text asserted is `"now · last state:"`) | the harness's pane 404 makes the cap read "no snapshot captured", so only the endbar's `ended now ·` and the mainhead `.meta` are asserted as before; the cap's `now · last state:` prefix still renders in the missing state (`deadCapPrefix`) |
| actions.spec.ts "a session with no bound Claude id shows a disabled Resume control with a stated reason, on the mainhead and the dead cap (E7, W3)" | new `dead-unbound`: `r.launch` then `r.markDead` with no SessionStart (`claudeSessionId: null`) | none |
| rename.spec.ts "pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7)" | `three-states` (titled session "Alpha") | none |
| rename.spec.ts "a 300-character unbroken mainhead title ellipsises in place and never pushes End, Resume or Remove out of view at 900px and 1400px" | new `long-title`: `bind` then `r.status(EnvelopedStatusLineFull(…, StatusLineFullOpts{SessionName: strings.Repeat("W", 300)}))` — the status line, not the override, since the daemon caps an override at 100 | none |
| drop.spec.ts "dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1)" | `three-states` | none |
| drop.spec.ts "a file over 50 MiB shows the too-large notice and issues no locate request (E7)" | `three-states`, first live card focused (its `TerminalSurface` mounts; the harness's terminal socket is open and silent, so the size gate, which runs first, is what fires) | none |
| drop.spec.ts "a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8)" | `dead-session` (Focus auto-selects its one dead session, `#dead-surface` shows) | none |
| issue-capture.spec.ts "the Issue button is visible in both Focus and Tiles (REQ-1)" | `empty` for Focus; Tiles via new `empty-tiles` = `withPrefs(empty, {"view": "tiles"})`, or `dashboard.send` a `prefs` frame with `view: "tiles"` (the dashboard adopts the view only from the broadcast) | none |
| theme.spec.ts "clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2)" | `empty` | none |
| theme.spec.ts "a fresh daemon with no config file paints Instrument/unknown and checks Follow Claude Code (E3)" | `empty` | none |
| theme.spec.ts "after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5)" | new `theme-dark` = `withPrefs(empty, {"theme": "dark"})`; open it, `addInitScript` the DOMContentLoaded tag, `page.reload()`; the hint comes from the `muster.theme-hint` localStorage entry the first load wrote | `page.clock.install` and routes survive a reload; verify the harness's `open` is not needed twice |
| theme.spec.ts "the header's disabled Resume button's computed style differs from the enabled Stop button, in each theme (E13)" | new `stop-resume-pair`: one bound live session plus one `dead-unbound` session; variants `stop-resume-pair-dark`, `stop-resume-pair-light` via `withPrefs` (Instrument is `follow` with family unknown). Three fixtures replace the in-test radio loop | none |
| theme.spec.ts "badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14)" | new `four-badges`: needs_input (`RawNotification permission_prompt`), failed (`RawStopFailure`), planning (`launchOpts{permissionMode: plan}` + prompt submit), working (prompt submit); variants `-dark`, `-light` via `withPrefs` | none |
| shell-activity.spec.ts "createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline)" | `three-states` (no id in `shellsBusy`) | none |
| shell-activity.spec.ts "the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3)" | `three-states`, focus the first card, `dashboard.send({type:"shellActivity", sessionId, busy:true})` → measure busy; `busy:false` → measure done (the dashboard shows the tick because the shell surface is not selected). If the port must instead record busy in the snapshot, the rig needs a `paneActivityLister` seam on `renderTmux` (none today) | none for the pushed-frame route |
| shell-activity.spec.ts "the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3)" | as above under new `three-states-tiles` = `withPrefs(three-states, {"view": "tiles"})` | none |
| shell-activity.spec.ts "under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2)" | `three-states` + `three-states-tiles`, `page.emulateMedia({reducedMotion:"reduce"})` before `open`, pushed busy frame | none |
| shell-activity.spec.ts "without a reduced-motion preference the busy spinner still spins, on the mainhead and in a tile footer (REQ-2, edge case 1)" | same without the emulation | none |
| added-dirs.spec.ts "a session that has reported no directories has no suffix and a panel showing Location alone, with no title on the readout (E2, REQ-7, W2, States: No data yet)" | `three-states` (every session has `addedDirs: []`) | none |
| added-dirs.spec.ts "hovering the header readout opens a tooltip listing Location then Added directories · 2 …" | new `added-dirs-two`: launch checkout + two scratch checkouts (`r.dir`, one on `feature-x`), bind with `Cwd`, then a status post whose `workspace.added_dirs` leads with the launch dir and names both, then `r.repoTick`. Requires `claudecodetest.StatusLineFullOpts` to gain an `AddedDirs []string` (and `CurrentDir`/`ProjectDir`) option — today `statusLineBase` hardcodes `added_dirs: []` | none once the option exists |
| added-dirs.spec.ts "while Claude is in an added checkout the panel lists the ↳ row and the added list together (REQ-7, W3)" | new `added-dirs-moved`: `added-dirs-two` plus `EnvelopedHookInDirectory` into the first added checkout, `repoTick` | none |
| added-dirs.spec.ts "a long folder name ellipsizes before the +N suffix, which stays fully visible and the header keeps its fit invariants at every width (W4, REQ-6)" | new `added-dirs-long`: launch folder `"long-folder-name-for-wrapping-".repeat(2)` with two added checkouts; the spec's `suffixProblems`/`nameEllipsized` evaluators move to `web/render/helpers/added-dirs.ts` and `mainheadFitProblems` is already in `web/render/helpers/card-location.ts` | none |
| added-dirs.spec.ts "a few added directories fit below the readout…" / "fifteen added directories do not fit…" / "twenty-two added directories are all listed…" (edge case 15 ×3) | new `added-dirs-plain-3`, `added-dirs-plain-15`, `added-dirs-plain-22`: N plain (non-git) scratch directories under the rig root, reported in one status post; the normaliser must strip the rig root from each path as it does for `directory` | none |

## Borderline

- **terminal.spec.ts "focusing a dead session shows the dead surface, never the terminal region, without ever attempting a socket (REQ-13)"** and **actions.spec.ts "a focused ended session shows the dead surface with its last snapshot and a Resume button in the cap (E6)"**: the structure (endbar `/^ended /`, cap "session ended", Resume present, Resume and `.acts-row` at opacity 1, no `Terminal:` region, zero terminal sockets opened) is a property `dead-session` shows today. The `pre.snapshot` text is the daemon's real capture and the harness answers the pane GET with its own 404. Kept as journeys; a `web/render/dead-surface.spec.ts` for the structure and the opacity pin (review Critical 1) would let both drop those clauses. Serving `GET …/pane` from a fixture recording, as the reader's GETs are, would move the snapshot text too.
- **actions.spec.ts E13 "no snapshot captured"**: in the harness the cap reads exactly this because every pane GET is a 404, so a render test would pass for the wrong reason. The claim is the daemon's `no_snapshot` for a pane killed before its first tick; journey.
- **actions.spec.ts E14 Major 4 (dead focused session, connection down)** and **resilience.spec.ts "a steady daemon-down produces no #banner mutations…"**: both are display for the lost state. A `dashboard.close()` on the harness (Playwright's `WebSocketRoute.close()`) would make the lost banner and the disabled buttons a property; the reconnect half would still need a second socket the harness serves. Not exposed today; journeys.
- **resilience.spec.ts pop-out "connecting…"**: a property of a page whose socket never says hello; needs an `open(scenario, {withholdHello: true})` option. Journey until then.
- **plain-shell.spec.ts "a tile footer renders the same segment as the mainhead, scoped per session (REQ-4)"**: the pressed/unpressed defaults per tile are a property (`three-states-tiles`), but the test's point is that only the clicked tile flips, and the click is a shell POST. Journey.
- **terminal.spec.ts "a live rail card offers no End button, and the mainhead's End opens the confirm dialog without moving focus into a terminal (REQ-5, REQ-7, INV-3)"**, **"clicking an ended session's card shows the dead surface and leaves keyboard focus on that card… (E5, REQ-6)"**, **"Enter on a keyboard-focused rail card selects the session but leaves focus on the card (E7, REQ-8)"**: focus management and the dialog are client-side and reproducible on `three-states`/`dead-session` with the harness's silent terminal socket. Kept journey because each asserts against a mounted live surface whose readback the E2E awaits (the harness surface stays blank); the "focus never lands in a terminal" claims would hold trivially against a blank surface only if the surface still mounts, which it does. Reasonable to port as a second pass once a render `terminal-focus` helper exists; not in this batch.
- **terminal.spec.ts INV-1 (b) "a sessionUpsert for the focused session doesn't move keyboard focus…"**, **rename.spec.ts "a status-line post arriving mid-edit leaves the open mainhead field's value and focus untouched (REQ-15, INV-4)"**, **added-dirs.spec.ts "with the mouse resting on the readout an added directory's new branch shows in the open panel…"** and **"…the session ending drops the open panel's Added directories section…"**: each is "a later frame re-renders without disturbing X", which `dashboard.send({type:"sessionUpsert", session})` reproduces exactly. The E2E versions prove the daemon emits that frame for the cause named (hook, status post, checkout, End), which is the half worth keeping. Journeys; candidates for a pushed-frame render test if the suite wants the re-render invariant without the daemon.
- **shell-activity.spec.ts "a tick clears itself about 3s later…"**: with pushed `shellActivity` frames and `settleFor(page, 3_000)` this is a property of the indicator's auto-clear. Kept journey because the title's claim includes the real busy→done flip from `sleep 2`; the 3 s clear alone could ride the geometry render tests.
- **claude-version.spec.ts E4 "stub whose --version fails: the dashboard still serves and the readout reads exactly claude unknown…"**: the readout for `status: "unknown"` (text, `title` hint, no glyph) is a property on `claude-version-unknown`; "still serves" (INV-3) is the daemon's. Keep as journey, or split so the readout assertions ride the REQ-5 render test above.
- **theme.spec.ts E5 (head hint first paint)**: classified property, but it is the only port here that depends on a reload inside the harness; if `page.reload()` loses the installed clock or routes, keep it E2E.
- **theme.spec.ts E7/E8 (pane ground re-themes live)** and **INV-1 (resolution walk)**: a pushed `prefs` frame changes `data-theme`, a pushed `claudeTheme` frame changes the family, and the pane's `--term` ground is a computed style — the whole walk is reproducible without a daemon. The E2E versions also prove the PUT persists and the poll reads a file. Kept journey; the per-theme pane ground could be added to the `theme-dark`/`theme-light` render tests cheaply.
- **actions.spec.ts E9 "Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card"**: the dialog's "ends the session first" copy and its `--danger` (not `--rose`) fill are a property on `three-states`; the DELETE and the focus fall-through are the journey. Kept whole.
- **rename.spec.ts E4 "clicking the mainhead title opens a prefilled, selected field; Enter commits…"**: the prefilled, fully selected field is a property (`three-states`); the commit is the journey. Kept whole, as E7 (Escape) already covers the open-field half as a property.
- **added-dirs.spec.ts E1**: `+2`, the `--fg-muted` colour, no suffix on the rail card or tile and their unchanged hover titles are all display for `added-dirs-two`; the branches-from-disk wire check is the journey. Kept whole, mirroring card-location E4's treatment; the render `added-dirs-two` test from E2 can carry the suffix colour and rail/tile clauses so E1 could later drop them.
- **drop.spec.ts REQ-8 "a drop on a live pane whose socket is not open…"**: the not-connected notice is a client-side branch; the harness always accepts the terminal socket, so it needs a `refuseTerminalSockets` option. Journey.
- **added-dirs.spec.ts W5 "with the daemon down the panel still opens…"**: the panel reads client state, so "no daemon" is the render tier's normal condition; what the test actually proves is that the lost-connection render does not clear `addedDirs`. Needs `dashboard.close()`; journey.
- **shell.spec.ts "GET /api/state returns exactly the empty-daemon snapshot…"**, **theme.spec.ts "GET /api/state always carries prefs.theme and claudeTheme.family"**, **ingest.spec.ts (all five)**, **ingest-envelope.spec.ts**, **added-dirs.spec.ts "an added subdirectory of an ordinary checkout reads isWorktree false…"**: none asserts the DOM; each is a daemon API or sqlite contract that a Go handler/store test (`D*`) could falsify at lower cost. They cross the live seam (real tmux for the envelope and worktree tests), so they stay journeys here, but they are logic-adjacent and flagged for the daemon-tests owner.

## Notes

- **Census false negatives.** `e2e-lint.sh --census` counts a test as daemon-free when no line matches its daemon identifiers; `auth.spec.ts` (4/7), `embedded.spec.ts` (3/4), `shell.spec.ts` (3/4) and `claude-version.spec.ts` (3/8) reach the daemon through `daemon().baseURL`/`daemon().dashboardUrl` closures and `startDaemon`, which the pattern misses. Of those, only shell.spec.ts's three and claude-version's readout tests are real properties; auth and embedded are entirely journeys.
- **Duplicates.** `subagent-status.spec.ts` "a prompt-less idle_prompt leaves an idle card idle with no attention (E1, REQ-1)" and `state-transitions.spec.ts` "an idle_prompt with no prompt_id after /clear changes nothing (REQ-4 regression)" post the same payload (`rawIdlePromptWithoutPromptId`) after the same idle turn and assert the same fields; one can go. `shell.spec.ts` "shows the Claude Code version reported by hello" is a weaker copy of `harness.spec.ts` "(R-smoke) hello". `terminal.spec.ts` REQ-13 and `actions.spec.ts` E6 both pin endbar/endcap/snapshot on the dead surface (by kill vs by End). `plain-shell.spec.ts`'s two dead-session REQ-12 variants (Focus, tile) are deliberate siblings. `actions.spec.ts` E13 and the session-lifecycle E7/W3 test share the "kill before any hook" fixture.
- **Titles claiming more than asserted.** `plain-shell.spec.ts` E4's comment says "reattaching … repaints the same session's scrollback" but the test only checks `tmuxSessions()` contains the target after the view round trip. `actions.spec.ts` E13 is best-effort by its own comment (the kill races the first poll tick). `added-dirs.spec.ts` "twenty-two added directories are all listed…" records that rows past the viewport are off-screen; it asserts the DOM row count and the panel top only. `shell-activity.spec.ts` "with two sessions' shells busy at once, exactly those two…" never asserts the third's indicator stays absent after a hold, only at one read. `claude-version.spec.ts` E6's "clicking the glyph leaves it … unchanged" asserts text and visibility, not the `title`/`aria-label` after the click.
- **Load-sensitive waits.** Every surfaces test waits up to 15 s for `MUSTER-STUB-READY`; `subagent-status.spec.ts`'s three interrupt tests bound a ~5 s poll at 10 s and one holds `settleFor(6_000)`; `state-transitions.spec.ts`'s `persisted()` adds a 500 ms hold per stays-unchanged check (14 tests); `resilience.spec.ts` holds `settleFor(5_000)` for the mutation count and 15 s for banners; `claude-version.spec.ts`'s two 7 s-delay tests each cost ≥7 s by construction; `shell-activity.spec.ts` runs real `sleep 2`/`sleep 5`/`sleep 15`/`sleep 30` and waits on a ~3 s auto-clear; `added-dirs.spec.ts` sets `repoPoll: "200ms"` file-wide and uses `toPass` re-hover loops up to 15 s; `plain-shell.spec.ts` E10 and `actions.spec.ts` INV-5/Major 1 hold 1 s.
- **Fixture oddities.** `dead-session`'s `endedAt` is one minute after the page clock's start, so any "ended … ago" copy renders a negative age; the ported "ended now" test depends on how `formatAge` buckets that. `three-states` has an idle, a working and a needs_input session but no failed or planning one, so the badge-colour port needs its own scenario. No fixture carries a `view: "tiles"` pref, a non-`follow` theme, a non-`verified` Claude version, a busy shell or a non-empty `addedDirs`.
- **Rig and test-helper gaps the ports need.** `claudecodetest.StatusLineFullOpts` has no `AddedDirs` (its `workspace` is hardcoded); the render rig has no `ThemeConfig` (family is always "unknown"; push `claudeTheme` frames instead) and no pane-activity lister (push `shellActivity` frames instead); the rig can set `claudeVersion.current` per scenario with the seam `newRenderRig` already uses. `web/render/helpers/style.ts` already has `tokenColor` (the render-side `resolvedCssVar`) and `card-location.ts` has `mainheadFitProblems`; `suffixProblems`/`nameEllipsized` from added-dirs and the theme/dialog locators from `web/e2e/helpers/theme.ts` would move to render helpers with the E2E helper re-exporting them.
- **Harness options that would unlock the remaining display claims** (not needed for this batch's ports): `dashboard.close()` (lost banner, disabled actions, W5 panel), `open(..., {withholdHello})` (pop-out connecting), serving `GET …/pane` from a recording (dead-surface snapshot text, the held "loading last screen…"), and refusing terminal sockets (drop's not-connected notice).
