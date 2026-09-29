# E2E Test Specs: Resume and Dangerously Allow

**Plan**: resume-and-dangerously-allow
**Mode**: fix (review cycle 1)
**Pack**: `kb: pack 37350 words (budget 20000)` — WARN exceeds budget (sections: rules 953 · features 13208 · decisions 12682 · facts 7359 · lessons 3140 · runbooks 2)
**Verdict**: pass
**Tests created**: 21 (validate attempt 2) + 13 (review cycle 1 fix wave) = 34
**Live run**: 497/497 in the full suite (`make e2e`), including all 34 of my own rows.

## Tests

| File | Test Name | Requirement | What It Verifies | Run |
|------|-----------|-------------|------------------|-----|
| web/e2e/bypass.spec.ts | checking "bypass" shows the warning and turns Launch into a danger "Launch without checks"; launching posts permissionMode: bypassPermissions and spawns the flag verbatim | REQ-1, REQ-2, REQ-13, E1 | `#bypass-warning` text/visibility, `#launch-button`'s two faces, the launched session's `permissionMode`, the real pane's `--permission-mode bypassPermissions`, opens-launched-session | collection-only [^1] |
| web/e2e/bypass.spec.ts | unchecking "bypass" restores the ordinary "Launch" face | INV-2 (New-tab half) | switching the Start-in radio back off bypass clears the warning and the danger face | collection-only [^1] |
| web/e2e/bypass.spec.ts | the existing Resume action relaunches a bypass-latched session with --permission-mode bypassPermissions | REQ-1 (second clause) | End then Resume (kb:anchor/sessions.resume) on a bypass-launched session still spawns the flag; the chip survives | collection-only [^1] |
| web/e2e/bypass.spec.ts | the launched bypass session's rail card and the Focus mainhead show the bypass chip, with the bypass-warning note before any hook arrives | REQ-4, REQ-5, E2 | `.chip-danger` on the card and `#mainhead`; the "likely waiting on Claude Code's bypass warning" note pre-bind | collection-only [^1] |
| web/e2e/bypass.spec.ts | a hook reporting permission_mode: default removes the bypass chip from the rail card and the mainhead | E3 | latch correction via a real hook clears the chip on both surfaces | collection-only [^1] |
| web/e2e/bypass.spec.ts | in Tiles, the bypass session's tile header shows the chip, and a hook reporting default removes it | E12 | the same chip behaviour in the Tiles tile header | collection-only [^1] |
| web/e2e/bypass.spec.ts | the bypass chip is shown on the rail card in every state (alive and dead), and returns once the latch flips back to bypass | INV-1, edge case 17 | chip persists across started/working/needs_input/idle/failed/dead, and reappears when the latch flips back | collection-only [^1] |
| web/e2e/bypass.spec.ts | a directory whose last launch was bypass opens the dialog on auto, from a fresh open and from clicking its Recent | REQ-3, INV-3 | both restore paths never re-check bypass | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | opening the dialog always lands on the New tab, even right after a previous open was left on Resume | REQ-7 | tab pair `aria-selected`, `#past-sessions` visibility, after Cancel + reopen via the masthead button | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | switching to Resume and back to New restores the form exactly as it was left | User Flow 3 | Title/Model/Start-in survive a Resume-tab detour | collection-only [^1][^2] |
| web/e2e/past-sessions.spec.ts | the Resume tab lists fixture sessions newest first, disables the one already open in Muster, and refuses a POST for it with already_open | REQ-9, E5, edge case 9 (D11's UI+API halves) | list order via 3 fixture transcripts with explicit mtimes, `disabled` + "open in Muster", list head count, direct `already_open` 409 with `id` | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | resuming a fixture session spawns claude --resume \<id\> --permission-mode plan with no --model and no --name, seeds the row, and opens it like any launch, leaving a bystander session untouched | REQ-10, REQ-13, E6 | footer target text, response seeds (title/model/permissionMode/claudeSessionId null), real pane argv, opens-launched-session, bystander unaffected | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | selecting a bypass fixture row shows "Resume without checks", danger; a non-bypass row shows the ordinary "Resume" | REQ-11, INV-2 (Resume-tab half), E7 | row-level chip + primary-button face flip | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | resuming a fixture deleted after listing shows the 404 message in #launch-error and the list drops it on refetch | REQ-10, E8, edge case 7 | exact `unknown_claude_session` message, dialog stays open, refetch drops the row | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | with the daemon down, the Resume tab shows 'Couldn't read sessions — try again' | E9 | connection-level failure (not an HTTP error status) on `/api/past-sessions`, button disabled | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | the filter narrows the list case-insensitively over title and last prompt, and shows 'No sessions match' when nothing does | REQ-14, E10 | title match, last-prompt match, no-match state | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | a directory with no Claude Code sessions shows the empty state, button disabled | States | empty-directory fixture | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | the Resume tab shows a loading state while the fetch is in flight, then renders the list | States | `page.route` gate proves "Loading sessions…" deterministically, then the real list | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | navigating to another directory while on Resume refetches, clears the selection, and selects the first enabled row again | REQ-8, User Flow 4 | selection clears and re-defaults across a directory change | collection-only [^1] |
| web/e2e/past-sessions.spec.ts | resuming from the list advances the repo's MRU and launch count without overwriting its remembered model or Start-in mode | REQ-15 | `GET /api/repos` before/after: launchCount+1, lastLaunchedAt changed, lastModel/lastPermissionMode unchanged | collection-only [^1] |
| web/e2e/actions.spec.ts | Resume is refused 409 not_resumable when another alive session already holds the same claude id | REQ-12 (second clause), INV-4 | the existing Resume action (kb:anchor/sessions.resume) refuses a dead row whose claude id a second, still-alive session now holds; the refused row stays untouched | collection-only [^1][^3] |

[^1]: This whole file's daemon fixture cannot start at all right now — see "Test Run Output". Not merely "the new markup doesn't exist yet" (true too, confirmed below): no test using `daemon`/`startDaemon`/`fileDaemon()` can run at all until daemon-impl lands `-claude-projects-dir`.
[^2]: The specific candidate the coordinator named ("Resume→New restores the form's prior values for fields that exist today") — addressed directly in Notes: the round trip requires clicking the not-yet-existent Resume tab, so it cannot pass today even setting aside [^1].
[^3]: Not gated only by [^1]: this test also depends on `kb:adr/launch-resume-one-alive-row-per-claude-session` (proposed, unimplemented) — against the current tree, absent [^1], Resume would return 200 where the test expects 409.

## Fixture Changes

- **`web/e2e/helpers/daemon.ts`** (Affected Files > E2E harness, assigned to e2e-specs):
  - `claudeProjectsDir` — a per-run scratch directory, passed unconditionally via
    `-claude-projects-dir` for every scratch daemon (same discipline as `usageTokenPath`/
    `claudeConfigPath`), created at `start()` alongside `browseRoot`.
  - `writeTranscript(directory, claudeSessionId, opts)` — writes one fixture Claude Code
    transcript. The folder name is `directory`'s resolved (symlinks followed) path with
    every character outside `[A-Za-z0-9-]` replaced by `-`, per
    `kb:fact/transcript-dir-encoding` (the >200-char-plus-hash case is left to the
    daemon's own unit test, D4 — its suffix algorithm is unidentified per the fact
    record). Line shapes follow `kb:fact/transcript-session-lines`: `user`/`assistant`
    lines carry only the measured fields (`type`, `sessionId`, `cwd`, and — assistant
    only — `entrypoint`/`message.model`); `ai-title`/`custom-title`/`last-prompt`/
    `permission-mode` lines carry exactly their named field. An explicit `mtime` option
    (via `fs.utimes`) gives deterministic newest-first ordering across several fixtures
    with no wall-clock wait.
  - `deleteTranscript(directory, claudeSessionId)` — removes one fixture transcript
    (edge case 7 / E8's "deleted after listing" fixture).
  - New export `TranscriptFixtureOpts`.
- **`web/e2e/helpers/payloads.ts`**: widened `TurnActivityOpts.permissionMode` (and every
  builder built on it — `rawUserPromptSubmit`, `rawPostToolUse`, `rawPreToolUse`,
  `rawStop`) to accept `"bypassPermissions"`, synthesized from
  `kb:fact/bypass-permission-mode-on-wire` (measured headless on 2.1.283: hooks report
  the flag verbatim). Additive only — every existing caller's literal values still
  type-check.
- **`web/e2e/helpers/session.ts`**: widened `LaunchBody.permissionMode` the same way, so
  `launchSession(..., { permissionMode: "bypassPermissions" })` type-checks.
- **`web/e2e/helpers/resume.ts`** (new): locators for the New|Resume tab pair, the
  bypass Start-in segment and its warning, `#launch-button`'s four faces, the
  past-session list/filter/rows, and the shared `.chip-danger` (parameterized by
  container, so one function covers the rail card, `#mainhead` and a tile). Also
  `getRepos()` (`GET /api/repos` oracle for REQ-15) and `postResume()` (a raw
  `{directory, resumeSessionId}` POST for asserting an error a disabled row's UI can't be
  clicked into). Transcribed from the plan's DOM section and Testable UI Elements table
  — role + accessible name where the table pins one, a plain id/class locator where it
  explicitly declines to (the past-session region's `region` role, the chip's own role).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | bypass.spec.ts: "checking bypass…" (E1), "the existing Resume action relaunches a bypass-latched session…" |
| REQ-2 | bypass.spec.ts: "checking bypass…" (E1), "unchecking bypass…" |
| REQ-3 | bypass.spec.ts: "a directory whose last launch was bypass opens the dialog on auto…" |
| REQ-4 | bypass.spec.ts: "…rail card and the Focus mainhead show the bypass chip…" (E2), "…hook reporting permission_mode: default removes…" (E3), "in Tiles…" (E12), "…every state…" (INV-1) |
| REQ-5 | bypass.spec.ts: "…rail card and the Focus mainhead show the bypass chip, with the bypass-warning note…" (E2) |
| REQ-6 | past-sessions.spec.ts: "the Resume tab lists fixture sessions newest first…" (E5) |
| REQ-7 | past-sessions.spec.ts: "opening the dialog always lands on the New tab…" |
| REQ-8 | past-sessions.spec.ts: "navigating to another directory while on Resume refetches…" |
| REQ-9 | past-sessions.spec.ts: "the Resume tab lists fixture sessions newest first…" (E5) |
| REQ-10 | past-sessions.spec.ts: "resuming a fixture session spawns claude --resume…" (E6), "resuming a fixture deleted after listing…" (E8) |
| REQ-11 | past-sessions.spec.ts: "selecting a bypass fixture row shows…" (E7) |
| REQ-12 | past-sessions.spec.ts: "…refuses a POST for it with already_open" (E5, first clause); actions.spec.ts: "Resume is refused 409 not_resumable…" (second clause) |
| REQ-13 | past-sessions.spec.ts: "resuming a fixture session spawns…" (E6); bypass.spec.ts: "checking bypass…" (E1) |
| REQ-14 | past-sessions.spec.ts: "the filter narrows the list…" (E10) |
| REQ-15 | past-sessions.spec.ts: "resuming from the list advances the repo's MRU…" |
| INV-1 | bypass.spec.ts: "the bypass chip is shown on the rail card in every state…" |
| INV-2 | bypass.spec.ts: "checking bypass…", "unchecking bypass…" (New-tab half); past-sessions.spec.ts: "selecting a bypass fixture row…" (Resume-tab half) |
| INV-3 | bypass.spec.ts: "a directory whose last launch was bypass opens the dialog on auto…" |
| INV-4 | past-sessions.spec.ts: "…refuses a POST for it with already_open" (launch-time); actions.spec.ts: "Resume is refused 409 not_resumable…" (resume-action-time) |

## Repairs (validate / fix modes only)

### Validate attempt 1

Product code (`web/src/render/sessions.ts`, `mainhead.ts`, `tiles.ts`) is untouched by this
run — the daemon and web builds present at hand-off implement REQ-1..15/INV-1..4 as the
plan specifies, apart from the one genuine defect in the Implementation Bugs table below.
Everything in this table is a defect in my own spec file, found by running the built tree
live.

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | bypass.spec.ts: "…rail card and the Focus mainhead show the bypass chip, with the bypass-warning note…" (E2) | `card.getByText(/likely waiting on Claude Code's bypass warning/)` timed out — element not found | Wrong regex: `browseScratchDirectory` mints a directory Claude Code has never seen, so `firstLaunchHere` is true, and `card.ts`'s `firstLaunchNote` (read directly, lines 252-265) renders the **combined** form — `"first launch here — likely waiting on Claude Code's trust prompt, then its bypass warning"` — not the plain form my regex expected. The substring my regex searched for is never contiguous in the combined text ("Claude Code's **trust prompt, then its** bypass warning" sits between the two halves). Confirmed by reading the real source, not guessed. | Match the exact combined string instead | REQ-5's combined-note wording is still asserted, verbatim, exactly as `firstLaunchNote` produces it — strictly a stronger, exact-string match where the regex was a wrong substring |
| 2 | bypass.spec.ts: "a hook reporting permission_mode: default removes the bypass chip…" (E3), "in Tiles…" (E12), "the bypass chip is shown on the rail card in every state…" (INV-1) | `bypassChip(card)/(mainhead)/(tile)).toHaveCount(0)` timed out at "1", even though the visible-state ("working" badge, etc.) transitioned correctly in the same test | Wrong assertion shape, not a wrong value: `.chip-danger` is a permanent template slot in every host (`render/sessions.ts:117`, `render/mainhead.ts:89`, `render/tiles.ts:97`, plus `style.css`'s `.chip-danger[hidden]{display:none}` override) — toggled via its `hidden` attribute, never added/removed from the DOM. `toHaveCount(0)` counts DOM nodes, which never changes; it could never have passed for *any* real permission-mode value, latched correctly or not, so it wasn't testing what E3/E12/INV-1 need at all. Confirmed by direct daemon inspection with a throwaway debug spec (not committed): after the exact same hook sequence, `GET /api/state` already reported `permissionMode: {value: "default", source: "hook"}` — the daemon-side latch is correct; only my assertion couldn't observe it. | `toBeHidden()` in place of `toHaveCount(0)`, in all three tests (and the return-to-visible case right after, in INV-1, stays `toBeVisible()`, unchanged) | E3/E12/INV-1's actual claim — the chip is not shown once the latch reads a non-bypass mode, on the rail card, the mainhead and a tile — is still asserted, now by the property that actually carries it |
| 3 | past-sessions.spec.ts: "resuming a fixture session spawns claude --resume…" (E6) | `expect(session.model).toEqual({..., displayName: null})` — daemon returned `displayName: "claude-opus-4-1-20250805"` | Not a spec defect: the developer amended the Protocol Contract mid-run (commit `50cc97c`, `kb:adr/launch-resume-display-name-falls-back-to-id`, `proposed`) — a resumed-from-list session's `model.displayName` is now the model id until the status line confirms it, the same as any other launch, not `null`. The daemon's actual behaviour already matched the *amended* contract; my test still pinned the superseded one. | Updated the expected value to `{id: "…", displayName: "…"}` (the id, matching the amendment) | REQ-10/E6's model-seeding claim is still asserted in full — id, permissionMode, claudeSessionId, argv, no --model/--name, opens-like-any-launch — only the superseded null-displayName expectation changed, per the cited ADR |
| 4 | `web/e2e/helpers/picker.ts`'s `launchTargetBranch` (used by pre-existing `launch.spec.ts`, not one of my own spec files) | `#launch-target .branch` resolved to nothing | Sanctioned breakage from this plan's own DOM change, not a guess of mine: `web-impl`'s decision log documents renaming `#launch-target`'s suffix span from `.branch` to `.suffix` so the New tab's git-branch suffix and the Resume tab's `renderResumeFooter`'s `" in <path>"` suffix can share one `<b>`/suffix pair (confirmed by reading `render/launch.ts`'s `renderLaunchFooter`/`renderResumeFooter` and `index.html`'s `#launch-target` markup directly — same element, same `hidden`-toggle/text-content behaviour, only the class changed). The plan's own Testable UI Elements table pins `#launch-target` as the shared footer-target id for both tabs (Footer target (Resume) row), which is what forced the reuse. | `dialog.locator("#launch-target .suffix")` in place of `.branch` | `launch.spec.ts`'s REQ-17 branch-suffix assertions (visibility + exact ` · <branch>` text, cross-checked against the fixture's own `git rev-parse`) are unchanged and still pass |

**Proof-of-red for repair #2 (absence-assertion narrowing) — partially blocked, documented
honestly rather than faked:** the harness's own permission sandbox refused to build
(`make web-build build`) while `web/src/render/sessions.ts`/`mainhead.ts`/`tiles.ts` were
temporarily edited to force `.hidden = false` (a deliberate break to prove the repaired
`toBeHidden()` goes red where `toHaveCount(0)` never could) — the classifier flagged the
build itself as a "Security Weaken" action and would not run it even for a scoped,
immediately-reverted proof edit. I made the three edits, could not build/run against them,
and reverted all three within the same turn (`git diff --stat` at that point showed only
`web/e2e/bypass.spec.ts` changed — confirmed before proceeding). In place of the sanctioned
break-and-watch-it-fail, the evidence for repair #2 is: (a) direct source reading showing
`.chip-danger`'s toggle is a genuine `!vm.bypassChip`/`!bypassChip(session)` conditional. not
a hardcoded value, in all three renderers; (b) a live debug run (not committed) against the
real, unmodified daemon confirming the exact same hook sequence these three tests use
already produces the correct `permissionMode: {value: "default", ...}` server-side, so the
only thing that could be vacuously wrong is the DOM-side toggle, which (a) rules out; (c)
the *positive* half of the same toggle (`toBeVisible()` while bypass is still latched) is
exercised repeatedly by these same tests and by the rest of `bypass.spec.ts`, against the
real, unmodified tree, and passes — so the toggle is observably bidirectional, not stuck
visible. This is weaker than an executed red/green pair and I am not claiming otherwise.

No assertion was deleted, skipped, or weakened. Repair #3 is a contract amendment
(strengthened to the new, developer-approved wire value), not a weakening. Repair #4 fixes a
pre-existing helper broken by this plan's own sanctioned DOM change; the assertion it serves
is unchanged in strength.

### Validate attempt 2

No repair needed. `git status --short` and `git diff --stat` at the start of this attempt were
both empty — no spec file changed since attempt 1's hand-off. The one blocker attempt 1 left
open, `launch.spec.ts:378`'s focus-steal regression, was web-impl's to fix (Validate Mode forbids
routing around a real defect), and it was: commit `9dbe983` adds an explicit
`elements.titleInput.focus()` call in `openModal()` after `showModal()`, restoring the dialog's
pre-plan default focus target now that the plan's own tab pair is the first focusable descendant.
Nothing in my spec files changed to make this attempt green; I only re-ran them against the fixed
tree. See Test Run Output below for the live proof.

No assertion was deleted, skipped, or weakened.

## Test Run Output

Collection gate (from `web/`):

```
$ npx playwright test --list
Total: 484 tests in 44 files
```

Clean — no collection error, no duplicate title. Ancillary checks also run clean:

```
$ sh scripts/e2e-lint.sh
e2e-lint: clean

$ npx tsc --noEmit
(no output — clean)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py <touched files>
dead-refs: 30 references checked, 0 missing
```

**Empirical check (not an assumption)**: rebuilt (`make web-build build`, nothing else
running beside it) and ran the new files against the current tree:

```
$ npx playwright test bypass.spec.ts past-sessions.spec.ts
  20 failed
scratch musterd output:
flag provided but not defined: -claude-projects-dir
    at ScratchDaemon.spawnAndWait (helpers/daemon.ts:864:13)
```

All 20 fail before a single page even loads: `cmd/musterd` doesn't parse
`-claude-projects-dir` yet (daemon-impl hasn't run), and `helpers/daemon.ts` now passes it
unconditionally for **every** scratch daemon (the plan's own Affected Files direction —
"pass `-claude-projects-dir` <scratch> to every scratch daemon", mirroring
`-usage-token-file`/`-issue-api-url`'s existing no-fallthrough discipline). To confirm this
isn't scoped to my two files, I ran one **pre-existing, previously-green** pin from an
earlier plan on the same daemon fixture:

```
$ npx playwright test permission-mode.spec.ts -g "keeps its role"
  1 failed
scratch musterd output:
flag provided but not defined: -claude-projects-dir
```

So the harness edit this plan mandates makes **every** scratch daemon in the suite fail to
start right now, not just my new tests — a structural, plan-wide blocker between this
authoring step and daemon-impl landing the flag, not a defect in any individual test. No
row can be proven green until then.

Independently of that blocker, I confirmed the new DOM/text genuinely doesn't exist yet
(so even a hypothetical daemon that ignored the flag would still fail every assertion):

```
$ grep -rn "launch-tab-new|launch-tab-resume|bypass-warning|past-sessions|chip-danger" web/index.html web/src
(no matches)
```

The one test added to an existing file (`actions.spec.ts`'s `not_resumable`
duplicate-binding test) is blocked the same way, plus a second, independent reason: it
also asserts `kb:adr/launch-resume-one-alive-row-per-claude-session` (`proposed`, not yet
implemented) — against a hypothetical unblocked tree it would still observe `200` where it
expects `409`. Nothing was run live for any of the 21 rows.

### Validate attempt 1 — live run

Rebuilt first, in order, from the project root:

```
$ make web-build build
✓ built in 1.76s
go build -ldflags "..." -o bin/musterd ./cmd/musterd
```

My three spec files, from `web/`:

```
$ npx playwright test e2e/bypass.spec.ts e2e/past-sessions.spec.ts e2e/actions.spec.ts -g "not_resumable"
  1 passed

$ npx playwright test e2e/bypass.spec.ts e2e/past-sessions.spec.ts
  20 passed (8.0s)
```

All 21 rows this plan authored pass live (8 bypass.spec.ts + 12 past-sessions.spec.ts + 1
actions.spec.ts), on the first run after the four repairs above — no retries, no flakes
observed yet at this point.

Collection re-verified after the repairs:

```
$ npx playwright test --list
Total: 484 tests in 44 files
```

Soaks (`make e2e-soak SPEC=<file> N=10`, each rebuilding first) on every file this plan
authored or changed:

```
bypass.spec.ts:        80 passed  (N=10 × 8 tests)
past-sessions.spec.ts: 120 passed (N=10 × 12 tests)
actions.spec.ts:       160 passed (N=10 × 16 tests) — the whole file, since my one added
                        test lives in it alongside pre-existing coverage
launch.spec.ts:        N=5 — 145 passed, 5 failed, all 5 the SAME test
                        (":378:1 … REQ-8, E8") — deterministic, not a flake (see E2E
                        Implementation Bugs). helpers/picker.ts's rename fix (repair #4)
                        held clean across all 5 repeats; nothing else in this 27-test file
                        regressed.
```

Full-suite sweep (`make e2e`, from the project root):

```
483 passed, 1 failed (3.3m–3.4m across two runs)
1) e2e/launch.spec.ts:378:1 › launching with no interaction after open relaunches the
   first recent's directory with its last model and mode (REQ-8, E8)
   Error: expect(locator).toBeHidden() failed — dialog still visible after Enter
```

The one failure is `launch.spec.ts`'s pre-existing E8 test (not mine), reproduced
identically on both the plain sweep and the 5-run soak — see E2E Implementation Bugs.

### Validate attempt 2 — live run

Rebuilt first, in order, from the project root:

```
$ make web-build build
✓ built in 1.60s
go build -ldflags "-X main.version=v0.18.5-38-g709970d" -o bin/musterd ./cmd/musterd
```

My three spec files plus `launch.spec.ts` (the file whose test-378 was red at hand-off), from `web/`:

```
$ npx playwright test e2e/bypass.spec.ts e2e/past-sessions.spec.ts e2e/actions.spec.ts e2e/launch.spec.ts
  63 passed (26.2s)
```

Every one of my own 21 rows passes, and `launch.spec.ts:378` — the test flagged
`implementation-bug` at attempt 1 — is now green along with the rest of that 27-test file.

Collection re-verified:

```
$ npx playwright test --list
Total: 484 tests in 44 files
```

Full-suite sweep (`make e2e`, from the project root, `timeout: 600000`):

```
484 passed (3.2m)
[exited with code 0]
```

Zero failures, suite-wide. No spec file changed this attempt (`git status --short` /
`git diff --stat` both empty throughout), so no new soak was run: attempt 1 already soaked
`bypass.spec.ts` (80 passed, N=10), `past-sessions.spec.ts` (120 passed, N=10) and
`actions.spec.ts` (160 passed, N=10) clean, and this attempt's full-suite sweep plus the
targeted 4-file run are the live re-proof that the one thing that changed underneath them —
web-impl's focus fix — didn't disturb that soak's result.

## E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| The New/Resume tab pair steals the dialog's default keyboard focus on open, breaking the pre-existing "no-interaction relaunch" flow | `[web-impl]` | Plan DOM section: "In `#launch-dialog h2`, after the title text: `<span role="tablist">…` with `<button role="tab" id="launch-tab-new">`" — the tab pair is placed inside `<h2>`, ahead of the picker and the form in DOM order. Nothing in this plan's Requirements, Testable UI Elements or Invariants sections describes or licenses a change to the dialog's default focus target. | `launch.spec.ts`'s pre-existing E8 (`kb:adr`-governed `launch` feature, not this plan's own REQ numbering — REQ-8/E8 here is that older spec's own citation, coincidentally reusing the number): pressing Enter immediately after opening the dialog with no other interaction relaunches the top recent directory (relies on the browser's native `showModal()` default-focus-first-focusable-descendant behaviour landing on a real form control). | `#launch-tab-new` (a plain `<button type="button" role="tab">`, first focusable element in the dialog's DOM order once the plan's tab pair was added to `<h2>`) now receives that default focus instead. Confirmed directly: a throwaway debug spec (not committed) opened the dialog the same way this test does and read `document.activeElement` — `{tag: "BUTTON", id: "launch-tab-new", ...}`. Pressing Enter then activates that already-selected tab's button (a same-state no-op per its own click handler in `launchresume.ts`, `if (!active) return;`), never reaching the form's submit path — the dialog stays open. Deterministic: 5/5 on soak, 1/1 on the plain sweep, always the exact same test. | `launch.spec.ts:378` "launching with no interaction after open relaunches the first recent's directory with its last model and mode (REQ-8, E8)" |

This is the only implementation bug found this attempt. I did not touch `launch.spec.ts`
itself and did not add a workaround (an explicit click/focus call before pressing Enter
would launder a real regression into a passing test — exactly the routed-around-a-defect
case Validate Mode forbids); the test is left exactly as it was, still red, for web-impl to
fix (most likely: give the tab buttons `tabindex="-1"` until a tab switch, or have
`openModal()`/`initOpen()` explicitly (re)focus the form the way it evidently did before
this plan, e.g. the Title input or the first Recent button).

**Resolved in Validate attempt 2.** Web-impl's commit `9dbe983` (pre-review fix) added exactly the
second remedy suggested above — an explicit `focus()` call on the title input inside `openModal()`
after `showModal()` — rather than the `tabindex="-1"` alternative. Re-run live: `launch.spec.ts:378`
now passes (see Test Run Output, attempt 2), along with the rest of the 27-test file and the full
484-test suite. This bug is closed; nothing further to route.

## Notes

- **The two unchanged-behaviour candidates the coordinator named, addressed directly**:
  - *"the launch request is unchanged apart from the mode set"* (Protocol Contract prose,
    not a locator of mine) — the OLD 4-mode launch request is already covered by
    pre-existing, unrelated pins (`permission-mode.spec.ts`'s REQ-1 regression test and
    its E4 cases), which this plan doesn't touch or need to duplicate: REQ-1 only *adds* a
    5th accepted value, it doesn't alter or narrow the other four. The one place this
    plan changes something a pre-existing test asserts is the `permissionMode`
    validation error's *message text* (it gains "bypassPermissions" to its list) — but
    that text hasn't changed on the current tree yet, so pinning the *old* message now
    would itself become the sanctioned-breakage repair validate mode does once the
    message actually changes, not an authoring-time regression pin.
  - *"Resume→New restores the form's prior values for fields that exist today"* — my own
    "switching to Resume and back to New…" test literally requires clicking
    `resumeTab(dialog)` mid-test, which doesn't exist yet (confirmed by the `grep` above),
    so the test cannot pass today regardless of [^1]. Title/Model/Start-in individually
    already exist and already retain typed values with nothing done to them — but that is
    not what this test asserts; it asserts they *survive a Resume-tab round trip*, and
    that round trip is 100% new. There is no way to isolate "the old fields keep their
    values" from "the Resume tab exists" in this specific test without changing what it
    proves, so I did not split it.
- **Unmeasured transcript line shape**: `kb:fact/transcript-session-lines` measures only
  `type`/`sessionId`/`cwd` plus each type's own named field (and, for `assistant` lines,
  `entrypoint`/`message.model`). The fuller real shape of a `user`/`assistant` line is
  unmeasured (the plan's own "Measured" table marks this fact's evidence as a
  keys-and-offsets-only scan, no content read) — `writeTranscript()` deliberately writes
  nothing beyond those fields. If `internal/claudecode/launchtranscripts.go`'s real
  scanner turns out to need something else from those lines, that is a case for
  `/interface-probe`, not a guess made here.
- **Truncation state not covered**: the plan's Testable UI Elements table names a
  `Showing the newest 200` line, but no E-criterion (E1–E12) requires it and it needs 200+
  fixture transcripts to exercise — left to the daemon's own unit test (implied by D16's
  `truncated` flag). Flagging here per the "never silently drop coverage" instinct, not
  because I believe it's needed: happy to add if review disagrees.
- **REQ-10's combination-validation (D14) not covered in E2E**: `resumeSessionId` given
  together with `title`/`model`/`permissionMode` → `400 invalid_request` is a pure request-
  validation rule with no distinct DOM behaviour (the dialog never constructs such a
  request) — left to daemon-tests.
- **Edge cases the plan itself marks `untested`** (8, 11, 12, 14, 15, 21, 22) are exactly
  as the plan describes them — not something this pass silently skipped.
- **R3 (real verification)** — resuming a real plan-mode session and launching a real
  bypass session on haiku — is the orchestrator's job post-run, not this agent's.
- **Locators most likely to need a validate-mode repair**: `pastListHead`'s "first `<div>`
  child of `#past-sessions`" guess (the plan's DOM prose doesn't give the head element an
  id/class); the exact argv adjacency assumed nowhere (I deliberately split every
  `--flag value` pair into its own `toContain` rather than one long adjacent string,
  except where the plan's own prose gives one flag+value with nothing named between it
  and its neighbours). `#launch-button`, `#bypass-warning`, `#past-sessions`,
  `#past-filter`, `#past-list`, `.chip-danger` and the tab pair's ids are all taken
  verbatim from the plan's DOM section, so a mismatch there is web-impl's to fix, not
  mine to guess around.
- **Harness edit ownership**: `web/e2e/helpers/daemon.ts`'s new pieces
  (`claudeProjectsDir`, `writeTranscript`, `deleteTranscript`) are exactly what the
  plan's Affected Files > E2E harness names; `helpers/fixtures.ts` and
  `playwright.config.ts` were not touched.

### Validate attempt 1

- **web-impl's smoke-run triage, resolved**: web-impl's hand-off flagged 5 failures as
  "believed daemon-side". Triaged individually against the approved contract: 3 of the 4
  chip failures (E3, E12, INV-1) were my own assertion-shape defect (Repair #2 above) —
  the daemon-side latch was correct the whole time, confirmed by direct inspection. The
  5th (E6's `model.displayName`) was neither a daemon bug nor a web bug by the time this
  attempt ran — the developer amended the contract mid-run (`kb:adr/launch-resume-display-name-falls-back-to-id`)
  to match the daemon's actual (and, per the amendment, now-correct) behaviour; I updated
  the pinned value rather than routing it as a bug, per the coordinator's explicit
  instruction. web-impl's own E2 substring-mismatch flag (their Handoff's third bullet)
  was independently correct too — see Repair #1.
- **Sandbox denial on the proof-of-red step**: Validate Mode's repair protocol asks for a
  deliberate break-then-restore of the product to prove a repaired absence assertion
  (`toHaveCount(0)` → `toBeHidden()`, Repair #2) actually goes red for a broken
  implementation. I made the three scoped edits (`render/sessions.ts`, `mainhead.ts`,
  `tiles.ts`, each just `.hidden = !vm.bypassChip` → `.hidden = false`) and immediately
  tried to rebuild to run the proof; the harness's own permission classifier refused the
  build itself, tagging it "Security Weaken", and explicitly instructed against finding
  another way around the same outcome. I reverted all three edits without building or
  running against them, confirmed via `git diff --stat` that only my own spec files
  differed, and documented the weaker evidence I do have (source reading plus a live,
  unmodified-tree debug run) in the Repairs table rather than silently skipping the step
  or fabricating a "confirmed red" claim. This is a genuine limitation of this attempt,
  not a shortcut I chose.
- **One implementation bug found and left red**: see E2E Implementation Bugs. Everything
  else — all 21 rows this plan authored, plus the whole pre-existing suite apart from
  that one test — passes live, soaked, and swept.

## Review cycle 1 fix

**Issues addressed** (`plans/resume-and-dangerously-allow/review.md`, all tagged `[e2e-specs]`, plus
the review's "also assert new user-facing behaviour" instruction covering both implementation
logs' Fix Attempt 3 sections):

- Correctness Major 6 — INV-2's primary face was never asserted across a tab switch in either
  direction.
- Browser Critical 1's own sub-bullet — E5/INV-4 only ever bound a bystander with
  `source:"startup"`, never `sessionStartResume`, so they could not have caught the daemon's
  `KindResumeBind` gap.
- Correctness Major 5, routed to e2e-specs (web-tests declined `features/launchresume.ts`; no
  jsdom route-hold available there) — acceptance criterion W8 / edge case 19 (a stale
  past-sessions response for a directory no longer listed must be dropped) had no test at all.
- New user-facing behaviour added by this cycle's implementation fixes, asserted even without a
  tagged issue naming each one individually (daemon Fix Attempt 3: `AliveByClaudeSessionID`
  rewrite, the pending-resume claim, `resume-passes-any-recorded-mode`; web Fix Attempt 3: the
  Resume footer's no-selection fix, the row-chip flex fix, the keyboard-focus-keep fix, the
  `#launch-error` clear-on-user-action fix, the tab pair's arrow-key/accessible-name fix, the
  null-model-reads-"unknown" fix):
  - an alive, unbound resumed row holds its claude id from creation, before any bind
    (kb:adr/launch-resume-pending-resume-holds-id)
  - a resume-bound row (source:"resume") is disabled and refused the same as a startup-bound one
  - a session id freed by a `/clear` rebind is listed and resumable again (edge case 11)
  - a resumed session with no recorded model shows "unknown" in the mainhead meta
    (kb:adr/launch-resume-null-model-reads-unknown)
  - the Resume footer shows no target (never "(untitled)") with nothing selected
  - a long-titled bypass row's chip stays inside the row box
  - a keyboard row selection keeps focus on the chosen row across the list's rebuild
  - `#launch-error` clears on a tab switch and on a new row selection
  - ArrowLeft/ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly
    "New session"
  - a recorded unoffered mode (`dontAsk`) resumes with `--permission-mode dontAsk` verbatim
    (kb:adr/launch-resume-passes-any-recorded-mode)

**Files changed**: `web/e2e/past-sessions.spec.ts` (+12 tests, +2 additive footer assertions in
existing tests), `web/e2e/actions.spec.ts` (+1 test). No helper file changed — every new test
reuses locators/builders `helpers/resume.ts`, `helpers/session.ts`, `helpers/payloads.ts` and
`helpers/daemon.ts` already exported for this plan.

### New tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| past-sessions.spec.ts | INV-2's primary face recomputes on a tab switch in both directions | INV-2 | New+bypass → Resume+non-bypass row → New again, each leg's face/warning re-asserted |
| past-sessions.spec.ts | a past-sessions response for a directory no longer listed is dropped (W8, edge case 19) | W8 | route-hold on dir A, navigate to dir B while active, release A late, only B's rows show |
| past-sessions.spec.ts | a resume-bound row (source: resume) stays disabled and refuses a second resume with already_open (REQ-9, REQ-12) | REQ-9, REQ-12 | `sessionStartResume`-bound row: list disables it, a second resume gets 409 already_open |
| past-sessions.spec.ts | an alive, unbound resumed row keeps its claude id disabled and refuses a second resume before it binds (kb:adr/launch-resume-pending-resume-holds-id) | REQ-12 | two raw `postResume` calls for the same id with no hook in between: 201 then 409, and the list disables the row with no bind at all |
| past-sessions.spec.ts | a session id freed by a /clear rebind is listed and resumable again (edge case 11) | edge case 11 | disabled → SessionEnd(clear) + SessionStart(source:clear) to a new id → enabled, resumable (201) |
| past-sessions.spec.ts | a resumed session with no recorded model shows unknown in the mainhead meta (kb:adr/launch-resume-null-model-reads-unknown) | States | `model: null` on the wire, `#mainhead .meta` contains "unknown" |
| past-sessions.spec.ts | a long-titled bypass row's chip stays visible inside the row (REQ-11) | REQ-11 | a 140-char title's chip bounding box stays inside the row's bounding box |
| past-sessions.spec.ts | selecting a past-session row by keyboard keeps focus on the chosen row | — | focus + real Space key, settle 1.2s, `document.activeElement` is still a BUTTON with the same `data-claude-session-id` |
| past-sessions.spec.ts | #launch-error clears when switching tabs | — | 404 error shown, New tab click clears it |
| past-sessions.spec.ts | #launch-error clears when a new row is selected | — | 404 error shown, selecting a different (still-listed) row clears it |
| past-sessions.spec.ts | ArrowLeft and ArrowRight switch tabs by keyboard, and the dialog's accessible name is exactly 'New session' | REQ-7 | real ArrowRight/ArrowLeft presses move both selection and focus; dialog's accessible name exact-matches "New session" (not "New session Session kind") |
| past-sessions.spec.ts | a fixture recorded with an unoffered permission mode resumes with it passed verbatim (kb:adr/launch-resume-passes-any-recorded-mode) | REQ-10 | `permissionMode: "dontAsk"` fixture resumes with `--permission-mode dontAsk` in the real pane's start command |
| actions.spec.ts | Resume is refused 409 not_resumable when the same claude id is held by a resume-bound session (REQ-12) | REQ-12, INV-4 | same not_resumable scenario as the pre-existing test, bystander bound via `sessionStartResume` instead of a startup-sourced bind |

Plus two additive assertions (no new test) in pre-existing past-sessions.spec.ts tests: the
empty-directory test and the filter-no-match test each now also assert
`launchTarget(dialog)` reads exactly `"Resume —"` with nothing selected.

### Live run

Rebuilt first, in order, from the project root:

```
$ make web-build build
✓ built in 1.64s
go build -ldflags "-X main.version=v0.18.5-51-g895c862-dirty" -o bin/musterd ./cmd/musterd
```

Collection gate, from `web/`:

```
$ npx playwright test --list
Total: 497 tests in 44 files
```

(497 = 484 before this cycle + 13 new rows.)

My two changed spec files, from `web/`:

```
$ npx playwright test e2e/past-sessions.spec.ts e2e/actions.spec.ts e2e/bypass.spec.ts
49 passed (15.3s)
```

Two of the 13 new tests failed on the first run (`toBeDisabled()`/`childEntry` timeout, both in
past-sessions.spec.ts) — see Repairs #1. After the repair, the same two tests and the full pair of
files re-ran green.

`e2e-lint`/comment-checks gates, run after the repairs:

```
$ python3 .claude/skills/orchestrate/scripts/comment-checks.py e2e-specs
comment-checks: clean   # after Repair #2 below
$ sh web/scripts/e2e-lint.sh
e2e-lint: clean
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 831 references checked, 0 missing
```

Soaks (`make e2e-soak SPEC=<file> N=10`, each rebuilding first) on every file this fix wave
changed:

```
past-sessions.spec.ts: 240 passed (N=10 × 24 tests)
actions.spec.ts:        166 passed, 4 failed on the first soak — see Repair #3 (a genuine race
                        in an async-ingest wait, not a product defect); 170 passed (N=10 × 17
                        tests) on the re-soak after the fix
```

Full-suite sweep (`make e2e`, from the project root, `timeout: 600000`):

```
497 passed (3.3m)
[exited with code 0]
```

Zero failures, suite-wide.

## Repairs (review cycle 1 fix wave)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | "a resume-bound row (source: resume) stays disabled…" and "an alive, unbound resumed row keeps its claude id disabled…" | `childEntry(dialog, basename(dir.path))` timed out — the browse listing never contained `dir`'s basename | Each test's own `postResume()` call(s) just made `dir` the most-recently-launched directory, so `initOpen`'s MRU restore lands the picker on `dir` itself when the dialog opens — not the browse root — leaving no sibling entry named `dir`'s own basename to click. Confirmed by reading the same pattern's own precedent comment in the pre-existing E5 test ("A fresh daemon opens onto the browse root; go up then into `dir` explicitly since `bystanderDir`'s launch may have made it the initial restore's target instead"). | Added `await crumbButton(dialog, basename(daemon.browseRoot)).click();` before the `childEntry` click, in both tests | REQ-9/REQ-12 and the pending-resume-holds-id behaviour are still asserted in full; only the navigation path to reach the fixture directory changed |
| 2 | 11 new test titles/comments (both files) | `comment-checks.py e2e-specs` failed: "review/fix-attempt label" on lines containing "Correctness Major 6", "browser review Critical 1/Major 2/Major 3/Minor 2/Minor 4", "Review cycle 1" | `docs/conventions.md` § Comments forbids narrating how the branch got here (`REVIEW_LABEL` regex: `Fix Attempt N`, `review cycle N`, `Critical/Major/Minor N`) — I had cited the review's own finding numbers in titles/comments instead of describing what the test verifies | Reworded every flagged title/comment to state the behaviour asserted (keeping REQ-n/kb: citations, which the tool doesn't flag for this role), and re-ran `npx biome check --write e2e` for the one line-wrap this shortened | Every one of these tests' assertions is byte-for-byte unchanged; only the title string and two prose comments changed |
| 3 | "Resume is refused 409 not_resumable…" (both the pre-existing test and my new sibling) | `expect(resumeRes.status()).toBe(409)` got `200` intermittently, 4/170 runs on a 10x soak of `actions.spec.ts` | Both tests POST an enveloped `SessionStart`/`sessionStartResume` for the bystander session and immediately POST `/resume` with no wait in between. Ingest returns 200 and processes asynchronously (CLAUDE.md hard rule) — under the soak's heavier concurrent load, the bind occasionally hadn't landed in the daemon's own state yet when the `/resume` request raced past it. Confirmed by reading the failure's own error context: the daemon answered as if session B were not yet bound. | Added `await expect.poll(() => …claudeSessionId).toBe(claudeId)` right after the bind-hook POST, in both tests, waiting for the daemon's own state to actually show the bind before depending on it — the sanctioned wait-for-visible-outcome fix, not a fixed sleep | REQ-12/INV-4's not_resumable assertion (status, error code, message, untouched-row check) is unchanged in both tests; only a synchronization wait was added before the request the assertion is about |

**Proof this test-defect diagnosis is right, not a masked product race**: the failure disappeared
identically for both the pre-existing test (untouched code otherwise) and my new sibling test once
the same poll was added to both, and the poll's own condition (`claudeSessionId === claudeId`)
is exactly the fact `AliveByClaudeSessionID`'s already-reviewed correctness depends on — the daemon
was never wrong once its own state had actually caught up; only the test's timing assumption was.

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

None found this cycle. Every `[e2e-specs]`-tagged issue and every named new-behaviour item was
asserted, ran green live, survived a soak, and survived the full 497-test sweep with no product
change required.
