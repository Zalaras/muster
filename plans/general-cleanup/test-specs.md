# E2E Test Specs: General Cleanup

**Plan**: general-cleanup
**Mode**: validate (attempt 2, final)
**Pack**: `kb:pack plan=general-cleanup role=e2e-specs features=ingest,lifecycle,surfaces,actions,connection,theme,reader,triage,launch`
**Verdict**: pass
**Tests created**: 5 new (`general-cleanup.spec.ts` E1-E5); 1 test edited in place (`plain-shell.spec.ts` E14, REQ-4)
**Live run**: authoring-mode live run — `plain-shell.spec.ts` (regression pin, REQ-4/E7) ran live; everything else was collection-only. **Validate attempt 1**: full implementation landed; `general-cleanup.spec.ts` (5/5), `plain-shell.spec.ts` (19/19), and `make e2e` (376/376 on the final sweep) all ran live, but `reconcile.spec.ts` E2 was an intermittent implementation defect (`daemon-impl`'s shutdown-liveness race) — reported `implementation-bug`. **Validate attempt 2 (this section, final)**: daemon-impl landed the `Manager.stopped` guard (commits `5ea7a88`, `d970b4a`, covered by daemon-tests in `b7cc8ae`, documented in ADR `e5b0e5d`/`e61b21b`). Rebuilt (`make web-build build`) and re-ran everything live: `general-cleanup.spec.ts` (5/5), `plain-shell.spec.ts` (19/19), full `make e2e` (376/376, including `reconcile.spec.ts` E2), and a fresh `make e2e-soak SPEC=reconcile.spec.ts N=10` (50/50) to confirm the fix holds under load, not just on one lucky run. No repairs were needed this attempt — my attempt-1 repairs (E5's fixture seed, `actions.spec.ts` E8's post-resume pane derivation) held with no further changes.

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/general-cleanup.spec.ts | focus returns to the mainhead End button by node identity after a daemon drop and reconnect (E1, REQ-7, INV-FOCUS) | REQ-7 | Focused End button, `daemon.kill()`/`restart()`, focus returns to the exact same DOM node (not a re-render replacement) once re-enabled |
| web/e2e/general-cleanup.spec.ts | focus returns to a tile's End button by node identity after a daemon drop and reconnect (E2, REQ-7, INV-FOCUS) | REQ-7 | Same invariant in Tiles, on a `.tfoot` End button |
| web/e2e/general-cleanup.spec.ts | a pop-out that has never connected shows connecting…, never musterd unreachable, until its first hello (E3, REQ-8, INV-POPOUT-CONNECTING) | REQ-8 | A never-yet-`hello`'d pop-out's status line reads `connecting…`, never `/unreachable/i`, held past a settle window; clears once `hello` arrives |
| web/e2e/general-cleanup.spec.ts | an enveloped SessionStart with a mismatched pane persists unrouted; the same event with the real pane binds it (E4, REQ-12, INV-CORROBORATE) | REQ-12 | A `tmuxPane: "%999"` envelope leaves `claudeSessionId` null via `/api/state`; the identical event with the real pane (`daemon.tmuxPaneId`) binds it |
| web/e2e/general-cleanup.spec.ts | an open pop-out follows a live theme change without reload (E5, REQ-9) | REQ-9 | Choosing Dark in the dashboard's Settings flips a real, already-open pop-out's `html[data-theme]` with no pop-out reload |
| web/e2e/plain-shell.spec.ts | a file dropped on a shell surface pastes its escaped path (E14, REQ-11) | REQ-4 | Waits for the `/one live client/i` sizenote (E16's own attach oracle) before `dropFiles`, instead of racing attach — regression pin, ran live |

## Fixture Changes

- `web/e2e/helpers/daemon.ts` — `ScratchDaemon.tmuxPaneId(tmuxTarget)`: the real `%<n>` pane id from `tmux list-panes -F '#{pane_id}'` on the run's own socket, memoised per target for the daemon's life; `restart()` clears the memo (a respawned daemon's tmux server re-creates every pane). REQ-12's harness half.
- `web/e2e/helpers/payloads.ts` — `EnvelopeOpts.tmuxPane` (and the three builders that destructure it: `envelopedSessionStart`, `envelopedStatusLinePreFirstResponse`, `envelopedStatusLineFull`) drop the `"%12"` fixture default; an omitted `tmuxPane` now omits the wire field entirely (unchanged plumbing, just no more default value standing in for a real pane). Declared `string | undefined` so a caller's own no-default local passes straight through under `exactOptionalPropertyTypes`.
- `web/e2e/helpers/session.ts` — `envelopeOpts(session, daemon)`: `{ musterSession: session.id, tmuxPane: await daemon.tmuxPaneId(session.tmuxTarget) }`, the plan's suggested "helper that takes the SessionObject and returns the envelope opts". Spread at call sites that also pass another opts field (`{ ...(await envelopeOpts(session, daemon)), source: "clear" }`).
- 18 pre-existing spec files' enveloped call sites (140 uses of `envelopeOpts`, matching the plan's ~123-site estimate closely — the plan's count predates counting the status-line builders' own enveloped sites, which also need a real pane) now pass the real pane instead of relying on the dropped default. 4 further sites (`ingest.spec.ts` ×3, `general-cleanup.spec.ts` E4's deliberate mismatch) state an explicit literal `tmuxPane` instead, because they post against a `musterSession` that names no real launched session (`ingest.spec.ts`'s seq-assignment tests) or deliberately want a wrong pane (E4). Full file list: `actions, gauges, ingest, issue-capture, permission-mode, plain-shell, rail-cards, rail-order, reader-mermaid, reader, reconcile, rename, sessions, shortcuts, subagent-status, terminal, theme, tiles, views` — 19 files, matching the plan's Affected Files > E2E line exactly.
- `sessions.spec.ts`'s local `bind(claudeId, sessionId: number)` helper (the E8 sort test) was changed to `bind(claudeId, session: SessionObject)` — it needed a real `tmuxTarget` to look up the pane, which a bare numeric id can't supply.
- `plain-shell.spec.ts`'s E7 test ("running claude inside a shell leaves the parent session's state... untouched") gained a poll for the parent's own `SessionStart` to finish processing before snapshotting the `before` state. This was a pre-existing race (the test never waited for its own setup hook to land before reading state back) that `make e2e-soak SPEC=plain-shell.spec.ts N=10` surfaced once REQ-12's `tmuxPaneId()` lookup added a few milliseconds of latency before the POST — a genuine flake in this run's own touched file, fixed per the plan's Run policy ("a flake exposed by the full-suite sweep... is a fix wave in this run"), not deferred.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-4 | plain-shell.spec.ts E14 (live, soaked 10×) |
| REQ-7 | general-cleanup.spec.ts E1, E2 |
| REQ-8 | general-cleanup.spec.ts E3 |
| REQ-9 | general-cleanup.spec.ts E5 |
| REQ-12 | general-cleanup.spec.ts E4 (new behaviour); every updated enveloped call site across 19 files (regression coverage — proves the corroboration predicate doesn't break existing routing once it lands) |

## Repairs (validate / fix modes only)

N/A — authoring mode. The one live-run fix (plain-shell.spec.ts's E7 parent-binding race, described under Fixture Changes) is a genuine pre-existing flake this run's own file touch exposed, not a repair to my own newly-authored assertion; it strengthens an existing test (adds a wait it was missing) and weakens nothing. `make e2e-soak SPEC=plain-shell.spec.ts N=10` after the fix: 190/190 passed, retries 0.

## E2E Implementation Bugs

N/A — authoring mode, nothing implemented yet to find a bug in.

## Test Run Output

```
$ cd web && npx playwright test --list
Total: 376 tests in 32 files
(clean collection, no errors)

$ npx tsc --noEmit
(clean — the only pre-existing error, src/render/mermaid.ts missing module
declarations, was a stale node_modules; `npm install` fixed it, unrelated to this
plan's edits, and left package.json/package-lock.json unchanged)

$ sh scripts/e2e-lint.sh
e2e-lint: clean

$ npx biome check e2e/
(clean after `--write` reflowed 6 files' new multi-line object literals to the
project's line-length rule)

$ make web-build build   # from repo root, needed once to prove the REQ-4 regression pin
(succeeded)

$ npx playwright test e2e/plain-shell.spec.ts -g "E14|E16"
2 passed (5.6s)

$ make e2e-soak SPEC=plain-shell.spec.ts N=10   # from repo root
190 passed (1.4m)   # after fixing E7's pre-existing race — see Fixture Changes
```

## Notes

- **Plan defect / deliberate deviation — E3's mechanism.** The plan's E3 acceptance
  criterion literally reads `daemon.kill()`, then `page.goto('/doc.html?session=<id>&path=<p>')`.
  A genuinely killed daemon has no listener left to serve `/doc.html` at all — Playwright's
  `page.goto()` against a fully-down server rejects immediately (`ERR_CONNECTION_REFUSED`,
  no retry), so there is no HTTP response to read a status line from, and no reliable way to
  land the navigation exactly inside the kill→restart window. I used
  `page.routeWebSocket("**/ws", …)` to transparently proxy the pop-out's own WebSocket and
  simply withhold `connectToServer()` until the assertions are done — the same technique
  `actions.spec.ts`'s E14/Major 4 test already uses in this suite to force a connection outage
  without touching the daemon process. This reproduces the exact state
  INV-POPOUT-CONNECTING names ("daemon down before load" / "no hello has ever arrived")
  deterministically, without the mechanical contradiction. Documented inline in the test
  itself; flagging here per the "if the plan asserts something the harness can't literally
  do, the plan is wrong" latitude — validate mode (or a review) should confirm this reading
  is acceptable, or redirect to a different mechanism if one exists that I didn't find.
- E4 deliberately does not use `envelopeOpts` for its mismatched-pane POST — it needs a real
  `musterSession` with a *wrong* `tmuxPane`, which is the opposite of what the helper
  computes. The real pane for the matching second POST comes from
  `daemon.tmuxPaneId(session.tmuxTarget)` directly.
- E1/E2/E5 assert on `document.activeElement`/`html[data-theme]` via captured element
  handles and `htmlTheme()`/`.evaluate()`, never a role+name re-match alone, per the node-
  identity requirement (a render that replaces the button with a same-role-and-name node
  must NOT count as "focus survived").
- `npm install` was required once, unrelated to this plan's own edits, to make `web-build`
  compile at all (the `mermaid` dependency was in `package.json` but not in `node_modules` —
  a leftover from an earlier session's work). `package.json`/`package-lock.json` are
  unchanged by it (`git status` confirms).
- All 19 pre-existing files' REQ-12 call-site updates are collection-only at authoring per
  the orchestrator's brief: they depend on daemon-impl's `resolveSessionID` corroboration
  predicate and `claudecodetest`'s dropped `%12` default, neither of which exists yet. They
  are, however, believed backward-compatible with the CURRENT (pre-REQ-12) daemon, since
  today's `resolveSessionID` doesn't check `tmuxPane` at all — passing the real pane instead
  of a hardcoded one should be a no-op today. I did not attempt to prove that with a live run
  (out of authoring-mode scope for new/changed call sites; validate mode will prove it via
  `make e2e` regardless).

## Validate Attempt 1

Ran `make web-build build` from the repo root first (fresh binary embedding the built
dashboard), then `npx playwright test --list` (376 tests in 32 files, clean), then the two
named spec files live, then repaired what needed repairing, then the full `make e2e` sweep
per the brief (the REQ-12 migration touched 19 files, so the whole suite is in scope, not
just my own two files).

### E5's fixture gap (per the orchestrator's brief)

Repaired as directed: `scratchDirectory()` gives `decideInitialOpen` nothing to open, so
`popOutLink` never renders and the test's own precondition (`popOutLink(region)` visible)
timed out before ever reaching the REQ-9 assertions. Seeded the directory with
`buildMarkdownFixtureTree(dir)` (the same helper `reader.spec.ts`'s E21/E4 already use) and
opened `TODO.md` via `fileEntry(region, "TODO.md").click()` before asserting the pop-out
link — mirrors `reader.spec.ts`'s E21 pop-out test exactly. `general-cleanup.spec.ts` then
ran 5/5 green on the first attempt.

### `actions.spec.ts` E8 — a second, real repair found under the full-suite sweep

The first full `make e2e` run (before any repair) failed exactly one test outside my own
files: `actions.spec.ts:344` ("the resume SessionStart lands the card in idle…", E8/E15/
INV-6) — `stateBadge(card)` stayed "needs input", never "idle". `actions.spec.ts` is one of
the 19 REQ-12-migrated files (140-site `envelopeOpts` migration), so per the brief this was
mine to triage.

Diagnosis (full trail, since the first hypothesis was wrong and the second repair replaced
it — see `## Repairs` for the corrected version only):
- `make e2e-soak SPEC=actions.spec.ts N=8` (repo root): 8/8 failed in isolation, so this
  wasn't full-suite load contention — genuinely broken.
- First hypothesis (wrong): `/resume` respawns a fresh pane under the *same* `tmuxTarget`,
  so `ScratchDaemon.tmuxPaneId`'s memo goes stale. Added a `forgetPane()` invalidation
  method and called it before the second `envelopeOpts()`. Re-soaked (N=5, N=8): still 8/8
  failed — this hypothesis was wrong.
- Instrumented the test directly (temporary `console.log`s of `session.tmuxTarget`,
  `resumedBody.tmuxTarget`, the derived envelope opts, and the daemon's own `GET
  /api/state`, all removed before committing): `/resume` doesn't just get a new pane under
  the same target — it moves the session onto a **new `tmuxTarget` entirely**
  (`muster-2:@1` before End, `muster-2:@2` after Resume; matches `sessionLauncher.Resume`'s
  own doc comment, "a fresh muster-<id> tmux session"). `envelopeOpts(session, daemon)` was
  built from the pre-resume `session` object, so it queried the now-dead OLD target and
  handed REQ-12's corroboration a pane that could never match the daemon's newly-stored
  one — confirmed via the debug `GET /api/state`, which showed `state` stuck at
  `"needs_input"` server-side, not just a stale DOM.
- Removed the now-unnecessary `forgetPane()` method (dead code once the real fix landed)
  and derived the resume hook's envelope opts from `resumedBody.tmuxTarget` (the response
  from `POST …/resume`, which carries the *current* target) instead of `envelopeOpts(session,
  daemon)`'s stale pre-resume one. `make e2e-soak SPEC=actions.spec.ts N=10`: 150/150 passed.

### `reconcile.spec.ts` E2 — a genuine, non-deterministic implementation defect

Not my file, not touched by this attempt beyond adding `envelopeOpts()` at authoring (a
correct, unmodified single-call-site migration — verified against the authoring diff, no
resume/respawn pattern in this test at all). Failed in the second full-suite run (2 failures:
`actions.spec.ts` E8 above, and this one), then 9/10 in an isolated
`make e2e-soak SPEC=reconcile.spec.ts N=10`, then passed clean in the final full 376/376
sweep — a genuine intermittent race, not a permanent break.

Root-caused with the daemon's own log (temporarily added `console.log(daemon.log)` around
the kill+restart in a scratch copy of the test, reverted before committing — `git diff
--stat` shows `reconcile.spec.ts` untouched): on a failing run, the daemon's own reconcile
log line reads

```
reconciled sessions kept_alive=0 marked_ended=0 shells_killed=0 swept=1
```

— the row was **swept (deleted)** on the very first restart after `killTmuxWindow`, not
marked ended and kept. `classifySessionsByOwnership` (`internal/session/manager.go`) only
sweeps a row whose `alive` was *already* `false` when that reconcile ran — meaning by the
time the fresh process's startup Reconcile executed, `alive=false` was already persisted.
The only thing that can do that is the *old, still-shutting-down* process's own liveness
poll (`pollLoop` → `checkLiveness` → `checkOneLiveness` → `markEnded`, 5s ticker,
`internal/session/manager.go:1378`), which is never paused or cancelled before
`shutdownGracefully` begins its own work in `cmd/musterd/main.go`. If that poll ticks while
`shutdownGracefully` is still running (SIGTERM received, but before `srv.Shutdown` actually
cancels the poll loop's context), the dying process races the test's own restart and can
mark+persist the just-killed pane as ended *before* the row is even handed to the next
process's Reconcile — which then sees `alive=false` already and sweeps it, exactly matching
`classifySessionsByOwnership`'s "only a row that was already alive=0 at startup gets
deleted" rule the test itself documents (line 40-41).

This plan's own REQ-13 (`cmd/musterd/main.go`'s `shutdownGracefully`, this run's
`652af3c`) added a new, unconditional `srv.ShellCount(shellCountCtx)` subprocess call
*before* `resolveOnExit` on every shutdown with `live > 0`, budgeted up to
`shutdownTimeout` (10s) — a real subprocess round-trip that did not exist before this plan
and that widens the window during which the still-ticking poll loop can race the shutdown
it's nominally part of. I did not bisect to prove REQ-13 specifically (vs. a pre-existing
race this plan merely made more visible), and don't need to for triage — either way, the
observable behaviour (`swept=1` on the first restart) contradicts the requirement this
test's own header names ("REQ-1 kept the row… only a row that was already alive=0 at
startup gets deleted") and `kb:adr/lifecycle-reconcile-converges-with-the-socket`. This is
`daemon-impl`'s to fix (the poll loop needs to stop, or be excluded from acting, once
shutdown has begun) or to rule "acceptable as a rare race" — not mine to route around: I
will not add a wait/sleep to `reconcile.spec.ts` to dodge a race the daemon itself should
not have.

### Full suite

Final `make e2e` (from repo root, after both repairs, fresh `make web-build build` first):
**376/376 passed**, including `reconcile.spec.ts` E2 on this particular run (the race did
not trigger this time — consistent with intermittent, not permanent). `npx playwright test
--list` re-run after all edits: still 376 tests in 32 files, clean.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | general-cleanup.spec.ts E5 ("an open pop-out follows a live theme change without reload") | `popOutLink(region)` never visible, 15s timeout, before REQ-9's own assertions ran | `scratchDirectory()` is empty — no plan, no `.md` files — so `decideInitialOpen` opens nothing and `popOutHref` stays `null` by design | Seed `dir` with `buildMarkdownFixtureTree(dir)` and open `TODO.md` via `fileEntry(...).click()` before asserting the pop-out link, mirroring `reader.spec.ts` E21 | REQ-9 (pop-out follows a live theme change with no reload) — every original assertion (`htmlTheme(popup)` tracks `htmlTheme(page)` after `themeRadio(dialog, "Dark").check()`, no popup reload) is unchanged; only the precondition for reaching a real pop-out was fixed |
| 2 | actions.spec.ts E8 ("the resume SessionStart lands the card in idle…") | `stateBadge(card)` stuck at "needs input", 15s timeout; server-side `GET /api/state` confirmed `state` never left `"needs_input"` (not a DOM/WS lag — the daemon never routed the event) | `envelopeOpts(session, sharedDaemon())` for the post-resume `sessionStartResume` hook used the pre-resume `session` object's `tmuxTarget`, but `/resume` moves the session onto a brand-new `tmuxTarget` (not just a new pane under the old one) — REQ-12's corroboration correctly rejected the stale-target-derived pane as a mismatch | Derive the resume hook's envelope opts from `resumedBody.tmuxTarget` (the live value `POST …/resume`'s own response carries) instead of the stale `session` object: `{ musterSession: session.id, tmuxPane: await sharedDaemon().tmuxPaneId(resumedBody.tmuxTarget) }` | REQ-8/E15/INV-6 (resume rebinds to idle, clears attention/failure) — every assertion (`stateBadge` idle, `needs your permission` gone, `attention`/`failure` null) is unchanged; only the envelope's pane derivation was fixed. `make e2e-soak SPEC=actions.spec.ts N=10`: 150/150 passed |

No assertion was deleted, skipped, or weakened.

## E2E Implementation Bugs

**Resolved in Validate Attempt 2** — see that section below. daemon-impl added a
`Manager.stopped` guard (`internal/session/manager.go`) that stops the liveness poll from
writing once shutdown begins; `reconcile.spec.ts` E2 now runs 50/50 under soak. Left the
original attempt-1 row below verbatim as the record of what was found and reported.

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| A session whose pane dies right before a daemon restart can be swept (deleted) instead of marked ended and kept, when the still-shutting-down old process's own 5s liveness poll races its own shutdown | `[daemon-impl]` | `reconcile.spec.ts`'s own header ("REQ-1 kept the row… only a row that was already alive=0 at startup gets deleted") and `kb:adr/lifecycle-reconcile-converges-with-the-socket` ("never deletes a row whose pane is alive" / row-ownership convergence); this plan's `cmd/musterd/main.go` REQ-13 change added a new unconditional `srv.ShellCount()` subprocess call to every shutdown with live sessions, widening the race window (not confirmed as the sole cause, but a plausible contributor from this run) | Row kept as `ended` on the restart immediately after the pane died; only swept on a *later* restart if it was already `alive=false` beforehand | Daemon's own log: `reconciled sessions kept_alive=0 marked_ended=0 shells_killed=0 swept=1` on the very first restart — the row is gone (`getByTestId('session-card')` — "No sessions yet") | `reconcile.spec.ts:23` E2 (INV-1, INV-3) — 9/10 in `make e2e-soak SPEC=reconcile.spec.ts N=10`, 2/376 and 1/376 in two of three full `make e2e` sweeps this session, 0/376 in the third (intermittent, not permanent) |

## Test Run Output

```
$ cd web && npx playwright test --list   (after all repairs)
Total: 376 tests in 32 files

$ npx playwright test e2e/general-cleanup.spec.ts
5 passed (5.0s)

$ npx playwright test e2e/plain-shell.spec.ts
19 passed (8.1s)

$ make e2e-soak SPEC=actions.spec.ts N=10   (after the real fix)
150 passed (58.7s)

$ make e2e   (final sweep, from repo root, fresh make web-build build first)
376 passed (2.2m)
```

## Notes

- Both repairs are declared above; nothing else in my two authored files or in any of the
  18 other REQ-12-migrated files needed a change — `git status` at the end of this attempt
  shows exactly `web/e2e/actions.spec.ts`, `web/e2e/general-cleanup.spec.ts`, and
  `plans/general-cleanup/orchestration-state.json` touched (the last is the orchestrator's
  own bookkeeping, not mine).
- The `reconcile.spec.ts` bug is intermittent (proven both ways: 9/10 failing in an
  isolated soak, then 0/376 failing in the final full-suite sweep), which is exactly the
  profile of a real race condition rather than a deterministic break — reported as
  `implementation-bug` rather than `pass` because the plan's own requirement is violated on
  a real, reproducible fraction of runs, and hiding that behind "the last sweep was green"
  would be the failure mode CLAUDE.md's "claimed effects need measurement" rule exists to
  prevent.
- Every diagnostic `console.log`/temporary instrumentation used while root-causing both
  issues was removed before this log was written; `git diff --stat` for `actions.spec.ts`
  and `general-cleanup.spec.ts` shows only the two repairs above, and `reconcile.spec.ts`
  is untouched.

## Validate Attempt 2 (final)

daemon-impl landed the fix for the attempt-1 `reconcile.spec.ts` E2 defect: a
`Manager.stopped` guard in `internal/session/manager.go` that stops the liveness poll from
persisting `alive=false` once `shutdownGracefully` has begun (commits `5ea7a88` stop-the-poll,
`d970b4a` stop-the-writes, `b7cc8ae` daemon-tests coverage, `e5b0e5d`/`e61b21b` the ADR). The
orchestrator bisected it independently and confirmed the regression traced to this plan's
REQ-13 `ShellCount` round trip in `shutdownGracefully`, matching my attempt-1 root-cause trail.

Ran, in order, from a clean tree (no code edits this attempt — nothing needed repair):

1. `make web-build build` from the repo root — succeeded, fresh binary.
2. `npx playwright test --list` from `web/` — 376 tests in 32 files, clean collection,
   unchanged from attempt 1.
3. `npx playwright test e2e/general-cleanup.spec.ts e2e/plain-shell.spec.ts` — **24/24
   passed** (5 general-cleanup E1-E5, 19 plain-shell including E14/REQ-4 and E7's attempt-1
   race fix, which held with no further changes).
4. `make e2e` (full suite, foreground, from the repo root) — **376/376 passed**, including
   `reconcile.spec.ts` E2 (previously the intermittent failure).
5. `make e2e-soak SPEC=reconcile.spec.ts N=10` — **50/50 passed**, no retries. This is the
   test that failed 9/10 in the equivalent attempt-1 soak; soaking it again rather than
   trusting one green full-suite run is the same "claimed effects need measurement" standard
   attempt-1 applied when it refused to call a single green sweep sufficient.

No spec file was edited this attempt. Both attempt-1 repairs (E5's `buildMarkdownFixtureTree`
fixture seed; `actions.spec.ts` E8's `resumedBody.tmuxTarget`-derived envelope opts) are
already committed and were exercised live again in steps 3-4 above with no regression.

`git status` at the end of this attempt: only `plans/general-cleanup/orchestration-state.json`
(orchestrator bookkeeping) and `plans/general-cleanup/test-specs.md` (this log) touched.

No assertion was deleted, skipped, or weakened.

### Final Test Run Output

```
$ cd web && npx playwright test --list
Total: 376 tests in 32 files

$ npx playwright test e2e/general-cleanup.spec.ts e2e/plain-shell.spec.ts
24 passed (9.6s)

$ make e2e   (repo root, fresh make web-build build first)
376 passed (2.2m)

$ make e2e-soak SPEC=reconcile.spec.ts N=10   (repo root)
50 passed (29.1s)
```

**Verdict: pass.**
