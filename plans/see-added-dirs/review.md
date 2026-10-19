# Review: see-added-dirs

**Plan**: see-added-dirs
**Verdict**: approved
**Cycle**: 3
**Gates**: 0 failed
**Parts**: code | skipped: browser, maintainability
**Part verdicts**: code approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: See added directories

**Plan**: see-added-dirs
**Part verdict**: approved
**Cycle**: 3
**Pack**: kb: pack 67860 words (budget 30000)

Scope: delta re-review. Cycle 2's only open agent-tagged issue was maintainability Minor 1 `[daemon-impl]`. `git diff --stat a1ef1bf2..HEAD` shows changes only under `plans/see-added-dirs/`: `daemon-implementation.md` (+13), `orchestration-state.json` and the four cycle-2 review renames. Nothing under `web/src/`, `internal/` or `cmd/` changed, so §3–§6 are not re-read. The cycle 2 tables below still stand against this same tree.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-9, REQ-5a, INV-1/2/3 | Yes. No source changed since cycle 2's full read (`review.cycle2.md` § Correctness review) | Yes. Same tests, green again in this gate run | pass |
| DIAG | `kb:diagram/daemon-components` re-checked for the Minor's reason: `go list -deps ./internal/gitutil` and `./internal/claudecode` list no Muster package but themselves. `session` imports `boundedwait`, `claudecode`, `keyedlock`, `store` and `tmux`. The other diagrams have no file change since cycle 2 | — | pass |

## Build & Tests

E2E tests: pass (987, full: `make web-build build e2e-run`, 17-e2e.log) · Daemon tests (race): pass (26 `ok` packages, `go test -race -count=1 ./...`, 02-test.log) · Web tests: pass (2825 in 99 files) · Daemon build: pass (01-build.log empty) · Web build: pass · Lint: pass (golangci-lint `0 issues.`, biome 346 files clean, e2e-lint clean) · Contrast: pass (54 pairs × 3 themes, 0 failures) · kb check: pass (613 records, 0 problems) · versions: fresh · features-scope: pass · comments: clean; ledger 10 blocks, all kept. Size: 11 WARN hits, which are review-maintainability's. All read from `/var/folders/8t/36s1xtwj1xjfn1pg_jrwztjw0000gn/T/gates-see-added-dirs-c3`, 0 failed lines.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D12 | `make test` | pass (deduped to `go test -race -count=1 ./...`, 02-test.log) |
| D13 | `make lint` | pass (03-lint.log, `0 issues.`) |
| D14 | `go build ./...` | pass (01-build.log empty) |
| D11 | `! rg -n '"added_dirs"' cmd/ internal/ --glob '!internal/claudecode/**' --glob '!**/*_test.go'` | pass (18-D11.log empty, run reports 0 failed lines) |
| W6 | `make web-test` | pass (2825 tests) |
| W7 | `make web-build` | pass |
| W8 | `make web-lint` | pass |
| W9 | `make contrast` | pass |
| E6 | `make e2e` | pass (987 passed, 9.3 m, full suite) |
| K1 | `make check-kb` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. Fix Attempt 2 has `deviation: none` and `doc-delta: none`, so no new ADR or delta line is owed. The cycle 2 DOC verification (three `proposed` ADRs, #93/#101 in `todo-done.md`, the delta matching the code) is unchanged because no code or doc changed |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | Neutral tokens only | pass | `web/src/style.css` has not changed since cycle 2's check |
| R2 | Panel matches `final.html` row for row | pass (structure) | `buildPanel` has not changed since cycle 2. Rendered fidelity is review-browser's, which was approved in cycle 2 |
| R3 | No `any` in new web code | pass | no web change since cycle 2 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass (D11 green, no source change) |
| 2 | Terminal-output state parsing | pass |
| 3 | Blocking hook handler | pass |
| 4 | Bare tmux / resize-pane | pass |
| 5 | Payload logging | pass |
| 6 | Empty-gauge dishonesty | pass |
| 7 | Identity on `session_id` | pass |
| 8 | Settings trespass | pass |
| 9 | Real `claude` | pass |

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 maintainability Minor 1 `[daemon-impl]` "`gitutil.resolveFrom` repeats the resolve-else-clean rule that `session.ResolvePath` already owns, and its `design:` line says nothing about it" | `42495b4a` (log only) | Option (a) is met. Fix Attempt 2's `**Decisions**` has a `design:` line that names `resolveFrom`, the rule it repeats (`session.ResolvePath`, `location.go:41`) and why gitutil keeps its own copy, and it pastes the `rg`. I checked each reason against the code. (1) Re-running the `rg` gives the same three copies: `location.go:41`, `launchtranscripts.go:54` and `gitutil.go:104`. (2) `go list -deps ./internal/gitutil` prints only `internal/gitutil`, and `session` imports `store`, `tmux` and `claudecode`, so calling `session.ResolvePath` would make a leaf adapter depend on the domain. (3) `IsWorktree` returns `bool`, and `isWorktree` (`gitutil.go:92-102`) holds both git strings, so the caller cannot resolve them the way `server.topLevel` does (`reporefresh.go:196-201`). (4) `resolveFrom` joins a relative path to `dir` before resolving, and `ResolvePath` never does that join (`normalizeAddedDirs` does it itself, `addeddirs.go:32-35`). (5) `claudecode` is also a leaf (`go list -deps` shows no other Muster package), so "a third adapter already holds its own copy for the same reason" holds. Nothing else changed: the diff touches no file under `internal/`, `cmd/` or `web/src/` |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** In the design line, "would pull the store into every package that runs git" overstates things a little: some of gitutil's importers (`server`, for one) already import `store`. The main reason still holds without it. A leaf adapter must not import the domain (`kb:diagram/daemon-components`). No change requested.
2. **[note]** Other `EvalSymlinks` uses (`internal/locate/locate.go:129`, `internal/reader/reader.go:51-61`, `internal/claudecode/modelcheck.go:148`) act on the error instead of falling back to `Clean`, so they are not copies of this rule. The design line's "if a fourth caller appears" trigger is still accurate.
