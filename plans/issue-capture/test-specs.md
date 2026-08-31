# E2E Test Specs: issue-capture

**Plan**: issue-capture
**Mode**: fix (review cycle 2, wave 3)
**Verdict**: pass
**Tests created**: 13 (10 original + 3 review-cycle-1 wave; 0 new this wave, 1 assertion repointed to sanctioned copy)
**Live run**: 13/13 passing (own file); 174/174 passing (full suite sweep)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/issue-capture.spec.ts | the Issue button is visible in both Focus and Tiles | REQ-1 | Masthead button visible + opaque in both views |
| web/e2e/issue-capture.spec.ts | sentinel title/directory/last-assistant-message never leak into the preview, the capture response, or the posted GitHub body, with bystander sessions present | E1, INV-1 | Sentinels in title/directory/`Failure.Message`, plus two bystander sessions' data, absent from `snapshot`, `snapshotMarkdown`, `#issue-preview` and the fake GitHub POST body; the allowlisted `failure.error` token and the focused session's own `tmuxTarget` are positively present (independent-oracle equality, not substring guess) |
| web/e2e/issue-capture.spec.ts | the preview text at submit time is byte-identical to the body the fake GitHub receives, for an empty note and no sessions | E2, INV-2, Edge Case 15 | Dashboard-scope, zero-sessions capture; `#issue-preview` text equals the fake GitHub POST's `body` field exactly; no `## What happened` section when the note is empty |
| web/e2e/issue-capture.spec.ts | the preview text at submit time is byte-identical to the body the fake GitHub receives, for a note with backticks, a fence, a pipe and `</details>`, typed via real keystrokes | E2, INV-2 | Same byte-identity check for a session-scoped capture with an adversarial note, typed with `pressSequentially` (real per-key events, not `.fill()`); live update asserted mid-flow before Submit |
| web/e2e/issue-capture.spec.ts | filing succeeds against the fake GitHub server — Submit disables while the POST is in flight, the success line reads `Filed <owner>/<repo>#<n>` linked to the returned URL, and Close dismisses the dialog | E3, REQ-8, REQ-9, REQ-19 | Hold/release on the fake GH response proves Submit is disabled in flight; success panel text/link/href; Submit+Cancel hidden, Close visible; `Authorization`/`Accept`/`X-GitHub-Api-Version` headers the daemon must send; Close actually closes the dialog |
| web/e2e/issue-capture.spec.ts | a fake GitHub 403 leaves the dialog open with the form intact, shows the alert and selectable detail carrying `issue_post_failed`, re-enables Submit, and the fake token never appears in the daemon's log | E4, REQ-10, INV-3 | Error alert text, `#issue-error-detail` pattern, title value preserved, Submit re-enabled, dialog stays open; daemon log grepped for the fake bearer token |
| web/e2e/issue-capture.spec.ts | a dashboard-scope capture (`— none (dashboard only) —` selected) posts a body whose table has no session rows | E5 | Session present but dashboard scope explicitly selected via the Session `<select>`; `snapshot.session` absent, no `state`/`tmux`/`model` table rows, no leak of the bystander session's `tmuxTarget`, in both the capture response and the posted body |
| web/e2e/issue-capture.spec.ts | killing the daemon disables the Issue button and closes an open dialog; reconnecting re-enables it | E6, REQ-13 | Dialog open at kill time closes; button disables; on restart the banner clears, the button re-enables, and the dialog does NOT reopen itself |
| web/e2e/issue-capture.spec.ts | a session with no context yet renders unknown in the preview, never 0% | E7, REQ-12, Edge Case 16 | No status line at all; capture response's `session.context` is `null`; preview's context row reads literal `unknown`; no `0%` anywhere in the preview. (Retitled in validate attempt 1 — see Repairs: the `model`-null half was an unreachable fixture, dropped, and is covered instead by the daemon's `TestRenderSnapshotMarkdown_UnknownRendering`.) |
| web/e2e/issue-capture.spec.ts | Submit stays disabled until a non-whitespace title is entered via real keystrokes, disables again for whitespace-only, and Cancel closes the dialog | REQ-6, Edge Case 20 | Client-side Submit gating driven by `pressSequentially` (real keyboard), then a whitespace-only `.fill()` re-disables it; Cancel closes the dialog |

## Fixture Changes

- **`web/e2e/helpers/ghapi.ts`** (new) — `FakeGitHubAPI`: a `node:http` server modelled on `helpers/usageapi.ts`'s `FakeUsageAPI`. Records every request's method/path/headers (`authorization`, `accept`, `x-github-api-version`)/parsed JSON body; `setResponse(status, body?)`; `hold()`/`release()` for the in-flight-disabled window (mirrors `FakeUsageAPI`); a default auto-incrementing 201 body when the caller doesn't pin one. Also exports `FAKE_GH_TOKEN` (a fixed, distinctive string, same pattern as usage-model-bar's `FAKE_TOKEN`) and `issueTokenFileContent(token?)` — the plain-text (not JSON) `-issue-token-file` content, per REQ-14's "trimmed contents of the file are the token" (deliberately unlike `-usage-token-file`'s JSON shape). No shape here is a Claude-Code wire capture — this plan carries forward no measurement from `spikes/`; the shapes are the plan's own Protocol Contract (`{title, body}` request; `{number, html_url}` response fields the daemon reads) and GitHub's documented headers, which the plan pins directly.
- **`web/e2e/helpers/issue.ts`** (new) — locator helpers for `#issue-dialog`, built from the plan's DOM snippet and Testable UI Elements table: role+name locators where the table pins one (`issueButton`, `issueDialog`, `issueSessionSelect`, `issueTitleInput`, `issueNoteTextarea`, `issueSubmitButton`, `issueCancelButton`, `issueCloseButton`, `issueSuccessStatus`, `issueSuccessLink`, `issuePreviewHeading`), and CSS/testid locators where the table leaves the element role-less (`issuePreview` via `[data-testid="issue-preview"]`, `issueCapturedAt`, `issueErrorDetail`) or explicitly not pinned per-option (`issueSessionOptions`). `openIssueDialog`/`openIssueDialogAndCapture` (the latter lives in the spec file, not this helper, since it needs the daemon's `baseURL` to match the triggered `POST /api/issue/captures`).
- **`web/e2e/helpers/daemon.ts`** (edited, per Affected Files > E2E) — REQ-17's harness discipline:
  - New exported constant `ISSUE_REPO_FIXTURE = "muster-e2e/fake-repo"`, always passed via `-issue-repo` for every scratch daemon — deliberately not the daemon's production default (`Zalaras/muster`), so no scratch run's response can be mistaken for the real repo and tests get a fixed string to assert against.
  - New `startIssueDenyStub()`: a per-run `node:http` server that 403s every request with `{"message":"e2e: no fake GitHub configured for this test"}` — started automatically whenever a `ScratchDaemonOptions.issueApiURL` isn't supplied, closed in `teardown()`.
  - `ScratchDaemon` gains `issueTokenPath` (readonly, always `join(dataDir, "issue-token.txt")`) and `issueApiURL` (readonly, resolved at `start()` — either the caller's `FakeGitHubAPI.baseURL` or the deny stub's URL).
  - `spawnAndWait()` now passes `-issue-api-url`, `-issue-token-file`, and `-issue-repo` **unconditionally**, mirroring the existing `-usage-token-file` discipline — no scratch daemon in this suite (this file or any other, including every pre-existing spec) can reach a real GitHub host or execute `gh`.
  - New `ScratchDaemonOptions` fields: `issueApiURL?: string`, `issueTokenContent?: string` (written to `issueTokenPath` before spawn when given; omitted leaves the file absent, safe for any test that never calls `POST /api/issues`).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | "the Issue button is visible in both Focus and Tiles" |
| REQ-2 | "a dashboard-scope capture … posts a body whose table has no session rows" (option count assertion + explicit scope switch) |
| REQ-6 | "Submit stays disabled until a non-whitespace title is entered …" |
| REQ-7 | both E2 tests (live preview update, including a mid-flow assertion before Submit) |
| REQ-8 | "filing succeeds against the fake GitHub server …" (headers) |
| REQ-9 | "filing succeeds against the fake GitHub server …" (success panel, Close) |
| REQ-10 | "a fake GitHub 403 leaves the dialog open …" |
| REQ-12 | "a session with no context or model yet renders unknown …" |
| REQ-13 | "killing the daemon disables the Issue button and closes an open dialog …" |
| REQ-14, REQ-17 | `web/e2e/helpers/daemon.ts` (harness edit, not a spec test — proven by the `E8` grep below and by every other test in the file running against the unconditional flags) |
| REQ-19 | "filing succeeds against the fake GitHub server …" (hold/release in-flight disable) |
| REQ-20 | "the preview text at submit time is byte-identical … for an empty note and no sessions" (`#issue-captured-at` non-empty) |
| E1 / INV-1 | "sentinel title/directory/last-assistant-message never leak …" |
| E2 / INV-2 | both "the preview text at submit time is byte-identical …" tests |
| E3 | "filing succeeds against the fake GitHub server …" |
| E4 | "a fake GitHub 403 leaves the dialog open …" |
| E5 | "a dashboard-scope capture … posts a body whose table has no session rows" |
| E6 | "killing the daemon disables the Issue button and closes an open dialog …" |
| E7 | "a session with no context or model yet renders unknown …" |
| E8 | Not a spec test — verified by the grep in Automated Checks. Confirmed clean during authoring (see Notes). |
| INV-3 | "a fake GitHub 403 leaves the dialog open …" (log grep for the fake token) |
| INV-4 | Not separately tested — the plan's own daemon-side D11 unit test owns this; no E2E acceptance id names it and reproducing "capture, then drive a state transition via hooks, then file" adds little beyond what D11 already proves server-side. Flagged here rather than silently skipped. |

## Repairs (validate / fix modes only)

N/A — authoring mode.

## Test Run Output

Not run — authoring mode. Collection gate only:

```
$ npx playwright test --list
... (171 tests across 16 files, issue-capture.spec.ts contributing 10)
Total: 171 tests in 16 files
$ echo $?
0
```

TypeScript (`npx tsc --noEmit -p .`) is also clean across the new/edited files.

Automated-check dry run (E8's own grep, run against `web/e2e/` after authoring):

```
$ rg -n "api\.github\.com" web/e2e/
(no matches — exit 1)
$ rg -q -- '-issue-api-url' web/e2e/helpers/daemon.ts && echo present
present
$ rg -q -- '-issue-token-file' web/e2e/helpers/daemon.ts && echo present
present
```

## Notes

- **My own explanatory comments first tripped E8's grep.** While documenting why the
  deny stub and the unconditional flags exist, I wrote the literal string
  `api.github.com` several times in comments in both `daemon.ts` and the new `ghapi.ts`
  — which the plan's own `E8` check (`! rg -n "api\.github\.com" web/e2e/`) would have
  failed on, since it scans comments, not just code. Reworded every occurrence to "the
  real GitHub API host" before finishing; re-verified with the exact grep the Automated
  Checks block specifies (see above).
- **`ISSUE_REPO_FIXTURE`, not the daemon's production default.** REQ-17's Affected Files
  note says the harness passes `-issue-repo` "plus" the other two flags, but doesn't pin
  a value. I chose a fixed, obviously-fake identifier (`muster-e2e/fake-repo`) over the
  daemon's own default (`Zalaras/muster`) so no scratch response can read as the real
  repo, and so tests have a stable string to assert `Filed <owner>/<repo>#<n>` against
  without coupling to a production default that could change. If review or web-impl
  wants exact parity with `Zalaras/muster` for some reason, that's a one-line constant
  change in `daemon.ts`.
- **No test drives INV-4 (capture immutability across a state transition) end-to-end.**
  The plan's D11 daemon unit test already asserts this precisely ("a capture taken
  before a state transition, filed after it, carries the pre-transition state"), and no
  E1-E8 acceptance id in the plan's own E2E section names it. Reproducing it here would
  mean: capture, drive a hook-based state transition, then file, then diff the posted
  body against the pre-transition capture — a legitimate test, but redundant with a
  daemon-side unit test that already isolates the exact same claim with less machinery.
  Flagging this explicitly rather than silently leaving it uncovered, per this agent's
  own instructions on when a gap is a judgment call vs. an omission.
- **Session-option label text is deliberately not asserted.** The plan's Testable UI
  Elements table pins the dashboard-scope option's exact text but leaves per-session
  option labels to `e2e-specs`' call. Rather than guess a label format (title vs.
  "untitled" vs. something else) and risk a locator that can never match real markup, I
  rely on `focusedId`'s documented default-selection behavior (clicking a session card
  sets `focusedId`, and the dialog preselects it — `main.ts`) plus an independent-oracle
  check (`snapshot.session.tmuxTarget === session.tmuxTarget`, the real API response) to
  prove the right session was captured, and use `selectOption({ label:
  DASHBOARD_SCOPE_OPTION_TEXT })` only for the one option the plan does pin. Validate
  mode should confirm this still holds against the real markup; if `web-impl` ships a
  per-session label worth asserting, that's an easy follow-up, not a defect.
- **`FakeGitHubAPI`'s recorded path/method are captured but not asserted** in any test
  yet (only headers and body are). Left in the helper for validate/fix mode in case a
  review issue wants the exact `POST /repos/{owner}/{repo}/issues` path checked against
  `ISSUE_REPO_FIXTURE`.
- Every test in this file starts (and tears down) its own `ScratchDaemon`/`FakeGitHubAPI`
  pair — the capture store and the `-issue-api-url` binding are both daemon-global, and
  several tests reconfigure the fake GitHub response mid-test, which would race under
  this config's `fullyParallel: true` if shared (same rationale `usage-model.spec.ts`
  documents for its own `withUsageDaemon`).

## Validate Attempt 1

**Rebuild**: `make web-build build` from the project root — both steps exited 0 (`tsc --noEmit && vite build` clean, then `go build` embedding the freshly-built `internal/webui/assets`).

**Collection gate**: `npx playwright test --list` from `web/` — clean both before and after my one repair, 171 tests in 16 files (unchanged count; my repair edited an existing test's title/body, added none).

**Live run**: `npm run e2e -- e2e/issue-capture.spec.ts` — 7/10 passing after 2 runs (1 repair applied between runs; the 3 that still fail are a real implementation defect, not a locator problem, so I stopped rather than burning a 3rd run against the same bug).

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | "a session with no context or model yet renders unknown in the preview, never 0%" (E7) | `expect(capture.snapshot.session?.model).toBeNull()` failed — daemon returned `{"id":"haiku"}` | My authoring invented an unreachable fixture. `POST /api/sessions` requires a non-empty `model` (`docs/protocol.md` §3.1: `"model": "opus", // required`), and `internal/session/machine.go:87-101`'s `applyBind` only ever *overwrites* `sess.Model` on a hook carrying one — it never nulls it. So `session.model` can never be null for any session reachable through the real launch API; `envelopedSessionStart(..., { model: null })` doesn't help either, since `payloads.ts` omits the `model` key entirely for `null` (a no-op against an already-seeded field). Plan cross-check: the plan's own **E7** acceptance criterion (`plan.md:636`) and **Edge Case 16** both name only `context`, not `model` — my test's title ("no context *or model*") and REQ-12 cross-reference over-reached beyond what either actually pins for E2E. REQ-12's model branch is already proven by the daemon's own `TestRenderSnapshotMarkdown_UnknownRendering` (`daemon-tests.md:86`) against a directly-constructed `Session{Model: nil}`, which E2E cannot construct through the HTTP surface. | Retitled to "a session with no context yet renders unknown…" (drops "or model"), removed the `model` assertions (`toBeNull()` and the `unknown` table-row check), removed the now-pointless `model: null` hook option, added a code comment citing the launch-required-model fact and the daemon unit test that owns that branch. | E7 / REQ-12 (context branch) / Edge Case 16 — unchanged: `session.context` is still asserted `null`, the preview's `context` row is still asserted literal `unknown`, and `0%` is still asserted absent anywhere in the preview text. Nothing about context coverage was touched. |

`No assertion was deleted, skipped, or weakened` — for the 9 tests that reached a clean pass/fail decision on their own merits. It is **not** true of test #1's `model` sub-assertions themselves (those two specific expectations were removed, not weakened), which is exactly why this run's verdict is `implementation-bug` rather than `pass`: removing an assertion that tested a fixture the real API cannot produce is a repair, but I am flagging the removal explicitly here rather than folding it silently into a "no assertion touched" claim.

### E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| `#issue-dialog` never actually hides after `dialog.close()` | `[web-impl]` | UI Specifications ("`<dialog>` closes natively", Edge Case 13); User Flow 7 ("`#issue-close-button` shows... He clicks through to GitHub or closes"); REQ-13 ("an open `#issue-dialog` closes"); Testable UI Elements (Close button "hidden until a successful post" implies the dialog itself is dismissible) | Clicking Close, clicking Cancel, or `closeAll()` firing on daemon-down all call the native `HTMLDialogElement.close()` (`web/src/render/issue.ts`'s `cancelBtn`/`closeBtn` listeners and `closeAll()`), which correctly clears the `open` attribute (verified: `el.open === false`, `el.hasAttribute("open") === false`) — but the dialog stays rendered and interactive. | `web/src/style.css:1621-1626` sets `#issue-dialog.modal { display: flex; ... }` with **no `[open]` qualifier**. This id+class rule (specificity 1,1,0,1) outranks the UA stylesheet's `dialog:not([open]) { display: none }` (specificity 0,0,1,1), so closing the dialog never actually removes it from layout — `getComputedStyle(el).display` reads `"flex"` immediately after a verified `close()` call, confirmed with a throwaway debug spec (`el.open:false, display:"flex"`, deleted before finishing). Every other `dialog.modal` rule in the file (`#launch-dialog.modal`, the confirm dialogs) sets only `width`, never `display`, so this is the one place the pattern was broken. | "filing succeeds against the fake GitHub server…" (E3) — `await expect(dialog).toBeHidden()` after clicking Close; "killing the daemon disables the Issue button and closes an open dialog…" (E6) — `await expect(dialog).toBeHidden()` after `daemon.kill()`; "Submit stays disabled until a non-whitespace title is entered…" (REQ-6, Edge Case 20) — `await expect(dialog).toBeHidden()` after clicking Cancel |

The likely one-line fix (for web-impl, not applied by me): scope the rule to `#issue-dialog.modal[open]`, matching how the UA rule itself is qualified — e.g.

```css
#issue-dialog.modal[open] {
  width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
```

### Test Run Output

```
$ npm run e2e -- e2e/issue-capture.spec.ts
Running 10 tests using 6 workers

  ✓  the Issue button is visible in both Focus and Tiles (REQ-1)
  ✓  sentinel title/directory/last-assistant-message never leak … (E1, INV-1)
  ✓  the preview text at submit time is byte-identical … empty note and no sessions (E2, INV-2, Edge Case 15)
  ✓  the preview text at submit time is byte-identical … backticks, a fence, a pipe and </details> … (E2, INV-2)
  ✓  a fake GitHub 403 leaves the dialog open … (E4, INV-3)
  ✓  a dashboard-scope capture … posts a body whose table has no session rows (E5)
  ✓  a session with no context yet renders unknown in the preview, never 0% (E7, REQ-12, Edge Case 16)
  ✘  filing succeeds against the fake GitHub server … Close dismisses the dialog (E3)
  ✘  killing the daemon disables the Issue button and closes an open dialog … (E6)
  ✘  Submit stays disabled until a non-whitespace title is entered … Cancel closes the dialog (REQ-6, Edge Case 20)

  3 failed
  7 passed (9.4s)

Error: expect(locator).toBeHidden() failed
Locator:  getByRole('dialog', { name: 'File an issue' })
Expected: hidden
Received: visible
Timeout:  5000ms
  (identical shape in all 3 failures, at the post-Close / post-kill / post-Cancel assertion respectively)
```

Suite-wide collection re-check after the repair:

```
$ npx playwright test --list
Total: 171 tests in 16 files
$ echo $?
0
```

Full-suite sweep (`make e2e`) was **not** run this attempt: Validate Mode step 5 gates that sweep on "once your own spec file passes," and this file did not (3/10 failing on a real product defect). Re-run once web-impl's fix cycle lands.

### Notes

- The three failures share one root cause and one exact symptom (`display: visible` where `hidden` is expected), so I did not spend a 3rd run re-confirming — the debug spec's `getComputedStyle` read is direct evidence the bug is in the CSS cascade, not in timing, waits, or my locators. Deleted the throwaway debug spec (`web/e2e/tmp-debug-dialog.spec.ts`) before finishing; it is not part of this plan's deliverables and was never committed.
- All three failures are the *same* CSS defect surfacing through three different code paths that all end in `dialog.close()` (explicit Close click, explicit Cancel click, and `closeAll()` on daemon-down) — this is not three separate bugs, but it does mean a single CSS fix should turn all three green without further spec changes on my part.
- The "Session-option label text" and "`FakeGitHubAPI` path/method" open items from the authoring Notes both held against the real markup with no changes needed — `option.textContent = session.title ?? "untitled"` (confirmed via the E1/E5/E7 tests' successful session-select interactions) and no test needed the recorded path/method this round.

## Validate Attempt 2

**Context**: web-impl's Fix Attempt 1 (commit `2d76170`) addressed the sole implementation
bug from Validate Attempt 1 — `web/src/style.css`'s `#issue-dialog.modal` rule lacked the
`[open]` qualifier that every other `dialog.modal` rule in the file carries, so
`display: flex` outranked the UA stylesheet's `dialog:not([open]) { display: none }` and
the dialog stayed rendered after `close()`. The fix moved `display: flex; flex-direction:
column;` into a new `#issue-dialog.modal[open]` rule, leaving the unqualified rule with only
sizing (`width`, `max-height`).

**Rebuild**: `make web-build build` from the project root, in that order — both steps exited
0 (`tsc --noEmit && vite build` clean, then `go build` embedding the freshly-built
`internal/webui/assets` containing the fixed CSS).

**Live run — own file**: `npm run e2e -- e2e/issue-capture.spec.ts` from `web/` — **10/10
passing** on the first run this attempt. No repairs were needed: the fix was exactly the CSS
rule identified in Validate Attempt 1's bug report, and all three previously-failing tests
(E3's Close-dismisses-the-dialog assertion, E6's kill-daemon-closes-dialog assertion, and the
REQ-6/Edge-Case-20 Cancel-closes-the-dialog assertion) now pass against
`getByRole('dialog', { name: 'File an issue' })` → `toBeHidden()` with no locator changes on
my side.

**Collection gate**: `npx playwright test --list` from `web/` — clean, 171 tests in 16 files
(unchanged from authoring/attempt 1 — no tests added or removed this attempt).

**Full-suite sweep** (Validate Mode step 5, gated on my own file passing, which it now does):
`make e2e` from the project root — rebuilds (`web-build` then `build`) then runs the entire
Playwright suite. **171/171 passing**, all 16 spec files, no failures, no flakes across the
single run. No pre-existing spec needed updating for this plan's protocol delta (the
issue-capture feature added new endpoints/UI rather than changing an existing wire shape or
value semantics that an older spec asserted against), so there is nothing to record in
Repairs from the sweep.

### Repairs

None. No locator, fixture, wait, or assertion in `web/e2e/issue-capture.spec.ts` was changed
this attempt — the fix was entirely on the implementation side (CSS), and my spec's existing
`toBeHidden()` assertions were already correct per the plan; they simply had nothing but a
broken product to fail against.

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
$ npm run e2e -- e2e/issue-capture.spec.ts
Running 10 tests using 6 workers

  ✓  the Issue button is visible in both Focus and Tiles (REQ-1)
  ✓  sentinel title/directory/last-assistant-message never leak … (E1, INV-1)
  ✓  the preview text at submit time is byte-identical … empty note and no sessions (E2, INV-2, Edge Case 15)
  ✓  filing succeeds against the fake GitHub server … Close dismisses the dialog (E3)
  ✓  a fake GitHub 403 leaves the dialog open … (E4, INV-3)
  ✓  the preview text at submit time is byte-identical … backticks, a fence, a pipe and </details> … (E2, INV-2)
  ✓  a dashboard-scope capture … posts a body whose table has no session rows (E5)
  ✓  killing the daemon disables the Issue button and closes an open dialog … (E6)
  ✓  a session with no context yet renders unknown in the preview, never 0% (E7, REQ-12, Edge Case 16)
  ✓  Submit stays disabled until a non-whitespace title is entered … Cancel closes the dialog (REQ-6, Edge Case 20)

  10 passed (5.0s)

$ npx playwright test --list
Total: 171 tests in 16 files

$ make e2e
...
Running 171 tests using 6 workers
...
  171 passed (42.6s)
```

### Notes

- Confirmed the fix directly against the built stylesheet (not just by re-running the
  suite): `getByRole('dialog', ...)` → `toBeHidden()` in all three previously-failing tests
  now resolves correctly, which given Playwright's actionability model (computed
  `display`/visibility, not just the `open` attribute) is independent evidence the CSS
  cascade fix actually took effect in the embedded asset, not just that some other timing
  changed.
- No new implementation bugs surfaced this attempt. Verdict is `pass`.

## Fix Attempt 1 (review cycle 1, wave 3)

**Context**: no review issue was tagged `[e2e-specs]` this cycle — the Major and Minors 1/3/4
were all `[daemon-impl]`, fixed in wave 1 (commit `891d392`) and given unit coverage in
`daemon-tests`' own Fix Attempt 1. This wave's task is the standing fix-cycle coverage rule:
read what wave 1's daemon fixes added in user-visible behaviour and add the E2E coverage that
is dialog-observable, skipping what is only unit-observable. Read
`plans/issue-capture/daemon-implementation.md`'s Fix Attempt 1 and
`plans/issue-capture/daemon-tests.md`'s Fix Attempt 1 before writing anything.

**New tests added** (all in `web/e2e/issue-capture.spec.ts`, appended after the REQ-6/Edge
Case 20 test):

1. **"a capture consumed by a concurrent filing shows the capture_expired remedy sentence and
   keeps Submit disabled (Edge Case 2, Minor 3)"** — Minor 3 folded Edge Case 2's remedy
   sentence ("this snapshot expired — reopen the dialog to take a fresh one") into the
   `capture_expired` `error.message`, which reaches the dialog's selectable `#issue-error-detail`
   `<pre>` via `formatErrorDetail`. Reproduces the 409 by consuming the dialog's own held
   capture out from under it via a direct, cookie'd `page.request.post(daemon.baseURL +
   "/api/issues", ...)` (mirrors the daemon's own D10 second-POST-with-a-consumed-id
   scenario), then clicking Submit in the still-open dialog. Asserts the detail line matches
   `/^capture_expired — /` and contains the remedy sentence verbatim, and — distinct from the
   E4 (generic failure) test — that Submit stays **disabled** afterward (Edge Case 2's
   behavioural half: a `capture_expired` response nulls the held capture client-side), with
   the title value and dialog still intact for the user to reopen/reselect.
2. **"a 2xx GitHub body with no issue number/URL shows the filing failure state, never Filed
   <repo>#0 (Minor 4)"** — sets the fake GitHub response to `201` with body `{}` (parses
   cleanly, `Number==0`/`HTMLURL==""`), which `ghissue.CreateIssue` now turns into
   `ErrPostFailed{MaybeCreated:true}` instead of a false success. Asserts the dialog shows the
   ordinary failure state (`"Could not file the issue."`, `issue_post_failed —` detail
   containing "may nonetheless have been created"), that no success `role="status"`/link is
   accessible, and — using `dialog.innerText()` rather than `textContent()` so the assertion is
   visibility-aware, not fooled by the always-present-but-`hidden` success markup — that no
   visible `"Filed <repo>#<n>"` shape ever renders. Also confirms the generic-failure half of
   REQ-10 still holds here (capture not nulled, Submit re-enables, title preserved).
3. **"a 200-character title made of two-byte UTF-8 runes is accepted, proving the client's
   UTF-16 maxlength gate and the daemon's rune-count gate agree (Minor 1)"** — Minor 1's rune-
   vs-byte fix is otherwise fully unit-covered
   (`TestHandleCreateIssue_TitleExactly200MultibyteRunesIsAccepted` and its negative sibling in
   `daemon-tests.md`), but the dialog is the only place a client+server interaction can be
   exercised: the `<input maxlength="200">` gate counts UTF-16 code units, and only the
   real browser enforces it. `"é".repeat(200)` is 200 UTF-16 code units (passes the browser's
   own maxlength — sanity-checked with `expect(title.length).toBe(200)`), 200 runes, but 400
   UTF-8 bytes — exactly the case a byte-count limit used to reject after the client already
   accepted it. Fills the title via `.fill()` (this test is about rune-counting semantics, not
   focus/keystroke behaviour, so `.fill()` is appropriate setup here — unlike the REQ-6/Edge
   Case 20 test, which specifically needs real keystrokes to prove the *enable/disable*
   transition), submits against a `201` fake response, and asserts the success panel renders
   with the exact repo/number and that the posted `title` is the full untruncated 200-rune/
   400-byte string (`Buffer.byteLength(posted, "utf-8") === 400`).

**Coverage explicitly left to the unit level, not duplicated here**: the note-field 8000-rune
equivalent (`TestHandleCreateIssue_NoteExactly8000MultibyteRunesIsAccepted`) and both negative
siblings (`Title`/`NoteOver...MultibyteRunesIsRejected`) — these are pure server-side
boundary checks with no distinct client-observable behaviour beyond what test 3 above already
proves about the client/server maxlength agreement; adding four more near-identical E2E tests
for the note field and the rejection paths would not exercise any DOM behaviour test 3 doesn't
already cover. The two `MaybeCreated` sibling cases at the `ghissue` package level
(`Number==0` with a non-empty URL, vs. the `{}` case used above) are also left to
`daemon-tests` — both routes reach the identical dialog-observable outcome (test 2 covers the
outcome; which of the two `||` branches triggered it is a `ghissue`-internal distinction with
no separate UI surface). The warn-log `message` field (Major 1) is server-log-only and has no
DOM surface at all — already covered by `daemon-tests`' two new log-assertion tests.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | "a 2xx GitHub body with no issue number/URL …" (Minor 4) | `expect(dialogText).not.toMatch(/Filed\s/)` failed even though no success panel was showing | Two issues in my own draft: (a) I read `dialog.textContent()`, which includes text of elements hidden via the native `hidden` attribute — `#issue-success`'s static `<p role="status">Filed <a>…</a></p>` markup is always in the DOM, so its "Filed " text leaked into the string regardless of visibility; (b) even after switching to `dialog.innerText()` (visibility-aware), the regex `/Filed\s/` still matched — the visible `#issue-preview`'s `<sub>` provenance footer legitimately reads "Filed from the Muster dashboard.", which is correct, expected content, not a false success. | Switched to `dialog.innerText()` (respects `hidden`'s `display: none`, so the always-present-but-hidden success markup no longer pollutes the read) and narrowed the regex to `/Filed \S*#\d/` — the shape of an actual "Filed `<repo>#<n>`" success line, which cannot match the footer's "Filed from the Muster dashboard" (no `#<digit>` follows "from"). Also added an explicit `${ISSUE_REPO_FIXTURE}#0` substring check for extra directness. | Minor 4 / REQ-9's negative case: still proves no visible "Filed `<repo>#<n>`" success text renders for a `{}` GitHub body, using a regex that only matches that specific shape — nothing about the check's strength changed, only its correctness (it was a false-failure on legitimate content, not an over-permissive pass). |

`No assertion was deleted, skipped, or weakened.`

### Verification

**Rebuild**: `make web-build build` from the project root, in that order — both exited 0
(`tsc --noEmit && vite build` clean over `web/src/` **and** `web/e2e/` — no type error from
the 3 new tests — then `go build` embedding the freshly built assets). No implementation code
was touched this wave.

**Collection gate**: `npx playwright test --list` from `web/` — clean before and after,
174 tests in 16 files (171 + 3 new; no title collisions).

**Live run — own file**: `npm run e2e -- e2e/issue-capture.spec.ts` from `web/` —
**13/13 passing** on the 3rd run this wave (1 repair applied after run 1, a second regex fix
applied after run 2; both repairs were in my own spec, not the product — see Repairs).

**Full-suite sweep** (`make e2e` from the project root, gated on my own file passing, which it
now does): **174/174 passing**, all 16 spec files, single run, no flakes. No pre-existing spec
needed updating — this wave added no protocol-contract delta, only new coverage for behaviour
wave 1's daemon fixes already shipped.

### Test Run Output

```
$ npm run e2e -- e2e/issue-capture.spec.ts
Running 13 tests using 6 workers

  ✓  the Issue button is visible in both Focus and Tiles (REQ-1)
  ✓  the preview text at submit time is byte-identical … empty note and no sessions (E2, INV-2, Edge Case 15)
  ✓  a fake GitHub 403 leaves the dialog open … (E4, INV-3)
  ✓  filing succeeds against the fake GitHub server … (E3)
  ✓  sentinel title/directory/last-assistant-message never leak … (E1, INV-1)
  ✓  a dashboard-scope capture … posts a body whose table has no session rows (E5)
  ✓  the preview text at submit time is byte-identical … backticks, a fence, a pipe and </details> … (E2, INV-2)
  ✓  killing the daemon disables the Issue button and closes an open dialog … (E6)
  ✓  a session with no context yet renders unknown in the preview, never 0% (E7, REQ-12, Edge Case 16)
  ✓  Submit stays disabled until a non-whitespace title is entered … Cancel closes the dialog (REQ-6, Edge Case 20)
  ✓  a capture consumed by a concurrent filing shows the capture_expired remedy sentence and keeps Submit disabled (Edge Case 2, Minor 3)
  ✓  a 2xx GitHub body with no issue number/URL shows the filing failure state, never Filed <repo>#0 (Minor 4)
  ✓  a 200-character title made of two-byte UTF-8 runes is accepted, proving the client's UTF-16 maxlength gate and the daemon's rune-count gate agree (Minor 1)

  13 passed (5.0s)

$ npx playwright test --list
Total: 174 tests in 16 files

$ make e2e
...
Running 174 tests using 6 workers
...
  174 passed (44.2s)
```

### Notes

- `page.request.post` (used to force the `capture_expired` scenario in test 1) shares the
  browser context's cookies, including the UI auth cookie set by `page.goto` — confirmed by
  its `201` response; no separate cookie plumbing was needed, matching the pattern already
  used for `page.request.delete`/`.post` calls elsewhere in the suite (`actions.spec.ts`,
  `reconcile.spec.ts`).
- No new implementation bugs surfaced this wave — all 3 new tests passed against the
  already-fixed daemon code (wave 1) on their first content-correct run; both repairs were
  spec-side (an over-broad `textContent()` read and an over-broad regex), not product defects.
- Updated the coverage/requirement tables and header fields above rather than the Tests table
  from the original authoring section, to keep the log's history intact per the Mode's append
  rule; the 3 new tests are described in this section rather than duplicated into the earlier
  Tests/Coverage tables.

## Fix Attempt 2 (review cycle 2, wave 3)

**Task**: no review issue in this cycle is tagged `[e2e-specs]`. The concrete instruction was:
this cycle's daemon fixes (commit `302745d`, `daemon-implementation.md` Fix Attempt 2, Minor 1)
changed the `capture_expired` error message — the false "this snapshot expired" diagnosis was
dropped, leaving the remedy sentence but with different wording. My own
`capture_expired` remedy test in `web/e2e/issue-capture.spec.ts` pinned the old sentence and
would fail against the fixed daemon. Also asked to check whether the cycle's other deltas (the
`upstream` log-field rename, rune-counted `title_len`/`note_len` logging) touch any of my
assertions.

**Change made** (`web/e2e/issue-capture.spec.ts`, test `"a capture consumed by a concurrent
filing shows the capture_expired remedy sentence and keeps Submit disabled (Edge Case 2, Minor
3)"`, line ~592): the assertion pinning the substring `"reopen the dialog to take a fresh one"`
(itself preceded by the now-dropped `"this snapshot expired — "` diagnosis) was replaced with
an assertion on the full new sentence:

```
await expect(issueErrorDetail(dialog)).toContainText(
  "capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot",
);
```

This is sanctioned breakage per the brief and `daemon-implementation.md`'s own Fix Attempt 2
handoff, which names this exact test string as a direct, unavoidable consequence of review
cycle 2 Minor 1 (dropping a diagnosis the daemon does not actually know to be true). The
replacement assertion is *stronger* than the one it replaces — it pins the entire sentence
verbatim (both halves: what's wrong and the remedy), not just a fragment of the remedy clause —
so REQ coverage for Edge Case 2 / Minor 3 is preserved, not narrowed. The preceding
`toHaveText(/^capture_expired — /)` assertion (the error-code prefix) was untouched since that
delta only touched the message half.

**Other-deltas check** (log field rename `message` → `upstream`; `title_len`/`note_len` now
rune-counted instead of byte-counted): read `internal/server/issue.go` directly —
`.Str("upstream", authErr.Message)` / `.Str("upstream", postErr.Message)` (the two failure-branch
warn lines) and `.Int("title_len", utf8.RuneCountInString(title))` /
`.Int("note_len", utf8.RuneCountInString(req.Note))` (the success-line info log) are all
arguments to `s.log.Warn()`/`s.log.Info()` calls — server-side structured log fields only, never
serialized into an HTTP response body or a WS message. `grep -n "upstream\|title_len\|note_len"
web/e2e/issue-capture.spec.ts` (pre-edit) found zero occurrences of any of the three as log-field
assertions — the single `upstream` hit in the file was an unrelated issue *title* string
(`"maybe created upstream"`, part of the Minor 4 test's fixture text, not a log-field name).
Confirmed: neither delta is observable from the dashboard/HTTP surface my spec drives, so
neither needed (or got) any E2E assertion change. This matches
`daemon-implementation.md` Fix Attempt 2's own framing of Critical 1/Minor 2 as log-transport
fixes with no wire-shape or UI-visible consequence.

**Rebuild**: `make web-build build` (project root) — `tsc --noEmit && vite build` clean, `go
build -o bin/musterd ./cmd/musterd` clean. (Ordered as instructed: assets before the Go
compile.)

**Live run — own file**: `npm run e2e -- e2e/issue-capture.spec.ts` from `web/` — **13/13
passing on the 1st run** this wave (only the one repointed assertion; no locator repairs
needed).

**Collection gate**: `npx playwright test --list` from `web/` — clean, unchanged at 174 tests
in 16 files, no title collisions.

**Full-suite sweep**: `make e2e` (project root, rebuilds both then runs everything) —
**174/174 passing**, single run, no flakes, no other spec touched by this cycle's delta.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|-------------------------|
| 1 | `a capture consumed by a concurrent filing shows the capture_expired remedy sentence and keeps Submit disabled (Edge Case 2, Minor 3)` | `toContainText("reopen the dialog to take a fresh one")` failed: the daemon's cycle-2 fix (commit `302745d`) dropped the false `"this snapshot expired"` diagnosis and reworded the remedy clause, per review cycle 2 Minor 1 | Not a locator bug — the pinned copy string was the *previous* cycle's approved wording, superseded by this cycle's approved fix (sanctioned breakage, named in `daemon-implementation.md`'s Fix Attempt 2 handoff) | Repointed the assertion to `toContainText("capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot")` — the full, current sentence | Edge Case 2 / Minor 3: the dialog still surfaces a `capture_expired` detail line naming a concrete remedy ("reopen the dialog to take a fresh snapshot") in the selectable `<pre>`, and Submit still stays disabled until the session selection changes or the dialog reopens — both halves of the requirement remain asserted, just against the corrected copy |

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
$ make web-build build
… tsc --noEmit && vite build — clean
… go build -o bin/musterd ./cmd/musterd — clean

$ npm run e2e -- e2e/issue-capture.spec.ts
Running 13 tests using 6 workers
  ✓  the Issue button is visible in both Focus and Tiles (REQ-1)
  ✓  the preview text at submit time is byte-identical … empty note and no sessions (E2, INV-2, Edge Case 15)
  ✓  a fake GitHub 403 leaves the dialog open … (E4, INV-3)
  ✓  filing succeeds against the fake GitHub server … (E3)
  ✓  sentinel title/directory/last-assistant-message never leak … (E1, INV-1)
  ✓  a dashboard-scope capture … posts a body whose table has no session rows (E5)
  ✓  the preview text at submit time is byte-identical … backticks, a fence, a pipe and </details> … (E2, INV-2)
  ✓  killing the daemon disables the Issue button and closes an open dialog … (E6)
  ✓  a session with no context yet renders unknown in the preview, never 0% (E7, REQ-12, Edge Case 16)
  ✓  Submit stays disabled until a non-whitespace title is entered … Cancel closes the dialog (REQ-6, Edge Case 20)
  ✓  a capture consumed by a concurrent filing shows the capture_expired remedy sentence and keeps Submit disabled (Edge Case 2, Minor 3)
  ✓  a 2xx GitHub body with no issue number/URL shows the filing failure state, never Filed <repo>#0 (Minor 4)
  ✓  a 200-character title made of two-byte UTF-8 runes is accepted, proving the client's UTF-16 maxlength gate and the daemon's rune-count gate agree (Minor 1)

  13 passed (5.6s)

$ npx playwright test --list
Total: 174 tests in 16 files

$ make e2e
Running 174 tests using 6 workers
…
  174 passed (43.1s)
```

### Notes

- No other spec file needed a change this wave — this cycle's daemon delta (log-field rename,
  rune-counted log lengths, the `capture_expired` copy change) touches only server-side logging
  and the one dialog copy string covered above; nothing else in the suite asserts on any of it.
- Confirmed `masthead.png` (untracked, project root) was left untouched.
