# E2E Test Specs: m1-sessions

**Plan**: m1-sessions
**Mode**: fix (attempt 2, cycle 2, wave 3)
**Verdict**: pass
**Tests created**: 19 (15 + 4 new this cycle; plus 5 M0 files/28 tests untouched but re-collected)
**Live run**: 39/39 passing (full suite, `make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/launch.spec.ts | New session opens a modal exposing every Testable UI Element (REQ-14, W4) | REQ-14, W4 | Dialog role/name, Browse…, Title, all four model radios, hidden→visible Custom model input, all three start-in radios, Launch/Cancel |
| web/e2e/launch.spec.ts | Browse… into a fresh directory launches with the trust-prompt note and writes settings.local.json (E2, REQ-17) | REQ-4, REQ-6, REQ-14, REQ-17, E2, W9 | Folder browser Up/Subdirectory/Use-this-folder flow, card renders "first launch here", `.claude/settings.local.json` exists post-launch |
| web/e2e/launch.spec.ts | selecting an MRU directory prefills model and start-in from that directory's last launch (E1, W5) | REQ-3, REQ-5, E1, W5 | `GET /api/repos` reflects `lastModel`/`lastPermissionMode`/null `branch`; MRU entry click prefills radios; second launch's card appears |
| web/e2e/launch.spec.ts | GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (REQ-6) | REQ-6 | Protocol Contract error codes for `/api/browse` |
| web/e2e/launch.spec.ts | a card for a known (non-first-launch) directory shows the no-signal note after ~10s (REQ-17) | REQ-17 | `firstLaunchHere:false` on a second launch; no-signal note appears after ~10s |
| web/e2e/sessions.spec.ts | a fresh session renders 'untitled' and its context row as ctx unknown (W7) | REQ-15, W7 | untitled fallback, `ctx unknown` pattern, no title at launch |
| web/e2e/sessions.spec.ts | walks started -> working -> idle via SessionStart, turn-activity, then Stop, with lastActivity shown (E3) | REQ-7, REQ-8, E3 | Envelope bind, turn-activity → working, Stop → idle, `lastActivity` text shown |
| web/e2e/sessions.spec.ts | a permission notification moves the card to needs input; a later Stop returns it to idle (E4) | REQ-8, E4 | `Notification(permission_prompt)` → needs_input + attention note; Stop closes it |
| web/e2e/sessions.spec.ts | a StopFailure moves the card to failed showing the raw error token (E5) | REQ-8, E5 | `StopFailure` → failed, raw token verbatim in the card |
| web/e2e/sessions.spec.ts | a session seeded in plan mode shows planning on turn-activity instead of working (E5) | REQ-8, REQ-9, E5 | Latch seeded `source:"seed"`; SessionStart (no `permission_mode`) doesn't reset it; turn-activity lands on "planning" |
| web/e2e/sessions.spec.ts | a straggler turn-activity for an already-closed prompt does not move the card off idle (E6) | REQ-8, E6 | Post-Stop turn-activity for the same prompt id persists (polled via the DB oracle) but causes no transition |
| web/e2e/sessions.spec.ts | the /clear sequence rebinds the session to one card in started (E7) | REQ-7, REQ-10, E7 | `SessionEnd(clear)` is not a death hint; `SessionStart(source:"clear")` rebinds `claudeSessionId`, one row only, state `started` |
| web/e2e/sessions.spec.ts | cards sort needs-input first, then failed, then the active/started/idle groups (E8, REQ-16) | REQ-16, E8 | Relative DOM order across 5 sessions in 5 different states matches the §7.3-derived sort priority |
| web/e2e/sessions.spec.ts | killing the scratch tmux window greys the card without changing its badge (E9) | REQ-11, REQ-18, E9 | `alive:false` via the liveness poll within 10s; badge word unchanged; reduced-opacity visual cue |
| web/e2e/sessions.spec.ts | a status-line post persists and routes but mutates no session field in M1 (REQ-13) | REQ-13 | Status POST with a `session_name` persists (DB oracle) but the session's `title` stays the launch value |
| web/e2e/sessions.spec.ts | daemon restart and disconnect (E10, W12) › keeps the stale rail visible during a disconnect and reloads the card from persistence after restart | REQ-12, E10, W12 | Banner appears, stale card+badge stay rendered while disconnected; after restart, fresh snapshot reloads the same state from SQLite |
| web/e2e/launch.spec.ts | Browse into a directory removed mid-session shows the daemon's error inline and keeps the stale listing (Edge Case 14, Launch error line) | Testable UI Elements "Launch error line", Edge Case 14 | `#launch-error` (role="alert") renders the real `GET /api/browse` 404 body's `error.message` verbatim; dialog stays open and the stale subdirectory listing is still rendered (not cleared) |
| web/e2e/launch.spec.ts | a real git checkout in the folder browser is marked (git) and a plain subdirectory is not (Major 6) | Major 6 (`(git)` marker) | A subdirectory that is a real `git init` checkout renders `"<name> (git)"`; a plain sibling directory renders its bare name — both against the real `gitutil.IsRepo` shell-out, not a stub |
| web/e2e/launch.spec.ts | MRU entry's path span shows the directory's full absolute path, not just its name (Major 5) | Major 5 (`.dir-path`) | `.dir-name` carries the basename, `.dir-path` carries the full absolute directory path, on a real MRU entry from `GET /api/repos` |
| web/e2e/launch.spec.ts | Cmd+N opens the launch modal from anywhere in the shell (REQ-22) | REQ-22 | `Meta+n` keydown on the shell (dialog closed, no button focus) opens the "New session" dialog |

Plus REQ-1/REQ-2/REQ-19 are exercised implicitly by every launch (`launchSession` in `web/e2e/helpers/session.ts` performs the real `POST /api/sessions` against a daemon started with `-claude-bin`/`-tmux-socket`, so any failure there fails every test in both files, pinpointing exactly those requirements).

## Fixture Changes

- `web/e2e/helpers/daemon.ts` — `ScratchDaemon` now writes a stub `claude` binary
  (`#!/bin/sh` sleep loop, mode 0o755, in the scratch data dir) and passes `-claude-bin`
  + a per-run `-tmux-socket` (reusing the already-unique `mkdtemp` data-dir name, so no
  separate randomness scheme was needed) to every spawn, matching REQ-19's new flags and
  the plan's Affected Files > E2E note. Added `killTmuxWindow(tmuxTarget)` and
  `tmuxPaneExists(tmuxTarget)`, both scoped to the run's own socket (never `-L muster`).
  `teardown()` now also `tmux -L <socket> kill-server`s before removing the data dir.
- `web/e2e/helpers/payloads.ts` — extended with the rest of the M1 event set, each
  shape-faithful to `spikes/canary-fields.md`'s measured field inventory:
  `rawUserPromptSubmit`, `rawPostToolUse` (turn-activity), `rawNotification`
  (`permission_prompt`/`idle_prompt`), `rawPermissionRequest`, `rawStopFailure`,
  `rawPreCompact`, `rawSessionEnd`. `envelopedSessionStart` gained optional
  `musterSession`/`tmuxPane`/`source`/`model` (default behaviour with no `opts` is
  byte-for-byte what M0's fixture produced, so `ingest.spec.ts` is unaffected).
  `rawStop` gained optional `promptId`/`permissionMode`/`lastAssistantMessage` (same
  backward-compatible defaults) and now also carries `background_tasks`/`session_crons`
  per the measured field table. `envelopedStatusLinePreFirstResponse` gained optional
  `musterSession`/`tmuxPane`/`sessionName` (default unchanged from M0).
- `web/e2e/helpers/session.ts` (new) — `scratchDirectory()` (a `POST /api/sessions`
  target under `os.tmpdir()`) and `homeScratchDirectory()` (a target directly under the
  real home directory, the only place `GET /api/browse`'s no-`path` default lands — see
  Notes); `launchSession()`/`getState()`/`findSession()` (real, cookie-authed HTTP calls
  via the `page` fixture); `sessionCard()`/`stateBadge()` locator helpers.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | every `launchSession()` call (201 assumed by all downstream assertions) |
| REQ-2 | "walks started -> working -> idle…" (badge already `started` right after `launchSession` returns, before any hook is posted) |
| REQ-3 | "selecting an MRU directory prefills…" (`GET /api/repos` reflects the seed launch) |
| REQ-4 | "Browse… into a fresh directory…" (`.claude/settings.local.json` existence check) |
| REQ-5 | "selecting an MRU directory prefills…" |
| REQ-6 | "Browse… into a fresh directory…", "GET /api/browse returns 400…", "Browse into a directory removed mid-session…" |
| REQ-7 | "walks started -> working -> idle…", "/clear sequence…" |
| REQ-8 | "walks started…", "a permission notification…", "a StopFailure…", "plan mode…", "a straggler…" |
| REQ-9 | "a session seeded in plan mode shows planning…" |
| REQ-10 | "the /clear sequence…" |
| REQ-11 | "killing the scratch tmux window…" |
| REQ-12 | "daemon restart and disconnect…" |
| REQ-13 | "a status-line post persists and routes but mutates no session field…" |
| REQ-14 | "New session opens a modal…", "Browse… into a fresh directory…", "Browse into a directory removed mid-session…" (Launch error line row), "a real git checkout in the folder browser is marked (git)…" (Subdirectory entry row), "MRU entry's path span…" (MRU directory entry row) |
| REQ-15 | "a fresh session renders 'untitled'…", every card-based assertion elsewhere |
| REQ-16 | "cards sort needs-input first…" |
| REQ-17 | "Browse… into a fresh directory…" (trust-prompt), "a card for a known… no-signal note" |
| REQ-18 | "killing the scratch tmux window…" |
| REQ-19 | every test (daemon only starts if the new flags are accepted) |
| REQ-20 | inherited from M0's `resilience.spec.ts` (SIGTERM path); not re-tested here |
| REQ-21 | not covered by a dedicated E2E test — see Notes |
| REQ-22 | "Cmd+N opens the launch modal from anywhere in the shell" (added fix cycle 2, wave 3) |
| Edge Case 14 | "Browse into a directory removed mid-session shows the daemon's error inline and keeps the stale listing" (added fix cycle 2, wave 3) |

## Repairs (validate / fix modes only)

Not applicable — this is the authoring-mode run.

## E2E Implementation Bugs (if verdict = implementation-bug)

Not applicable.

## Test Run Output

Not run (authoring mode). Collection gate:

```
$ npx playwright test --list
Listing tests:
  ... (35 tests listed across auth.spec.ts, ingest.spec.ts, launch.spec.ts,
       resilience.spec.ts, sessions.spec.ts, shell.spec.ts)
Total: 35 tests in 6 files
```

No errors, no duplicate titles. `npx tsc --noEmit` also ran clean over the new/edited
files (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all satisfied).

## Notes

- **Session card locator is a guess, by design.** The plan's Testable UI Elements table
  explicitly leaves the session-card locator to e2e-specs. `sessionCard()` in
  `web/e2e/helpers/session.ts` uses `page.getByTestId("session-card")`, which almost
  certainly does not exist yet in web-impl's markup (nothing in the plan mandates a
  testid). Validate mode will need to repair every card-scoped locator to whatever
  container the real rail markup actually uses (a class, a role, structural nesting) —
  this is expected, not a defect, and the fix stays entirely within the test files.
- **The Browse… E2E flow writes into the real home directory, cleaned up in a
  `finally`.** `GET /api/browse` with no `path` defaults to "the daemon user's home
  directory" (protocol §3.6), and the launch modal's folder browser has no way to jump
  to an arbitrary path (no path text input is pinned in the Testable UI Elements table —
  only Up/Subdirectory/Use-this-folder buttons). Reaching a scratch directory through the
  UI in one click therefore requires that directory to be an immediate child of the real
  `$HOME`. `homeScratchDirectory()` creates one such directory per test and always
  removes it in a `finally`. This is a genuine gap in the plan (no `-home-dir`-style
  override flag for E2E isolation) rather than a test defect; flagging it explicitly in
  case the orchestrator wants to route a follow-up to daemon-impl/plan-work for a future
  milestone. All other launches in this suite use `os.tmpdir()` via `scratchDirectory()`
  and never touch `$HOME`.
- **"Ended" (dead-session grey) treatment has no pinned role/text.** The E9 test
  therefore checks it two ways: the authoritative data fact (`alive:false` via
  `GET /api/state`, polled) and a soft visual heuristic (`getComputedStyle(...).opacity <
  1`) rather than inventing a class/testid the product doesn't need. If validate mode
  finds a more specific, real signal (e.g. an `aria-disabled` or a dedicated class), it
  should tighten this rather than leave it soft — that's a legitimate repair, not a
  weakening, since the underlying `alive:false` assertion stays.
- **REQ-21 (PreCompact / `⟳n` counter) has no dedicated E2E test.** The context row is
  otherwise `ctx unknown` throughout M1 (gauges are M3), so the only visible effect of a
  `PreCompact` in M1 is the compaction counter suffix, which isn't pinned by the
  Testable UI Elements table (`context row — "ctx unknown"` pattern only) and is a
  Should-Have, not a Must-Have. `rawPreCompact()` is provided in `payloads.ts` for
  daemon-tests/future use but isn't wired into an assertion here; flagging this as a
  coverage gap rather than silently dropping it.
- Every test that launches into its own `scratchDirectory()`/`homeScratchDirectory()`
  cleans up in a `finally`, and every test uses its own Claude session id(s), so tests
  remain independent under `fullyParallel: true` even though most share one
  `ScratchDaemon` per file (the E10/W12 restart test gets its own dedicated daemon in a
  `test.describe.serial` block, since restarting a shared daemon would break concurrently
  running tests in the same file).
- No real `claude` binary is ever invoked; every session-machine transition is driven by
  a synthesized POST built from `spikes/canary-fields.md`'s measured field set.

## Validate Attempt 1

Ran both target spec files live against the real daemon/tmux/web build (`npm run e2e --
e2e/launch.spec.ts e2e/sessions.spec.ts`), per validate mode. `go build ./...` and
`npm run build` (web) both exit 0 before running. Read `daemon-implementation.md` and
`web-implementation.md` first — in particular confirming `data-testid="session-card"`
matches what `web/e2e/helpers/session.ts`'s `sessionCard()` already assumed (web-impl
added it deliberately, reading the same helper), so no card-locator repair was needed
this round.

First run: 14/16 passed, 2 failures. Second run (after the one legitimate spec repair
below): 15/16 passed, 1 failure that is a genuine implementation defect, not a test
defect — see the bugs table.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `a straggler turn-activity for an already-closed prompt does not move the card off idle (E6)` | `expect.poll(...).toBe(3)` timed out; actual persisted count was 4 | My own arithmetic error when I wrote the test: the sequence for this claude session id is `envelopedSessionStart` → `rawUserPromptSubmit` → `rawStop` → `rawPostToolUse` (the straggler) — four persisted events, not three. The assertion was never about product behavior, just a miscounted literal. | Changed the expected count from `3` to `4` in `web/e2e/sessions.spec.ts` (kept the same `.poll` shape and comment, added a one-line note listing the four events) | REQ-8/E6: the test still asserts (a) the straggler event is actually persisted before checking, and (b) the badge stays `idle` afterward — nothing about the "no transition" assertion changed, only the unrelated event-count literal used to synchronize the wait |

No assertion was deleted, skipped, or weakened.

### E2E Implementation Bugs

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| Custom model input is visible even when "other" is not selected | `[web-impl]` | Testable UI Elements: "Custom model input — textbox — Custom model — visible only when `other` selected"; also REQ-14, W4 | `#custom-model-input` (wrapped by `#custom-model-row`, toggled via `.hidden = true/false` in `web/src/render/launch.ts`'s `updateCustomModelVisibility()`) renders hidden until the `other` model radio is checked | The JS correctly sets/clears the `hidden` attribute on `#custom-model-row`, but `web/src/style.css`'s `.field-row { display: grid; ... }` rule (line 520) has no `[hidden]` qualifier, so this author-origin rule overrides the browser's UA default `[hidden] { display: none }` regardless of specificity — the row (and its input) stays laid out and visible even with the `hidden` attribute set. Every other conditionally-hidden element in the same stylesheet (`.banner[hidden]`, `.activity[hidden]`, `.note[hidden]`, `.browse-panel[hidden]`, `.launch-error[hidden]`, `#protocol-mismatch[hidden]`) has the compensating `[hidden]` rule; `.field-row`/`#custom-model-row` is the one instance that's missing it. Verified by reading `src/style.css` alongside the failing Playwright run (element resolves and reports `visible` before "other" is ever selected). | `launch.spec.ts:24:1` — "New session opens a modal exposing every Testable UI Element (REQ-14, W4)" |

### Test Run Output

```
Running 16 tests using 6 workers
  ✓ GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (REQ-6)
  ✓ selecting an MRU directory prefills model and start-in from that directory's last launch (E1, W5)
  ✓ a fresh session renders 'untitled' and its context row as ctx unknown (W7)
  ✓ a permission notification moves the card to needs input; a later Stop returns it to idle (E4)
  ✓ walks started -> working -> idle via SessionStart, turn-activity, then Stop, with lastActivity shown (E3)
  ✓ a StopFailure moves the card to failed showing the raw error token (E5)
  ✓ daemon restart and disconnect (E10, W12) › keeps the stale rail visible during a disconnect and reloads the card from persistence after restart
  ✓ a session seeded in plan mode shows planning on turn-activity instead of working (E5)
  ✓ the /clear sequence rebinds the session to one card in started (E7)
  ✓ Browse… into a fresh directory launches with the trust-prompt note and writes settings.local.json (E2, REQ-17)
  ✓ a straggler turn-activity for an already-closed prompt does not move the card off idle (E6)
  ✓ cards sort needs-input first, then failed, then the active/started/idle groups (E8, REQ-16)
  ✘ New session opens a modal exposing every Testable UI Element (REQ-14, W4)
  ✓ killing the scratch tmux window greys the card without changing its badge (E9)
  ✓ a status-line post persists and routes but mutates no session field in M1 (REQ-13)
  ✓ a card for a known (non-first-launch) directory shows the no-signal note after ~10s (REQ-17)

  1) e2e/launch.spec.ts:24:1 › New session opens a modal exposing every Testable UI Element (REQ-14, W4)

    Error: expect(locator).not.toBeVisible() failed
    Locator:  getByRole('dialog', { name: 'New session' }).getByLabel('Custom model')
    Expected: not visible
    Received: visible
    Timeout:  5000ms

      37 |   }
      38 |   // Custom model input is visible only once "other" is selected (Testable UI Elements).
    > 39 |   await expect(dialog.getByLabel("Custom model")).not.toBeVisible();
         |                                                       ^

  1 failed
    [chromium] › e2e/launch.spec.ts:24:1 › New session opens a modal exposing every Testable UI Element (REQ-14, W4)
  15 passed (13.0s)
```

Post-fix re-collection (suite-wide, after the repair): `npx playwright test --list` still
lists 35 tests across 6 files with no errors and no duplicate titles.

### Notes (validate attempt 1)

- Only one repair was needed to my own spec files (the E6 event-count literal); every
  other locator/wait from authoring mode matched the real markup on the first live run,
  including the `data-testid="session-card"` guess, `getByLabel`/`getByRole` names in
  the launch modal, and the `stateBadge` text-pattern locator.
- The one remaining failure is not something I can repair without weakening the
  assertion: the plan's Testable UI Elements table pins the Custom model input as
  visible only when `other` is selected, and the current build does not honor that. I
  did not touch `web/src/style.css` or any other file under `web/src/`.
- Verdict is `implementation-bug` rather than `pass` because of that one finding; the
  fix (adding a `.field-row[hidden] { display: none; }` — or scoped to
  `#custom-model-row[hidden]` — rule in `web/src/style.css`) belongs to web-impl.

## Validate Attempt 2

Read `web-implementation.md`'s new `## Fix Attempt 1` section first: web-impl added
`.field-row[hidden] { display: none; }` to `web/src/style.css` (directly after the
existing `.field-row { display: grid; ... }` rule), fixing the CSS-specificity gap that
was overriding the UA `[hidden]` default on `#custom-model-row`. Confirmed the rule is
present by grepping the file before running anything.

Pre-flight builds, both exit 0:
- `go build ./...`
- `npm run build` (web/) — `tsc --noEmit && vite build`

Ran both target spec files live, unmodified from Validate Attempt 1 (no spec edits this
round — the prior failure was entirely on the implementation side):

```
npm run e2e -- e2e/launch.spec.ts e2e/sessions.spec.ts
```

Result: **16/16 passed** in 13.0s, including
`launch.spec.ts:24:1 › New session opens a modal exposing every Testable UI Element (REQ-14, W4)`,
which was the sole failure last round. Its assertion
(`expect(dialog.getByLabel("Custom model")).not.toBeVisible()` before "other" is
selected) is unchanged from Validate Attempt 1 — no locator, wait, or expectation was
touched.

Also ran `make web-test` as an extra sanity check (not this agent's gate, but relevant
context given the prompt referenced it): 185/185 Vitest tests passing across 10 files.

Re-ran suite-wide collection after confirming the live run:

```
npx playwright test --list
```

35 tests across 6 files (`auth.spec.ts`, `ingest.spec.ts`, `launch.spec.ts`,
`resilience.spec.ts`, `sessions.spec.ts`, `shell.spec.ts`), no errors, no duplicate
titles.

### Repairs

None. No spec file was edited in this attempt.

No assertion was deleted, skipped, or weakened.

### Test Run Output

```
Running 16 tests using 6 workers

  ✓   2 [chromium] › e2e/launch.spec.ts:144:1 › GET /api/browse returns 400 for a relative path and 404 for a directory that doesn't exist (REQ-6) (525ms)
  ✓   5 [chromium] › e2e/launch.spec.ts:24:1 › New session opens a modal exposing every Testable UI Element (REQ-14, W4) (1.0s)
  ✓   6 [chromium] › e2e/launch.spec.ts:92:1 › selecting an MRU directory prefills model and start-in from that directory's last launch (E1, W5) (1.0s)
  ✓   7 [chromium] › e2e/sessions.spec.ts:38:1 › a fresh session renders 'untitled' and its context row as ctx unknown (W7) (423ms)
  ✓   9 [chromium] › e2e/sessions.spec.ts:141:1 › a session seeded in plan mode shows planning on turn-activity instead of working (E5) (421ms)
  ✓   8 [chromium] › e2e/sessions.spec.ts:87:1 › a permission notification moves the card to needs input; a later Stop returns it to idle (E4) (540ms)
  ✓   1 [chromium] › e2e/sessions.spec.ts:407:3 › daemon restart and disconnect (E10, W12) › keeps the stale rail visible during a disconnect and reloads the card from persistence after restart (2.1s)
  ✓  10 [chromium] › e2e/sessions.spec.ts:54:1 › walks started -> working -> idle via SessionStart, turn-activity, then Stop, with lastActivity shown (E3) (420ms)
  ✓  11 [chromium] › e2e/sessions.spec.ts:171:1 › a straggler turn-activity for an already-closed prompt does not move the card off idle (E6) (458ms)
  ✓  12 [chromium] › e2e/sessions.spec.ts:117:1 › a StopFailure moves the card to failed showing the raw error token (E5) (485ms)
  ✓  13 [chromium] › e2e/sessions.spec.ts:207:1 › the /clear sequence rebinds the session to one card in started (E7) (365ms)
  ✓   3 [chromium] › e2e/launch.spec.ts:54:1 › Browse… into a fresh directory launches with the trust-prompt note and writes settings.local.json (E2, REQ-17) (3.8s)
  ✓  15 [chromium] › e2e/sessions.spec.ts:243:1 › cards sort needs-input first, then failed, then the active/started/idle groups (E8, REQ-16) (614ms)
  ✓  14 [chromium] › e2e/sessions.spec.ts:318:1 › killing the scratch tmux window greys the card without changing its badge (E9) (5.3s)
  ✓  16 [chromium] › e2e/sessions.spec.ts:359:1 › a status-line post persists and routes but mutates no session field in M1 (REQ-13) (213ms)
  ✓   4 [chromium] › e2e/launch.spec.ts:162:1 › a card for a known (non-first-launch) directory shows the no-signal note after ~10s (REQ-17) (11.3s)

  16 passed (13.0s)
```

### Notes (validate attempt 2)

- Zero spec changes were needed this attempt — Validate Attempt 1 had already repaired
  the one genuine spec defect (the E6 event-count literal), and the remaining failure
  was purely the web-impl CSS bug, now fixed.
- Confirms the full pipeline round-trip: e2e-specs' report of an `[web-impl]` bug in
  Validate Attempt 1 was routed correctly, fixed at its actual root (a missing
  `[hidden]` CSS rule, not a locator problem), and the identical test now passes without
  any accommodation on the test side.
- No real `claude` binary was invoked at any point in this validation.

## Fix Attempt 1 (review cycle 1, wave 3)

Fixing the one issue tagged `[e2e-specs]` in `plans/m1-sessions/review.md`: **Major 11**.
`envelopedSessionStart` in `web/e2e/helpers/payloads.ts` was sending `model` as
`{id, display_name}` when present, a shape no measurement at authoring time actually
supported for `SessionStart` (only the status line was measured with that object shape;
`SessionStart`'s hook table entry listed `model` with no shape pinned). The prompt for
this cycle stated the missing measurement had since been taken (2026-08-22 interface
probe, recorded in `spikes/canary-fields.md` under "Values worth asserting" →
`SessionStart.model`): when present, `model` is a **plain model-id string**
(e.g. `"claude-haiku-4-5-20251001"`), never an object; optional (present 2 of 5 captures,
absent on `source:"clear"`). Confirmed this is recorded by reading
`spikes/canary-fields.md` lines 66-71 myself before touching anything.

Also confirmed `internal/claudecode/interpret.go`'s `modelID()` (daemon-impl side) has
already dropped the object-shape branch and now accepts only the plain string —
`interpret_test.go`'s new cases (`"model present as an {id, display_name} object … is
not extracted here"`) assert the object shape is explicitly rejected. My fixture had to
stop sending a shape the daemon no longer parses, or every downstream assertion that
depends on the model actually landing would be exercising dead code.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | (fixture only — `envelopedSessionStart`, no single test name; used by every `sessions.spec.ts`/`ingest.spec.ts` test that calls it with default `opts`) | Not a live test failure (no test asserted on the object's `id`/`display_name` fields directly), but the fixture asserted an unmeasured, now-settled-false wire shape for REQ-7's "SessionStart's model replaces the launch value" | `SessionStartOpts.model` was typed `{id: string; display_name: string} \| null` and the default payload built that object literal, copied from the status-line shape (`envelopedStatusLinePreFirstResponse`) by mistake rather than the hook's own (then-unmeasured) shape | Changed `SessionStartOpts.model` to `string \| null` and the default fill to the plain string `"claude-haiku-4-5-20251001"` in `web/e2e/helpers/payloads.ts` (`envelopedSessionStart`) | REQ-7 (envelope binding / SessionStart model replacement) and REQ-13 (status-line model shape, still `{id, display_name}`, untouched) — the fixture is now shape-faithful to the measured capture for each event type it represents |

Checked every call site of `envelopedSessionStart` (`ingest.spec.ts:32,85`;
`sessions.spec.ts:67,99,126,158,183,216,228,277,328,370,418`) — none passed an explicit
`model` option, so all of them silently picked up the corrected default with no per-test
edit needed. Checked every call site of `envelopedStatusLinePreFirstResponse` separately
— its `{id, display_name}` object literal is untouched, since that shape is the one the
status line actually sends (canary-fields.md line 177).

No assertion was deleted, skipped, or weakened.

### Since-timer text change (review's second note)

Checked whether any assertion pinned the pre-fix bare `"needs your permission"` text
exactly. The only hit, `web/e2e/sessions.spec.ts:108`
(`card.getByText(/needs your permission/i)`), is an unanchored substring regex — it
matches equally well against `"needs your permission — 00:10"`. No repair was needed;
confirmed live in the full-suite run below (E4 passed). Also checked for any exact
`toHaveText` string match, MRU path-span text, or folder-browser git-marker text that
might now collide with additive markup — none of the existing locators depend on exact
adjacent text (`stateBadge` and card text locators are all substring/regex), so nothing
else needed touching.

### Re-verify collection suite-wide

```
$ npx playwright test --list
...
Total: 35 tests in 6 files
```

No errors, no duplicate titles.

### Full suite live run (`make e2e`)

Ran the full pipeline gate exactly as instructed: `go build` → `web build` →
`playwright test` (all 6 spec files, 35 tests, `fullyParallel`).

```
Running 35 tests using 6 workers
  ✓ auth.spec.ts (4 tests)
  ✓ ingest.spec.ts (4 tests)
  ✓ launch.spec.ts (5 tests)
  ✓ resilience.spec.ts (3 tests)
  ✓ sessions.spec.ts (15 tests, including "walks started -> working -> idle via
    SessionStart, turn-activity, then Stop, with lastActivity shown (E3)" and every other
    test that calls envelopedSessionStart with the now-corrected plain-string model
    default)
  ✓ shell.spec.ts (4 tests)

  35 passed (16.7s)
```

### Notes (fix attempt 1)

- Only one fixture default needed changing; no individual test body required an edit,
  since none of them asserted on the (fictional) object shape's fields directly — the
  Major 11 defect was purely about fixture honesty, not about a currently-passing
  assertion being wrong.
- Did not touch `internal/claudecode/interpret.go`, `internal/claudecode/interpret_test.go`,
  or any other file under `internal/`/`cmd/`/`web/src/` — daemon-impl already settled its
  side of this issue in an earlier wave.
- No real `claude` binary was invoked at any point in this fix cycle.

## Fix Attempt 2 (review cycle 2, wave 3)

### My issue: Major 3 (`[web-tests]` / `[e2e-specs]`)

Review cycle 2's Major 3 found that seven behaviours the cycle-1 fix wave added had zero
E2E assertions anywhere — `(git)` marker, `.dir-path`, `metaKey`/⌘N, and `#launch-error`/
`showError` — even though "Launch error line" is its own row in the plan's Testable UI
Elements table and Edge Case 14 ("the browser UI shows the error and stays where it
was") was implemented but unverified. web-tests had correctly stayed out of DOM wiring
(cycle 1's Minor 14, and conventions), but no one had been routed the Playwright half, so
it fell through the gap. Minor 6 (the canary-pin version drift) is explicitly not mine
this cycle — carried forward to plan-work for M2.

Read `internal/server/browse.go` (the real `GET /api/browse` 404 body text and the
`gitutil.IsRepo` real-`git`-shell-out semantics), `web/src/render/launch.ts` (`showError`/
`clearError`, the `(git)` suffix at line 149, the `.dir-path` write at line 119, the
`metaKey` guard at line 219), and `web/index.html` (`#launch-error` has `role="alert"`
and lives inside the `<dialog>`, so it's reachable via `dialog.locator("#launch-error")`
without colliding with the shell's other two `role="alert"` elements which sit outside
the dialog). Also picked up the review's aside that cycle-2 added `data-note-kind` to
`.note` — not needed for this fix, since none of my four new tests touch note kind.

Four new tests added to `web/e2e/launch.spec.ts`:

1. **"Browse into a directory removed mid-session shows the daemon's error inline and
   keeps the stale listing (Edge Case 14, Launch error line)"** — creates a real
   subdirectory under a `homeScratchDirectory()`, browses into it so the folder browser
   renders a button for it, deletes it on disk between the render and the click (the
   exact race Edge Case 14 describes), clicks the now-stale button, and asserts
   `#launch-error` becomes visible with the daemon's real 404 body text
   (`"directory does not exist or is not a directory"`, from `browse.go`'s literal
   `writeJSONError` call — not a fixture I invented) while the dialog stays open and the
   stale button is still rendered (`renderBrowse` is never called on the error path, so
   the panel is never cleared).
2. **"a real git checkout in the folder browser is marked (git) and a plain
   subdirectory is not (Major 6)"** — shells a real `git init` into one fresh
   subdirectory (matching the reviewer's own note that an empty `.git` directory doesn't
   trigger `gitutil.IsRepo`, which shells out to `git rev-parse --is-inside-work-tree`)
   and leaves a sibling plain directory alone, then asserts the folder browser renders
   `"git-subdir (git)"` for the former and bare `"plain-subdir"` for the latter.
3. **"MRU entry's path span shows the directory's full absolute path, not just its name
   (Major 5)"** — launches into a scratch directory, opens the modal, and asserts
   `.dir-name` holds the basename while `.dir-path` holds the full absolute path on the
   same MRU entry.
4. **"Cmd+N opens the launch modal from anywhere in the shell (REQ-22)"** — dialog closed,
   no button focus, `page.keyboard.press("Meta+n")`, dialog becomes visible.

### Pre-emptive locator fix (reviewer's explicit note)

The reviewer flagged that `launch.spec.ts:69`'s subdirectory locator,
`{ name: dirName, exact: true }`, would break the first time a test browsed into a real
git checkout, since Major 6's fix appends `" (git)"` to that same button's accessible
name. Rather than wait for it to actually break (it wouldn't have, in that specific test —
the fixture there is a plain, never-`git init`'d directory — but the new git-marker test
now exercises the exact code path the reviewer was worried about), I loosened all three
occurrences of that locator in the "Browse… into a fresh directory…" test to
`new RegExp(`^${dirName}( \\(git\\))?$`)`, which matches the bare name or the name with
an optional `" (git)"` suffix. This is a locator change, not an assertion change — the
test still requires the button to exist and be clickable; it now merely tolerates either
of the two names the real product can legitimately produce for a non-git vs. a git
directory.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | "Browse… into a fresh directory launches with the trust-prompt note…" (pre-existing test, not new) | Not a live failure — a latent locator fragility the reviewer flagged by inspection, not by a failing run | `{ name: dirName, exact: true }` can never match once a real git checkout gets the additive `" (git)"` suffix from Major 6's fix, so the locator was accidentally coupled to "this fixture happens not to be a git repo" rather than to the Testable UI Elements contract ("Subdirectory entry — button — the directory's name") | `dialog.getByRole("button", { name: new RegExp(`^${dirName}( \\(git\\))?$`) })` in all three occurrences (enter, verify-after-Up, re-enter) | Still requires the folder-browser button for this exact directory to be visible and clickable, at all three points in the flow — REQ-6/REQ-14/E2 unchanged |

No other spec edit required a repair — all four new tests passed on the first live run
against the current implementation.

No assertion was deleted, skipped, or weakened.

### Re-verify collection suite-wide

```
$ npx playwright test --list
...
Total: 39 tests in 6 files
```

No errors, no duplicate titles.

### Full suite live run (`make e2e`)

Ran the full pipeline gate exactly as instructed: `go build` → `web build` →
`playwright test` (all 6 spec files, 39 tests, `fullyParallel`, 6 workers).

```
Running 39 tests using 6 workers
  ✓ auth.spec.ts (7 tests)
  ✓ ingest.spec.ts (4 tests)
  ✓ launch.spec.ts (9 tests, including the 4 new Major-3 tests and the loosened
    subdirectory-name locator in "Browse… into a fresh directory…")
  ✓ resilience.spec.ts (3 tests)
  ✓ sessions.spec.ts (12 tests)
  ✓ shell.spec.ts (4 tests)

  39 passed (17.1s)
```

No console errors observed; no real `claude` binary invoked (the scratch daemon's
`-claude-bin` stub is used for every launch, exactly as in every other file in this
suite); the only real external process invoked from a test body was `git init`, run
against a throwaway scratch directory removed in the test's `finally` block.

### Notes (fix attempt 2)

- Did not touch `web/playwright.config.ts` or any global setup/teardown file.
- Did not touch anything under `web/src/`, `cmd/`, or `internal/` — all four new tests
  passed against the implementation as it already stood; no implementation-bug findings
  this cycle.
- Minor 6 (canary-fields.md probe-version drift vs. `docs/claude-code-pin.md`) is
  `[plan-work]`'s per the review, not touched here.
- Critical 1 (plain re-bind leaving `attention`/`failure` set) and Major 1/2
  (`[daemon-impl]`) are not `[e2e-specs]` issues this cycle and were left untouched.
