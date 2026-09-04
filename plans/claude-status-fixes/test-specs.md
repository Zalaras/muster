# E2E Test Specs: claude-status-fixes

**Plan**: claude-status-fixes
**Mode**: validate (attempt 1)
**Verdict**: pass
**Tests created**: 6 (4 new file, 2 added to rename.spec.ts)
**Live run**: 248/248 passing (full `make e2e` suite)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|-------------------|
| web/e2e/subagent-status.spec.ts | subagent permission after the parent Stop moves the card to needs input, and the unmarked Notification straggler that follows changes nothing (E2) | REQ-1, REQ-3, REQ-4 | `Stop` w/ non-empty `background_tasks` → idle; marked `PermissionRequest` for the closed prompt → needs input, `attention.reason:"permission"`; unmarked `Notification` after it is a true no-op (`attention.since` unchanged); marked `PostToolUse` → working, `attention` null |
| web/e2e/subagent-status.spec.ts | #20's shape — attention latched under plan mode clears when activity arrives under auto, landing working not needs input (E4) | REQ-4 | Open-prompt turn-activity clears `attention`/`failure` even under a different `permission_mode`, landing `working` not `needs_input` |
| web/e2e/subagent-status.spec.ts | a failed turn's note is cleared once the next turn starts, not carried into working (E7) | REQ-4 | `StopFailure` → failed w/ `failure.error`; next `UserPromptSubmit` → working, `failure` null, no stale error text |
| web/e2e/subagent-status.spec.ts | subagent tool activity past the parent Stop keeps the card working, with stateSince moving at each transition (E8) | REQ-1, REQ-2 | `Stop` (background_tasks non-empty) → idle; marked `PostToolUse` for the closed prompt → working, `stateSince` strictly later; fresh-prompt resumption closes ordinarily |
| web/e2e/rename.spec.ts | clicking the pressed view segment while its own rename editor is open commits instead of cancelling, on both the mainhead and a tile header (E5) | REQ-6 | Active-segment click on mainhead and on a tile: field closes, exactly one `PUT …/title`, new title shown, segment stays pressed |
| web/e2e/rename.spec.ts | a right-click on the inactive Tiles segment while a mainhead rename is open does not cancel it — no click fires, the blur commits, and the view stays Focus (E6, REQ-7) | REQ-7 | Non-primary-button `mousedown` on the *inactive* segment never cancels; blur commits (one PUT); view unchanged |

The pre-existing straggler test in `sessions.spec.ts` ("a straggler turn-activity for an
already-closed prompt does not move the card off idle (E6)") is REQ-5/E3's regression pin and
was **not edited** — see Coverage/Notes.

## Fixture Changes

`web/e2e/helpers/payloads.ts` (additive only — every default value byte-identical to before):

- `TurnActivityOpts.agentId?: string` — when set, `rawUserPromptSubmit`/`rawPostToolUse` add
  `agent_id` + `agent_type: "general-purpose"`, the measured subagent marker
  (spikes/canary-fields.md "Subagent and background-task fields", 2.1.259 probe). Omitted by
  default — main-agent hooks never carry the key at all (not even `null`), matching the measured
  shape.
- `rawPermissionRequest(sessionId, promptId, opts?: { agentId?: string })` — same marker option,
  same measured source (a subagent's `PermissionRequest` carries `agent_id`/`agent_type`, unlike
  the `Notification` that follows it).
- `StopOpts.backgroundTasks?: unknown[]` (default `[]`, unchanged) — lets a test post the
  measured non-empty `background_tasks` shape. Added `runningSubagentTask(id?)` and
  `runningShellTask(id?)` builders for the two measured entry shapes (`type, id, agent_type,
  description, status` / `type, id, command, description, status`). Per plan decision 3,
  `background_tasks` is fixture realism only — no test in this file asserts on its contents,
  only on the resulting session state.

All shapes are traceable to spikes/canary-fields.md "Subagent and background-task fields" and
spikes/FINDINGS.md's addendum probe (2026-09-03, 2.1.259) — no invented fields.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | subagent-status.spec.ts E2, E8 (marker derivation exercised indirectly via the resulting transition; the marker's own presence/absence is daemon-tests' `interpret_test.go`, D6) |
| REQ-2 | subagent-status.spec.ts E8 (marked PostToolUse past a closed prompt resumes ACTIVE without reopening it) |
| REQ-3 | subagent-status.spec.ts E2 (marked PermissionRequest past a closed prompt → needs_input) |
| REQ-4 | subagent-status.spec.ts E2 (attention clears on resume), E4 (#20 shape), E7 (failure clears on next turn) |
| REQ-5 | sessions.spec.ts's existing straggler test (E6 there / E3 in this plan's acceptance ids) — unedited, confirmed green (see Notes) |
| REQ-6 | rename.spec.ts new E5 |
| REQ-7 | rename.spec.ts new E6 |
| REQ-8 (daemon-tests' table) | not this agent's — table-driven unit coverage is `internal/session/machine_test.go`, D5 |

Acceptance-criteria cross-reference: E2, E4, E7, E8 (this plan's own ids) live in
`subagent-status.spec.ts`; E5, E6 live in `rename.spec.ts`; E3 is the pre-existing
`sessions.spec.ts` straggler test, unedited. E1 is `make e2e` itself.

## Repairs (authoring)

None — first authoring pass, no prior run to repair. See `## Repairs` under Validate
Attempt 1 below for the validate-mode repairs.

## Notes

- **Every new test asserts new behaviour** (the `FromSubagent` bypass, the attention/failure
  clear-on-resume, the active-segment rename commit, the non-primary-button guard) — none of it
  exists on the current tree, so all 6 are collection-only per the authoring-mode gate. Collection
  (`npx playwright test --list` from `web/`) is clean: 248 tests across 23 files, no duplicate
  titles, no TypeScript errors (`npx tsc --noEmit -p web` also clean under the strict
  `noUnusedLocals`/`exactOptionalPropertyTypes` config).
- **Regression-pin spot checks (run live, all green)**: because this pass edited the shared
  `helpers/payloads.ts` (used by ~15 other spec files), three existing tests exercising the
  touched functions were run against the current tree to confirm the additive changes are
  byte-compatible: `sessions.spec.ts`'s straggler test (REQ-5's own regression pin, uses
  `rawPostToolUse`), `ingest.spec.ts`'s `SessionStart`+`Stop` persistence test (uses `rawStop`),
  and `permission-mode.spec.ts`'s auto-fallback test (uses `rawUserPromptSubmit`). All three
  passed unchanged.
- **Plan defect flagged, not worked around**: REQ-6's prose claims an active-segment rename
  commit sends "no prefs request... for the view." The plan's own Affected Files section scopes
  this plan to the two `mousedown` listeners at `web/src/main.ts:884-885` only — the `click` →
  `requestView()` listeners at 886-887 are untouched and unconditionally `PUT /api/prefs` on
  every click, active segment or not (verified by reading the current source; no dedup exists in
  `putPrefs`). The plan's own **E5** acceptance criterion (the one the reviewer actually checks
  against) does not claim prefs-request absence, so the new `rename.spec.ts` test follows E5 and
  does not assert on prefs requests, with an inline comment explaining the discrepancy for
  daemon/web-impl and the reviewer.
- **E8 test written despite the Affected Files table omission**: the table lists this file's
  scope as "E1, E2, E3, E4, E7" (missing E8), but E8 is a full Must-Have-adjacent acceptance
  criterion (Edge Case 1) and the plan's own Reviewer-Verified section says "E2–E8: present in
  the suite and passing" — so E8 is covered here as a fourth test in the new file.
- **`runningShellTask` is unused by my own tests** — added for symmetry with the measured shell
  entry shape (canary-fields.md) in case a future fix cycle needs it; `tsc --noEmit` doesn't flag
  unused exports, only unused locals, so this is not a build-gate risk.
- No web unit-test gap here to fill — the plan states REQ-6/REQ-7 have no pure logic to extract
  (E2E-only), which this file's E5/E6 satisfy.

## Validate Attempt 1

Rebuilt (`make web-build build`, project root) against both landed tracks — daemon-impl's
initial pass plus its Fix Attempt 1 (the INV-F gap closed in `KindNeedsInputPermission`/
`KindNeedsInputIdle`), and web-impl's guarded `mousedown`/`click` listeners.

**First live run** (`npm run e2e -- e2e/subagent-status.spec.ts e2e/rename.spec.ts` from
`web/`): 17/19 passed. `rename.spec.ts` was 15/15 green on the first try, including the two
new REQ-6/REQ-7 tests. `subagent-status.spec.ts` failed E7 and E8 — both `stateSince`
strict-ordering assertions.

### Root cause and repair

Both failures were a timing assumption in my own spec, not a daemon defect. `stateSince` is
wire-formatted with `time.RFC3339` (`internal/server/sessionwire.go:103`), whole-second
resolution — the same granularity `launch.spec.ts` already documents for `last_launched_at`.
My E7 and E8 tests posted two hooks back to back with no wait between them, so both
transitions landed inside the same wall-clock second and their `stateSince` values tied even
though the daemon ordered the transitions correctly in memory. This is exactly the class of
defect the harness rules describe for MRU ties — my spec guessed sub-second precision the
wire doesn't carry.

Repaired by hoisting `launch.spec.ts`'s private `waitForNextClockSecond()` into
`web/e2e/helpers/session.ts` (a second spec file now needs it, per the pattern's own note to
hoist at that point) and calling it before the event whose resulting `stateSince` must
provably differ, in both tests. `launch.spec.ts` now imports the hoisted helper instead of
defining its own copy; re-ran it standalone (23/23 passing) to confirm the hoist didn't
regress recents-ordering.

Also added the REQ-6 prefs-request-absence assertion to `rename.spec.ts`'s E5 test, per the
orchestrator's note: web-impl's implementation log records guarding the `click` →
`requestView` listeners as well as the `mousedown` listeners (a superset of the plan's
stated Affected Files scope, directed explicitly), which makes REQ-6's "no prefs request...
for the view" true on the current tree. E5 now tracks `PUT /api/prefs` alongside the
existing title-PUT counter and asserts: zero prefs PUTs on the first active-segment click
(no view switch has happened at all yet), exactly one on the genuine Focus→Tiles switch that
follows, and no further increase on the second active-segment click (the Tiles mirror). The
stale "plan-defect note, not worked around" comment block above E5/E6 was updated to reflect
that the behaviour now exists and is asserted, rather than left as a known gap.

### Full suite sweep

`make e2e` from the project root: **248/248 passed**, no failures, no new/dropped tests
against the authoring pass's collection count. No pre-existing spec needed updating for a
sanctioned protocol-delta breakage — this plan changes state-machine semantics and two
listener guards only, with no wire-shape change, so nothing outside `subagent-status.spec.ts`
and `rename.spec.ts` was expected to move, and nothing did.

## Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | subagent-status.spec.ts "a failed turn's note is cleared once the next turn starts..." (E7) | `expect(resumed.stateSince).not.toBe(lastActivityBefore)` failed — both equal `2026-09-03T21:38:07Z` | `stateSince` is RFC3339, whole-second resolution; the `StopFailure` and the following `UserPromptSubmit` were posted within the same wall-clock second, so a real transition still produced an identical wire timestamp | Added `await waitForNextClockSecond()` (hoisted from `launch.spec.ts` into `helpers/session.ts`) before posting the second hook | REQ-4 (failure clears on next-turn activity): still asserts `resumed.failure` is null and `stateSince` differs — proven by deliberately reverting the wait locally and re-running, which reproduced the original tie (equal timestamps), confirming the wait is what turns the assertion green, not a widened tolerance |
| 2 | subagent-status.spec.ts "subagent tool activity past the parent Stop keeps the card working, with stateSince moving..." (E8) | `expect(workingSince).toBeGreaterThan(idleSince)` failed — both equal `1788471488000` | Same whole-second tie: the `Stop` (idle) and the marked `PostToolUse` (working) landed in the same second | Added `await waitForNextClockSecond()` before posting the marked `PostToolUse` | REQ-2 (marked activity past a closed prompt resumes ACTIVE): still asserts `workingSince > idleSince` strictly — verified by the same revert-and-rerun check, which reproduced the tie without the wait |

No assertion was deleted, skipped, or weakened.

## Notes (validate)

- Both repairs are the identical root cause (whole-second wire timestamps), not two
  independent defects — flagging so the reviewer doesn't read it as two unrelated bugs.
- The hoist to `helpers/session.ts` is additive to a shared module; `launch.spec.ts`'s own
  22 tests were re-run and pass unchanged, confirming byte-for-bit-compatible behaviour
  after the move.
- No implementation code was touched. `git diff --stat` shows only
  `web/e2e/helpers/session.ts`, `web/e2e/launch.spec.ts`, `web/e2e/rename.spec.ts`, and
  `web/e2e/subagent-status.spec.ts`.
