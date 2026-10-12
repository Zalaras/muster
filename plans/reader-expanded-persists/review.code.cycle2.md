# Correctness review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14333 words (budget 30000)

This is a full cycle, not a delta: cycle 1 left a Critical and a browser Major open. All 17 gate
lines are green. On the developer's instruction they ran with `env -u MUSTER_SESSION`, and the
hermeticity fix is in `proposed-backlog.md`. Both cycle 1 browser findings are fixed and now have
E2E tests that would fail without the fix. I soaked the two flake-prone shared-memory tests at
N=10 and both were green (20/20).

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 expanded folders survive Claude/Shell→Docs and a session switch | Yes. `toggleFolder` (`features/reader.ts:327-331`) goes through `commitMemory`, and the render seeds `flattenTree` from `memory.expanded` (`:454`). Memory is reloaded on re-mount (`:166`). New in cycle 2: `commitMemory` (`:204-208`) applies each transition to a fresh `loadMemory(localStorage, id, this.memory)` read, so a write from the dashboard and a write from the pop-out keep each other's fields | Yes. E1 (`reader.spec.ts:2449`) covers the tab switch. The two shared-memory tests (`:2505`, `:2572`) failed against the pre-fix code per test-specs.md and pass now; soaked 20/20. The session-switch half has no E2E (Note 1) | pass |
| REQ-2 Files/Outline folds survive the same switches | Yes, `:345-353` through `commitMemory`; read at `:493-494` | E1 (Outline fold); both shared-memory tests assert that the pop-out's Outline fold survives; `memory.test.ts` transition suites | pass |
| REQ-3 filter clear collapses, and the cleared state is what a later return shows | Yes. `setFilter` (`:333-339`) commits `withExpandedCleared` on every empty filter, with no guard on the possibly stale instance copy. `toggleFolder` now returns early while a filter is typed (`:328`), so a click with no visible effect is no longer saved (cycle 1 browser Minor 1) | Existing E7 filter-clear test; the new filter test (`:2633`) failed against the pre-fix code (Repairs row 3) and passes now; unit `withExpandedCleared` | pass |
| REQ-4 older memory shape loads as nothing expanded or folded | Yes. `parseMemory` (`memory.ts:34-45`) defaults each field on its own. The fallback argument does not change this: a stored entry that parses ignores the fallback | older-shape and wrong-type table; `loadMemory — fallback argument` case "ignores the fallback when a stored entry parses" | pass |
| DIAG | `kb:diagram/web-components` (from `kb for web/src/features/reader.ts`). `reader/` is still "Markdown render, nav tree, per-session memory"; no module or edge changed in cycle 2 | — | pass |

## Build & Tests

E2E tests: pass (719/719, `16-e2e.log`) · Daemon tests (race): pass (24 `ok` packages, no FAIL, `02-test.log`, run under `env -u MUSTER_SESSION` per the developer) · Web tests: pass (2433 in 89 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci 0 issues; biome clean; e2e-lint clean) · contrast 0 failures, versions fresh, e2e-honest clean, kb check 0 problems, features-scope, comment checks and comment ledger clean · size: WARN `web/src/features/reader.ts` 650 lines (review-maintainability's) · all read from $GATES_LOG_DIR

Flake soak (Repairs row 2 names an intermittent red that the ```checks block does not soak): `make e2e-soak SPEC=reader.spec.ts N=10 GREP='shared memory'` → `20 passed (20.3s)`.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` | pass (`17-E1.log`, 1 passed) |
| W1 | `make web-test` | pass (deduped to `05-web-test.log`, 2433 passed) |
| W2 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| W3 | `make web-build` | pass (deduped to `04-web-build.log`) |
| E2 | `make e2e` | pass (deduped to `16-e2e.log`, 719 passed) |
| gate `test` | `make test-race` | pass (`02-test.log`; `MUSTER_SESSION` unset per the developer's decision, backlog entry filed in `proposed-backlog.md`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The #82 block was moved, ticked, to `docs/history/todo-done.md` under "On their own". The logs have no `deviation:` line and `kb ls --feature reader --status proposed` is empty, which is consistent. The one `doc-delta:` line, about `web/src/reader/CLAUDE.md`, was applied in `ddbda3e8`. The Doc Delta's "becomes true" sentence matches the code: all five fields live in `muster.reader.<id>`, and the spec's statement that the pop-out shares that memory now holds for writes from both hosts |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Every change to the expanded set or the folds goes through one save path, and the filter clear saves too | pass | `this.memory` is assigned only at construction (`:166`) and in `commitMemory` (`:206`). `saveMemory` is called only from `commitMemory` (`:207`). All five writers (`openFile` :312, `toggleFolder` :329, `setFilter` clear :336, `toggleFiles` :347, `toggleOutline` :352) pass a transition to it. The clear now saves unconditionally |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Go change (`git diff --stat main..HEAD -- internal cmd` is empty) |
| 2 | Terminal-output state parsing | pass — n/a |
| 3 | Blocking hook handler | pass — n/a |
| 4 | Bare tmux | pass — n/a |
| 5 | Payload logging | pass — n/a |
| 6 | Empty-gauge dishonesty | pass — no gauge path touched |
| 7 | Session identity on `session_id` | pass — memory keys on the Muster session id |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the new tests use the stub (`MUSTER-STUB-READY`) |

Web checks: no new dependency, no `innerHTML`, no `storage` listener or second WS client added, and no markup, CSS or token change, so the design-token and `[hidden]` rules do not apply. Fixture shape matches the **Fixture plan** header (`daemon`, plus `context` for the pop-out, as the file's existing pop-out tests use).

Test honesty: Repairs row 1 is setup only. Row 2 adds settle waits and a retried `localStorage` read (`expect.poll`) with no fixed sleep, and the final assertions are unchanged. Row 3 changed the scenario to the reviewer's, and the test then failed against the pre-fix code. No assertion was deleted, skipped or weakened. The new tests assert `aria-expanded` and specific entries, not container visibility.

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** Carried from cycle 1: REQ-1's session-switch half and the Files fold have no E2E. Both go through the same dispose-and-rebuild and `loadMemory` path that E1 covers, and the plan's Proof names only the Claude→Docs switch.
2. **[note]** `web/src/reader/memory.ts:47-48`: the `loadMemory` doc comment says a throwing storage or foreign shape "yields the empty default". It now yields `fallback`, which is empty only when the caller omits it. `features/reader.ts:205` passes the instance's own memory. `web/src/reader/CLAUDE.md`'s invariant "defaulting to empty" has the same slant. It is still true of the default, so this is not a false statement.
3. **[note]** For browser: under the fresh-read merge, a host keeps showing its own copy until its next write. That write then adopts the other host's fields. For example, the pop-out folds Outline, the dashboard then clicks a folder, and the dashboard's Outline folds at that moment. This follows from the shared memory the spec describes, and the impl log records it. Whether it reads well on screen is review-browser's call.
4. **[note]** test-specs.md's handoff points out that two hosts writing within the same few milliseconds can still read a stale copy, because Chromium propagates `localStorage` between renderers asynchronously. A person cannot hit that by hand. Adopting `storage` events would close it if that is ever wanted.
