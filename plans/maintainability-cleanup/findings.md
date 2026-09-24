# Findings ledger: maintainability-cleanup

Every finding from the Wave 1 read and from the pre-plan survey. Each one gets a bin:
- **fix <unit>**: assigned to a unit
- **no change**: the reason is stated
- **proposed**: goes to `proposed-backlog.md`
- **lesson?**: a lesson candidate

Commits are filled in as units land.

## Baseline (2026-09-23, `47325f7`)

- The E2E suite has 445 tests in 42 files (`npx playwright test --list`).
- `make size-warn` reports 81 hits: dupl 7 (all tests), funlen 60 (17 of them non-test), filelen 14.
- `make test-race` passes. `make check` passes too (Go unit tests, lint, and 1841 Vitest tests in 45 files) once `test/rig/captures` is linked into the worktree. Without the link, `check-kb` fails on 9 fact `refs` that cite the gitignored `test/rig/captures/*.jsonl` (see P1).
- E2E baseline: 443 passed, 2 failed (`shell.spec.ts:47` "empty-daemon snapshot" and `update.spec.ts:449` "a dev build never checks"). HEAD `47325f7` is exactly tag `v0.18.2`, so `make build` stamps `-X main.version=v0.18.2` (`git describe`). `selfupdate.Classify` then reads it as a release instead of `dev`. The failures go away once the branch has its own commit (see P2).

## Seed list (pre-plan survey, three Explore agents)

### internal/session
- S1 About 12 setters unlock `m.mu` before persist and broadcast, so they can persist out of order. `rollbackOnPersistFailure` can undo a newer commit. → fix D1
- S2 `observeWrite` does Get, then `SetPlan`, in two lock scopes (`internal/server/reader.go:176-198`). → fix D1
- S3 `manager.go` is 1809 lines across 13 concerns. → fix D2
- S4 `sessionTmuxName` duplicates `tmux.SessionName`, and the `"muster-"` check at manager.go:537 is another copy. → fix D3
- S5 `RecordLaunch`, `Apply` and `ApplyStatus` return an ad-hoc unknown-session error; the other methods use `ErrUnknownSession`. → fix D3
- S6 Four bodies are duplicated: Repair and revive; kill-with-timeout ×2; capture ×2; collect-alive-ids ×2. → fix D3
- S7 Store-delete and memory-removal happen in a different order in `DeleteSession`/`actOnReconcile` than in `removeLocked`. → D3 (find the rationale first)
- S8 97 manager.go lines cite plan IDs. → fix X1

### internal/server
- V1 JSON success is hand-encoded 18 times, and the error envelope is re-declared in `locate.go:151-166`. → fix D4
- V2 `locate`/`prefs` 500s are unlogged, unlike their siblings. → fix D4
- V3 `readerRunGit` duplicates `gitutil`. → fix D4
- V4 `handleTerminal` and `handleShellTerminal` are near-copies. → fix D5
- V5 `server.New` holds closures, defaults, post-construction pokes and `loadPrefs` I/O. → fix D6
- V6 `issue.go`, `update.go` and `sessions.go` each mix several concerns. `update.go` defaults the client twice and builds the remedy twice. → fix D7
- V7 `sessions.go` duplicates kill-after-record-failure and spawn-under-timeout. → fix D7
- V8 The core handlers are methods on `*Server`, but `internal/server/CLAUDE.md` says "never on `*Server`". → D6 (check)
- V9 The shells `strconv` id parse is forced by the `not_found` contract. → no change (contract)

### cmd/musterd
- M1 `run` has 16 phases and `parseFlags` 6. `main.go` is 791 lines. → fix D8
- M2 `-help` strings carry plan IDs (`REQ-5`, `REQ-6`, `REQ-7`, `REQ-22`, `m2-terminal`). → fix D8

### cross-package (Go)
- G1 `exec.CommandContext` + `WaitDelay` appears ×11. → no change (conventions § Go wants it inline)
- G2 The `http.DefaultClient` default appears ×7. → no change unless the reviewers disagree (one line each)
- G3 Background-loop Stop appears ×6. → Wave 1 to judge
- G4 Random hex IDs appear ×3 (`main.go`, `issue.go`, `triage`). → Wave 1 to judge
- G5 About 674 non-test comment lines cite plan IDs. → fix X1

### web
- B1 The `api.ts` decode-empty block appears ×8, with repeated headers/credentials, and there are 7 `putPrefs(...).then(console.error)` sites. → fix W1
- B2 `PERMISSION_MODES`/`permissionModeToCheck` is domain logic in the HTTP layer. → fix W1
- B3 `protocol.ts` is 967 lines, and `isRecord` is duplicated in `api.ts`. → fix W2
- B4 These helpers are defined twice: `isClaudeFamily` (`theme.ts`), `isRailActivity` (`features/settings.ts`), `isRailDensity` (`features/rail.ts`), `requireTemplate` (`render/tiles.ts`, `render/sessions.ts`), `basename` (`reader/paths.ts`, `sessions/card.ts`), `pad2`/`pad` (`sessions/format.ts`, `features/issue.ts`). → fix W3
- B5 `ConnectionStatus` lives in `render/masthead`, and the pure `reader/notice.ts` and `app.ts` both depend on it. `DRAG_MIME` lives in `render/dragreorder` and is used by `terminal/pane.ts`. → fix W3
- B6 `main.ts:92-138` and `doc.ts:66-101` duplicate the WS URL and handler wiring. → fix W3
- B7 `render/focusrestore.ts` and `render/launchrestore.ts` are DOM-free decisions sitting in `render/`. → fix W4 (conventions)
- B8 `render/dead.ts` fetches (`fetchPane`), which breaks `render/CLAUDE.md`. → fix W4
- B9 `features/launch.ts:158-278` and `features/issue.ts:86,163` build DOM inside controllers. → fix W4
- B10 `render/sessions.ts:537-564` holds Focus-view code. → fix W4
- B11 `render/sessions.ts` defines `buildActionButton`, which is shared by tiles and actions. → fix W4

### tests
- T1 `dupl` pairs: `prefs_test.go` (restart family ×5), `shellscroll_test.go` (×3 rows), `terminal_test.go` (resize ×2). → fix D9

## Wave 1 findings

There are five reports: `review.maintainability.{a-session,b-server,c-adapters,d-webcore,e-webui}.md`. Together they hold 3 Critical, 29 Major and about 70 Minor findings.

Every seed was confirmed except V9 (no change), G1 (no change), G2 (no change across packages; inside the server it is covered by b-m3) and G4 (no change). G3 became b-M4 (fix).

The per-finding assignment is `plan.md` § Units. Every Critical and every Major is assigned. Minors are assigned where they sit in a file a unit already touches, or where they cost about the same as their Major. Findings that belong to review-work (comment truth, correctness notes) are covered by X1 or F1, or listed below.

## Gate record

- E2E at `b3a032c` (after F1, WF1, W1–W4, D2, D3, D4): **446 passed, 0 failed** (445 baseline + 1 from WF1). The two baseline failures (P2) went away once HEAD stopped being a release tag.

- E2E at `db84642`: 445/446. The failure at `tiles.spec.ts:790` was root-caused to W6b (`03a6fd8`): a new tile's first refit ran on a detached node (lesson L2). Fixed in `59cd108`.
- E2E at `59cd108` (every web unit through W8, the tile fix, D2–D9, and X1a/X1b): **446/446**, plus `tiles.spec.ts` soaked 3×10 = **510/510**.

- E2E at `49fcb2b` (adds F2, F3 and the whole plan-ID sweep): **446/446**.

## Review cycle 2 (2026-09-24)

These reports make up cycle 2:
- `review.maintainability.{a-session,b-server,c-adapters,d-webcore,e-webui}.cycle2.md`
- `review.work.md` (behaviour preservation, cycle 1 for review-work)

Every cycle-1 Critical is fixed. Nearly every cycle-1 Major is fixed. New blocking items:
- **F1 rollback erases a queued write's change.** Found by a-cycle2 M1 and rw M1.
- **Removal bypasses the write turnstile, which can leave a ghost card.** Found by a-cycle2 M2.
- **Prefix-matched `kill-session` in the launch rollback kills `muster-7-shell`.** Found by rw M3. D10 introduced it by switching to KillSession.
- **Remove kills a live prefix-matched `muster-12`.** Found by rw M7. This predates the branch. It has the same fix as rw M3 (exact-match `=name` targets), so it is folded into FW-D2.
- **`.claude/settings.local.json` is spelled in `internal/server`.** Found by c-cycle2 C1. This predates the branch; the branch only moved the line.
- **An apply can register after Stop has already waited** (`applyWG.Add` runs after the unlock). Found by b-cycle2 M1 and rw.

There are also the Minors and false comments. The fix wave is FW-D1 (session/store), FW-D2 (adapters/tmux) and FW-W (web). FW-D3 (server) follows FW-D2.

The seam ADR stays `accepted` rather than `proposed`, because the developer delegated that decision to the debate (rw Major 6, [orchestrator]).

- Final gates at `9afe5fb`: `make check`, `make test-race` and the canary vet are green, and **E2E is 446/446**. `make size-warn` reports 65 (baseline 81): dupl 7→0, filelen 14→6, funlen 60→59 (all but 9 are test tables).
- Fix cycles: the plan capped fix waves at 2. A third, narrowly scoped one (FW-D1b plus the FW-Z residue) ran because the second wave's turnstile rewrite introduced two measured regressions: memory/DB divergence, and broadcasts leaving the ticket. Landing those would have reopened the fixed bugs.

## Behaviour notes (deliberate, recorded for review-work)

- D4: nine rare 5xx bodies (review-work counted nine; the ledger first said seven) now carry `msgInternalError` instead of ad-hoc phrases. None of these messages is pinned in `docs/protocol.md`.
- W2: one `logApiFailure` now logs every failed API call. Ten endpoints that used to fail silently now log to the console.
- D3: a corrupt stored time now surfaces as a scan error. No migration writes a non-RFC3339 time, so only hand-edited data can reach this path.
- F1: new rail positions are monotonic (never reused after a removal). Relative order is unchanged.
- W5: the reader's `basename` now strips a trailing slash. Reader callers pass only file paths.

## Lesson candidates

- L2 W6b (`03a6fd8`) moved the Tiles grid's `insertBefore` into a shared keyed-reorder pass that runs after the tile bodies render. A new tile's `refit()` then ran on a detached node, where FitAddon.fit() silently does nothing. The only symptom was a ~1-in-60 E2E geometry failure under load. Three soaks at the broken commit happened to pass, which pointed the first attribution at the wrong commit. The cause surfaced only with instrumentation (a `root.isConnected` trace) plus an injected attach delay. Unit tests could not see it (no DOM). Cost: about 1.5 h of soak and bisect. Cause: a refactor reordered DOM attachment relative to a layout-dependent call.

- L1 Commits W2 and W3 landed with `check-kb` failing, because the per-unit web gate left it out. The moved files dropped out of the feature registry. From then on, `check-kb` joined every unit's gate.


## Decisions from the developer (2026-09-24)

- Fix the Minors: every Minor is fixed in this run and none is cut to proposed-backlog. P3 became D11.
- Fix the concurrency bugs: F2 goes ahead.
- Run `/decide` on the other two: `decisions/sessionend-alive-hint/` and `decisions/adapter-run-seam-shape/`. The first contradicts an accepted ADR, which the decide skill normally refuses. It is debated at the developer's explicit request, and its outcome lands as a `proposed` ADR for the developer to accept.

- L3 A test agent proves "fails on the old code" by swapping `git show HEAD:<file>` into the working tree and then restoring its own saved copy. That is only safe while no other agent edits the same file. In F2, tests-F2 swapped five server files while X1d's helpers were sweeping those files. Nothing was lost (verified afterwards by plan-ID hit counts and kb-citation counts), but only by timing. Cause: a shared worktree, plus a proof method that overwrites files in place. A throwaway worktree for the swap (as the E2E checkpoints already use) removes the risk.

- L4 Three fix-wave `daemon-impl` agents (FW-D2, FW-D2b, FW-D3) committed their own work although the spawn prompt, and for FW-D3 a mid-run override message, said not to. Their definitions tell them to commit their own files by pathspec, "even when your gate is red … uncommitted work beside other agents' is the hazard, not a red commit". That is deliberate pipeline doctrine, and this run's main-session rule ("agents never commit; I commit after gating") contradicted it. The override held for all 20+ wave-2 units and broke in the fix wave. Each commit on its own was unbuildable or red, because another unit's uncommitted edits shared its files. All three were undone with a mixed `git reset HEAD~1` that kept the working tree. Cost: three undo cycles plus re-gating. Cause: a run-level rule contradicting an agent-definition rule. The doctrine's reason (L3's shared-tree hazard) is real, so the fix belongs in the definitions, not in a louder prompt. Either the definitions gain an explicit run mode for main-session-driven runs, or such runs accept per-agent red commits and squash at landing.

## Proposed (not fixes in this run)

- ~~P3~~ → now unit **D11** (the developer, 2026-09-24: "Fix the minors"). b-m14: move the reader's domain (`writeLog`, `readerPathQualifies`, `confine`, `listMarkdown`) out of `internal/server` into its own package, like `locate`, `usage` and `session`. It is a package extraction with a new diagram node, not a cleanup edit. Raised by the server reviewer; a change was requested.
- P4 a-note-3: `applyBind` leaves `DisplayName` empty on a new model and stale when the id changes. What the card should show needs deciding. Raised by the session reviewer; no change requested.
- P5 b-note-6: `handleIngest` reads the hook body with an unbounded `io.ReadAll`. The limit is a product and measurement choice (transcript-sized payloads?). Raised by the server reviewer; no change requested.
- P7 `killWindowAfterRecordFailure` (`internal/server/launcher.go`) has never had a test covering its call path: a `RecordLaunch` or `RecordResume` persist failure after a successful spawn. Driving it needs a store that fails one specific write mid-launch. The gap predates this run. Raised by daemon-tests (D7a); no change requested.
- P6 Plan IDs in **test** comments and `describe()` strings: 422 test lines in server alone. X1 sweeps non-test code only. Raised in the cleanup session.

- P1 Nine fact records (`hook-await-per-event`, `interrupt-emits-no-turn-end`, …) cite `test/rig/captures/capture-{3,8}.jsonl` in `refs`. That directory is gitignored (`.gitignore:32`), so `make check` fails in any fresh clone or worktree. It passes only in the developer's checkout, where the captures exist. Change requested: no, found while setting up the baseline.
- P2 Two E2E specs assume that `make build` produces a dev-stamped binary (`Makefile:6` VERSION = `git describe --tags --always --dirty`). On a commit that is exactly a release tag, which is `main` right after every release, both fail (`shell.spec.ts:47`, `update.spec.ts:449`). The fix would be for the E2E fixture to stamp its own dev version, instead of relying on whatever `git describe` says. Change requested: no, found in the baseline run.

- P8 A liveness `Nudge` on a non-clear `SessionEnd` would narrow the ≤5 s stale-"alive" window that decision `sessionend-alive-hint` accepted when no terminal is attached. The nudge must stay behind the `stopped` guard (kb:adr/lifecycle-liveness-writes-stop-at-shutdown). Raised by the sessionend debate; no change requested.
- P9 c-M2's secondary point: the ingest route and `MUSTER_SESSION` are Muster vocabulary, and D10 declared each once in `internal/claudecode` (server imports claudecode, so no new diagram edge). Moving them to a Muster-owned package would need a `WriteWrapperScripts` signature change. Whether claudecode should hold Muster vocabulary at all is an ADR-level boundary question. Raised by the adapters reviewer and implementer D10; no change requested in this run.
