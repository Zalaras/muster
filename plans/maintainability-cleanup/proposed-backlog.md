# Proposed backlog: maintainability-cleanup

These are follow-ups this run found. Nothing here is filed in `TODO.md`; each block waits for the developer (kb:adr/process-backlog-entries-are-the-users-to-file).

### Fact records cite gitignored capture files, so check-kb fails in any fresh clone

- [ ] **check-kb in a fresh clone.** Nine fact records cite `test/rig/captures/capture-{3,8}.jsonl` in `refs`: `hook-await-per-event`, `interrupt-emits-no-turn-end`, `model-catalog-precheck-zero-token`, `permission-mode-no-flag-follows-configured-default`, `status-line-around-failed-turns`, `stopfailure-error-by-status`, `subagent-hooks-during-permission-wait`, `tool-failure-hook-events` and `unknown-model-fails-first-turn`. That directory is gitignored (`.gitignore:32`), so `make check` passes only in the developer's checkout.
- **Source**: this run's baseline (`findings.md` P1).
- **Change requested**: no.
- **Pre-existing**: yes.

### Two E2E specs fail whenever HEAD is exactly a release tag

- [ ] **E2E dev stamp.** `shell.spec.ts:47` and `update.spec.ts:449` assume `make build` produces a dev-stamped binary. `Makefile:6` stamps `git describe`, so on a tagged commit (every `main` right after a release) both fail. The E2E fixture should stamp its own dev version.
- **Source**: this run's baseline (`findings.md` P2).
- **Change requested**: no.
- **Pre-existing**: yes.

### DisplayName after a model rebind

- [ ] **Model display name on bind.** `applyBind` (`internal/session/machine.go`) leaves `DisplayName` empty on a new model and stale when the id changes. Deciding what the card should show is a product call.
- **Source**: `review.maintainability.a-session.md` Note 3.
- **Change requested**: no.
- **Pre-existing**: yes.

### The ingest body is read without a size cap

- [ ] **Ingest body limit.** `handleIngest` reads the hook body with an unbounded `io.ReadAll`, unlike `locate.go`'s `MaxBytesReader`. The limit is a measurement and product choice, because transcript-sized payloads are possible.
- **Source**: `review.maintainability.b-server.md` Note 6.
- **Change requested**: no.
- **Pre-existing**: yes.

### Plan IDs in test comments and describe() strings

- [ ] **Test-file plan-ID sweep.** The X1 sweep covered non-test code only, and about 370 plan-ID comment lines remain across test files. This run's own finding tags were removed from the test files it touched.
- **Source**: the cleanup session (`findings.md` P6) and `review.maintainability.c-adapters.cycle2.md` Notes.
- **Change requested**: no.

### killWindowAfterRecordFailure's call path has no test

- [ ] **Rollback-after-record-failure test.** No test drives a `RecordLaunch`/`RecordResume` persist failure after a successful spawn, which is the path that reaches the rollback kill in `internal/server/launcher.go`.
- **Source**: daemon-tests D7a (`findings.md` P7).
- **Change requested**: no.
- **Pre-existing**: yes.

### Nudge liveness on SessionEnd

- [ ] **SessionEnd nudge.** Decision `sessionend-alive-hint` accepted up to 5 s of stale "alive" when no terminal is attached. A liveness `Nudge` on a non-clear `SessionEnd`, kept behind the `stopped` guard, would narrow that window.
- **Source**: `decisions/sessionend-alive-hint/decision.md` (dissent to honour).
- **Change requested**: no.

### claudecode holds Muster's own vocabulary

- [ ] **Ingest route and MUSTER_SESSION owner.** D10 declared each once in `internal/claudecode`. They are Muster's own vocabulary, not Claude Code format, and moving them needs a `WriteWrapperScripts` signature change. This is an ADR-level boundary question.
- **Source**: `review.maintainability.c-adapters.md` Major 2 (second half) and daemon-impl D10 (`findings.md` P9).
- **Change requested**: no.

### Shutdown closes /ws with 1000 while protocol.md says 1001

- [ ] **closeAll close code.** `wsHub.closeAll` sends status 1000, but `docs/protocol.md` documents 1001 for shutdown. One of the two is wrong.
- **Source**: `review.work.cycle2.md` Notes.
- **Change requested**: no.
- **Pre-existing**: yes.

### Focus sizenote NBSP may shift first-attach geometry

- [ ] **Sizenote NBSP check.** `render/focusview.ts:42` writes a real NBSP again, as its comment requires. `a7ba245` (before this run) had regressed it to an ASCII space. Restoring the NBSP reserves the row the comment describes, which can move first-attach terminal geometry by a row. A `review-browser` look would confirm it is the intended layout.
- **Source**: `review.work.cycle2.md` Notes.
- **Change requested**: no.

### internal/boundedwait has no test of its own

- [ ] **boundedwait tests.** It is covered only through its callers' stop tests.
- **Source**: daemon-tests final pass.
- **Change requested**: no.

## Decisions

(Filled when the developer decides. `/land` cannot land this plan because it never went through `/orchestrate`, so decide these by hand.)
