# E2E Test Specs: Effort

**Plan**: effort
**Mode**: fix (attempt 1, review cycle 1)
**Pack**: kb: pack 46090 words (budget 30000) — WARN pack exceeds budget of 30000 words
**Verdict**: pass
**Tests created**: 58 (57 originally; +1 in fix attempt 1) (17 in `effort-launch.spec.ts`, counting the `for` expansion of 3 invalid values; 40 in `effort-header.spec.ts`, counting the 5-width and 3-theme expansions), plus 5 existing assertions in `card-location.spec.ts` updated to the plan's delta
**Live run**: fix attempt 1: effort-header 41/41, soaked x10 `410 passed`, full `make e2e` not run (gate lock held); validate: 57/57 effort tests passing (effort-launch 17, effort-header 40), 145/145 with card-location; full suite 904/904

## Tests

Live-run cells: every row is `collection-only` (it asserts behaviour the tree does not have yet) except the one pin.

### `web/e2e/effort-launch.spec.ts` — daemon per test

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| effort-launch.spec.ts | the New form shows an Effort radiogroup of default, low, medium, high, xhigh and max in that order, between Model and Start in, with default checked … | REQ-1, E2 | `radiogroup` "Effort", six radios named `effort` with accessible names and values `""`,low..max in order, `default` checked, DOM position after `#model-error`/custom-model input and before Start in | collection-only |
| effort-launch.spec.ts | the Resume tab gains no Effort row: it hides with the rest of the New form's fields | REQ-1 | Resume tab hides Model and Effort together (the Effort group is inside the hidden `.fields`) | ran-green-at-authoring — `1 passed (5.5s)` (`npm run e2e -- e2e/effort-launch.spec.ts -g "gains no Effort row"`); a pin: the only new-behaviour part is an absence |
| effort-launch.spec.ts | launching with high from the dialog spawns the pane with --effort high, sends effort in the request, … | REQ-2, E3 | pointer-picked `high`: request body `effort: "high"`, pane start command carries `--effort high`, wire `effort` null / `effortWarning` null | collection-only |
| effort-launch.spec.ts | launching with default spawns the pane with no --effort, sends no level, and records no remembered effort | REQ-2, REQ-4, E3 | no `--effort`, request `effort ?? null` null, repo `lastEffort` null | collection-only |
| effort-launch.spec.ts | every level reaches the pane as --effort <level> and becomes the directory's lastEffort, and an API launch with effort null or none passes no flag | REQ-2, REQ-4, D4 | low/medium/xhigh/max each spawn their own flag and record `lastEffort`; null and absent spawn none and record null | collection-only |
| effort-launch.spec.ts | POST /api/sessions with effort "auto" / "ultracode" / "HIGH" is refused 400 invalid_request and writes no repo row, settings file, tmux session or session (3 tests) | REQ-3, D3 | exact 400 body, no repo row, no session, no tmux session, no `settings.local.json` | collection-only |
| effort-launch.spec.ts | an invalid effort is checked after permissionMode and before the model pre-check | REQ-3 | invalid permissionMode + invalid effort reports permissionMode; invalid effort + unrecognised model reports effort, nothing written | collection-only |
| effort-launch.spec.ts | after a launch with xhigh, reopening the dialog on that directory and clicking it in Recent both check xhigh, … | REQ-4, E4 | reopen restores `xhigh`; a newer directory's `low` restores on open and on Recent click; a `default` launch restores `default` and `lastEffort` null | collection-only |
| effort-launch.spec.ts | an effort picked before the initial restore lands stays checked, while the untouched model still restores from the recent | REQ-4 | held-back initial browse (as launch-defaults E9): picked `max` kept, model restores `haiku`, mode restores | collection-only |
| effort-launch.spec.ts | the arrow keys move the Effort selection with focus on the same node, it survives a render tick, and the keyboard-chosen level is what launches | REQ-1, REQ-2 | focus identity (`activeElement` + tagged node) after ArrowRight, held past a 1.2 s tick, twice; launch carries `--effort medium` | collection-only |
| effort-launch.spec.ts | clicking the max segment checks it, and it stays the checked one across a render tick | REQ-1 | real pointer click on the segment label, still checked after a tick | collection-only |
| effort-launch.spec.ts | a Resume-tab resume of a transcript whose last assistant line recorded low spawns the pane with --effort low, seeds effort low, and the header reads (low) before any post | REQ-11, E16 | Resume tab flow: `--effort low`, no `--model`, wire `effort {level: low}`, header `claude-opus-4-5-20251101 (low)`, `.eff` text ` (low)` | collection-only |
| effort-launch.spec.ts | a Resume-tab resume whose transcript recorded no effort passes no --effort, seeds effort null, reads (…) in the header and leaves the new repo row's lastEffort null | REQ-11, REQ-4 | no flag, wire `effort` null, header `… (…)`, `lastEffort` null on a new repo row | collection-only |
| effort-launch.spec.ts | a Resume-tab resume reads the transcript's LAST assistant line: … | REQ-11 | `["high","low"]` → `--effort low`; `["high", null]` → no flag, effort null | collection-only |
| effort-launch.spec.ts | a Resume-tab resume leaves the directory's lastEffort as the last launch set it, and the resume form refuses a non-null effort with the combination message before looking for the transcript | REQ-3, REQ-4, REQ-11, D8 | message `resumeSessionId cannot be combined with title, model, permissionMode or effort` (400 before the 404); `effort: null` accepted; `lastEffort` still `high` after the resume | collection-only |

### `web/e2e/effort-header.spec.ts` — daemon per test

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| effort-header.spec.ts | a launched session with no status post yet reads <model> (…), a dead one that never reported reads the model with no brackets | REQ-6, E5, E6 | `sonnet (…)`, `.eff` ` (…)`, wire null; after end the brackets go | collection-only |
| effort-header.spec.ts | a later post with another level changes the header to it with no strip, and a post with no effort key drops the brackets and reads {level: null}, never null | REQ-5, REQ-6, E7, INV-E4 | `(high)` → `(low)`, no strip; Haiku post without the key → `Haiku 4.5`, wire `{level:null}`; back to `(high)` | collection-only |
| effort-header.spec.ts | a status post that changes only the effort never changes state, stateSince, attention, failure, alive, permissionMode or compactions | INV-E5 | the seven fields identical before and after three effort posts | collection-only |
| effort-header.spec.ts | a changed effort is broadcast as exactly one session upsert and an unchanged one as none | REQ-5, D5 | `sessionUpsert` frame counts for a pair, a repeated pair, a changed level | collection-only |
| effort-header.spec.ts | a level outside the five is shown and stored verbatim and compared verbatim against the request | REQ-5, D5 | `(ultra)` in the header, wire level and warning `actual` `ultra` | collection-only |
| effort-header.spec.ts | effort survives Stop, a /clear rebind and a daemon restart … | INV-E4, REQ-6 | `(xhigh)` kept through `/clear`, end (dead-and-reported keeps it), restart + reload | collection-only |
| effort-header.spec.ts | a launch with max whose first post reports high shows the strip 'Asked for max — Opus 4.5 started at high.' under the header and tints the effort warn | REQ-7, REQ-8, E8, INV-E1 | sentence, `<b>` parts, `.eff.warn`, wire warning, computed colours equal `--warn` / `--warn-bg` / `--warn-fg` / `--warn-line` | collection-only |
| effort-header.spec.ts | the strip is a full-width status line directly under the header and above the terminal, with the ⚠ glyph hidden … and Dismiss on its right | REQ-8 | geometry between `#mainhead` and `#main-terminal-slot`, `aria-hidden` glyph, Dismiss at the right | collection-only |
| effort-header.spec.ts | a launch with high whose first post carries no effort key shows the strip ending 'has no effort setting, so it started without one.' … | REQ-7, REQ-8, E9 | exact sentence, header `Haiku 4.5`, no `.eff`, wire warning `actual: null` | collection-only |
| effort-header.spec.ts | a launch whose first post reports the level it asked for shows no strip, and a later post at another level never raises one | REQ-7, E10, INV-E2 | `max`→`max` no warning; later `low` no warning | collection-only |
| effort-header.spec.ts | a default launch shows no strip after its first post, whatever level that reports, and none after a later one | REQ-7, E10, INV-E2 | default launch, reports `medium` then `max`, no warning | collection-only |
| effort-header.spec.ts | a bystander's first report never sets or clears another session's warning | INV-E2 | session A's pending check and effort untouched by B's report; A's own first post still checked | collection-only |
| effort-header.spec.ts | Dismiss removes the strip and the tint, leaves the effort and the model as they were, and persists the clear | REQ-9, E8 | click Dismiss: no strip, no `warn` class, colour not `--warn`, wire warning null, later posts do not re-raise | collection-only |
| effort-header.spec.ts | Dismiss is reachable and activates from the keyboard | REQ-9 | focus identity on the button across a tick, Enter dismisses | collection-only |
| effort-header.spec.ts | DELETE …/effort-warning answers 204, broadcasts one upsert, answers 204 again with none, and 404 unknown_session … | REQ-9, D13 | status, empty body, upsert counts, 404 body | collection-only |
| effort-header.spec.ts | DELETE …/effort-warning without the UI cookie is refused 401 unauthorized and leaves the warning set | REQ-9 | 401 `unauthorized`, warning intact | collection-only |
| effort-header.spec.ts | with two warned sessions, Dismiss on one removes its strip and tint in both dashboards at once, and the other session's strip and warning remain | REQ-9, E12, INV-E3 | two pages on one daemon, live removal in the second, bystander intact on the wire and in both pages | collection-only |
| effort-header.spec.ts | an undismissed strip survives a page reload, appears in a second dashboard on the same daemon, and survives a daemon restart | REQ-7, E11 | reload, second page, `daemon.restart()` + reload | collection-only |
| effort-header.spec.ts | a launch whose check is still pending when the daemon restarts is still checked on the first post after it | INV-E2 | edge case 15 | collection-only |
| effort-header.spec.ts | a /clear rebind leaves a set warning and a pending check as they were … | INV-E2, INV-E3 | edge case 13 | collection-only |
| effort-header.spec.ts | with the daemon killed the header keeps its effort and the strip stays, a Dismiss then fails into the action-error line, and works once the daemon is back | REQ-8, E13 | `daemon.kill()`: strip and tint stay, Dismiss -> `#action-error`, recovers after restart | collection-only |
| effort-header.spec.ts | a Dismiss the daemon answers with a 500 leaves the strip and the tint … and a retry succeeds | REQ-9 | fulfilled-500 failure mode | collection-only |
| effort-header.spec.ts | a Dismiss whose request is aborted before any answer leaves the strip and the tint … | REQ-9 | `route.abort` connection-level failure mode, distinct from the 500 | collection-only |
| effort-header.spec.ts | the size note's row count drops when the strip appears and returns when it is dismissed, and the terminal never sits under the strip | REQ-13, E14, INV-E6 | size note rows cross-checked against tmux `#{window_height}` on both sides inside the retry; strip bottom above terminal top | collection-only |
| effort-header.spec.ts | a terminal that holds keyboard focus keeps the same focused node when the strip appears and across a render tick | REQ-13, INV-E6 | `activeElement` node identity inside the terminal | collection-only |
| effort-header.spec.ts | the strip belongs to the Focus view only: Tiles shows none, and Focus shows it again | REQ-8 | view switch | collection-only |
| effort-header.spec.ts | at 1280 / 800 / 600 / 400 / 316px the strip wraps inside the window with Dismiss in view, and the model with its bracketed effort is never clipped (5 tests) | REQ-6, REQ-8, R4 | Dismiss box inside the viewport, strip not overflowing, `.model` incl. `.eff` not truncated | collection-only |
| effort-header.spec.ts | in the Instrument / Dark / Light theme the --warn family is defined, --warn sits outside amber's hue band, and the strip and the tint use it (3 tests) | REQ-12, REQ-8 | four tokens non-empty per theme (theme chosen through Settings), `--warn` hue outside `contrast-pairs.json`'s amber band, computed colours equal the tokens | collection-only |
| effort-header.spec.ts | the Resume button on a session whose last post reported medium spawns the pane with --effort medium and the header reads (medium) before any new post | REQ-10, E15 | `--resume <id> --effort medium`, header and wire unchanged | collection-only |
| effort-header.spec.ts | the Resume button passes no --effort for a session that never reported or reported no effort, and keeps its effort exactly as it was | REQ-10, INV-E4 | null stays null (`(…)`), `{level:null}` stays `{level:null}` (`Haiku 4.5`) | collection-only |
| effort-header.spec.ts | a Resume-button resume of a warned session keeps the existing warning, raises no new one after its first post, and the warning stays until dismissed | REQ-10, E17, INV-E2 | warning identical on the wire across resume and a post | collection-only |
| effort-header.spec.ts | a Resume-button resume of a session whose warning was dismissed raises none after its first post | REQ-7, INV-E2 | dismissed source state | collection-only |
| effort-header.spec.ts | a Resume-button resume of a session that ended before its first post cancels the pending check … | REQ-7, REQ-10, INV-E2 | edge case 11 | collection-only |
| effort-header.spec.ts | Resume-button resumes of two sessions each pass their own level and leave the other's untouched | REQ-10 | multi-session variant | collection-only |

### Updated existing assertions — `web/e2e/card-location.spec.ts`

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| card-location.spec.ts | the launch-then-SessionStart bind test around line 707 (E8) | REQ-6 (plan delta) | the pre-status header reads `claude-sonnet-5-5 (…)` where it read `claude-sonnet-5-5` | collection-only (red until web-impl) |
| card-location.spec.ts | the Resume-tab null-model test around lines 787 and 795 (E9) | REQ-6 | `unknown (…)`, then `claude-sonnet-5-5 (…)` | collection-only |
| card-location.spec.ts | `openFitSession` (line ~1123) and `assertFocusHeaderFits` (line ~1167), used by the header-fit sweeps | REQ-6, kb:adr/focus-model-never-truncates-name-blocks-give-way | alive bound session `<full model id> (…)`; the `ended` state reads the model alone | collection-only |

## Deleted Tests

None.

## Fixture Changes

- `web/e2e/helpers/effort.ts` (new) — locators (`effortRadiogroup`, `effortRadio`, `pickEffort`, `headerModel`, `headerEff`, `effortStrip`, `stripDismiss`, `stripSentence`), `postEffort` (status post carrying `effort: {level}` from kb:fact/status-line-effort-key, version `2.1.300`, sent as a close pair per kb:fact/status-posts-arrive-in-pairs; Opus 4.5 with a level and Haiku 4.5 without the key, per kb:fact/effort-levels-per-model), `launchBound`, wire oracles (`wireEffort`, `trackEffortUpserts`, `untouchedByStatus`), size-note/tmux row oracle (`settledRows`), colour oracles and the amber hue band read from `scripts/contrast-pairs.json`.
- `web/e2e/helpers/session.ts` — `LaunchBody.effort`; `launchSession` sends it when defined; `SessionObject` gains `effort` and `effortWarning` (plan: raw Session shapes gain the keys).
- `web/e2e/helpers/resume.ts` — `RepoObject.lastEffort`.
- `web/e2e/helpers/daemon.ts` — `TranscriptFixtureOpts.assistantEfforts`, additive: one `assistant` line per entry with the top-level `"effort"` key kb:fact/resume-does-not-restore-effort measured (`null` = a line without it). No existing caller passes it, so existing transcripts are byte-identical.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | form shape/order test; Resume-tab hides test; arrow-key identity test; pointer-click test |
| REQ-2 | high-from-dialog, default-from-dialog, every-level argv test, arrow-key launch |
| REQ-3 | three invalid-value tests; check-order test; resume-form combination test |
| REQ-4 | every-level argv (lastEffort); xhigh remember/Recent; touched-race; Resume-tab lastEffort tests |
| REQ-5 | live-change test; INV-E5 test; upsert-count test; verbatim-level test |
| REQ-6 | no-post/dead test; live-change test; width sweep; updated card-location assertions |
| REQ-7 | clamped, no-effort, matching, default, bystander, restart-pending, `/clear`, Resume-button tests |
| REQ-8 | clamped test; strip-shape test; Tiles test; width sweep; daemon-down/500/abort tests; theme tests |
| REQ-9 | Dismiss click/keyboard tests; DELETE contract tests (204/204/404/401); two-session test; failure-mode tests |
| REQ-10 | Resume-button tests (medium, none, null-level, warned, dismissed, pending, multi-session) |
| REQ-11 | four Resume-tab tests |
| REQ-12 | three theme tests (tokens defined, outside amber's band, used by strip and tint); `make contrast` itself is acceptance W4 |
| REQ-13 | size-note row test; terminal-focus test |
| REQ-14 | not E2E — the canary's static tier (`test/canary/static_test.go`), acceptance D14 |
| E1 (`make e2e`) | the validate step |

## Handoff

- **Unmeasured shape, flagged**: `effort.level` outside `low|medium|high|xhigh|max`. The contract calls it "an open string" and D5 demands verbatim handling, but no fact record measured a sixth value. One test (`a level outside the five…`) posts `{"level": "ultra"}`; the field's shape (string under `effort.level`) is measured, only the value is invented. An `/interface-probe` would settle whether any real model reports another level.
- **Plan wording to confirm against markup**: the plan's Daemon-down state names "the mainhead's existing action-error line". The only existing action-error element is the global `#action-error` (`web/index.html`, a `role="alert"` `<p>`), so the specs locate `#action-error`. If web-impl puts the failure elsewhere, validate repairs the locator.
- **Locator choices the plan left open**: the strip is found as `getByRole("status")` filtered by `Asked for` (the terminal notice, the `session ended` pill and the drop notice are `status` too); Dismiss is `getByRole("button", {name: "Dismiss"})` scoped to it. The `.eff` leading space is asserted through `textContent` (` (high)`), not `toHaveText`, which normalises whitespace.
- **Existing-spec updates are provisional on the delta**: the five `card-location.spec.ts` assertions now expect `(…)` on an alive, never-reported, bound session — what REQ-6 specifies. They are red until web-impl lands and are listed above so the reviewer can veto.
- **Harness files**: no change needed to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`. `helpers/daemon.ts`, `session.ts` and `resume.ts` changed additively (above).
- Gate checks run clean: `npx playwright test --list` (no error), `npx tsc --noEmit`, `sh scripts/e2e-lint.sh`, `node scripts/e2e-fixture-leak-check.mjs`.

## Test Run Output

```
$ npx playwright test --list
...
Total: 904 tests in 58 files

$ npm run e2e -- e2e/effort-launch.spec.ts -g "gains no Effort row"
  ✓  1 [chromium] › e2e/effort-launch.spec.ts:104:1 › the Resume tab gains no Effort row: it hides with the rest of the New form's fields (REQ-1) (2.5s)
  1 passed (5.5s)
```

## Notes

- Authoring only: tests asserting new behaviour were not run and are expected red against the current tree. The first Effort-related assertion in each is the one that fails today (for example the `radiogroup` "Effort" in the form test, `lastEffort` undefined in the default-launch test).
- No real `claude` is launched anywhere; the stub's argv is read through `paneStartCommand`, as `bypass.spec.ts` and `launch.spec.ts` do.
- Fixture plan: both new specs use the per-test `daemon` fixture, as the plan's header records.
- The recents-ordering steps wait for the next clock second (`waitForNextClockSecond`) before the second launch, since `last_launched_at` is whole-second RFC3339.


## Validate Attempt 1

Rebuilt (`make web-build build`), ran `effort-launch.spec.ts` + `effort-header.spec.ts`: first run `5 failed, 52 passed`
(`:469`, the dismiss 404 message, now passes against the daemon fix). All five were spec defects, repaired below; second run
of the three files (effort-launch, effort-header, card-location): `145 passed (1.3m)`. Full suite `make e2e`: `904 passed (9.0m)`.

Soaks (`make e2e-soak N=10`):

| Spec file | Soak summary |
|-----------|--------------|
| web/e2e/effort-header.spec.ts | `400 passed (3.1m)` |
| web/e2e/effort-launch.spec.ts | `170 passed (1.4m)` |
| web/e2e/card-location.spec.ts | `880 passed (10.7m)` |

Tests-table Live-run cells for every effort row: now green (validate attempt 1, each soaked x10 above).

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | a launch with max whose first post reports high shows the strip ... (REQ-7, REQ-8, E8, INV-E1) | `Expected "opus (…)", Received "claude-haiku-4-5-20251001 (…)"` | `launchBound`'s bind `SessionStart` used `envelopedSessionStart`'s default haiku `model`; a real bind hook carries `model` only sometimes (kb:fact/sessionstart-model-optional-string), and the header reads the hook's model once bound | `launchBound` takes `opts.bindModel`; this test passes `{ bindModel: null }` so the bind hook omits the optional `model` (a measured shape) and the header keeps the launched `opus` | REQ-6/E8: `opus (…)` exact text before the first post, no strip, then the clamped strip and warn tint as before; value assertion unchanged |
| 2 | effort survives Stop, a /clear rebind and a daemon restart (INV-E4) | `Expected "Opus 4.5 (xhigh)", Received "claude-haiku-4-5-20251001 (xhigh)"` | the `/clear` `SessionStart` fixture carried a haiku id; kb:fact/sessionstart-model-optional-string measured `model` absent on `source:"clear"` | `/clear` hooks pass `model: null` (absent), in all three `/clear` fixtures in the file | INV-E4/REQ-5: `Opus 4.5 (xhigh)` exact text and wire `{level: "xhigh"}` after the `/clear` |
| 3 | a /clear rebind leaves a set warning and a pending check ... (INV-E2, INV-E3) | `Received "claude-haiku-4-5-20251001 (high)"` | same as #2 | same as #2 | warning wire, strip count and `Opus 4.5 (high)` unchanged |
| 4 | effort survives Stop, a /clear rebind and a daemon restart (INV-E4), second failure once #2 was fixed | `session 1 not found in state snapshot` after `daemon.restart()` | the test ended the session and then restarted; kb:adr/lifecycle-ended-rows-swept-next-start deletes an already-ended row at the next start (a probe confirmed `/api/state` sessions `[]` after restart), so no stored level could be read; the plan's "survives restart" is about a live row | order is now /clear, restart while the pane lives (wire effort still `{level:"xhigh"}`, header after reload `Opus 4.5 (xhigh)`), then Stop (header and wire still `xhigh`) | INV-E4: effort survives /clear, restart, reload and Stop, each asserted by value; the Stop-then-header assertion is kept, moved after the restart |
| 5 | at 400px / at 316px the strip wraps inside the window ... (REQ-6, REQ-8) | `.eff` right edge 415.6 > 400 at 400px; Dismiss outside the window at 316px | the plan's R4 "316px" is the header's own width (`@container (width < 316px)`, design-system.md "316px of header content") and the rail is a fixed 300px, so a 316px or 400px *window* leaves a 16px or 100px header in which the pre-existing `.model` already overflows (web-impl measured `main` 16px wide at 316) | width list is windows `[1280, 800, 700, 616, 600]`: 616 is the 316px header, 600 the narrowest existing sweep (300px header, already passing), 700 the 400px-header window; added an oracle that `#mainhead` is at least `window - 300` wide | REQ-6/REQ-8/R4: every case still asserts Dismiss inside the window, strip not clipped, `.model` scrollWidth <= clientWidth, `.eff` right <= model right <= window; the new poll proves the header width is the claimed one |

Also: the `web/e2e/helpers/effort.ts` comment reference is now `web/scripts/contrast-pairs.json` (`go tool kb refs`: `1168 references checked, 0 missing`). `make check-kb` still reports three problems, none in my files: `internal/claudecode/effort_test.go` and `internal/store/effort_test.go` owned by no feature, and `web/src/features/CLAUDE.md` 419 words (budget 400).

No assertion was deleted, skipped, or weakened. No absence assertion was repaired, so no deliberate-breakage run was needed.

## Handoff (validate)

- Plan defect, wording only: R4 and the Warning-strip row say "from 316px to full width" without saying it is the header's width; against a fixed 300px rail the narrowest window the plan can mean is 616px. The spec encodes that reading; a 400px or 316px window is a geometry the existing header cannot satisfy (its model already overflows there), independent of the strip. Cases kept: header 316px, header 300px (600px window) and wider.
- Daemon: the dismiss-route 404 message fix is verified (`:469` green).
- For doc-reconcile or the orchestrator, not mine: the three `make check-kb` problems above.
- Harness files unchanged (`playwright.config.ts`, `fixtures.ts`, `gatelock.ts`, `e2e-lint.sh`). The gate lock was held by `muster-cache-timing` for long stretches; every wait was the gate's own, nothing bypassed.


## Fix Attempt 1 (review cycle 1)

**Addressed**: review Critical 1 `[e2e-specs]` (unpolled `computed()` reads, `:440` vacuous) and the dismiss-route 404 body (kb:adr/focus-effort-dismiss-404-uses-shared-body). Rebuilt first (`make web-build build`).

New test (the `.eff` node is now kept across passes, web-impl Fix Attempt 1):

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/effort-header.spec.ts | the header's effort node survives render ticks and a repeat post of the same level, still reading its bracket and tint (REQ-6, REQ-8) | REQ-6, REQ-8 | tags `.eff`, holds 2.5 s of ticks plus a repeat post, the same tagged node still reads ` (high)`, is the only `.eff`, keeps `warn` and the `--warn` colour | ran-green; red against the pre-fix `mainhead.ts` (`dd377598~1`): `element(s) not found` for `.eff[data-e2e-node="eff"]` |

The Dismiss click path is still covered: E8 clicks `stripDismiss` (now wired from `features/focus.ts`), the keyboard test activates it with Enter, the two-page test dismisses across windows; all green.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 6 | E8 clamped launch (`:282` block), Dismiss (`:440` block), the 3 theme cases | `computed(headerEff, "color")` read `""` (Dark case in gate E1) | `computed()` was a one-shot `locator.evaluate`; `renderModel` replaced `.eff` between resolve and evaluate and a detached node reads `""` | `computed()` throws on `""` (a miss, never a value); every colour read, all four props, is inside `expect.poll(...)` | REQ-8/REQ-12: `.eff` colour equals the live `--warn`, strip bg/colour/border equal `--warn-bg`/`--warn-fg`/`--warn-line`; values unchanged |
| 7 | Dismiss removes the strip and the tint ... (REQ-9, E8) | `:440` `.not.toBe(warnColour)` passed vacuously on `""` | negative assertion on a possibly-empty read | before the click, poll `.eff` colour `toBe(--warn)`; after, poll `.model` colour `toMatch(/^rgb/)`, poll `.eff` colour `===` `.model` colour `toBe(true)`, and poll `.eff` colour `.not.toBe(warnColour)` | REQ-9: tint gone, as a positive value. Deliberate breakage: `style.css` `.eff.warn` selector changed to `.eff` (tint always on, class still removed), rebuilt, the test went red on the new `.eff` equals `.model` poll (`Expected: true, Received: false`, `effort-header.spec.ts:452`); restored, `git status` shows only spec files plus the orchestrator's state file |
| 8 | DELETE /api/sessions/{id}/effort-warning answers 204 ... 404 unknown_session (REQ-9, D13) | expected `no session with that id` | the contract changed to the shared body by user decision | expects `{error: {code: "unknown_session", message: "unknown session id"}}` | REQ-9/D13: full 404 body asserted by value |

No assertion was deleted, skipped, or weakened.

### Soak and sweep

`make e2e-soak SPEC=effort-header.spec.ts N=10`: `410 passed (3.4m)` (was `390 passed, 10 failed` on the 404 body in web-impl's soak). `effort-launch.spec.ts` does not use `computed` and was not touched. `make e2e` (full sweep) was attempted twice and gave `gatelock: busy after 4m0s — held by pid 85067 exclusive /Users/damian/Documents/code/Projects/muster-claude-version-watch` (exit 75, "not a test failure"); the orchestrator's gate run covers it. `npx playwright test --list`: `Total: 905 tests in 58 files`.

## Handoff (fix)

None. Harness files unchanged.
