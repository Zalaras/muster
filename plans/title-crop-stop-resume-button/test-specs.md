# E2E Test Specs: Title crop and Stop/Resume button

**Plan**: title-crop-stop-resume-button
**Mode**: fix (attempt 1, review cycle 1)
**Pack**: kb: pack 14720 words (budget 30000)
**Verdict**: pass
**Tests created**: 35 new (web/e2e/focus-header.spec.ts; 9 added in fix attempt 1) plus 8 existing tests/loops rewritten to the single-button, uncapped, title-last header (listed under Tests)
**Live run**: validate: 18/25 passing in `focus-header.spec.ts` (7 E3 sweeps red on INV-4, an implementation-bug); the other five named specs 88 + 79 passing; full `make e2e` 781 passed / 7 failed (the same 7). Authoring note: Collection: `npx playwright test --list` → `Total: 788 tests in 53 files`, no error. One regression pin run live: 1/1 passing. The rest were also run once against the pre-fix build (`make web-build build` at `afbe5da9` + this tree's e2e edits only) to prove they fail on the assertion the plan names, not on a locator; they stay `collection-only`.

## Tests

Fixture plan: `daemon` (fresh per test) for every test in `focus-header.spec.ts`, with `test.use({ daemonOptions: { repoPoll: "200ms" } })` at file level (a checkout and a Claude move must show inside the 15 s expect timeout). Rewritten tests keep the fixture shape their files already use.

| File | Test Name | Requirement | What It Verifies | Live run |
|------|-----------|-------------|------------------|----------|
| web/e2e/focus-header.spec.ts | sweeping the window from 2000px to 600px and back in 16px steps, … : baseline: title 9, folder 35, branch 4, unmoved, alive, grouped (E3) | REQ-1, REQ-2, REQ-3, REQ-7 | Sweep asserting INV-1, INV-2, INV-3, INV-4, INV-8 at every step plus the REQ-2 order (cluster drops only after `↳` hid, title shortens only after the cluster dropped, cluster moves as one), that widening retraces narrowing, and that the cluster-drop step takes no width from title or readout (REQ-7); also `mainheadFitProblems` (model whole, `.loc` no wider than what it shows) | collection-only — run pre-fix: red at 2000px, `INV-3: repo .rf 203.2 of 250.6px ellipsized while the header is on one row` (the plan's 30ch cap) |
| web/e2e/focus-header.spec.ts | … : title 9, folder 35, branch 4, moved, alive, grouped (E3) | REQ-1, REQ-2, REQ-3, REQ-7 | Same sweep with the `↳` block (worktree move) | collection-only — pre-fix red: `INV-3 … ellipsized with the ↳ block drawn` |
| web/e2e/focus-header.spec.ts | … : title 52, folder 35, branch 4, unmoved, alive, grouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep, 52-character title | collection-only — pre-fix red at 2000px (INV-3) |
| web/e2e/focus-header.spec.ts | … : title 300, folder 60, branch 80, moved, alive, grouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep, longest title via status-line `session_name`, longest folder and branch, moved | collection-only — pre-fix red: readout at 55px and `REQ-2: the title is ellipsized while the cluster is still on row one` |
| web/e2e/focus-header.spec.ts | … : title 9, folder 6, branch 4, unmoved, alive, ungrouped (E3) | REQ-2, REQ-3 | Same sweep, readout shorter than the floor, no group control | collection-only — pre-fix red at 1136px: `the cluster must move as one` (switch on row one, buttons on row two) |
| web/e2e/focus-header.spec.ts | … : title 52, folder 60, branch 80, unmoved, dead, grouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep on a dead session (ended clause in the meta row) | collection-only — pre-fix red (INV-3) |
| web/e2e/focus-header.spec.ts | … : title 9, folder 6, branch 80, unmoved, dead, ungrouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep, dead, short folder over an 80-character branch | collection-only — pre-fix red (INV-3 on `.rb`) |
| web/e2e/focus-header.spec.ts | … : title 300, folder 35, branch 4, unmoved, dead, grouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep, dead, 300-character title | collection-only — pre-fix red (INV-3 + REQ-2) |
| web/e2e/focus-header.spec.ts | … : title 300, folder 6, branch 80, unmoved, alive, ungrouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep, 300-character title over a short folder and long branch | collection-only — pre-fix red (INV-3 + REQ-2) |
| web/e2e/focus-header.spec.ts | … : title 52, folder 35, branch 80, moved, alive, grouped, bypass chip (E3) | REQ-1, REQ-2, REQ-3 (edge case 13) | Same sweep with the danger chip after the name (launched `bypassPermissions`) | collection-only — pre-fix red (INV-3) |
| web/e2e/focus-header.spec.ts | … : title 52, folder 60, branch 4, moved, alive, ungrouped, shell segment selected (E3) | REQ-2, REQ-3 (edge case 14) | Same sweep with the `shell` segment selected while the cluster drops | collection-only — pre-fix red (INV-3) |
| web/e2e/focus-header.spec.ts | … : title 9, folder 60, branch 4, moved, alive, grouped (E3) | REQ-1, REQ-2, REQ-3 | Same sweep, short title over a 60-character folder, moved | collection-only — pre-fix red (INV-3) |
| web/e2e/focus-header.spec.ts | a 35-character folder at a 1700px header shows its whole folder line on one row (E3, REQ-1) | REQ-1 | At a 1700 px header the `.rf` box is as wide as its own max-content width (oracle: a hidden clone in the line's font), on one row, and wider than the old 30ch cap; both sides re-read in the poll | collection-only — pre-fix red: `"wholeLine": false` (203 of 251 px) |
| web/e2e/focus-header.spec.ts | clicking Stop in the header and confirming turns that same element into an enabled Resume in the same box, with Remove unmoved (E1) | REQ-5, REQ-6 | One element reads `Stop`, is tagged, survives the confirmed Stop as `Resume`, enabled, box equal, Remove box equal, no `Stop` left (INV-6, INV-7); session `alive:false` | collection-only — pre-fix red: two Stop/Resume buttons (`toHaveCount(1)` received 2) |
| web/e2e/focus-header.spec.ts | clicking Resume in the header on a dead session turns that same element into Stop once the session is alive, in the same box, with Remove unmoved (E2) | REQ-5, REQ-6 | Dead bound session: Resume click, no dialog, same node reads `Stop`, boxes equal, `alive:true` | collection-only — pre-fix red (two buttons) |
| web/e2e/focus-header.spec.ts | the header's Resume keeps focus and node identity when a real Enter resumes the session and the label becomes Stop, then across a tick (REQ-5, REQ-6) | REQ-5, REQ-6 | Focus + real `Enter` (never `locator.press()`), `document.activeElement` and node tag survive the label swap and a >1 s tick | collection-only — pre-fix red (strict-mode: two buttons) |
| web/e2e/focus-header.spec.ts | a dead session with no bound Claude id shows exactly one header button reading Resume, disabled, with the existing reason as its hover title (E5) | REQ-5 | One disabled `Resume`, `title` = the existing reason, no `Stop`, `claudeSessionId` null | collection-only — pre-fix red (two buttons) |
| web/e2e/focus-header.spec.ts | with the WebSocket closed the header's one button is disabled under its label, and a dead session with no Claude id stays disabled after the reconnect (E6, REQ-5) | REQ-5 | Routed WS closed from outside: `Resume` and Remove disabled; after reconnect Resume stays disabled with its reason (enabled iff connected AND bound), Remove re-enables | collection-only — pre-fix red (two buttons) |
| web/e2e/focus-header.spec.ts | at 2000px the surface switch is inside the actions, immediately before Stop and Remove, with Remove at the header's right edge (REQ-4, INV-5) | REQ-4 | `#mainhead .acts .surfseg` count 1 with its three segments; switch → Stop gap ≤ 16 px, Stop before Remove, one row, Remove right edge = header content edge (±1) | collection-only — pre-fix red (`.acts .surfseg` count 0) |
| web/e2e/focus-header.spec.ts | at 1200px the surface switch is inside the actions, … | REQ-4 | Same, one-row-to-two-row transition width | collection-only — pre-fix red |
| web/e2e/focus-header.spec.ts | at 800px the surface switch is inside the actions, … | REQ-4 | Same, two-row layout | collection-only — pre-fix red |
| web/e2e/focus-header.spec.ts | at 2000px renaming to a longer title and moving Claude to lengthen the readout leaves the surface switch, Stop and Remove where they were (E4) | REQ-4 | Rename through the UI (real keys) to 40 chars, branch to 40 chars, `↳` block to a long worktree: same rows, switch box, Stop left, Remove right and switch→Stop gap unchanged; group control and readout moved right (User Flow 4) | collection-only — pre-fix red: `surf` and `gap` moved |
| web/e2e/focus-header.spec.ts | at 1000px renaming to a longer title and moving Claude to lengthen the readout leaves the surface switch, Stop and Remove where they were (E4) | REQ-4 | Same on a two-row header | collection-only — pre-fix red: `surf` and `gap` moved |
| web/e2e/focus-header.spec.ts | the surface switch's claude segment keeps focus and node identity across a hook-driven re-render and a tick, and a real Enter on it (REQ-4) | REQ-4 (unchanged behaviour of a control the plan moves) | Focused `claude` segment, tagged; a `UserPromptSubmit` upsert re-render + >1 s tick, then a real `Enter` + tick: same node focused, `aria-pressed` still true | ran-green-at-authoring — `1 passed (5.4s)` (regression pin: the move into `.acts` must not rebuild it or drop focus) |
| web/e2e/focus-header.spec.ts | switching to Tiles and back to Focus at 1000px leaves the header satisfying INV-1 to INV-4 with no stale measurement (E7) | REQ-2, REQ-3 | After a Tiles round trip the header's invariants hold (poll to `[]`) | collection-only — pre-fix red (cluster split, INV-3) |
| web/e2e/actions.spec.ts | action buttons are disabled while the daemon connection is down (E14) | REQ-5, E6 (rewritten) | Live session, daemon killed: `Stop` disabled and no `Resume` in the header; Remove disabled; the live card still offers no Stop | collection-only — pre-fix red: `Resume` count 1 |
| web/e2e/actions.spec.ts | action buttons are disabled while the daemon connection is down for a dead focused session, and re-enable on reconnect (E14, Major 4) | REQ-5, E6 (rewritten) | Dead bound session: header has no `Stop`, `Resume` enabled → disabled on WS close → enabled on reconnect; Remove and the cap's Resume likewise | collection-only — pre-fix red: `Stop` count 1 |
| web/e2e/actions.spec.ts | a session with no bound Claude id shows a disabled Resume control with a stated reason, on the mainhead and the dead cap (E7, W3) | REQ-5 (rewritten) | Header `Resume` disabled with reason, now also no `Stop` beside it; cap unchanged | collection-only — pre-fix red: `Stop` count 1 |
| web/e2e/theme.spec.ts | the header's disabled Resume button's computed style differs from the enabled Stop button, in each theme (E13) | REQ-5 (rewritten) | Session A live (enabled Stop), session B dead and unbound (disabled Resume), focused in turn in each theme; computed colour and border differ, cursor `not-allowed`; never both labels on screen | collection-only — pre-fix red: `Resume` count 1 beside Stop |
| web/e2e/card-location.spec.ts | with a 60-character folder and an 80-character branch at 2000x1000 the Focus header shows each line whole, uncapped, and the model is not clipped (E11, REQ-13; caps removed by plan title-crop-stop-resume-button REQ-1) | REQ-1 (rewritten from the 30ch/44ch caps) | `.rf`/`.rb` not clipped and as wide as their own max-content width (hidden-clone oracle, re-read in the poll); model whole and inside `.meta` (unchanged) | collection-only — pre-fix red: `rfClipped/rbClipped: true` |
| web/e2e/card-location.spec.ts | the 54 `at <width>px the Focus header of a session that is <state>, with … names … (REQ-13)` loop tests | REQ-3, REQ-5 (rewritten action loop) | Unchanged invariants, and the action loop now asserts the one label that matches `alive` (`Stop` unmoved/moved, `Resume` ended) plus `Remove` in the viewport and the other label absent | collection-only — pre-fix red: other label present (`toHaveCount(0)` received 1) |
| web/e2e/card-location.spec.ts | the 6 `sweeping the window from 1440px to 700px and back … (REQ-13, review cycles 3 and 4)` tests | REQ-2 (guard adjusted) | Unchanged per-width invariants; the "title ellipsized somewhere" vacuity guard is now `> 0` for every name set and stays `> sweep/4` for the long names (see Repairs-by-delta below) | collection-only |
| web/e2e/rename.spec.ts | a 300-character unbroken mainhead title ellipsises in place and never pushes End, Resume or Remove out of view at 900px and 1400px | REQ-2 (d), REQ-5 (rewritten) | Action buttons read by label from `.acts` (the surface switch's segments excluded) must be exactly `Stop`, `Remove`, each in view; title still really clipped; `.acts` inside the padding box | collection-only — pre-fix red: buttons `["Stop","Resume","Remove"]` |

Existing tests the plan names that I left as they are: `groups-focus.spec.ts` E27 (`:342-451`) — its assertions stand (comment at `:293` rewritten, comment only); `validate` confirms them against the new build.

## Deleted Tests

None. Rewritten in place, titles kept where the plan's delta does not make them untrue (E11's was retitled because "caps each line" claims the superseded 30ch/44ch behaviour; theme E13's because it names a "masthead Resume" beside an "enabled End"; both keep their E-number).

## Fixture Changes

- `web/e2e/helpers/focus-header.ts` (new): `readHeaderSnapshot` / `headerProblems` (INV-1..INV-4, INV-8 and the REQ-2 order), `sweepHeader` (the E3 sweep with reversibility and REQ-7 checks), `headerStopResume` / `headerButton` locators scoped to `#mainhead`, `tagNode` / `focusedNode`, `boxOf` / `sameBox` / `rectOf`, `settleLayout` (two animation frames after a resize, not a sleep). A line's width oracle is a hidden clone of the line at `width: max-content` in its own font.
- `web/e2e/helpers/card-location.ts`: `readFitSnapshot`'s header items are now the surface switch and each action button (excluding `.surfseg` segments) instead of `.surfseg` plus `.acts`, which overlap once the switch is inside `.acts` (REQ-4); `chromeProblems` doc updated. Behaviour on the old layout is identical.
- No new payload shapes. Every POST uses an existing builder (`envelopedSessionStart`, `envelopedStatusLineFull`, `rawUserPromptSubmit`) whose fields trace to their fact records. The 300-character title rides the status line's `session_name` (the daemon caps a rename at 100), the model display name is the full model id so the model is the widest it can be.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (readout as wide as its text) | 35-character folder test (E3 anchor); card-location E11 rewrite; the 12 E3 sweeps (INV-3) |
| REQ-2 (give-way order) | the 12 E3 sweeps (INV-3, INV-4, order consequences, reversibility); card-location sweeps; E7 Tiles round trip; rename 300-char test |
| REQ-3 (no overlap, inside viewport, model whole) | the 12 E3 sweeps (INV-1, INV-2) + `mainheadFitProblems`; card-location fit matrix; E7 |
| REQ-4 (cluster) | three cluster tests (2000/1200/800); two E4 tests; surface-switch focus pin |
| REQ-5 (one Stop/Resume button) | E1, E2, Resume keyboard test, E5, E6 (focus-header), actions.spec E14 x2 and E7, theme E13, card-location fit loop, rename 300-char test |
| REQ-6 (no layout shift) | E1, E2 (INV-6), Resume keyboard test |
| REQ-7 (cluster drop takes nothing from row one) | the 12 E3 sweeps (the drop-step width check) |

Plan acceptance: E1 → E1 test; E2 → E2 test; E3 → the 12 sweeps + whole-line anchor (pre-fix failure pasted above); E4 → the two E4 tests; E5 → E5 test; E6 → actions.spec rewrites + focus-header E6; E7 → Tiles test; E8 → `make e2e`, the orchestrator's gate.

Sweep coverage of the plan's state table (title {9, 52, 300} x folder {6, 35, 60} x branch {4, 80} x {unmoved, moved} x {alive, dead}): every value of every factor appears in at least two sweeps; the Chromium baseline row is sweep 1. Skipped by construction: moved x dead (a dead session's `claudeLocation` is null, kb:spec/card-location). Skipped by choice: the remaining cross-product cells.

## Repairs

Not a validate-mode log; no repair rows. Edits to existing assertions at authoring are all sanctioned by the plan's approved delta (REQ-1 removes the 30ch/44ch caps, REQ-2 inverts who gives way first, REQ-4/REQ-5 change the header's buttons), each strengthening or preserving the claim:

| Test | Old expectation | New expectation | Delta |
|------|-----------------|-----------------|-------|
| card-location E11 | each line clipped at exactly 30ch/44ch | each line unclipped and as wide as its text at a 1700 px header | REQ-1 |
| card-location fit loop | `Stop`, `Resume`, `Remove` all in view | the one label matching `alive` plus `Remove` in view, the other label absent | REQ-5 |
| card-location sweeps | title ellipsized over > a quarter of the sweep for every name set | `> 0` for every name set, `> a quarter` for the 60-character names | REQ-2 (title gives way last: with short names it clips only in the narrowest windows) |
| actions E14 x2, E7 | a disabled `Stop`/`Resume` beside each other | the single button's state, the other label absent | REQ-5 |
| theme E13 | enabled Stop and disabled Resume on one session | the same comparison across two sessions | REQ-5 |
| rename 300-char | `[data-action="end" / "resume" / "remove"]` all present and in view | buttons read from `.acts` are `Stop`, `Remove`, in view | REQ-5 |

No assertion was deleted, skipped, or weakened. (The card-location sweep guard is the one place a threshold moved; it is recorded above with the plan clause that sanctions it, and kept at `> a quarter` where that still holds.)

## Handoff

1. **Plan defect (minor):** the plan says `rename.spec.ts:766` is "expected to keep holding". It read `button[data-action="end"|"resume"]` and dereferenced them, so it would have thrown on the single button; rewritten to the label-based read above. The plan's `card-location.spec.ts:1244` note was right: the guard changed as recorded.
2. **Assertions beyond the plan's INV text, derived from REQ-2/REQ-4/REQ-7** (all in `helpers/focus-header.ts`; if the implementer reads one differently, say so before validate rather than weakening it): the cluster is never split across rows (surface switch and buttons on one row); while the cluster is on row two the `↳` block is not drawn; a title ellipsized implies the cluster is on row two and the `↳` block hidden (INV-4 plus REQ-2's "a later step never happens while an earlier one has room"); the `↳` block's own lines are never ellipsized while drawn ("hides whole"); widening reproduces the narrowing's state at the same width; at the step where the cluster drops the title and readout lose no width (REQ-7).
3. **"Same element" is asserted by node identity** (E1/E2/keyboard test, from E1's wording "turns that same element"): if web-impl rebuilds the button instead of relabelling it, those tests fail. The plan's E1/E2 and REQ-6 ask for exactly that; flagging it so the implementer does not discover it at validate.
4. **Sweep duration:** each E3 sweep is 176 viewport changes in one test under the 60 s test timeout, which this file may not lengthen. Pre-fix every sweep failed at its first step, so the full-length run has not been timed. If a sweep cannot finish inside 60 s on the new build, the remedy is fewer rows or a coarser step with the plan's approval, not a longer timeout — validate will measure it.
5. **Waterfox:** per the plan, the one-row cut-off folder (#73's screenshot) is not reproducible in Chromium; INV-3 (a line is never ellipsized on one row) is the engine-independent guard, and the developer checks Waterfox before `/land`.
6. **No harness-file change needed** (`playwright.config.ts`, `fixtures.ts`, `gatelock.ts`, `e2e-lint.sh` untouched). `npx biome check e2e` is clean.
7. **Nothing needing an `/interface-probe`:** no new wire field; `alive` is daemon-derived.

## Test Run Output

```
$ cd web && npx playwright test --list
Total: 788 tests in 53 files

$ npx playwright test e2e/focus-header.spec.ts -g "claude segment keeps focus"   (the one regression pin)
  ✓  1 [chromium] › e2e/focus-header.spec.ts:702:1 › the surface switch's claude segment keeps focus and node identity across a hook-driven re-render and a tick, and a real Enter on it (REQ-4) (3.9s)
  1 passed (5.4s)

$ npx playwright test e2e/focus-header.spec.ts -g baseline        (pre-fix build, the plan's required E3 evidence)
  Error: baseline: title 9, folder 35, branch 4, unmoved, alive, grouped: header layout at 2000px (narrowing)
    - Array []
    + Array [
    +   "INV-3: repo .rf 203.2 of 250.6px ellipsized while the header is on one row",
    + ]

$ npx playwright test e2e/focus-header.spec.ts -g "35-character folder at a 1700px"   (pre-fix build)
    - "wholeLine": true,
    + "wholeLine": false,
```

## Notes

- Regression pins: only the surface-switch focus test is a pin (passes on the current tree). Every other test asserts new behaviour; each was run once against the pre-fix build and failed on the intended assertion, none on a locator or setup defect.
- The build used for those runs: `make web-build build` at `afbe5da9` (version string `v0.20.2-41-gafbe5da9-dirty`).
- Plan defect found while authoring: none beyond Handoff 1.


## Validate Attempt 1

Build: `make web-build build` at `4c0fa2b3` (version `v0.20.2-48-g4c0fa2b3-dirty`).

### Live results

| Spec file | Run | Soak (`make e2e-soak N=10`) |
|-----------|-----|-----------------------------|
| web/e2e/focus-header.spec.ts | 18 passed, 7 failed (E3 sweeps, INV-4 at 672 px) | 180 passed, 70 failed: the same 7 tests x 10, all `INV-4: the title is ellipsized while the readout is 156.0px, above its 54.2px floor` at 672 px (deterministic, not flaky) |
| web/e2e/card-location.spec.ts | 86 passed, 2 failed before the repair (E2 `:226`, REQ-16 `:271`); 88 passed after | 880 passed |
| web/e2e/actions.spec.ts | 79 passed (with theme, rename, groups-focus) | 160 passed |
| web/e2e/theme.spec.ts | (as above) | 180 passed |
| web/e2e/rename.spec.ts | (as above) | 160 passed |
| web/e2e/groups-focus.spec.ts | (as above); E27 holds against the new layout | 290 passed |

Full `make e2e` (E8), run twice. Second run, nothing else touched in between: `7 failed`, `781 passed (6.4m)`, the 7 being exactly the focus-header E3 sweeps above. The first run: `9 failed, 779 passed (7.3m)`, the same 7 plus `actions.spec.ts:481` (the resume SessionStart lands the card in idle) and `shell-scroll.spec.ts:148`; neither recurred in the second full run, and the soaks of `actions.spec.ts` (160 passed) and `shell-scroll.spec.ts` (70 passed, N=10) are green, so both were load-induced under the full sweep. Neither touches the header or any file of this plan's delta. E8's broken-test list (`actions`, `theme`, `card-location`, `rename`, `groups-focus`, `helpers/card-location.ts`) passes in full against this build.

### Judgement 1: INV-4 stays as written

The plan's INV-4 reads "the title is ellipsized => the folder line is at its 8ch floor (or its text is shorter than the floor)", holding "at every viewport width from 600 px to 2000 px, in every state"; REQ-2 orders the give-way (c) readout before (d) title with "a later step never happens while an earlier one still has room to give"; the Overview quotes the developer: "I still need to keep the title at a decent length ... the readout gives way before it". None of the three restricts the claim to a layout where title and readout share a row. The implementation's "meta row under the title row" below ~344 px of header content is a step the plan does not list (REQ-2 says "in this order and no other"; web-impl's own `doc-delta` says the plan's "no other step" sentence "needs this narrow band named, or it reads as false below ~680 px"). That is the implementation adding a layout, not the plan forcing one. Does REQ-3 force it? REQ-3 forbids overlap and off-screen only; it does not force the title to take a row to itself. A layout satisfying REQ-2, REQ-3 and INV-4 together exists in principle (title and readout side by side at their floors, the model dropping under the readout): web-impl rejected it for one reason, that `card-location.ts`'s `lineProblems` compares x only against the model. That check lives in a test helper (`web/e2e/helpers/card-location.ts:402`), not in the plan; it is a limit of that older oracle, which the plan did not ask to preserve for a stacked model (INV-1 is a 2-D overlap). I did not edit the oracle or `titleProblems`: web-impl's proposal ("apply INV-4 only when title and readout share a row") would make INV-4 vacuous exactly at the widths where the title is cut, which is a weakening. If the orchestrator rules the narrow band is wanted behaviour, that is a plan amendment (name the band in REQ-2 and INV-4) followed by a spec change, not a repair at this step.

Measurement (7 of the 12 sweeps, every row with a 52- or 300-character title, first failing at 672 px, header 372 px / content 344 px): the title is ellipsized while the readout is 156.0 px against a 54.2 px floor. Every other invariant and the REQ-2 order hold at all 176 steps in all 12 sweeps up to that point, and web-impl reports (scratch copy of the helper, deleted) that with INV-4 restricted to a shared row all 12 sweeps pass in 11-15 s each, so the sweep fits the 60 s budget (soak ran 10 concurrent daemons and never timed out before the 672 px failure).

### Judgement 2: card-location `:226` (E2) and `:271` (REQ-16) widen their viewport

Both asserted the Focus header's `↳` block visible at the default 1280x720 window with a 21-character scratch repo. With the readout uncapped (REQ-1) the one-row header needs about 990 px against the 980 px header there, and REQ-2 (a) hides the `↳` block before (b) lets the cluster drop, so the block is correctly hidden at that width: measured, both tests failed on `expect(mainheadClaudeAt(page)).toBeVisible()` with `Received: hidden`. This is the plan's approved delta, so the repair is a fixture repair, not a weakening: each test now calls `page.setViewportSize({ width: 1400, height: 720 })` before `goto`, a width at which the whole row fits, and every assertion in both tests (the `↳` lead glyph, folder, branch, token colours, the tile marker) is unchanged. They were not on the plan's "Existing tests this breaks" list; the delta that explains them is REQ-1 + REQ-2 (a).

## Repairs (validate attempt 1)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | card-location.spec.ts:226 "a main-agent hook whose cwd is a worktree under .claude/worktrees shows the ↳ block on the rail card, the Focus header and the tile header ..." | `expect(claudeAt).toBeVisible()` Received: hidden at 1280x720 | Fixture window too narrow for the uncapped readout plus cluster on one row; REQ-2 (a) hides the block first | `setViewportSize({ width: 1400, height: 720 })` before `goto` | REQ-5, REQ-12, REQ-13, REQ-15: the Focus header's `↳` lead, folder and branch values still asserted unchanged |
| 2 | card-location.spec.ts:271 "the ↳ glyph is --fg-muted and the ↳ text --fg-dim ... (REQ-16)" | same | same | same | REQ-16: the computed colours of the Focus header's `↳`, folder and branch still compared against the live tokens |

No assertion was deleted, skipped, or weakened. (Both repairs widen a window; no absence assertion was repaired.)

## E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| Below ~344 px of header content (672 px viewport and narrower) the meta row sits under the title row; the title ellipsizes at the full row width while the readout stays at its natural width | `[web-impl]` | INV-4; REQ-2 (c) before (d), "in this order and no other"; Overview (developer: the readout gives way before the title) | a title ellipsized => the folder line is at its 8ch floor (or shorter than it); at 672 px with a 52- or 300-character title the folder line is at its floor | readout 156.0 px, above its 54.2 px floor, with the title ellipsized (both on separate rows) | the 7 `focus-header.spec.ts` E3 sweeps with a title of 52 or 300 characters (REQ-2, INV-4); also each at every width below 672 px |

Orchestrator note: if the developer decides the stacked narrow band is intended, the plan's REQ-2 and INV-4 need amending first; the spec then follows. I will not change `titleProblems` on web-impl's say-so alone.

## Handoff (validate attempt 1)

1. INV-4 routing as above; web-impl's alternative layout (model under the readout) would additionally need `lineProblems` in `web/e2e/helpers/card-location.ts` to compare y as well as x against the model; that helper is e2e-specs-owned and I will make that change when the layout exists, keeping every other check.
2. Plan defect: `card-location.spec.ts` `:226` and `:271` belong on the plan's "Existing tests this breaks" list.
3. Not tested here: Waterfox (the developer checks before `/land`).
4. No change requested to `playwright.config.ts`, `fixtures.ts`, `gatelock.ts` or `e2e-lint.sh`.

## Test Run Output (validate attempt 1)

```
$ npx playwright test --list            Total: 788 tests in 53 files
$ npm run e2e -- e2e/focus-header.spec.ts
  7 failed, 18 passed (1.1m)    each: "INV-4: the title is ellipsized while the readout is 156.0px, above its 54.2px floor" at 672px (narrowing)
$ npm run e2e -- e2e/card-location.spec.ts   (before repair)  2 failed, 86 passed ; (after)  88 passed (54.3s)
$ npm run e2e -- e2e/actions.spec.ts e2e/theme.spec.ts e2e/rename.spec.ts e2e/groups-focus.spec.ts   79 passed (35.1s)
$ make e2e  (second run)   7 failed   781 passed (6.4m)
$ make e2e-soak N=10: card-location 880 passed (8.1m); actions 160 passed (1.2m); theme 180 passed (1.1m);
  rename 160 passed (1.1m); groups-focus 290 passed (2.5m); shell-scroll 70 passed; focus-header 180 passed, 70 failed (INV-4, deterministic)
```


## Validate Attempt 2 (pre-review fix)

Build: `make web-build build` at `ec8d41c1` plus web-impl's Fix Attempt 1 (`.meta.stacked`), version `v0.20.2-51-gec8d41c1-dirty`.

### Judgement: the `lineProblems` repair is a fixture repair

`lineProblems` in `web/e2e/helpers/card-location.ts` reported "repo rf ... overlaps the model" when `xOverlap(line.box, s.model)` held. Its intent is "the two boxes overlap"; an x-range shared by a model stacked under the readout is not an overlap. The check is now `xOverlap && yOverlap`, the same 2-D test INV-1 uses. Every other check in that function (`inside` block, `inside` .loc, first-line filter, `.sep` glyph overlap) and INV-1 are unchanged.

### Added (the fix wave added user-visible behaviour: the stacked model)

- `stackedModelProblems` inside `modelProblems` (`helpers/focus-header.ts`), so every sweep step also asserts: when the model is not on the readout's row it is below the readout's bottom edge, in the readout's column, and inside the viewport.
- New test `at 640px a 300-character title keeps the readout beside it at its floor and the model stacks under the readout, whole and inside the viewport (REQ-2, REQ-3, INV-2, INV-4)` (`stackedBandProblems`): positive assertions that the band is actually reached (title ellipsized, readout beside the title on its row and at its 8ch floor, model under the readout and in its column, not clipped, in the viewport) plus `headerInvariantProblems` equal to `[]`.

### Repairs (validate attempt 2)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 3 | the 12 E3 sweeps in focus-header.spec.ts (via `mainheadFitProblems`; also every card-location fit/sweep test using `lineProblems`) | `repo rf 488.7-542.8 overlaps the model 488.7-658.0` at 672 px on the stacked layout | `lineProblems` compared x only against the model | `xOverlap(line.box, s.model) && yOverlap(line.box, s.model)` | REQ-3 (no overlap): proven red by deliberate breakage: `.mainhead .meta.stacked .model { margin-top: -45px }` made the 672 px step fail with both `INV-1: repo readout 488.7-542.8 overlaps model 488.7-658.0` and `repo rf 488.7-542.8 overlaps the model 488.7-658.0`; `style.css` restored (`git status` shows only the three e2e files) |

(Rows 1 and 2 are attempt 1's.) No assertion was deleted, skipped, or weakened.

### Live results

| Spec file | Run | Soak (N=10) |
|-----------|-----|-------------|
| web/e2e/focus-header.spec.ts | 26 tests, all passing (25 before the new test: `25 passed (46.4s)`) | `260 passed (9.8m)` |
| web/e2e/card-location.spec.ts | passes (helper changed) | `880 passed (8.5m)` |
| actions, theme, rename, groups-focus | all passing: the six plan specs together `193 passed (2.0m)` | unchanged since attempt 1's soaks (not edited) |

Full `make e2e`: `789 passed (6.0m)`, no failures.

## Handoff (validate attempt 2)

None. The INV-4 implementation-bug of attempt 1 is fixed by web-impl's `.meta.stacked` layout. Waterfox remains the developer's pre-`/land` check.

## Fix Attempt 1 (review cycle 1)

Build: `make web-build build` at `216f0264` (`v0.20.2-59-g216f0264-dirty`; the dirty file is `orchestration-state.json`, not mine).

### Issue handled

Browser Minor 1 `[e2e-specs]`: E1, E2 and the keyboard Resume test checked INV-6 at 1600 px only. Fix: a Stop-versus-alive comparison at every width, and narrow-width variants of the swap tests. The existing E1, E2 and keyboard tests are untouched.

### Added (new tests, `web/e2e/focus-header.spec.ts`; helpers additive in `web/e2e/helpers/focus-header.ts`)

| Test | Requirement | What it verifies | Live run |
|------|-------------|------------------|----------|
| 5 x `sweeping the window from 2000px to 600px in 16px steps, a Stop leaves Remove, the Stop/Resume button, the surface switch and the header where they were and shows the ended age under the model at every width: <row>` (title 9 / 29 / 52, title 52 + branch 80 + moved + bypass + full model id, title 300 + full model id) | REQ-5, REQ-6, INV-6, INV-7 | Alive session measured at all 89 widths (2000 to 600 in 16 px steps, `settledSnapshot`: two reads a frame apart that agree), exactly one `Stop`, ended clause hidden and drawing nothing. A real click on Stop and confirm at 1280 px. Then at each same width, re-read inside the retry: one `Resume`, Remove, Stop/Resume, surface switch and header boxes equal to the alive ones (0.5 px), and the ended age shown under the model | `11 passed (35.6s)` with the other six (below); 15-27 s each |
| 3 x `at <784/600/600>px with a <title 9/9/52> a Stop and then a Resume in the header leave Remove, the button and the header where they were, with the ended age under the model while stopped` | REQ-5, REQ-6, INV-6 | Real Stop click + confirm, then real Resume click, at the narrow widths where the review measured the 13 px shift: the one tagged node swaps `Stop`, `Resume`, `Stop`; boxes equal alive both times; ended age under the model while stopped, absent while alive; `alive` from `/api/state` both ways | same run |
| `at 600px a real Enter on the header's Resume swaps the label to Stop with focus, node identity, Remove, the button and the header all unmoved` | REQ-5, REQ-6, INV-6 | The keyboard Resume test at 600 px: focus, node identity and unmoved boxes after the swap and after a >1 s tick | same run |

"Ended age under the model" (`endedAgeProblems`, new in the helper) asserts, from Fix Attempt 2 of web-impl: the clause is shown on a dead session; its text matches `^ended (now|\d+[mhd] ago)$`; no `·` in the slot; its top is at or below the model's bottom; it shares the model's column; it does not overlap the readout; it sits inside the viewport and the header. `endedAgeAbsentProblems` asserts the alive state: slot `hidden`, nothing drawn, no text. The existing `Row` gained an optional `fullModel` (a status line posts the full model id without a session name) and `TITLE_29` was added; `openRow` is otherwise unchanged.

### Red against the pre-fix layout (throwaway copy, shared tree untouched)

A copy of `HEAD` exported with `git archive` into the scratchpad (`.../scratchpad/prefix`), `web/src` and `web/index.html` replaced by `git archive 65467313^` (the tree before web-impl's Fix Attempt 2), this tree's two e2e files copied in, `node_modules` symlinked, `make web-build build` there. The 11 new tests:

```
$ npx playwright test e2e/focus-header.spec.ts -g "INV-6"     (pre-fix build)
  ✓ E1 clicking Stop ... (2.1s)          <- the 1600 px tests still pass: they could not see it
  ✓ E2 clicking Resume ... (2.4s)
  ✘ 9 failed (the 5 sweeps, the 3 clicks, the keyboard test)
  with the ended-age assertions on:
    "ended age: a "·" separator stands in the clause",
    "ended age: not under the model (age x 931.8-992.7 y 63.7-76.7, model x 743.6-913.0 y 63.7-76.7)",
  with them removed from the throwaway copy only, the INV-6 shifts alone:
    title 9 sweep @1312px:  INV-6: Remove moved from ... y 57.7-82.7 to ... y 91.4-116.4 ; header ... y 46.0-95.4 to ... y 46.0-126.4
    title 29 sweep @1456px: Remove y 57.7-82.7 -> 91.4-116.4
    title 52 sweep @1632px: Remove y 57.7-82.7 -> 91.4-116.4
    title 300 sweep @784px: Remove y 91.4-116.4 -> 104.4-129.4 (the review's 13 px)
    click @784px: Remove 91.4 -> 104.4 ; @600px: 104.4 -> 117.4 ; Resume @600px: 117.4 -> 104.4 (shifts back)
    keyboard @600px: Remove moved y 117.4-142.4 -> 104.4-129.4
```

(The bands sit at different widths in this fake's header than in web-impl's, but they are the wide band and the narrow band web-impl and the review named. Every row fails somewhere; the 1600 px tests pass on the pre-fix build, which is the review's point.) Against the current build: `11 passed (35.6s)`. The throwaway copy lives only in the scratchpad; `git status` shows only my spec, helper and log.

### Repairs

None: no existing assertion was edited. No assertion was deleted, skipped, or weakened.

### Live results

| Spec file | Run | Soak (N=10) |
|-----------|-----|-------------|
| web/e2e/focus-header.spec.ts | `35 passed (1.2m)` (26 before + 9 new: 5 sweeps, 3 clicks, 1 keyboard) | `350 passed (11.7m)` |

Collection: `Total: 798 tests in 53 files`, no error. `npx biome check e2e` clean (e2e-lint clean).

## Handoff (fix attempt 1)

None. Stale comment noted in the review and untouched here: `web/e2e/helpers/focus-header.ts` still says a `↳` block that gave way "wraps to a clipped second line" (review Note 6, comment only; the filter still works because a removed block has no client rects).
