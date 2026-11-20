# Review: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Verdict**: needs-changes
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code needs-changes, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Part verdict**: needs-changes
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

## Browser review

# Browser review: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8561 words (budget 30000)
**Rig**: `make web-build build` at f1542bbe (dirty only in `orchestration-state.json`); `bin/musterd` per test via `helpers/fixtures.ts` `daemon` (fresh space-bearing temp data dir, private `-tmux-socket` path, shared E2E stub `claude`); headless Chromium, throwaway spec `web/e2e/zz-reviewbrowser.spec.ts` run in the foreground under the gate lock (8/8 ran, 3.3 min), then deleted. Gates log: 0 failed lines (`22-e2e` 114 passed, `04-web-build` built).

The race needed to observe REQ-1 was made deterministic. `page.routeWebSocket` held this session's `terminals` frames, and `page.route` held the `POST …/shells` 201 until the rename or close reply had landed. Each run's wire trace was logged to confirm the reply ordering. Rename case: spawn `rev 2`, rename reply `rev 3`, lists `rev 2`/`rev 3` held. Close case: spawn `rev 3`, close reply `rev 4`, lists `rev 3`/`rev 4` held. On the pre-fix rule (`rev <= seenRev`), both orderings read the spawn as ended (2 ≤ 3, 3 ≤ 4), so these cells can fail for the defect. Every input is real: a pointer click on ▾ → New terminal, ✎ → typing → Enter, and × on a row. The oracle is tmux `#{session_attached}` on each terminal target plus `GET /api/state` `terminals[id]`. Both were read after a ≥1.2 s settle.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 (rename reply before list) | focus | data, lists held | new terminal shown | pass | after release + 1.2 s: `shell` aria-pressed=true; region `flex/visible/1` box 300,95 980×599 inside host 300,46 980×674; tmux `muster-1-shell-2` attached=1, `muster-1-shell` attached=0; /api/state `1:renamed,2:shell 2` |
| REQ-1 (rename reply before list) | focus | data, settled after lists flushed | stays on new terminal | pass | +1.5 s: title "shell 2", pressed=true, count "2", shell-2 attached=1, shell-1 attached=0 |
| REQ-1 (rename reply before list) | tiles | data, lists held | new terminal shown | pass | pressed=true; region `flex/visible/1` 2,117 636.5×255.5 inside tile 1,85 638.5×316.5; shell-2 attached=1, shell-1 attached=0 |
| REQ-1 (rename reply before list) | tiles | data, settled | stays on new terminal | pass | title "shell 2", count "2", shell-2 attached=1 |
| REQ-1 (close reply before list) | focus | data, lists held | new terminal shown | pass | pressed=true; region visible, inside host; `muster-1-shell-3` attached=1; /api/state `2:shell 2,3:shell 3` |
| REQ-1 (close reply before list) | focus | data, settled | stays on new terminal | pass | title "shell 3", shell-3 attached=1, shell-2 attached=0 |
| REQ-1 (close reply before list) | tiles | data, lists held | new terminal shown | pass | pressed=true; region 2,117 636.5×255.25 inside tile; shell-3 attached=1 |
| REQ-1 (close reply before list) | tiles | data, settled | stays on new terminal | pass | title "shell 3", shell-3 attached=1, shell-2 attached=0 |
| REQ-1 (`select('shell')`, rename/close reply first) | focus, tiles | data | shown | not measured — see Note 2 | |
| REQ-1 (first `shell`, list held) | focus | no data (no terminals) | terminal 1 shown before its list arrives | pass | pressed=true, region `flex/visible/1` inside host, `muster-1-shell` attached=1; settled title "shell 1" |
| REQ-1 (first `shell`, list held) | tiles | no data | terminal 1 shown | pass | pressed=true, region inside tile, shell-1 attached=1; settled title "shell 1" |
| REQ-1 (rename/close reply before list) | any | no data | — | N/A — a rename or close needs an existing terminal | |
| REQ-1 (spawn really ended: list without `n` applied at a higher rev) | focus | data | not switched to | pass | spawn rev 2 held; `muster-1-shell-2` killed; list `rev 3 n=[1]` applied; reply released → title "shell 1", shell-1 attached=1, /api/state `1:shell 1` |
| REQ-1 (spawn really ended) | tiles | data | not switched to | pass | same sequence: title "shell 1", shell-1 attached=1 |
| Edge 1 (reply rev = applied rev, terminal present) | focus, tiles | data | not ended | pass | close-case setup: un-held New terminal → title "shell 2" shown in both hosts |
| REQ-2 / REQ-3 (failed follow-up listing) | focus, tiles | data | fresh rev; forced broadcast | not measured — see Note 1 | |
| any | pop-out `/doc.html` | any | — | N/A — the pop-out hosts the reader only, never a terminal | |
| daemon-down | focus | daemon SIGTERMed | surfaced prominently | pass | `role=alert` banner `block/visible/1` at 0,46 1280×32, "musterd unreachable — hook output in open panes is Muster's absence, not session failure."; shell segment left on "shell 2" |
| daemon-down | tiles | daemon SIGTERMed | surfaced prominently | not measured — see Note 3 | |
| §7 one live client per target | focus, tiles | data | one client | pass | in every settled cell, exactly one terminal target has attached=1 and the previously shown one has 0 |

## Issues

### Critical
None.

### Major
None.

### Minor
None.

### Notes
1. **[note]** REQ-2 and REQ-3 were not measured in the browser. They fire only when the daemon's pane listing fails right after a terminal route. The running app gives no user-reachable way to make that happen without fault injection in `shellActivityPoller`'s lister, short of killing the tmux server and with it every terminal. Their evidence is `D1` (`TestPollerRev_FailedFollowUpListingAnswersAFreshRevAndForcesNextBroadcast`), which belongs to `review-work`.
2. **[note]** The `select('shell')` variant was not measured, for focus or tiles. To hit the race, `shell` must be clicked while a rename or close reply from this same window is in flight, with no terminal remembered as last shown in this window. That needs a terminal to exist, the window to have no last-shown memory of it, and the panel to act before the segment click resolves. I could not set that up through real input. `surfacesrev.test.ts` covers it at wire level.
3. **[note]** The daemon-down banner was measured in focus only. It is a single masthead-level `role=alert` element spanning the full width (0,46 1280×32), not part of either host, and this plan does not touch it.
4. **[note]** For the gap between the spawn reply and the first applied list, the `shell` button has `title=null`, because the terminal's name comes from the list. Once the list lands it settles to "shell N". This is transient, and existing behaviour this plan does not change. No change requested.
