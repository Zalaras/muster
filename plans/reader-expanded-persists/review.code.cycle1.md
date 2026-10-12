# Correctness review: reader-expanded-persists

**Plan**: reader-expanded-persists
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14333 words (budget 30000)

The only thing blocking is the red `test` gate line (Critical 1). It is an environment leak that
already exists on `main`, and this web-only branch did not cause it. Everything the plan asks for
is implemented, tested where the plan says it should be, and matches the Doc Delta.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 expanded folders survive Claude/Shell→Docs and a session switch | Yes — `features/reader.ts:327` `toggleFolder` → `commitMemory(withFolderToggled(...))`; `:452` seeds `flattenTree` from `memory.expanded`; memory reloaded at `:166` on re-mount | Yes for the tab switch (E1, `reader.spec.ts:2449`); `withFolderToggled` + round-trip in `memory.test.ts`. The session-switch half has no E2E (Note 1) | pass |
| REQ-2 Files/Outline folds survive the same switches | Yes — `:345`/`:350` commit; `:491-492` read from memory | Yes — Outline fold in E1; both folds in `memory.test.ts` (`describe.each` toggles, independent round-trip) | pass |
| REQ-3 filter clear collapses, and the cleared state is what a later return shows | Yes — `:333-335` commits `withExpandedCleared` on an empty filter, so the clear is saved | Unit: `withExpandedCleared`. E2E: existing E7 filter-clear test (green in the sweep). Save-on-clear checked by reading the code, as the plan says | pass |
| REQ-4 older memory shape loads as nothing expanded or folded | Yes — `memory.ts` `parseMemory` defaults each field on its own (`isStringArray`, `=== true`) | Yes — older-shape, empty-object and 9-row wrong-type table, sibling-independence cases | pass |
| DIAG | `kb:diagram/web-components` (named by `kb for` on both changed files): `reader/` is described as "Markdown render, nav tree, per-session memory". Still true; no module or edge changed | — | pass |

## Build & Tests

E2E tests: pass (716/716, `16-e2e.log`) · Daemon tests (race): **FAIL** (`internal/server`, 2 tests, `02-test.log`) · Web tests: pass (2428 in 89 files) · Daemon build: pass (`01-build.log` empty, exit 0) · Web build: pass · Lint: pass (golangci 0 issues; biome clean; e2e-lint clean) · contrast, versions, kb check, features-scope, comment checks, comment ledger: pass · size: WARN `web/src/features/reader.ts` 648 lines (review-maintainability's) — all read from $GATES_LOG_DIR

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test reader.spec.ts -g 'expanded folders and folds survive'` | pass (`17-E1.log`, 1 passed) |
| W1 | `make web-test` | pass (deduped to `05-web-test.log`, 2428 passed) |
| W2 | `make web-lint` | pass (deduped to `06-web-lint.log`) |
| W3 | `make web-build` | pass (deduped to `04-web-build.log`) |
| E2 | `make e2e` | pass (deduped to `16-e2e.log`, 716 passed) |
| gate `test` | `make test-race` | **FAIL** — Critical 1 |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — the #82 block moved from `TODO.md` "On their own" to `docs/history/todo-done.md` under the same heading, ticked; no `deviation:` lines, so no ADR is owed (`kb ls --feature reader --status proposed` is empty, which is correct); the log's one `doc-delta:` line is about `web/src/reader/CLAUDE.md` and was applied in `ddbda3e8`. The Doc Delta's "becomes true" sentence matches the code: all five fields live in `muster.reader.<id>` and are shared with the pop-out, which uses the same `ReaderInstance` and key |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | Every change to the expanded set or the folds goes through one save path, and the filter clear saves too | pass | `commitMemory` (`features/reader.ts:204-207`) is the only place that assigns `this.memory` after construction and the only `saveMemory` call. `toggleFolder` (:327), `setFilter` clear (:334), `toggleFiles` (:345), `toggleOutline` (:350) and `openFile` (:311) all go through it. The old instance fields `manualExpanded`/`filesFolded`/`outlineFolded` are gone (rg finds no hits) |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Go change (`git diff --stat main..HEAD -- internal cmd` is empty) |
| 2 | Terminal-output state parsing | pass — n/a |
| 3 | Blocking hook handler | pass — n/a |
| 4 | Bare tmux | pass — n/a |
| 5 | Payload logging | pass — n/a |
| 6 | Empty-gauge dishonesty | pass — no gauge path touched |
| 7 | Session identity on `session_id` | pass — memory keys on the Muster session id (`muster.reader.<id>`) |
| 8 | Settings trespass | pass |
| 9 | Real `claude` outside canary/probes | pass — the E2E uses the stub (`MUSTER-STUB-READY`) |

Web-specific checks: no new dependency; no `innerHTML`; no CSS, markup or token change, so the design-token and `[hidden]` rules do not apply; no second WS client. Fixture shape matches the **Fixture plan** header: `daemon`, same as the rest of `reader.spec.ts`.

## Issues

### Critical
1. **[daemon-tests]** The `test` gate line (`make test-race`) is red:
   `TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession` (`internal/server/shells_test.go:141`) and
   `TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession` (`:172`) get
   `MUSTER_SESSION=[9]` where they expect `MUSTER_SESSION=[]`.
   - **Cause.** The gate ran inside Muster session 9. My own shell shows `MUSTER_SESSION=9`. `newTestShellRegistry` (`shells_test.go:62-75`) sets `MUSTER_TEST_SHELL_LOG` and `SHELL` before the private tmux server starts, but never clears `MUSTER_SESSION`, so the server and its panes inherit it. The orchestrator measured both tests passing under `env -u MUSTER_SESSION`.
   - **Not this plan's change.** The branch touches no Go, and the failure exists on `main` whenever the suite runs from inside a Muster session.
   - **Fix.** Make the helper hermetic, e.g. `t.Setenv("MUSTER_SESSION", "")` followed by `os.Unsetenv`, or start the server with a scrubbed environment.
   - **Routing.** This is tagged by file owner as the rules require. The orchestrator intends to send it to `proposed-backlog.md` as a test-hermeticity follow-up. That is its call, but under review-scale § Verdicts the red line still makes this cycle `needs-changes` until the gate runs green, for example re-run with `MUSTER_SESSION` unset or after the helper fix.
   - **Product question.** The same mechanism means a `musterd` started from inside a Muster session hands `MUSTER_SESSION` to its shell panes, against INV-1. Whether that is worth a product fix in `shells.go` (strip the var from the spawn environment) is worth raising in the backlog entry.

### Major

None.

### Minor

None.

### Notes
1. **[note]** REQ-1's session-switch half (focus another session, come back) has no E2E. The plan's Proof only names the Claude→Docs path, and test-specs.md says so. Per the plan's Findings, both switches go through the same `reconcileInstances` dispose-and-rebuild and the same `loadMemory` at `features/reader.ts:166`, so the tab-switch test covers that code path.
2. **[note]** The Files fold has no E2E; only the Outline fold does. `toggleFiles` is one line, the same shape as `toggleOutline`, and the transition is unit-tested.
3. **[note]** This extends an existing behaviour rather than adding a regression. The dashboard and the pop-out each hold their own `this.memory` copy and write the whole object back. While both are mounted, a fold in one window followed by a folder toggle in the other makes the second write put the first window's stale `outlineFolded` back. `openPath`/`clearedAt` already work this way (kb:adr/reader-memory-split-browser-and-daemon).
4. **[note]** A filter left non-empty when the developer switches away is not a "clear". On return the filter is reset and the pre-filter expanded set shows again. This fits REQ-3 as written, which is only about an explicit clear.
5. **[note]** `web/src/reader/memory.ts:1`: the comment pass (`4a4cb564`) deleted the whole file header, including the ADR citation and the reason for keying acknowledgement on `writtenAt`. That is the comment pass's call. I mention it only because `web/src/reader/CLAUDE.md` and the ADR now carry that rationale alone.
