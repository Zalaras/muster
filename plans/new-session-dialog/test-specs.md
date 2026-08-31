# E2E Test Specs: New Session Dialog

**Plan**: new-session-dialog
**Mode**: validate (attempt 4)
**Verdict**: pass
**Tests created**: 26 in `launch.spec.ts` (+3 net this cycle: two `route.abort()` network-failure tests for review cycle 2 Critical 1, one no-op-focus test for Minor 1), 3 in `tiles-launch.spec.ts` (unchanged)
**Live run**: 29/29 passing in the two files; 157/157 passing suite-wide (`make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/launch.spec.ts | opens on the browse root with an empty sidebar when there are no recents, exposing every Testable UI Element and none of the removed M1 controls | REQ-2, REQ-9, REQ-10, REQ-11, REQ-16, E2 | Browse…/Up/Use-this-folder/raw-path elements are gone; sidebar empty-state; dialog opens on browse root; Model (5 incl. fable) and Start-in radio groups present; Custom model hidden until `other…` |
| web/e2e/launch.spec.ts | opening the dialog with two prior launches lists both recents, marks the most recent pressed, and restores its model/mode/branch | REQ-7, REQ-8, REQ-17, E1 | Two recents in served order (most-recent first), `aria-pressed`, crumb/footer match the newer path, branch suffix shown, model/mode radios restored |
| web/e2e/launch.spec.ts | clicking a child entry descends into it, updating the crumb bar and Launch in, and marks a git checkout | REQ-4, REQ-5, E3 | Child click navigates, crumb updates, footer updates, `(git)` suffix on a real checkout |
| web/e2e/launch.spec.ts | clicking an ancestor crumb navigates up, and the previously-current directory reappears as an entry | REQ-5, E4 | Ancestor crumb click navigates up; prior directory reappears as a listing entry |
| web/e2e/launch.spec.ts | Cmd+ArrowUp navigates to the parent, and is a no-op at the filesystem root | REQ-6, E5 | ⌘↑ goes to parent; at `/` (reached via its own root crumb) ⌘↑ is a no-op |
| web/e2e/launch.spec.ts | clicking a second recent swaps the pressed mark and the model/mode radios | REQ-7, E6 | Recent click moves `aria-pressed`, swaps model/mode radios, updates crumb/footer |
| web/e2e/launch.spec.ts | navigating to a child of the pressed recent clears every aria-pressed mark | INV-2, E7 | Child click while a recent is pressed clears its `aria-pressed` (none remain true) |
| web/e2e/launch.spec.ts | launching with no interaction after open relaunches the first recent's directory with its last model and mode | REQ-8, E8 | ⌘N ⏎ with zero interaction launches into the first recent's directory/model/mode, verified via `GET /api/state` |
| web/e2e/launch.spec.ts | launching into a fresh directory reached via crumbs and entries creates the session there | REQ-4, REQ-5, E9 | Crumb+entry navigation into a never-launched dir; card shows "first launch here"; `settings.local.json` written (REQ-14 regression) |
| web/e2e/launch.spec.ts | choosing fable launches with model=fable | REQ-9, E10 | `fable` radio submits `model=fable`, verified via `GET /api/state` and `GET /api/repos` |
| web/e2e/launch.spec.ts | other… reveals Custom model, blocks submit when empty, and submits the custom string verbatim | REQ-9, E11 | Custom-model reveal; empty-submit blocked with `Enter a model.`; non-empty submits verbatim |
| web/e2e/launch.spec.ts | a recent launched with a non-preset model preselects other… and fills Custom model | REQ-12 | A recent whose `lastModel` isn't a preset selects `other…` and fills the custom field |
| web/e2e/launch.spec.ts | a browse 404 shows the daemon's error and leaves crumbs, listing, Launch in and the pressed recent unchanged | INV-3, E12 | 404 on a vanished entry shows the alert; before/after snapshot of crumbs/footer/pressed is byte-identical; a later success clears the alert |
| web/e2e/launch.spec.ts | the dialog's bounding height is unchanged after open, a child click, a crumb click and a recent click | INV-4, E13 | `boundingBox().height` identical across all four states |
| web/e2e/launch.spec.ts | a failed GET /api/repos shows the error and renders the sidebar empty-state | REQ-13 | Network-level 500 on `/api/repos` (via `page.route`) shows the alert and the sidebar's empty state; browse pane unaffected |
| web/e2e/launch.spec.ts | a route.abort() on GET /api/repos shows the network error and the sidebar's empty state | REQ-13 | Connection-level failure (`route.abort()`, not a decodable HTTP body) on `/api/repos` shows `Could not reach musterd.` and the sidebar empty state; browse pane unaffected (added validate attempt 4, review cycle 2 Critical 1) |
| web/e2e/launch.spec.ts | a route.abort() on GET /api/browse during navigation shows the network error and leaves crumbs, listing and Launch in unchanged, and a later success clears it | REQ-13, INV-3 | `route.abort()` on one child navigation shows the network error, proves the listing is not left on `loading…` (old listing restored, byte-identical before/after), and a later successful navigation clears the error (added validate attempt 4, review cycle 2 Critical 1) |
| web/e2e/launch.spec.ts | ArrowLeft at the filesystem root is a genuine no-op and does not move focus | REQ-15, review cycle 2 Minor 1 | At the real filesystem root (no parent crumb), focusing a non-first entry and pressing ArrowLeft leaves the exact same DOM node focused (node-identity marker), not re-anchored to the first entry (added validate attempt 4, review cycle 2 Minor 1) |
| web/e2e/launch.spec.ts | the child listing shows No subdirectories for an empty directory | REQ-16 | Empty directory renders the listing empty-state |
| web/e2e/launch.spec.ts | Escape and Cancel close the dialog; Cmd+N while already open does not reset the form | REQ-14, E15 | Cancel/Escape close; reopen resets the form; ⌘N while open does not reset a filled Title |
| web/e2e/launch.spec.ts | a recent's title attribute is its full absolute path | REQ-18 | `title` attribute on a recent equals its absolute path |
| web/e2e/launch.spec.ts | keyboard traversal: Enter descends into a focused child entry | REQ-15 | Focus + Enter on a child entry descends (real keyboard path, not `click()`) |
| web/e2e/launch.spec.ts | keyboard traversal: descending and ascending re-anchors focus on the first entry, so arrow keys keep working across round trips | REQ-15, review cycle 1 Minor 1 | Two full ArrowRight/ArrowDown/ArrowUp/ArrowLeft round trips via real keyboard input; focus lands on the new listing's first entry after both a descend and an ascend, and continuity survives a second round trip (not a one-shot special case) |
| web/e2e/launch.spec.ts | opening on a deep path scrolls the crumb bar to its right edge, keeping the current directory and the ⌘↑ hint on screen | REQ-6, review cycle 1 Minor 2 | 12-segment deep path forces genuine `#browse-crumbs` overflow; asserts `scrollLeft + clientWidth === scrollWidth` and that the current crumb's and kbd's bounding boxes fall inside the nav's visible viewport |
| web/e2e/launch.spec.ts | GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist | protocol §3.6 (unchanged) | Protocol-level regression check, independent of the dialog rebuild |
| web/e2e/tiles-launch.spec.ts | a session launched from Tiles appears as a live tile | REQ-14, E14 | Tiles' New session button drives the new picker (child-entry click, no Browse…/Use-this-folder) and still promotes into the grid |
| web/e2e/tiles-launch.spec.ts | launching from Tiles with a full 2×2 grid promotes the new session and demotes one tile | REQ-14, E14 | Same promotion behaviour when the dialog opens on a different recent and must crumb-navigate to the target directory |

## Fixture Changes

- **New helper module** `web/e2e/helpers/picker.ts` — locator functions for the rebuilt
  picker (`launchDialog`, `openLaunchDialog`, `recentsSidebar`, `recentButton`,
  `crumbsNav`, `crumbButton`, `currentCrumb`, `childEntry`, `launchTargetPath`,
  `launchTargetBranch`, `launchError`, `escapeForRegExp`). Every structural detail
  (element ids, `aria-label`s, the recent-entry no-separator textContent shape, the
  additive `(git)` suffix, the `#launch-target b`/`.branch` split) is transcribed from
  `plans/new-session-dialog/mockup.html` (the plan's design authority) and the plan's
  Testable UI Elements table, not invented. Shared by `launch.spec.ts` and
  `tiles-launch.spec.ts` so both files drive the same picker through one set of
  locators.
- No hook/status-line payload fixtures were needed — this plan is a pure UI rebuild
  around already-documented endpoints (`GET /api/repos` §3.2, `GET /api/browse` §3.6,
  `POST /api/sessions` §3.1); nothing here synthesizes Claude Code wire data, so there
  is no canary-fields traceability requirement for this file.
- `web/e2e/tiles-launch.spec.ts`: the four grid-seeding directories switched from
  `scratchDirectory()` (an arbitrary system tmp dir) to `browseScratchDirectory(daemon)`
  (a child of the daemon's browse root) — with `scratchDirectory()` the most-recently
  launched seed shares no browsable-in-one-crumb ancestor with the target `browse.path`,
  so the new picker's crumb-up-then-descend navigation the test relies on would have no
  path to follow. This is a fixture correction forced by the picker's new "no reset
  button" model, not a weakening of what the test proves (still four grid seeds + one
  promoted fifth).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 (fixed height/width) | covered indirectly by E13's boundingBox check (height); width is a Reviewer-Verified item (R1), not asserted here |
| REQ-2 | "opens on the browse root... none of the removed M1 controls" |
| REQ-3 (readout==selection) | asserted throughout via `launchTargetPath` checks in E1/E3/E4/E6/E8/E9 |
| REQ-4 | "clicking a child entry descends...", "launching into a fresh directory..." |
| REQ-5 | "clicking a child entry descends...", "clicking an ancestor crumb...", "Cmd+ArrowUp..." |
| REQ-6 | "Cmd+ArrowUp navigates to the parent...", "opening on a deep path scrolls the crumb bar..." |
| REQ-7 | "opening the dialog with two prior launches...", "clicking a second recent..." |
| REQ-8 | "opens on the browse root..." (zero-recent half), "launching with no interaction..." |
| REQ-9 | "opens on the browse root..." (radio presence), "choosing fable...", "other… reveals..." |
| REQ-10 | "opens on the browse root..." |
| REQ-11 | "opens on the browse root..." |
| REQ-12 | "a recent launched with a non-preset model..." |
| REQ-13 | "a browse 404 shows...", "a failed GET /api/repos shows...", "a route.abort() on GET /api/repos shows...", "a route.abort() on GET /api/browse during navigation shows..." |
| REQ-14 | "launching into a fresh directory..." (settings.local.json), "Escape and Cancel...", tiles-launch.spec.ts both tests |
| REQ-15 | "keyboard traversal: Enter descends...", "keyboard traversal: descending and ascending re-anchors focus...", "ArrowLeft at the filesystem root is a genuine no-op..." |
| REQ-16 | "opens on the browse root..." (sidebar empty), "the child listing shows No subdirectories..." |
| REQ-17 | "opening the dialog with two prior launches..." (branch suffix) |
| REQ-18 | "a recent's title attribute is its full absolute path" |
| INV-1 | asserted structurally throughout (every `launchTargetPath` check doubles as an INV-1 spot-check) |
| INV-2 | "navigating to a child of the pressed recent clears every aria-pressed mark" |
| INV-3 | "a browse 404 shows the daemon's error and leaves..." |
| INV-4 | "the dialog's bounding height is unchanged..." |

## Notes

- **Every test spins its own scratch daemon** (`withDaemon`, mirroring the pattern
  `tiles-launch.spec.ts` already used) rather than sharing one `beforeAll` daemon across
  the file. Most tests here assert exact recents count/order/pressed-state, which is
  global per daemon (`GET /api/repos`), not scoped by directory the way M1's
  `firstLaunchHere` was — sharing a daemon across tests would make those assertions
  depend on execution order across workers. This trades per-test daemon-spawn cost for
  correctness, consistent with the agent instructions' independence rule and with
  `tiles-launch.spec.ts`'s own stated rationale for the same pattern.
- **REQ-1's exact 720px width and the 300px picker height** are left to the reviewer
  (plan's own R1/Reviewer-Verified list — visual comparison against the mockup); E2E
  asserts the height-*stability* invariant (INV-4) precisely, which is the behavioural
  half a Playwright test can meaningfully pin without hard-coding a pixel width that
  belongs to CSS, not to this test file.
- **The recent-entry name locator matches only the leading name** (`^<name>`), per the
  Testable UI Elements table's explicit note that the button's textContent concatenates
  name/branch/age with no separator. A test asserting `aria-pressed` or `title` on that
  same locator is therefore safe even though the accessible name is a prefix match, since
  Playwright's `getByRole` resolves to the one button element regardless.
- **Branch fixture**: `internal/gitutil.Branch` (read during the E2E investigation, not
  guessed) returns `nil` for an unborn branch (`git rev-parse --abbrev-ref HEAD` exits
  128 before any commit exists), so the branch-restoring test creates a real commit
  (`git -c user.email=... -c user.name=... commit --allow-empty`) rather than relying on
  a bare `git init`, and asserts the branch text by shape (`/^ · \S+$/`) rather than a
  hardcoded name (`main` vs `master` depends on the runner's git version/config).
- **REQ-1's 720px width, R1 (visual match to mockup), R2 (`--amber` usage), R3 (mono
  font sizes) and W5/W6/W7/W8** are explicitly Reviewer-Verified or web-build-gate items
  per the plan's own Acceptance Criteria section, not E2E's job — no test here duplicates
  them.
- No wire-format fixtures were invented: this plan touches no hook/status-line payload,
  so there is nothing to cross-check against `spikes/canary-fields.md`. The one
  synthesized condition (`page.route` intercepting `GET /api/repos` with a 500) is a
  network-level fault injection for the dashboard's own error-handling path, not a
  fabricated Claude Code payload, and is a standard Playwright pattern already implicit
  in the daemon's own error contract (protocol §2's error envelope shape).
- `npx tsc --noEmit` (stricter than the collection gate: `noUnusedLocals`,
  `noUnusedParameters`, full type-checking) also passes clean over the whole `web/`
  tree, including the two edited spec files and the new helper module.

## Validate Attempt 1

Rebuilt (`make build web-build`, clean — daemon `go build` + `tsc --noEmit && vite
build`), then ran `npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts` live
against the real prebuilt `bin/musterd`/`web/dist` per web-implementation.md (this is a
web-only plan; daemon untouched, no `daemon-implementation.md` exists).

First run: 19/23 passed, 4 failed. Investigated each; 3 were my own spec defects
(repaired below), 1 is a genuine implementation defect in `web/src/render/launch.ts`
(left failing, not routed around). Reran after each repair; final state is 22/23 passing
in the two files, confirmed by a third full run. Then swept the whole suite
(`make e2e`, project root): 150/151 passing — the same one failure, nothing else broken
by this plan's rebuild (no sanctioned-breakage repairs were needed; this plan's Protocol
Contract section states no wire-format changed, and the full-suite run bears that out).

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `opening the dialog with two prior launches lists both recents, marks the most recent pressed, and restores its model/mode/branch (REQ-7, REQ-8, REQ-17, E1)` | `recentTexts[0]?.startsWith(newerName)` was `false` even though the pressed/crumb/footer assertions immediately above it (same recent) passed | Debugged with a temporary `console.error` dump of the raw `repos` JSON and the raw `textContent` array (removed before finishing): the two launches' `lastLaunchedAt` were correctly one whole second apart (`21:09:50Z` vs `21:09:51Z`, newer served first) — the DOM order was already correct. The failure was pure string matching: the recent button's raw `textContent` carries the sidebar-entry template's own indentation whitespace before `.dir-name` (e.g. `"\n        muster-e2e-newer-…\n        mainnow\n      "`), so a bare `.startsWith(newerName)` on the untrimmed string can never match, regardless of order | `evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()))` — trim before the prefix check | REQ-7/REQ-8/REQ-17/E1 still fully covered: the pressed-attribute check, the DOM-order check (now correctly comparing trimmed text), the crumb/footer/branch/model/mode checks are all unchanged and all still assert the same real behaviour |
| 2 | same test | (discovered while investigating #1, pre-emptively also applied to the E6 test below) two launches issued back-to-back with no real elapsed time can land in the same wall-clock second, at which point `internal/store/repo.go`'s `ORDER BY last_launched_at DESC` (whole-second `time.RFC3339` resolution) ties and the served order is not guaranteed to put the newer one first | Test made an unverified assumption that two `launchSession` calls a few JS statements apart are automatically far enough apart in wall-clock time to produce distinct, correctly-ordered timestamps | Added a shared `waitForNextClockSecond()` helper (waits only the remainder of the current second, worst case ~1.05s, not a fixed sleep) and call it between the two `launchSession` calls in this test and in test #3 below | REQ-7/REQ-8/E1 — the ordering assertion now tests real, guaranteed-distinct MRU order instead of a coin flip; nothing about the assertion's strength changed, only its reliability |
| 3 | `clicking a second recent swaps the pressed mark and the model/mode radios (REQ-7, E6)` | `recentButton(dialog, secondName)` expected `aria-pressed="true"` on open (second launched = most recent) but got `"false"` | Same root cause as repair #2 — `first`/`second` were launched with no enforced gap, so they could tie in the same wall-clock second and the store's tie-break order doesn't match "most recently launched by wall-clock" | Same `waitForNextClockSecond()` call inserted between the two `launchSession` calls | REQ-7/E6 — the "second recent is pressed on open" assertion, and the swap-on-click assertions after it, are unchanged and now test against a deterministically-ordered fixture |
| 4 | `clicking a child entry descends into it, updating the crumb bar and Launch in, and marks a git checkout (REQ-4, REQ-5, E3)` | `expect(childButton).toHaveText(`${childName} (git)`)` failed: actual normalized text was `"child-repo (git)›"` | `.chev`'s `›` glyph is `aria-hidden="true"` per the plan's Testable UI Elements table ("`.chev` is `aria-hidden` so it is not part of the name") — that note is about the *accessible name*, which `toHaveText` does not compute; it reads raw `textContent`, which still includes the aria-hidden chevron | Replaced with `toHaveAccessibleName(`${childName} (git)`)`, which uses the browser's real accessible-name computation (excludes `aria-hidden` content), matching what the Testable UI Elements table actually promises and what `childEntry()`'s own `getByRole(..., { name })` locator match is keyed on | REQ-4/REQ-5/E3 — still pins the exact git-suffixed name for this specific entry (not merely that *some* entry matching the optional-suffix regex resolved); strictly more correct than the original literal-text check, not weaker |

`No assertion was deleted, skipped, or weakened.`

### E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| A failed `GET /api/repos` error is shown and then immediately self-cleared within the same dialog-open sequence, before any observer (test or real user) can see it settle | `[web-impl]` | REQ-13: "A failed `GET /api/repos` shows the error the same way [i.e. in `#launch-error`] and renders the sidebar empty-state." Edge case 2 in the plan explicitly sanctions a *browse*-error being cleared by a subsequent *browse* success ("The root's success clears the error line (acceptable...)") — it does not sanction a *repos*-error being cleared by an unrelated browse success. | `#launch-error` shows `"repos unavailable"` and stays visible (there is nothing that fixes the repos endpoint mid-test; no subsequent user action is taken) | `web/src/render/launch.ts`'s `initOpen()`: when `fetchRepos()` fails it calls `showError(reposResult.error.message)` (line ~266), but since `repos` is then `[]`, `first` is `undefined`, so `initOpen()` unconditionally falls through to `await navigate(undefined)` (the no-recents browse-root default) a few lines later. `navigate()`'s success path (line ~243) unconditionally calls `clearError()` before rendering — with no check for *which* error is currently showing. So the repos-fetch error set moments earlier is wiped out by the very same open sequence's own browse-root fetch, every single time (not just in the edge-case-2 scenario the plan describes, where the fallback is deliberately reached only after a *browse* failure). Confirmed with `page.route` intercepting only `GET /api/repos` (leaving the real `GET /api/browse` untouched): the alert is set then hidden again before the dialog settles. | `a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13)` |

The assertion (`expect(launchError(dialog)).toBeVisible()`) is left failing, honestly, per the
agent instructions — it is not routed around with a wait, a re-check, or a weaker locator.
Suggested fix for whichever agent picks this up: `navigate()`'s success path should only
`clearError()` when the error being cleared came from a *browse* failure (e.g. track which
kind of error is currently showing, or have `initOpen()`'s repos-failure branch skip calling
`showError` until after the browse-root navigation settles and re-apply it then) — but that
call belongs to `web-impl`, not to this test agent.

### Test Run Output

```
Running 23 tests using 6 workers
  ... 22 passed
  ✘ 14 [chromium] › e2e/launch.spec.ts:558:1 › a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13) (5.6s)

    Error: expect(locator).toBeVisible() failed
    Locator:  getByRole('dialog', { name: 'New session' }).locator('#launch-error')
    Expected: visible
    Received: hidden
    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByRole('dialog', { name: 'New session' }).locator('#launch-error')
        14 × locator resolved to <p hidden="" role="alert" id="launch-error" class="launch-error"></p>
           - unexpected value "hidden"
      570 |
      571 |     await expect(recentsSidebar(dialog).getByText("No recent directories")).toBeVisible();
    > 572 |     await expect(launchError(dialog)).toBeVisible();
          |                                       ^
      573 |     await expect(launchError(dialog)).toHaveText("repos unavailable");

  1 failed
    [chromium] › e2e/launch.spec.ts:558:1 › a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13)
  22 passed (10.4s)
```

Full-suite sweep (`make e2e` from project root): `150 passed`, same single failure above,
no other spec in the 14-file/151-test suite regressed.

### Notes (validate attempt 1)

- No config, harness, or implementation file was touched — only `web/e2e/launch.spec.ts`
  (the three repairs above). `web/e2e/tiles-launch.spec.ts` needed no changes and both
  its tests passed unmodified on the first live run.
- The debug `console.error` calls used to diagnose repair #1 were added and then removed
  before this run's final pass; they are not present in the committed diff.
- Full-suite sweep found no pre-existing spec broken by this plan's rebuild, consistent
  with the plan's own claim of no protocol/wire-format change — so no `## Repairs` row
  cites a "sanctioned breakage" delta; every repair here is a fix to my own spec's
  timing assumption or locator, not an update to a superseded expectation.

## Validate Attempt 2

Re-invoked after `web-impl`'s Fix Attempt 1 (`plans/new-session-dialog/web-implementation.md`),
which added a `reposErrorPersistent` guard in `web/src/render/launch.ts` so `navigate()`'s
success path only clears `#launch-error` when the currently-showing error is not the
repos-fetch kind — targeting exactly the implementation bug I left failing in attempt 1.

Rebuilt clean from the project root (`make build web-build`: `go build` for the daemon,
`tsc --noEmit && vite build` for the web bundle — both exit 0). Ran
`npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts` live against the freshly
rebuilt `bin/musterd`/`web/dist`: **23/23 passed**, including the previously-failing
`a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13)`,
now green on the first run — no spec edit was needed on my side this cycle; the fix
landed entirely in `web/src/render/launch.ts`, which I did not touch.

Re-ran `npx playwright test --list` from `web/`: collects cleanly, `Total: 151 tests in
14 files`, no duplicate titles, no TypeScript/import errors.

Swept the full suite per Validate Mode step 5: `make e2e` from the project root —
**151 passed**, 0 failed. No pre-existing spec needed a sanctioned-breakage update (this
plan's Protocol Contract still states no wire-format changed, and the full sweep bears
that out identically to attempt 1's sweep, now with the one prior failure also green).

### Repairs

No spec edits were made this cycle — none were needed. The single failure from attempt 1
was entirely on the implementation side (`web/src/render/launch.ts`'s `navigate()` success
path unconditionally clearing `#launch-error`) and web-impl's fix resolved it without
requiring any change to the test's locators, waits, or assertions. The test as written in
attempt 1 (`expect(launchError(dialog)).toBeVisible()` then
`expect(launchError(dialog)).toHaveText("repos unavailable")`, both against the real
`#launch-error` element inside the dialog, driven by a genuine `page.route` 500 on
`GET /api/repos`) is unchanged and now passes because the product behaves per REQ-13,
not because the test was loosened.

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
Running 23 tests using 6 workers
  ✓  15 [chromium] › e2e/launch.spec.ts:558:1 › a failed GET /api/repos shows the error and renders the sidebar empty-state (REQ-13) (481ms)
  ... (23 total)
  23 passed (11.6s)
```

Full-suite sweep (`make e2e` from project root):

```
151 passed (35.3s)
```

### Notes (validate attempt 2)

- No config, harness, spec, or helper file was touched this cycle — only this log. The
  fix was entirely `web-impl`'s (`web/src/render/launch.ts`'s `reposErrorPersistent`
  guard), and it closed the gap cleanly: the exact assertion I left failing and
  documented in attempt 1's E2E Implementation Bugs table now passes unmodified.
- Verified the fix is real and not a coincidental pass: the test still injects the fault
  via `page.route` intercepting only `GET /api/repos` with a 500, leaving `GET /api/browse`
  untouched — the same reproduction that isolated the bug in attempt 1 — and the alert now
  stays visible through the dialog's browse-root fallback instead of being cleared by it.
- No new user-visible behaviour was added by the fix beyond making the existing REQ-13
  error persist correctly (per the Fix Attempt 1 section of web-implementation.md), so
  there is no additional assertion owed under the "new behaviour needs new coverage" rule
  — the fix's own scope is exactly the one behaviour already under test.

## Fix Attempt 1

Review cycle 1 verdict: needs-changes. Fixed every issue tagged `[e2e-specs]`: Majors 1-5
and Minors 3-6 (Minor 1/2 are `[web-impl]`'s; Major 6 is `[orchestrator]`'s — neither
touched). Rebuilt (`make build web-build`, clean) before any live run per the harness
rule. Only `web/e2e/launch.spec.ts` and `web/e2e/helpers/picker.ts` were edited.

### Major 1 — E13/INV-4 measured before the navigation settled

Every door the review's category covers, closed:

- **The open case itself**: added `await expect(currentCrumb(dialog)).toHaveText(dirName)`
  plus `await expect(childEntry(dialog, childName)).toBeVisible()` before `afterOpen`'s
  `boundingBox()` — the dialog opens straight onto the recent, and `navigate()`
  (`launch.ts:253-268`) synchronously swaps `#browse-dirs` for `loading…` before its
  `await browse(path)` resolves, so measuring immediately after `openLaunchDialog()`
  could catch the loading frame exactly as the review described.
- **Child click**: `afterChild` now waits `await expect(currentCrumb(dialog)).toHaveText(childName)` first.
- **Crumb click**: `afterCrumb` now waits on `currentCrumb` + `childEntry(dialog, childName)` (the
  child re-appearing proves the ancestor listing, not just the loading placeholder, rendered).
- **Recent click**: `afterRecent` now waits the same way.
- **The fixture-overflow half of the fix**: added 24 sibling directories (25 entries
  total) so `#browse-dirs`'s 300px `.entries` region (style.css:1430, `overflow: auto`)
  is actually asked to contain more than fits — the prior 1-entry↔0-entry listing could
  never exercise the scrolling behaviour INV-4 and REQ-1 both promise ("panes scroll
  internally").

Implementing that last, explicitly-suggested half of Major 1 surfaced a **real
implementation defect**, not a test defect (see E2E Implementation Bugs below): with the
overflowing listing, `#browse-dirs` does not scroll internally at all — it visually
blows out past the 300px picker and paints over the Title/Model/Start-in form rows and
the Launch/Cancel buttons, confirmed with a screenshot (`page.screenshot`, discarded
after diagnosis — not part of the committed diff). The *outer* dialog `boundingBox()`
invariant (open/child/crumb/recent all 522px) still holds even in this broken state,
which is exactly why the review's literal "give it more entries" suggestion, on its own,
would not have caught this — I added an explicit
`await expect.poll(() => entriesRegion.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)`
assertion (REQ-1's own "internally scrollable" claim, applied to `#browse-dirs`
specifically) right after the open-state retrying assertions, and left it honestly
failing per the agent instructions ("never route around a defect").

### Major 2 — REQ-17's branch asserted by shape, not value

`launch.spec.ts`'s two-recents test (E1) now reads the fixture's own branch with
`git rev-parse --abbrev-ref HEAD` in `newer.path` right after the `git init` + empty
commit, and asserts `` `#launch-target .branch` === ` · ${branch}` `` exactly (was
`/^ · \S+$/`). Closes the one door the category names: an invented branch string can no
longer pass, because the expectation is now the fixture's real git state, not a shape
that any non-whitespace string satisfies.

### Major 3 — dropped negative `(git)` assertion

Restored in the child-descend test (E3): added a `plain-sibling` directory next to the
`child-repo` git checkout, and asserted
`toHaveAccessibleName(plainSiblingName)` (no ` (git)` suffix) alongside the existing
positive assertion. Closes the one door the category names — an implementation that
appended `(git)` to every entry (not just real checkouts) would now fail this test, same
as it would have failed the pre-rebuild baseline this replaces.

### Major 4 — dropped no-signal regression test

Restored verbatim from `84551d5`'s `launch.spec.ts` (the pre-rebuild file, via
`git show 84551d5:web/e2e/launch.spec.ts`), adapted only to this file's per-test
`withDaemon` wrapper and `scratchDirectory()` helper (added to the `./helpers/session`
import) in place of the old file's module-level shared `daemon`. The test drives no
picker UI at all (direct `POST /api/sessions` via `launchSession` twice, then
`GET /api/state` and a card check) so no other navigation-step adaptation was needed.
Retitled from its old `(REQ-17)` tag (that was m1-sessions' own REQ-17 numbering, unrelated
to this plan's REQ-17 which is the footer branch) to `(REQ-14 regression)`, matching this
plan's own promise that existing launch behaviour outside the dialog is unchanged.

### Major 5 — INV-1's three-way equality never asserted

Added `composedCrumbPath(dialog)` to `web/e2e/helpers/picker.ts`: reads every ancestor
`button[data-path]` plus the current `[aria-current="location"]` span's text and composes
the full absolute path they represent (root-at-`/`'s zero-ancestor case handled
explicitly, per the plan's own Manual Verification note that a naive join produces a
`"//"` artifact of the join, not the app). Asserted `composedCrumbPath(dialog) === ` the
independent readout at every one of the plan's named states that has an existing test to
attach it to — closing the category ("only ever checks the crumb bar's basename") at
every door, not just the reviewer's example:

- open with recents → E1 (equals `newer.path`)
- open with no recents (root) → E2 (equals `daemon.browseRoot`)
- after a child click → E3, both descents (parent's path, then `parent/child`)
- after a crumb click → E4 (back to `daemon.browseRoot`) and E5's crumb-to-`/`
- after ⌘↑ → E5, both presses (parent→root, and the no-op-at-root repeat)
- after a recent click → E6 (equals `first.path`)
- after a failed browse (unchanged from before) → E12/INV-3: asserted equal to the
  readout in the `before` snapshot; combined with the pre-existing byte-identical
  `crumbsNav.innerText()` before/after check, this proves the composed chain is also
  unchanged after the failure, without needing a second live DOM read post-failure
  (the crumb bar's markup, and therefore its composed value, provably didn't move)

Not added: "after a failed launch (unchanged)" — no test in this suite exercises a failed
`POST /api/sessions` (client-side validation blocks the one empty-model case, `launch.ts:329`,
before any network call), and review's Note 3 doesn't list this as untested-but-required;
adding a wholly new test for it would be scope creep beyond this cycle's named issues, not
a fix to existing coverage. Flagging it here for visibility rather than silently dropping it.

### Minor 3 — INV-3's listing half not snapshotted

E12 test: added `dirs: await dialog.locator("#browse-dirs").innerText()` to the `before`
snapshot and compared it verbatim after the failed browse, plus an explicit
`await expect(childEntry(dialog, vanishingName)).toBeVisible()` (the vanished entry's own
stale row, not just the survivor). Plan E12's "listing count unchanged" is now actually
checked, not just spot-checked via one surviving entry.

### Minor 4 — INV-2's "may set" direction untested

E7 test extended: after the existing "child click clears every pressed mark" half,
added a crumb-navigation *back onto* the recent's own path and asserted
`aria-pressed="true"` re-sets, plus `toHaveCount(1)` over
`recentsSidebar(dialog).locator('[aria-pressed="true"]')`. Also added the same
`toHaveCount(1)` check to E6 (clicking a second recent) right after its two individual
`aria-pressed` assertions — the "count-of-all" oracle now covers both the zero case
(pre-existing, E7's clear) and the exactly-one case (E6, E7's re-set), not just zero.

### Minor 5 — `.find()` hides a spurious extra session

Replaced `.find()` with `.filter(...)` + `expect(...).toHaveLength(1)` at all four sites
in the category, not just the three the reviewer named: E8 (relaunch, `:403` in the
review's pre-fix line numbers), E9 (fresh-directory launch, `:438`), E11
(other-empty-blocked, `:505`), **and** E10 (fable launch, `:461` — same
"expected-single-launch" shape, not named by the reviewer's three examples but squarely
in the category). Each site narrows the array to a `const [x] = matches` plus an
`if (!x) throw new Error(...)` unreachable-guard so TypeScript's
`noUncheckedIndexedAccess` is satisfied without a non-null assertion — the real assertion
is still the `toHaveLength(1)`, the throw is dead code reachable only if that assertion
had already failed.

### Minor 6 — E10 doesn't use the named argv oracle

Added `expect(await daemon.paneStartCommand(launched.tmuxTarget)).toContain("--model fable")`
right after the existing DB-level check, using the same `ScratchDaemon.paneStartCommand()`
helper `actions.spec.ts:452` already uses — proving `--model fable` reached the stub
process's argv, not just that `"fable"` round-tripped through Muster's own store.

### Repairs

No pre-existing-spec repairs were needed this cycle — every change above is new
assertion coverage added in response to a review issue, not a fix to a broken locator or
timing assumption in already-passing code. (The one failing assertion, Major 1's overflow
check, is not a "repair" — it's new coverage that found a real product defect; see below.)

`No assertion was deleted, skipped, or weakened.`

### E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| The browse listing does not scroll internally when it overflows its 300px picker — it visually blows out past the picker and paints over the form rows and Launch/Cancel buttons below it | `[web-impl]` | REQ-1: "720px fixed-height modal, panes scroll internally." INV-4: "the picker is a fixed 300px grid; the listing and sidebar are internally scrollable." | `#browse-dirs`'s `scrollHeight` exceeds its `clientHeight` (i.e. it actually scrolls, per its own `overflow: auto`, style.css:1430) once its content (25 entries) exceeds the picker's 300px height | `#browse-dirs`'s `scrollHeight` equals its `clientHeight` (both measured 650px, growing to fit *all* 25 entries) — it never clips. Root cause: `.browse` (style.css:1384), the flex-column grid item that contains `.crumbs` and `#browse-dirs`, has no `min-height: 0`. As a CSS Grid item with implicit (auto-sized) row tracks, its default `min-height: auto` (content-based) lets it grow past `.picker`'s own explicit `height: 300px` row instead of being clamped to it, so `.entries`'s `flex: 1` has nothing finite to fill and never triggers its `overflow: auto` scrollbar. Visually confirmed with a full-page screenshot (discarded, not committed): `sibling-11` through `sibling-15` render on top of the Model/Start-in radio rows and the Launch/Cancel buttons. Many other flex/grid containers in this same stylesheet already carry `min-height: 0` for exactly this reason (`style.css:294,308,352,370,487,...`) — `.browse` appears to be a one-line omission from that same pattern. | `the dialog's bounding height is unchanged after open, a child click, a crumb click and a recent click, even with an overflowing listing (INV-4, E13)` |

The failing assertion (`await expect.poll(() => entriesRegion.evaluate(el =>
el.scrollHeight > el.clientHeight)).toBe(true)`) is left honestly failing, per the agent
instructions — not routed around with a smaller fixture, a looser predicate, or a removed
assertion. Note that the *outer* dialog-height invariant this test also checks
(`afterOpen`/`afterChild`/`afterCrumb`/`afterRecent` all 522px) still passes even in this
broken state — the dialog's own box never grows, only its interior blows out past the
picker — so a fix confined to just re-checking `boundingBox()` would not have caught
this; the fix needs the `#browse-dirs` scroll-containment check kept in place.
Suggested fix for whichever agent picks this up: add `min-height: 0;` to `.browse`
(style.css:1384), matching the pattern already used elsewhere in this stylesheet.

### Test Run Output

```
$ npm run e2e -- e2e/launch.spec.ts
Running 21 tests using 6 workers
  ✓ 20 passed
  ✘ 1 [chromium] › e2e/launch.spec.ts:603:1 › the dialog's bounding height is unchanged
      after open, a child click, a crumb click and a recent click, even with an
      overflowing listing (INV-4, E13) (7.5s)

    Error: expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate
      639 |       await expect
      640 |         .poll(async () => entriesRegion.evaluate((el) => el.scrollHeight > el.clientHeight))
    > 641 |         .toBe(true);

  1 failed, 20 passed (16.2s)
```

Suite-wide sweep (`make e2e` from the project root, after `make build web-build`):

```
151 passed
1 failed — same e2e/launch.spec.ts:603:1 test as above
(Error: Process completed with exit code 1.)
```

No other spec in the 14-file/152-test suite regressed; every other file (including
`tiles-launch.spec.ts`, which shares `helpers/picker.ts` with this file) is unaffected by
this cycle's changes. `npx playwright test --list` collects cleanly afterward: `Total:
152 tests in 14 files` (was 151 before this cycle — the one net-new test is the restored
Major 4 regression test).

### Notes (fix attempt 1)

- Only `web/e2e/launch.spec.ts` and `web/e2e/helpers/picker.ts` were edited. No
  implementation file, config, or harness file was touched.
- The `[web-impl]`-tagged Minors (1: listing keyboard traversal loses focus after one
  descend; 2: breadcrumb scroll position on open) and the `[orchestrator]`-tagged Major 6
  (doc upkeep) are untouched, as instructed — they belong to other agents.
- Debug instrumentation used to characterize the Major 1 implementation bug (a temporary
  `console.log` rect dump and a `page.screenshot` call) was added, used to confirm the
  defect, and fully removed before this run; neither is present in the committed diff.
- Verdict is `implementation-bug` rather than `pass` solely because of the one
  newly-surfaced defect above — every review-tagged `[e2e-specs]` issue (Majors 1-5,
  Minors 3-6) is otherwise fully addressed and passing live.

## Validate Attempt 3

Re-invoked as the wave-3 re-run after web-impl's Fix Attempt 2, which:
- added `min-height: 0` to both `.browse` and `.recents` (closing the E13/INV-4 overflow
  defect this suite left honestly failing in Fix Attempt 1);
- fixed review Minor 1 (`[web-impl]`): listing keyboard traversal now chains
  `focusFirstEntry()` onto both the ArrowRight-descend and ArrowLeft-ascend navigations,
  so focus is re-anchored on the new listing's first entry instead of dropping to
  `<body>`;
- fixed review Minor 2 (`[web-impl]`): `renderCrumbs()` now ends with `nav.scrollLeft =
  nav.scrollWidth`, snapping the breadcrumb bar to its right edge on every render
  (including the initial open) so the current-directory segment and the `⌘↑` hint are on
  screen at a deep path.

Rebuilt clean from the project root first (`make build web-build`: `go build` for the
daemon, `tsc --noEmit && vite build` for the web bundle — both exit 0), per the harness
rule that a targeted `npm run e2e` run does not rebuild `bin/musterd`/`web/dist` itself.

### Step 1 — re-run the previously-failing assertion with no spec change

`npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts` against the freshly rebuilt
binaries: **24/24 passed**, including
`the dialog's bounding height is unchanged after open, a child click, a crumb click and a
recent click, even with an overflowing listing (INV-4, E13)` — its
`expect.poll(() => entriesRegion.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)`
now observes `true` on the first run, with **no edit to my spec** (confirming the fix was
entirely `.browse`'s/`.recents`' `min-height: 0`, exactly as reported).

### Step 2 — new coverage for Fix Attempt 2's two added behaviours

Both are genuinely new user-facing behaviour (not merely internal refactors), so both get
new tests per the fix-cycle instruction, added to `web/e2e/launch.spec.ts`:

1. **`keyboard traversal: descending and ascending re-anchors focus on the first entry, so
   arrow keys keep working across round trips (REQ-15, review cycle 1 Minor 1)`** — builds
   `dir.path/branch-a/{leaf-a,leaf-b}`, launches straight into `dir.path` so the dialog
   opens onto it, then drives the listing with real keyboard input only (`.focus()` +
   `page.keyboard.press`, never `.click()`): focuses `branch-a`, presses ArrowRight
   (descend), asserts `leaf-a` (the alphabetically-first entry per
   `internal/server/browse.go`'s `sort.Slice`) is focused — not `<body>` — then
   ArrowDown/ArrowUp between `leaf-a`/`leaf-b`, then ArrowLeft (ascend) and asserts
   `branch-a` is refocused in the parent listing. Repeats the whole descend→traverse→ascend
   cycle a second time to prove the fix isn't a one-shot special case (mirrors web-impl's
   own Fix Attempt 2 verification script, which explicitly re-descended after the first
   ascend for the same reason).
2. **`opening on a deep path scrolls the crumb bar to its right edge, keeping the current
   directory and the ⌘↑ hint on screen (REQ-6, review cycle 1 Minor 2)`** — builds a
   12-segment-deep directory (`a-fairly-long-segment-name-number-0..11`, matching the
   depth/naming web-impl's own verification used to force real overflow), launches
   straight into the deepest directory so the dialog opens onto it (the exact "fresh open"
   moment Minor 2 measured), then asserts, in order: (a) a sanity check that
   `#browse-crumbs`'s `scrollWidth > clientWidth` (the fixture genuinely overflows — without
   this the numeric check below would hold vacuously at `scrollLeft: 0`); (b) the numeric
   invariant the fix produces, `scrollLeft + clientWidth === scrollWidth`; (c) that the
   current crumb's and the `.kbd` hint's own `boundingBox()`s fall inside the nav's visible
   (post-scroll) bounding box — the visual proof Minor 2's own measurement
   (`currentCrumbVisible: false, kbdVisible: false`) was checking, not just the numeric
   scroll math.

One `tsc --noEmit` fix was needed mid-cycle: `segments[segments.length - 1]` typed as
`string | undefined` under this project's `noUncheckedIndexedAccess`; replaced with
`segments.at(-1)` plus an unreachable-guard throw (same pattern already used elsewhere in
this file for the same rule, per Fix Attempt 1's Minor 5 repairs) — not a test-logic
change, just satisfying the stricter gate `make web-build` runs beyond Playwright's own
transpile-only collection.

Re-ran `npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts` after that fix and the
rebuild: **26/26 passed**, both new tests green on the first live run — no repair needed
to either new test's locators, waits, or assertions.

### Step 3 — re-verify collection, then sweep the full suite

`npx playwright test --list`: collects cleanly, `Total: 154 tests in 14 files` (was 152
before this cycle — the 2 net-new tests above), no duplicate titles.

`make e2e` from the project root: **154 passed**, 0 failed. No pre-existing spec needed a
sanctioned-breakage update — this plan's Protocol Contract still states no wire-format
changed, and the sweep bears that out identically to every prior attempt's sweep.

### Repairs

No pre-existing-spec repairs were needed this cycle. The one assertion left failing after
Fix Attempt 1 (E13/INV-4's overflow-scroll check) needed zero spec change to pass —
web-impl's `.browse`/`.recents` `min-height: 0` fix closed it exactly as reported. The
`segments.at(-1)` change above is a type-safety fix to a test I wrote earlier this same
cycle (not a pre-existing spec), made before this cycle's own tests were ever run, so it
is not logged as a numbered repair.

`No assertion was deleted, skipped, or weakened.`

### E2E Implementation Bugs

None found this cycle. Every behaviour named in this cycle's brief (the E13 overflow fix,
Minor 1's keyboard continuity, Minor 2's crumb scroll position) was verified live and
matches the plan's requirements exactly.

### Test Run Output

```
$ npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts
Running 26 tests using 6 workers
  ✓ 26 passed (17.5s)
```

Full-suite sweep (`make e2e` from the project root, after `make build web-build`):

```
154 passed (37.4s)
```

`npx playwright test --list`:

```
Total: 154 tests in 14 files
```

### Notes (validate attempt 3)

- Only `web/e2e/launch.spec.ts` was edited this cycle (two new tests). No config,
  harness, helper module, or implementation file was touched.
- `web/e2e/helpers/picker.ts` needed no changes — `crumbsNav()` and `currentCrumb()`
  already existed and were reused as-is; the new `.kbd` locator is a one-off
  `dialog.locator("#browse-crumbs .kbd")` inline in the test rather than promoted to the
  helper module, since no other spec needs it yet.
- The keyboard-continuity test's directory fixture (`branch-a/{leaf-a,leaf-b}`) relies on
  `internal/server/browse.go`'s `sort.Slice(dirs, ... Name < ...)` ordering, read from the
  daemon source (not guessed), to guarantee `leaf-a` is the listing's first entry after
  `focusFirstEntry()`.
- The crumb-scroll test's visual bounding-box check (step 2c above) is deliberately kept
  alongside the numeric `scrollLeft`/`scrollWidth` check rather than replacing it: the
  numeric check alone would already have caught a regression to `scrollLeft: 0`, but the
  bounding-box check is the one that actually mirrors what review cycle 1 Minor 2 observed
  a real user seeing (an invisible current-directory segment), so both stay.

## Validate Attempt 4

Re-invoked as review cycle 2's wave-3 re-run, after web-impl's Fix Attempt 3, which:
- added a `safeFetch()` choke point to `web/src/api.ts`: a rejected `fetch` (connection
  refused, daemon down, sleep/wake, an aborted request) now returns
  `{ ok: false, error: { code: "network_error", message: "Could not reach musterd." } }`
  from all 11 exported functions instead of propagating as an uncaught rejection —
  closing review cycle 2's Critical 1 (REQ-13's `network` failure mode was entirely
  unimplemented);
- fixed review cycle 2 Minor 1: `navigateUp()` in `web/src/render/launch.ts` now returns
  `null` when there is no parent crumb to ascend to (a genuine no-op), and the listing's
  `ArrowLeft` handler only re-anchors focus onto the first entry when the result isn't
  `null` — so a no-op ascend at the filesystem root no longer yanks focus off whatever
  was focused.

Rebuilt clean from the project root first (`make build web-build`: `go build` for the
daemon, `tsc --noEmit && vite build` for the web bundle — both exit 0), per the harness
rule that a targeted `npm run e2e` run does not rebuild `bin/musterd`/`web/dist` itself.

### Step 1 — new coverage for Critical 1 (`route.abort()` on `/api/browse` and `/api/repos`)

Review's own wording ("this is the third REQ-13 defect this plan has produced, and the
first two were caught only because a test existed") is the brief: add the missing
network-layer coverage, not just re-verify the fix by hand. Both new tests use
`page.route(...).abort("failed")` — a genuine connection-level failure Playwright
fabricates — never a fulfilled response with a decodable body, which is exactly the gap
cycle 1's REQ-13 tests left (both of its probes used `route.fulfill` with a real HTTP
status).

1. **`a route.abort() on GET /api/repos shows the network error and the sidebar's empty
   state (REQ-13)`** — same shape as the pre-existing `a failed GET /api/repos shows the
   error and renders the sidebar empty-state (REQ-13)` test (a 500 via `route.fulfill`),
   but this one aborts the request outright. Asserts the sidebar's `No recent
   directories` empty state, `#launch-error` visible with the exact `networkError`
   message (`"Could not reach musterd."`, read from `web/src/api.ts:146-149`, not
   guessed), and that the browse pane (never intercepted) still reaches the daemon's real
   browse root — proving `initOpen()`'s repos-failure branch and its browse-root fallback
   both still work when the failure is a rejected promise, not just a 4xx/5xx body.
2. **`a route.abort() on GET /api/browse during navigation shows the network error and
   leaves crumbs, listing and Launch in unchanged, and a later success clears it
   (REQ-13, INV-3)`** — the plan's own INV-3 shape (mirrors the existing 404 test
   exactly: launches straight into a scratch recent, snapshots crumbs/listing/footer/
   pressed before, clicks a child entry, asserts after). The one thing that differs from
   a plain 404: `page.route("**/api/browse*", ...)` inspects the intercepted request's
   own `path` query param and calls `route.abort("failed")` only for the one entry being
   clicked, `route.continue()` for everything else (the dialog's own initial browse onto
   the seeded recent must succeed for the "before" snapshot to be real). Asserts, in
   order: the alert shows `"Could not reach musterd."`; `#browse-dirs .loading` has zero
   count (the specific "not stuck on `loading…`" claim review's fix-note names,
   confirming `renderListing()`'s failure path restores the prior listing rather than
   leaving `navigate()`'s synchronous `renderListingLoading()` placeholder in place);
   crumbs/listing-innerText/footer/pressed are byte-identical to the "before" snapshot
   (INV-3); the aborted entry's own row and its sibling are both still visible (stale
   listing unchanged, same as the 404 test); then `page.unroute(...)` and a click on the
   sibling clears the error, proving REQ-13's "a later successful navigation clears it"
   clause.

Both tests passed live on the first run — no repair needed to either.

### Step 2 — cheap coverage for Minor 1 (no-op ascend at root leaves focus alone)

**`ArrowLeft at the filesystem root is a genuine no-op and does not move focus (REQ-15,
review cycle 2 Minor 1)`** — reaches the real filesystem root the same way the existing
`Cmd+ArrowUp navigates to the parent...` test does (`crumbButton(dialog, "/").click()`,
then confirms zero ancestor crumb buttons remain — nothing to ascend to). Focuses the
*second* real entry under `/` (never the first — otherwise "focus didn't move" and "focus
moved to the first entry" would be indistinguishable), tags that exact DOM node with a
disposable `data-e2e-kept-focus` attribute (a node-identity check, not just "some button
named X is focused" — a re-render that rebuilt an identically-named button would defeat a
weaker check), presses `ArrowLeft`, and asserts the tagged node is still focused and the
listing/crumb didn't move. Confirmed the fixture assumption live: `entryCount` under `/`
resolved to 13 real top-level directories in this environment (matches `find / -maxdepth 1
-type d ! -name ".*" | wc -l`, mirroring `internal/server/browse.go`'s own filter),
comfortably above the `toBeGreaterThan(1)` floor the test asserts before proceeding.

Passed live on the first run — no repair needed.

### Step 3 — re-verify collection, then sweep the full suite

`npx playwright test --list` (from `web/`): collects cleanly, `Total: 157 tests in 14
files` (was 154 before this cycle — the 3 net-new tests above), no duplicate titles.

`npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts`: **29/29 passed** (26 in
`launch.spec.ts`, 3 unchanged in `tiles-launch.spec.ts`), all on the first live run.

`make e2e` (from the project root, after the same `make build web-build`): **157
passed**, 0 failed. No pre-existing spec needed a sanctioned-breakage update — this
plan's Protocol Contract still states no wire-format changed (Fix Attempt 3 touched only
`web/src/api.ts`'s error-handling internals and `web/src/render/launch.ts`'s
`navigateUp()`, neither a wire-shape change), and the sweep bears that out identically to
every prior attempt's sweep.

### Repairs

No spec edits were made to any pre-existing test this cycle, and none of the three new
tests needed repair after their first live run — all three passed as originally written.

`No assertion was deleted, skipped, or weakened.`

### E2E Implementation Bugs

None found this cycle. Both review cycle 2 fixes (Critical 1's `safeFetch` choke point,
Minor 1's `navigateUp()` null-on-no-parent) were verified live and match the plan's
requirements and the review's own suggested fixes exactly. The daemon-down-repos-abort
variant (Task step 2's "consider also the daemon-down repos half") was cleanly testable
with `route.abort()` alone (no need to actually kill the scratch daemon process), so it
was added as real coverage rather than left as an untested edge case.

### Test Run Output

```
$ npm run e2e -- e2e/launch.spec.ts e2e/tiles-launch.spec.ts
Running 29 tests using 6 workers
  ✓ 29 passed (17.0s)
```

Full-suite sweep (`make e2e` from the project root, after `make build web-build`):

```
157 passed (38.4s)
```

`npx playwright test --list`:

```
Total: 157 tests in 14 files
```

### Notes (validate attempt 4)

- Only `web/e2e/launch.spec.ts` was edited this cycle (three new tests, inserted next to
  the pre-existing REQ-13/keyboard-traversal tests they extend). No config, harness,
  helper module, or implementation file was touched.
- `web/e2e/helpers/picker.ts` needed no changes — every locator the three new tests use
  (`crumbButton`, `crumbsNav`, `currentCrumb`, `childEntry`, `recentButton`,
  `launchError`, `composedCrumbPath`, `launchTargetPath`) already existed.
- The `networkError` message text (`"Could not reach musterd."`) is asserted verbatim,
  read from `web/src/api.ts:146-149`, not guessed or pattern-matched — consistent with
  this suite's existing practice for `REQ-13`'s other error strings.
- Not added: a test that literally kills the scratch daemon process for the browse-during-
  navigation case (only the repos case was named as "if cleanly testable with
  route.abort"). `route.abort()` on `/api/browse` already exercises the exact same
  `safeFetch` code path a killed daemon would hit (a rejected `fetch` promise), so a
  second, heavier daemon-kill variant would be redundant coverage of the same branch, not
  a new one.
