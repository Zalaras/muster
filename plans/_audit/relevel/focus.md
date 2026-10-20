# Re-levelling batch: focus (effort-header, focus-header, sessions, focus-marker)

Render spec `web/render/focus.spec.ts`, helper `web/render/helpers/focus.ts`; scenarios in
`internal/server/renderfix_scenarios_focus.go`. The DOM locators and layout oracles moved out
of `web/e2e/helpers/{effort,focus-header,session,terminal}.ts` into the render helper, which
those E2E helpers re-export. Written by the orchestrating session from the porting agent's
tree after the agent's session ended; counts are Playwright `--list` counts.

## `effort-header.spec.ts` — 41 tests → 29 E2E, 12 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a launched session with no status post yet reads <model> (…), a dead one that never reported reads the model with no brackets | REQ-6, E5, E6 | **property** | header text for three fixture states — `effort-header` |
| a launch with max whose first post reports high shows the strip 'Asked for max — Opus 4.5 started at high.' … and tints the effort warn | REQ-7/8, E8, INV-E1 | **property** | strip sentence and tint for a warned session — `effort-header` |
| the strip is a full-width status line directly under the header and above the terminal, ⚠ hidden from the accessible tree, Dismiss on its right | REQ-8 | **property** | strip geometry and a11y tree |
| a launch with high whose first post carries no effort key shows the strip ending 'has no effort setting…' and the model with no brackets | REQ-7/8, E9 | **property** | strip sentence for the no-effort model |
| at {1280,800,700,616,600}px the strip wraps inside the window with Dismiss in view, and the model with its bracketed effort is never clipped (×5) | REQ-6, REQ-8 | **property** | width sweep of the strip |
| in the {instrument,dark,light} theme the --warn family is defined, --warn sits outside amber's hue band, and the strip and the tint use it (×3) | REQ-12, REQ-8 | **property** | token colours per theme pref — `effort-warned-*` |
| a later post with another level changes the header to it with no strip, and a post with no effort key drops the brackets… | REQ-5/6, E7 | journey | status posts change the display |
| a status post that changes only the effort never changes state, stateSince, attention, failure, alive, permissionMode or compactions | INV-E5 | journey | daemon state invariants |
| a changed effort is broadcast as exactly one session upsert and an unchanged one as none | REQ-5, D5 | journey | broadcast count |
| a level outside the five is shown and stored verbatim and compared verbatim against the request | REQ-5, D5 | journey | daemon storage and comparison |
| effort survives Stop, a /clear rebind and a daemon restart… | INV-E4 | journey | restart, rebind |
| a launch whose first post reports the level it asked for shows no strip, and a later post at another level never raises one | REQ-7, E10, INV-E2 | journey | the first-post check is the daemon's |
| a default launch shows no strip after its first post… | REQ-7, E10, INV-E2 | journey | as above |
| a bystander's first report never sets or clears another session's warning | INV-E2 | journey | cross-session daemon logic |
| Dismiss removes the strip and the tint, leaves the effort and the model as they were, and persists the clear | REQ-9, E8 | journey | DELETE round-trip and persistence |
| Dismiss is reachable and activates from the keyboard | REQ-9 | journey | the activation is the DELETE (borderline, see below) |
| the header's effort node survives render ticks and a repeat post of the same level… | REQ-6, REQ-8 | journey | a repeat post drives the tick |
| DELETE /api/sessions/{id}/effort-warning answers 204, broadcasts one upsert, answers 204 again with none, and 404 unknown_session… | REQ-9 | journey | API contract |
| DELETE … without the UI cookie is refused 401 unauthorized and leaves the warning set | REQ-9 | journey | API auth |
| with two warned sessions, Dismiss on one removes its strip and tint in both dashboards at once… | REQ-9 | journey | two clients, one broadcast |
| an undismissed strip survives a page reload, appears in a second dashboard on the same daemon, and survives a daemon restart | REQ-7, E11, INV-E2 | journey | persistence, restart |
| a launch whose check is still pending when the daemon restarts is still checked on the first post after it | INV-E2 | journey | restart |
| a /clear rebind leaves a set warning and a pending check as they were… | INV-E2, INV-E3 | journey | rebind |
| with the daemon killed the header keeps its effort and the strip stays, a Dismiss then fails into the action-error line, and works once the daemon is back | REQ-9 | journey | kill and restart |
| a Dismiss the daemon answers with a 500 leaves the strip and the tint and reports the failure…, and a retry succeeds | REQ-9 | journey | daemon error path |
| a Dismiss whose request is aborted before any answer leaves the strip and the tint and reports the failure | REQ-9 | journey | request abort |
| the size note's row count drops when the strip appears and returns when it is dismissed, and the terminal never sits under the strip | REQ-13, E14, INV-E6 | journey | a live PTY's size note |
| a terminal that holds keyboard focus keeps the same focused node when the strip appears and across a render tick | REQ-13, INV-E6 | journey | a live terminal's focus across a post |
| the strip belongs to the Focus view only: Tiles shows none, and Focus shows it again | REQ-8 | journey | the view switch is a pref PUT (borderline, see below) |
| the Resume button on a session whose last post reported medium spawns the pane with --effort medium… | REQ-10, E12 | journey | resume argv |
| the Resume button passes no --effort for a session that never reported… | REQ-10, INV-E4 | journey | resume argv |
| a Resume-button resume of a warned session keeps the existing warning… | REQ-7, INV-E2 | journey | resume |
| a Resume-button resume of a session whose warning was dismissed raises none after its first post | REQ-7, INV-E2 | journey | resume |
| a Resume-button resume of a session that ended before its first post cancels the pending check… | REQ-7, REQ-10 | journey | resume |
| Resume-button resumes of two sessions each pass their own level and leave the other's untouched | REQ-10 | journey | resume argv |

## `focus-header.spec.ts` — 35 tests → 13 E2E, 22 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| sweeping the window from 2000px to 600px and back in 16px steps, the Focus header holds INV-1 to INV-4 and INV-8 and retraces its give-way order: {11 state-table rows} (×11) | E3, REQ-1/2/3/7 | **property** | the state table's rows are fixture sessions — `focus-header-rows-{a,b}` |
| the same sweep for the row with the `shell` segment selected (×1) | E3 | journey | selecting the shell segment spawns a shell over the API; stays E2E |
| a 35-character folder at a 1700px header shows its whole folder line on one row | E3, REQ-1 | **property** | one width, one state |
| at 640px a 300-character title keeps the readout beside it at its floor and the model stacks under the readout… | REQ-2/3, INV-2/4 | **property** | stacked band for a fixture row |
| sweeping the window from 2000px to 600px in 16px steps, a Stop leaves Remove, the Stop/Resume button, the surface switch and the header where they were and shows the ended age under the model at every width: {5 rows} (×5) | INV-6, REQ-5/6 | **property** | compares the header of a session alive with its dead twin in the same fixture at every width — the Stop itself is not asserted, its before/after layout is |
| a dead session with no bound Claude id shows exactly one header button reading Resume, disabled, with the existing reason as its hover title | E5, REQ-5, INV-7 | **property** | `unbound-sessions` |
| at {2000,1200,800}px the surface switch is inside the actions, immediately before Stop and Remove, with Remove at the header's right edge (×3) | REQ-4, INV-5 | **property** | cluster order per width |
| clicking Stop in the header and confirming turns that same element into an enabled Resume in the same box, with Remove unmoved | E1, REQ-5/6, INV-6 | journey | a real Stop |
| clicking Resume in the header on a dead session turns that same element into Stop once the session is alive… | E2, REQ-5/6 | journey | a real Resume |
| the header's Resume keeps focus and node identity when a real Enter resumes the session and the label becomes Stop, then across a tick | REQ-5/6 | journey | resume |
| at {viewport}px with a {label} a Stop and then a Resume in the header leave Remove, the button and the header where they were, with the ended age… (×4) | INV-6 | journey | real Stop and Resume round-trips |
| at 600px a real Enter on the header's Resume swaps the label to Stop with focus, node identity, Remove, the button and the header all unmoved | REQ-5/6 | journey | resume |
| with the WebSocket closed the header's one button is disabled under its label, and a dead session with no Claude id stays disabled after the reconnect | REQ-5, INV-7 | journey | socket drop and reconnect |
| at {viewport}px renaming to a longer title and moving Claude to lengthen the readout leaves the surface switch, Stop and Remove where they were (×2) | E4 | journey | rename PUT and a hook move |
| the surface switch's claude segment keeps focus and node identity across a hook-driven re-render and a tick, and a real Enter on it | REQ-4 | journey | hook re-render |
| switching to Tiles and back to Focus at 1000px leaves the header satisfying INV-1 to INV-4 with no stale measurement | E7, edge 16 | journey | the view switch is a pref PUT |

## `sessions.spec.ts` — 12 tests → 11 E2E, 1 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a fresh session renders 'untitled' and its context row as ctx unknown | W7 | **property** | a fresh launch's card — `unbound-sessions` |
| walks started → working → idle via SessionStart, turn-activity, then Stop… | E3 | journey | hooks move the card |
| a permission notification moves the card to needs input; a later Stop returns it to idle | E4 | journey | hooks |
| a StopFailure moves the card to failed showing the raw error token | E5 | journey | hook |
| a session seeded in plan mode shows planning on turn-activity instead of working | E5 | journey | hook |
| a straggler turn-activity for an already-closed prompt does not move the card off idle | E6 | journey | hook ordering |
| the /clear sequence rebinds the session to one card in started | E7 | journey | rebind |
| cards sort needs-input first, then failed, then the active/started/idle groups | E8, REQ-16 | journey | the order follows hooks (borderline, see below) |
| killing the scratch tmux window greys the card without changing its badge | E9 | journey | liveness |
| a status-line post persists, routes, and refreshes the title from session_name | REQ-4 | journey | status post |
| two synthesized PreCompact hooks bump the rail card's compaction counter to circle-2 | E14, REQ-14 | journey | hooks |
| keeps the stale rail visible during a disconnect and reloads the card from persistence after restart | — | journey | restart |

## `focus-marker.spec.ts` — 7 tests → 3 E2E, 4 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the top rail card is current by default, and clicking another card moves the marker | E1 | **property** | focus is client-side |
| clicking into the live terminal leaves the marker on the clicked-into session | E2 | **property** | a click into the (blank) terminal area; no PTY needed to falsify |
| Opt+Cmd+2 moves the marker to the rail's second card | REQ-3 | **property** | a chord moving client focus |
| .card.current renders on --bg-hover with an --edge ring without hovering, and carries no action row | REQ-2, rail-card-organise REQ-6 | **property** | token colours of the current card |
| Tiles never shows a current strip card; switching back to Focus restores exactly one | E3 | journey | view switch is a pref PUT |
| removing the focused session falls the marker through to the remaining session | REQ-3 | journey | remove round-trip |
| a manual drag reorder follows the current session's id, never a stale DOM slot | REQ-3, INV-3 | journey | order PUT |

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `effort-header` | every effort display the header has: a launch with no post yet, a bound session with none, a dead one that never reported, the clamped warning (`max` on Opus 4.5 → `high`), the no-effort-setting warning (Haiku 4.5), and a warned session with a long title | effort REQ-5–8 render tests |
| `effort-warned-{instrument,dark,light}` | one warned session under each theme pref (`withPrefs`) | the --warn family per theme |
| `focus-header-rows-a`, `focus-header-rows-b` | plan title-crop-stop-resume-button's state-table rows as sessions (title 9/29/52/300, folder 6/35/60, branch 4/80, grouped, moved, dead, bypass, full model id), plus a dead twin per INV-6 row; two scenarios because one folder name can hold one checkout | the E3 give-way sweeps, the 35-character folder, the stacked band, the INV-6 sweeps, the cluster order |
| `unbound-sessions` | sessions no SessionStart ever bound: two titled, one untitled (`started`, `ctx unknown`), and a dead one with no Claude id | the disabled Resume, W7, the focus marker |

`claudecodetest.StatusLineFullOpts` gained `CurrentDir` (the status line's `cwd` and
`workspace.current_dir`/`project_dir`), for the same reason `SessionStartOpts.Cwd` exists: a
post from `/tmp` would give a session a spurious location once the repo poll runs.
`web/render/helpers/style.ts`'s `tokenColor` takes the property the token is applied through
(`color` or `background-color`), for the ground tokens.

## Deleted Tests

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `effort-header.spec.ts` | a launched session with no status post yet reads <model> (…), a dead one… (REQ-6, E5, E6) | header model text per state | `web/render/focus.spec.ts`, same title |
| `effort-header.spec.ts` | a launch with max whose first post reports high shows the strip… (REQ-7, REQ-8, E8, INV-E1) | strip sentence, tint | same title |
| `effort-header.spec.ts` | the strip is a full-width status line… (REQ-8) | geometry, a11y tree, Dismiss position | same title |
| `effort-header.spec.ts` | a launch with high whose first post carries no effort key… (REQ-7, REQ-8, E9) | no-effort sentence, no brackets | same title |
| `effort-header.spec.ts` | at {1280,800,700,616,600}px the strip wraps… (REQ-6, REQ-8) ×5 | strip wraps, Dismiss in view, model never clipped | same titles |
| `effort-header.spec.ts` | in the {instrument,dark,light} theme the --warn family… (REQ-12, REQ-8) ×3 | four tokens defined, hue outside amber band, strip and tint use them | same titles |
| `focus-header.spec.ts` | sweeping the window from 2000px to 600px and back… give-way order: {11 rows} (E3, REQ-1, REQ-2, REQ-3, REQ-7) ×11 | INV-1 to INV-4 and INV-8 at every 16 px step, give-way order retraced | same titles (the 12th row, shell segment selected, stays E2E) |
| `focus-header.spec.ts` | a 35-character folder at a 1700px header shows its whole folder line on one row (E3, REQ-1) | folder line whole | same title |
| `focus-header.spec.ts` | at 640px a 300-character title keeps the readout beside it at its floor and the model stacks… (REQ-2, REQ-3, INV-2, INV-4) | stacked band geometry | same title |
| `focus-header.spec.ts` | sweeping the window from 2000px to 600px in 16px steps, a Stop leaves Remove… ended age under the model at every width: {5 rows} ×5 | alive vs ended header identical except the ended age, per width | same titles, against the dead twin in the fixture |
| `focus-header.spec.ts` | a dead session with no bound Claude id shows exactly one header button reading Resume, disabled… (E5, REQ-5, INV-7) | disabled Resume with reason title | same title |
| `focus-header.spec.ts` | at {2000,1200,800}px the surface switch is inside the actions… (REQ-4, INV-5) ×3 | cluster order, Remove at the right edge | same titles |
| `sessions.spec.ts` | a fresh session renders 'untitled' and its context row as ctx unknown (W7) | untitled card, ctx unknown | same title |
| `focus-marker.spec.ts` | the top rail card is current by default, and clicking another card moves the marker (E1) | default marker, click moves it | same title |
| `focus-marker.spec.ts` | clicking into the live terminal leaves the marker on the clicked-into session (E2) | marker follows a terminal click | same title |
| `focus-marker.spec.ts` | Opt+Cmd+2 moves the marker to the rail's second card (REQ-3) | chord moves the marker | same title |
| `focus-marker.spec.ts` | .card.current renders on --bg-hover with an --edge ring without hovering, and carries no action row (REQ-2, …) | current card tokens, no action row | same title |

## Borderline, left in place

- `effort-header.spec.ts` "Dismiss is reachable and activates from the keyboard": the
  reachability half is a property; the activation is a DELETE the harness would 404. Kept
  whole as a journey.
- `effort-header.spec.ts` "the strip belongs to the Focus view only: Tiles shows none…" and
  `focus-marker.spec.ts` "Tiles never shows a current strip card…": both halves are
  properties of a view, but the switch between them is a pref PUT whose broadcast the test
  waits on. A `withPrefs(…, {"view": "tiles"})` fixture would show the Tiles half; the
  round-trip is what the test asserts. Kept as journeys.
- `sessions.spec.ts` "cards sort needs-input first, then failed, then the active/started/idle
  groups": the order for a given set of states is a property (`three-states` holds three of
  the groups), but the test builds the states with hooks and asserts the order after each.
  Kept as a journey.

## Notes

- The INV-6 "a Stop leaves … where they were" sweeps compare the header of a session alive
  with the header of the same session ended. The E2E ran a real Stop between the two reads;
  the render port reads the alive row and its dead twin from one fixture at each width. The
  Stop's own effect (the button swapping in place) remains covered by the E1/E2 journeys.
- `driveFocusHeaderRows` was over the gocyclo ceiling (19); the per-row bind moved to
  `bindFocusRow`.
