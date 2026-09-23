# E2E Test Specs: New Session Improvement

**Plan**: new-session-improvement
**Mode**: fix (attempt 1, review cycle 1)
**Pack**: kb pack 29093 words (budget 8000, WARN exceeds) — sections rules 841 · features 10176 · diagrams 0 · decisions 11693 · proposed 0 · facts 2459 · lessons 3916 · runbooks 2 (re-pulled after the Features header was widened, decisions/features-scope)
**Verdict**: pass
**Tests created**: 11 (across 3 new files; 9 from authoring + 2 added this fix cycle — the INV-4 lone-session Focus test and E12)
**Live run**: 443/443 passing (`make e2e`, full suite, this fix cycle). This cycle's targeted run (`launch-opens-session.spec.ts`, `launch-defaults.spec.ts`, `shortcuts.spec.ts`) 23/23. Soak (`make e2e-soak N=10`, this cycle's two touched files): `launch-opens-session.spec.ts` 50/50 (5 tests × 10), `launch-defaults.spec.ts` 40/40 (4 tests × 10) — all green, no flakes. See `## Fix Attempt 1 (review cycle 1)` below for this cycle's work; `launch-model-check.spec.ts` is untouched this cycle (validate attempt 1's 20/20 soak still stands), and validate attempt 1's own 43/43 five-file targeted run and 90/90 three-file soak remain valid for the tests unchanged since then.

## Tests

| File | Test Name | Requirement | What It Verifies | Status |
|------|-----------|-------------|------------------|--------|
| web/e2e/launch-model-check.spec.ts | an unrecognized custom model into a never-launched directory is refused, writes nothing, and a retry with a recognised model succeeds (REQ-1, REQ-2, REQ-3, INV-1, E3, E4) | REQ-1, REQ-3, INV-1, E3, E4 | Refusal message, dialog stays open with fields untouched, no card/no Recent entry, then a retry with `sonnet` launches | pass (soaked 10x) |
| web/e2e/launch-model-check.spec.ts | an unrecognized model into a previously-launched directory leaves its rail card count and its Recent's stored model/mode untouched (REQ-1, INV-1) | REQ-1, INV-1 | INV-1's second source state (a directory with a prior launch): card count and the recent's stored model/mode survive a refused attempt | pass (soaked 10x) |
| web/e2e/launch-opens-session.spec.ts | launching the only session in Focus focuses it and routes typed keys to its terminal with no click (REQ-7, INV-4) | REQ-7, INV-4 | INV-4's fifth source state (Focus with no sessions): current marker on the lone card, keyboard focus already in its terminal (survives a 1.2s tick), and a real keystroke round-trips — isolated from the marker-reassignment behaviour the second-session tests below exercise, since a lone launch's marker placement alone wouldn't distinguish this plan from pre-existing default-focus behaviour (review cycle 1 Major 1) | pass (new this cycle, soaked 10x) |
| web/e2e/launch-opens-session.spec.ts | launching a second session in Focus focuses it, shows its title in the mainhead, and routes typed keys to its terminal with no click (REQ-7, E5, E6) | REQ-7, E5, E6 | Current marker moves to the new session, mainhead title updates, keyboard focus is already in its terminal (survives a 1.2s tick) and a real keystroke round-trips | pass (repaired, soaked 10x — Repair 1) |
| web/e2e/launch-opens-session.spec.ts | launching from Tiles with a full grid promotes the new session with keyboard focus already in its tile, no click needed (REQ-8, E7) | REQ-8, E7 | Full 2×2 grid promotes the launch, demotes one tile, and the new tile is immediately typable with no click | pass (repaired, soaked 10x — Repair 2) |
| web/e2e/launch-opens-session.spec.ts | launching from Tiles with a free slot lands the new tile with keyboard focus already inside it (INV-4) | INV-4 | The other Tiles source state INV-4 names (free slot, not just full grid) | pass (soaked 10x, no repair needed) |
| web/e2e/launch-opens-session.spec.ts | in attention sort with another session needing input, the launched session stays focused across a render tick (REQ-7, E8) | REQ-7, E8 | The default-focus render phase does not steal focus back from a just-launched session even when a needs-input session sorts first | pass (repaired, soaked 10x — Repair 3) |
| web/e2e/launch-defaults.spec.ts | a fresh dialog with no launch history checks auto and sonnet (REQ-5, E1, E2) | REQ-5, E1, E2 | Fresh-dialog fallback defaults | pass (soaked 10x) |
| web/e2e/launch-defaults.spec.ts | a model picked before the initial restore lands stays checked, and the untouched mode still restores from the recent (REQ-6, E9) | REQ-6(a), E9 | Touched field survives the async restore race; untouched field still restores | pass (soaked 10x) |
| web/e2e/launch-defaults.spec.ts | clicking a second Recent before the held-back initial browse lands leaves that Recent's directory listed, never the superseded one (REQ-6, E10) | REQ-6(b), E10 | A user navigation supersedes the initial restore outright; the stale response does nothing | pass (soaked 10x) |
| web/e2e/launch-defaults.spec.ts | with the most recent Recent's directory deleted before the dialog opens, the opened dialog lists the browse root (REQ-6, E12) | REQ-6(c), E12 | A genuinely failed initial navigation (not superseded, not ok) falls back to the browse root: crumb/footer show the root, `#launch-error` is hidden, and the fallback's own defaults (auto/sonnet) show, not the vanished recent's stored haiku/default | pass (new this cycle, soaked 10x) |
| web/e2e/permission-mode.spec.ts | the storedModeCases loop — four `a stored lastPermissionMode of "…" pre-selects the "…" radio on reopen` tests | E11, INV-2 | Regression pin: each of the four stored-mode rows still pre-selects its radio on reopen, unaffected by REQ-5's fallback (each seeds an explicit `permissionMode`) — full-file run `7 passed (0.7-0.9s each)` | pass |
| web/e2e/launch.spec.ts:298 | clicking a second recent swaps the pressed mark and the model/mode radios (REQ-7, E6) | n/a (pre-existing, plan-defect sanity check) | Regression pin: confirms the plan's cited line 336 ("manual" checked after clicking a seeded Recent) is unaffected by this plan and correctly stays `manual` | pass |

All 11 of this plan's new-behaviour tests pass live. Of the original 9, 5 (`launch-opens-session.spec.ts`) needed the 3 repairs documented in `## Repairs` below during validate attempt 1. The 2 added this fix cycle (review cycle 1 Major 1 and the plan's amended W6/E12) passed on first run, no repair needed. See `## Validate Attempt 1` and `## Fix Attempt 1 (review cycle 1)` below for the full run sequences.

## Fixture Changes

- `web/e2e/helpers/daemon.ts` — `STUB_CLAUDE_SCRIPT` gained a `$1 = "--bare"` branch answering the daemon's REQ-1 pre-check (`<claude> --bare --no-session-persistence --model <model> -p ''`). It scans `"$@"` for the value following `--model`; a value starting with `muster-e2e-unrecognized` gets the measured catalog-refusal sentence (`"<model>" isn't described by this version's model catalog; …`, kb:fact/model-catalog-precheck-zero-token) on stderr, every other value passes silently. Both cases then print `Error: Input must be provided either through stdin or as a prompt argument when using --print` to stderr and exit 1, mirroring the real binary's "exit 1 either way, the sentence is the only signal" contract (kb:fact/unknown-model-fails-first-turn's sibling fact). Without this branch the pre-check argv would fall into the stub's existing echo-loop with stdin already at EOF and hang until REQ-1's 5s bound on every launch, once the daemon wires the check in. Purely additive: the `--version` branch and the normal echo-loop are untouched, and no currently-passing spec calls `--bare`, so this change is inert until daemon-impl lands `CheckModel`.
- Test-local constant `UNRECOGNIZED_MODEL = "muster-e2e-unrecognized-model"` (launch-model-check.spec.ts) is the one model string this suite ever sends that the stub is taught to refuse — chosen to start with the stub's matched prefix.
- No fixtures.ts / playwright.config.ts changes (out of scope for this agent; none were needed).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | launch-model-check.spec.ts both tests |
| REQ-2 | daemon-unit only (D4/D6) per Reviewer-Verified; E2E exercises only the two observable outcomes (recognised/unrecognised) the stub can produce |
| REQ-3 | launch-model-check.spec.ts test 1 |
| REQ-4 | daemon-unit only (D10); no e2e-visible surface |
| REQ-5 | launch-defaults.spec.ts test 1 |
| REQ-6 | launch-defaults.spec.ts tests 2, 3 and 4 (E12, added review cycle 1) |
| REQ-7 | launch-opens-session.spec.ts tests 1, 2 and 5 (the lone-session test, added review cycle 1, is test 1) |
| REQ-8 | launch-opens-session.spec.ts test 3 |
| REQ-9 | daemon-canary only (D12/D13), out of this agent's scope |
| INV-1 | launch-model-check.spec.ts both tests (E2E slice; the byte-identical settings.local.json half is D7's) |
| INV-2 | daemon-unit (D4/D6) |
| INV-3 | daemon-unit (D10) |
| INV-4 | launch-opens-session.spec.ts all five tests (Focus-with-no-sessions, Focus-with-another-focused, Tiles-full, Tiles-free-slot, Focus-attention-sort-with-needs-input) — the Focus-with-no-sessions test was added review cycle 1 (Major 1: the prior 4 tests missed this source state) |
| INV-5 | launch-defaults.spec.ts tests 2 and 3 |
| E1–E12 | see Tests table above; E11 is the pre-existing `permission-mode.spec.ts` stored-mode loop, unmodified (ran live, 4/4 green); E12 was added review cycle 1 with the plan's W6 amendment |

## Repairs (validate / fix modes only)

N/A — authoring mode.

## Test Run Output

Collection gate (`npx playwright test --list` from `web/`):
```
Total: 441 tests in 41 files
```
No errors; all 9 new tests listed under their files (verified individually via grep on the listing).

`web/scripts/e2e-lint.sh`: clean after one `npx biome check --write e2e` formatting pass on `launch-model-check.spec.ts` (a single multi-line `expect(...)` call the formatter wanted reflowed — no assertion changed).

`npx tsc --noEmit`: clean.

Regression pins run live (per "Regression pins run live at authoring", after `make web-build build`):
```
web/e2e/permission-mode.spec.ts
  7 passed (4.4s)
```
This is E11's actual coverage (the four `storedModeCases` rows, unmodified by this plan — each launches with an explicit `permissionMode`, so REQ-5's fallback-to-auto change never engages).

```
web/e2e/launch.spec.ts:298 "clicking a second recent swaps the pressed mark and the model/mode radios (REQ-7, E6)"
  1 passed (2.8s)
```
Run to sanity-check the plan-defect finding below; left unmodified (see Notes).

## Notes

**Plan-defect flag, not acted on.** The plan's Affected Files › E2E lists `web/e2e/launch.spec.ts:336` — "the fresh-dialog `manual` assertion becomes `auto`" — but that line sits inside "clicking a second recent swaps the pressed mark and the model/mode radios," which asserts the radio state *after clicking a named Recent that was seeded with an explicit `permissionMode: "default"`*. That is REQ-6's "Clicking a Recent keeps restoring that directory's model and mode, unchanged" path, not REQ-5's "nothing to restore" fallback path — the two are different clauses of the same plan, and the plan's own Overview states the clicked-Recent case explicitly stays "manual". I re-read the whole file (no other `"manual"`-checked assertion exists — confirmed by `grep -n '"manual"' launch.spec.ts`, one hit besides this, an unrelated visibility check) and could not construct a scenario in which this specific assertion should become `auto` without contradicting REQ-6. I left the line as `manual` and ran the test live (passes, 1/1) rather than "fixing" a correct pin into an incorrect one. REQ-5's genuinely new fresh-dialog default is covered instead by `launch-defaults.spec.ts`'s first test (E1/E2), which is what the plan's own Acceptance Criteria table names for that coverage. Flagging for the orchestrator/reviewer to confirm or overrule.

**Stub-script race assumptions (E9/E10).** `launch-defaults.spec.ts`'s two race tests gate the dialog's first `GET /api/browse` call with a `page.route` promise gate, matching the plan's own framing ("with the first GET /api/browse held back"). They rely on Playwright's auto-waiting (a click on a not-yet-rendered Recent button waits for `GET /api/repos` to resolve and the sidebar to render) to make the internal auto-navigate's browse call arrive before the test's own click-triggered one. This is the same ordering assumption `launch.spec.ts`'s existing `route.abort()` tests already rely on; I could not verify it against the real `initOpen`/`navigate()` implementation (doesn't exist yet). If validate mode finds the ordering inverted, the fix is a locator/wait repair in these two tests, not a scope change — the assertions themselves (which directory ends up listed, which model/mode radios are checked) stay as specified.

**Unmeasured wire shapes: none.** No new hook/status-line payload shapes were needed — REQ-1's pre-check subprocess is the one new wire surface this plan touches, and its shape is fully specified by kb:fact/model-catalog-precheck-zero-token (the argv, the sentence, exit 1) plus the plan's own REQ-1 text, so the stub script change traces to a cited fact record, not a guess.

**Harness rebuild note for later modes.** `make web-build build` was run once (per the authoring-mode regression-pin instructions) to prove `permission-mode.spec.ts` is currently green; the resulting `bin/musterd` and `internal/webui/assets` are pre-plan (no daemon-impl/web-impl changes exist yet), so validate mode's own mandatory rebuild is still required and will pick up real changes.

## Handoff (authoring)

- `web/e2e/launch-model-check.spec.ts`, `web/e2e/launch-opens-session.spec.ts`, `web/e2e/launch-defaults.spec.ts` are new and collection-clean; all assert behaviour that does not exist yet (expected to fail if run against the current tree).
- `web/e2e/helpers/daemon.ts` gained the `--bare` stub branch described above — additive, inert until `CheckModel` is wired.
- No changes to `web/e2e/launch.spec.ts` or `web/e2e/permission-mode.spec.ts` — see the plan-defect note above for why the one Affected-Files line item was not applied.
- `web/e2e/helpers/fixtures.ts` and `web/playwright.config.ts` were not touched (none needed).

## Validate Attempt 1

Kb pack re-pulled per the orchestrator's note (Features header widened by decisions/features-scope): summary line above. Read `daemon-implementation.md` and `web-implementation.md`, including web-impl's "E2E smoke run" section, which reported 3 failures in `launch-opens-session.spec.ts` it judged test-authoring defects, and named the exact lines and its own diagnosis (navigation defect in 2 tests, `getByRole` substring collision in 1). I verified each independently before repairing (`## Repairs` below) rather than taking the report on faith.

### 1. Rebuild + full targeted run

`make web-build build` (project root), then from `web/`:
```
npx playwright test e2e/launch-model-check.spec.ts e2e/launch-opens-session.spec.ts \
  e2e/launch-defaults.spec.ts e2e/permission-mode.spec.ts e2e/launch.spec.ts
```
First run: 40 passed, 3 failed — the exact three web-impl's smoke run named, at the exact
same lines, confirming this is not new drift from web-impl's own run.

### 2. Diagnosis (my defect, not theirs)

All three are locator/setup defects in my own spec, not implementation bugs — verified
against the real code, not just web-impl's say-so:

1. **Two navigation failures** (`launching a second session in Focus…` and `in attention
   sort…`): `web/src/features/launch.ts`'s `initOpen()` navigates onto `repos[0]` — the
   most-recently-launched directory — on every dialog open (confirmed by reading the
   function directly: `const first = repos[0]; … await navigate(first.path);`). Both
   tests launched a first session, then opened the dialog and looked for a *different*
   directory's child entry with no intervening navigation, so the listing shown was the
   first directory's own (empty) children and the target entry never appeared. Also
   confirmed `internal/store/repo.go`'s `ListRepos` orders `pinned DESC,
   last_launched_at DESC`, and that `GET /api/browse` (`internal/server/browse.go`)
   accepts an explicit path outside the browse root without error — so navigating onto a
   directory made via `scratchDirectory()` (outside the root) succeeds and shows an
   empty listing, matching the observed timeout exactly rather than an error message.
2. **`getByRole("button", { name: "Tiles" })` strict-mode violation**: Playwright's
   default name match is substring, case-insensitive; one seeded session title
   (`opens-tiles-seed-1`) gives its rename button an accessible name containing
   "tiles". `grep -rn 'name: "Tiles"' web/e2e/*.spec.ts` shows the existing suite already
   has this exact collision precedent and its established fix (`gauges.spec.ts`,
   `rail-layout.spec.ts`, `theme.spec.ts`, `views.spec.ts` all use unscoped `"Tiles"`
   safely because none of *their* seeded titles contain "tiles" — the three that do use
   `exact: true` are the ones sharing a directory prefix pattern like this test's).

### 3. Repair, then a second defect the repair exposed

Fixed (1) by adding the up-then-down navigation `tiles-launch.spec.ts`'s own sibling test
already uses (`crumbButton(dialog, basename(daemon.browseRoot)).click()` before the
`childEntry` click), and switching the seed directories to `browseScratchDirectory` so
they sit under the root and that crumb exists. Fixed (2) with `exact: true`, matching the
established pattern.

Re-running surfaced a **fourth**, previously-masked defect: `in attention sort…` launches
two sessions back to back (`dirA` then `dirNeedy`) and assumed `dirNeedy` (launched
second) would be `repos[0]`. `last_launched_at` is whole-second `RFC3339`
(`internal/store/repo.go`), so the two launches can tie inside the same wall-clock
second, and SQLite's tie-break order put the *first*-launched directory first roughly
half the time — the test passed or failed depending on which side of a second boundary
the two `launchSession` calls landed. Five consecutive standalone re-runs (`--workers=1
-g "in attention sort"`) reproduced both outcomes before the fix (2 failed / 3 passed
across the ad hoc sampling that led to this diagnosis) and one run even showed a
"musterd unreachable" banner in the failure snapshot — a red herring: that was the test
stalled for the full 60s test timeout waiting on a crumb button that would never appear
in that run, not a real daemon fault (confirmed: `ps aux` showed `musterd` and the
Playwright workers still alive and healthy throughout).

Fixed by adding `waitForNextClockSecond()` (`web/e2e/helpers/session.ts`, already used by
`launch-defaults.spec.ts`'s own E10 test for the identical reason) between the two
`launchSession` calls. Re-ran the single test 5 times standalone after the fix: 5/5
green. Then the full 5-file targeted run: 43/43 green (below).

### 4. Full targeted re-run

```
npx playwright test e2e/launch-model-check.spec.ts e2e/launch-opens-session.spec.ts \
  e2e/launch-defaults.spec.ts e2e/permission-mode.spec.ts e2e/launch.spec.ts

43 passed (21.5s)
```

### 5. Collection re-check

```
npx playwright test --list
Total: 441 tests in 41 files
```
Unchanged from authoring — no title collisions introduced.

### 6. Full suite

`make e2e` (project root, foreground with an explicit long timeout since it exceeds the
default 120s):
```
441 passed (2.9m)
[exited with code 0]
```
No failures outside this plan's own files — no old-spec repair was needed (the plan's
protocol delta introduced no wire-shape change an existing spec asserted the old way).

### 7. Soak

All three of this plan's own spec files, `make e2e-soak SPEC=<file> N=10` (chained
sequentially, log preserved at `/tmp/soak-run.log` on the machine this run executed on):

```
=== SOAK launch-model-check.spec.ts ===
  20 passed (13.8s)
=== SOAK launch-opens-session.spec.ts ===
  40 passed (37.1s)
=== SOAK launch-defaults.spec.ts ===
  30 passed (17.7s)
```

All green, zero failures across 90 repeated-test runs total. This directly confirms
Repair 3's diagnosis: `launch-opens-session.spec.ts`'s prior flake (the timestamp tie)
is fixed at its cause, not papered over — 40/40 (10 repeats × 4 tests) with no isolated
re-run needed to get there.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | launching a second session in Focus … (REQ-7, E5, E6) | `childEntry(dirB)` click timed out (60s) | `initOpen()` navigates onto `repos[0]` (the one recent, `dirA`) on every open; the test looked for `dirB` with no intervening navigation | Added `crumbButton(dialog, basename(daemon.browseRoot)).click()` before the `childEntry` click, and moved `dirA` under the browse root (`browseScratchDirectory`) so that crumb exists | REQ-7/E5/E6 unchanged — the assertions after the launch (current marker, mainhead title, keyboard focus, keystroke round-trip) are untouched; only how the test reaches the launch changed |
| 2 | launching from Tiles with a full grid … (REQ-8, E7) | `strict mode violation: getByRole('button', { name: 'Tiles' })` resolved to 2 elements | Substring, case-insensitive default match also hit the seeded `opens-tiles-seed-1` rename button (accessible name contains "tiles") | `page.getByRole("button", { name: "Tiles", exact: true })`, matching `gauges.spec.ts`/`rail-layout.spec.ts`/`theme.spec.ts`'s existing precedent for this exact collision | REQ-8/E7 unchanged — same view switch, same subsequent assertions |
| 3 | in attention sort … (REQ-7, E8) | `crumbButton(browseRoot)` click timed out (60s), intermittently (reproduced both outcomes across 5 standalone re-runs before the fix) | `dirNeedy` was created via `scratchDirectory()` (outside the browse root, no ancestor crumb to click back to root from); separately, `dirA` and `dirNeedy` launched inside the same wall-clock second tie on `last_launched_at DESC`, so `repos[0]` was not reliably `dirNeedy` | Moved `dirNeedy` under the browse root (`browseScratchDirectory`) and added `waitForNextClockSecond()` between the two `launchSession` calls (same helper, same rationale as `launch-defaults.spec.ts`'s own E10) | REQ-7/E8/INV-4 unchanged — the assertions (current marker on C, keyboard focus in C's terminal, both surviving a 1.5s render tick) are untouched; proven by the 5/5 standalone re-run after the fix plus the full-file and full-suite green runs above |

No assertion was deleted, skipped, or weakened.

## Notes (validate)

**"musterd unreachable" was a stall symptom, not a daemon defect.** During diagnosis of
Repair 3, one failing run's page snapshot showed a "reconnecting…"/"musterd unreachable"
banner. I confirmed this was downstream of the test itself stalling for the full 60s
click timeout (waiting on a crumb button target that the timestamp tie meant would never
render that run), not a real daemon fault: `ps aux` during a live repro showed `musterd`
and all Playwright worker processes healthy and running throughout, and the failure
reproduced identically (same locator, same line) across multiple runs regardless of
whether the banner appeared. Flagging in case a reviewer independently notices the same
banner in a saved trace — it is not evidence of an implementation-bug.

**Soak coverage complete.** All three plan spec files soaked 10x each under `make
e2e-soak`, all green (90/90 repeated-test runs, "7. Soak" above) — verdict `pass` rests
on the full-suite run (441/441), the 43/43 targeted run, and the soak, not just the 5/5
manual standalone repeats used during diagnosis.

## Handoff (validate)

- `web/e2e/launch-opens-session.spec.ts` is the only spec file changed this attempt — see
  `## Repairs` above for the three fixes. `web/e2e/launch-model-check.spec.ts` and
  `web/e2e/launch-defaults.spec.ts` are unchanged from authoring and passed as authored.
- No changes to `web/e2e/launch.spec.ts` or `web/e2e/permission-mode.spec.ts` this
  attempt either — both ran green unmodified in the targeted and full-suite runs.
- `web/e2e/helpers/fixtures.ts`, `web/playwright.config.ts`, `web/scripts/e2e-lint.sh`
  were not touched.
- Nothing outstanding: full suite, targeted run and soak of all three plan spec files
  are all green.

## Fix Attempt 1 (review cycle 1)

**Issue addressed**: correctness review Major 1 `[e2e-specs]` — `launch-opens-session.spec.ts`'s
header claimed INV-4's five source states were covered by testing four, and its stated
reason ("the only way to tell 'the new launch was focused' apart from the pre-existing
'top of sort order' default-focus behaviour") is false for the keyboard-focus half: pre-plan
`onLaunched` never called `focusSelected` at all, so keyboard focus landing in the terminal
is new even for a lone first launch. Also covered: the concrete coverage task the
orchestrator attached to the same issue — REQ-6(c)'s browse-root fallback (E12), which
web-tests measured has zero automated coverage now that W6's amendment (`plan.md`, review
cycle 1 maintainability Minor 1) removed the pure `openFallback` seam it used to be
unit-testable through.

### 1. Read the current implementation

Read `web/src/features/launch.ts`'s `initOpen`/`applyInitialRestore`/`navigate` (the
`openFallback` seam is gone — `initOpen` now switches on `NavigateOutcome` directly) and
`web/src/features/focus.ts`'s `bringForward` (this cycle's other web-impl fix: `focusSession`
was renamed and exported so `launch.ts`'s `onLaunched` calls it structurally instead of
duplicating the view-branch — see `web-implementation.md`'s Fix Attempt — review cycle 1,
Major 2). Neither change affects an E2E spec's locators or assertions: `bringForward`'s body
is unchanged, just relocated and shared; `initOpen`'s three-way outcome handling is
unchanged, just inlined. Confirmed `web/src/features/launch-restore.ts` no longer exists
(moved to `web/src/render/launchrestore.ts`, Major 3) — irrelevant to E2E, which never
imported it.

### 2. New test 1 — INV-4's fifth source state (Focus, no sessions)

Added `launching the only session in Focus focuses it and routes typed keys to its terminal
with no click (REQ-7, INV-4)` to `web/e2e/launch-opens-session.spec.ts`, as the file's first
test: a fresh `daemon`, an empty Focus view (`#main-empty` visible), one launch via the
dialog straight onto the browse root's child, then the same three assertions the
second-session test already makes (current marker via `aria-current`, keyboard focus via
`activeElementInsideTerminal` before and after a 1.2s `settleFor`, and a no-click keystroke
round-trip echoed by the stub). Corrected the file's header comment to state the true
distinction: the current-marker half needs a second session to isolate from pre-existing
default-focus behaviour, but the keyboard-focus half does not, since there was no pre-plan
keyboard-focus behaviour to confuse it with. Also corrected the header's blanket "every test
below launches a second session" claim, which the Tiles free-slot test at the time
contradicted.

### 3. New test 2 — REQ-6(c) / E12

Added `with the most recent Recent's directory deleted before the dialog opens, the opened
dialog lists the browse root (REQ-6, E12)` to `web/e2e/launch-defaults.spec.ts`, same shape
as the existing E9/E10 race tests but deleting the directory instead of racing it (per the
orchestrator's concrete task): launches a session with a stored `haiku`/`default` into a
scratch directory (the deliberately off-default seed values — a leaked restore despite the
failed navigation would show up as these, not the fallback defaults), `rm`s that directory
before the dialog ever opens, then asserts the settled dialog shows the browse root
(`currentCrumb`, `launchTargetPath`), `#launch-error` hidden, the deleted recent's button
`aria-pressed="false"`, and the model/mode fall back to REQ-5's `sonnet`/`auto` — not the
vanished recent's stored values.

### 4. Number-chord path (bringForward refactor) — already covered, no new test needed

Checked whether `focus.ts`'s `bringForward` consolidation (this cycle's web-impl Major 2 fix)
left the number-chord path (⌥⌘1–9, ⌥⌘0) under-tested. It didn't need a new test:
`shortcuts.spec.ts` already drives `bringForward` through both its branches with real
behavioural assertions —
`pressing Opt+Cmd+1 in Focus focuses the rail's first displayed card, in manual and attention
modes (E4)` asserts the mainhead name changes after the chord (Focus branch: `app.focus` +
`app.render`), and
`pressing Opt+Cmd+1 in Tiles promotes the rail's first displayed session into the grid (E5)`
asserts a stripped tile becomes live (Tiles branch: `deps.promoteTile`) — plus `E6`
(Opt+Cmd+0's neediest-with-a-pinned-session-ahead contrast) and the Tiles Opt+Cmd+0 test.
These pin `bringForward`'s two outward branches by their observable effect, which is exactly
what would break if the refactor had changed behaviour rather than just location. Ran the
whole file (14 tests) alongside the two new tests to confirm: all green, part of the 23/23
combined run below — no regression from the rename/relocation.

### 5. Run

Rebuilt first (`make web-build build`, project root — the harness serves prebuilt
binaries and waves 1–2 changed `web/src`/`internal`). Then, from `web/`:
```
npx playwright test e2e/launch-opens-session.spec.ts e2e/launch-defaults.spec.ts e2e/shortcuts.spec.ts
23 passed (9.7s)
```
All green on the first run — no repair needed for either new test.

Collection re-check:
```
npx playwright test --list
Total: 443 tests in 41 files
```
Up from 441 by exactly the 2 new tests; no title collisions.

`npx biome check e2e/launch-opens-session.spec.ts e2e/launch-defaults.spec.ts`: clean.
`npx tsc --noEmit`: clean. `web/scripts/e2e-lint.sh`: clean.

Full suite (`make e2e`, project root, foreground with an explicit 600s timeout since it
exceeds the default 120s):
```
443 passed (2.8m)
[exited with code 0]
```
No failures outside this plan's own files.

Soak, both files this cycle touched (`make e2e-soak SPEC=<file> N=10`):
```
=== SOAK launch-opens-session.spec.ts ===
  50 passed (44.1s)
=== SOAK launch-defaults.spec.ts ===
  40 passed (20.3s)
```
50/50 (5 tests × 10) and 40/40 (4 tests × 10), zero flakes. `launch-model-check.spec.ts` was
not touched this cycle; its validate-attempt-1 soak (20/20) still stands.

## Repairs (fix attempt 1)

No existing assertion was repaired this cycle — both changes are new tests added to close a
named coverage gap (INV-4's fifth state, REQ-6(c)/E12), plus a correction to the header
comment's stated rationale in `launch-opens-session.spec.ts`. Neither new test needed a
locator or wait fix after the first run (`## 5. Run` above).

No assertion was deleted, skipped, or weakened.

## Handoff (fix attempt 1)

- `web/e2e/launch-opens-session.spec.ts` — added one test (INV-4's fifth state) and
  corrected the header comment's rationale; the four tests from validate attempt 1 are
  otherwise unchanged.
- `web/e2e/launch-defaults.spec.ts` — added one test (E12) and extended the header comment
  to name it; the three tests from authoring are otherwise unchanged.
- No changes to `web/e2e/launch-model-check.spec.ts`, `web/e2e/permission-mode.spec.ts`,
  `web/e2e/launch.spec.ts` or `web/e2e/shortcuts.spec.ts` this cycle — `shortcuts.spec.ts`
  was read and run (14/14 green, within the 23/23 combined run) to confirm the number-chord
  path but needed no edit.
- `web/e2e/helpers/fixtures.ts`, `web/playwright.config.ts`, `web/scripts/e2e-lint.sh` were
  not touched.
- Nothing outstanding for this issue: full suite (443/443), targeted run (23/23) and soak of
  both touched files are all green.
