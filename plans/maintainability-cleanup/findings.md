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

## Lesson candidates

## Proposed (not fixes in this run)

- P3 b-m14: move the reader's domain (`writeLog`, `readerPathQualifies`, `confine`, `listMarkdown`) out of `internal/server` into its own package, like `locate`, `usage` and `session`. It is a package extraction with a new diagram node, not a cleanup edit. Raised by the server reviewer; a change was requested.
- P4 a-note-3: `applyBind` leaves `DisplayName` empty on a new model and stale when the id changes. What the card should show needs deciding. Raised by the session reviewer; no change requested.
- P5 b-note-6: `handleIngest` reads the hook body with an unbounded `io.ReadAll`. The limit is a product and measurement choice (transcript-sized payloads?). Raised by the server reviewer; no change requested.
- P6 Plan IDs in **test** comments and `describe()` strings: 422 test lines in server alone. X1 sweeps non-test code only. Raised in the cleanup session.

- P1 Nine fact records (`hook-await-per-event`, `interrupt-emits-no-turn-end`, …) cite `test/rig/captures/capture-{3,8}.jsonl` in `refs`. That directory is gitignored (`.gitignore:32`), so `make check` fails in any fresh clone or worktree. It passes only in the developer's checkout, where the captures exist. Change requested: no, found while setting up the baseline.
- P2 Two E2E specs assume that `make build` produces a dev-stamped binary (`Makefile:6` VERSION = `git describe --tags --always --dirty`). On a commit that is exactly a release tag, which is `main` right after every release, both fail (`shell.spec.ts:47`, `update.spec.ts:449`). The fix would be for the E2E fixture to stamp its own dev version, instead of relying on whatever `git describe` says. Change requested: no, found in the baseline run.
