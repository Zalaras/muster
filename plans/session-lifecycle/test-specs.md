# E2E Test Specs: Session lifecycle robustness

**Plan**: session-lifecycle
**Mode**: validate (attempt 1) — the daemon Phase 1 + Phase 2 implementation and the web
REQ-17 slice were already complete and green when this step started; these specs
validate the whole plan end to end rather than author-then-wait.
**Pack**: `kb: pack 24464 words` / `kb: WARN pack exceeds budget of 8000 words` (role
`e2e-specs`, features `lifecycle,actions,launch,surfaces,ingest`)
**Verdict**: pass (E1, E3, E5, E7 new and green; E2, E4 pass unamended; E6 — see
**E6: not independently exercisable at the E2E layer**, below)
**Tests created**: 4 (E1, E3, E5, E7)
**Live run**: 355/355 passing (`make e2e`)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|-------------------|
| web/e2e/launch.spec.ts:1110 | an orphaned muster-1 on the socket does not block launching from the dashboard, and is left running untouched (E1, issue #26) | REQ-1, REQ-7, REQ-9, issue #26 | A pre-existing foreign `muster-1` on the daemon's socket does not block a real dashboard launch (dialog → Launch → card); the new session gets an id strictly above 1; `#launch-error` never shows; the orphan is still on the socket afterward, untouched |
| web/e2e/reconcile.spec.ts:156 | a session whose daemon is restarted while its pane stays alive comes back alive and attachable, with its target reconciled from tmux (E3) | REQ-9 | A normally-launched, live session survives a daemon restart: the row comes back `alive:true`, its `tmuxTarget` is non-empty and independently confirmed (via `daemon.tmuxPaneExists`) to resolve to a real live pane post-restart — not a stale value carried over unexamined — and the dashboard can still attach a working terminal to it |
| web/e2e/actions.spec.ts:840 | killing the pane then clicking End before the ~5s liveness poll notices shows no error and the card goes dead (E5) | REQ-6 | Killing a session's pane out from under it, then clicking its rail card's own End button (before the periodic liveness poll would notice), shows no `#action-error` and the card transitions to `ended` — proving `KillSession`'s "already gone" tolerance, not the poll, is what makes this succeed |
| web/e2e/actions.spec.ts:899 | a session with no bound Claude id shows a disabled Resume control with a stated reason, on the mainhead and the dead cap (E7, W3) | REQ-17/W3 | A session that never received a `SessionStart` (its pane was killed first) has `claudeSessionId: null`; both the mainhead Resume button and the dead-surface cap's Resume button are disabled AND carry the exact `title` reason `sessions/card.ts`'s `resumeDisabledReason` produces |

Plus, run unamended as regression guards for this plan (both green, see **Coverage** below):

| File | Test Name | Session-lifecycle criterion |
|------|-----------|------------------------------|
| web/e2e/reconcile.spec.ts:22 | a session whose pane died while the daemon was down reconciles to ended and kept, then a later restart sweeps it for good (E2 [m4-reconcile], INV-1, INV-3) | E4 |
| web/e2e/reconcile.spec.ts:195 | reconcile reports an unknown tmux session on the socket without creating a row for it (REQ-2) | E2 |

(Confusingly, both of these carry test-title labels from the *earlier* m4-reconcile plan's
own numbering — `reconcile.spec.ts:22`'s title says "E2" and it's session-lifecycle's
**E4**; `reconcile.spec.ts:195`'s title cites `REQ-2` and it's session-lifecycle's **E2**.
Titles were left exactly as they are — session-lifecycle's plan.md itself points at these
two tests by file:line, not by title, for this reason.)

## Fixture Changes

No changes needed to `web/e2e/helpers/*.ts`. Every new test uses the existing per-test
`daemon` fixture (`helpers/fixtures.ts`, unedited) plus existing oracles:
`daemon.createForeignTmuxSession`, `daemon.tmuxSessions`, `daemon.killTmuxWindow`,
`daemon.restart`, `daemon.tmuxPaneExists`, and the existing `launchSession` /
`envelopedSessionStart` / `sessionCard` / `getState` / `findSession` helpers. No new
payload shapes were synthesized — `envelopedSessionStart` (already measured/used
throughout the suite) is the only hook payload any of these four tests sends, and E1/E5's
session ids are read off the real `launchSession`/`getState` responses rather than
assumed to be 1 (per the orchestrator's explicit warning about
`plans/plain-terminal-session/test-specs.md:196`'s prior bug).

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| E1 (issue #26 launch-blocked reproducer) | launch.spec.ts:1110 |
| E2 (unknown `muster-99999-foreign` survives a restart, no row) | reconcile.spec.ts:195 (unamended) |
| E3 (restart with a live pane comes back alive+attachable, target repaired) | reconcile.spec.ts:156 |
| E4 (pane died while down → ended+kept, swept on the following restart) | reconcile.spec.ts:22 (unamended) |
| E5 (kill-then-End race shows no error) | actions.spec.ts:840 |
| E6 (failed Remove leaves the shell running) | not exercised at the E2E layer — see below; daemon-level D15 (`internal/server/sessions_test.go`, `TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent`, per daemon-implementation.md's Phase 2 log) is green and is the enforcement for REQ-13's ordering guarantee |
| E7 (no-claude-id Resume disabled + reason) | actions.spec.ts:899 |
| E8 (`make e2e` passes) | 355/355, see Test Run Output |

## E6: not independently exercisable at the E2E layer

I traced this before writing any test, rather than fabricate one. Every tmux-level fault
inducible from the E2E harness (`killTmuxWindow`, killing the whole tmux session, killing the
whole tmux server on the socket, even deleting the socket file first) makes the real `tmux`
CLI exit with a normal, if nonzero, status — an `*exec.ExitError` — **and leaves the session
genuinely gone**. `KillSession` (`internal/tmux/tmux.go`, REQ-6) verifies exactly that: an
`ExitError` is checked against `PaneExists`, and a session confirmed gone is a successful
kill. So none of these faults produce the failure E6 needs; they produce the success case.

**Note on this reasoning (orchestrator, after `efd2f7d`).** The original trace here said
`KillSession` swallowed *any* `ExitError` regardless of whether the session survived, which
was true when this was written and is the finding that prompted the fix — treating every
`ExitError` as success would have let `Remove` delete a row whose pane was still running. The
conclusion is unchanged, but the reason is now narrower: E6 is unreachable because the harness
cannot produce a kill failure *against a session that survives it*, not because failures are
swallowed. `make e2e` was re-run on a tree containing `efd2f7d` (this commit descends from it)
and E5 still passes, confirming the verification did not regress the already-gone path.

A genuine failure needs either a non-`ExitError` (`tmux` binary unresolvable,
`context.Canceled`/deadline) or a live session surviving its own kill — neither reachable
black-box. D15's Go test correspondingly needed a fault-injected `Killer` double.

Unlike `-claude-bin`, there is no `-tmux-bin` (or any other) daemon flag letting E2E
substitute a broken `tmux`, so there is no black-box lever to force `manager.Remove`'s
internal `KillSession` call to genuinely fail. I flagged this to the orchestrator
(SendMessage, before authoring) rather than write a test that doesn't actually force the
failure path (e.g. a 404-on-unknown-id case, which never reaches the shell-kill step at
all and wouldn't be evidence of anything). This is a testability gap in the E2E surface,
not an implementation defect — REQ-13's ordering guarantee is real and is enforced by
D15 (Go, real fault injection), which is green.

**Orchestrator decision (2026-09-14, via SendMessage): E6 stays deliberately undone at
the E2E layer.** A `-tmux-bin`-style override was considered and rejected — it would be
a production seam existing only to serve a test, a worse trade than the coverage it
buys. REQ-13's shell-survives-a-failed-Remove ordering is proven by **D15**
(`internal/server/sessions_test.go`,
`TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent`, a
fault-injected `Killer` double), not by an E2E test. A later reader should take this as a
considered gap, not an oversight.

**A more consequential finding fell out of this trace.** `KillSession`'s tolerance is
broader than the ADR (`kb:adr/actions-kill-is-idempotent`) claims: it swallows *any*
`*exec.ExitError`, not just "no such session" — so a socket that can't be read (which
also exits non-zero) currently reads as a *successful* kill, and `Remove` would delete a
row whose pane is still alive. That's the exact failure class this plan exists to
eliminate. The orchestrator is routing a fix to daemon-impl: after an `ExitError`, verify
with `PaneExists` and treat it as success only if the session is genuinely gone (no
string matching, version-robust). Per the orchestrator, this should not affect any spec
here — every path these tests exercise ends with the session genuinely gone, so the added
verification confirms success rather than changing the outcome — but if E5 regresses
after that commit lands, the orchestrator asked to be told rather than have the spec
adjusted, since that would mean the fix itself regressed, not the test.

## Test Run Output

```
$ make e2e   (from the project root; web-build + build run first per the harness rule)
...
355 passed (1.9m)
```

Targeted runs during authoring (paste from actual terminal output):

```
$ npx playwright test launch.spec.ts -g "E1, issue #26"
  ✓  1 [chromium] › e2e/launch.spec.ts:1110:1 › an orphaned muster-1 on the socket does not
     block launching from the dashboard, and is left running untouched (E1, issue #26) (2.1s)
  1 passed (3.0s)

$ npx playwright test reconcile.spec.ts
  ✓ e2e/reconcile.spec.ts:22   (E2, INV-1, INV-3)
  ✓ e2e/reconcile.spec.ts:73   (E3, survive policy — m4-reconcile's own E3, unrelated to
    session-lifecycle's E3)
  ✓ e2e/reconcile.spec.ts:114  (E4)
  ✓ e2e/reconcile.spec.ts:156  (E3 — session-lifecycle's)
  ✓ e2e/reconcile.spec.ts:195  (REQ-2)
  5 passed (2.6s)

$ npx playwright test actions.spec.ts -g "E5\)|E7, W3" --repeat-each=8
  8 passed (5.0s)   # E5 alone, repeated 8x under 4 parallel workers, to prove the
                     # two-session (decoy + target) fixture reliably avoids the
                     # auto-focus-attach fast path (see Notes)

$ npx playwright test actions.spec.ts
  15 passed (6.1s)

$ npx playwright test launch.spec.ts
  30 passed (16.7s)
```

## Notes

**E5's fixture required a real debugging detour, documented here since it changed the
test's design non-trivially.** The plan's framing ("killing the pane via
`daemon.killTmuxWindow()`, then clicking End before the ~5s liveness poll notices")
assumes the front end still believes `alive:true` at the moment of the click. My first
two attempts (mainhead-focused, then rail-card-without-focus) both failed: Playwright's
own click retried for the full 60s timeout because the target session had *already*
transitioned to `ended` by the time the click fired — sometimes within ~60ms of the kill.
I measured this directly (a throwaway debug spec, deleted before committing — never part
of the suite) rather than guess: when a killed session is the daemon's *only* session, and
therefore Focus's default auto-focus-top-of-sort target, its terminal gets attached on
page load with no explicit click — and an attached terminal's own PTY bridge notices the
killed window's EOF within tens of milliseconds, which is a genuine but *different* path
(already covered by the existing `INV-5` test in this same file) from the one E5 targets.
Launching a second, decoy session first (left as the auto-focused one) keeps the target
session B's terminal unattached; measured, B then stays `alive` in the UI for 3+ seconds
after the kill — comfortable, non-racy room under the real 5s poll (`defaultPollInterval`,
`internal/session/manager.go:49`, confirmed to have no CLI override — `session.NewManager`
is called with no `PollInterval` set in `internal/server/server.go`). Re-ran E5 alone
`--repeat-each=8` under 4 parallel workers with zero flakes before folding it into the
committed file.

**`sessionCard()`'s substring `hasText` filter bit me once during E5's authoring**: an
early title pairing (`end-race-e5-decoy` / `end-race-e5`) made the second title a
substring of the first, so `sessionCard(page, "end-race-e5")` resolved to both cards
(strict-mode violation). Renamed the decoy to `decoy-focused-a5` (no substring overlap)
rather than switch locator strategy — noting it here since another spec composing two
similarly-prefixed titles in this file would hit the same trap.

No assumptions remain open for E1/E3/E7 — each ran green on the first design. No
wire shape was invented: all four tests reuse `envelopedSessionStart` (already
measured/used throughout `web/e2e/`) as their only synthesized hook payload.
