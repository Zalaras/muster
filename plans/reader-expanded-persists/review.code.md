# Correctness review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 14333 words (budget 30000)

This is a delta cycle. Cycle 2's only open agent-tagged issue was browser Minor 1, a folder click in a host whose display is out of date. I read `git diff 107d5bd9..HEAD`. The non-test changes are in `web/src/features/reader.ts`, `web/src/reader/memory.ts` and `web/src/reader/CLAUDE.md`. All of them belong to the fix route the developer chose (the `storage` listener plus toggling from the displayed state), so I did not re-read §3–§6 beyond the diff. All 17 gate lines are green; they ran under `env -u MUSTER_SESSION` per the developer.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 expanded folders survive Claude/Shell→Docs and a session switch | Yes, unchanged from cycle 2. In cycle 3, `toggleFolder` (`features/reader.ts:334-339`) computes the target from what the host shows (`this.memory`) and commits `withFolderExpanded(m, path, expand)` to the fresh read. Every host now adopts another window's write live through `handleStorage` (`:211-215`), which is registered once in `initReader` (`:623-625`) | E1. The two cycle-2 shared-memory tests. Two new tests: "live adoption" (`reader.spec.ts:2688`) and "stale display" (`:2739`). Per test-specs.md, both failed against the cycle-2 `reader.ts`/`memory.ts` and pass now. Unit tests cover `withFolderExpanded` (6) and `isMemoryWrite` (8 rows) | pass |
| REQ-2 Files/Outline folds survive the same switches | Yes. `toggleFiles`/`toggleOutline` (`:354-364`) now set the value the host shows, inverted, through `withFilesFolded`/`withOutlineFolded` | E1, plus the shared-memory tests. Unit tests: `withFilesFolded`/`withOutlineFolded` cover all four before/after combinations and leave other fields untouched | pass |
| REQ-3 filter clear collapses, and the cleared state is what a later return shows | Unchanged. The `filterQuery` guard is still the first line of `toggleFolder` | Unchanged (E7 and the cycle-2 filter test) | pass |
| REQ-4 older memory shape loads as nothing expanded or folded | Unchanged. `parseMemory` is untouched. `handleStorage` adopts through the same `loadMemory`, so a foreign shape written by another window degrades the same way | Unchanged tables | pass |
| DIAG | `kb:diagram/web-components`. `reader/` is still "Markdown render, nav tree, per-session memory". A window-level listener inside `features/reader.ts` adds no module and no edge | — | pass |

## Build & Tests

E2E tests: pass (721/721, `16-e2e.log`) · Daemon tests (race): pass (24 `ok`, 0 FAIL, `02-test.log`, `MUSTER_SESSION` unset per the developer) · Web tests: pass (2449 in 89 files, `05-web-test.log`) · Daemon build: pass (`01-build.log` empty) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci 0 issues, biome clean, e2e-lint clean) · contrast 0 failures; versions fresh; e2e-honest clean; kb check 0 problems; features-scope ok; comment checks and ledger clean · size: WARN `web/src/features/reader.ts` 664 lines (review-maintainability's) · all read from $GATES_LOG_DIR

No flake repair this cycle (test-specs.md: "Repairs: None"), so no soak was owed. The e2e agent ran the four shared-memory/adoption tests at `--repeat-each=10` and got 40 passed.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` | pass (`17-E1.log`, 1 passed) |
| W1 | `make web-test` | pass (deduped to `05-web-test.log`, 2449 passed) |
| W2 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| W3 | `make web-build` | pass (deduped to `04-web-build.log`) |
| E2 | `make e2e` | pass (deduped to `16-e2e.log`, 721 passed) |
| gate `test` | `make test-race` | pass (`02-test.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The logs have no `deviation:` line. The cycle-3 `doc-delta:` line (impl log :66) targets `web/src/reader/CLAUDE.md`, and the new invariant line is in the diff. The plan's Doc Delta ("expanded folders and the Files/Outline folds are remembered per session in the browser") is still exactly true. The reader spec's "the pop-out … sharing … that memory" (`docs/features/reader/spec.md:69-70`) is now true live, not only on the next write. Nothing in the delta needs to change (Note 1) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Every change to the expanded set or the folds goes through one save path, and the filter clear saves too | pass | `saveMemory` is still called only from `commitMemory`. All five writers pass a transition to it. `handleStorage` assigns `this.memory` from storage but never writes, so it is an adoption and not a change. The filter clear is unchanged |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (no Go change) |
| 2 | Terminal-output state parsing | pass (n/a) |
| 3 | Blocking hook handler | pass (n/a) |
| 4 | Bare tmux | pass (n/a) |
| 5 | Payload logging | pass (n/a) |
| 6 | Empty-gauge dishonesty | pass (no gauge path touched) |
| 7 | Session identity on `session_id` | pass (`isMemoryWrite` keys on the Muster session id via `keyFor`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass (the new tests use the stub fixture) |

Web checks on the delta: no new dependency, no `innerHTML`, no second WS client, and no markup, CSS or token change. There is one `storage` listener in `initReader`, beside the existing `focus` listener, and none in `main.ts`. Removal events (`newValue === null`) and `clear()` (null key) are ignored. That is correct because `sessionRemoved` already disposes the instance.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 browser Minor 1 `[web-impl]` "A folder click in a host whose display is out of date does nothing visible, and it stores the opposite" | `252ddced` (fix), `c17427e6` (dead `*Toggled` helpers dropped), `7140e44c` + `0483c21b` (tests) | Read the diff. The browser review asked for either of two fixes, and both are present. (a) A live `storage` listener adopts the other host's write and re-renders, so displays stay current; the "live adoption" E2E asserts that the pop-out's `adr/` goes `aria-expanded=false` with no click. (b) The toggle target comes from the displayed state, so a click on a stale display does what it shows; the "stale display" E2E defeats the event and asserts collapse with `["docs"]` stored. Both were red against the cycle-2 sources, per test-specs.md's red proof. The side symptom (an unrelated Outline toggle making the tree jump open) is gone: the tree now adopts on the event, before any click. Scope: the Files/Outline toggles got the same display-based treatment. That is the same defect class, and the change goes no further |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** The impl log's cycle-3 `doc-delta:` line suggests the plan's Doc Delta line about shared memory should say "live". The plan's Doc Delta has no shared-memory line. The spec's existing sentence ("the pop-out … sharing … that memory") stays true and is now stronger in practice, so doc-reconcile has nothing to promote beyond what is already there.
2. **[note]** Carried from cycle 2: the doc comment at `web/src/reader/memory.ts:47-48` says a throwing storage or foreign shape "yields the empty default". It yields `fallback`, which is empty only when the caller omits it. `web/src/reader/CLAUDE.md`'s "defaulting to empty" has the same slant. Both are still true of the default.
3. **[note]** `handleStorage` adopts `clearedAt` too, so a change dot acknowledged in one window clears in the other. The impl log records this as a design decision, and it follows from the shared memory. Whether it reads well on screen is review-browser's call.
4. **[note]** The "stale display" test overrides `StorageEvent.prototype.key` in the pop-out to hold that host stale. This is setup only, and the click, the collapse and the stored value are real-user paths. It stands in honestly for an event that has not landed yet.
5. **[note]** Carried from cycle 1: REQ-1's session-switch half and the Files fold have no dedicated E2E. They share the dispose-and-rebuild `loadMemory` path that E1 covers.
