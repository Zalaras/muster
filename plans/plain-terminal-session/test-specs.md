# E2E Test Specs: Plain terminal session

**Plan**: plain-terminal-session
**Mode**: fix (review cycle 1, wave 3 — coverage for new user-facing behaviour; re-verified
after web-impl's fix f2433ae)
**Verdict**: pass
**Tests created**: 19 (16 original + 3 this cycle)
**Live run**: 19/19 passing (plain-shell.spec.ts); 281/281 passing (full suite sweep)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/plain-shell.spec.ts | switching to shell in Focus shows a live shell whose prompt responds to typed input, and switching back to claude shows the Claude pane again | E1 | Segment states (no-data/data), lazy `POST .../shell` before mount, live round trip, switch-back preserves pip |
| web/e2e/plain-shell.spec.ts | a session never switched to shell has no muster-\<id\>-shell tmux session | E2 | Lazy spawn — no tmux session exists until the first switch |
| web/e2e/plain-shell.spec.ts | the shell runs in the session's own directory | E3 | `pwd` inside the shell echoes the launched session's directory |
| web/e2e/plain-shell.spec.ts | a shell started in Focus is still running after switching to Tiles and back | REQ-6, E4 | tmux session + pip survive a view switch |
| web/e2e/plain-shell.spec.ts | a shell can be started on a session whose alive is false, and the claude segment still shows the dead surface | E5, edge case 13 | REQ-7: shell route never consults `alive`; claude segment keeps showing `#dead-surface` |
| web/e2e/plain-shell.spec.ts | typing exit closes the shell socket, swaps the visible surface back to Claude and clears the pip | E6, REQ-8 | PTY EOF -> socket closes, segment reverts, pip clears, respawn works |
| web/e2e/plain-shell.spec.ts | running claude inside a shell leaves the parent session's state, stateSince, claudeSessionId and context untouched, and persists its events unrouted with a NULL session_id | E7, E15, INV-6, edge case 1 | Un-enveloped hook from an unbound claude id never mutates the parent session; its own rows persist with `muster_session` NULL |
| web/e2e/plain-shell.spec.ts | after daemon.restart(), no muster-\<n\>-shell tmux session remains on the socket | E8, edge case 3 | Reconcile sweeps shell sessions on daemon restart |
| web/e2e/plain-shell.spec.ts | switching to shell with the directory removed shows the daemon's error in the surface's status notice and leaves the segment on claude | E9, REQ-12, edge case 4 | 409 `directory_missing` surfaces via the surface's `role="status"` notice; segment reverts, no half-created tab |
| web/e2e/plain-shell.spec.ts | tmux kill-session on a live shell closes its socket and does not change the parent session's state or alive | E10, edge case 6 | External kill closes the socket without nudging the parent's liveness/state |
| web/e2e/plain-shell.spec.ts | resuming a dead session that has a live shell leaves the shell running | E11, edge case 8 | Resume via the dead surface's cap doesn't touch an already-running shell |
| web/e2e/plain-shell.spec.ts | a second tab on the same session's shell supersedes the first, while a tab on that session's claude surface stays open | E12, INV-3 | One-live-client law is per attach target: shell supersede leaves the Claude socket alone |
| web/e2e/plain-shell.spec.ts | removing one session kills only its own shell; a second session's shell keeps running | E13, INV-4 | Remove kills only the removed session's shell tmux session |
| web/e2e/plain-shell.spec.ts | a file dropped on a shell surface pastes its escaped path | E14, REQ-11 | Drop/paste behaviour shared with the Claude pane works on a shell surface too |
| web/e2e/plain-shell.spec.ts | a shell surface's reported geometry matches its tmux window's geometry | E16, REQ-11 | Sizenote cols/rows converge with tmux's `#{window_width}`/`#{window_height}` for the shell target |
| web/e2e/plain-shell.spec.ts | a tile footer renders the same segment as the mainhead, scoped per session | REQ-4 | Two tiles' identically-named claude/shell buttons don't cross-contaminate |

## Fixture Changes

No new hook/status-line payload shapes — this plan learns no new Claude Code wire fact
(plan's own Doc upkeep note). The one "nested claude" fixture in the E7/E15 test reuses
the existing `envelopedSessionStart`/`rawUserPromptSubmit` builders from
`helpers/payloads.ts`, called with no `musterSession`/`tmuxPane` envelope fields — this is
not a new shape, just an existing builder's already-optional fields left unset, which is
exactly the "un-enveloped, unbound `claude_session_id`" shape the plan's Implementation
Notes describes for a nested run.

New non-Claude-Code fixtures (plain E2E test infrastructure, not wire-format facts):
- `web/e2e/helpers/shell.ts` — locators for the segmented control (mainhead + per-tile,
  scoped by `data-session-id`), the shell surface container, the pip, a
  `createShellViaApi` convenience wrapper over `POST /api/sessions/{id}/shell`, and a
  `ShellSocketTracker` mirroring `helpers/terminal.ts`'s `TerminalSocketTracker` but
  scoped to `/ws/shell/`.
- `web/e2e/helpers/daemon.ts` — added `tmuxShowEnv(target, name)`, wrapping `tmux
  show-environment -t <target> <NAME>` and collapsing both "variable never set" and
  "variable explicitly unset" (tmux's `-NAME` shape) to `null`, per plan Affected Files >
  E2E.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| E1 | "switching to shell in Focus shows a live shell..." |
| E2 | "a session never switched to shell has no muster-\<id\>-shell tmux session" |
| E3 | "the shell runs in the session's own directory" |
| E4 | "a shell started in Focus is still running after switching to Tiles and back" |
| E5 | "a shell can be started on a session whose alive is false..." |
| E6 | "typing exit closes the shell socket..." |
| E7 | "running claude inside a shell leaves the parent session's state..." |
| E8 | "after daemon.restart(), no muster-\<n\>-shell tmux session remains..." |
| E9 | "switching to shell with the directory removed shows the daemon's error..." |
| E10 | "tmux kill-session on a live shell closes its socket..." |
| E11 | "resuming a dead session that has a live shell leaves the shell running" |
| E12 | "a second tab on the same session's shell supersedes the first..." |
| E13 | "removing one session kills only its own shell..." |
| E14 | "a file dropped on a shell surface pastes its escaped path" |
| E15 | "running claude inside a shell..." (same test as E7 — the plan pairs them) |
| E16 | "a shell surface's reported geometry matches its tmux window's geometry" |
| REQ-4 (tile scoping) | "a tile footer renders the same segment as the mainhead, scoped per session" |

INV-1 (D3/E7) is covered structurally via the new `tmuxShowEnv` oracle, but no test in
this file currently calls it directly — see Notes below; it's a daemon-unit-test (D3)
oracle primarily, and the E2E suite's own INV-6 proof (E7) works at the state-machine
level instead, which is the layer INV-6 actually names. I've left `tmuxShowEnv` in place
per the plan's explicit Affected Files instruction so it's available if daemon-impl/
review wants an E2E-level D3 corroboration added in validate mode.

## Repairs (validate / fix modes only)

Not applicable — this is an authoring-mode run.

## Notes

- **No regression pins were needed for this plan.** I reviewed every REQ/INV/edge-case
  for "unaffected"/"still"/"does not" phrasing per the e2e-specs brief's "regression pins
  run live at authoring" rule. This plan's Affected Files section is purely additive on
  the E2E side (one new spec file, one new helper file, one additive method on an
  existing helper class) — nothing in Affected Files touches an existing rendering path
  in a way an existing spec would need to keep passing as a pin, and no existing test
  file was rewritten. The Testable UI Elements table's one "unchanged" row (the Claude
  terminal container's `aria-label`) is exercised only inside the new tests, which
  themselves depend on the not-yet-built segmented control to reach that assertion, so
  it cannot be pinned standalone before the feature exists.
- **A real `$SHELL` process, never a fake.** REQ-1 specifies the shell surface runs the
  user's real `$SHELL` (falling back to `/bin/zsh`), not the harness's `-claude-bin`
  stub. Every test in this file that interacts with the shell surface (E1, E3, E4, E6,
  E9-E16) drives that real, harmless system shell — this is not the same category as
  launching a real `claude` process (CLAUDE.md's hard rule is specifically about not
  burning Damian's Claude Code subscription) and no test in this file ever spawns `claude`
  for real.
- **E7/E15's "nested claude" fixture is a simulation, not a real invocation.** Per
  CLAUDE.md and this agent's own rules, a real `claude` binary is never launched anywhere
  in the E2E suite. What the plan's edge case 1 actually needs proven — that an
  un-enveloped hook from an id the daemon never bound persists unrouted and mutates
  nothing — is fully testable by POSTing the synthesized payload directly to the ingest
  endpoint with no `musterSession`/`tmuxPane` envelope, which is exactly what a real
  nested `claude`'s hook wrapper would produce from a pane with no `MUSTER_SESSION` set.
  I flagged this reasoning inline in the test itself so a later reader doesn't mistake it
  for an incomplete fixture.
- **E12 assumes `page.on('websocket')`-style overlay detection generalizes.** The
  superseded-overlay assertion (`shellRegionA.getByText(/another window/i)`) mirrors
  `terminal.spec.ts`'s existing E3 pattern for the Claude pane; since `TerminalSurface` is
  documented as view-agnostic (view/design authority in the plan's Implementation Notes),
  I expect the same overlay text/element to apply to a shell surface unchanged, but this
  is unverified against real markup (nothing exists yet) — flagged for validate mode in
  case web-impl's shell surface reuses a different overlay wording.
- **No `/interface-probe` was needed.** This plan introduces no new Claude Code wire
  fact (its own Doc upkeep note says as much), and every fixture used here is either an
  existing `helpers/payloads.ts` builder called with existing (already-optional) fields,
  or a plain HTTP/tmux call with no Claude-Code-shaped content at all.
- **`web/e2e/shell.spec.ts` (the pre-existing M0 dashboard-shell suite) is untouched.**
  Per the plan's own Affected Files note, this plan's new file is named `plain-shell` for
  exactly that reason — no collision, no rewrite.
- Collection gate: `npx playwright test --list` from `web/` completed cleanly — 278
  tests across 25 files (up from 262 before this change), no duplicate titles, no
  syntax/import errors. `npx tsc --noEmit` from `web/` (which includes `e2e/` in its
  project) also passed with zero errors under the project's strict settings
  (`noUnusedLocals`, `exactOptionalPropertyTypes`, etc.) — a stronger check than the
  gate strictly requires, run because this plan's file is unusually large.

## Validate Attempt 1

Rebuilt via `make web-build build` (that order) from the project root, then ran
`npx playwright test --list` (still clean, 278 tests / 25 files), then
`npm run e2e -- e2e/plain-shell.spec.ts` from `web/`.

### The known E7/E15 finding (orchestrator-flagged, confirmed and fixed)

web-impl's handoff reported `plain-shell.spec.ts` at 15/16, with E7/E15 failing because
the parent session's `state` flipped `started` → `working` and attributed it to a daemon
defect. The orchestrator's own message to me pre-diagnosed the real cause and directed
the fix: my own fixture, not the daemon.

Root cause, confirmed by reading `internal/server/ingest.go:181-204`
(`resolveSessionID`): `ev.MusterSession != nil` is checked **before** any
`claude_session_id` binding fallback, and is trusted outright when the named muster
session exists (no signal distinguishes "the wrapper legitimately bound this" from "the
envelope happened to carry a stale/default value"). My test's
`envelopedSessionStart(nestedClaudeId, {})` call looked like it built an "un-enveloped"
nested hook, but `envelopedSessionStart`'s own `EnvelopeOpts` destructuring
(`helpers/payloads.ts`) defaults `musterSession = 1, tmuxPane = "%12"` *before*
`envelope()` ever sees the options object — so an empty `{}` fills in
`musterSession: 1` regardless, and `envelope()`'s `!== undefined` guard then dutifully
includes it. The "nested, unbound" hook was therefore fully enveloped to session 1 (the
test's own parent session, since it is the first session launched in a fresh scratch
daemon) and legitimately drove its state machine — exactly the daemon's documented,
correct behaviour for a trusted envelope. Not a daemon defect.

Fix (my own helper file, `web/e2e/helpers/payloads.ts`): added `unboundSessionStart`,
a `SessionStart` builder that calls `envelope(payload, {})` directly with no
`EnvelopeOpts` defaults applied first, so `musterSession`/`tmuxPane` are genuinely
absent from the wire body — the shape `internal/server/ingest.go`'s `resolveSessionID`
actually falls through to the `claude_session_id` binding lookup for, and finds no
binding (this id was never seen before), landing the unrouted/NULL-`session_id` path
the test asserts. Updated `plain-shell.spec.ts`'s E7/E15 test to call
`unboundSessionStart(nestedClaudeId)` instead of `envelopedSessionStart(nestedClaudeId,
{})`. Re-ran: passes, with `parentAfter.state`/`stateSince`/`claudeSessionId`/`context`
all equal to `parentBefore`'s, and the nested rows persisting with
`muster_session: null`.

### E12 "another window" overlay assumption (orchestrator-flagged, checked, holds)

Checked `web/src/terminal/overlay.ts` and `web/src/terminal/pane.ts` against the shipped
markup: `overlayText("superseded")` returns `"live view opened in another window — click
to take back"`, written into the same `.terminal-overlay` element
`TerminalSurface` builds once per instance regardless of `SurfaceKind` — there is no
shell-specific overlay text anywhere in `pane.ts`/`overlay.ts`. The E12 test's
`shellRegionA.getByText(/another window/i)` locator matches this unchanged. No repair
needed; the authoring-mode flag is resolved as "holds against real markup," not a defect.

### Full suite sweep (Validate Mode step 5)

`make e2e` from the project root (fresh rebuild + full run): **278 passed** (1.1m), zero
failures anywhere in the suite, including every pre-existing spec file. No pre-existing
test's expectation was superseded by this plan's protocol delta (the `Session` object is
unchanged per the plan's own Protocol Contract header — "a shell is invisible on the
state stream"), so there is no sanctioned-breakage repair to make.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | running claude inside a shell leaves the parent session's state... (E7, E15, INV-6, edge case 1) | `parentAfter.state` was `"working"`, not `parentBefore`'s `"started"` — looked like an INV-6 violation | My own fixture call, `envelopedSessionStart(nestedClaudeId, {})`, silently filled in `musterSession: 1, tmuxPane: "%12"` via that builder's own `EnvelopeOpts` defaults, before `envelope()` saw the (empty) options object — so the "nested, unbound" hook was actually fully enveloped to the parent session and legitimately drove it, per `internal/server/ingest.go`'s documented (and correct) envelope-trust behaviour | Added `unboundSessionStart` to `helpers/payloads.ts` (calls `envelope(payload, {})` directly, no defaults applied), and call it instead of `envelopedSessionStart(id, {})` in the E7/E15 test | E7/INV-6: parent `state`/`stateSince`/`claudeSessionId`/`context` all still asserted equal before/after; E15: nested rows still asserted `muster_session === null` and the parent's own event rows still asserted to exclude the nested id. Deliberate-breakage check: reverted the fix locally (restored `envelopedSessionStart(nestedClaudeId, {})`) and re-ran the test in isolation — it failed exactly as web-impl's handoff described (`parentAfter.state` `"working"` vs `"started"`), confirming the assertion is live, then re-applied the fix (`git diff --stat` afterward showed only the two intended files touched) |

`No assertion was deleted, skipped, or weakened.`

## Test Run Output

```
$ npx playwright test --list   (after fixture fix)
Total: 278 tests in 25 files

$ npm run e2e -- e2e/plain-shell.spec.ts
Running 16 tests using 6 workers
  16 passed (9.0s)

$ make e2e   (full sweep, fresh rebuild)
Running 278 tests using 6 workers
  278 passed (1.1m)
```

## Fix Attempt (review cycle 1)

**Task**: no issue in `review.md` is tagged `[e2e-specs]` this cycle. My job was the
coverage rule: assert the new user-facing behaviour added by this cycle's fix waves.
Read `web-implementation.md`'s `Fix Attempt 1 (review cycle 1)` section (`daemon-implementation.md`
has none this cycle) and added coverage for its two shipped changes:

1. **Major 1's dead-surface notice** (`web/index.html`'s `.terminal-notice` inside
   `#dead-surface`/`#dead-surface-template`, `web/src/render/dead.ts`'s
   `showDeadSurfaceNotice`, `web/src/main.ts`'s `findDeadSurfaceRefs`) — E9 only covered
   the live-session half of REQ-12; this cycle's fix closes the dead-session half.
2. **Major 3's `--shell-pip` token** (`web/src/style.css`, decision `shell-pip-hue` Option
   B) — pins that the pip renders the new token rather than `--teal`.

### New tests

Added three tests to `web/e2e/plain-shell.spec.ts`, plus two helpers to
`web/e2e/helpers/shell.ts`:

- `deadSurfaceNotice(deadSurfaceRoot)` — scopes to `.terminal-notice` specifically,
  deliberately NOT `root.getByRole("status")` (the dead-surface root also contains
  `<b role="status">session ended</b>` inside `.endcap`, so a bare role query would match
  both — the exact file-drop-fix E9 lesson the agent brief calls out).
- `expectPipUsesShellPipToken(pip)` — resolves both `--shell-pip` and `--teal` through a
  throwaway same-document probe element and compares the pip's own computed
  `background-color` against both, so the check survives whatever theme is active and
  doesn't compare a browser-normalised `rgb(...)` against a hardcoded hex literal.

| Test | Requirement | What it verifies |
|------|-------------|-------------------|
| "switching to shell on a DEAD session with its directory removed shows the daemon's error in the dead surface's own notice, leaving the segment on claude" | Major 1, REQ-12 dead-session variant, edge cases 4+13 | Ends the session (mounts Focus's `#dead-surface`), removes its directory, clicks `shell`; asserts the 409's message renders in `#dead-surface .terminal-notice` and the segment stays on `claude`. **Passes.** |
| "switching to shell on a DEAD tile with its directory removed shows the daemon's error in that tile's own dead-surface notice, and a neighbouring tile is unaffected" | Major 1, REQ-12 dead-session variant, tile path | Same scenario through a tile's cloned `.dead-surface`, with a live neighbour session asserted unaffected. **Fails — see Implementation Bugs below.** |
| "a running shell's pip resolves to the --shell-pip token, not --teal" | Major 3 / decision `shell-pip-hue` | Starts a shell, reads the lit pip's computed `background-color`, asserts it equals the resolved `--shell-pip` token and differs from `--teal`. **Passes.** |

### Coverage (additions this cycle)

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-12 (dead-session variant, Focus) | "switching to shell on a DEAD session with its directory removed..." |
| REQ-12 (dead-session variant, tile) | "switching to shell on a DEAD tile with its directory removed..." (currently red — implementation bug) |
| Major 3 / decision `shell-pip-hue` | "a running shell's pip resolves to the --shell-pip token, not --teal" |

### Build & run

```
$ make web-build build
tsc --noEmit && vite build   -> exit 0 (no leftover TS errors from prior waves)
go build ... -> bin/musterd built

$ npx playwright test --list
Total: 281 tests in 25 files   (278 + 3 new)

$ npm run e2e -- e2e/plain-shell.spec.ts
Running 19 tests using 6 workers
  18 passed, 1 failed (the new tile-path test)

$ make e2e   (full sweep)
Running 281 tests using 6 workers
  280 passed, 1 failed — same single test; no other regression anywhere in the suite
```

### E2E Implementation Bugs

**FIXED — web-impl commit `f2433ae`** (`fix(plain-terminal-session): check active view, not
a stale flag, for dead-surface routing (review cycle 1)`). Re-verified below: rebuilt
(`make web-build build`), `npx playwright test e2e/plain-shell.spec.ts` → 19/19 passing
(the previously-red tile-path test now passes), full sweep `make e2e` → 281/281 passing, no
regression. No assertion was changed to get there — the fix landed in `web/src/main.ts`,
not in this spec.

| Bug | Route | Plan reference | Expected (per plan) | Actual | Failing test |
|-----|-------|----------------|---------------------|--------|--------------|
| `findDeadSurfaceRefs`'s Focus branch (`web/src/main.ts:514-517`) returns the wrong dead-surface instance once the user has left Focus view, silently swallowing the notice again | `[web-impl]` | Review Major 1 (REQ-12): "give `#dead-surface` its own notice... and fall back to it when no live surface exists for the id" | Clicking a DEAD session's `shell` segment on its own **tile** (Tiles view) with the directory removed shows the daemon's 409 message in that tile's `.terminal-notice` | The message is written to Focus's `#dead-surface .terminal-notice` instead — invisible, since `viewFocusEl.hidden` is true in Tiles view — while the tile's own notice stays empty | "switching to shell on a DEAD tile with its directory removed shows the daemon's error in that tile's own dead-surface notice, and a neighbouring tile is unaffected" |

**Root cause, measured directly** (throwaway spec, run then deleted, not committed — same
pattern web-impl used for its own Major 1/3 verification): with `deadSession` as the
`focusedId` (auto-focused "top of sort" on load) and the user having switched to Tiles
view, ending `deadSession` while still in Focus view sets `deadSurfaceEl.hidden = false`.
Switching to Tiles calls `render()`, but `render()` only invokes `renderFocusView` (which
is the sole writer of `deadSurfaceEl.hidden`) when `view === "focus"` (`web/src/main.ts`
around line 1059); in Tiles view it calls `renderTilesView` instead, so
`deadSurfaceEl.hidden` is never reset and stays stale at `false`. `findDeadSurfaceRefs`'s
check `focusedId === id && !deadSurfaceEl.hidden` is therefore satisfied even though
Focus's `#dead-surface` is not on screen (`viewFocusEl.hidden` is `true`), so it returns
Focus's `deadSurfaceRefs` instead of requerying the visible tile. Confirmed by reading both
elements' text directly after the click: `#dead-surface .terminal-notice` held the
daemon's real message text (hidden), while the tile's own `.terminal-notice` was empty.
This reproduces the exact "silent no-op, user sees nothing" failure mode Major 1
described, in the one combination its fix's Focus-branch check doesn't account for: the
currently Tiles-focused session happens to also be the module's last Focus-remembered
`focusedId`. This is an entirely ordinary flow (focus a session in Focus view, switch to
Tiles, act on that same session's tile) — not a contrived edge case.

Per the fix-mode constraints, I made no implementation change (`web/src/main.ts` is not
mine to touch) and did not weaken, skip, or delete the failing assertion — the test stayed
red until web-impl's fix landed.

### Re-verification after f2433ae

```
$ make web-build build
tsc --noEmit && vite build -> exit 0
go build ... -> bin/musterd built (v0.4.0-45-gf2433ae-dirty)

$ npx playwright test e2e/plain-shell.spec.ts
Running 19 tests using 6 workers
  19 passed (9.3s)

$ make e2e   (full sweep)
  281 passed (1.2m)
```

## Repairs (this cycle)

No repairs this cycle — no test needed a locator/wait/fixture fix; the one failure was the
implementation bug above, now fixed upstream (`f2433ae`) and re-verified green.

`No assertion was deleted, skipped, or weakened.`
