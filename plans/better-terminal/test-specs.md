# E2E Test Specs: better-terminal

**Plan**: better-terminal
**Mode**: fix (attempt 1)
**Pack**: kb: pack 39624 words (budget 30000)
**Verdict**: pass
**Tests created**: 28 (web/e2e/terminals.spec.ts) + 1 existing assertion updated (web/e2e/shell.spec.ts)
**Live run**: 28/28 passing in terminals.spec.ts (+ shell.spec.ts and shell-activity.spec.ts green)

Collection: `npx playwright test --list` from `web/` → `Total: 719 tests in 63 files`, no error; `sh scripts/e2e-lint.sh` → `e2e-lint: clean`; `npx tsc --noEmit -p .` clean.

## Tests

Fixture plan: `daemon` per test (the plan's header). The kill-shutdown test takes `-on-exit=kill` from `test.use({ daemonOptions })` on its describe, which is still the `daemon` fixture. Pin run: `make web-build build`, then `npx playwright test e2e/terminals.spec.ts -g "two simultaneous POST shell calls"` → `1 passed (3.8m)` (the 3.8 min is the gate-lock wait on another worktree's shared hold; the test itself took 2.4 s).

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/terminals.spec.ts | New terminal from the panel spawns shell 2 in the session directory, shows it, and leaves terminal 1's command running | REQ-1, 8, 9, 12 / E1 | switch order by accessible name; ▾ → New terminal → 201 `{target,n:2,name:"shell 2"}`; panel closes; `shell` title `shell 2`, count `2`; `pwd` is the session dir; terminal 1 still `sleep` per tmux and `running` in the panel | collection-only |
| web/e2e/terminals.spec.ts | choosing a row shows that terminal with its own earlier output, and the command left running keeps running | REQ-2 / E2 | each terminal's own marker visible, the other's absent; terminal 1 still `sleep` | collection-only |
| web/e2e/terminals.spec.ts | after claude is selected one click on shell shows the terminal last shown; a reload and a second window show the lowest-numbered | REQ-3 / E3 | last-shown per window; reload and second window show `shell 1`; title absent while claude selected | collection-only |
| web/e2e/terminals.spec.ts | when the last-shown terminal ended while claude was selected shell shows the lowest-numbered running one, and with none running it starts one | REQ-3 / E3 | external kill while on claude; `shell` shows `shell 1`, no new spawn; none left → `POST /shell` `created:true` | collection-only |
| web/e2e/terminals.spec.ts | renaming shows the name in the panel in every window, as the shell title, and across a reload | REQ-4, 10 / E4 | field focused and prefilled; typing replaces; row and `title` read `build`; `/api/state` names; second window's open panel updates; reload keeps it | collection-only |
| web/e2e/terminals.spec.ts | Esc and blur cancel a rename, an empty or whitespace-only save restores shell N, and the field stops at 40 characters | REQ-4, 19 / E4 | Esc leaves panel open; Tab (blur) cancels; empty and `"   "` give `shell 2`; 45 typed gives value length 40 | collection-only |
| web/e2e/terminals.spec.ts | a rename in progress keeps its field, focus and typed text while another terminal's busy flip is broadcast | REQ-4, 17 | field node, focus and value survive a `terminals` broadcast and a >1 s tick; then saves | collection-only |
| web/e2e/terminals.spec.ts | × on an idle terminal ends it at once; × on a busy one asks first and ends it only on Close terminal | REQ-5 / E8 | confirm named `Close shell 2?` with the plan's body; Cancel (Enter on focused button) leaves it running; confirm ends it; idle × shows no dialog | collection-only |
| web/e2e/terminals.spec.ts | closing the terminal on screen in Focus shows the lowest-numbered other, and closing the last returns to claude | REQ-6, INV-5 / E5 | 3 terminals, close shown `shell 3` → `shell 1` (not 2); count tracks; last close → claude, no tmux terminals, panel shows only New terminal | collection-only |
| web/e2e/terminals.spec.ts | closing the terminal on screen in a tile shows the lowest-numbered other, and closing the last returns to claude | REQ-6, INV-5 / E5 | same, in a tile footer | collection-only |
| web/e2e/terminals.spec.ts | exit typed in the terminal on screen drops its row from an open panel and the count in a second window, and the first window falls back | REQ-6 / E6 | second window's open panel loses `shell 2` and the count; first falls back to `shell 1` | collection-only |
| web/e2e/terminals.spec.ts | a terminal killed outside Muster while docs is selected leaves the panel and count and the reader stays | REQ-6, edge 6 / E6 | external kill with docs selected; panel and count update; reader stays | collection-only |
| web/e2e/terminals.spec.ts | with the panel open a command starting and finishing flips its row between idle and running without reopening | REQ-17 / E9 | tmux-send-keys stimulus; row idle → running → idle, panel never reopened | collection-only |
| web/e2e/terminals.spec.ts | the shell segment stays busy while any terminal is busy and turns to a tick only when the last one finishes | REQ-13, INV-4 | one busy → busy; both; interrupt one → still busy over a hold; interrupt last → `done` | collection-only |
| web/e2e/terminals.spec.ts | ending one terminal leaves a sibling attached in another window and the Claude pane untouched | INV-1, D3 | DELETE terminal 2; second window's terminal 1 socket not superseded or closed and still types; Claude socket count and echo unchanged | collection-only |
| web/e2e/terminals.spec.ts | closing a terminal in one session's tile leaves another session's busy terminal and both Claude panes untouched | INV-1, D3 | two sessions in Tiles; B stays busy, attached, titled; A falls back; both Claude panes exist | collection-only |
| web/e2e/terminals.spec.ts | the same terminal in a second window supersedes the first, and a different terminal does not | edge 12 / E10 | different terminal → no "another window", first still types; same terminal → overlay | collection-only |
| web/e2e/terminals.spec.ts | Remove of a session with three terminals ends all of them and leaves another session's terminal | REQ-7, INV-3 / E7 | no `muster-<id>-shell*` left; other session's remains; `snapshot.terminals` entry forgotten | collection-only |
| web/e2e/terminals.spec.ts | a daemon restart kills every terminal, closes an open panel, disables the switch while down and lists no terminals after reconnect | REQ-7, 14, INV-3, edges 13, 17 | kill: panel closed, ▾/claude/shell/docs disabled; restart: no terminals on the socket, `terminals` empty, panel shows only New terminal | collection-only |
| web/e2e/terminals.spec.ts | kill shutdown › the restart-impact list and a kill shutdown cover every terminal of every session | REQ-7, INV-3, D6 / E11 | 4 terminals on 2 sessions → restart-impact lists 4 entries; `-on-exit=kill` restart leaves none | collection-only |
| web/e2e/terminals.spec.ts | the lowest free number is reused after a close, and a renamed terminal's number comes back as shell N | REQ-12, edges 3, 4 | close renamed 2 of 3; New terminal is `shell 2`, no `build` | collection-only |
| web/e2e/terminals.spec.ts | two windows choosing New terminal at once get distinct numbers, and two clicking shell on an empty session get one terminal | edges 1, 2, D2 | both race → one terminal; both New terminal → `[1,2,3]` | collection-only |
| web/e2e/terminals.spec.ts | every window's panel rows and count equal the daemon's list after a spawn, rename, close and exit | INV-2, REQ-17 | `panelMatchesDaemon` (daemon state, tmux and both windows re-read in the retry) after each input | collection-only |
| web/e2e/terminals.spec.ts | terminals open, run and list on a dead session as on a live one | dead-session state | ended session: shell, New terminal, count, panel | collection-only |
| web/e2e/terminals.spec.ts | the terminal endpoints answer as the contract says for spawn, rename, close and an unauthenticated caller | REQ-4, 12, 19, D2, D4 | POST /shell, /shells, PUT name (trim, clear, 40/41, bad body, 404s), DELETE (204, 404s), number reuse, 401 | collection-only |
| web/e2e/terminals.spec.ts | two simultaneous POST shell calls on a session with no terminal produce one | D2, edge 1 | exactly one `created:true`, one tmux terminal | ran-green-at-authoring: `1 passed (3.8m)` (a regression pin: `POST /shell` is already idempotent; the new `n` field is not asserted here) |
| web/e2e/terminals.spec.ts | a keyboard user opens ▾ with Enter and closes it with Esc, and focus returns to the same ▾ node across render ticks | REQ-15 | focus plus real keys; node identity and `document.activeElement` across >1 s ticks; `aria-expanded` | collection-only |
| web/e2e/terminals.spec.ts | a keyboard user can rename, switch, add and close terminals with Enter and Space, and the ▾ node survives the broadcasts | REQ-1, 2, 4, 5 | ✎, row, New terminal, × each activated by key; ▾ node survives | collection-only |
| web/e2e/shell.spec.ts | GET /api/state returns exactly the empty-daemon snapshot object once authenticated | protocol delta (existing) | `shellsBusy: []` → `terminals: {}`, every other assertion intact | collection-only |

Existing specs that now exercise the change (no edit needed; the switch locators are exact-name and the count span is `aria-hidden`): `web/e2e/plain-shell.spec.ts`, `web/e2e/shell-activity.spec.ts` (comment-only edit: `shellsBusy` → `snapshot.terminals`), `web/e2e/shell-scroll.spec.ts`, `web/e2e/shell-keys.spec.ts`, `web/e2e/update.spec.ts`, `web/e2e/reconcile.spec.ts`. plain-shell's route mock on the shell POST uses `route.continue()`, so the new `n` field cannot break it.

## Deleted Tests

None.

## Fixture Changes

- `web/e2e/helpers/shell.ts`: `shellTmuxTarget(sessionId, n = 1)`, additive; `muster-<id>-shell` for 1, `muster-<id>-shell-<n>` for n ≥ 2.
- `web/e2e/helpers/terminals.ts` (new): locators by the plan's Testable UI Elements roles and names (▾ `button` "Terminals", panel `dialog` "Terminals", row `button`, `Rename <name>`, `Close <name>`, `textbox` "Terminal name", `New terminal`, confirm `dialog` "Close <name>?"), journey steps (`newTerminal`, `chooseRow`, `renameTerminal`, `clickClose`), and oracles (`stateTerminals` from `/api/state`, `tmuxTerminalTargets`, `tmuxForegroundCommand`, `panelMatchesDaemon`). `tmuxSendKeys` is a stimulus only.
- No hook or status-line payload is synthesized beyond the existing `envelopedSessionStart` builder, used to bind a session before End.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | New terminal …shell 2…; dead-session; keyboard; E10 |
| REQ-2 | choosing a row…; keyboard |
| REQ-3 | after claude is selected…; when the last-shown terminal ended… |
| REQ-4 | renaming shows…; Esc and blur…; rename in progress…; endpoints; keyboard |
| REQ-5 | × on an idle…; keyboard |
| REQ-6 | closing in Focus; closing in a tile; exit typed…; killed outside Muster while docs |
| REQ-7 | Remove with three; daemon restart; kill shutdown |
| REQ-8, 9 | New terminal …shell 2… (order, name, count); count asserted throughout |
| REQ-10 | renaming shows…; the close and choose tests (title) |
| REQ-11 | R5 (render); state words asserted in E1, E8, E9 |
| REQ-12 | New terminal …; lowest free number…; endpoints |
| REQ-13 | the shell segment stays busy while any terminal is busy…; plus existing shell-activity.spec.ts |
| REQ-14 | a daemon restart kills every terminal… (R4 is the render test) |
| REQ-15 | keyboard opener test; click-outside is render |
| REQ-16, 18 | not E2E (R2, R3) |
| REQ-17 | panel-open flip test; rename in progress; INV-2 test |
| REQ-19 | Esc and blur… (field); endpoints (API) |
| INV-1 | the two INV-1 tests |
| INV-2 | every window's panel rows… |
| INV-3 | Remove; restart; kill shutdown |
| INV-4 | the shell segment stays busy… |
| INV-5 | closing in Focus; closing in a tile |
| E1–E11 | by the rows above; E4's reload, E6's second window, E10 and E11 each have a test |

## Handoff

- **E11 is covered by its observable twin.** The kill-shutdown prompt needs a TTY on stdin and the harness is non-TTY (`ask` behaves as `leave`). The test asserts `GET /api/update/restart-impact` lists one entry per terminal (`internal/server/update.go` says it reads the same set as the on-exit prompt) and that a `-on-exit=kill` restart leaves no `muster-*-shell*` session. The literal prompt count is D6's unit test, not E2E.
- **Locator assumptions the plan does not pin** (validate repairs them if wrong): the row container is the row button's parent (`xpath=..`), holding the state word, ✎ and ×; the terminal surface keeps `aria-label="Shell: <session title>"` whichever terminal is shown; the confirm body contains the plan's sentence `<name> is running a command. Closing it ends the command.`; a row switch leaves the panel closed, while × and rename may leave it open (helpers re-open only when `aria-expanded` is not `true`).
- **Plan wording to confirm in review**: after a daemon kill the plan says all four segments are disabled; the restart test asserts that.
- **Not covered E2E, on purpose:** the session-12 prefix case (needs twelve sessions on one daemon; D3 unit test), WS pre-upgrade errors on `/ws/shell/{id}/{n}` (daemon test), W4's swallowed 404 (web unit test), edges 11 and 14 (the plan marks them untested).
- No wire shape was invented. Terminal fields (`n`, `name`, `busy`) come from the plan's Protocol Contract; no probe is needed.
- No change requested to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Notes

- All 28 new tests except the pin fail against the current tree by design (no ▾, no `/shells`, no `snapshot.terminals`).
- Each test is heavy (real shells, some with two windows); validate should soak `terminals.spec.ts` at N=10 and watch the two-window and daemon-restart tests first.


## Validate (attempt 1)

Rebuilt with `make web-build build`. `npm run e2e -- e2e/terminals.spec.ts`: 27 passed, 1 failed (`terminals.spec.ts:686`, `expect(claudeSockets.liveCount).toBe(1)` received 0), confirming web-impl's measurement. Every other test, including the `Live run` column's collection-only rows, passed live; their Live run is now `ran-green` (soak below).

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | ending one terminal leaves a sibling attached in another window and the Claude pane untouched (INV-1, D3) | `claudeSockets.liveCount` 0 at the post-DELETE check | Window B loads with `claude` selected (the selection is not persisted), so it attached the Claude surface and, by the one-live-client law (kb:adr/surfaces-one-live-client-per-attach-target), superseded window A's Claude socket before any DELETE | Reordered setup: A stays on its shell; B loads and moves to `shell 1` (its Claude socket detaches); only then A clicks `claude`, waits for `MUSTER-STUB-READY` and `liveCount === 1`. Reload and tracker re-creation removed (tracker created before the click) | INV-1, D3: after `DELETE shells/2`, B's terminal 1 socket still live and types, A's Claude socket count still 1 and echoes `stub-echo:hello`, no "another window"/disconnected text. Every original assertion kept, none weakened; no absence assertion was changed |

No assertion was deleted, skipped, or weakened.

### Soak

- `make e2e-soak SPEC=web/e2e/terminals.spec.ts N=10` -> `280 passed (6.9m)`
- `make e2e-soak SPEC=web/e2e/shell.spec.ts N=10` -> `10 passed (9.3s)` (filter to the one edited test)
- `make e2e-soak SPEC=web/e2e/shell-activity.spec.ts N=10` -> `70 passed (2.7m)`

Final re-run of terminals + shell + shell-activity together: `36 passed (59.6s)`. `npx playwright test --list`: `Total: 719 tests in 63 files`; `sh scripts/e2e-lint.sh`: clean; `tsc --noEmit` clean.

Gate-lock note: twice a run waited up to 4 min on the lock held by the `muster-diff-viewer` worktree; one run gave up with "gatelock: busy ... not a test failure" and was simply re-run.

## Handoff

None.

## Fix Attempt 1 (review cycle 1)

**Pack**: kb: pack 39624 words (budget 30000)

Issue addressed: correctness Critical 1 `[e2e-specs]` (`terminals.spec.ts` E8 typed `sleep 600` straight after `startWithTerminals(…, 2)`). The cause was a test race: the `terminals` broadcast makes the count read `2` before the client has handled the 201 and the new xterm's socket is `OPEN`, so keys went to terminal 1's still-mounted surface or were dropped by `pane.ts`'s `onData`.

### Category fix

New helpers in `web/e2e/helpers/terminals.ts`: `awaitTerminalReady(host, daemon, {sessionId, n, name}, region)` and `typeInTerminal(...)`. Ready means all of:
1. `expectShown` (shell pressed, title is the terminal's name, surface visible);
2. tmux `#{session_attached}` on `muster-<id>-shell[-n]` is >= 1 (poll on the daemon, not the browser);
3. the shell has drawn its prompt (`tmux capture-pane` last non-blank line's first token is non-empty), and that token appears in the browser's region, so frames are reaching this xterm (a still-mounted sibling would not show terminal N's prompt before attach). This covers the browser review's "keys sat un-run until the shell finished starting".

Every `typeInShell` that follows a spawn, switch or surface selection now goes through `typeInTerminal` in `terminals.spec.ts` (E1 x2, E2 x3, E8, E6 exit, INV-1 sibling, INV-1 tile busy, E10, INV-2 `build` exit at the formerly unguarded `chooseRow` site, dead-session). The one remaining `typeInShell` is the Claude pane's `hello`, which already waits for `MUSTER-STUB-READY` and a live socket.

The same unguarded type-after-select shape existed in `web/e2e/shell-activity.spec.ts` (pre-existing spec; the scoped shell run flaked `E11` once in a 6-file run and once in a first N=10 soak: `indicatorB` never `busy`, session 2's `sleep 5` typed before its socket was open). All 8 sites there now call `awaitTerminalReady` in place of the bare `toBeVisible` before clicking and typing with real keys. Nothing else in those tests changed.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | × on an idle terminal ends it at once; × on a busy one asks first… (E8) | `running` never appears on `shell 2` row (red once in ~470 runs) | typed before terminal 2 was shown and attached | `typeInTerminal` waits for ready first | REQ-5 unchanged: the `running` row, confirm text, cancel keeps it, confirm ends it |
| 2 | every `typeInShell` site listed above (terminals.spec.ts) | same unguarded shape, latent | as above | `typeInTerminal` | each test's own assertions unchanged |
| 3 | all 7 shell-activity tests that type into a shell, incl. E11 | `indicatorB` never `busy` (1 in 70) | `toBeVisible()` only, typed before attach | `awaitTerminalReady` before `click`+`type` | REQ-2/3/4, E7, E8, E11, E12 unchanged; the visibility check is subsumed by `expectShown` |

No assertion was deleted, skipped, or weakened. No timeout was raised; no absence assertion was changed.

### New user-visible behaviour in this cycle's implementation fixes

- A terminal ending by itself now broadcasts the remaining list at once on PTY EOF (`daemon-implementation.md` Fix Attempt 2). REQ-6's E6 test ("exit typed in the terminal on screen…") already runs a self-exit and asserts the row drops from window B's open panel, the count disappears there, and window A falls back to `shell 1`; INV-2's test also ends `build` by `exit`. I did not add an "immediately" assertion: the 1 s poll would also deliver the list inside the 15 s expect window, so any timing assertion would be a window-tuned wait, not a falsifiable check at this level. Daemon unit tests own the nudge itself.
- Popover options: render-tests' (done). Panel row reorder through `reconcileKeyedOrder`: display property, covered by the existing panel journeys (E2/E4/INV-2 row order) and render tests.

### Soak and runs

- `make e2e-soak SPEC=web/e2e/terminals.spec.ts N=10` -> `280 passed (6.5m)`
- `make e2e-soak SPEC=web/e2e/shell-activity.spec.ts N=10` -> `70 passed (2.4m)` (after the fix; the pre-fix soak failed 1 of 70 on E11)
- Scoped shell specs plain run (terminals, shell, plain-shell, shell-keys, shell-scroll, shell-activity, terminal): `92 passed (1.5m)`
- `npx playwright test --list`: `Total: 719 tests in 63 files`; `npm run -s lint` clean; `tsc --noEmit` clean; e2e-lint clean.

### Handoff

None.
