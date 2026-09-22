# Web Tests: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Verdict**: pass
**Pack**: `go run ./tools/kb pack --plan terminal-fixes-cleanup --role web-tests` — 8988 words (over the 8000 budget, WARN only), decisions/facts/lessons for features `surfaces`, `theme`.

## Summary

Tests created: 94 (new, including review cycle 1's 2 accumulation tests) + repaired 20 in
`surfaceswitch.test.ts`.

Full suite: `Test Files 43 passed (43)`, `Tests 1728 passed (1728)`.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `surfaceswitch.test.ts` | `hasPip`→`shellActState` fakes, 12 call sites | rebuilt against the new `shellActEl`/`data-act` contract (no more 3-arg `updateSurfaceSegment`, no `pipEl`) | pass |
| `surfaceswitch.test.ts` | "activity 'none': ... no indicator in the DOM" | absence of `shellActEl` for `"none"` | pass |
| `surfaceswitch.test.ts` | "activity 'busy' while claude is selected: indicator still attached" | indicator reflects `activity`, not `selected` (was: pip reflected `shellRunning`) | pass |
| `surfaceswitch.test.ts` | "activity 'done': indicator attached with data-act='done'" | new "done" state the old pip contract had no equivalent for | pass |
| `surfaceswitch.test.ts` | "'busy' then 'done' across two passes updates data-act in place" | dataset value refresh without detach/duplicate | pass |
| `shellkeys.test.ts` | W1: Option+Left/Right → `ESC b`/`ESC f` | `shellKeyBytes` | pass |
| `shellkeys.test.ts` | W2: Cmd+Left/Right → `0x01`/`0x05` | `shellKeyBytes` | pass |
| `shellkeys.test.ts` | untranslated chords (plain arrows, Up/Down, ctrl combos, both modifiers, no modifier) → `null` | `shellKeyBytes` boundary coverage | pass |
| `shellkeys.test.ts` | `wheelDeltaToScrollLines` sign, zero-rounding, exact-half-line ties, [1,200] clamp both directions | pure wheel conversion (W4's logic half) | pass |
| `shellkeys.test.ts` | sub-line deltas accumulate across frames until one crosses a whole line | review cycle 1 Major 1 fix (`flushWheelScroll`'s carried remainder), pinned via `PIXELS_PER_LINE` + `wheelDeltaToScrollLines` | pass |
| `shellkeys.test.ts` | the remainder below a whole line carries into the next frame rather than resetting to 0 | same fix, the carry-not-reset half | pass |
| `shellactivity.test.ts` | `observeBusy` from none/busy/done, onset-restart, epoch isolation | REQ-11, edge case 5 | pass |
| `shellactivity.test.ts` | `resolveOnset` epoch-match / stale-epoch / already-resolved | timer glue correctness | pass |
| `shellactivity.test.ts` | `resolveOnset` — **W8** "work shorter than onset delay produces neither spinner nor tick" | see Fix History | pass |
| `shellactivity.test.ts` | `observeIdle` — never-touched session is a true identity no-op; still-"none"-with-pending-onset advances the epoch without changing the observable indicator; busy → done, selected/unselected timer behaviour | REQ-3, REQ-4 (live path), W8's epoch-invalidation mechanism | pass |
| `shellactivity.test.ts` | `restoreBusy` — **W9** three sessions restored, zero pending timers | snapshot-restore path | pass |
| `shellactivity.test.ts` | `restoreIdle` — **W6** busy→done always with self-clear timer; still-"none" advances the epoch same as `observeIdle`; self-clear reaches "none" with no reselection (E8) | snapshot-gap path, distinct from `observeIdle` per web-impl's recorded deviation | pass |
| `shellactivity.test.ts` | `resolveSelfClear` — **W7** a new busy period leaves a stale pending self-clear timer harmless | epoch-cancellation | pass |
| `shellactivity.test.ts` | `clearOnSelect`, `shellGone` | REQ-4 select-clears, REQ-8/edge cases 1-2 unconditional clear with no transient tick | pass |

## Fix History

**Cycle 1 (initial pass)**: found and pinned a real W8 bug — `resolveOnset` promoted a
session to "busy" after its onset timer fired even when a `shellActivity{busy:false}`
arrived first, because `observeIdle`'s old guard (`current.indicator !== "busy"`) was a
true no-op that left a still-"none" entry's epoch untouched. Verdict was
`implementation-bug`, routed back to web-impl.

**Cycle 2 (this pass, pre-review fix)**: web-impl landed the fix as `680ea45` —
`observeIdle` and `restoreIdle` now bump the entry's epoch (indicator held at `"none"`)
when idle arrives while an onset timer is still pending, so a late `resolveOnset` sees a
stale epoch and never promotes; `restoreIdle` had the identical latent hole and got the
same fix. That fix necessarily changed `observeIdle`'s return for the still-"none" case
from a literal `{state, timer: null}` identity to a new state object carrying the bumped
epoch — invalidating my own `observeIdle — ... not currently 'busy' ... no-op, identity`
test's `toBe(r.state)` assertion (a `toBe` and W8 cannot both hold for that one call: see
the reducer's own comment on `observeIdle`, `web/src/terminal/shellactivity.ts`, for the
full derivation). Reconciled by splitting that test in two: a true-identity case for a
session with no entry at all (the `!state.has(id)` branch, still `toBe`), and a new case
asserting the *observable* contract for the pending-onset case (`getShellActivity` stays
`"none"`, `timer` stays `null`, `state` is `not.toBe` the input — the epoch bump is real
but invisible to every caller except a stale timer). No implementation code was touched
this cycle. W8's own pinned assertion (`resolveOnset`'s describe block) needed no change
and now passes.

**Review cycle 1 fix wave (this pass)**: two prose fixes and one coverage addition, no
assertion changed or weakened per the review's own note that the flagged assertions were
"correct and specific."

- Major 2: `shellactivity.test.ts`'s W8 comment (the block above the "a busy period that
  ends before the onset delay elapses" test) described the pre-`680ea45` bug as still
  live and cited a nonexistent "web-tests.md's Implementation Bugs table" (this file has
  never had that section — only `## Fix History`, added in cycle 2 above). Reworded to
  state the shipped invariant in the present tense: `observeIdle`'s pending-onset branch
  bumps the epoch without touching `indicator`, so the stale onset timer no-ops.
- Major 6: `surfaceswitch.test.ts`'s `describe`/`it` titles for `shellEnded` still said
  "clears the pip atomically" / "clears shellRunning (the pip)". Nothing named pip exists
  post-`680ea45`'s sibling comment fixes in `surfaceswitch.ts` (review cycle 1's
  `web-impl` pass); `shellRunning` gates attachability and background mounting, not any
  visible indicator (that's `shellactivity.ts`'s job via `activityFor`). Retitled both to
  name `shellRunning` and what it actually does; the two assertions themselves (both
  `toEqual({ selected: "claude", shellRunning: false })`) are unchanged.
- Coverage gap (not a numbered review issue, flagged by the orchestrator alongside the
  two Majors): review cycle 1's web-impl fix reworked `flushWheelScroll`'s accumulator to
  carry a sub-line remainder across animation frames instead of discarding it (Major 1,
  the headline defect — 60 small wheel events scrolled nothing, one large one scrolled 6
  lines). No unit test pinned that accumulation behaviour; the E2E specs all use deltas
  ≥300px, which is how it shipped past 394 green E2E tests in the first place. The
  accumulator field (`wheelAccumDeltaY`) is private to `TerminalSurface` and not
  reachable without a DOM harness, but its per-frame *step* is exactly the two values
  `shellkeys.ts` exports for this purpose (`PIXELS_PER_LINE`, `wheelDeltaToScrollLines`
  — see that file's comment on the export), so `shellkeys.test.ts` gained two tests that
  reproduce `flushWheelScroll`'s accumulator step against those exports directly: a run
  of sub-line deltas eventually crosses a whole line, and the remainder left over after a
  line is consumed carries into the next frame rather than resetting to 0.

## Test Run Output

```
 Test Files  43 passed (43)
      Tests  1728 passed (1728)
```

`npx tsc --noEmit`: clean (0 errors). `npm run build`: succeeds (`vite build` — the
pre-existing mermaid chunk-size warning is unrelated to this plan). `E15`
(`! rg -n -e "pipEl" -e "shellPip" web/src web/e2e`): clean. `E14`
(`! rg -n -e "--shell-pip" web/src web/scripts web/e2e`): clean.

## Handoff

- `web/src/terminal/surfaceswitch.test.ts` is repaired per web-impl's original Handoff:
  `pipEl`/`FakeSurfacePip` → `shellActEl`/`FakeShellActEl`, `hasPip()` → `shellActState()`
  reading `data-act`, all 12 `updateSurfaceSegment` call sites take the 4th `activity`
  argument, and the five presence-contract tests are re-authored against "absence ==
  `none`, presence + `data-act` == `busy`/`done`" instead of the old
  `shellRunning`-driven pip.
- Nothing further outstanding on this track: W1, W2, W6, W7, W8, W9 all covered and
  passing, full suite green, build green, E15 clean.
