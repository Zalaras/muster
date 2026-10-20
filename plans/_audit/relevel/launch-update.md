# Re-levelling batch: launch, past-sessions, update

Render specs `web/render/launch.spec.ts` (helper `web/render/helpers/launch.ts`),
`web/render/past-sessions.spec.ts` (helper `web/render/helpers/past-sessions.ts`) and
`web/render/update.spec.ts` (helper `web/render/helpers/update.ts`); scenarios in
`internal/server/renderfix_scenarios_launch.go`. The pure locators moved out of
`web/e2e/helpers/{picker,resume,effort,update}.ts` into those render helpers, which the E2E
helpers re-export (`resume.ts` is now a re-export plus the two daemon oracles `getRepos` and
`postResume`; `picker.ts` keeps only the browse pane — crumbs, listing, Launch-in — whose
every state is a `GET /api/browse` answer). The tables below are
`classify-launch-update.md`'s, corrected where the port differed; counts are Playwright
`--list` counts. 137 tests → 120 E2E, 20 render, 0 vitest (three tests were split, so the
two sides sum to 140).

**The browse 404.** `initOpen()` always issues a `GET /api/browse` the harness answers 404,
so every dialog test here opens with the harness's message in `#launch-error`, no crumbs or
listing, no `aria-pressed` recent and the defaults restored. Each port touches only the
form's own controls, the sidebar's list from `/api/repos`, or a card's chip and note, and
reads none of the above. The browse-dependent properties stay in `web/e2e/` and are listed
under § Notes as the "Blocked on the harness" table, untouched.

**Time in a fixture.** `second-launch-no-signal`'s second session has a `createdAt` one
minute after the fixture epoch (the normaliser's first-seen numbering), and the page clock
starts at the epoch — so at load `elapsedSeconds(createdAt, now)` is negative and the card
shows no note. The render test advances the clock by `createdAt − epoch` plus the 10 s
threshold plus one render tick, then reads "no signal yet"; the first session
(`firstLaunchHere: true`) reads the trust-prompt note before and after. The E2E test waited
up to 15 s of real time for the same note.

## `launch.spec.ts` — 29 tests → 26 E2E, 4 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| opens on the browse root with an empty sidebar when there are no recents, exposing every Testable UI Element and none of the removed legacy browse controls (REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2) | REQ-2/9/10/11/16, E2 | **property** (split) | The static half — legacy controls absent, five Model radios incl. fable, `other…` revealing Custom model, the Start-in radiogroup and its four radios, Title/Launch/Cancel, "No recent directories" with zero buttons — is the render test "with no recents the dialog exposes every Testable UI Element and none of the removed legacy browse controls, and the Start in radiogroup keeps its role and accessible name" (which also folds in permission-mode.spec.ts's REQ-1 pin). The E2E keeps the crumb half, retitled "opens on the browse root with an empty sidebar when there are no recents (REQ-16, E2, INV-1)": the sidebar empty state as its precondition, then the current crumb, the Launch-in readout and `composedCrumbPath` at the daemon's browse root. |
| opening the dialog with two prior launches lists both recents, marks the most recent pressed, and restores its model/mode/branch (REQ-7, REQ-8, REQ-17, E1) | REQ-7/8/17, E1 | property\* | Blocked on browse (see Notes). |
| clicking a child entry descends into it, updating the crumb bar and Launch in, and marks a git checkout (REQ-4, REQ-5, E3) | REQ-4/5, E3 | property\* | Blocked on browse. |
| clicking an ancestor crumb navigates up, and the previously-current directory reappears as an entry (REQ-5, E4) | REQ-5, E4 | property\* | Blocked on browse. |
| Cmd+ArrowUp navigates to the parent, and is a no-op at the filesystem root (REQ-6, E5) | REQ-6, E5 | property\* | Blocked on browse. |
| clicking a second recent swaps the pressed mark and the model/mode radios (REQ-7, E6) | REQ-7, E6, INV-2 | property\* | Blocked on browse. |
| navigating to a child of the pressed recent clears every aria-pressed mark, and navigating back onto it via crumbs re-sets it (INV-2, E7) | INV-2, E7 | property\* | Blocked on browse. |
| launching with no interaction after open relaunches the first recent's directory with its last model and mode (REQ-8, E8) | REQ-8, E8 | journey | Enter submits `POST /api/sessions`; the oracle is `GET /api/state`. |
| launching into a fresh directory reached via crumbs and entries creates the session there (REQ-4, REQ-5, E9) | REQ-4/5, E9, REQ-14 | journey | Launch POST, card appears, `settings.local.json` written on disk. |
| choosing fable launches with model=fable (REQ-9, E10) | REQ-9, E10 | journey | POST, pane start command, `/api/repos` lastModel. |
| other… reveals Custom model, blocks submit when empty, and submits the custom string verbatim (REQ-9, E11) | REQ-9, E11 | journey | The "Enter a model." validation runs after the "Choose a directory" check, so even the blocked half needs `current` set (browse); the second half is a real launch. |
| a recent launched with a non-preset model preselects other… and fills Custom model (REQ-12) | REQ-12 | property\* | Blocked on browse. |
| a browse 404 shows the daemon's error and leaves crumbs, listing, Launch in and the pressed recent unchanged (INV-3, E12) | INV-3, E12 | journey | A real directory removed between the listing and the click; the daemon's own 404 body. |
| the dialog's bounding height is unchanged after open, a child click, a crumb click and a recent click, even with an overflowing listing (INV-4, E13) | INV-4, E13 | property\* | Blocked on browse. |
| a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13) | REQ-13 | journey | See Borderline. |
| a route.abort() on GET /api/repos shows the network error and the sidebar's empty state (REQ-13) | REQ-13 | journey | See Borderline. |
| a route.abort() on GET /api/browse during navigation shows the network error and leaves crumbs, listing and Launch in unchanged, and a later success clears it (REQ-13, INV-3) | REQ-13, INV-3 | journey | Aborts one browse while every other reaches the daemon. |
| the child listing shows No subdirectories for an empty directory (REQ-16) | REQ-16 | property\* | Blocked on browse. |
| Escape and Cancel close the dialog; Opt+Cmd+N while already open does not reset the form (REQ-14, E15) | REQ-14, E15 | **property** | Ported as written against `empty`. |
| a card for a known (non-first-launch) directory still shows the no-signal note after ~10s (REQ-14 regression) | REQ-14 | **property** | Ported against `second-launch-no-signal`; see "Time in a fixture" above. The two launches and `GET /api/state` were setup. |
| a recent's title attribute is its full absolute path (REQ-18) | REQ-18 | **property** | Ported against `three-states`: every repo in the fixture's `repos` has a sidebar button whose `title` is its `path` (three, not one). |
| keyboard traversal: Enter descends into a focused child entry (REQ-15) | REQ-15 | property\* | Blocked on browse. |
| keyboard traversal: descending and ascending re-anchors focus on the first entry, so arrow keys keep working across round trips (REQ-15, review cycle 1 Minor 1) | REQ-15 | property\* | Blocked on browse. |
| ArrowLeft at the filesystem root is a genuine no-op and does not move focus (REQ-15, review cycle 2 Minor 1) | REQ-15 | property\* | Blocked on browse. |
| opening on a deep path scrolls the crumb bar to its right edge, keeping the current directory and the ⌘↑ hint on screen (REQ-6, review cycle 1 Minor 2) | REQ-6 | property\* | Blocked on browse. |
| GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (kb:anchor/browse.get, unchanged) | browse.get | journey | Pure API assertions; Go handler-test material (Borderline). |
| an orphaned muster-1 on the socket does not block launching from the dashboard, and is left running untouched (E1, issue #26) | E1, #26 | journey | Plants a tmux session, launches. |
| a second press on Launch while the first is in flight sends nothing: one session, one card (REQ-1, REQ-2, E1) | REQ-1/2, E1 | journey | Counts `POST /api/sessions` and the daemon's sessions. |
| a refused launch (500) re-enables Launch with focus still on it, and the retry launches one session (REQ-2, focus hand-back) | REQ-2 | journey | Fabricated 500, then a real retry. |

## `effort-launch.spec.ts` — 15 test blocks (17 tests with the ×3 loop) → 14 E2E, 4 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked for a directory with no remembered effort (REQ-1, E2) | REQ-1, E2 | **property** | Ported as written against `empty`, the `compareDocumentPosition` order check included. |
| the Resume tab gains no Effort row: it hides with the rest of the New form's fields (REQ-1) | REQ-1 | **property** | Ported against `empty` without the transcript, the child click and the `pastSessionRow` wait (the past list shows the harness's fetch error, which the claim never reads). |
| launching with high from the dialog spawns the pane with --effort high, sends effort in the request, and leaves the session's effort unreported (REQ-2, E3) | REQ-2, E3 | journey | POST body, pane start command, wire effort. |
| launching with default spawns the pane with no --effort, sends no level, and records no remembered effort (REQ-2, REQ-4, E3) | REQ-2/4, E3 | journey | POST body, pane, `/api/repos` lastEffort. |
| every level reaches the pane as --effort <level> and becomes the directory's lastEffort, and an API launch with effort null or none passes no flag (REQ-2, REQ-4, D4) | REQ-2/4, D4 | journey | Six API launches, pane command, repos rows. |
| POST /api/sessions with effort "auto" is refused 400 invalid_request and writes no repo row, settings file, tmux session or session (REQ-3, D3) — ×3 | REQ-3, D3 | journey ×3 | API-only; Go handler-test material (Borderline). |
| an invalid effort is checked after permissionMode and before the model pre-check (REQ-3) | REQ-3 | journey | API-only validation order. |
| after a launch with xhigh, reopening the dialog on that directory and clicking it in Recent both check xhigh, a later directory's level restores on its own click, and a default launch restores default (REQ-4, E4) | REQ-4, E4 | journey | Launches through the dialog and reads `/api/repos`; the restores are browse-dependent. |
| an effort picked before the initial restore lands stays checked, while the untouched model still restores from the recent (REQ-4) | REQ-4 | journey | Holds the first `/api/browse`. See Borderline. |
| the arrow keys move the Effort selection with focus on the same node, it survives a render tick, and the keyboard-chosen level is what launches (REQ-1, REQ-2) | REQ-1/2 | **property** (split) | The keyboard half — ArrowRight ×2, `tagNode`/`focusedNode` identity across two `settleFor(1_200)` ticks — is the render test "the arrow keys move the Effort selection with focus on the same node, and it survives a render tick (REQ-1)". The E2E keeps the launch half, shortened and retitled "the keyboard-chosen Effort level is what launches (REQ-2)": two real arrow keys as setup, then the pane's `--effort medium`. |
| clicking the max segment checks it, and it stays the checked one across a render tick (REQ-1) | REQ-1 | **property** | Ported as written against `empty`. |
| a Resume-tab resume of a transcript whose last assistant line recorded low spawns the pane with --effort low, seeds effort low, and the header reads (low) before any post (REQ-11, E16) | REQ-11, E16 | journey | Transcript read, resume POST, pane, header. |
| a Resume-tab resume whose transcript recorded no effort passes no --effort, seeds effort null, reads (…) in the header and leaves the new repo row's lastEffort null (REQ-11, REQ-4) | REQ-11, REQ-4 | journey | Same. |
| a Resume-tab resume reads the transcript's LAST assistant line: an earlier level is superseded by a later one, and a last line with no effort passes none (REQ-11) | REQ-11 | journey | Two API resumes. |
| a Resume-tab resume leaves the directory's lastEffort as the last launch set it, and the resume form refuses a non-null effort with the combination message before looking for the transcript (REQ-3, REQ-4, REQ-11, D8) | REQ-3/4/11, D8 | journey | API resume, 400 body, repos row. |

## `launch-model-check.spec.ts` — 12 tests → 11 E2E, 1 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| an unrecognized custom model into a never-launched directory is refused, writes nothing, and a retry with a recognised model succeeds (REQ-1, REQ-2, REQ-3, INV-1, E3, E4) | REQ-1/2/3, INV-1, E3/E4 | journey | The daemon's `model_unrecognized` refusal, then a real launch. |
| an unrecognized model into a previously-launched directory leaves its rail card count and its Recent's stored model/mode untouched (REQ-1, INV-1) | REQ-1, INV-1 | journey | Refused POST; repo row read back through the dialog. |
| an unrecognised preset is disabled while the currently-selected preset stays launchable (REQ-6, REQ-7, INV-1, E1) | REQ-6/7, INV-1, E1 | journey | The verdict is `GET /api/models`, a daemon answer. |
| the selected preset is marked invalid and blocks Launch when its own verdict is unrecognised (REQ-8, INV-1, INV-2, E2) | REQ-8, INV-1/2, E2 | journey | Held `/api/models` against a daemon answer. |
| switching away from an invalid preset selection clears the mark and re-enables Launch (REQ-8, INV-1, INV-2, E3) | REQ-8, INV-1/2, E3 | journey | Same verdict source. |
| an unrecognised custom model submitted via Launch marks Custom model invalid, and editing its text clears the mark (REQ-9, INV-1, INV-2, E4) | REQ-9, INV-1/2, E4 | journey | POST refusal marks the field. |
| navigating to a recent whose stored model is not a preset re-requests its verdict on restore (REQ-6, edge case 11) | REQ-6, edge 11 | journey | Asserts the request fires with the restored value; needs the restore (browse). |
| with the daemon down, opening the dialog marks and disables nothing (REQ-10, E5) | REQ-10, E5 | **property** | Ported against `empty`, title verbatim, plus a dialog-wide `[aria-invalid="true"]` count of 0. The E2E is deleted, not kept: `requestModelVerdicts` applies a verdict only on `result.ok`, so the harness's 404 and a dead daemon reach the same untouched store, and the connection-level path of `safeFetch` is proven by launch.spec.ts's two `route.abort()` journeys. See Borderline. |
| a refusal that disables a focused Launch moves focus onto the invalid Custom model field, which survives a tick and keeps a following Tab inside the dialog (review cycle 1 browser Minor 1) | review c1 browser Minor 1 | journey | POST refusal drives the focus move. |
| a model_unrecognized refusal submitted by Enter in Title, never focusing Launch, still moves focus onto the invalid Custom model field (review cycle 2 code Major 1/3) | review c2 Major 1/3 | journey | POST refusal. |
| a stale model_unrecognized refusal from a cancelled-and-reopened dialog moves no focus in the reopened dialog (review cycle 3 code Major 1 / browser Minor 1) | review c3 | journey | Held POST released into a reopened dialog. |
| a late refusal of a model no longer selected leaves focus where it is (REQ-1) | REQ-1 | journey | Held POST for model B; real 400. |

## `launch-defaults.spec.ts` — 8 tests → 7 E2E, 1 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a fresh dialog with no launch history checks auto and sonnet (REQ-5, E1, E2) | REQ-5, E1/E2 | **property** | Ported as written against `empty`. |
| a model picked before the initial restore lands stays checked, and the untouched mode still restores from the recent (REQ-6, E9) | REQ-6, E9 | journey | Holds the first `/api/browse`. See Borderline. |
| clicking a second Recent before the held-back initial browse lands leaves that Recent's directory listed, never the superseded one (REQ-6, E10) | REQ-6, E10 | journey | Two daemon answers in a controlled order. |
| with the most recent Recent's directory deleted before the dialog opens, the opened dialog lists the browse root (REQ-6, E12) | REQ-6, E12 | journey | A real `rm`, the daemon's 404 and its root fallback. |
| the dialog opens showing the first recent's remembered model, mode and effort before its own fetch returns (REQ-2) | REQ-2 | property\* | Blocked on browse. |
| a launch made through the dialog refreshes what the next open restores, with no reload in between (REQ-2) | REQ-2 | journey | A real launch's refresh of the repos list. |
| a vanished first recent's held model, mode and effort return to the defaults once its directory fails to open (REQ-3, E3) | REQ-3, E3 | journey | See Borderline. |
| a vanished first recent resets only the fields the user did not touch while its directory was still opening (REQ-3, E3, E4) | REQ-3, E3/E4 | journey | See Borderline. |

## `bypass.spec.ts` — 8 tests → 6 E2E, 3 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| checking "bypass" shows the warning and turns Launch into a danger "Launch without checks"; launching posts permissionMode: bypassPermissions and spawns the flag verbatim (REQ-1, REQ-2, E1) | REQ-1/2, E1 | journey (split) | Kept whole, byte-identical: the launch it leads into is the claim. Its pre-launch face half — the warning hidden, "Launch" without `key-danger`, then the exact warning sentence, "Launch without checks" and `key-danger` — is carried by the INV-2 render test below. |
| unchecking "bypass" restores the ordinary "Launch" face (INV-2) | INV-2 | **property** | Ported against `empty` under its own title, carrying E1's face half as well; no child click. |
| the existing Resume action relaunches a bypass-latched session with --permission-mode bypassPermissions (REQ-1) | REQ-1 | journey | Hook, end, resume POST, pane command. |
| the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives (REQ-4, REQ-5, E2) | REQ-4/5, E2 | **property** | Ported against `bypass-launch`; the card is clicked into the Focus header (`focusSession`) as setup, since the fixture holds no focus. |
| a hook reporting permission_mode: default removes the bypass chip from the rail card and the mainhead (E3) | E3 | journey | Hooks change the latch. |
| in Tiles, the bypass session's tile header shows the chip, and a hook reporting default removes it (E12) | E12 | journey (split) | Kept whole, byte-identical. The chip-shown half is the render test "in Tiles, the bypass session's tile header shows the chip (E12)" against `bypass-launch-tiles`. |
| the bypass chip is shown on the rail card in every state (alive and dead), and returns once the latch flips back to bypass (INV-1, edge case 17) | INV-1, edge 17 | journey | See Borderline. |
| a directory whose last launch was bypass opens the dialog on auto, from a fresh open and from clicking its Recent (REQ-3, INV-3) | REQ-3, INV-3 | property\* | Blocked on browse. |

## `tiles-launch.spec.ts` — 3 tests → 2 E2E, 1 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| Tiles shows the masthead New session button, with no Tiles-only button, and it opens the launch modal | rail-card-improvements REQ-6, INV-3 | **property** | Ported against `empty-tiles` (the Tiles click was a prefs PUT; the fixture holds the view), title verbatim, in `web/render/launch.spec.ts` since the file is the launch feature's. |
| a session launched from Tiles appears as a live tile | TODO "Create new session from tile view" | journey | Launch lands as a live tile. |
| launching from Tiles with a full 2×2 grid promotes the new session and demotes one tile | same | journey | Four seeds, a fifth launch, grid/strip counts. |

## `permission-mode.spec.ts` — 4 test blocks (7 tests with the ×4 loop) → 6 E2E, 0 render of its own, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the "Start in" radiogroup keeps its role and accessible name across the rename (REQ-1 regression) | REQ-1 | **property** | Folded into `web/render/launch.spec.ts`'s static-layout test (the `getByRole("radiogroup", { name: "Start in" })` visibility check sits beside the four radios), as the classifier asked; no render test of its own. |
| picking auto and launching sends permissionMode: auto and seeds the session's latch; re-opening the dialog on that directory shows auto checked (E1, E2) | E1/E2, REQ-4 | journey | POST, `/api/state` latch, then the restore. |
| a synthesized UserPromptSubmit with permission_mode: default corrects an auto-seeded session to default/hook and working, not planning (E3, REQ-5) | E3, REQ-5, INV-1 | journey | Hook corrects the latch. |
| a stored lastPermissionMode of "<stored>" pre-selects the "<radio>" radio on reopen (E4, INV-2) — ×4 | E4, INV-2 | property\* ×4 | Blocked on browse. |

## `past-sessions.spec.ts` — 25 tests → 21 E2E, 4 render, 0 vitest

| Test | Criteria | Level | Reason |
|---|---|---|---|
| opening the dialog always lands on the New tab, even right after a previous open was left on Resume (REQ-7) | REQ-7 | **property** | Ported against `empty`. The E2E reopened only via the masthead button; the render test reopens via the chord (`Alt+Meta+KeyN`) and then via the button, as the classifier's row asked, leaving the dialog on Resume before each. |
| switching to Resume and back to New restores the form exactly as it was left (User Flow 3) | User Flow 3 | **property** | Ported against `empty` without the child click. |
| the Resume tab lists fixture sessions newest first, disables the one already open in Muster, and refuses a POST for it with already_open (REQ-9, E5, edge case 9) | REQ-9, E5, edge 9 | journey | Transcripts on disk, a bound bystander, the 409. |
| resuming a fixture session spawns claude --resume <id> --permission-mode plan with no --model and no --name, seeds the row, and opens it like any launch, leaving a bystander session untouched (REQ-10, REQ-13, E6) | REQ-10/13, E6 | journey | Resume POST, pane command, auto-focus. |
| selecting a bypass fixture row shows "Resume without checks", danger; a non-bypass row shows the ordinary "Resume" (REQ-11, E7) | REQ-11, E7 | journey | Needs listed rows (Notes: `/api/past-sessions`). |
| resuming a fixture deleted after listing shows the 404 message in #launch-error and the list drops it on refetch (REQ-10, E8, edge case 7) | REQ-10, E8, edge 7 | journey | Transcript deleted on disk; daemon 404; refetch. |
| with the daemon down, the Resume tab shows 'Couldn't read sessions — try again' (E9) | E9 | **property** | Ported against `empty`, title verbatim, no `requestfailed` wait. The E2E is deleted: `fetchList` renders `FETCH_ERROR_MESSAGE` on any `{ok: false}`, which the harness's 404 and a dead daemon both produce. See Borderline. |
| the filter narrows the list case-insensitively over title and last prompt, and shows 'No sessions match' when nothing does (REQ-14, E10) | REQ-14, E10 | journey | Needs listed rows. |
| a directory with no Claude Code sessions shows the empty state, button disabled | States | journey | The display of an empty daemon listing. |
| the Resume tab shows a loading state while the fetch is in flight, then renders the list (States) | States | journey | Holds the daemon's GET. |
| navigating to another directory while on Resume refetches, clears the selection, and selects the first enabled row again (REQ-8, User Flow 4) | REQ-8, User Flow 4 | journey | Two listings via browse + past-sessions GETs. |
| resuming from the list advances the repo's MRU and launch count without overwriting its remembered model or Start-in mode (REQ-15) | REQ-15 | journey | Resume POST; `/api/repos` before/after. |
| INV-2's primary face recomputes on a tab switch in both directions | INV-2 | journey (split) | Kept whole: the Resume half needs a selected row. |
| a past-sessions response for a directory no longer listed is dropped (W8, edge case 19) | W8, edge 19 | journey | Request-ordering guard against two real answers. |
| a resume-bound row (source: resume) stays disabled and refuses a second resume with already_open (REQ-9, REQ-12) | REQ-9/12 | journey | Resume POST, resume-sourced SessionStart, 409. |
| an alive, unbound resumed row keeps its claude id disabled and refuses a second resume before it binds (kb:adr/launch-resume-pending-resume-holds-id) | ADR | journey | Pending claim across two POSTs. |
| a pending resume still holds its claude id across a daemon restart: the row stays disabled and a second resume is refused with 409 already_open | ADR | journey | `daemon.restart()`. |
| a session id freed by a /clear rebind is listed and resumable again (edge case 11) | edge 11 | journey | Hooks, refetch, 201. |
| a resumed session with no recorded model shows unknown in the mainhead meta (kb:adr/launch-resume-null-model-reads-unknown) | ADR | journey | See Borderline. |
| a long-titled bypass row's chip stays visible inside the row (REQ-11) | REQ-11 | journey | Needs a listed row. |
| selecting a past-session row by keyboard keeps focus on the chosen row | focus | journey | Needs listed rows. |
| #launch-error clears when switching tabs | error clearing | journey | The error is a real resume 404. |
| #launch-error clears when a new row is selected | error clearing | journey | Same. |
| ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session' | a11y | **property** | Ported as written against `empty`. |
| a fixture recorded with an unoffered permission mode resumes with it passed verbatim (kb:adr/launch-resume-passes-any-recorded-mode) | ADR | journey | Resume POST, pane command. |

## `update.spec.ts` — 28 tests → 27 E2E, 2 render, 0 vitest

Every fixture's `snapshot.update` is `{install: "dev", canCheck: false, available: null,
checkedAt: null, installed: null, apply: idle}`; the two properties of that state are the
whole port. The rows the classifier marked property\* (an `installer`, `homebrew` or
`unmanaged` install with an `available` version and a remedy) stay in `web/e2e/` until the
generator can seed an update state — see Notes.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a strictly newer release badges Settings and shows Running/Available in the dialog (E1, INV-2) | E1, INV-2 | property\* | Blocked on an update state. |
| pref persisted off across a daemon restart: two check intervals pass with zero further /latest requests (E2, INV-1, edge case 6) | E2, INV-1, edge 6 | journey | Daemon restart, fake-server request counts. |
| unchecking the toggle clears the badge and available version; rechecking triggers an immediate check (E3, REQ-3, INV-1; plan rail-card-improvements-2 REQ-11) | E3, REQ-3, INV-1 | journey | Prefs PUT, broadcast, a real check. |
| clicking Update swaps the on-disk binary and reports Updated without restarting the running process (E4, User Flow 2) | E4 | journey | Download, sha256 of the binary. |
| Update and restart brings back the same Claude session, its terminal, and an unchanged tmux pane PID (E5, INV-5 one-session case) | E5, INV-5 | journey | Re-exec, tmux PIDs. |
| Update and restart with two Claude sessions and a plain shell names the shell in the confirm, then removes only the shell (E6, INV-5 two-session case) | E6, INV-5 | journey | Shell via API, re-exec, tmux. |
| each verification refusal reports Update failed and leaves the on-disk binary byte-identical (E7, INV-3, REQ-24) | E7, INV-3, REQ-24 | journey | Four tampered releases, four daemons. |
| a dev build never checks or badges, and the dialog shows no Update buttons (E8, REQ-8) | E8, REQ-8 | journey (split) | The display half — "not checked (development build)", `updateApplyButton` count 0, Restart hidden, badge hidden — is the render test "a dev build shows the not-checked readout, no Update buttons and no badge (E8, REQ-8)" against `empty`. The E2E keeps the request-count half, retitled "a dev build never checks: zero /latest requests with a newer release published (E8, REQ-8)": the readout and the hidden badge after the daemon had its chance to check, then `settleFor(500)` and zero `/latest` requests. |
| a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy (E9, REQ-21, edge case 11) | E9, REQ-21, edge 11 | property\* | Blocked on an update state. |
| fake latest equal to running, then older: Available reads up to date and no badge either way (E10, D9, edge case 4) | E10, D9, edge 4 | journey | Two real checks. |
| two pages clicking Update while the archive is held: exactly one download, both report Updated (E11, REQ-20) | E11, REQ-20 | journey | Two concurrent applies, one download. |
| Update and restart returns the dashboard on the same port and data dir (E12, INV-7) | E12, INV-7 | journey | Re-exec, same tokens, `/healthz`. |
| a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13, REQ-21, edge case 9) | E13, REQ-21, edge 9 | property\* | Blocked on an update state. |
| `musterd -update` while the daemon runs is detected within one tick, showing Restart now with no click (E14, REQ-26) | E14, REQ-26 | journey | Out-of-band swap, daemon stat probe. |
| Restart now after a plain Update shows the confirm and completes with no second download (E15, REQ-25) | E15, REQ-25 | journey | Apply, restart, download count. |
| pressing Check now with a newer release published shows that version in the Available readout and badges the Settings button (E9) | rail-card-improvements-2 E9 | journey | `POST /api/update/check`. |
| with daily checking off from startup, the Available readout reads not checked yet, and pressing Check now replaces it with a checked age (E10) | E10, REQ-8 | journey | Prefs, restart, manual check. |
| pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value (E11) | E11, REQ-12 | journey | Failed check against a stopped host. |
| Check now is disabled on a daemon started with an empty update base URL (E12) | E12 | **property** | Ported against `empty` (`canCheck: false`, asserted from the fixture), title verbatim. |
| Check now disables the button the instant it starts and shows its result the instant it settles, not on the next periodic render tick (e-note-4) | maintainability-cleanup WF1 | journey | A real check with the page clock paused. |
| pressing Check now by keyboard keeps focus on it through the check and after it settles (REQ-3, E4) | focus-lands REQ-3, E4 | journey | Held check, focus across the settle. |
| a binary staged inside a scratch git tree shows the checkout root in the remedy; removing .git and pressing Check now enables Update and clears the status line (E1, REQ-2) | settings-update-failures E1, REQ-2 | journey | Recheck after removing `.git`. |
| a binary staged in a chmod 0555 directory shows the not-writable remedy; chmod 0755 and pressing Check now enables Update (E2, REQ-1) | E2, REQ-1 | journey | chmod, recheck. |
| Check now against a stopped release host shows the exact couldn't-reach-the-release-host sentence (E3, REQ-8) | E3, REQ-8 | journey | Manual check, daemon error sentence. |
| Update fails with the exact download-failure sentence when the release host stops before the click, leaving the on-disk binary byte-identical (E4, REQ-9) | E4, REQ-9 | journey | Apply against a stopped host. |
| Update and restart reloads the page: a pre-restart window marker is gone afterwards, the banner confirms the new version then hides, and Running shows it (E5, E6, REQ-16, REQ-17) | E5/E6, REQ-16/17 | journey | Real restart, reload, banner timing. |
| dashboard still boots and connects when the window.sessionStorage accessor itself throws | updaterestart edge 18 | journey | Connects, then the daemon is killed for the banner. |
| a window holding a restart record reloads on a mismatched-protocol reconnect without ever showing the mismatch screen (REQ-16, edge case 17) | REQ-16, edge 17 | journey | Routed `/ws` proxies the real daemon. |

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `second-launch-no-signal` | two launches into one plain directory (`signal`), no hook: the first session `firstLaunchHere: true` at the epoch, the second `firstLaunchHere: false`, `claudeSessionId: null`, `state: started` one minute later | `launch.spec.ts` "a card for a known (non-first-launch) directory still shows the no-signal note after ~10s" |
| `bypass-launch` | one launch with `permissionMode: bypassPermissions` into `bypass`, no hook (`firstLaunchHere: true`, `permissionMode {bypassPermissions, seed}`) | `launch.spec.ts` the chip and the combined note on the card and the mainhead (E2) |
| `bypass-launch-tiles` | `bypass-launch` under `withPrefs(…, tilesView)` | `launch.spec.ts` the chip on the tile header (E12's chip half) |

`empty` (the dialog's static properties, the dev/idle update state) and `three-states` (three
repos for the title attribute) and `empty-tiles` (the masthead button in Tiles) already
existed. Fixtures generated once and `make check-render-fixtures` run twice, both up to date;
every pre-existing fixture is byte-identical.

## Deleted Tests

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `launch.spec.ts` | the static half of "opens on the browse root with an empty sidebar when there are no recents, exposing every Testable UI Element and none of the removed legacy browse controls (REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2)" — the E2E keeps the crumb half under "opens on the browse root with an empty sidebar when there are no recents (REQ-16, E2, INV-1)" | legacy controls absent, five Model radios, `other…` → Custom model, the Start-in radiogroup and its four radios, Title/Launch/Cancel, the sidebar empty state, Cancel closes | `web/render/launch.spec.ts` "with no recents the dialog exposes every Testable UI Element and none of the removed legacy browse controls, and the Start in radiogroup keeps its role and accessible name (REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2; fix-auto-mode-select REQ-1)" |
| `launch.spec.ts` | Escape and Cancel close the dialog; Opt+Cmd+N while already open does not reset the form (REQ-14, E15) | Cancel, fresh reset on reopen, Escape, the chord while open keeping Title | `web/render/launch.spec.ts`, same title |
| `launch.spec.ts` | a card for a known (non-first-launch) directory still shows the no-signal note after ~10s (REQ-14 regression) | "no signal yet" once the clock passes createdAt + 10 s; the first launch's trust note before and after | `web/render/launch.spec.ts`, same title |
| `launch.spec.ts` | a recent's title attribute is its full absolute path (REQ-18) | `title` equals `path` for every fixture repo | `web/render/launch.spec.ts`, same title |
| `effort-launch.spec.ts` | the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked for a directory with no remembered effort (REQ-1, E2) | legend, six radios' names/values/`name`, default checked, the DOM-order check | `web/render/launch.spec.ts`, same title |
| `effort-launch.spec.ts` | the Resume tab gains no Effort row: it hides with the rest of the New form's fields (REQ-1) | Model and Effort radiogroups hidden on Resume | `web/render/launch.spec.ts`, same title |
| `effort-launch.spec.ts` | the keyboard half of "the arrow keys move the Effort selection with focus on the same node, it survives a render tick, and the keyboard-chosen level is what launches (REQ-1, REQ-2)" — the E2E keeps the launch half under "the keyboard-chosen Effort level is what launches (REQ-2)" | ArrowRight checks and focuses low then medium, node identity across two 1.2 s ticks | `web/render/launch.spec.ts` "the arrow keys move the Effort selection with focus on the same node, and it survives a render tick (REQ-1)" |
| `effort-launch.spec.ts` | clicking the max segment checks it, and it stays the checked one across a render tick (REQ-1) | max checked across a tick, default back | `web/render/launch.spec.ts`, same title |
| `launch-model-check.spec.ts` | with the daemon down, opening the dialog marks and disables nothing (REQ-10, E5) | fable enabled and not invalid, no `aria-invalid` anywhere, `#model-error` hidden, Launch enabled | `web/render/launch.spec.ts`, same title |
| `launch-defaults.spec.ts` | a fresh dialog with no launch history checks auto and sonnet (REQ-5, E1, E2) | auto and sonnet checked | `web/render/launch.spec.ts`, same title |
| `bypass.spec.ts` | unchecking "bypass" restores the ordinary "Launch" face (INV-2) | the ordinary face, the exact warning sentence and danger face on check, the ordinary face on manual | `web/render/launch.spec.ts`, same title |
| `bypass.spec.ts` | the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives (REQ-4, REQ-5, E2) | chip "bypass" on the card and `#mainhead`, the combined note sentence | `web/render/launch.spec.ts`, same title |
| `tiles-launch.spec.ts` | Tiles shows the masthead New session button, with no Tiles-only button, and it opens the launch modal | the masthead button visible in Tiles, `#tiles-new-session-button` absent, `#tiles-empty` names it, the dialog opens and Cancel closes it | `web/render/launch.spec.ts`, same title |
| `permission-mode.spec.ts` | the "Start in" radiogroup keeps its role and accessible name across the rename (REQ-1 regression) | the radiogroup by role and name | folded into `web/render/launch.spec.ts`'s static-layout test (first row above) |
| `past-sessions.spec.ts` | opening the dialog always lands on the New tab, even right after a previous open was left on Resume (REQ-7) | New selected on open, Resume shows the section, New again after reopening via the chord and via the button | `web/render/past-sessions.spec.ts`, same title |
| `past-sessions.spec.ts` | switching to Resume and back to New restores the form exactly as it was left (User Flow 3) | Title/opus/accept edits across a tab round trip, `.fields` hidden/visible | `web/render/past-sessions.spec.ts`, same title |
| `past-sessions.spec.ts` | with the daemon down, the Resume tab shows 'Couldn't read sessions — try again' (E9) | the error line, the primary button disabled | `web/render/past-sessions.spec.ts`, same title |
| `past-sessions.spec.ts` | ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session' | the exact dialog name, roving focus and selection across both arrows | `web/render/past-sessions.spec.ts`, same title |
| `update.spec.ts` | Check now is disabled on a daemon started with an empty update base URL (E12) | Check now disabled with `canCheck: false` | `web/render/update.spec.ts`, same title |
| `update.spec.ts` | the display half of "a dev build never checks or badges, and the dialog shows no Update buttons (E8, REQ-8)" — the E2E keeps the request-count half under "a dev build never checks: zero /latest requests with a newer release published (E8, REQ-8)" | "not checked (development build)", Update absent, Restart hidden, badge hidden | `web/render/update.spec.ts` "a dev build shows the not-checked readout, no Update buttons and no badge (E8, REQ-8)" |

## Borderline, left in place

- `launch.spec.ts` "a failed GET /api/repos shows the error…" and "a route.abort() on GET
  /api/repos shows the network error…" (REQ-13): client resilience to a fabricated 500 or
  abort, but both also assert the browse pane reached the daemon's real root, and the harness
  has no "this request fails" affordance. Kept as journeys.
- `launch-defaults.spec.ts` "a model picked before the initial restore lands…" (E9) and
  `effort-launch.spec.ts` "an effort picked before the initial restore lands…": a client
  ordering rule proven by holding the daemon's browse. Kept; a harness hold seam would move
  them beside the browse recording.
- `launch-defaults.spec.ts` "a vanished first recent's held model, mode and effort return to
  the defaults…" and "…resets only the fields the user did not touch…" (REQ-3): the reset on a
  failed navigate is what the harness does on every open, but both also assert the successful
  root fallback. Kept; they become properties with the browse recording.
- The two "with the daemon down" tests (`launch-model-check.spec.ts` REQ-10/E5,
  `past-sessions.spec.ts` E9) were ported and their E2E copies deleted rather than kept
  beside the render pins. The claim in each is the display given a failed request, and the
  code path is the same `{ok: false}` branch for a 404 and a connection failure; what the
  E2E additionally proved — the request failing at the connection level — is `safeFetch`'s
  choke point, held by launch.spec.ts's two `route.abort()` journeys. Each E2E killed a daemon
  and waited up to 15 s for the banner. If the connection-level failure is held to be the
  claim, restore the two from `main` before the re-levelling landed (2018bab6) and keep the render tests as
  the display pins.
- `bypass.spec.ts` "the bypass chip is shown on the rail card in every state (alive and
  dead)…" (INV-1): the per-state display could be a property over a multi-session bypass
  fixture, but the latch flip is hook-driven and the test is one walk. Kept.
- `past-sessions.spec.ts` "a resumed session with no recorded model shows unknown in the
  mainhead meta": the "unknown" readout for `model: null` is a display property no fixture
  holds. Kept; a scenario resuming from a model-less transcript would move it.
- `launch.spec.ts` "GET /api/browse returns 400…" and `effort-launch.spec.ts`'s four API-only
  tests: journeys by level with no UI in any of them; Go handler-test material if not already
  covered in `internal/server`. Left as they were.

## Notes

- **Blocked on the harness, untouched.** The classifier's second "Properties to port" table —
  every row needing `/api/browse` served from a recording (thirteen in `launch.spec.ts`, one in
  `launch-defaults.spec.ts`, one in `bypass.spec.ts`, the ×4 in `permission-mode.spec.ts`), an
  update state other than dev/idle (three `update.spec.ts` rows plus the remedy halves of the
  two settings-update-failures tests), or `/api/past-sessions` from a recording (six
  `past-sessions.spec.ts` display claims) — was left exactly as it stood; nothing from it was
  ported, trimmed or retitled. `launch-opens-session.spec.ts` (five journeys, nothing to port)
  was not touched either.
- **Retitled tests.** Four E2E tests kept a half and were retitled to say what is left:
  `launch.spec.ts` "opens on the browse root with an empty sidebar when there are no recents
  (REQ-16, E2, INV-1)", `effort-launch.spec.ts` "the keyboard-chosen Effort level is what
  launches (REQ-2)", `update.spec.ts` "a dev build never checks: zero /latest requests with a
  newer release published (E8, REQ-8)". Three render tests carry a title the E2E never had,
  because the verbatim title claimed the half that stayed: the static-layout test, the Effort
  keyboard test and "in Tiles, the bypass session's tile header shows the chip (E12)", plus the
  dev-build display test. Every other port keeps its title verbatim. `bypass.spec.ts` E1 and
  E12 and `past-sessions.spec.ts` INV-2 stay byte-identical as journeys.
- **Helper split.** `web/render/helpers/launch.ts` now owns the Recent sidebar, `#launch-error`,
  `#model-error`, `escapeForRegExp`, the Effort row (`EFFORT_LEVELS`, `effortRadiogroup`,
  `effortRadio`, `effortSegment`, `pickEffort`), the bypass segment (`bypassWarning`,
  `bypassRadio`, `launchPrimaryButton`) and `bypassChip`; `web/render/helpers/past-sessions.ts`
  the tablist, `launchTarget` and the past-session section, list, filter, head and rows;
  `web/render/helpers/update.ts` the badge dot, the Available readout and the Check now,
  Update and restart buttons. The E2E helpers re-export every one of them (`grep` found no
  other importer of a moved name), and `web/e2e/helpers/update.ts` keeps the restart-confirm
  dialog's locators and `expectRemedyContained`, which needs `expect`.
- **Browse-dependent setup dropped.** The ported Resume-tab tests no longer click a child
  entry first: in the harness the past list shows the fetch error whatever directory is
  current, and none of the ported claims reads a row.
- **Load-sensitive wait removed.** The no-signal test's 15 s wall-clock wait is gone; the
  render port advances the page clock. Everything else uses `settleFor` only for
  stays-unchanged checks (the two 1.2 s Effort ticks).
- **Gates.** `make render-test` 318 passed (2.4 min, 4 workers); `make web-test` 2843 passed;
  `make e2e` scoped to the nine trimmed files, in three runs under the lock: 58, 35 and 27
  passed (29 s, 16 s, 1.2 min); `make check` exit 0 (`golangci-lint`, every Go package `ok`,
  contrast, e2e-lint, render-lint, versions, render fixtures up to date, kb 619 records 0
  problems).
