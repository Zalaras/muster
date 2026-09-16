# Review: General Cleanup

**Plan**: general-cleanup
**Verdict**: approved
**Pack**: `kb: pack 46261 words` (WARN — pack exceeds budget of 8000 words)

Zero Critical issues and zero issues tagged to a pipeline agent. Four `[orchestrator]`
items (doc upkeep, a stale diagram edge, a plan-defect pair) and five `[note]`s are listed
below for the backstop and for `/doc-reconcile`; none blocks approval.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 version regex | Yes — `internal/triage/checks.go:46` | Yes — `TestCheckVersion` (D1) | pass |
| REQ-2 drop the wall-clock assert | Yes — `internal/claudecode/version_test.go` | Yes — D2 `-count=20` green | pass |
| REQ-3 `ingestQueue.Drain` | Yes — `internal/server/ingest.go:96` | Yes — `TestIngestQueue_Drain_*`, D5 `-race -count=10` | pass |
| REQ-4 E14 waits for attach | Yes — `web/e2e/plain-shell.spec.ts` sizenote wait | Yes — E7 soak 10× green | pass |
| REQ-5 (a)(b)(c)(d)(e) coverage | n/a (test-only) | Yes — `TestShellRegistry_*`, `TestLauncher_Concurrent*`, `TestKillSession_PostKillRecheck*` | pass |
| REQ-6 `classifyDocChanged` | Yes — `web/src/reader/notice.ts` | Yes — W4 | pass |
| REQ-7 focus restore | Yes — `web/src/features/connection.ts:87-113`, `web/src/render/focusrestore.ts` | Yes — W2, E1, E2, plus hand-driven browser run | pass |
| REQ-8 pop-out `connecting…` | Yes — `web/src/app.ts:34`, `web/src/reader/notice.ts:17` | Yes — W1, W3, E3, plus hand-driven browser run | pass |
| REQ-9 pop-out live theme | Yes — `web/src/doc.ts:61,90-93` | Yes — E5, plus hand-driven browser run | pass |
| REQ-10 fixed 5xx messages | Yes — `internal/server/sessions.go:81-87`, `shells.go:190,217` | Yes — D6 grep, D7 body+log assertions ×5, plus a live `curl` | pass |
| REQ-11 ctx deadline never "gone" | Yes — `internal/tmux/tmux.go:493-511` | Yes — `TestPaneExists_CancelledContext*`, `TestKillSession_CancelledContext*` | pass |
| REQ-12 envelope corroboration | Yes — `internal/server/ingest.go:232-256`, `manager.go:731` | Yes — D9 table, D10, E4, 19-file fixture migration | pass |
| REQ-13 shells at kill shutdown | Yes — `cmd/musterd/main.go:494-556`, `manager.go:1139-1190` | Yes — D11–D16, plus a live kill/leave run on a scratch socket | pass |
| REQ-14 (should) `Drain` sweep | Yes — `reader_test.go:740,764,771` | n/a | pass |
| DIAG | `kb:diagram/web-components` (counts corrected, edge label stale), `daemon-components`, `containers`, `store-schema` unaffected | — | fail — see Major 1 |

## Build & Tests

E2E tests: pass (376/376, `make e2e`, full regression sweep)
E2E soak: pass (`plain-shell.spec.ts` N=10 via gates; `reconcile.spec.ts` N=10 → 50/50)
Daemon tests: pass (`make test`, all 21 packages)
Web tests: pass (41 files, 1669 tests)
Daemon build: pass (`go build ./...`)
Web build: pass (`npm run build`)
Lint: pass (`make lint`, 0 issues)
Knowledge: pass (`make check-kb`, 374 records, 0 problems)
Contrast: pass (43 pairs × 3 themes, 0 failures)

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| D0 | `go build ./...` | pass |
| D1 | `go test ./internal/triage -run 'TestCheckVersion' -count=1` | pass |
| D2 | `go test ./internal/claudecode -run 'TestInstalledVersion_Descendant…' -count=20` | pass |
| D5 | `go test -race ./internal/server -run 'TestIngestRouting_Straggler…' -count=10` | pass |
| D6 | negative `rg` for raw errors in 5xx bodies | pass |
| D17 | `make test` | pass |
| D18 | `make lint` | pass |
| W5 | `make web-build` | pass |
| W6 | `make web-test` | pass |
| E6 | `make e2e` | pass |
| E7 | `make e2e-soak SPEC=plain-shell.spec.ts N=10` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | FAIL — the 13 `TODO.md` entries named in the plan's Doc upkeep are not ticked or moved to `docs/history/todo-done.md` (no diff to either file). The three plan ADRs exist, are `proposed`, carry `refs: plan:general-cleanup`, and describe what shipped; the two logs' only `deviation:` lines both read `deviation: none`, and no log carries a `doc-delta:` line the plan's Doc Delta omits. The plan schedules the ticks at Completion, so this is the backstop's — but the Doc Delta itself has a defect (Major 2). |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D2 (prose) | the 45 s select's message names the `WaitDelay` revert as the cause | pass | `internal/claudecode/version_test.go` — the select's failure text names `WaitDelay` being removed as the only way to reach it |
| D3 | `Drain` returns after the last enqueued event is observed; `ctx.Err()` on a stopped queue | pass | `ingest.go:96-113` — marker job behind every queued job on the same channel; `TestIngestQueue_Drain_NothingQueuedReturnsImmediately` / `_WorkerNotRunningBlocksToDeadline` |
| D4 | REQ-5 (a)(b)(c)(e) tests fail against a build with the mechanism removed | pass | **Mutation run by the reviewer.** (b): deleted the `ErrSessionExists` re-check block from `shells.go` → `--- FAIL: TestShellRegistry_EnsureOnCollisionRechecksAndReportsNotCreated … "REQ-5(b)/D4: a re-checked collision must not surface as an error"`. (e): restored the pre-fix check-then-insert in `UpsertRepo` → `TestLauncher_ConcurrentLaunchesForTheSameDirectoryProduceTwoDistinctRows` red 5/5 with `UNIQUE constraint failed: repo.path (2067)`. Both files restored; `git status` clean, `go build ./...` green |
| D7 | fixed phrase on the wire, raw error in the log, for End / Remove / shell spawn / launch-settings | pass | `sessions_test.go:194,522,596,684` and `plainshell_test.go:205` assert both halves; confirmed live against the real binary (below) |
| D8 | `PaneExists` on a cancelled ctx errors; `KillSession` never reads it as success | pass | `TestPaneExists_CancelledContextReturnsWrappedContextCanceled`, `TestKillSession_CancelledContextNeverReadsAsASuccessfulKill`; `tmux.go:495` wraps `ctx.Err()` with `%w` and keeps the `ExitError` out of the chain deliberately |
| D9 | corroboration table across session × binding states | pass | `TestIngestRouting_CorroborationTable` — matched pane routes, mismatched and absent persist unrouted with NULL `session_id`, raw post routes as before |
| D10 | empty stored pane routes and binds | pass | `TestIngestRouting_EmptyStoredPaneRoutesOnMusterSessionAlone`; `ingest.go:239` returns `&id` when `stored == ""` |
| D11 | `KillAllShells` kills every shell, no Claude session, already-gone counts as killed | pass | `TestKillAllShells_KillsEveryShellAndNoClaudeSessions`, `_OneShellFailingDoesNotStopTheRest`, `_NoSessionKillerReadsAsNoShells` |
| D12 | a `ShellCount` error is logged and shutdown proceeds with `shells=0` | pass | Manager half tested (`TestShellCount_ListSessionsFailureIsReturnedAsAnError`); the cmd half read directly at `main.go:508-513` — `log.Warn().Err(...)`, `shells = 0`, and `KillAllShells` skipped, never a blocker. See Note 2 |
| D13–D16 | subprocess on-exit tests assert socket contents and log/prompt text | pass | `cmd/musterd/onexit_test.go:426,445,474,476,492` (`shells=1` on both branches, shells-only kill, the exact prompt string); `main_test.go:135` updated for the new format |
| W1–W4 | the named Vitest files cover the stated tables | pass | `app.test.ts` (all three statuses), `focusrestore.test.ts` (7 + 5 cases incl. edge cases 8–11), `notice.test.ts` (4 + 4 + 6 + 3 cases) |
| E1–E5 | present in `general-cleanup.spec.ts` and green under `make e2e` | pass | all five present, node-identity assertions on E1/E2, `settleFor` absence check on E3; 376/376 |
| R1 | no per-site focus hack | pass | `rg '\.focus\(\)' web/src` — the only new call is `features/connection.ts:109`; the 15 `disabled = !connected` sites are untouched |
| R2 | `proposed-backlog.md` absent or `needs-decision`-only | pass | absent — the run fixed its discoveries (`UpsertRepo` race, `actions.spec.ts` E8, `plain-shell.spec.ts` E7, the liveness race) rather than filing them |
| R3 | the 13 `TODO.md` entries ticked and moved | **fail** | no diff to `TODO.md` or `docs/history/todo-done.md` — see the DOC row |
| R4 | the lifecycle spec body is no longer than before this plan | pass **today**, at risk | the spec is unchanged so far (doc-reconcile runs after this step). Measured: 647 words excluding the mermaid fence, not "at the 800-word cap" as the Delta claims. The Delta as written is net **+12** there — see Major 2 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude-Code field name (`hook_event_name`, `rate_limits`, `permission_mode`, `transcript_path`) appears in any changed non-`claudecode` file |
| 2 | Terminal-output state parsing | pass — no `capture-pane` added; `runCapture` (display source) untouched |
| 3 | Blocking hook handler | pass — the ingest request path is unchanged; `Drain` is test-only (`rg '\.Drain\('` → six `_test.go` sites, zero production) |
| 4 | Bare tmux / `resize-pane` | pass — `run` still prefixes `socketFlag()` (`-S`/`-L`) on every call through the new `exec` seam; the e2e helper uses `-S <per-run socket>`; no `resize-pane` added |
| 5 | Payload logging | pass — the corroboration Info line carries `kind`, `muster_session`, `stored_pane`, `envelope_pane` only |
| 6 | Empty-gauge dishonesty | pass — REQ-8 replaces a false "unreachable" with the word `connecting…`; no gauge markup changed |
| 7 | Session identity on `session_id` | pass — REQ-12 tightens identity onto the tmux pane |
| 8 | Settings trespass | pass — no read or write of `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR`; the only `settings.local.json` mentions are a scratch project-scoped path in a test assertion |
| 9 | Real `claude` outside canary/probes | pass — every new launcher test uses `claudeBin: "irrelevant-never-reached"`; no test invokes the real binary |

## Manual Verification

Driven by hand against `bin/musterd` (this build), a scratch data dir, a scratch tmux
socket and a stub `claude` — not against the test harness.

**Browser (Playwright, headless Chromium, script controlling the daemon process itself):**

- **REQ-7** — focused the mainhead `End` button, captured its element handle, `SIGTERM`'d
  the daemon. Observed: banner visible (`musterd unreachable — hook output in open panes is
  Muster's absence, not session failure.`), `End` disabled, `document.activeElement ===
  document.body`. Restarted the daemon; after the banner cleared, `End` enabled and
  `document.activeElement === <the captured handle>` → **true**. Node identity, not a
  re-matched locator.
- **REQ-8** — opened `/doc.html?session=1&path=TODO.md` on an already-authed context with
  the page's own WebSocket withheld (`routeWebSocket`, never calling `connectToServer`),
  waited 2.5 s, read `#reader-host [role=status]` → `"connecting…"`. Never the unreachable
  text.
- **REQ-9** — opened a real pop-out from the reader's Pop out link (`instrument` on both
  windows), then checked **Dark** in the dashboard's Settings. Dashboard `html[data-theme]`
  → `dark`; the already-open pop-out → `dark`, with no reload anywhere in the run.

**Daemon, by hand:**

- **REQ-10** — `POST /api/sessions` into a directory with a corrupt
  `.claude/settings.local.json` returned `HTTP 500` and exactly
  `{"error":{"code":"launch_failed","message":"couldn't launch — see the daemon log"}}`,
  while the daemon log line read `ERR writing launch settings failed error="…: parsing
  existing settings.local.json: invalid character 'h' in literal true…" directory=…`. The
  raw error is on one side of the boundary only.
- **REQ-13** — launched a session plus a shell (`muster-1`, `muster-1-shell` on the socket).
  `-on-exit=leave` + `SIGTERM` → `INF leaving live sessions running count=1 shells=1`, both
  sessions still on the socket. Restarted with `-on-exit=kill`: startup reconcile logged
  `kept_alive=1 shells_killed=1 swept=0`; created a fresh shell, `SIGTERM` →
  `INF ended live sessions on shutdown count=1 shells=1`, and `tmux -L <sock> list-sessions`
  → `no server running` — nothing left. INV-SHELLS-AT-KILL holds on both branches.

Every scratch daemon, tmux server and stub process was killed afterwards; the working tree
is clean and `go build ./...` green.

Not verified by hand: D12's cmd-side log-and-proceed branch (would need a daemon whose tmux
socket becomes unreachable exactly at shutdown) — read at `main.go:508` instead, see Note 2.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** `kb:diagram/web-components` has a stale edge label — `docs/diagrams/web-components.md:64` reads `Rel(doc, features, "reader, connection")`, but `web/src/doc.ts` now inits a third controller, `features/theme` (REQ-9, `doc.ts:61`). The module counts corrected in `d7550a4` are right (verified: `render/` 21, `reader/` 9, and the untouched `terminal/` 5, `sessions/` 8, `features/` 16 all still hold); it is only this label that drifted. Fix: `Rel(doc, features, "reader, connection, theme")`.
2. **[orchestrator]** The plan's `## Doc Delta` for **lifecycle** cannot be promoted verbatim without failing R4. R4 requires that spec's body to be net ≤ 0 words; the Delta removes a 16-word clause, replaces it with 10 words, and adds a ~18-word sentence plus an ADR citation — net **+12**. Its stated premise is also wrong: the body measures **647 words excluding the mermaid fence** (`make check-kb` passes with 153 words of headroom), not "at the 800-word cap". Amend R4 or trim the Delta before `/doc-reconcile` runs, otherwise the reconcile step lands a spec that contradicts an accepted criterion.
3. **[orchestrator]** `web/e2e/general-cleanup.spec.ts` is named for the plan, not a feature seam, which `docs/conventions.md` § Composition roots requires ("E2E spec files and `web/e2e/helpers/<feature>.ts` are named for the same feature seam"). The plan's own Affected Files specifies that filename, so this is a plan defect, not an e2e-specs one — the agent followed an approved plan. The registry choice compounds it: the file is listed only under `connection`, but E4 is ingest and E5 is theme, so `kb for web/e2e/general-cleanup.spec.ts` will not surface those two tests to a future ingest or theme change. Splitting the file is **not** the cheapest fix — registering it under the features it actually covers is, and multi-feature registration is already practised in this repo (`internal/server/prefs*.go` and `internal/server/sessions*.go` each appear under two features). `docs/features/*/spec.md` belongs to `/doc-reconcile`, so this is flagged, not fixed, here: add `web/e2e/general-cleanup.spec.ts` to `ingest`, `theme` and `reader`'s `e2e:` lists alongside `connection`, then `make gen-kb`.

### Minor

None.

### Notes

1. **[note]** The `Manager.stopped` guard's split — gating the poll and `Nudge` paths but
   not `End`'s — is **correct**, and I traced it rather than taking the log's word. `Stop`
   has exactly two production callers: `Server.Shutdown` (reached from `shutdownGracefully`,
   which exits the process, and from `stopForRestart`, which `syscall.Exec`s a fresh image)
   and `Server.StopLivenessPoll` (the first statement of `shutdownGracefully`). There is no
   path on which a daemon keeps serving after `Stop`, so a latched `stopped=true` can never
   silently disable liveness in a live process — `Start()` never resetting the flag is safe
   for the same reason. `endOnCheckError=true` is `End`'s only caller, so
   `-on-exit=kill` → `EndAll` → `End` → `endLocked` → `checkOneLiveness(…, true)` still
   marks ended; `TestEnd_StillMarksEndedAfterStop` pins it, and `reconcile.spec.ts` E4
   (the `-on-exit=kill` sweep) is green 50/50 under soak. The behaviour deliberately given
   up is narrow and honest: during the shutdown window the dying process stops recording
   pane deaths, and the next boot's reconcile converges — the branch it exists for. The ADR
   `kb:adr/lifecycle-liveness-writes-stop-at-shutdown` states exactly this, names the
   rejected alternative and the bisect that found the cause; it matches the code.
2. **[note]** `endOnCheckError` now carries two meanings: "what to do when `PaneExists`
   itself errors" and, since this change, "is this shutdown's own deliberate kill". The two
   coincide across all three current callers and the `stopped` field doc spells the coupling
   out, so no change is requested — but a future fourth caller passing `true` purely for the
   error-handling semantics would silently bypass the guard.
3. **[note]** D12's cmd-side half (`ShellCount` errors → logged, `shells = 0`, shutdown
   proceeds) has no test; only the Manager half that produces the error does. The untested
   code is five lines of straight-line handling at `cmd/musterd/main.go:508-513` and a
   subprocess test for it would need the socket to become unreachable exactly at shutdown.
   Read and verified by inspection; not worth a fix wave.
4. **[note]** `internal/store/repo.go` was outside the plan's Affected Files, and changing
   it was the **right call**: REQ-5(e)'s test exposed a genuine check-then-insert race on a
   real user path (two launches into the same never-before-seen directory → `UNIQUE
   constraint failed: repo.path` → a 500), and the plan's Run policy puts exactly that in
   scope ("a code/test defect discovered during this run is a fix wave in this run"). I
   proved the test is failing-first against the pre-fix code (5/5 red, D4 above) and read
   the replacement: the single `INSERT … ON CONFLICT(path) DO UPDATE … RETURNING` leaves
   `pinned` and `created_at` out of the SET list so both survive, and reading `created` off
   `launch_count == 1` is sound because nothing else in the tree ever writes `launch_count`
   (`rg launch_count` — one migration default and this statement).
5. **[note]** daemon-tests' disclosed gap is **closed**: it could not produce a failing-first
   proof for `TestKillSession_PostKillRecheckStillThereReturnsTheOriginalKillError` because
   the permission layer blocked editing `tmux.go`, and argued the branch pre-existed. The
   argument holds, and I ran the mutation myself — replacing `if checkErr != nil ||
   stillThere` with `if checkErr != nil` turns the test red with its own message
   (`REQ-5(d)/D8: a still-there recheck must not read as REQ-6's idempotent success`). The
   test is a real pin, not a vacuous one. File restored, tree clean.
6. **[note]** `internal/server/issue.go:666,673` still put an upstream GitHub `Message` into
   two `502` bodies. That is outside REQ-10's named sites, pre-existing, deliberate (the
   message is documented token-free and carries GitHub's own status), and D6's grep passes —
   listed only so INV-5XX-NO-RAW's scope is on the record.
