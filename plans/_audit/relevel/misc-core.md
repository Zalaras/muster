# E2E re-levelling — misc core (2026-10-20)

The core batch of `classify-core.md` moved, per `../test-audit-2026-10-20-relevel.md` § Method:
the ten files below that held a display property — `shell`, `type-scale`, `claude-version`
(connection), `actions`, `rename`, `drop`, `issue-capture` (issue), `theme`, `shell-activity`
(surfaces) and `added-dirs` (card-location). The classifier's other thirteen files
(`state-transitions`, `reconcile`, `ingest`, `ingest-envelope`, `subagent-status`, `plain-shell`,
`terminal`, `shell-scroll`, `shell-keys`, `auth`, `resilience`, `embedded`,
`masthead-update-dot`; 135 tests) are journeys throughout and are untouched; their tables in
`classify-core.md` stand. Counts are tests as Playwright runs them (`for`-loops expanded).

Render specs: `web/render/{connection,actions,rename,drop,issue,theme,surfaces}.spec.ts`, plus an
added-dirs section in `web/render/card-location.spec.ts`. Helpers: `web/render/helpers/{actions,
connection,drop,issue,rename,added-dirs}.ts` are new; `theme.ts` and `surfaces.ts` widened. The
E2E helpers (`connection.ts` new; `added-dirs.ts`, `dropfiles.ts`, `issue.ts`, `session.ts`,
`shell.ts`, `shellinput.ts`, `terminal.ts`, `theme.ts`) re-export them, so each locator is written
once for both tiers. Scenarios in `internal/server/renderfix_scenarios_misc.go`;
`claudecodetest.StatusLineFullOpts` gained `AddedDirs`. Every property moved keeps its title, its
computed-property checks, its widths and its host views; the deliberate differences are listed
under each file. 125 tests → 90 E2E, 34 render, 0 vitest, 1 deleted as a duplicate.

Three harness facts decided the ports: the dashboard adopts `view` and `theme` only from the
daemon's broadcast, so a view is the `prefs` frame a `view: "tiles"` fixture recorded (pushed with
`dashboard.send`) and a theme is its own fixture; the shell indicator reads `snapshot.shellsBusy`,
so the done tick is the idle twin's snapshot pushed after the busy one; and every `/api/**` is a
404, so "no request sent" is proved by the request log and the pane GET never yields a capture.

## `shell.spec.ts` — 4 tests → 1 E2E, 2 render, 0 vitest (1 deleted)

| Test | Criteria | Level | Reason |
|---|---|---|---|
| renders the masthead, connection status and empty sessions state after the WS handshake | Testable UI Elements | **property** | heading, "connected" after the fixture hello, the rail's "No sessions yet" — `empty` |
| renders both usage readouts as the word unknown, never an empty gauge | REQ-16 | **property** | usage null in `empty` (asserted off the fixture) |
| shows the Claude Code version reported by hello | hello readout | **deleted** | a weaker regex copy of `web/render/harness.spec.ts` "(R-smoke) hello", which asserts the fixture's exact `installed` |
| GET /api/state returns exactly the empty-daemon snapshot object once authenticated | snapshot shape | journey | the daemon's API body |

## `type-scale.spec.ts` — 1 test → 0 E2E, 1 render, 0 vitest (file deleted)

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10) | ui-text-and-focus E10, REQ-6, REQ-7 | **property** | computed root `font-size` and a card's `.name` — `three-states` (the card is `Alpha`, where the E2E launched `type-scale-e10`) |

The file is deleted; `docs/features/connection/spec.md`'s `e2e:` list and the `tests:` pointer of
kb:adr/theme-type-scale-tokens-15px-root follow it to `web/render/connection.spec.ts`.

## `claude-version.spec.ts` — 8 tests → 3 E2E, 5 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9) | E1, edge 9 | **property** | `claude-version-below` (installed `2.0.0`, the E2E stub's own default) |
| stub answering the verified ceiling: readout reads claude <ceiling> with no glyph in the readout (E2, Edge Case 9) | E2 | **property** | `empty`; the E2E's `observedVersionRange()` oracle is the fixture's `hello.claudeCode.verified`, and the test asserts `installed === verified` |
| stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9) | E3 | **property** | `claude-version-above`; `installed === incrementPatch(verified)` from the fixture |
| stub whose --version fails: the dashboard still serves and the readout reads exactly claude unknown with the check-failed hover text, no glyph (E4, Edge Case 1) | E4, INV-3 | journey | "still serves" is the daemon's; kept whole |
| POST /api/issue/captures snapshot carries exactly the four claudeCode keys, status below, matching hello (E5) | E5 | journey | capture POST body |
| the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6) | E6 | **property** | DOM structure and an inert click — `claude-version-below` |
| a stub whose --version takes 7 s: the daemon serves within 3 s and the open dashboard's readout flips to the version with no reload (claude-version-watch REQ-1, REQ-2) | REQ-1, REQ-2 | journey | startup timing and the daemon's push |
| a stub whose --version takes 7 s: the Settings button holds its x while the readout flips from claude unknown to the version and warning glyph, no reload (claude-version-watch REQ-5) | REQ-5 | **property** | `claude-version-unknown`, then the `claudeCode` frame built from `claude-version-below`'s own `hello.claudeCode` (kb:anchor/ws.claude-code) — never hand-written; the readout's and `#settings-button`'s boxes compared across the flip |

The E2E's inline `claudeVersionReadout`, `UNKNOWN_HINT`, `waitForHello` and `incrementPatch` moved to
`web/render/helpers/connection.ts`; the three remaining journeys import the first three through
the new `web/e2e/helpers/connection.ts`.

## `actions.spec.ts` — 16 tests → 13 E2E, 3 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| End from the mainhead ends only the focused session; a live neighbour is unaffected (E5, INV-2) | E5, INV-2, REQ-9 | journey | End POST, tmux oracle, attention sort |
| Cancel and Escape close both End and Remove dialogs without sending any request (E10) | E10 | **property** | `three-states`, `Alpha` focused by click; the request log counts zero mutations; the `getState` alive re-read (nothing can change it) became "Stop is still enabled" |
| a focused ended session shows the dead surface with its last snapshot and a Resume button in the cap (E6) | E6, REQ-13 | journey | the snapshot text is the daemon's capture (see Borderline) |
| Ending a focused session closes its terminal socket and never reopens one while dead (INV-5) | INV-5 | journey | socket count across End |
| clicking Resume in the ended cap relaunches the session with the same claude id in its argv (E7) | E7 | journey | relaunch, argv oracle |
| Resume is refused 409 not_resumable when another alive session already holds the same claude id (REQ-12) | REQ-12 | journey | daemon 409 |
| Resume is refused 409 not_resumable when the same claude id is held by a resume-bound session (REQ-12) | REQ-12 | journey | daemon 409 |
| the resume SessionStart lands the card in idle with no attention or failure carried over (E8, E15, INV-6) | E8, E15, INV-6 | journey | resume POST then hook |
| a session with no captured snapshot shows 'no snapshot captured' under the ended cap (E13) | E13 | journey | the daemon's `no_snapshot` 404 (the harness's own 404 shows the same text for the wrong reason) |
| Removing a live session ends it first, warns in the dialog copy, and moves focus to the top card (E9) | E9, REQ-10, REQ-11 | journey | DELETE, tmux oracle (see Borderline) |
| action buttons are disabled while the daemon connection is down (E14) | E14 | journey | kill, restart |
| action buttons are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect (E14, Major 4) | E14, Major 4 | journey | needs a closed `/ws` |
| ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6) | REQ-10, REQ-13, Major 6 | **property** | `dead-session`: `elapsedSeconds` clamps the negative age to the "now" bucket, so no `dead-session-now` scenario was needed. The mainhead `.meta` and the endbar assert `ended now` and never `now ago` as before; the cap asserts never `now ago` and reads `no snapshot captured`, since its `now · last state:` prefix is only composed for a captured pane and the harness's pane GET is a 404 — that one positive clause is the E2E's, see Notes |
| the dead surface shows a 'loading last screen…' interim state before the pane fetch resolves (REQ-13, Minor 9) | REQ-13, Minor 9 | journey | a held real pane GET |
| a late resume SessionStart hook after End does not revive the session or open a terminal socket (INV-1, Major 1) | INV-1, Major 1 | journey | hook on a dead row |
| a session with no bound Claude id shows a disabled Resume control with a stated reason, on the mainhead and the dead cap (E7, W3) | session-lifecycle E7, W3 | **property** | the classifier's `dead-unbound` is `stop-resume-pair`'s second session (launched, pane killed before any hook, `claudeSessionId: null`), so no separate scenario; the null id is asserted off the fixture where the E2E read `getState` |

## `rename.spec.ts` — 16 tests → 14 E2E, 2 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| clicking the mainhead title opens a prefilled, selected field; Enter commits the new title everywhere (E4) | E4 | journey | the commit PUT (see Borderline) |
| a status-line post's session_name never overrides an active title override (E5) | E5, INV-1 | journey | status post vs override |
| clearing the field reverts the title to Claude's last-known name (E6) | E6 | journey | PUT with empty title |
| pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7) | E7 | **property** | `three-states`, `Alpha` (the E2E's `rename-e7`) focused by click, the request log counts zero title PUTs |
| an override survives a daemon restart, on the mainhead/rail card, and in Tiles on both the strip card and the promoted tile's header (E8, E9) | E8, E9 | journey | restart, strip promote |
| renaming a live tile's header updates that tile, leaves a neighbour tile untouched, and reaches Focus's rail/mainhead; the header is undraggable only while editing (E11, E12) | E11, E12 | journey | PUT, view switch |
| a header drag still reorders the Tiles grid and opens no rename textbox (E13) | E13 | journey | reorder PUT |
| a status-line post arriving mid-edit leaves the open mainhead field's value and focus untouched (REQ-15, INV-4) | REQ-15, INV-4 | journey | status post mid-edit (see Borderline) |
| switching to Focus via cmd-backslash while a tile rename is open sends no PUT and leaves the title unchanged (REQ-15) | REQ-15 | journey | the view must actually switch (prefs broadcast) |
| clicking the masthead Focus button while a tile rename is open sends no PUT and leaves the title unchanged (REQ-15) | REQ-15 | journey | same |
| switching to Tiles while the mainhead rename is open sends no PUT and leaves the title unchanged (REQ-15) | REQ-15 | journey | same |
| clicking the pressed view segment while its own rename editor is open commits instead of cancelling, on both the mainhead and a tile header (E5) | claude-status-fixes E5, REQ-6 | journey | title PUT count 1, prefs PUT count |
| a right-click on the inactive Tiles segment while a mainhead rename is open does not cancel it — no click fires, the blur commits, and the view stays Focus (E6, REQ-7) | E6, REQ-7 | journey | blur commit PUT |
| clicking an unrelated control (New session) still commits an open mainhead rename, per ordinary REQ-14 blur semantics | REQ-14 | journey | blur commit PUT |
| a rename works on a dead session (REQ-16) | REQ-16 | journey | PUT on a dead row |
| a 300-character unbroken mainhead title ellipsises in place and never pushes End, Resume or Remove out of view at 900px and 1400px | title fit | **property** | `long-title` (a 300-character status-line `session_name`, asserted off the fixture as 300 unbroken characters); the same `page.evaluate` geometry at both widths |

## `drop.spec.ts` — 11 tests → 8 E2E, 3 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| dropping a file that exists in the session directory pastes its escaped path, echoes it after Enter, and moves focus into the pane (E1, E11, REQ-2, REQ-11) | E1, E11 | journey | locate + PTY |
| a dropped filename containing a space is pasted backslash-escaped (E2, REQ-4) | E2, REQ-4 | journey | locate + PTY |
| dropping a file with no match anywhere on disk shows the not-located notice and pastes nothing (E3) | E3 | journey | the daemon's locate miss |
| dropping a file that matches two identical on-disk copies shows the ambiguous notice with the count (E4) | E4 | journey | the daemon's walk |
| shows a transient 'Locating …' notice while the locate request is in flight, then clears it on success (REQ-6) | REQ-6 | journey | a held real locate |
| dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1) | E5, REQ-1 | **property** | the document-level guard — `three-states`, `Alpha` focused so a live surface is mounted as in the E2E |
| dropping text/plain with no files pastes the text verbatim (E6, REQ-10) | E6, REQ-10 | journey | PTY echo |
| a file over 50 MiB shows the too-large notice and issues no locate request (E7) | E7, REQ-7 | **property** | `three-states`; the surface's visibility replaces the E2E's `MUSTER-STUB-READY` readback wait (the harness's socket is silent); the request log counts zero locates |
| in Tiles, a drop on one live tile pastes only into that tile, leaving the other tile's content unchanged (E8, INV-4) | E8, INV-4 | journey | locate + PTY |
| a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) | E9, REQ-8 | **property** | `dead-session` (Focus shows `#dead-surface` without a click); the page-wide leak check and the request log as before |
| a drop on a live pane whose socket is not open shows the not-connected notice and issues no request (REQ-8) | REQ-8 | journey | needs a closed terminal socket |

## `issue-capture.spec.ts` — 13 tests → 12 E2E, 1 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the Issue button is visible in both Focus and Tiles (REQ-1) | REQ-1 | **property** | `empty` for Focus; Tiles via the `prefs` frame `shell-idle-tiles` recorded, pushed with `dashboard.send` (the masthead click's PUT would 404 and switch nothing), with the Tiles segment asserted pressed so the second half is not vacuous |
| every other test (E1–E8, REQ-6, edge cases 2 and 20, Minor 1, 3 and 4) | — | journey | the dialog fires `POST /api/issue/captures` on open; Submit enables only with a held capture; filing goes through the fake GitHub |

## `theme.spec.ts` — 18 tests → 13 E2E, 5 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2) | E2, REQ-9 | **property** | `empty` |
| a fresh daemon with no config file paints Instrument/unknown and checks Follow Claude Code (E3) | E3 | **property** | `empty` (`prefs.theme: follow`, family unknown, asserted off the fixture) |
| choosing Dark sets html[data-theme=dark] without a reload and changes body's background from Instrument (E4) | E4, REQ-9 | journey | the PUT persists server-side |
| after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5) | E5, REQ-11 | **property** | `theme-dark`: the first load writes the `muster.theme-hint` entry from the broadcast; `addInitScript`, `page.reload()` — the harness's routes and clock survive the reload, verified by the test passing with the same DOMContentLoaded tag |
| after choosing Dark, a daemon restart plus reload still shows dark with the Dark radio checked (E6) | E6 | journey | restart |
| Focus: choosing Light re-themes the chrome and the live pane ground within one render, no reload (E7, INV-3 Focus) | E7, INV-3 | journey | live change via PUT + broadcast (see Borderline) |
| Tiles: choosing a theme re-themes both live tiles' grounds (E8, INV-3 Tiles multi-instance) | E8, INV-3 | journey | same |
| with a fast poll, flipping the Claude config from dark to light changes data-claude-family within 2s; data-theme stays fixed under an explicit pref, then switches under Follow (E9) | E9, INV-2 | journey | the daemon's poll |
| with pref pinned to Dark, flipping the Claude config to light changes only the pane ground, not data-theme (E10, INV-2) | E10, INV-2 | journey | poll |
| choosing Follow after Dark, with family light, resolves to light and persists follow across a reload (E11) | E11 | journey | PUT persistence |
| killing the daemon leaves both theme attributes unchanged while the banner shows; restarting re-applies them (E12, INV-4) | E12, INV-4 | journey | kill, restart |
| the header's disabled Resume button's computed style differs from the enabled Stop button, in each theme (E13) | E13 | **property** | `stop-resume-pair`, `-dark`, `-light` opened in turn inside the one test, each theme asserted on `html[data-theme]`, where the E2E checked a radio; the same colour, border and cursor comparisons |
| badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14) | E14 | **property** | `four-badges`, `-dark`, `-light` likewise; the token colour via `tokenColor` (the render-side `resolvedCssVar`) |
| a scratch Claude config with malformed JSON yields data-claude-family=unknown with no error banner or console error (E15) | E15 | journey | the daemon reads the file |
| theme resolution walks follow×dark -> dark×dark -> follow×light -> light×dark (INV-1) | INV-1, INV-2 | journey | poll + PUTs |
| a rejected PUT /api/prefs never persists or applies; the Settings dialog closes on daemon-down and the checked radio only ever reflects the broadcast (INV-7, INV-4) | INV-7, INV-4 | journey | kill, restart, `/api/state` |
| GET /api/state always carries prefs.theme and claudeTheme.family (REQ-10, REQ-15) | REQ-10, REQ-15 | journey | API body |
| an open pop-out follows a live theme change without reload (E5, REQ-9) | general-cleanup E5, REQ-9 | journey | two pages on one broadcast |

## `shell-activity.spec.ts` — 12 tests → 7 E2E, 5 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a shell running a silent foreground command shows a spinner in both the mainhead and the tile footer, then a tick once it finishes (REQ-2, REQ-3, REQ-14) | REQ-2, REQ-3, REQ-14 | journey | tmux process state → busy flag |
| the spinner stays visible on the shell segment while the user is on the Claude surface, becomes a tick when the work finishes, and clicking shell clears the tick immediately (User Flows 1-4, REQ-2, REQ-3, REQ-4) | REQ-2–4 | journey | real busy transition; the click is a shell POST |
| a tick clears itself about 3s later when the shell surface was already selected when the work finished (REQ-4, User Flow 5) | REQ-4 | journey | real busy transition (see Borderline) |
| a shell that exits while busy leaves no spinner and no tick behind (E7, edge case 1) | E7 | journey | tmux kill of the shell |
| a daemon restart mid-command clears the shell activity indicator to nothing rather than to a tick (E8, edge case 4) | E8 | journey | restart |
| with two sessions' shells busy at once, exactly those two segments show spinners and a third idle shell shows none (E11, INV-4) | E11, INV-4 | journey | three real shells |
| a shell surface superseded by a second window while busy still tracks the spinner through /ws (E12) | E12 | journey | two contexts, real supersede |
| createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline) | INV-3 | **property** | `shell-idle` (a shell spawned through the real route, `shellsBusy: []`) |
| the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3) | rail-card-improvements-2 E7, E8, INV-3 | **property** | `shell-busy` (the daemon's poller tick over a pane listing that reports the shell running `sleep`, `shellsBusy: [1]`), then `shell-idle`'s snapshot pushed for the done tick — the fixture route, not the classifier's hand-written `shellActivity` frames |
| the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3) | E7, E8, INV-3 | **property** | `shell-busy-tiles` then `shell-idle-tiles`; the classifier's `three-states-tiles` was not needed |
| under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2) | shell-pane-fixes REQ-2 | **property** | `emulateMedia` before `open`; `shell-busy`, then Tiles via the `prefs` frame `shell-busy-tiles` recorded (the E2E's Meta+Backslash is a prefs PUT the dashboard only adopts from the broadcast), then `shell-idle-tiles`'s snapshot for the done tick |
| without a reduced-motion preference the busy spinner still spins, on the mainhead and in a tile footer (REQ-2, edge case 1) | REQ-2, edge 1 | **property** | same, without the emulation |

## `added-dirs.spec.ts` — 26 tests → 19 E2E, 7 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a status post with two added git directories shows +2 on the Focus header's folder line in --fg-muted, with the wire's repos read from disk, and the rail card and tile header show no suffix and keep their hover text (E1, …) | E1 | journey | the wire's branches are read from real checkouts (see Borderline) |
| a status post whose list is only the launch directory, under any spelling of it, leaves no suffix and an empty list, and a later post with directories brings it back (D1, D3, INV-2, INV-3) | D1, D3 | journey | normalisation per post |
| a post with no added_dirs key leaves the suffix and the list as they were, and a later shorter list lowers it (D2, REQ-1, edge case 1) | D2 | journey | per-post semantics |
| a relative entry resolves against the launch directory and a symlinked duplicate collapses to the first position (D4, REQ-2, edge cases 4 and 5) | D4, REQ-2 | journey | path resolution on disk |
| hovering the header readout opens a tooltip listing Location then Added directories · 2 with each folder, branch and path, and moving away closes it (E2, REQ-7, REQ-9, W2) | E2, REQ-7, REQ-9, W2 | **property** | `added-dirs-two`; the E2E's wire check (`[main, feature-x]` via `GET /api/state`) is asserted off the fixture's `addedDirs`; rows, `pointer-events`, body-appended, open/close as before |
| a session that has reported no directories has no suffix and a panel showing Location alone, with no title on the readout (E2, REQ-7, W2, States: No data yet) | E2, W2 | **property** | `three-states`, `Alpha` (`addedDirs: []`) |
| while Claude is in an added checkout the panel lists the ↳ row and the added list together (REQ-7, W3) | REQ-7, W3 | **property** | `added-dirs-moved` (the move into the first added checkout, asserted off the fixture) |
| an added plain directory counts in +N and shows as its folder and path with no branch, gains the branch when it becomes a checkout and loses it again on a detached HEAD (E7, REQ-5, REQ-5a, edge case 17) | E7, REQ-5a | journey | `git init`/detach under the poll |
| a checkout of a new branch in an added directory shows in the panel within one repo-poll tick (E5, REQ-5) | E5, REQ-5 | journey | poll |
| an added directory removed under a live session stays listed with its last-known branch while a neighbour's checkout still refreshes (D9, REQ-5, edge case 12) | D9 | journey | directory vanishes under the poll |
| stopping the session removes the suffix and the panel's Added section (E3, REQ-3, INV-1, REQ-6) | E3, REQ-3 | journey | End POST |
| stopping one of two sessions that both have added directories empties only that one's list, and a straggler status post cannot refill the dead session (E3, D5, D7, INV-1, edge case 8) | E3, D5, D7 | journey | End, straggler post |
| a pane that dies without a SessionEnd empties the list through liveness, with the neighbour's list untouched (REQ-3, D5, INV-1, edge case 11) | REQ-3, D5 | journey | tmux kill, liveness |
| a pane that is gone when the daemon starts is ended by reconcile with an empty list (REQ-3, D5, INV-1) | REQ-3, D5 | journey | restart |
| a resumed session starts with no directories until its first status post reports them again (REQ-3, D5, edge case 9) | REQ-3, D5 | journey | resume |
| restarting the daemon while the session is alive keeps +2 and the branches in the panel (E4, REQ-4, D8) | E4, REQ-4, D8 | journey | restart |
| a /clear pair applied SessionEnd first / SessionStart first keeps the list until the next post re-reports it, and the new id's post can change it (REQ-4, D6, edge cases 6 and 7) ×2 | REQ-4, D6 | journey | hook pair ordering |
| a long folder name ellipsizes before the +N suffix, which stays fully visible and the header keeps its fit invariants at every width (W4, REQ-6) | W4, REQ-6 | **property** | `added-dirs-long` (the 60-character folder); `suffixProblems` and `nameEllipsized` moved from the spec to `web/render/helpers/added-dirs.ts`; the same four widths |
| with the daemon down the panel still opens on hover with the last-known directories and branches (W5, REQ-7, edge case 16) | W5, REQ-7, edge 16 | journey | needs the lost-connection state |
| with the mouse resting on the readout an added directory's new branch shows in the open panel without reopening it (REQ-5, REQ-7, review cycle 1 browser Minor 1) | REQ-5, REQ-7 | journey | checkout under the poll (see Borderline) |
| with the mouse resting on the readout the session ending drops the open panel's Added directories section and keeps the Location row (REQ-3, REQ-7, INV-1, review cycle 1 browser Minor 1) | REQ-3, REQ-7 | journey | End POST (same) |
| an added subdirectory of an ordinary checkout reads isWorktree false and one inside a linked worktree reads true, each naming its checkout's top level (correctness Major 1, REQ-5) | Major 1, REQ-5 | journey | the daemon's git reading; no DOM asserted |
| a few added directories fit below the readout, so the panel sits under it inside the viewport (edge case 15, REQ-7) | edge 15 | **property** | `added-dirs-plain-3` at 1280×800 |
| fifteen added directories do not fit below the readout, so the panel moves to the top of the viewport and still shows every row inside it (edge case 15, REQ-7, kb:adr/focus-location-panel-lists-every-row) | edge 15 | **property** | `added-dirs-plain-15` |
| twenty-two added directories are all listed in the panel, none capped and no +K more line (edge case 15, kb:adr/focus-location-panel-lists-every-row) | edge 15 | **property** | `added-dirs-plain-22` |

The plain scenarios' first cut named each directory `plain-directory-number-NN`; under the persona
root the normaliser rewrites paths to, every row stayed on one line and fifteen rows fit under the
readout (the panel reached 631 px against the 792 px threshold). The E2E's rows had a one-line
folder name and a two-line temp-dir path, so the names became `plain-directory-number-NN-wrapping-
its-path`: the folder stays on one line, the path wraps once, fifteen rows reach 707 px (too tall
for below the readout, inside the viewport from the top) — the E2E's own geometry, measured, not
assumed. The `edge case 15` placement constants moved to the helper as `EDGE_GAP`/`ANCHOR_GAP`.

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `claude-version-below`, `claude-version-above`, `claude-version-unknown` | the daemon's held Claude Code verdict set through the seam `newRenderRig` uses — installed `2.0.0` below the pinned floor, one patch over the pinned ceiling, and the unknown state (`installed: null`) | `connection.spec.ts` E1, E6, E3, REQ-5 |
| `long-title` | one live session whose 300-character unbroken title is Claude's own `session_name` on the status line (the daemon caps an override at 100) | `rename.spec.ts` title fit |
| `theme-dark` | `empty` under `theme: "dark"` (`withPrefs`) | `theme.spec.ts` E5 |
| `stop-resume-pair`, `-dark`, `-light` | a live bound session (`enabled-e13`, an enabled Stop) and a dead session no SessionStart bound (`disabled-e13`, a disabled Resume), under the three themes (Instrument is `follow` with the family unknown) | `theme.spec.ts` E13, `actions.spec.ts` E7/W3 |
| `four-badges`, `-dark`, `-light` | one card per coloured state — needs input (a permission prompt), failed (a StopFailure), planning (a prompt in plan mode), working (a prompt) — under the three themes | `theme.spec.ts` E14 |
| `added-dirs-two`, `added-dirs-moved`, `added-dirs-long` | one bound session in `repo` (or the 60-character folder) with two added checkouts, the second on `feature-x`, reported by a status post whose `added_dirs` leads with the launch directory, then the repo poll; `moved` adds a main-agent hook pair into the first added checkout | `card-location.spec.ts` E2, W3, W4 |
| `added-dirs-plain-3`, `-15`, `-22` | N plain (non-git) added directories named to wrap once in the panel, reported in one status post | `card-location.spec.ts` edge case 15 |
| `shell-busy`, `shell-idle`, `shell-busy-tiles`, `shell-idle-tiles` | one idle session with a plain shell spawned through the real route; `busy` runs the shell-activity poller's one tick over a pane listing that reports the shell running `sleep` on a canonical tty (its lister and tty seams, since the rig runs no tmux), so `shellsBusy` lists it; the `-tiles` twins under `view: "tiles"` | `surfaces.spec.ts` (all five), `issue.spec.ts` (the tiles prefs frame) |

Rig additions: `reportAddedDirs` (a status line carrying `workspace.added_dirs`, then `repoTick`),
and `claudecodetest.StatusLineFullOpts.AddedDirs` (nil keeps the default empty list; the
`workspace` block is now emitted when either `CurrentDir` or `AddedDirs` is set). Every existing
fixture is byte-identical after the change.

## Deleted Tests

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `shell.spec.ts` | renders the masthead, connection status and empty sessions state after the WS handshake | heading, connected status, the rail's exact empty text | `web/render/connection.spec.ts`, same title |
| `shell.spec.ts` | renders both usage readouts as the word unknown, never an empty gauge | both readouts read unknown for a null usage | same title |
| `shell.spec.ts` | shows the Claude Code version reported by hello | `/claude\s+2\./` on the readout | `web/render/harness.spec.ts` "(R-smoke) hello" (exact `installed`); not re-authored |
| `type-scale.spec.ts` | the root font size is 15px, and a rail card's title renders at the fs-base step, on a fresh load (E10) | root 15px, `.name` 15px | `web/render/connection.spec.ts`, same title |
| `claude-version.spec.ts` | default stub answers below the verified floor: readout reads claude 2.0.0 with the update-remedy glyph (E1, Edge Case 9) | text, the update glyph's name and title | same title |
| `claude-version.spec.ts` | stub answering the verified ceiling: readout reads claude <ceiling> with no glyph in the readout (E2, Edge Case 9) | exact text, no glyph | same title |
| `claude-version.spec.ts` | stub answering one patch above the verified ceiling: the not-tested glyph is visible and its name does not mention updating (E3, Edge Case 9) | text, glyph name/title, no "update" | same title |
| `claude-version.spec.ts` | the readout holds no button or link, and clicking the glyph leaves it visible and unchanged (E6) | no button/link, inert click | same title |
| `claude-version.spec.ts` | a stub whose --version takes 7 s: the Settings button holds its x while the readout flips from claude unknown to the version and warning glyph, no reload (claude-version-watch REQ-5) | hint while unknown, the flip, empty title after, Settings x and readout width held | same title |
| `actions.spec.ts` | Cancel and Escape close both End and Remove dialogs without sending any request (E10) | four open/close cycles, zero mutating requests | `web/render/actions.spec.ts`, same title |
| `actions.spec.ts` | ended copy reads 'ended now', never 'ended now ago', on the mainhead and dead surface (REQ-10, REQ-13, Major 6) | meta and endbar `ended now`, never `now ago` anywhere (the cap's positive prefix clause: see Notes) | same title |
| `actions.spec.ts` | a session with no bound Claude id shows a disabled Resume control with a stated reason, on the mainhead and the dead cap (E7, W3) | disabled Resume + reason on both, no Stop, null id | same title |
| `rename.spec.ts` | pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7) | field gone, title intact, zero PUTs | `web/render/rename.spec.ts`, same title |
| `rename.spec.ts` | a 300-character unbroken mainhead title ellipsises in place and never pushes End, Resume or Remove out of view at 900px and 1400px | acts inside the padding box, `[Stop, Remove]` in view, `.rename` clipped, at both widths | same title |
| `drop.spec.ts` | dropping a file on the masthead never navigates away and leaves the rail visible (E5, REQ-1) | URL unchanged, rail visible after dragover+drop | `web/render/drop.spec.ts`, same title |
| `drop.spec.ts` | a file over 50 MiB shows the too-large notice and issues no locate request (E7) | exact notice, zero locates | same title |
| `drop.spec.ts` | a drop on a dead session's surface is swallowed silently — no notice, no request, no navigation (E9, REQ-8) | URL, no filename anywhere, no notice phrase in any status, zero locates | same title |
| `issue-capture.spec.ts` | the Issue button is visible in both Focus and Tiles (REQ-1) | visible, opacity 1, in both views | `web/render/issue.spec.ts`, same title |
| `theme.spec.ts` | clicking Settings opens a dialog named Settings with exactly four radios in Follow/Instrument/Dark/Light order (E2) | legend, four radios in order | `web/render/theme.spec.ts`, same title |
| `theme.spec.ts` | a fresh daemon with no config file paints Instrument/unknown and checks Follow Claude Code (E3) | both attributes, Follow checked | same title |
| `theme.spec.ts` | after choosing Dark, a reload shows data-theme=dark on the very first paint via the head hint script (E5) | DOMContentLoaded tag reads dark after reload | same title |
| `theme.spec.ts` | the header's disabled Resume button's computed style differs from the enabled Stop button, in each theme (E13) | colour and border differ, cursor not-allowed, three themes | same title |
| `theme.spec.ts` | badge colors for Needs-Input, Failed, Planning and Working cards match their theme's token, in every theme (E14) | four badges at their tokens, three themes | same title |
| `shell-activity.spec.ts` | createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline) | name "shell", no indicator | `web/render/surfaces.spec.ts`, same title |
| `shell-activity.spec.ts` | the shell busy/done indicator computes a square while busy and a tick wider than tall once done, on the Focus mainhead (E7, E8, INV-3) | busy box square, done box wider than tall | same title |
| `shell-activity.spec.ts` | the shell busy/done indicator computes the same shapes in a tile footer (E7, E8, INV-3) | same, in the tile footer | same title |
| `shell-activity.spec.ts` | under reduced motion the busy spinner does not spin, on the mainhead and in a tile footer (REQ-2) | `animation-name: none` while busy on both hosts, done tick visible | same title |
| `shell-activity.spec.ts` | without a reduced-motion preference the busy spinner still spins, on the mainhead and in a tile footer (REQ-2, edge case 1) | `shellact-spin` on both hosts | same title |
| `added-dirs.spec.ts` | hovering the header readout opens a tooltip listing Location then Added directories · 2 … (E2, REQ-7, REQ-9, W2) | `+2`, branches, no title, rows, pointer-events, body-appended, open/close | `web/render/card-location.spec.ts`, same title |
| `added-dirs.spec.ts` | a session that has reported no directories has no suffix and a panel showing Location alone, with no title on the readout (E2, REQ-7, W2, States: No data yet) | folder line, no suffix, no title, Location alone | same title |
| `added-dirs.spec.ts` | while Claude is in an added checkout the panel lists the ↳ row and the added list together (REQ-7, W3) | `+2`, the ↳ row and the two added rows | same title |
| `added-dirs.spec.ts` | a long folder name ellipsizes before the +N suffix, which stays fully visible and the header keeps its fit invariants at every width (W4, REQ-6) | suffix drawn and hit-testable, header fit at 1280/1024/768/600, name ellipsized at 600 | same title |
| `added-dirs.spec.ts` | a few added directories fit below the readout, so the panel sits under it inside the viewport (edge case 15, REQ-7) | placement below, inside the viewport | same title |
| `added-dirs.spec.ts` | fifteen added directories do not fit below the readout, so the panel moves to the top of the viewport and still shows every row inside it (edge case 15, REQ-7, …) | too tall for below, at the top edge, 16 rows inside | same title |
| `added-dirs.spec.ts` | twenty-two added directories are all listed in the panel, none capped and no +K more line (edge case 15, …) | 23 rows, no `+K more`, at the top edge | same title |

## Borderline, left in place

- `actions.spec.ts` E6 (the dead surface with its last snapshot) and `terminal.spec.ts` REQ-13: the
  structure is `dead-session`'s, the snapshot text is the daemon's capture and the harness's pane
  GET is a 404. Kept whole; a recorded pane GET would move the structure and the text together.
- `actions.spec.ts` E9 (Remove ends first, warns, moves focus): the dialog copy and its `--danger`
  fill are a property on `three-states`; the DELETE and the focus fall-through are the journey.
  Kept whole.
- `rename.spec.ts` E4 (the prefilled, selected field then Enter commits): the open-field half is a
  property the ported E7 already covers; kept whole for the commit.
- `rename.spec.ts` REQ-15/INV-4, `added-dirs.spec.ts`'s two mouse-resting tests and
  `terminal.spec.ts` INV-1 (b): "a later frame re-renders without disturbing X" is reproducible
  with a pushed `sessionUpsert`; the E2E versions prove the daemon emits that frame for the cause
  named. Kept as journeys.
- `shell-activity.spec.ts` "a tick clears itself about 3s later…": the self-clear alone would ride
  `surfaces.spec.ts` with the idle snapshot and `settleFor(page, 3_000)`; the title claims the real
  busy→done flip from `sleep 2`. Kept as a journey.
- `theme.spec.ts` E7/E8 (the pane ground re-themes live) and INV-1 (the resolution walk): pushed
  `prefs` and `claudeTheme` frames would reproduce the whole walk; the E2E versions also prove the
  PUT persists and the poll reads a file. Kept as journeys.
- `added-dirs.spec.ts` E1: `+2`, the `--fg-muted` colour and the untouched rail card and tile are
  display for `added-dirs-two`; the branches-from-disk wire check is the journey. Kept whole,
  mirroring card-location E4; the render E2 test carries the panel rows, not the suffix colour.
- `claude-version.spec.ts` E4: the readout for `status: "unknown"` is a property
  `claude-version-unknown` shows (and the REQ-5 render test asserts the text and hint before its
  flip); "the dashboard still serves" is the daemon's. Kept whole.
- `resilience.spec.ts` "a steady daemon-down produces no #banner mutations…", `actions.spec.ts` E14
  Major 4, `added-dirs.spec.ts` W5, `drop.spec.ts` REQ-8 (socket not open), the pop-out
  "connecting…": each needs a harness knob (`dashboard.close()`, `withholdHello`, refused terminal
  sockets) that does not exist. Journeys.

## Notes

- **Every property the classifier named moved**; nothing was left E2E against its list. One test
  was deleted rather than ported (`shell.spec.ts`'s hello readout, a weaker copy of the harness
  smoke test), as the classifier proposed.
- **One clause could not cross.** `actions.spec.ts` Major 6 asserted the dead cap reads
  `now · last state:`; that prefix is composed only for a captured pane (`deadSurfaceText`'s `ok`
  branch), and the harness answers every pane GET 404, so the cap reads the confirmed-negative
  `no snapshot captured`. The render test asserts the cap never reads `now ago` and the mainhead
  and endbar copy exactly as before; the cap's positive prefix is now covered only through
  `deadCapPrefix`'s Vitest coverage (`web/src/sessions/card.test.ts`). Serving the pane GET from a
  fixture recording (the Borderline note above) would restore it.
- **The scenario the classifier called `dead-unbound` is `stop-resume-pair`'s second session**, so
  the actions E7/W3 port and the theme E13 port share one fixture family rather than two.
- **Two views, no chord.** The issue REQ-1 and the surfaces tile-footer tests reach Tiles by pushing
  the `prefs` frame a `view: "tiles"` fixture recorded (`shell-idle-tiles`, `shell-busy-tiles`),
  since the dashboard adopts the view only from the broadcast; the E2E's masthead click and
  Meta+Backslash both go through `PUT /api/prefs`. Keyboard behaviour that the tests themselves
  claim (Escape in the dialogs and the rename field) still uses real key presses.
- **The done tick comes from a snapshot, not a hand-written frame.** `shell-idle`'s snapshot pushed
  after `shell-busy` runs `restoreIdle`, which shows the tick and schedules its self-clear
  (kb:adr/surfaces-snapshot-restored-tick-always-self-clears); the geometry is read while the tick
  is up, as the E2E read it between `sleep 2` ending and the 3 s clear.
- **Fixture facts worth knowing.** `dead-session` and `stop-resume-pair`'s dead session ended after
  the page clock's start; `elapsedSeconds` clamps the negative age to 0, so their copy is the "now"
  bucket, which is exactly what Major 6 is about. `four-badges`'s planning session was bound with
  `permissionMode: plan` and given a prompt; its working twin a prompt alone.
- **Gate rerun.** The first `make render-test` failed only the fifteen-directory placement test (the
  panel fit below the readout, see the added-dirs section); the names were lengthened, the three
  plain fixtures regenerated, and the full gates rerun green. `make check` first failed golangci's
  shadow check on the scenario file's `plain, err :=` (foundation code), fixed in the card-location
  commit.
