# E2E Test Specs: Settings Update Failures

**Plan**: settings-update-failures
**Mode**: fix (attempt 3, review cycle 3)
**Pack**: `kb: pack 12697 words (budget 8000)` — WARN exceeds budget of 8000 words; sections rules 885 · features 5124 · diagrams 0 · decisions 3642 · proposed 0 · facts 71 · lessons 2325 · runbooks 644
**Verdict**: pass
**Tests created**: 2 new (`update.spec.ts`'s sessionStorage-accessor test, `resilience.spec.ts`'s steady-daemon-down mutation test) in Fix Attempt 1; 1 new (`update.spec.ts`'s protocol-mismatch-on-reconnect test) in Fix Attempt 2; 2 existing tests strengthened (E1, E2 remedy-containment); 1 existing test's timing assertion made load-bearing (E5); no new test in Fix Attempt 3 (comment-only correction)
**Live run**: 27/27 passing in `update.spec.ts` alone (Fix Attempt 3) — see Fix Attempt 3 (review cycle 3) below. Fix Attempt 2: 27/27 passing in `update.spec.ts` alone, 454/454 in the full suite, 270/270 in a 10x soak of `update.spec.ts`. Fix Attempt 1: 30/30 passing across `update.spec.ts` + `resilience.spec.ts`, 453/453 in the full suite, 260/260 in a 10x soak of `update.spec.ts` and 40/40 in a 10x soak of `resilience.spec.ts`.

## Tests

All five new tests land in the existing `web/e2e/update.spec.ts` (the plan's own Fixture plan
header names this file, `startDaemon`, for every test — a staged versioned binary, its
directory's state and the release base URL are all computed per test). No new spec file, no
new helper file: the plan introduces no new UI element (the banner is
`page.getByRole("alert")`, already used by `resilience.spec.ts` and the pre-existing restart
tests in this file), so `web/e2e/helpers/update.ts` needed no edit.

| File | Test Name | Requirement | What It Verifies | Status |
|------|-----------|-------------|------------------|--------|
| web/e2e/update.spec.ts | a binary staged inside a scratch git tree shows the checkout root in the remedy; removing .git and pressing Check now enables Update and clears the status line (E1, REQ-2) | REQ-2, REQ-4, REQ-7 | The exact composed unmanaged-in-git-tree remedy naming the resolved path and checkout root; after the `.git` ancestor is removed, a manual check re-derives the classification (D1/D4) and both apply buttons enable with no restart | collection-only |
| web/e2e/update.spec.ts | a binary staged in a chmod 0555 directory shows the not-writable remedy; chmod 0755 and pressing Check now enables Update (E2, REQ-1) | REQ-1, REQ-4, REQ-7 | The exact composed unwritable-directory remedy naming the resolved path, directory and `permission denied`; after the directory is made writable, a manual check clears the blocker and enables Update | collection-only |
| web/e2e/update.spec.ts | Check now against a stopped release host shows the exact couldn't-reach-the-release-host sentence (E3, REQ-8) | REQ-8, REQ-10 | The 502 `check_failed` message reaching the dialog is the exact one-sentence, URL-free REQ-8 text for a connection-refused transport failure, replacing today's whole Go transport chain | collection-only |
| web/e2e/update.spec.ts | Update fails with the exact download-failure sentence when the release host stops before the click, leaving the on-disk binary byte-identical (E4, REQ-9) | REQ-9, REQ-10 | `apply.error` for a download failure is the exact one-sentence, URL-free REQ-9 text (`couldn't download <asset> (connection refused); nothing was installed`), and the on-disk binary is untouched | collection-only |
| web/e2e/update.spec.ts | Update and restart reloads the page: a pre-restart window marker is gone afterwards, the banner confirms the new version then hides, and Running shows it (E5, E6, REQ-16, REQ-17) | REQ-13, REQ-16, REQ-17, REQ-18 (implicit) | A `window` marker set before the restart click is gone after the flow completes (proving `location.reload()` ran, REQ-16), the banner reads exactly `Updated to v<new>.` then hides (REQ-17), and the reloaded page's Running readout shows the new version | collection-only |

Both E1/E2 titles and REQ-8/REQ-9's E3/E4 are new tests, not edits to the plan's own
same-lettered predecessors (`update.spec.ts`'s existing E13/E9/E11/E7 from the earlier
auto-update and rail-card-improvements-2 plans) — this codebase already tolerates the same
`(E<n>)` tag recurring across plans in this file (e.g. two distinct tests both tagged `(E9)`
already coexist at lines 485 and 839), so uniqueness is by full title text, not the tag.

### Regression pins (pre-existing, unchanged-behaviour REQs)

The plan maps several unchanged-behaviour requirements onto **pre-existing** tests rather than
new ones (REQ-3's Homebrew remedy, REQ-9's "every other failure keeps its current sentence"
plus its own named pins, and the restart-flow tests' banner visible/hidden checks). Per this
role's "Regression pins run live at authoring" rule, all eight were rebuilt (`make web-build
build`) and run live against the current tree, not just asserted compatible by reading. All
eight passed — full output under Test Run Output.

| File | Test Name | Requirement | What It Verifies | Status |
|------|-----------|-------------|------------------|--------|
| web/e2e/update.spec.ts | a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy (E9, REQ-21, edge case 11) | REQ-3 | Homebrew remedy text (`installed by Homebrew — run brew upgrade musterd`) is unchanged by this plan | ran-green-at-authoring |
| web/e2e/update.spec.ts | each verification refusal reports Update failed and leaves the on-disk binary byte-identical (E7, INV-3, REQ-24) | REQ-9 ("every other failure keeps its current sentence") | `/^Update failed: /` still matches for every verification-refusal tamper kind | ran-green-at-authoring |
| web/e2e/update.spec.ts | pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value (E11) | REQ-8 (superseded wording, loose pin) | `/fail/i` still matches the (about-to-change) check-failure text | ran-green-at-authoring |
| web/e2e/update.spec.ts | a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13, REQ-21, edge case 9) | REQ-2 (superseded wording, loose pin) | `/install\.sh\|curl/i` still matches the (about-to-change) unmanaged remedy text | ran-green-at-authoring |
| web/e2e/update.spec.ts | Update and restart brings back the same Claude session, its terminal, and an unchanged tmux pane PID (E5, INV-5 one-session case) | REQ-13/14/16/17 (banner shape, unasserted text) | Generic `banner.toBeVisible()` / `toBeHidden()` around a real restart still holds | ran-green-at-authoring |
| web/e2e/update.spec.ts | Update and restart with two Claude sessions and a plain shell names the shell in the confirm, then removes only the shell (E6, INV-5 two-session case) | REQ-13/14/16/17 (banner shape, unasserted text) | Same generic banner check, two-session variant | ran-green-at-authoring |
| web/e2e/update.spec.ts | Update and restart returns the dashboard on the same port and data dir (E12, INV-7) | REQ-13/14/16/17 (banner shape, unasserted text) | Same generic banner check | ran-green-at-authoring |
| web/e2e/update.spec.ts | Restart now after a plain Update shows the confirm and completes with no second download (E15, REQ-25) | REQ-13/14/16/17 (banner shape, unasserted text) | Same generic banner check, restart-only-apply variant | ran-green-at-authoring |

## Fixture Changes

No new fixtures, no new helper exports needed. Reused: `startReleaseServer`/`stageInstaller`
(local to `update.spec.ts`), `buildVersionedMusterd`/`stageBinary` (`helpers/daemon.ts`),
`archiveAssetName`/`goArch` (`helpers/releases.ts`, already exported — newly imported into
`update.spec.ts` for E4's exact asset-name construction), `page.getByRole("alert")` for the
banner (the same locator `resilience.spec.ts` and this file's own pre-existing E5/E6/E12/E15
tests already use for the daemon-down / restart banner — no new locator helper was needed
because the plan adds no new *role or name*, only new *text* on the existing `#banner`
element). Added `chmod` to the `node:fs/promises` import for E2's read-only-directory
fixture.

No hook or status-line payload is synthesized by any of the five new tests (same as the rest
of this file — the plan adds no Claude Code ingest path).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | chmod 0555 directory test (E2) |
| REQ-2 | scratch git tree test (E1) |
| REQ-3 | unchanged — covered by the pre-existing Homebrew test (E9, line 485) |
| REQ-4 | E1, E2 (the recheck-then-enable half of both) |
| REQ-7 | E1, E2 (Update enables only once the current, not startup, classification clears) |
| REQ-8 | E3 |
| REQ-9 | E4 |
| REQ-10 | E3, E4 (both assert the exact sentence, which by construction carries no `://`) |
| REQ-11 | daemon-side (log level) — not E2E-observable; left to daemon-tests |
| REQ-12 | daemon-side (`exe` log field) — not E2E-observable; left to daemon-tests |
| REQ-13, REQ-16, REQ-17 | E5/E6 combined test |
| REQ-14 | plan Reviewer-Verified W11: sub-second, real-restart-only display — review-browser's job, not E2E's (explicitly out of this suite's scope per the plan) |
| REQ-15 | web-tests W2 (pure banner-derivation function, needs a 30s-or-more fake-clock case no E2E test can afford) — not in this plan's own E2E Acceptance Criteria (E1–E6) |
| REQ-18 | web-tests W4 (pure function) — not in this plan's own E2E Acceptance Criteria |
| REQ-19 | plan Reviewer-Verified W10: computed-style/theme check — review-browser's job |

REQ-11, REQ-12, REQ-14, REQ-15, REQ-18, REQ-19 are deliberately not covered by new E2E
tests: the plan's own **E2E** Acceptance Criteria section lists exactly E1 through E6, and
explicitly routes the sub-second restarting banner (W11) and the neutral-token check (W10)
to review-browser, and the 30s-fallback/non-restarting-drops-the-record logic to the web
unit-test agent's pure-function table (W1–W7), which can drive a fake clock past 30s in a
way no E2E test reasonably can.

## Repairs

Not applicable — authoring mode, no prior run to repair.

## Test Run Output

Collection (authoring mode; every new test asserts behaviour that does not exist yet, so none
is a regression pin and none was run per
`docs/lessons/authored-tests-never-run-before-validate`'s "collection-only" bucket):

```
$ npx playwright test --list
...
Total: 451 tests in 42 files
```

451 = 446 pre-existing + 5 new (`update.spec.ts` alone: 20 pre-existing + 5 new = 25). No
duplicate titles, no import/syntax errors. `npx tsc --noEmit -p .` and
`npx biome check e2e/update.spec.ts` both clean.

All 5 new tests are `collection-only` (see the Tests table's Status column for the
per-requirement reason).

None of the 20 pre-existing tests in this file were edited. Rebuilt (`make web-build build`,
binary stamped `v0.18.2-52-g9735d1e-dirty`) and ran the 8 pre-existing tests this plan's
Coverage table leans on for an unchanged-behaviour requirement — REQ-3's Homebrew remedy
(E9), REQ-9's "every other failure keeps its current sentence" plus the plan's own named pins
(E7, E11, E13), and the four restart-flow tests whose generic banner visible/hidden checks I
called compatible with the new text (old E5, E6, E12, E15) — live against the current tree
rather than only reasoning about them:

```
$ npx playwright test e2e/update.spec.ts -g "a binary staged under \$HOMEBREW_PREFIX badges but disables both buttons with the brew remedy|each verification refusal reports Update failed and leaves the on-disk binary byte-identical|pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value|a binary staged inside a scratch git tree badges but disables both buttons naming the installer|Update and restart brings back the same Claude session|Update and restart with two Claude sessions and a plain shell|Update and restart returns the dashboard on the same port and data dir|Restart now after a plain Update shows the confirm and completes with no second download"
Running 8 tests using 4 workers

  ✓  4 [chromium] › e2e/update.spec.ts:485:1 › a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy (E9, REQ-21, edge case 11) (9.9s)
  ✓  3 [chromium] › e2e/update.spec.ts:269:1 › Update and restart brings back the same Claude session, its terminal, and an unchanged tmux pane PID (E5, INV-5 one-session case) (12.6s)
  ✓  1 [chromium] › e2e/update.spec.ts:331:1 › Update and restart with two Claude sessions and a plain shell names the shell in the confirm, then removes only the shell (E6, INV-5 two-session case) (14.9s)
  ✓  5 [chromium] › e2e/update.spec.ts:650:1 › Update and restart returns the dashboard on the same port and data dir (E12, INV-7) (6.2s)
  ✓  6 [chromium] › e2e/update.spec.ts:697:1 › a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13, REQ-21, edge case 9) (4.0s)
  ✓  8 [chromium] › e2e/update.spec.ts:926:1 › pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value (E11) (3.4s)
  ✓  2 [chromium] › e2e/update.spec.ts:409:1 › each verification refusal reports Update failed and leaves the on-disk binary byte-identical (E7, INV-3, REQ-24) (22.0s)
  ✓  7 [chromium] › e2e/update.spec.ts:786:1 › Restart now after a plain Update shows the confirm and completes with no second download (E15, REQ-25) (7.7s)

  8 passed (24.0s)
```

All 8 green on the current (pre-implementation) tree. Nothing in this diff touched any of
their lines — only imports and new test bodies were added to the file — so this run is
belt-and-braces confirmation of the compatibility claim, not a defect hunt; had any gone red
it would have meant the diff broke something despite that, and I'd have reported it rather
than weakening anything.

## Notes

- **Path/root construction for E1/E2** follows the same symlink-resolution precedent as the
  pre-existing Homebrew test (E9, line ~485): `mkdtemp(tmpdir())` returns a macOS
  `/var/folders/...` path that is itself a symlink to `/private/var/folders/...`, and REQ-1/
  REQ-2's `<path>`/`<dir>`/`<root>` are all built from the daemon's own *resolved* executable
  path, so the test resolves `scratchRoot` via `realpath()` before composing the expected
  remedy string. This is an inference from REQ-1's own "`<path>` is the resolved executable
  path" wording plus the existing E9 precedent, not a measured fact — if validate mode finds
  the daemon composes the remedy from the unresolved path instead, that is a one-line locator
  repair (drop the `realpath` call), not a defect in the daemon.
- **E3's exact-text assertion** assumes the status line renders the REQ-8 message verbatim
  with no added prefix (per `buildUpdateViewModel`'s `statusText`, a manual check's
  `checkState.error` — which is exactly the 502 body's `message` field per
  `kb:adr/update-manual-check-is-a-synchronous-post` — is rendered as-is, unlike an apply
  failure which the view model prefixes with `Update failed: `). This is read directly off
  today's `web/src/features/updateview.ts`, which this plan does not change in that respect
  (only `apply.error`'s composed text and the daemon's 502 body text change).
  `internal/server/update.go` owning the actual 502 body wording is daemon-impl's; a mismatch
  there is a `[daemon-impl]` implementation-bug at validate, not a spec defect.
- **E4's asset filename** is built from `archiveAssetName(NEW_VERSION, goArch())` — the same
  machine-derived helper the pre-existing E7/E9/E13 tests rely on — rather than a hardcoded
  `darwin_arm64`/`darwin_amd64` literal, so the test runs correctly on either Apple Silicon or
  Intel CI/dev hardware.
- **E5/E6 deliberately does not assert the transient "Updating musterd… — restarting" banner
  text** (REQ-14). The plan's own Reviewer-Verified section (W11) calls this out explicitly as
  a sub-second display during a real restart that E2E cannot assert as settled, and assigns it
  to review-browser. Trying to catch it here would be exactly the kind of assertion this
  plan's own authors flagged as unfit for this harness.
- **No test asserts REQ-15's 30-second unreachable fallback or REQ-18's non-restarting-phase
  drop.** Both are pure functions of `(record, connection, now, confirmation)` per the plan's
  own Affected Files note on `web/src/features/updaterestart.ts`, and the plan's own Web
  Acceptance Criteria (W1–W7) — not its E2E Acceptance Criteria (E1–E6) — own them. A 30-second
  real wait inside an E2E test would also eat a large fraction of the file's default 60s test
  timeout for one assertion; the web-tests agent's fake-clock table test is the correct,
  proportionate home for it.
- **Handoff for daemon-impl/web-impl**: none beyond the plan itself — every helper this file's
  new tests need (`buildVersionedMusterd`, `stageBinary`, `chmod`, `archiveAssetName`,
  `goArch`, `page.getByRole("alert")`) already exists; no new `ScratchDaemonOptions` field, no
  new locator helper, no new fixture. If validate mode finds the actual remedy/error wording
  differs from REQ-1/REQ-2/REQ-8/REQ-9's literal text, that is a `[daemon-impl]` bug, not an
  e2e-specs repair target, since these strings are pinned verbatim by the plan itself.

## Validate Attempt 1

Rebuilt (`make web-build build` from the project root; binary stamped
`v0.18.2-60-g370f2e9`), then ran the plan's spec file live from `web/`.

### Step 1: spec file live

```
$ npx playwright test e2e/update.spec.ts
Running 25 tests using 4 workers
  ... (all 25, including the 5 new tests) ...
  25 passed (47.2s)
```

All 5 new tests (E1 git-tree remedy, E2 unwritable-dir remedy, E3 check-failure sentence, E4
apply-failure sentence, E5/E6 combined restart-reload/confirm/Running-readout) passed on the
first run — no repair needed.

### Step 2: collection re-check

```
$ npx playwright test --list
Total: 451 tests in 42 files
```

Clean — no duplicate titles, no new import errors.

### Step 3: full-suite sweep

```
$ make e2e
... 451 passed (3.0m)
```

### Step 4: soak of the one spec file this plan changed

```
$ make e2e-soak SPEC=e2e/update.spec.ts N=10
Running 250 tests using 4 workers
...
  1 failed
    [chromium] › e2e/update.spec.ts:1222:1 › Update and restart reloads the page: a
    pre-restart window marker is gone afterwards, the banner confirms the new version then
    hides, and Running shows it (E5, E6, REQ-16, REQ-17)  (19.1s)
  249 passed (6.4m)
make: *** [e2e-soak] Error 1
```

One failure in 250 executions, in the one new test this plan added for the update-restart
reload/confirmation flow (`e2e/update.spec.ts:1222`). Per this role's soak rule ("A red soak is
yours to fix now, never a flake to report"), I investigated root cause rather than re-running
or reporting it as noise.

### Root cause investigation

The failing assertion:
```
Error: expect(locator).toHaveText(expected) failed
Locator: getByRole('alert')
Expected: "Updated to v0.2.0."
Timeout: 15000ms
Call log:
  3 × locator resolved to <div id="banner" role="alert" class="banner">musterd unreachable — hook output in open panes i…</div>
```

The saved `error-context.md` accessibility snapshot at the moment of timeout showed
`status: connected` in the masthead — i.e. by the time the assertion gave up, the WS **was**
reconnected, but the banner was still showing the stale pre-restart "musterd unreachable" text
rather than either "Updated to v0.2.0." or nothing.

I tried to reproduce this in isolation to rule out a locator/wait defect of my own: a throwaway
spike file (`e2e/_spike_repro.spec.ts`, deleted before finishing, never committed) ran this
exact test body 40 times (10 + 30 repeats, 4 workers) with `console`/`pageerror` listeners
attached. Zero failures, zero console errors. This ruled out a browser-side JS exception and
told me the flake needs the *specific* contention of the full 25-test file soaking together
(real tmux sessions, terminal streaming, concurrent `go build`s from other tests), not just
this one test repeated.

Reading the actual code path confirms a genuine, pre-existing race rather than anything wrong
with my locators/waits:

- `web/src/features/updaterestart.ts`: a restart record is created only when this window's
  own `app.on("update", …)` handler *receives* a WS message with `apply.phase === "restarting"`
  (REQ-13). If it never receives that message, `record` stays `null` forever, `helloReceived`'s
  handler becomes a no-op (`if (record === null || reloaded) return;` — no reload, no
  `sessionStorage` handoff), and the window just does an ordinary WS reconnect with no
  confirmation banner. This is exactly the plan's own **edge case 14** ("A restart broadcast
  lost before the drop: no record, so the ordinary unreachable banner, and no reload on
  reconnect → W3") — named, expected, and routed to a unit test, not E2E.
- `internal/server/ws.go`'s `wsHub.broadcast` is **explicitly non-blocking**: `select { case
  ch <- msg: default: }` (comment: "non-blocking: a full outbox drops the message... rather
  than stalling the caller"). The actual network write happens later, in each connection's own
  goroutine loop inside `handleWS`: `select { case <-ctx.Done(): return; case msg :=
  <-outbox: wsjson.Write(...) }`.
- `cmd/musterd/main.go`'s restart path (`case <-srv.RestartRequests(): … stopForRestart(...)`)
  runs immediately after `updatemanager.go`'s `setApplyPhase(PhaseRestarting, …)` enqueues that
  exact message onto the outbox. `stopForRestart` → `srv.Shutdown` → `s.hub.closeAll()` closes
  every connection (`c.Close(...)`), which cancels each connection's `ctx` (`CloseRead`
  cancels on close).
- So there is a real, unguarded race between "the restarting message sits in the client's
  buffered `outbox` waiting to be written" and "the connection gets closed for the re-exec" —
  Go's `select` in `handleWS`'s writer loop picks pseudo-randomly between `ctx.Done()` and a
  ready `outbox` message when both are ready, so the last-ever broadcast before a restart can
  legitimately be dropped. Under normal (unloaded) conditions the writer goroutine almost
  always wins because there's essentially zero scheduling delay on localhost; under the CPU
  contention four parallel workers each running real daemon restarts creates, the goroutine
  occasionally loses.

This matches the observed symptom exactly: the window never held a restart record, so it never
reloaded, and it just sat on the ordinary "musterd unreachable" text until its own periodic
1s `app.onRender` tick (`main.ts`'s `setInterval(app.render, 1000)`) got around to hiding it —
which the 15s assertion window happened to just miss.

### Verdict and what I did NOT do

I did not weaken the assertion. Falling back to `toBeVisible()`/`toBeHidden()` (the pattern the
plan's own *pre-existing* sibling tests at lines 269/331/650/786 use for this same real-restart
flow) would tolerate this exact race — but that is precisely the forbidden pattern this role's
instructions name verbatim ("replacing a value check with a weaker one, e.g. `toBeVisible()`
on the container instead of asserting the value inside it"), and I have no authority to decide
unilaterally that REQ-16/17's confirmation is now best-effort rather than guaranteed. I also
did not raise the assertion's timeout — only shortening is permitted, and the underlying
message-loss race isn't a matter of "not enough time," it's a dropped message that no amount
of extra waiting recovers (no record ever arrives to trigger a reload).

**Verdict: `implementation-bug`.** The plan's own E2E Acceptance Criterion **E5** ("Update and
restart reloads the page… the banner shows `Updated to v<new>.` then hides") states this as an
unconditional outcome, but the daemon's non-blocking broadcast (`wsHub.broadcast`, by design,
per its own comment) racing against the immediate `closeAll()` in the restart path means REQ-13
("A window that receives an `update` message with `apply.phase` `restarting` holds a restart
record") is not reliably satisfied for the *specific* message that matters most — the one sent
microseconds before the daemon tears down its own listeners for re-exec. This is architecturally
foreseeable (the plan's own edge case 14 names it) but nothing in the restart path guarantees
delivery of that one broadcast before the socket closes, so REQ-16/17 cannot be guaranteed
either. A fix belongs to daemon-impl: e.g. give the restarting-phase broadcast a bounded
synchronous flush (or a short drain window) before `stopForRestart` calls `closeAll()`, so the
race is closed for the message REQ-13 depends on, rather than shared fate with every other
best-effort broadcast.

I left my test exactly as authored — no repair table, no assertion change. `git diff --stat`
confirms nothing under `web/e2e/` changed in this attempt.

## E2E Implementation Bugs (validate attempt 1)

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| The `restarting`-phase `update` broadcast can be dropped by the daemon's own non-blocking `wsHub.broadcast` racing the immediate `closeAll()` in the restart path, so a window occasionally never holds a restart record and REQ-16/17's reload+confirmation never fires | `[daemon-impl]` | REQ-13 (record held on receipt), REQ-16/17 (reload + confirmation), E2E Acceptance Criterion E5 | Every `Update and restart` click reliably shows `Updated to v<new>.` then hides, per E5 | Once in 250 soak executions, the client reconnected (`status: connected`) but never reloaded and never showed the confirmation — it sat on the stale pre-restart "musterd unreachable" text until its own 1s render tick hid it, past the assertion's 15s window. Root-caused to `internal/server/ws.go`'s `wsHub.broadcast`'s `select {ch<-msg; default:}` racing `cmd/musterd/main.go`'s `stopForRestart` → `srv.Shutdown` → `s.hub.closeAll()`, immediately after `updatemanager.go`'s `setApplyPhase(PhaseRestarting, …)` enqueues that exact message. Matches the plan's own named, accepted edge case 14, but E5 states the outcome unconditionally | `web/e2e/update.spec.ts:1222` "Update and restart reloads the page: a pre-restart window marker is gone afterwards, the banner confirms the new version then hides, and Running shows it (E5, E6, REQ-16, REQ-17)" |

## Notes (validate attempt 1)

- No spec file was edited this attempt — the 25/25 single run, the 451/451 full sweep, and the
  one soak flake are all against the spec exactly as authored.
- The throwaway `e2e/_spike_repro.spec.ts` repro file used to rule out a locator/JS-exception
  cause was deleted before finishing; `git status` shows no trace of it.
- `test-results/` (Playwright's own artifact directory, produced by the soak run) was removed
  before committing — it is build output, not a tracked file.
- Handoff for daemon-impl: the suggested fix direction is to make the restart path wait for
  (or synchronously write) the `restarting`-phase broadcast before `stopForRestart` calls
  `closeAll()`, specifically for that one message — not a blanket change to `wsHub.broadcast`'s
  general non-blocking contract, which other callers (the ingest worker) rely on staying
  non-blocking.

## Validate Attempt 2

daemon-impl landed `2ea779e` (`internal/server/ws.go`: `wsHub.closeAll` now calls
`drainOutboxes` before closing sockets — enqueues a `wsDrainAck` marker behind each client's
already-queued messages and waits, bounded by `closeDrainTimeout` = 250ms, for each ack before
proceeding to `Close`; a full outbox is skipped rather than waited on, so `broadcast`'s
non-blocking contract is untouched). daemon-tests covered it in `375c2c0`. Neither commit
touches `web/e2e/`. This attempt re-verifies the fix closes the race my attempt-1 soak found,
against the spec exactly as authored — no repair was needed or made.

### Step 1: rebuild

```
$ make web-build build
...
✓ built in 1.58s
go build -ldflags "-X main.version=v0.18.3-15-g2f09e4a" -o bin/musterd ./cmd/musterd
```

Binary stamped `v0.18.3-15-g2f09e4a`, built after `2ea779e`/`375c2c0`/`2f09e4a` — the harness
now serves the post-fix tree.

### Step 2: spec file live

```
$ npx playwright test e2e/update.spec.ts
Running 25 tests using 4 workers
...
  25 passed (48.4s)
```

All 25 pass, including
`e2e/update.spec.ts:1222:1 › Update and restart reloads the page: a pre-restart window marker
is gone afterwards, the banner confirms the new version then hides, and Running shows it (E5,
E6, REQ-16, REQ-17)` — the test that flaked in attempt 1's soak — in 9.9s, same shape as every
other run.

### Step 3: collection re-check

```
$ npx playwright test --list
Total: 451 tests in 42 files
```

Clean — no duplicate titles, no new import errors.

### Step 4: full-suite sweep

```
$ make e2e
...
  451 passed (3.1m)
```

### Step 5: soak of the spec file that caught the race

```
$ make e2e-soak SPEC=e2e/update.spec.ts N=10
Running 250 tests using 4 workers
...
  250 passed (6.7m)
```

All 250 executions (25 tests × 10 repeats) passed, including 10/10 runs of the
E5/E6/REQ-16/REQ-17 restart-reload test that flaked once in attempt 1's 250-execution soak
(each in ~9.9–10.8s, consistent with the non-flaked runs). No flake this attempt, at the same
soak size that surfaced the original race — consistent with `drainOutboxes` closing the
specific window (`broadcast()`-enqueued-but-not-yet-written racing `closeAll`'s `Close`) my
attempt-1 root-cause analysis identified.

### What I did and did not change

`git status`/`git diff --stat` show the working tree clean before and after this attempt's
runs — no file under `web/e2e/` was touched, no repair was needed. The spec is exactly as
authored in the original authoring pass; only the daemon under test changed between attempt 1
and attempt 2.

No assertion was deleted, skipped, or weakened.

**Verdict: `pass`.** The daemon-impl fix (`2ea779e`) closes the race my attempt-1 soak
surfaced and root-caused; the spec's REQ-16/REQ-17 assertions (unchanged since authoring) now
hold reliably across a live run, a full 451-test sweep, and a 250-execution soak of the exact
file and size that caught the original flake.

## Fix Attempt 1 (review cycle 1)

**Issue addressed** (review.md cycle 1, tagged `[e2e-specs]`): "E5 could not fail for Minor 1
or Major 1. Its `await expect(banner).toBeHidden()` inherits the 15 s expect timeout, so a
confirmation lasting anywhere up to about 15 s passes. E1 and E2 assert only `toHaveText` on
`#update-status`, never its box against the dialog." (`web/e2e/update.spec.ts` E5, E1, E2.)

Also covered, per this cycle's prompt, new user-facing behaviour from the two implementation
logs' Fix Attempt sections that had no tagged issue but is mine to assert
(kb:lesson/dom-behaviour-gap-between-test-agents):
- web-implementation.md: (a) the Settings dialog no longer overflows with an unmanaged remedy
  shown; (b) the "Updated to v…" confirmation hides within ~100 ms of 3 s; (c) a steady
  daemon-down produces no `#banner` mutations (web-tests explicitly declined this as
  DOM-tangled controller state); (d) a throwing `window.sessionStorage` accessor still boots
  and connects the dashboard.
- daemon-implementation.md: the check-failure fourth class now has a single `update check
  failed:` prefix — assessed for E2E reachability below.

### Changes made

| File | What and why |
|------|---------------|
| `web/e2e/helpers/update.ts` | New `expectRemedyContained(dialog)`: asserts `#update-status`'s right edge ≤ the dialog's own right edge, and the dialog's `scrollWidth == clientWidth` — the exact oracle review-browser measured for the dialog-overflow defect. Imports `expect` from `@playwright/test` directly (precedent: `helpers/terminal.ts`). |
| `web/e2e/update.spec.ts` (E1, REQ-2) | Calls `expectRemedyContained(dialog)` right after the existing `toHaveText` assertion, while the git-checkout remedy is still shown. |
| `web/e2e/update.spec.ts` (E2, REQ-1) | Same call, while the not-writable remedy is still shown. |
| `web/e2e/update.spec.ts` (E5, E6, REQ-16, REQ-17) | Replaces the untimed `await expect(banner).toBeHidden()` with: an `addInitScript`-installed `MutationObserver` on `#banner` (re-attached on every fresh document the page loads, including the reload REQ-16 triggers, so it's present from the confirmation's first paint and isn't biased by the gap between an `expect` resolving and a later `page.evaluate` attaching a fresh observer); a `toBeHidden({ timeout: 4_500 })` (shortened from the config's 15 s default, with a comment, per the harness's shorten-only rule); and a duration check on the observer's own recorded shown/hidden timestamps, asserting the gap is `> 2_700` and `< 3_400` ms. |
| `web/e2e/update.spec.ts` (new) | `"dashboard still boots and connects when the window.sessionStorage accessor itself throws"` — `addInitScript` shadows the `window.sessionStorage` getter to throw a `SecurityError`, then asserts the connection status reads connected and, after `daemon.kill()`, the ordinary daemon-down banner still appears. Uses the plain `daemon` fixture (the file's header comment now notes this one exception and why). |
| `web/e2e/resilience.spec.ts` (new) | `"a steady daemon-down produces no #banner mutations for its role=alert to re-announce"` — kills the daemon, waits for the banner to settle, then attaches a `MutationObserver` and uses `settleFor(page, 5_000)` (the sanctioned fixed wait for a stays-unchanged check) to assert the mutation count is exactly `0`. |

Daemon fourth-class prefix fix: **not E2E-reachable through the existing fake release host**,
so no test was added for it. `internal/selfupdate/release.go`'s `LatestTag` returns the
untyped fallback class (`DescribeCheckFailure`'s `return fmt.Sprintf("update check failed: %s",
err.Error())`) only for a 3xx response with no `Location` header. `web/e2e/helpers/releases.ts`
`FakeReleaseServer`'s `/latest` route always sets a `Location` header on every 302 it sends
(`res.writeHead(302, { Location: ... })`) and answers a plain 404 (the `StatusError` class, not
the fallback) when no tag is set via `setLatest` — neither path this fixture already exposes
can produce a redirect with a missing `Location`. Producing one would need a new
`FakeReleaseServer` capability (a bare-redirect response), which is outside "through the
existing fake release host" and isn't a repair to an existing test; flagging it here rather
than extending the fixture unasked.

### Verification

Rebuilt first, every time (`make web-build build`, binary stamped
`v0.18.3-28-g4986f25-dirty`), before every run below.

**Step 1 — spec files live**:
```
$ npx playwright test e2e/update.spec.ts
Running 26 tests using 4 workers
...
  26 passed (44.3s)

$ npx playwright test e2e/resilience.spec.ts
Running 4 tests using 4 workers
...
  4 passed (9.3s)
```

**Step 2 — proving each strengthened/new assertion is load-bearing**, by deliberately
breaking the implementation this fix wave shipped, rebuilding, running the relevant test,
observing red, then restoring the tree (`git diff --stat` showed only my own spec/helper
files touched throughout):

1. E5's duration window: commented out `updaterestart.ts`'s `setTimeout(() => app.render(),
   CONFIRMATION_MS + 50)` (the Minor-1 fix). Result: `Expected: < 3400, Received: 3990.6` —
   fails on the exact pre-fix ~4 s behaviour review-browser measured (3.96–3.99 s).
2. E1/E2's `expectRemedyContained`: reverted `#settings-form .hint`'s `min-width: 0;
   overflow-wrap: anywhere;` (the Major-1 fix) in `web/src/style.css`. Result on both tests:
   `Expected: <= 860, Received: 956.65625` — matches the reviewer's own measured 957 vs 860
   almost exactly.
3. `resilience.spec.ts`'s mutation-count test: forced `connection.ts`'s render phase to always
   rewrite the banner (`if (true || text !== lastBannerText || ...)`, the Minor-3 dedup guard
   defeated). Result: `Expected: 0, Received: 11` — matches the reviewer's own measured "11
   mutation records in 5 s" exactly.

Each repro was rebuilt (`make web-build build`), run, confirmed red, then the source file was
restored from a pre-edit copy and rebuilt again before continuing (`git status --short --
web/src` empty each time).

**Step 3 — collection re-check**:
```
$ npx playwright test --list
Total: 453 tests in 42 files
```

**Step 4 — full-suite sweep**:
```
$ make e2e
...
  453 passed (3.0m)
```

**Step 5 — soak of every spec file this cycle touched**:
```
$ make e2e-soak SPEC=e2e/update.spec.ts N=10
Running 260 tests using 4 workers
...
  260 passed (6.3m)

$ make e2e-soak SPEC=e2e/resilience.spec.ts N=10
Running 40 tests using 4 workers
...
  40 passed (33.4s)
```

No flake in either soak.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | E1 "…shows the checkout root in the remedy…" | `toHaveText` never checked the remedy's box against the dialog, so Major 1's clipping defect was invisible to this test | The spec asserted only the status line's text, never its geometry | Added `expectRemedyContained(dialog)` right after the text assertion | REQ-2's remedy is still asserted verbatim by `toHaveText`; the new call additionally proves it doesn't clip the dialog — proven red pre-fix (repro 2 above: 956.65625 > 860) |
| 2 | E2 "…shows the not-writable remedy…" | Same gap, for REQ-1's remedy | Same | Same `expectRemedyContained(dialog)` call | REQ-1's remedy text assertion is unchanged; the new call proves containment — proven red pre-fix (repro 2 above) |
| 3 | E5 "…reloads the page…" | `await expect(banner).toBeHidden()` inherited the 15 s default, so a confirmation lasting up to ~15 s would still pass — Minor 1's ~4 s regression could never fail this test | The bare `toBeHidden()` call had no timeout tight enough to distinguish the fix's ~3.05 s target from the pre-fix ~4 s defect, and made no duration measurement at all | Shortened the `toBeHidden` timeout to 4.5 s (with a comment) and added a precise duration check (`> 2_700` and `< 3_400` ms) from an `addInitScript`-installed `MutationObserver` | REQ-16/17's text and eventual-hide assertions are unchanged; the new bounds additionally prove the hide lands near the 3 s mark, not up to 15 s later — proven red pre-fix (repro 1 above: 3990.6 ms) |

No assertion was deleted, skipped, or weakened.

### Notes

- The E5 duration measurement is captured via the page's own `MutationObserver`, not derived
  from how long a Playwright `expect` took to poll, because the latter would reintroduce
  exactly the kind of imprecision the original issue flagged. An earlier version of this fix
  that computed `shownAt` from a `page.evaluate()` call issued *after* `toHaveText` resolved
  measured ~2.6 s instead of the true ~3.05 s (the gap between the assertion resolving and the
  observer attaching), which would have made the fixed lower bound (2_700) itself flaky; moving
  the observer's installation into `addInitScript` (which re-runs on the reload) fixed this
  before it reached this log.
- `updaterestart.test.ts`'s own "edge 18" unit test (web-tests, review cycle 1) already proves
  a throwing `sessionStorage` accessor doesn't throw out of `initUpdateRestart` against a mocked
  `app`/`reload`. The new E2E test doesn't duplicate that — it's the only place that can prove
  the *real* dashboard still opens its `/ws` connection and still shows the daemon-down banner
  against a real, hostile `window.sessionStorage`.
- Every deliberate-breakage repro in Step 2 was restored and rebuilt before the next step ran;
  the tree committed below is the one that built and soaked green.

## Fix Attempt 2 (review cycle 2)

No review issue this cycle is tagged `[e2e-specs]`. Per this cycle's prompt, this attempt is a
concrete coverage task (kb:lesson/dom-behaviour-gap-between-test-agents): cover new user-facing
behaviour added by this cycle's implementation fixes that had no tagged issue.

**Behaviour covered** — browser review Minor 1 (cycle 2) / `web-implementation.md`'s Fix Attempt 2:
a window holding a restart record that receives a reconnect `hello` with a different
`protocolVersion` must reload rather than ever showing `#protocol-mismatch` — REQ-16 / edge case
17 ("a protocol bump reloads rather than showing the mismatch screen"). Before this cycle's fix,
`wsapp.ts`'s `onProtocolMismatch` called `connection.showProtocolMismatch()` unconditionally;
`location.reload()` only *schedules* the navigation, so `ws.ts`'s `dispatch` kept running
synchronously and could paint the mismatch screen for one frame before the reload actually
navigated away. The fix (`updaterestart.ts`'s new `UpdateRestartHandle.reloading()`, gated in
`wsapp.ts`'s `onProtocolMismatch`) closes that race.

**Behaviour NOT covered, and why** — daemon-implementation.md's Fix Attempt 3, correctness Major
1: `DescribeCheckFailure`'s fourth-class fallback (`internal/selfupdate/failure.go`) now guards
against leaking a URL for a 300/304/305/306 response with a malformed/missing `Location`, or a
malformed base URL. Checked reachability through the existing fake release host before writing
anything: `web/e2e/helpers/releases.ts`'s `/latest` route (`FakeReleaseServer`'s `handle()`)
either 404s (`setLatest` never called) or always issues `res.writeHead(302, { Location:
`${this.baseURL}/tag/${this.latestTag}` })` — every 302 it sends carries a well-formed
`Location`, and it can produce no other 3xx status and no malformed base URL. Neither of this
fixture's two paths (`StatusError`'s 404, or `TransportError`'s already-fixed-in-cycle-1
301/302/303/307/308 path) reaches the fourth-class fallback branch cycle 2 touched. Producing one
would need a new `FakeReleaseServer` capability (a bare-redirect-with-no-`Location`, or a
malformed-base-URL response), which is outside "through the existing fake release host" this
cycle's prompt scopes e2e-specs to, and isn't a repair to an existing test — flagging it here
rather than extending the fixture unasked, same conclusion Fix Attempt 1 reached for the same
constraint on a sibling fourth-class fix.

### Changes made

| File | What and why |
|------|---------------|
| `web/e2e/update.spec.ts` (new test) | `"a window holding a restart record reloads on a mismatched-protocol reconnect without ever showing the mismatch screen (REQ-16, edge case 17)"` — proxies `/ws` through `page.routeWebSocket`, arms a restart record by sending a synthetic, fully-valid `update` broadcast (`apply.phase: "restarting"`) directly to the page (no real check/apply/download), then closes the routed server-side connection to force a real disconnect/reconnect (same technique `actions.spec.ts`'s E14 test and `general-cleanup.spec.ts`'s pop-out test already use), rewriting only the reconnect's own first `hello` to carry `protocolVersion: 99`. Every `#protocol-mismatch`/`#app` `hidden`-attribute mutation is timestamped via a `page.exposeFunction` binding (Playwright: these "survive navigations", unlike anything on `window`, so the log isn't lost across the fix's own reload) fed by a `MutationObserver` reinstalled on every fresh document via `addInitScript`. Asserts no mutation recorded before the reload's own `load` event ever shows `#protocol-mismatch` unhidden or `#app` hidden, then that the reloaded page reconnects normally. |
| `web/e2e/update.spec.ts` (header comment) | Updated the file's own "every daemon here is `startDaemon`" note to name this as the file's second exception (alongside the pre-existing sessionStorage-accessor test) that takes the plain `daemon` fixture, since it also involves no release check or apply. |

No new helper file, no `helpers/update.ts` edit — the test's WS-proxy and mutation-observer
machinery is local to this one test, following the same "throwaway, test-local instrumentation"
shape `update.spec.ts`'s own E5/E6 test already uses for its `#banner` observer, and
`tiles.spec.ts`/`actions.spec.ts`/`general-cleanup.spec.ts` already use for their own
`page.routeWebSocket` proxies — no shared abstraction existed to extend, and one test is not
enough repetition to justify inventing one.

### Proving the new assertion is load-bearing

Reverted `web/src/wsapp.ts`'s `onProtocolMismatch` to call `connection.showProtocolMismatch()`
unconditionally (kept `updateRestart` referenced via `void updateRestart;` to satisfy `tsc`'s
unused-parameter check without also touching the function signature), rebuilt (`make web-build
build`), and ran the new test alone:

```
$ npx playwright test e2e/update.spec.ts -g "mismatched-protocol reconnect"
  ✘  1 … (2.1s)
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 7
    - Array []
    + Array [
    +   Object {
    +     "appHidden": true,
    +     "mismatchHidden": false,
    +     "t": 1790356801018,
    +   },
    + ]
      > 1526 |   expect(flashed).toEqual([]);
  1 failed
```

Red on exactly the pre-fix defect: one recorded mutation, before the reload, with the mismatch
screen unhidden and `#app` hidden — the flash the reviewer measured. Restored `wsapp.ts` to its
original content (`git diff --stat` showed nothing under `web/src/` after restoring — confirmed
before rebuilding again) and rebuilt (`make web-build build`) before any further run.

### Verification

**Step 1 — the new test alone, on the restored (post-fix) tree**:
```
$ npx playwright test e2e/update.spec.ts -g "mismatched-protocol reconnect"
  ✓  1 … (2.1s)
  1 passed (2.8s)
```

**Step 2 — biome format check** (`make e2e`'s `e2e-lint.sh` step caught one formatting issue in
my own new test's `ws.send(...)` call; fixed with `npx biome check --write
e2e/update.spec.ts`, which touched only that one line — confirmed via `git diff
web/e2e/update.spec.ts`, no other change):
```
$ npx biome check --write e2e/update.spec.ts
Checked 1 file in 55ms. Fixed 1 file.
```

**Step 3 — the whole spec file live**:
```
$ npx playwright test e2e/update.spec.ts
Running 27 tests using 4 workers
...
  27 passed (45.8s)
```
Includes the new protocol-mismatch test (871 ms) alongside every pre-existing test in the file,
unmodified except the header-comment and biome-formatting edits above.

**Step 4 — collection re-check**:
```
$ npx playwright test --list
Total: 454 tests in 42 files
```
454 = 453 (Fix Attempt 1's count) + 1 new test. No duplicate titles, no import errors.

**Step 5 — full-suite sweep**:
```
$ make e2e
...
  454 passed (3.0m)
```

**Step 6 — soak of the one spec file this attempt touched**:
```
$ make e2e-soak SPEC=e2e/update.spec.ts N=10
Running 270 tests using 4 workers
...
  270 passed (6.3m)
```
No flake across 270 executions (27 tests × 10 repeats), including 10/10 runs of the new
protocol-mismatch test (each 848 ms–928 ms, consistent with the single-run timing above).

`git status --short` after every step above shows only `web/e2e/update.spec.ts` modified; no
`test-results/` artifact was committed.

### Repairs

Not applicable — no existing assertion was changed or found broken; this attempt only adds one
new test and widens one header comment's factual claim (two exceptions instead of one, both true
before and after this edit).

No assertion was deleted, skipped, or weakened.

### Notes

- `daemon-implementation.md`'s Fix Attempt 3 also touched `internal/server/ws.go` (`newWSHub`
  constructor signature) and three doc-comment rewordings (`update.go`, `main.go`,
  `updatemanager.go`) — none of these are user-facing behaviour; they're covered by that agent's
  own Go build/vet/lint verification, not E2E's.
- `web-implementation.md`'s Fix Attempt 2 also reworded a comment in `updaterestart.ts`
  (correctness Major 3: the confirmation's true timing bound) and `web/src/features/CLAUDE.md`
  (correctness Major 4: the two-controllers-for-update fact) — neither is user-facing behaviour
  either; Major 3's actual timing behaviour (the confirmation landing within ~100 ms of 3 s) was
  already covered by this file's E5/E6 test in Fix Attempt 1, which this attempt did not need to
  touch again.
- The new test's `rewriteNextHello` flag resets to `false` the instant it rewrites one `hello`, so
  the reloaded page's own reconnect gets an unmodified, matching `hello` and ends up connected —
  deliberately narrower than the reviewer's own X5 proto99 instrument (review.md Notes item 2),
  which kept rewriting every hello and so also observed the *next* page legitimately showing the
  mismatch screen ("the correct steady state for a real protocol bump against a stale bundle...
  not a defect"). This test doesn't need or assert that adjacent, expected behaviour, so it
  doesn't reproduce it.

## Fix Attempt 3 (review cycle 3)

**Task**: cycle 3 wave 1 identified (not a `[e2e-specs]`-tagged review issue, but a concrete
task this cycle's wave 1 created) that web-impl's cycle-3 fix (c829d15) moved the
protocol-mismatch suppression during a restart reload out of `wsapp.ts`'s `onProtocolMismatch`
(now a one-line delegation: `onProtocolMismatch: () => connection.showProtocolMismatch()`) into
`features/connection.ts`'s `showProtocolMismatch()`, which reads `reloading()` through
`ConnectionDeps`. The comment above the E16/edge-case-17 test in `update.spec.ts` (around what
was line 1395) still named `wsapp.ts`'s `onProtocolMismatch` as the gate, which was no longer
true.

**Fix**: re-read `web/src/wsapp.ts` and `web/src/features/connection.ts` to confirm the current
split — `wsapp.ts:84` is now `onProtocolMismatch: () => connection.showProtocolMismatch()`
(pure relay, no decision), and the `reloading()` check that suppresses the mismatch screen lives
in `connection.ts:174-175`'s `showProtocolMismatch()` body (`if (deps.reloading()) return;`).
Updated the test's comment (`web/e2e/update.spec.ts`, above the test named "a window holding a
restart record reloads on a mismatched-protocol reconnect without ever showing the mismatch
screen (REQ-16, edge case 17)") to say the race is closed by `features/updaterestart.ts`'s
`reloading()` plus `features/connection.ts`'s `showProtocolMismatch()` gate, and rewrapped the
surrounding lines so none exceeds the file's line-length convention. `grep -rn
"onProtocolMismatch" web/e2e/` found no other reference to the old gate location anywhere in the
E2E tree. No assertion, locator, or test logic was touched — the test body and every `expect`
call are byte-identical to Fix Attempt 2's version.

**Step 1 — biome**:
```
$ npx biome check e2e/update.spec.ts
Checked 1 file in 39ms. No fixes applied.
```

**Step 2 — rebuild** (`make web-build build` from the project root; binary embeds the
dashboard, so this runs before the test): built clean, `go build -ldflags
"-X main.version=v0.18.3-49-g73965a0-dirty" -o bin/musterd ./cmd/musterd` succeeded.

**Step 3 — live run** (`npx playwright test e2e/update.spec.ts` from `web/`):
```
Running 27 tests using 4 workers
  ...
  27 passed (46.9s)
```
All 27 tests in the file pass, including test 27, the one whose comment this attempt edited
("a window holding a restart record reloads on a mismatched-protocol reconnect without ever
showing the mismatch screen (REQ-16, edge case 17)" — 868ms).

`git diff --stat` after this attempt shows only `web/e2e/update.spec.ts` (comment lines) and
this log file changed.

### Repairs

Not applicable — no assertion, locator, or wait was touched; this attempt only corrects a
factual claim in a comment (the gate's current home) to match web-impl's cycle-3 refactor.

No assertion was deleted, skipped, or weakened.

### Notes

- The old comment's claim ("`wsapp.ts`'s `onProtocolMismatch` gate") was true as of Fix Attempt
  2 (review cycle 2), when `wsapp.ts`'s handler itself called `deps.reloading()` before invoking
  `connection.showProtocolMismatch()`. Cycle 3's `c829d15` relocated that check into
  `connection.ts` to give the suppression "one home" (per that commit's own message and
  `connection.ts`'s header comment, "`reloading` is read by `showProtocolMismatch` below, so the
  mismatch-suppression decision has the same one home as the banner override"). This attempt
  only catches the E2E comment up to that relocation.
