# Re-level classification — launch, past-sessions, update

Batch for `plans/_audit/test-audit-2026-10-20-relevel.md`. Files owned by the `launch`
feature (`launch`, `effort-launch`, `launch-model-check`, `launch-defaults`, `bypass`,
`launch-opens-session`, `permission-mode`, `tiles-launch`), by `past-sessions`
(`past-sessions`) and by `update` (`update`), per `go tool kb for` on each path.

## One fact that shapes every launch-dialog row

The launch dialog's `initOpen()` (`web/src/features/launch.ts`) always issues a
`GET /api/browse` — onto the first recent's path, or onto the browse root when there is
no recent. The render harness answers every unmocked `/api/**` with a 404
(`code: "render-harness"`), and `/api/browse` is not served from the fixture. So in a
render test today the dialog opens, shows the harness's 404 message in `#launch-error`,
the crumb bar and child listing never populate, `current` stays `null` (no recent is
ever `aria-pressed`, the Launch-in readout stays empty), and the initial restore of the
first recent's model/mode/effort — applied first from the controller's init-time
`/api/repos` fetch — is then reset to the defaults by the failed navigate's `failed`
branch (`applyRestore(defaultRestore(touched))`). Consequence for this batch:

- A dialog property that depends on crumbs, the listing, the Launch-in readout, the
  pressed mark, or a restored model/mode/effort **cannot be falsified in the harness
  today**. These rows are marked **property\*** below: they are display properties by the
  ADR's test, and they port the day the harness serves `/api/browse` from a recording
  (the same shape as the reader recording: one `browse` entry per path, with the
  root/undefined path included). Until then they stay in `web/e2e/`.
- A dialog property that touches only the form's own controls (radios, Title, tabs,
  Escape/Cancel, the bypass face, the Effort row, the recents sidebar's list from
  `/api/repos`) is **property** and ports now; the port must ignore the harness's
  browse error in `#launch-error` and must not click a child entry or crumb as setup.

Level values used: `journey`, `property` (portable now), `property*` (property blocked on
`/api/browse`, or on an update state the fixture generator cannot produce — the Reason
says which), `logic`.

## `launch.spec.ts` — 29 tests → 13 journey, 16 property (3 portable now, 13 property\*), 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| opens on the browse root with an empty sidebar when there are no recents, exposing every Testable UI Element and none of the removed legacy browse controls (REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2) | REQ-2/9/10/11/16, E2 | **property** (split) | The legacy-control absence, the five Model radios incl. fable, `other…` revealing Custom model, the four Start-in radios, Title/Launch/Cancel and "No recent directories" with no recent buttons are static layout for `repos: []` — portable with `empty`. The E2/INV-1 half (current crumb = browse root, Launch-in readout, `composedCrumbPath`) is property\* (browse). Port the static half; the E2E test keeps only the crumb half (or is kept whole until browse is recorded). |
| opening the dialog with two prior launches lists both recents, marks the most recent pressed, and restores its model/mode/branch (REQ-7, REQ-8, REQ-17, E1) | REQ-7/8/17, E1 | **property\*** | Sidebar order (`pinned DESC, lastLaunchedAt DESC` is the daemon's; the dialog shows served order) and both buttons present are portable from a repos body. `aria-pressed` on the newest, the ` · <branch>` readout and the restored opus/accept-edits all depend on the browse landing (`current`, `initialRestore` on `"ok"`). The two launches are setup only. |
| clicking a child entry descends into it, updating the crumb bar and Launch in, and marks a git checkout (REQ-4, REQ-5, E3) | REQ-4/5, E3 | **property\*** | The display of two browse answers (parent listing with `(git)` on one entry and not its sibling, then the child's crumbs). Whether a directory is a checkout is the daemon's judgement, recorded in the answer. |
| clicking an ancestor crumb navigates up, and the previously-current directory reappears as an entry (REQ-5, E4) | REQ-5, E4 | **property\*** | Crumb click → browse of the ancestor → listing; display for recorded answers. |
| Cmd+ArrowUp navigates to the parent, and is a no-op at the filesystem root (REQ-6, E5) | REQ-6, E5 | **property\*** | Keyboard before any submit, but each step is a browse; the `/` listing would need recording. |
| clicking a second recent swaps the pressed mark and the model/mode radios (REQ-7, E6) | REQ-7, E6, INV-2 | **property\*** | Pressed-iff-path-matches and the restore on a Recent click both need the clicked recent's browse to land `"ok"`. |
| navigating to a child of the pressed recent clears every aria-pressed mark, and navigating back onto it via crumbs re-sets it (INV-2, E7) | INV-2, E7 | **property\*** | Same: the mark follows `current`, which only a successful browse sets. |
| launching with no interaction after open relaunches the first recent's directory with its last model and mode (REQ-8, E8) | REQ-8, E8 | journey | Enter submits `POST /api/sessions`; the oracle is `GET /api/state`. |
| launching into a fresh directory reached via crumbs and entries creates the session there (REQ-4, REQ-5, E9) | REQ-4/5, E9, REQ-14 | journey | Launch POST, card appears, `settings.local.json` written on disk. |
| choosing fable launches with model=fable (REQ-9, E10) | REQ-9, E10 | journey | POST, pane start command, `/api/repos` lastModel. |
| other… reveals Custom model, blocks submit when empty, and submits the custom string verbatim (REQ-9, E11) | REQ-9, E11 | journey | The "Enter a model." validation runs after the "Choose a directory" check in `submitNew`, so even the blocked half needs `current` set (browse); the second half is a real launch. |
| a recent launched with a non-preset model preselects other… and fills Custom model (REQ-12) | REQ-12 | **property\*** | A restore display for a repos body whose first `lastModel` is non-preset; in the harness the restore applies then resets on the failed navigate. |
| a browse 404 shows the daemon's error and leaves crumbs, listing, Launch in and the pressed recent unchanged (INV-3, E12) | INV-3, E12 | journey | A real directory is removed between the listing and the click; the daemon's own 404 body is the error shown. |
| the dialog's bounding height is unchanged after open, a child click, a crumb click and a recent click, even with an overflowing listing (INV-4, E13) | INV-4, E13 | **property\*** | Layout invariant (fixed 300 px grid, internal scroll) across four listings; every listing is a browse answer. |
| a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13) | REQ-13 | journey | `page.route` fabricates a 500 for repos (client resilience), but the test also asserts the browse pane reached the real browse root. See Borderline. |
| a route.abort() on GET /api/repos shows the network error and the sidebar's empty state (REQ-13) | REQ-13 | journey | Same shape with a network-layer abort; browse root asserted against the daemon. See Borderline. |
| a route.abort() on GET /api/browse during navigation shows the network error and leaves crumbs, listing and Launch in unchanged, and a later success clears it (REQ-13, INV-3) | REQ-13, INV-3 | journey | Aborts one browse while every other browse reaches the daemon; the clearing success is a daemon answer. |
| the child listing shows No subdirectories for an empty directory (REQ-16) | REQ-16 | **property\*** | The display of an empty browse answer (the honesty rule: "No subdirectories" only once a listing landed). |
| Escape and Cancel close the dialog; Opt+Cmd+N while already open does not reset the form (REQ-14, E15) | REQ-14, E15 | **property** | Title value, close on Escape/Cancel, fresh reset on reopen, chord while open — all client-side, no browse dependency. Portable with `empty`. |
| a card for a known (non-first-launch) directory still shows the no-signal note after ~10s (REQ-14 regression) | REQ-14 | **property** | `firstLaunchNote` (`web/src/sessions/card.ts`) derives "no signal yet" from `state: started`, `claudeSessionId: null`, `firstLaunchHere: false` and `elapsedSeconds(createdAt, now) ≥ NO_SIGNAL_THRESHOLD_SECONDS` — client-side, already unit-tested in `card.test.ts`. Needs a scenario with a second launch into the same directory and no hook, then `settleFor` past the threshold. The two launches and `GET /api/state` in the E2E are setup. |
| a recent's title attribute is its full absolute path (REQ-18) | REQ-18 | **property** | `title` attribute from the repos body; portable with `three-states` (3 repos). |
| keyboard traversal: Enter descends into a focused child entry (REQ-15) | REQ-15 | **property\*** | Keyboard, but the descend is a browse. |
| keyboard traversal: descending and ascending re-anchors focus on the first entry, so arrow keys keep working across round trips (REQ-15, review cycle 1 Minor 1) | REQ-15 | **property\*** | Focus re-anchoring after each settled navigation; each is a browse answer. |
| ArrowLeft at the filesystem root is a genuine no-op and does not move focus (REQ-15, review cycle 2 Minor 1) | REQ-15 | **property\*** | Needs the `/` listing (≥ 2 entries) from a browse recording. |
| opening on a deep path scrolls the crumb bar to its right edge, keeping the current directory and the ⌘↑ hint on screen (REQ-6, review cycle 1 Minor 2) | REQ-6 | **property\*** | Crumb-bar scroll geometry for a 12-segment path; the path comes from the first recent's browse. |
| GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (kb:anchor/browse.get, unchanged) | browse.get | journey | Pure API assertions, no UI. Belongs in a Go handler test if not already there (see Notes). |
| an orphaned muster-1 on the socket does not block launching from the dashboard, and is left running untouched (E1, issue #26) | E1, #26 | journey | Plants a tmux session, launches, checks id allocation and the orphan's survival. |
| a second press on Launch while the first is in flight sends nothing: one session, one card (REQ-1, REQ-2, E1) | REQ-1/2, E1 | journey | Counts `POST /api/sessions` and the daemon's sessions. |
| a refused launch (500) re-enables Launch with focus still on it, and the retry launches one session (REQ-2, focus hand-back) | REQ-2 | journey | Fabricated 500, then a real retry that must create exactly one session. |

## `effort-launch.spec.ts` — 15 test blocks (17 tests with the ×3 loop) → 14 journey, 3 property, 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked for a directory with no remembered effort (REQ-1, E2) | REQ-1, E2 | **property** | Radiogroup, legend, six radios' names/values/`name` attribute, default checked, DOM order against Model/`#model-error`/`#custom-model-input`/Start in. Portable with `empty`. |
| the Resume tab gains no Effort row: it hides with the rest of the New form's fields (REQ-1) | REQ-1 | **property** | Tab switch hides the Model radiogroup and the Effort radiogroup — client-side. The E2E's transcript write, child click and `pastSessionRow` wait are setup; the port drops them (the past list will show the harness's fetch error, which the claim does not read). Portable with `empty`. |
| launching with high from the dialog spawns the pane with --effort high, sends effort in the request, and leaves the session's effort unreported (REQ-2, E3) | REQ-2, E3 | journey | POST body, pane start command, wire effort. |
| launching with default spawns the pane with no --effort, sends no level, and records no remembered effort (REQ-2, REQ-4, E3) | REQ-2/4, E3 | journey | POST body, pane, `/api/repos` lastEffort. |
| every level reaches the pane as --effort <level> and becomes the directory's lastEffort, and an API launch with effort null or none passes no flag (REQ-2, REQ-4, D4) | REQ-2/4, D4 | journey | Six API launches, pane command, repos rows. |
| POST /api/sessions with effort "auto" is refused 400 invalid_request and writes no repo row, settings file, tmux session or session (REQ-3, D3) — ×3: `"auto"`, `"ultracode"`, `"HIGH"` | REQ-3, D3 | journey ×3 | API-only; no UI. Go handler-test material (see Notes). |
| an invalid effort is checked after permissionMode and before the model pre-check (REQ-3) | REQ-3 | journey | API-only validation order. Go handler-test material. |
| after a launch with xhigh, reopening the dialog on that directory and clicking it in Recent both check xhigh, a later directory's level restores on its own click, and a default launch restores default (REQ-4, E4) | REQ-4, E4 | journey | Launches through the dialog mid-test and reads `/api/repos`; the restore displays in between are property\* by nature but inseparable here. |
| an effort picked before the initial restore lands stays checked, while the untouched model still restores from the recent (REQ-4) | REQ-4 | journey | Holds the first `/api/browse` to order the user's pick before the restore; a timing race on a daemon answer. See Borderline. |
| the arrow keys move the Effort selection with focus on the same node, it survives a render tick, and the keyboard-chosen level is what launches (REQ-1, REQ-2) | REQ-1/2 | journey (split) | Arrow keys, focus node identity across two `settleFor` ticks are a portable property; "is what launches" reads the pane start command. See Borderline. |
| clicking the max segment checks it, and it stays the checked one across a render tick (REQ-1) | REQ-1 | **property** | Click, `settleFor(1_200)`, still checked, then back to default. Portable with `empty`. |
| a Resume-tab resume of a transcript whose last assistant line recorded low spawns the pane with --effort low, seeds effort low, and the header reads (low) before any post (REQ-11, E16) | REQ-11, E16 | journey | Transcript read, resume POST, pane, header. |
| a Resume-tab resume whose transcript recorded no effort passes no --effort, seeds effort null, reads (…) in the header and leaves the new repo row's lastEffort null (REQ-11, REQ-4) | REQ-11, REQ-4 | journey | Same. |
| a Resume-tab resume reads the transcript's LAST assistant line: an earlier level is superseded by a later one, and a last line with no effort passes none (REQ-11) | REQ-11 | journey | Two API resumes against written transcripts. |
| a Resume-tab resume leaves the directory's lastEffort as the last launch set it, and the resume form refuses a non-null effort with the combination message before looking for the transcript (REQ-3, REQ-4, REQ-11, D8) | REQ-3/4/11, D8 | journey | API resume, 400 body, repos row. |

## `launch-model-check.spec.ts` — 12 tests → 11 journey, 1 property, 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| an unrecognized custom model into a never-launched directory is refused, writes nothing, and a retry with a recognised model succeeds (REQ-1, REQ-2, REQ-3, INV-1, E3, E4) | REQ-1/2/3, INV-1, E3/E4 | journey | The daemon's `model_unrecognized` refusal on POST, then a real launch. |
| an unrecognized model into a previously-launched directory leaves its rail card count and its Recent's stored model/mode untouched (REQ-1, INV-1) | REQ-1, INV-1 | journey | Refused POST; repo row unchanged, read back through the dialog. |
| an unrecognised preset is disabled while the currently-selected preset stays launchable (REQ-6, REQ-7, INV-1, E1) | REQ-6/7, INV-1, E1 | journey | The verdict is `GET /api/models`, a daemon answer (stub claude). The row-state logic given verdicts is already Vitest (`launchmodels.test.ts`). |
| the selected preset is marked invalid and blocks Launch when its own verdict is unrecognised (REQ-8, INV-1, INV-2, E2) | REQ-8, INV-1/2, E2 | journey | Held `/api/models` ordering against a daemon answer. |
| switching away from an invalid preset selection clears the mark and re-enables Launch (REQ-8, INV-1, INV-2, E3) | REQ-8, INV-1/2, E3 | journey | Same verdict source. |
| an unrecognised custom model submitted via Launch marks Custom model invalid, and editing its text clears the mark (REQ-9, INV-1, INV-2, E4) | REQ-9, INV-1/2, E4 | journey | POST refusal marks the field. |
| navigating to a recent whose stored model is not a preset re-requests its verdict on restore (REQ-6, edge case 11) | REQ-6, edge 11 | journey | Asserts the `/api/models` request fires with the restored value; also needs the restore (browse). |
| with the daemon down, opening the dialog marks and disables nothing (REQ-10, E5) | REQ-10, E5 | **property** | The fail-open display: with no verdicts nothing is marked, fable enabled, `#model-error` hidden, Launch enabled. In the harness `/api/models` 404s → `requestModelVerdicts` leaves the store untouched — the same code path as a connection failure (`safeFetch` → `{ok:false}`). Portable with `empty`. See Borderline for the caveat. |
| a refusal that disables a focused Launch moves focus onto the invalid Custom model field, which survives a tick and keeps a following Tab inside the dialog (review cycle 1 browser Minor 1) | review c1 browser Minor 1 | journey | POST refusal drives the focus move. |
| a model_unrecognized refusal submitted by Enter in Title, never focusing Launch, still moves focus onto the invalid Custom model field (review cycle 2 code Major 1/3) | review c2 Major 1/3 | journey | POST refusal. |
| a stale model_unrecognized refusal from a cancelled-and-reopened dialog moves no focus in the reopened dialog (review cycle 3 code Major 1 / browser Minor 1) | review c3 | journey | Held POST released into a reopened dialog; generation guard against a real daemon answer. |
| a late refusal of a model no longer selected leaves focus where it is (REQ-1) | REQ-1 | journey | Held POST for model B; real 400. |

## `launch-defaults.spec.ts` — 8 tests → 6 journey, 2 property (1 portable now, 1 property\*), 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a fresh dialog with no launch history checks auto and sonnet (REQ-5, E1, E2) | REQ-5, E1/E2 | **property** | Defaults for `repos: []`; the failed harness browse also lands on `defaultRestore`, so the display is stable. Portable with `empty`. |
| a model picked before the initial restore lands stays checked, and the untouched mode still restores from the recent (REQ-6, E9) | REQ-6, E9 | journey | Holds the first `/api/browse`; the restore that must not clobber is a daemon answer's landing. See Borderline. |
| clicking a second Recent before the held-back initial browse lands leaves that Recent's directory listed, never the superseded one (REQ-6, E10) | REQ-6, E10 | journey | Superseded browse vs. the user's own browse; two daemon answers in a controlled order. |
| with the most recent Recent's directory deleted before the dialog opens, the opened dialog lists the browse root (REQ-6, E12) | REQ-6, E12 | journey | A real `rm`, the daemon's 404 and its successful root fallback; `#launch-error` hidden after the fallback. |
| the dialog opens showing the first recent's remembered model, mode and effort before its own fetch returns (REQ-2) | REQ-2 | **property\*** | The held-values display from the init-time repos list is portable (fixture `/api/repos` populates `knownRepos`), but the second half — still checked once the browse lands — needs the browse to land `"ok"`; in the harness the failed navigate resets them. |
| a launch made through the dialog refreshes what the next open restores, with no reload in between (REQ-2) | REQ-2 | journey | A real launch's refresh of the repos list. |
| a vanished first recent's held model, mode and effort return to the defaults once its directory fails to open (REQ-3, E3) | REQ-3, E3 | journey | The reset on `failed` is reproducible in the harness (every browse fails), but the test also asserts the fallback landed on the browse root. See Borderline. |
| a vanished first recent resets only the fields the user did not touch while its directory was still opening (REQ-3, E3, E4) | REQ-3, E3/E4 | journey | Same, plus a pick during the held browse. See Borderline. |

## `bypass.spec.ts` — 8 tests → 5 journey, 3 property (2 portable now, 1 property\*), 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| checking "bypass" shows the warning and turns Launch into a danger "Launch without checks"; launching posts permissionMode: bypassPermissions and spawns the flag verbatim (REQ-1, REQ-2, E1) | REQ-1/2, E1 | journey (split) | The face/warning half is the same property the next test holds; the launch half reads `/api/state`, the pane command and the auto-focus. Keep as journey; the face half is covered by porting INV-2 below. |
| unchecking "bypass" restores the ordinary "Launch" face (INV-2) | INV-2 | **property** | Bypass radio → warning text and `key-danger` face; manual → ordinary face. Client-side; the child click is setup. Portable with `empty`. The port should also carry the exact warning sentence and the "not checked yet" face from the first test's pre-launch half. |
| the existing Resume action relaunches a bypass-latched session with --permission-mode bypassPermissions (REQ-1) | REQ-1 | journey | Hook, end, resume POST, pane command. |
| the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives (REQ-4, REQ-5, E2) | REQ-4/5, E2 | **property** | Display for a `started` session with `permissionMode {bypassPermissions, seed}`, `claudeSessionId null`, `firstLaunchHere true`: chip text on card and `#mainhead`, the combined trust-then-bypass note. Needs scenario `bypass-launch` (one session launched with `permissionMode: bypassPermissions`, no hook). |
| a hook reporting permission_mode: default removes the bypass chip from the rail card and the mainhead (E3) | E3 | journey | Hooks change the latch. |
| in Tiles, the bypass session's tile header shows the chip, and a hook reporting default removes it (E12) | E12 | journey (split) | Chip on the tile header is a property (`bypass-launch` under `prefs.view: tiles` — the view switch is a prefs PUT, so the fixture must hold it); the hook-driven clear is a journey. Keep as journey; port the chip-shown half with `bypass-launch-tiles`. |
| the bypass chip is shown on the rail card in every state (alive and dead), and returns once the latch flips back to bypass (INV-1, edge case 17) | INV-1, edge 17 | journey | Hooks walk working/needs_input/idle/failed, End, then latch flip. See Borderline for the per-state display. |
| a directory whose last launch was bypass opens the dialog on auto, from a fresh open and from clicking its Recent (REQ-3, INV-3) | REQ-3, INV-3 | **property\*** | A restore display for a repos body with `lastPermissionMode: bypassPermissions`. In the harness the failed navigate resets to `auto` regardless, so a wrong restore of bypass could not be told apart from the fallback; needs browse. |

## `launch-opens-session.spec.ts` — 5 tests → 5 journey, 0 property, 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| launching the only session in Focus focuses it and routes typed keys to its terminal with no click (REQ-7, INV-4) | REQ-7, INV-4 | journey | Launch, terminal `MUSTER-STUB-READY`, typed echo. |
| launching a second session in Focus focuses it, shows its title in the mainhead, and routes typed keys to its terminal with no click (REQ-7, E5, E6) | REQ-7, E5/E6 | journey | Same with a bystander. |
| launching from Tiles with a full grid promotes the new session with keyboard focus already in its tile, no click needed (REQ-8, E7) | REQ-8, E7 | journey | Four launches, a fifth from the dialog, terminal focus. |
| launching from Tiles with a free slot lands the new tile with keyboard focus already inside it (INV-4) | INV-4 | journey | Launch into Tiles, terminal echo. |
| in attention sort with another session needing input, the launched session stays focused across a render tick (REQ-7, E8) | REQ-7, E8 | journey | Hooks drive needs-input; launch; focus across a tick. |

The census counts 2 of 5 as touching no daemon because the dialog path has none of the
lint's daemon identifiers; both launch through the dialog and read the terminal. Floor
artefact, nothing to port.

## `permission-mode.spec.ts` — 4 test blocks (7 tests with the ×4 loop) → 2 journey, 5 property (1 portable now, 4 property\*), 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| the "Start in" radiogroup keeps its role and accessible name across the rename (REQ-1 regression) | REQ-1 | **property** | `getByRole("radiogroup", {name: "Start in"})` visible. Portable with `empty`; fold into the launch dialog's static-layout render test rather than a test of its own. |
| picking auto and launching sends permissionMode: auto and seeds the session's latch; re-opening the dialog on that directory shows auto checked (E1, E2) | E1/E2, REQ-4 | journey | POST, `/api/state` latch, then the restore. |
| a synthesized UserPromptSubmit with permission_mode: default corrects an auto-seeded session to default/hook and working, not planning (E3, REQ-5) | E3, REQ-5, INV-1 | journey | Hook corrects the latch. |
| a stored lastPermissionMode of "<stored>" pre-selects the "<radio>" radio on reopen (E4, INV-2) — ×4: `default`→manual, `plan`→plan, `acceptEdits`→accept edits, `auto`→auto | E4, INV-2 | **property\*** ×4 | A restore display for a repos body whose first `lastPermissionMode` is each value; the restore sticks only when the browse lands `"ok"`. One fixture with four repos cannot serve it either (only the first recent restores on open; the others need a Recent click → browse). |

## `tiles-launch.spec.ts` — 3 tests → 2 journey, 1 property, 0 logic

| Test | Criteria | Level | Reason |
|---|---|---|---|
| Tiles shows the masthead New session button, with no Tiles-only button, and it opens the launch modal | rail-card-improvements REQ-6, INV-3 | **property** | Masthead button visible in Tiles, `#tiles-new-session-button` absent, `#tiles-empty` names "New session", clicking opens the dialog, Cancel closes it. The Tiles click is a prefs PUT (404 in the harness, view adopted only from the broadcast), so the fixture must hold `prefs.view: tiles` — scenario `empty-tiles`. |
| a session launched from Tiles appears as a live tile | TODO "Create new session from tile view" | journey | Launch lands as a live tile, not in the strip. |
| launching from Tiles with a full 2×2 grid promotes the new session and demotes one tile | same | journey | Four seeds, a fifth launch, grid/strip counts. |

## `past-sessions.spec.ts` — 25 tests → 21 journey, 4 property, 0 logic

Per the brief, the Resume tab's list is a transcript-reading daemon GET (`/api/past-sessions`),
so every row that needs a listed row is a journey. Six of them are display claims about a
listing and would become properties if the harness ever served a recorded listing; they are
flagged in Borderline, not counted as property here.

| Test | Criteria | Level | Reason |
|---|---|---|---|
| opening the dialog always lands on the New tab, even right after a previous open was left on Resume (REQ-7) | REQ-7 | **property** | Tab selection, `pastSessionsSection` shown/hidden, reset on reopen via both the chord and the button — client-side. Portable with `empty`; the past list shows the harness's fetch error, which the claim does not read. |
| switching to Resume and back to New restores the form exactly as it was left (User Flow 3) | User Flow 3 | **property** | Title/opus/accept-edits survive a tab round trip; `#launch-form .fields` hidden/visible. Portable with `empty`; the child click is setup and is dropped. |
| the Resume tab lists fixture sessions newest first, disables the one already open in Muster, and refuses a POST for it with already_open (REQ-9, E5, edge case 9) | REQ-9, E5, edge 9 | journey | Transcripts on disk, a bound bystander, the 409. |
| resuming a fixture session spawns claude --resume <id> --permission-mode plan with no --model and no --name, seeds the row, and opens it like any launch, leaving a bystander session untouched (REQ-10, REQ-13, E6) | REQ-10/13, E6 | journey | Resume POST, pane command, auto-focus. |
| selecting a bypass fixture row shows "Resume without checks", danger; a non-bypass row shows the ordinary "Resume" (REQ-11, E7) | REQ-11, E7 | journey | Needs listed rows. Display claim — see Borderline. |
| resuming a fixture deleted after listing shows the 404 message in #launch-error and the list drops it on refetch (REQ-10, E8, edge case 7) | REQ-10, E8, edge 7 | journey | Transcript deleted on disk; daemon 404; refetch. |
| with the daemon down, the Resume tab shows 'Couldn't read sessions — try again' (E9) | E9 | **property** | `fetchList`'s failure branch renders `FETCH_ERROR_MESSAGE` and disables the primary button; in the harness the GET 404s and takes the same `{ok:false}` branch. Portable with `empty`. See Borderline for the caveat (the E2E proves a connection-level failure, the harness a 404). |
| the filter narrows the list case-insensitively over title and last prompt, and shows 'No sessions match' when nothing does (REQ-14, E10) | REQ-14, E10 | journey | Needs listed rows. The filter itself is pure and already Vitest (`launchpastlist.test.ts`). See Borderline. |
| a directory with no Claude Code sessions shows the empty state, button disabled | States | journey | The empty state is the display of an empty daemon listing. See Borderline. |
| the Resume tab shows a loading state while the fetch is in flight, then renders the list (States) | States | journey | Holds the daemon's GET; the harness answers instantly. |
| navigating to another directory while on Resume refetches, clears the selection, and selects the first enabled row again (REQ-8, User Flow 4) | REQ-8, User Flow 4 | journey | Two listings via browse + past-sessions GETs. |
| resuming from the list advances the repo's MRU and launch count without overwriting its remembered model or Start-in mode (REQ-15) | REQ-15 | journey | Resume POST; `/api/repos` before/after. |
| INV-2's primary face recomputes on a tab switch in both directions | INV-2 | journey (split) | The New half (bypass face) is the `bypass.spec.ts` INV-2 property; the Resume half needs a selected row. Keep. |
| a past-sessions response for a directory no longer listed is dropped (W8, edge case 19) | W8, edge 19 | journey | Request-ordering guard against two real daemon answers. |
| a resume-bound row (source: resume) stays disabled and refuses a second resume with already_open (REQ-9, REQ-12) | REQ-9/12 | journey | Resume POST, resume-sourced SessionStart, 409. |
| an alive, unbound resumed row keeps its claude id disabled and refuses a second resume before it binds (kb:adr/launch-resume-pending-resume-holds-id) | ADR | journey | Pending claim across two POSTs. |
| a pending resume still holds its claude id across a daemon restart: the row stays disabled and a second resume is refused with 409 already_open | ADR | journey | `daemon.restart()`. |
| a session id freed by a /clear rebind is listed and resumable again (edge case 11) | edge 11 | journey | Hooks (`SessionEnd clear`, `SessionStart clear`), refetch, 201. |
| a resumed session with no recorded model shows unknown in the mainhead meta (kb:adr/launch-resume-null-model-reads-unknown) | ADR | journey | Resume POST; the "unknown" meta for `model: null` is a display property, but no fixture holds a null-model session and the resume is the point. See Borderline. |
| a long-titled bypass row's chip stays visible inside the row (REQ-11) | REQ-11 | journey | Row layout for a listing. See Borderline. |
| selecting a past-session row by keyboard keeps focus on the chosen row | focus | journey | Needs listed rows. See Borderline. |
| #launch-error clears when switching tabs | error clearing | journey | The error is a real resume 404. |
| #launch-error clears when a new row is selected | error clearing | journey | Same. |
| ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session' | a11y | **property** | Tab roving focus and the dialog's accessible name — client-side. Portable with `empty`. |
| a fixture recorded with an unoffered permission mode resumes with it passed verbatim (kb:adr/launch-resume-passes-any-recorded-mode) | ADR | journey | Resume POST, pane command. |

## `update.spec.ts` — 28 tests → 24 journey, 4 property (1 portable now, 3 property\*), 0 logic

The fixture generator (`internal/server/renderfix.go`) builds the server with
`Update: UpdateConfig{Install: KindDev}` and the update feature disabled, so every fixture's
`snapshot.update` is `{install: "dev", canCheck: false, available: null, checkedAt: null,
installed: null, apply: idle}`. A property that needs any other update state is
property\* here: the generator must either start the rig against an in-process fake
release host (the Go twin of `helpers/releases.ts`) or expose a seeded `UpdateInfo` for
a scenario. The Settings view model itself is already Vitest (`updateview.test.ts`).

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a strictly newer release badges Settings and shows Running/Available in the dialog (E1, INV-2) | E1, INV-2, rail-card-improvements-2 REQ-11 | **property\*** | Display for `{install: installer, available: "0.2.0", checkedAt: now}`: aria-label "Settings, update available", `data-update`, badge dot, `v0.1.0`, `v0.2.0 · checked now`, toggle checked, both buttons enabled. Needs an update-state scenario. |
| pref persisted off across a daemon restart: two check intervals pass with zero further /latest requests (E2, INV-1, edge case 6) | E2, INV-1, edge 6 | journey | Daemon restart, fake-server request counts. |
| unchecking the toggle clears the badge and available version; rechecking triggers an immediate check (E3, REQ-3, INV-1; plan rail-card-improvements-2 REQ-11) | E3, REQ-3, INV-1 | journey | Prefs PUT, broadcast, a real check. |
| clicking Update swaps the on-disk binary and reports Updated without restarting the running process (E4, User Flow 2) | E4 | journey | Download, sha256 of the binary. |
| Update and restart brings back the same Claude session, its terminal, and an unchanged tmux pane PID (E5, INV-5 one-session case) | E5, INV-5 | journey | Re-exec, tmux PIDs. |
| Update and restart with two Claude sessions and a plain shell names the shell in the confirm, then removes only the shell (E6, INV-5 two-session case) | E6, INV-5 | journey | Shell via API, re-exec, tmux. |
| each verification refusal reports Update failed and leaves the on-disk binary byte-identical (E7, INV-3, REQ-24) | E7, INV-3, REQ-24 | journey | Four tampered releases in one test (`checksums`, `missing-minisig`, `foreign-key`, `sha-mismatch`), four daemons. |
| a dev build never checks or badges, and the dialog shows no Update buttons (E8, REQ-8) | E8, REQ-8 | journey (split) | "not checked (development build)", Update absent, Restart hidden, badge hidden are the display for `install: dev` — portable with `empty` today. The zero-`/latest` half is the daemon's. Port the display half; keep the E2E for the request count. |
| a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy (E9, REQ-21, edge case 11) | E9, REQ-21, edge 11 | **property\*** | Display for `{install: homebrew, available, remedy: "…brew upgrade musterd…"}`. The classification of the exe path is daemon startup logic (Go). Needs an update-state scenario. |
| fake latest equal to running, then older: Available reads up to date and no badge either way (E10, D9, edge case 4) | E10, D9, edge 4 | journey | Two real checks against the fake host. |
| two pages clicking Update while the archive is held: exactly one download, both report Updated (E11, REQ-20) | E11, REQ-20 | journey | Two concurrent applies, one download. |
| Update and restart returns the dashboard on the same port and data dir (E12, INV-7) | E12, INV-7 | journey | Re-exec, same tokens, `/healthz`. |
| a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13, REQ-21, edge case 9) | E13, REQ-21, edge 9 | **property\*** | Display for `{install: unmanaged, remedy}`. Loose `/install\.sh|curl/i` match; the later E1 test pins the exact sentence (see Notes). Needs an update-state scenario. |
| `musterd -update` while the daemon runs is detected within one tick, showing Restart now with no click (E14, REQ-26) | E14, REQ-26 | journey | Out-of-band swap, daemon stat probe. |
| Restart now after a plain Update shows the confirm and completes with no second download (E15, REQ-25) | E15, REQ-25 | journey | Apply, restart, download count. |
| pressing Check now with a newer release published shows that version in the Available readout and badges the Settings button (E9) | rail-card-improvements-2 E9 | journey | `POST /api/update/check`. |
| with daily checking off from startup, the Available readout reads not checked yet, and pressing Check now replaces it with a checked age (E10) | E10, REQ-8 | journey | Prefs, restart, manual check. |
| pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value (E11) | E11, REQ-12 | journey | Failed check against a stopped host. |
| Check now is disabled on a daemon started with an empty update base URL (E12) | E12 | **property** | Display for `canCheck: false` — every fixture holds it. Portable with `empty`. |
| Check now disables the button the instant it starts and shows its result the instant it settles, not on the next periodic render tick (e-note-4) | maintainability-cleanup WF1 | journey | A real check with the page clock paused. |
| pressing Check now by keyboard keeps focus on it through the check and after it settles (REQ-3, E4) | focus-lands REQ-3, E4 | journey | Held check, focus across the settle. |
| a binary staged inside a scratch git tree shows the checkout root in the remedy; removing .git and pressing Check now enables Update and clears the status line (E1, REQ-2) | settings-update-failures E1, REQ-2 | journey | Recheck after removing `.git`; the exact remedy sentence and `expectRemedyContained` are the display half (property\* with an unmanaged update state). |
| a binary staged in a chmod 0555 directory shows the not-writable remedy; chmod 0755 and pressing Check now enables Update (E2, REQ-1) | E2, REQ-1 | journey | chmod, recheck. |
| Check now against a stopped release host shows the exact couldn't-reach-the-release-host sentence (E3, REQ-8) | E3, REQ-8 | journey | Manual check, daemon error sentence. |
| Update fails with the exact download-failure sentence when the release host stops before the click, leaving the on-disk binary byte-identical (E4, REQ-9) | E4, REQ-9 | journey | Apply against a stopped host. |
| Update and restart reloads the page: a pre-restart window marker is gone afterwards, the banner confirms the new version then hides, and Running shows it (E5, E6, REQ-16, REQ-17) | E5/E6, REQ-16/17 | journey | Real restart, reload, banner timing. |
| dashboard still boots and connects when the window.sessionStorage accessor itself throws | updaterestart edge 18 | journey | Connects to the daemon, then the daemon is killed for the banner. |
| a window holding a restart record reloads on a mismatched-protocol reconnect without ever showing the mismatch screen (REQ-16, edge case 17) | REQ-16, edge 17 | journey | Routed `/ws` proxies the real daemon and forces a reconnect. |

## Properties to port

Portable today (no harness change):

| Test | Fixture state | Notes |
|---|---|---|
| `launch.spec.ts` "opens on the browse root with an empty sidebar when there are no recents, exposing every Testable UI Element and none of the removed legacy browse controls" — static half only | `empty` (repos `[]`) | Assert the legacy controls absent, the five Model radios incl. fable, `other…` reveals Custom model, the four Start-in radios, Title/Launch/Cancel, "No recent directories" with zero sidebar buttons. Do **not** assert crumbs, Launch-in or `composedCrumbPath`; `#launch-error` will carry the harness 404. Fold `permission-mode.spec.ts` "the "Start in" radiogroup keeps its role and accessible name across the rename" into the same test. |
| `launch.spec.ts` "Escape and Cancel close the dialog; Opt+Cmd+N while already open does not reset the form" | `empty` | As written. |
| `launch.spec.ts` "a recent's title attribute is its full absolute path" | `three-states` (3 repos) | `title` equals each repo's `path` from the fixture's `repos`. |
| `launch.spec.ts` "a card for a known (non-first-launch) directory still shows the no-signal note after ~10s" | **new** `second-launch-no-signal`: two launches into one directory, no hooks, so the second session is `started`, `claudeSessionId null`, `firstLaunchHere false` | Open, `settleFor(page, …)` past `NO_SIGNAL_THRESHOLD_SECONDS` measured from the session's `createdAt` (fixture times are `FIXTURE_EPOCH` + minutes, so advance from the epoch to `createdAt` + threshold), then the note reads "no signal yet". Also assert the first session (firstLaunchHere true) reads the trust-prompt note. |
| `effort-launch.spec.ts` "the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked for a directory with no remembered effort" | `empty` | As written, including the DOM-order `compareDocumentPosition` check. |
| `effort-launch.spec.ts` "the Resume tab gains no Effort row: it hides with the rest of the New form's fields" | `empty` | Drop the transcript, child click and `pastSessionRow` wait; click Resume, assert Model and Effort radiogroups hidden. |
| `effort-launch.spec.ts` "clicking the max segment checks it, and it stays the checked one across a render tick" | `empty` | As written (`settleFor(1_200)`). |
| `effort-launch.spec.ts` — the keyboard half of "the arrow keys move the Effort selection with focus on the same node, it survives a render tick, and the keyboard-chosen level is what launches" | `empty` | Port the ArrowRight ×2 / focus node identity / two ticks; leave the launch half in E2E (or drop it — the click launch already proves effort reaches the pane). |
| `launch-model-check.spec.ts` "with the daemon down, opening the dialog marks and disables nothing" | `empty` | fable enabled, no `aria-invalid`, `#model-error` hidden, Launch enabled. Keep the E2E too if the connection-level failure is held to be the claim (Borderline). |
| `launch-defaults.spec.ts` "a fresh dialog with no launch history checks auto and sonnet" | `empty` | As written. |
| `bypass.spec.ts` "unchecking "bypass" restores the ordinary "Launch" face" + the pre-launch face half of "checking "bypass" shows the warning and turns Launch into a danger…" | `empty` | Warning hidden and "Launch" without `key-danger`; check bypass → exact warning sentence, "Launch without checks", `key-danger`; check manual → back. No child click. |
| `bypass.spec.ts` "the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives" | **new** `bypass-launch`: one session launched via the real POST with `permissionMode: "bypassPermissions"`, no hook (`firstLaunchHere true`) | Chip "bypass" on the card and `#mainhead`; the combined note sentence. |
| `bypass.spec.ts` — chip-shown half of "in Tiles, the bypass session's tile header shows the chip, and a hook reporting default removes it" | **new** `bypass-launch-tiles` = `bypass-launch` under `withPrefs(... {"view": "tiles"})` | Tile header chip "bypass". The hook half stays E2E. |
| `tiles-launch.spec.ts` "Tiles shows the masthead New session button, with no Tiles-only button, and it opens the launch modal" | **new** `empty-tiles` = `empty` under `withPrefs(... {"view": "tiles"})` | Do not click the Tiles button (a prefs PUT); the fixture holds the view. |
| `past-sessions.spec.ts` "opening the dialog always lands on the New tab, even right after a previous open was left on Resume" | `empty` | As written; reopen via both the chord and the button. |
| `past-sessions.spec.ts` "switching to Resume and back to New restores the form exactly as it was left" | `empty` | Drop the child click. |
| `past-sessions.spec.ts` "with the daemon down, the Resume tab shows 'Couldn't read sessions — try again'" | `empty` | Open, Resume tab, list text, primary button disabled. No `requestfailed` wait (the harness answers 404). |
| `past-sessions.spec.ts` "ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session'" | `empty` | As written. |
| `update.spec.ts` "Check now is disabled on a daemon started with an empty update base URL" | `empty` (`canCheck: false`) | Open Settings, Check now disabled. |
| `update.spec.ts` — display half of "a dev build never checks or badges, and the dialog shows no Update buttons" | `empty` (`install: dev`) | "not checked (development build)", `updateApplyButton` count 0, Restart hidden, badge hidden. The zero-`/latest` half stays E2E. |

Blocked on the harness (property\*; port when the listed capability exists):

| Capability missing | Tests it would unblock |
|---|---|
| `/api/browse` served from a recording in the fixture (per-path answers incl. the no-path root; the `/` listing for the root no-op tests) | `launch.spec.ts`: "opening the dialog with two prior launches…", "clicking a child entry descends…", "clicking an ancestor crumb navigates up…", "Cmd+ArrowUp navigates to the parent…", "clicking a second recent swaps the pressed mark…", "navigating to a child of the pressed recent clears every aria-pressed mark…", "a recent launched with a non-preset model preselects other…", "the dialog's bounding height is unchanged…", "the child listing shows No subdirectories for an empty directory", "keyboard traversal: Enter descends…", "keyboard traversal: descending and ascending re-anchors focus…", "ArrowLeft at the filesystem root is a genuine no-op…", "opening on a deep path scrolls the crumb bar…"; the crumb half of "opens on the browse root…". `launch-defaults.spec.ts`: "the dialog opens showing the first recent's remembered model, mode and effort before its own fetch returns". `bypass.spec.ts`: "a directory whose last launch was bypass opens the dialog on auto…". `permission-mode.spec.ts`: the ×4 "a stored lastPermissionMode of … pre-selects … on reopen". Scenarios they would need: repos with two entries (one launched later; one a real git checkout so the branch readout has a value), a repo with a non-preset `lastModel`, a repo with `lastPermissionMode: bypassPermissions`, four repos each with one stored mode (or four scenarios, since only the first recent restores on open), a directory with 25 subdirectories, a 12-segment deep path, an empty directory. |
| An update state other than dev/idle in the fixture (rig started against an in-process fake release host, or a seeded `UpdateInfo` per scenario) | `update.spec.ts`: "a strictly newer release badges Settings and shows Running/Available in the dialog" (`installer`, `available`, `checkedAt`), "a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy" (`homebrew` + remedy), "a binary staged inside a scratch git tree badges but disables both buttons naming the installer" (`unmanaged` + remedy), and the remedy-sentence/`expectRemedyContained` half of the two settings-update-failures remedy tests. Note the `checked now` suffix is relative to the page clock, which the harness pins at `FIXTURE_EPOCH`, so a recorded `checkedAt` at the epoch reads "checked now" stably. |
| `/api/past-sessions` served from a recording (per-directory listing) | Not proposed by the brief (listing = daemon answer), but would turn these display claims into properties: `past-sessions.spec.ts` "selecting a bypass fixture row shows "Resume without checks"…", "a directory with no Claude Code sessions shows the empty state, button disabled", the filter test's display half, "a long-titled bypass row's chip stays visible inside the row", "selecting a past-session row by keyboard keeps focus on the chosen row", and the Resume-tab half of "the Resume tab gains no Effort row…". |

## Borderline

- `launch.spec.ts` "a failed GET /api/repos shows the error…" and "a route.abort() on GET /api/repos shows the network error…" (REQ-13). Reading A: client resilience to a fabricated 500/abort — no daemon in the claim, a property if the render harness allowed a spec to override `/api/repos` (it does not: state comes only from the fixture, and a 500 repos body is not a daemon state). Reading B: the brief's "a daemon error" is a journey, and both tests also assert the browse pane reached the daemon's real root. Classified journey; a harness affordance for "this request fails" would move both.
- `launch-defaults.spec.ts` "a model picked before the initial restore lands…" (E9) and `effort-launch.spec.ts` "an effort picked before the initial restore lands…": the claim is a client ordering rule (touched beats restore), falsifiable with a held route rather than a daemon. Journey here because the held answer is the daemon's browse and the harness has no route hooks; a `dashboard.hold("/api/browse")` seam would make them properties alongside the browse recording.
- `launch-defaults.spec.ts` "a vanished first recent's held model, mode and effort return to the defaults…" and "…resets only the fields the user did not touch…" (REQ-3, E3/E4): the reset on a failed navigate is exactly what the harness does on every open, so the radio assertions are reproducible against a repos body with haiku/default/high today. But the tests also assert the fallback landed on the browse root (a successful second browse), which the harness cannot show. Kept as journeys; with the browse recording the two become properties (record the first recent's path as a 404 and the root as a listing).
- `launch-model-check.spec.ts` "with the daemon down, opening the dialog marks and disables nothing" (REQ-10, E5): classified property because the display is the no-verdict default and the harness's 404 reaches the same `{ok:false}` branch as a connection failure. The E2E additionally proves the request actually failed at the connection level (`requestfailed`), which a 404 does not; if that distinction is the requirement, keep the E2E and treat the render test as the display pin.
- `past-sessions.spec.ts` "with the daemon down, the Resume tab shows 'Couldn't read sessions — try again'" (E9): same shape as the previous item.
- `effort-launch.spec.ts` "the arrow keys move the Effort selection…and the keyboard-chosen level is what launches": split. Keyboard/focus/tick is a property; the pane command is a journey. Recommended: port the keyboard half, keep a shortened E2E for "the keyboard-chosen level launches" or drop it (the click launch at high already proves effort reaches argv).
- `bypass.spec.ts` "the bypass chip is shown on the rail card in every state (alive and dead)…" (INV-1): the per-state display could be a property over a multi-session bypass fixture (one session per state, all with the bypass latch), but the latch flip is hook-driven and the test is one walk. Kept as journey; a `bypass-states` scenario would let the display half move.
- `past-sessions.spec.ts` "a resumed session with no recorded model shows unknown in the mainhead meta": the "unknown" readout for `model: null` is a display property (no fixture holds a null-model session; `three-states`'s sessions are bound with a model). Kept as journey because the null model comes from a resume; a scenario that resumes from a model-less transcript would make the readout a property.
- `launch.spec.ts` "GET /api/browse returns 400 for a relative path and 404…", `effort-launch.spec.ts`'s three "POST /api/sessions with effort … is refused 400…" and "an invalid effort is checked after permissionMode and before the model pre-check": journeys by level (they cross the live daemon), but there is no UI in any of them. They are Go handler tests wearing Playwright; the cheapest level that falsifies them is `internal/server` unit tests, if not already covered there.

## Notes

- **Census floor is misleading for this batch.** `web/scripts/e2e-lint.sh`'s `DAEMON_IDENTS` does not include `browseScratchDirectory(`, `daemon.writeTranscript(`, `daemon.deleteTranscript(`, `daemon.paneStartCommand(`, `postResume(`, `getRepos(`, `openLaunchDialog(` or any picker helper, so a test that reads a transcript listing or clicks through browse answers counts as "touches no daemon". That is why `past-sessions` reads 16/25 and `launch` 9/29 while only 4 and 3 are portable today. Worth adding `writeTranscript|deleteTranscript|paneStartCommand|postResume\\(|getRepos\\(` to the idents.
- **Duplicated coverage.** `update.spec.ts` "a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13)" asserts the remedy loosely (`/install\.sh|curl/i`); the later "a binary staged inside a scratch git tree shows the checkout root in the remedy; removing .git and pressing Check now enables Update… (E1, REQ-2)" asserts the exact sentence and more. E13 is a strict subset. Likewise `bypass.spec.ts` INV-2 and the face half of its E1 test; `past-sessions.spec.ts` "INV-2's primary face recomputes on a tab switch" repeats the New-tab face.
- **Titles that claim more than they assert.** `launch.spec.ts` "the dialog's bounding height is unchanged … even with an overflowing listing" asserts the listing overflows (`scrollHeight > clientHeight`) but not that the dialog itself did not grow past the 300 px grid — only equality of heights across navigations. `launch-model-check.spec.ts` "an unrecognised preset is disabled while the currently-selected preset stays launchable" never clicks Launch; "launchable" is `toBeEnabled`. `past-sessions.spec.ts` "with the daemon down…" names the daemon down but asserts only text and a disabled button.
- **Load-sensitive waits.** `launch.spec.ts` "a card for a known … directory still shows the no-signal note after ~10s" waits real time (`timeout: 15_000`) for a 10 s threshold — a slow sweep makes it flaky, and the render port with `settleFor` removes the wall-clock dependency. `update.spec.ts` "Update and restart reloads the page…" pins the banner's hide window to 2.7–3.4 s of real time measured by a `MutationObserver`; E2 "pref persisted off…" holds 2.5 s real time for two 1 s intervals; `launch-model-check.spec.ts` and `launch.spec.ts` use several `settleFor(1_300..1_500)` holds (sanctioned, but each is a floor second). `launch-model-check.spec.ts` "with the daemon down…" and `past-sessions.spec.ts` "with the daemon down…" each kill a daemon and wait up to 15 s for the banner.
- **`for` loops.** `effort-launch.spec.ts` has one `for` over three effort values (3 tests from one block); `permission-mode.spec.ts` one `for` over four stored modes (4 tests); `update.spec.ts` "each verification refusal…" loops four tamper kinds inside a single test (one test, four daemons — a failure names the kind but the runner shows one row). The counts in the headings give both the block and expanded numbers where they differ.
- **`three-states` as a repos fixture.** It is the only existing scenario with more than one repo (4 in `groups`, 3 in `three-states`); neither has a repo with a non-preset `lastModel`, a `bypassPermissions` mode or a non-null `lastEffort`, so every restore property above needs its own scenario even once browse is recorded.
- **`openLaunchDialog` in the render tier.** The E2E helper clicks the masthead "New session" button; the render port can reuse the picker and resume helpers verbatim (they are pure locators) by moving them to `web/render/helpers/` and re-exporting from `web/e2e/helpers/`, as the card-location batch did.
