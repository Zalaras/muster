# Web Tests: Rail Card Improvements 2

**Plan**: rail-card-improvements-2
**Verdict**: pass
**Pack**: kb pack for rail-card-improvements-2/web-tests — accepted ADRs, facts, generated
contract.md, conventions and role lessons, no missing/unresolved records.

## Summary

web-impl's handoff named two sanctioned test-compile breaks
(`web/src/render/update.test.ts`, `web/src/ws.test.ts`) from `UpdateInfo` gaining required
`canCheck` and `buildUpdateViewModel`/`UpdateSectionElements` gaining the check-request
shape. Repairing them surfaced a third break `tsc` didn't catch: `web/src/protocol.test.ts`'s
`validUpdateInfo` fixture is an untyped object literal, so TypeScript never flagged its
missing `canCheck`, but `parseUpdateInfo`'s new `typeof canCheck !== "boolean"` guard made
every test built on it fail at runtime (39 of 210 tests red under `npm test` before this
fix, despite a clean `tsc`) — same contract cause as the other two, just invisible to the
type-check gate. Fixed all three plus the two obligations named in the handoff.

Tests created: 17 new | Tests updated (signature/assertion fixes for the contract change): 33
Passing: 1789/1789 (full suite) | Failing: 0

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `update.test.ts` | checkEnabled is true when canCheck is true and no check is in flight | REQ-10 | pass |
| `update.test.ts` | checkEnabled is false when canCheck is false | W2 | pass |
| `update.test.ts` | checkEnabled is false while this window's own check is in flight | W4/edge 16 | pass |
| `update.test.ts` | checkEnabled is true with the daily-check toggle off | REQ-8/W3 | pass |
| `update.test.ts` | checkBusy mirrors check.inFlight regardless of canCheck (each) | REQ-13 | pass |
| `update.test.ts` | checkEnabled/checkBusy with update === null (2 cases) | W2/edge 21 | pass |
| `update.test.ts` | renders 'v\<available\> · checked \<age\>' | REQ-11 | pass |
| `update.test.ts` | age suffix present with daily-check toggle off | REQ-11/REQ-8 | pass |
| `update.test.ts` | renders 'up to date · checked \<age\>' | REQ-11 | pass |
| `update.test.ts` | no age suffix when checkedAt is null even if available is set | edge 19 | pass |
| `update.test.ts` | 'checked now', never 'now ago', under a minute | edge 20/W5 | pass |
| `update.test.ts` | availableText unaffected by prefs === null | REQ-11 | pass |
| `update.test.ts` | failed manual check's reason wins over idle/remedy/empty | REQ-12 | pass |
| `update.test.ts` | failed manual check's reason wins over an apply phase in progress | REQ-12 | pass |
| `update.test.ts` | falls back to apply-phase chain once check.error clears | REQ-12 | pass |
| `update.test.ts` | renderUpdateSection writes checkBtn.disabled from checkEnabled | REQ-10 | pass |
| `update.test.ts` | renderUpdateSection sets/removes aria-busy on checkBtn | REQ-13 | pass |
| `protocol.test.ts` | rejects the whole snapshot when update.canCheck is missing | edge 21 (protocol layer) | pass |
| `protocol.test.ts` | rejects the whole snapshot when update.canCheck is not a boolean | malformed payload | pass |

Plus 33 pre-existing `update.test.ts` tests whose call sites needed the new `now`/`check`
arguments (via a `buildVm` wrapper defaulting them) and whose `.available` assertions
needed the REQ-11 age suffix appended; one test (the `!updateCheck` "checking disabled"
readout, old line 115) was deleted per REQ-11/W7, not repaired.

`sessions.test.ts`'s `FakeDomNode` card fixture (`buildCardTemplateFragment`, ~line 307)
restructured to match `index.html`'s real REQ-4 markup: `.r1` now holds only `.name`, a new
`.r0` holds `.badge`/`.timer`/`.pin` (previously all three lived under `.r1`, the pre-REQ-4
shape), and the single `.activity` node split into `.activity.you`/`.activity.claude` to
match the two-line template exactly. No test in the file asserts `.r0`/`.r1` sibling order
or touches `.activity` content, so this was a fixture-fidelity fix, not a behavior-pinning
one — flagged because a stale comment describing wrong structure would be a false comment,
not because any assertion depended on it.

## Investigation note (not an implementation bug)

Plan edge case 21 reads "a pre-plan daemon that sends no `canCheck` at all → `parseSnapshot`
tolerates it ... same shape `update === null` already produces." I checked whether this
requires new leniency in `parseSnapshot` beyond `parseUpdateInfo`'s existing "malformed
sub-object rejects the whole snapshot" discipline (the same rule already applied to a
missing `running` or a bad `install` enum, per `protocol.ts`'s own comment "same discipline
as claudeTheme"). It doesn't: `PROTOCOL_VERSION` wasn't bumped for this plan (additive-field
discipline, `kb:adr/connection-protocol-bumps-only-on-shape-change`), the daemon and web
build ship in one binary so a version-skewed pair can't occur outside a stale open tab
(handled by the existing protocol-mismatch reload, not per-field tolerance), and the plan's
own Protocol Contract section documents `canCheck` as an ordinary required field with no
tolerance clause. I read this as loose scenario framing, not a distinct acceptance
criterion — W2 (the only criterion the edge case cites) is satisfied either way, since
`buildUpdateViewModel(null, ...)` already disables the button. Added protocol-level
coverage pinning the actual behavior (whole-snapshot rejection, matching the `running`
sibling test's pattern) rather than treating this as underspecified.

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 Test Files  43 passed (43)
      Tests  1789 passed (1789)

$ npm run build
✓ built in 1.59s

$ npm run lint
Checked 177 files in 176ms. No fixes applied.

$ rg -n "checking disabled" web/src web/e2e
(no matches — W7 clean)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py web/src/protocol.test.ts web/src/render/sessions.test.ts web/src/render/update.test.ts web/src/ws.test.ts
dead-refs: 7 references checked, 0 missing
```
