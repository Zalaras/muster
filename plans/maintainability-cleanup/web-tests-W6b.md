# Web Tests: Maintainability Cleanup — Unit W6b test repair

**Plan**: maintainability-cleanup
**Mode**: fix (repair mode — sanctioned test breakage left by W6b's implementation pass)
**Verdict**: pass
**Pack**: `kb: pack 65885 words (budget 8000)` / `kb: WARN pack exceeds budget of 8000
words` (`go run ./tools/kb pack --plan maintainability-cleanup --role web-tests`) — this
plan touches 22 features, so the pack is far over budget; that's an existing WARN on this
plan, not something this unit introduced, and the budget overrun doesn't block a pack from
being produced.

## Summary

Read `plans/maintainability-cleanup/web-implementation-W6b.md`'s Handoff, which named
exactly three sanctioned-broken test files (48 `tsc` errors / 58 runtime failures, all
mechanical consequences of W6b's signature changes) plus one new zero-coverage module
(`sessions/usage.ts`). Fixed all three, added coverage for the fourth, touched no
implementation file.

Tests created: 6 (new file) | Tests changed (signature/API only, same intent): 45 | Tests
removed: 3 (with reasons below) | Passing: 104/104 in the four touched files, 1856/1856
across the whole suite | Failing: 0

- `web/src/render/sessions.test.ts`: 29 tests, was 29 — all 42 `reconcileCards(...)` call
  sites and the one `renderSessions(...)` call site converted from the old positional tail
  to the new `CardListOptions` object literal via a `baseOptions(overrides)` test helper
  (matches every test's own prior default: `connected: true`, `draggable: false`,
  `currentId: null`, `railActivity: "turn"`). No test's assertions or intent changed.
- `web/src/render/tiles.test.ts`: 19 tests, was 19 — `renderStrip`'s one call site gained
  the new `template` positional argument and a `StripOptions` object. The
  "REQ-15/INV-4" describe block's two data-editing tests were rewired from hand-setting
  `.nm`'s `data-editing` DOM attribute to driving a new `fakeRenameController()` fixture's
  `setEditing()`, matching `updateTile`'s new `refs.rename?.isEditing()` contract (review
  Minor 3). The third test in that block (the non-editing case) was retitled to describe
  what it now actually pins — `refs.rename` absent, treated as not-editing — since it
  never touched the attribute either way.
- `web/src/render/masthead.test.ts`: 50 tests, was 53 — see the removal table below for
  each of the 3 tests dropped; every other test was converted from
  `renderUsage`/`renderUsageTrack`/`renderModelWeek`/`UsageElements` to
  `buildUsageBucket`/`renderUsageBucket`/`buildUsageModelWeek`/`renderUsageModelWeek`
  (Major 2/Minor 1), with the same assertions wherever the underlying contract is
  unchanged. `FakeDomNode` gained `remove()` (with parent-tracking) since
  `renderUsageBucket`'s known -> unknown honesty transition now calls it on the bar/resets
  nodes, which the old `renderBucket`/`renderUsageTrack` pair never did.
- `web/src/sessions/usage.test.ts` (new): 6 tests covering `buildUsageBucketViewModel` —
  the pure percent/warn/fillPercent/resetsText derivation Major 2 extracted out of
  `render/masthead.ts` — including the two rounding-boundary cases (0%/99.6%) and the
  raw-vs-rounded warn-threshold distinction, moved here from `masthead.test.ts` per this
  plan's "one derivation, one renderer" split (`sessions/context.ts` /
  `render/context.ts` is the existing precedent this follows).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions.test.ts` | builds one card per session, in the given order, on first reconcile (insert case) | `reconcileCards` insert path via `CardListOptions` | pass |
| `sessions.test.ts` | reuses the same DOM node for a session that survives a reconcile | update-in-place, not rebuild | pass |
| `sessions.test.ts` | reorders existing cards in place | same node identity, new position | pass |
| `sessions.test.ts` | removes only the departed session's card | node identity preserved for survivors | pass |
| `sessions.test.ts` | 5 focus capture/restore tests (Fix Attempt 3) | focus survives a reorder via `pendingFocus`/live capture | pass |
| `sessions.test.ts` | 5 pin-button-attribute tests (REQ-8/REQ-17/W13) | aria-label/aria-pressed/title/data-action/data-id | pass |
| `sessions.test.ts` | 4 pinned-block-visual tests (REQ-9/W14) | `pinned`/`pinned-last` classes | pass |
| `sessions.test.ts` | 4 INV-3 aria-current tests (W6) | `currentId` marker follows the current session only | pass |
| `sessions.test.ts` | 4 draggable-attribute tests (REQ-10/W15/W16) | explicit `"true"`/`"false"`, never absent | pass |
| `tiles.test.ts` | 4 `renderTileGeometry` tests | live/stopped marker driven by `alive`, not geometry nullability | pass |
| `tiles.test.ts` | 3 `updateTile` chrome tests | title/repoLine/context/timer/stateClass written in place | pass |
| `tiles.test.ts` | 5 state-dot title tests (REQ-9) | `.sdot` title matches the state badge word | pass |
| `tiles.test.ts` | leaves rename button's text untouched while `refs.rename.isEditing()` is true | Minor 3: host asks the controller, not the DOM attribute | pass |
| `tiles.test.ts` | writes the title once `isEditing()` goes false again | same, close transition | pass |
| `tiles.test.ts` | writes the title normally when `refs.rename` is absent | pre-plan fixture shape treated as not-editing | pass |
| `tiles.test.ts` | hides the strip and clears children when session list is empty | `renderStrip`'s new `template`/`StripOptions` args | pass |
| `masthead.test.ts` | 4 `buildUsageBucket`/`renderUsageBucket` honesty-rule tests | permanent shell, unknown->no bar, self-healing, zero `createElement` calls while null | pass |
| `masthead.test.ts` | 2 element-order tests (Major 2 regression guard) | lbl/bar/num/resets order, warn threshold | pass |
| `masthead.test.ts` | 9 `renderUsageModel` tests (REQ-12/#52) | null/undefined hide+clear, title tooltip | pass |
| `masthead.test.ts` | 13 `buildUsageModelWeek`/`renderUsageModelWeek` tests | unknown states, warn threshold, placeholder option, `.stale`, onSelectModel | pass |
| `masthead.test.ts` | 7 node-reuse tests (Critical 1) | same `<select>`/`.num`/`.bar`/`.resets` node identity across an unchanged option list, via caller-held `UsageModelWeekRefs` | pass |
| `masthead.test.ts` | 5 `renderClaudeVersion` tests, 2 `renderViewSwitcher`, 6 `renderDensityControl`, 3 `renderConnectionStatus` | unchanged, not part of this unit | pass |
| `usage.test.ts` (new) | is 'unknown' with no fill/resets/warn for a null bucket | honesty rule 1 | pass |
| `usage.test.ts` (new) | is a true no-op regardless of the current time when null | no time-dependent path | pass |
| `usage.test.ts` (new) | rounds usedPct and carries formatResets' text | known-bucket derivation | pass |
| `usage.test.ts` (new) | rounds the boundary values 0 and 99.6 correctly | rounding boundaries | pass |
| `usage.test.ts` (new) | applies 'warn' at/above 60%, omits below | design-system §5 threshold | pass |
| `usage.test.ts` (new) | never warns on a rounded-up-to-60 display percent when raw usedPct is still below | raw-vs-rounded threshold distinction | pass |

## Removed / Consolidated Tests

| Removed | File | Reason |
|---------|------|--------|
| "only one bucket null renders independently ('unknown' for that bucket only)" | `masthead.test.ts` | Was pinning that `renderUsage`'s two-bucket struct didn't cross-contaminate between `fiveHour`/`sevenDay`. Major 2 removed the two-bucket struct entirely — `renderUsageBucket` now takes one bucket and one `UsageBucketRefs` per call, so independence is now a structural invariant (there is no shared state between two buckets to test), not a behaviour a test can regress. |
| "renders 'unknown' for both buckets when both are null (pre-hello state)" (2-bucket form) | `masthead.test.ts` | Superseded by the new per-bucket "builds a permanent .lbl/.num shell and renders 'unknown'..." test, which covers the identical honesty-rule content for one bucket — the second bucket added nothing the first didn't already assert, once the struct is gone. |
| "touches the element zero times for a null bucket" / "is a true no-op regardless of the current time" (`renderUsageTrack` describe block, 2 tests) | `masthead.test.ts` | `renderUsageTrack` no longer exists as a separate function. The "zero DOM construction for a null bucket" contract these pinned is still real (folded into the new `buildUsageBucket + renderUsageBucket` describe block's "touches document.createElement zero times across repeated null renders" test) — moved and merged into one test rather than duplicated as two, since both old tests asserted the identical thing (a null bucket touches nothing) at two different timestamps, which no longer needs two separate cases once the underlying function takes `now` as a formatting input only, not a branch condition. |

Net: masthead.test.ts is 53 -> 50 tests (-3, all accounted for above); no coverage was
lost — every removed assertion either became a structural invariant or was consolidated
into an equivalent replacement, and the rounding-boundary/warn-threshold cases that moved
out entirely landed in `sessions/usage.test.ts` instead (still present, just relocated to
where the logic now lives).

## `render/keyedreorder.ts` — not unit-tested directly

Per the handoff's instruction, checked whether `reconcileKeyedOrder` is DOM-free-testable
without jsdom: it isn't — it calls `container.firstElementChild`, `previous
.nextElementSibling`, and `container.insertBefore`, none of which a plain object literal
provides; exercising it directly would need the same kind of `insertBefore`/
`nextElementSibling`-aware DOM shim `render/sessions.test.ts`'s `FakeDomNode` already is.
Rather than build a second, near-identical shim in a new `keyedreorder.test.ts`, its
algorithm is already exercised through that exact shim: `render/sessions.test.ts`'s
`reconcileCards (review m4-reconcile cycle-3 Minor 4)` describe block's "reorders existing
cards in place" test and its five "focus capture/restore across a reorder" tests all
call `reconcileCards`, which delegates its own reorder step to `reconcileKeyedOrder`
unchanged (`render/sessions.ts:392`) — those tests pin the identical
insert/reuse/reorder/focus-restore contract this module now owns. E2E
(`web/e2e/reconcile.spec.ts`, per `render/sessions.test.ts`'s own header comment) covers
the rendered rail/grid reorder against the real DOM. No new test file was added for this
module; not a gap, a citation.

## `e-M6` — out of scope for this unit

Confirmed with the team lead's brief: the plan's e-M6 (production optionality that exists
only for Vitest fixtures) is W8's assignment, not this repair unit's. Not touched.

## Gates

```
$ npx tsc --noEmit
(clean, exit 0)

$ make web-lint
cd web && npm run -s lint
Checked 243 files in 222ms. No fixes applied.

$ make web-test
cd web && npm test
 RUN  v5.0.0 .../muster-maintainability/web
 Test Files  70 passed (70)
      Tests  1856 passed (1856)

$ make web-build
(vite build succeeded; only the pre-existing "chunks larger than 500 kB" mermaid-bundle
warning, unrelated to this unit's files)

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 909 references checked, 0 missing
```

## Files Touched

- `web/src/render/sessions.test.ts` — call-site conversion to `CardListOptions`, `baseOptions()` helper added
- `web/src/render/tiles.test.ts` — `renderStrip` call site, `fakeRenameController()` fixture, `RenameEditorController` import
- `web/src/render/masthead.test.ts` — `renderUsage`/`renderUsageTrack`/`renderModelWeek`/`UsageElements` describe blocks converted; `FakeDomNode.remove()` added; dead `fakeDomElement`/`fakeAppendableElement` helpers removed
- `web/src/sessions/usage.test.ts` — new file
- `plans/maintainability-cleanup/web-tests-W6b.md` — this log

No implementation file under `web/src` was modified. No file outside `web/` was touched.
Not committed per instruction — left for the orchestrator/team lead to stage and commit.
