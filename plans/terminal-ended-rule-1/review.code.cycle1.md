# Correctness review: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 27416 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes — `observeSpawnReply` (`web/src/features/surfaces.ts:180`) compares against `appliedRev`; only the `terminals` handler (`applyListRev`) and snapshot (`resetSeenRev`) set the applied rev; replies only `raiseSeenRev` (the floor). `terminalsState` is written only by lists, snapshot and forget, so "that list lacks its `n`" reads the last applied list | Partly — rename-first, close-first and `select('shell')` variants (`surfacesrev.test.ts:269–309`); the `terminals`-message basis for "ended" is covered by `surfacesrev.test.ts:227–267`. The snapshot basis (`snapshot.terminalsRev`) has no test — Major 1 | pass (coverage gap) |
| REQ-2 | Yes — `sync(ctx, sessionID)` (`internal/server/shellactivity.go:128`) on a failed `poll` takes `p.rev++` under `mu` with no broadcast and records it in `revs[id]`; spawn (`shells.go:144`), rename (`:209`), close (`:239`) and the attach nudge (`:275`, `pumpPTYToSocket` passes the session id) all pass the session id | Yes — `TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast` (rev above every sent, equals the daemon-wide counter, no broadcast) | pass |
| REQ-3 | Yes — `reconcile` (`shellactivity.go:210–219`) adds every forced session not already pending, `[]` when `next[id]` is nil, and clears the mark | Partly — the unchanged non-empty list and the one-shot clear are tested; the "(an empty list if the session has no terminals)" branch is not — Major 2 | pass (coverage gap) |
| DIAG | `kb:diagram/daemon-components`, `kb:diagram/web-components` (package/directory level; no import or module added) | — | pass |

## Build & Tests

E2E tests: pass (114, scoped to 12 files: auth, claude-version, embedded, masthead-update-dot, plain-shell, resilience, shell-activity, shell-keys, shell-scroll, shell, terminal, terminals) · Daemon tests: pass (`go test -count=1 ./cmd/musterd ./internal/server`; the gate line carries no `-race`) · Web tests: pass (3408) · Render tests: pass (509) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; web lint clean) — all read from $GATES_LOG_DIR (0 failed lines). Other gate lines green: render fixtures (119 scenarios up to date), render-lint, contrast (54 pairs ×3, 0 failures), versions, kb check (713 records, 0 problems), e2e-lint, features-scope, comment checks, comment ledger. `WARN size` (funlen `TestTick_BusyGating_Table`, untouched by this plan) and the e2e-level census are review-maintainability's / pre-existing.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `cd web && npx vitest run src/features/surfacesrev.test.ts src/terminal/terminalsrev.test.ts` | pass (2 files, 22 tests — `23-W1.log`) |
| D1 | `go test -count=1 -run 'TestPollerRev_' ./internal/server/` | pass (`24-D1.log`) |
| D2 | `go test -count=1 ./internal/server/` | pass (`25-D2.log`) |
| D3 | `make lint` | pass (deduped to the gates' lint line, `golangci-lint run` — 0 issues, `03-lint.log`) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass — sweep batch (`plans/terminal-ended-rule/research/e1.md`): the open `TODO.md` entry is the loop's tick on `main`. No `deviation:` or `doc-delta:` lines in either log. ADR `kb:adr/surfaces-terminal-ended-read-from-lists` (accepted, the developer's) describes what shipped. Doc Delta "No doc change" leaves one false sentence in `docs/protocol.md` — Major 3 `[orchestrator]` |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The daemon change matches `docs/protocol.md` § Revisions and ws.shell-activity as they stand | pass, with one self-contradiction in the doc (Major 3) | § Revisions: success path unchanged (`revFor` after the call's own broadcast); failure path takes a fresh daemon-wide value without a broadcast and forces the next successful poll's broadcast even if unchanged (`shellactivity.go:128–139, 210–219`). ws.shell-activity: counter rises by one per broadcast and per failed follow-up listing; all writes to `p.rev` are under `mu` and every broadcast is under `tickMu`, so `/ws` revs stay increasing with gaps. `snapshot.terminalsRev` is `p.rev` (may now be a gap value — the developer's Q1 case, accepted). The only mismatch is protocol.md's own sentence "never when nothing changed" (line 1755), which the forced broadcast the same document's § Revisions requires now contradicts |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude-Code-format knowledge in the diff |
| 2 | No terminal-output state parsing | pass — the poller reads `ListPaneActivity` process state only |
| 3 | Non-blocking hook handler | pass — no ingest code touched |
| 4 | tmux via `-L muster`; sizing | pass — no tmux invocation added |
| 5 | No payload logging | pass — the only log line is the existing listing-failure Debug |
| 6 | Empty-gauge honesty | pass — no gauge path touched |
| 7 | Identity on the tmux target | pass — `revs`/`forced` key on the Muster session id |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass — tests use `paneActivityStub` and stubbed `fetch` |

## Issues

### Critical

None.

### Major

1. **[web-tests]** REQ-1's snapshot basis is untested: no test has a spawn reply whose `rev` is at or below `snapshot.terminalsRev`, with no `terminals` message since, where the snapshot list lacks `n`. Every "ended" test (`web/src/features/surfacesrev.test.ts:227–267`) first sends `w.terminals(1, 9, …)`, so `applyListRev` sets the applied rev. The new tests' replies (rev 6 against snapshot 5) are above any base. So if `resetSeenRev` (`web/src/terminal/terminalsrev.ts:24`) stopped setting `appliedBase`, a terminal that already ended would be shown and the suite would stay green. The plan's Proof also names `web/src/terminal/terminalsrev.test.ts` for any new state helper. `appliedRev`, `applyListRev` and the applied half of `forgetSeenRev` have no unit test there (the log says the helpers did not exist yet when the tests were written). A fix must add a wire-level test: snapshot `terminalsRev` 9 with `{1:[t1]}`, spawn reply `{n:2, rev:9}` → not switched, and its counterpart rev 10 → shown. It must also unit-test the new helpers in `terminalsrev.test.ts`.
   id: web/src/features/surfacesrev.test.ts:observeSpawnReply:snapshot basis untested | confidence: 85
2. **[daemon-tests]** REQ-3's "(an empty list if the session has no terminals)" clause is untested. `TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast` (`internal/server/terminalsrevpoller_test.go:139`) only forces an unchanged non-empty list. No test reaches the `list == nil → []terminalWire{}` branch at `internal/server/shellactivity.go:212–215`: a forced session that is absent from both the old and the next listing, such as a spawn whose follow-up listing fails and whose terminal is gone by the next poll. A fix must add a test where the forced session has no terminals on the next successful tick and assert one broadcast of `[]` (non-nil) for it.
   id: internal/server/terminalsrevpoller_test.go:reconcile:forced empty list untested | confidence: 85
3. **[orchestrator]** `docs/protocol.md:1753–1755` (ws.shell-activity) says `terminals` is broadcast "whenever any of it changes … never when nothing changed". The shipped poller broadcasts an unchanged list after a failed follow-up listing. The same document's § Revisions (line 1027) and `kb:adr/surfaces-terminal-ended-read-from-lists` require that broadcast, and `shellactivity.go:210–219` does it. The plan's Doc Delta says "No doc change", so doc-reconcile will promote nothing and the false sentence stays. A fix must add a Doc Delta line under ws.shell-activity so that it names the forced re-broadcast after a failed follow-up listing as the one exception.
   id: docs/protocol.md:ws.shell-activity:never-when-unchanged now false | confidence: 90

### Minor

None.

### Notes

1. **[note]** Plan edge case 1 says the existing tests keep covering a reply at the applied rev with the terminal present (→ W1). No unit test in W1's two files has that exact equality. The scoped `e2e/terminals.spec.ts` journeys against the real daemon, where the spawn reply's rev equals the list it follows, exercise it and pass.
2. **[note]** A `forced` mark for a session that is then removed (`shellRegistry.Kill` drops it from `activeIDs`) persists until the next poll that reaches `reconcile`. That poll broadcasts `[]` for the unknown session id, which the client ignores (`surfaces.ts:336`, and protocol: "a client that does not know `sessionId` ignores it"). Harmless; recorded for review-maintainability if it wants the guard shape.
3. **[note]** The gates' daemon test line runs without `-race`. The new `forced` map is written under both `tickMu` and `mu` in `sync`, and under `tickMu` + `mu` in `reconcile`, so it is guarded either way.
