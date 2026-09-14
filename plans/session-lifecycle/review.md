# Review: Session lifecycle robustness

**Plan**: session-lifecycle
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=session-lifecycle role=review features=lifecycle,actions,launch,surfaces,ingest -->`

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `MinID` + transactional explicit-id `InsertSession` + watermark | Yes | D1 | pass |
| REQ-2 an id is never reissued | Yes | D7 | pass |
| REQ-3 `ParseSessionName` / `MaxSessionID` | Yes | D2, `TestParseSessionName` | pass |
| REQ-4 `ErrSessionExists`, match confined to `internal/tmux` | Yes | `TestNewNamedSession_DuplicateNameWrapsErrSessionExists` | pass |
| REQ-5 `NewNamedSession` leaks no session | Yes | D6 + `killLeakedSession` unit test | pass |
| REQ-6 `KillSession` tolerates already-gone only | Partly | D12; the still-there / check-failed branches untested | **FAIL** — Critical 1 |
| REQ-7 probe + 3-attempt retry | Yes | D2, D3, D4, D5 | pass |
| REQ-8 Resume repairs on `ErrSessionExists` | Yes | none (inspection) | pass (see Minor 1) |
| REQ-9 reconcile converges with the socket | Partly | D8, D9, D10, D11 | **FAIL** — Major 1 (unknown-name reporting narrowed) |
| REQ-10 reconcile continues past a row failure | Yes | inspection | pass |
| REQ-11 per-session-id keyed lock | Yes | D19 (Resume only) | pass |
| REQ-12 shell registry per-id + tolerance + bounded tmux | Partly | none (inspection) | **FAIL** — Major 3 (terminal path / End+Remove unbounded) |
| REQ-13 no destructive side effect before success | Partly | D15 | **FAIL** — Major 2 (End's 500 path still closes the socket) |
| REQ-14 rollback on persist failure + `Remove` ordering | Yes | D16 | pass |
| REQ-15 idempotent kill on a not-alive Remove | Yes | inspection | pass (undermined by Critical 1) |
| REQ-16 server-reachability guard before believing a pane gone | Partly | D17 | pass for the sweep; `Nudge`/`End` excluded (Note 5) |
| REQ-17 action errors, `not_resumable` split, resume reason, reader memory | Partly | W2, W3, W4, E7 | **FAIL** — Critical 2 (`not_resumable` split missing) |
| Affected Files: atomic `writeSettings` | No | none | **FAIL** — Major 4 |

## Build & Tests

```
E2E tests:    pass — 355 passed (2.9m), exit 0   [make e2e, full suite]
Daemon tests: pass — all 21 packages ok          [make test]
Web tests:    pass — 37 files, 1582 tests        [npm test]
Daemon build: pass — go build ./... exit 0
Web build:    pass — npm run build exit 0
Lint:         pass — golangci-lint run, 0 issues
e2e-lint:     pass — "e2e-lint: clean"
contrast:     pass — instrument/dark/light, 43 pairs each, 0 failures
```

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| — | `gates.sh session-lifecycle --checks-only` | **no ```checks block in plan.md** — 0 lines run (plan defect, Minor 4 `[orchestrator]`); criteria verified by hand below |
| D1–D19 | `go test ./internal/...` | pass (all named tests green; see daemon-tests.md) |
| D18 | `make check` (lint + unit + `refs` + `check-kb`) | lint pass, unit pass, check-kb pass, **`refs` 18 missing — all `.claude/settings.local.json`**, the disclosed fresh-worktree artifact (verified: `make refs \| grep missing \| grep -v settings.local.json` is empty). Not a regression. |
| W1 | `make web-test` | pass |
| E8 | `make e2e` | pass (355/355) |
| KB | `make check-kb` | pass — 352 records, 23 features, 0 problems; `make gen-kb` leaves the tree clean (generated files fresh) |
| DOC | doc upkeep | **FAIL** — `TODO.md:268` #26 still `- [ ]` and not moved to `docs/history/todo-done.md`; the four out-of-scope backlog entries are not added; the four ADRs are still `proposed` and the `supersedes`/`superseded` flip for `lifecycle-ended-rows-swept-next-start` has not happened. All four are scheduled for Completion by the plan, so this is expected-at-this-point, not a defect — listed so the backstop acts on it. |

`docs/protocol.md`'s four anchor deltas **were** written (`efe52b7`) — but one of them documents
behaviour that does not exist (Critical 2).

## Reviewer-Verified Criteria

The plan has no `### Reviewer-Verified` section. Verified by hand instead:

| Item | Result | Evidence |
|------|--------|----------|
| impl agents never edited tests | pass | `git diff 33d482a..b4f2255 -- '*_test.go'` empty; `git show --stat db9c493` touches no `_test.go`/`spec.ts`. Only `212cd86` (orchestrator) touches tests — three mechanical `for i := 0; i < n` → `for range n` conversions, no assertion changed. |
| no assertion weakened | pass | `ce6a2c5` **strengthens** D15: replaces a fabricated tmux target (which REQ-6 turned into a success) with an injected `errKiller`, keeping a real tmux client behind the shell registry so "the shell survived" is a genuine `PaneExists` on a real socket. |
| E2E fixture plan honoured (per-test `daemon`, never `fileDaemon()`) | pass | E1 (`launch.spec.ts:1110`), E3 (`reconcile.spec.ts:156`), E5 (`actions.spec.ts:840`), E7 (`actions.spec.ts:899`) all destructure `daemon`; `make e2e-lint` clean. |
| no test launches a real `claude` | pass | new server tests use `claudeBin: "irrelevant-never-reached"`; E2E uses the stub. |
| no `any` in new web code | pass | `npm run build` (tsc strict) exit 0; new modules declare concrete types. |
| composition roots untouched | pass | `internal/server/server.go` and `web/src/main.ts` carry no diff. |
| no tmux vocabulary in new e2e/test oracles beyond helpers | pass | new specs use `daemon.createForeignTmuxSession`/`tmuxSessions`/`killTmuxWindow`/`tmuxPaneExists`, all pre-existing. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode`) | pass — no Claude-Code field name appears in the diff outside that package |
| 2 | No state from terminal output | pass — `capture-pane` untouched; no new pane-text reads |
| 3 | Hook handler non-blocking | pass — ingest path untouched |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — no bare `"tmux"` and no `resize-pane` anywhere in the diff |
| 5 | No payload logging | pass — new log lines carry ids and tmux session names only |
| 6 | No empty-gauge dishonesty | pass — no gauge touched |
| 7 | Identity on the tmux target | pass — reconcile now keys ownership on `muster-<id>`, strengthening this |
| 8 | No `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` outside canary/probes | pass |

## Manual Verification

Drove the real dashboard against a real daemon (Playwright, throwaway spec written into
`web/e2e/`, run, then deleted — `git status --porcelain` confirmed clean afterwards).

- **Action-error surface (REQ-17/W2).** Forced a genuine `500 end_failed` envelope back from
  `POST /api/sessions/{id}/end` and clicked End from the mainhead. `#action-error` became
  visible: `role="alert"`, box `x=0 y=59.3 w=1280 h=32` (full width, directly under `#banner`),
  text = the envelope's `message`, computed `color: rgb(243,183,183)` on
  `background: rgb(58,30,30)` in the mono stack — the banner/danger token family, no literal.
  Screenshot inspected: legible, correctly placed, does not disturb the rail/main split.
  Un-routing and ending again cleared it (`toBeHidden` passed). Confirms W2 end to end, not
  just at the `renderActionError` unit level.
- **Resume reason (REQ-17/W3).** On the dead surface the Resume button is `disabled=true` with
  `title="Can't resume — this session never started a Claude conversation."`; `aria-label` and
  `aria-description` are both `null`.
- **Does the `title` actually reach a user on a *disabled* button?** I expected this to fail
  (browsers commonly suppress pointer events on disabled form controls, which would make the
  tooltip never appear and defeat the point of REQ-17). **Measured, not assumed**: attached
  `mouseover`/`mousemove` listeners and moved the real mouse over the control — **3 events
  reached the disabled Resume, identical to the count on the enabled Remove control**, with
  `pointer-events: auto`. The mechanism works; no finding.
- **Not verified in the browser**: Critical 1's unreachable-socket path (no daemon flag lets
  E2E substitute a broken tmux — see test-specs.md's E6 reasoning); measured directly against
  the `tmux` CLI instead, below.

## Issues

### Critical

1. **[orchestrator:decision]** `KillSession`'s `PaneExists` verification does not distinguish
   "tmux answered and the session is gone" from "tmux could not answer" — so an unreachable
   socket still reads as a **successful kill**, and `removeLocked` deletes a row whose pane is
   still running. This is the exact orphan class the plan exists to close, it is a **regression
   from `main`**, and REQ-6 / `kb:adr/actions-kill-is-idempotent` both state the opposite.
   — `internal/tmux/tmux.go:349-360` (`KillSession`), `internal/tmux/tmux.go:310-322`
   (`PaneExists`), `internal/session/manager.go:1110-1120` (`removeLocked`'s REQ-15 branch).

   Measured against the real `tmux` CLI, with the session **genuinely still running**:

   ```
   $ tmux -S /tmp/rvs40260 new-session -d -s muster-5 'sleep 60'   # exit 0
   $ tmux -S /tmp/rvs40260 list-sessions -F '#{session_name}'
   muster-5
   $ chmod 000 /tmp/rvs40260
   $ tmux -S /tmp/rvs40260 kill-session -t muster-5
   error connecting to /tmp/rvs40260 (Permission denied)
   kill-session exit=1
   $ tmux -S /tmp/rvs40260 list-panes -t muster-5
   error connecting to /tmp/rvs40260 (Permission denied)
   list-panes exit=1
   $ chmod 700 /tmp/rvs40260 && tmux -S /tmp/rvs40260 list-sessions -F '#{session_name}'
   muster-5          # still alive the whole time
   ```

   Both commands exit non-zero with an `*exec.ExitError`. `PaneExists` collapses **every**
   `ExitError` to `(false, nil)` (`tmux.go:317-320`, pre-existing and unchanged), so
   `KillSession` reads "gone", returns `nil`, and `Remove` deletes the row. On `main`
   `KillSession` wrapped every non-zero exit as an error and `Remove` correctly refused.
   The same collapse applies to a socket with no server at all (measured: `error connecting …
   (No such file or directory)`, exit 1 from both commands) — which is the *example the ADR
   names* as the reason option D was chosen over option C:

   > "C was implemented first and was wrong: `kill-session` also exits non-zero for reasons
   > unrelated to the session existing — **a socket tmux cannot reach** — so C would let Remove
   > delete a row whose pane is still running"

   D does not distinguish that case either. REQ-6's "Any other failure (tmux missing, socket
   unreadable, context deadline) still returns an error" is false for *socket unreadable*.
   (Context deadline **is** handled correctly: `exec.Cmd.Start` returns `ctx.Err()`, not an
   `ExitError`, once the context is already done, so `checkErr != nil` fires.)

   Routing this as a decision rather than to an impl agent because the two honest remedies
   trade against each other and against REQ-6's own "no stderr matching" rule, and an agent
   told to "fix it" would pick one inside a fix wave with no authority
   (kb:lesson/decision-made-inside-a-fix-wave):

   - **Option A — close the gap.** Distinguish a connection failure from a session-absent
     failure. tmux exits 1 for both, so the only available signal is the stderr fragment
     `error connecting` (stable in a way `duplicate session:` was judged not to be, but still
     stderr matching, which REQ-6 explicitly ruled out). Cost: one more stderr match inside
     `internal/tmux`; benefit: `Remove` can no longer delete a live session's row on an
     unreadable socket, and REQ-6's text becomes true.
   - **Option B — accept the gap, fix the claims.** Leave `KillSession` as shipped, and correct
     REQ-6 and `kb:adr/actions-kill-is-idempotent` to say what the code does: an `ExitError`
     verified against `PaneExists` distinguishes a *live* session from a gone one only while
     tmux is reachable; an unreachable socket is indistinguishable from "gone" and is treated
     as a successful kill, consistent with `PaneExists` and `ListSessions` tree-wide
     (kb:adr/lifecycle-liveness-from-pane-existence). Cost: the residual orphan window stays
     and must be recorded; benefit: no new stderr coupling, and the records stop being false.

   Either way, `kb:adr/actions-kill-is-idempotent` must not ship `accepted` with its current
   Decision paragraph.

2. **[daemon-impl]** REQ-17's `not_resumable` split was never implemented, and
   `docs/protocol.md` now asserts that it was — the protocol contract is broken.
   — `internal/server/sessions.go:319-321`.

   ```go
   if sess.Alive || sess.ClaudeSessionID == "" {
       return nil, notResumable("session is alive or has no resumable claude session id")
   }
   ```

   Byte-identical to `main` (`git diff main...HEAD -- internal/server/sessions.go | grep -c
   not_resumable` → `0`). Meanwhile `docs/protocol.md` (kb:anchor/sessions.resume, added by
   `efe52b7`) now reads:

   > `409 not_resumable` — still alive, or `claudeSessionId` null; **the message names which**,
   > since only one of the two is ever recoverable

   and the plan's own Protocol Contract section says the same. The UI therefore still cannot
   tell the two causes apart from a 409 — which is the stated reason the split exists
   ("so the UI can say which"). W3's disabled-control reason is hardcoded client-side and does
   not cover this.

   **Fix**: split the message at `sessions.go:319` into its two causes (code stays
   `not_resumable`). Tagged `[daemon-impl]` because it is daemon code; note that the plan's
   Affected Files table assigned REQ-17 only to `web/` files, which is how this clause ended up
   with no owner — web-implementation.md's Decisions section correctly records it as out of its
   scope.

### Major

1. **[daemon-impl]** Reconcile no longer reports or warn-logs a `muster-`-prefixed tmux session
   whose suffix is not a bare integer — `muster-99999-foreign`, the plan's own Edge Case 22,
   is now silently ignored. — `internal/session/manager.go:435-438`
   (`classifyTmuxNames`: `id, ok := tmux.ParseSessionName(name); if !ok { continue }`).

   REQ-9 says such a name is "reported in `UnknownSessions` and warn-logged **exactly as
   today**"; "today" (`main`, `manager.go:396`) was `!strings.HasPrefix(name, "muster-")`, i.e.
   *any* muster-prefixed name. `kb:adr/lifecycle-reconcile-converges-with-the-socket` likewise
   states "unknown sessions are still reported, never adopted, never killed" — false as shipped.

   Measured with two real daemons on the same socket contents
   (`muster-99999-foreign`, `muster-888888`, `muster-777-shell`):

   ```
   === branch (plan/session-lifecycle) ===
   WRN unknown muster tmux session on socket; not adopted tmux_session=muster-888888
   INF reconciled sessions kept_alive=0 marked_ended=0 shells_killed=1 swept=0
                                                        # muster-99999-foreign: silent

   === main ===
   WRN unknown muster tmux session on socket; not adopted tmux_session=muster-888888
   WRN unknown muster tmux session on socket; not adopted tmux_session=muster-99999-foreign
   INF reconciled sessions kept_alive=0 marked_ended=0 shells_killed=1 swept=0
   ```

   E2 (`reconcile.spec.ts:195`) passed over this because it asserts only that the session is
   still present and that no row was created — it never asserted the report or the log, which
   is why the regression reached review green.

   **Fix**: in `classifyTmuxNames`, a `muster-`-prefixed name that matches neither shape still
   goes into `unknownNames` (it contributes no id, so it cannot raise the watermark — that is
   fine and matches `main`).

2. **[daemon-impl]** REQ-13 says "A failed End or Remove leaves terminal sockets and the shell
   as they were", but `handleEndSession` deliberately closes the terminal socket on the
   `500 end_failed` path. — `internal/server/sessions.go:492-495`.

   ```go
   default:
       f.log.Error()...
       f.terminals.closeSession(id)          // ← REQ-13 says this must not happen
       writeJSONError(w, http.StatusInternalServerError, "end_failed", endErr.Error())
   ```

   The code comment justifies it as "End's own gates already passed by the time the kill was
   attempted", but a genuine kill failure means the pane is *still running* and the row is
   *still alive* — so the user is left with the 4001 dead-surface overlay over a live session,
   which is precisely the defect the plan's Overview cites ("the terminal socket was already
   closed before validation, so the user sees a dead surface over an error"). `Remove`'s
   equivalent path was moved correctly; End's was not.

   **Fix**: drop `closeSession(id)` from the `default` branch — the socket is closed on success
   only. If that ordering is genuinely wanted, it needs a `deviation:` line and an ADR, not a
   comment.

3. **[daemon-impl]** REQ-12's timeout clause is implemented for the shell registry only. The
   terminal path and — more importantly — End/Remove's *own* tmux calls are unbounded, and the
   new per-id lock turns a wedged tmux into a permanent per-session wedge rather than one hung
   request. — `internal/server/sessions.go:484`, `:519`; `internal/termbridge/termbridge.go:49`,
   `:80`; `internal/session/manager.go:1004` (`endLocked`).

   REQ-12: "Every tmux invocation the shell **and terminal** paths make is bounded by a timeout
   so a wedged tmux cannot hang End/Remove." Verified:

   - `shells.go` — bounded, `shellTmuxTimeout = 5s` on all three calls. Done.
   - `termbridge.Attach` / `Bridge.Resize` — `grep -n 'WithTimeout' internal/termbridge/termbridge.go`
     returns nothing. Unbounded.
   - `manager.End`/`Remove` run under `context.WithoutCancel(r.Context())`
     (`sessions.go:484`, `:519` — pre-existing), so their `CapturePane`/`KillSession`/
     `PaneExists` calls have **no deadline and no cancellation**, and `cmd.WaitDelay` never
     starts because the context never fires.

   Before REQ-11 a wedged tmux hung one request. Now `End` holds `LockSession(id)` across that
   unbounded call, so every later End/Resume/Remove for that id blocks forever behind it — the
   hang is upgraded from per-request to per-session-permanent. That interaction is what makes
   this worth fixing rather than noting.

   **Fix**: bound the tmux I/O inside `endLocked`/`removeLocked` (and `termbridge`) the way
   `shells.go` does, so the per-id lock is always released in bounded time.

4. **[daemon-impl]** `writeSettings` was not made atomic. — `internal/server/sessions.go:389`
   (`os.WriteFile(path, merged, 0o600)` — unchanged from `main`; only its *call site* moved).

   The plan's Affected Files row for this file names "atomic `writeSettings` (temp +
   `os.Rename`)" as a change this plan makes, and
   `kb:adr/actions-serialized-per-session`'s Consequences says outright: "`writeSettings` still
   needs to be atomic in its own right, because a per-id lock does not exclude a `claude`
   process reading the file." The per-id lock only serialises the *same* id — two sessions
   launching into the same directory still race on the same `settings.local.json`, and the
   plan's own Overview says a torn write there "refuses every future launch in that directory
   by design".

   **Fix**: write to a sibling temp file and `os.Rename` it into place.

### Minor

1. **[daemon-impl]** Resume's REQ-8 repair drops `repairErr` entirely — no log line, and the
   caller gets a generic message. — `internal/server/sessions.go:341-348`. The launcher holds
   `l.log` and uses it two paths above (the `MaxSessionID` probe warn). Add
   `l.log.Warn().Err(repairErr)...` so a repair that could not confirm a live pane is
   diagnosable; today it is invisible.

2. **[daemon-impl]** Two new hand-rolled `"muster-" + strconv.FormatInt(id, 10)` literals in
   `internal/server` — `sessions.go:269` and `sessions.go:347`. `main` has **zero** occurrences
   of that literal outside `internal/tmux` and `internal/session`
   (`grep -rn '"muster-"' --include='*.go' internal/ cmd/ | grep -v _test.go`), and
   `internal/tmux` already exports `ShellSessionName(id)` as the precedent for the shell
   variant. Export the bare-name mirror (`tmux.SessionName(id)`) and call it from both sites,
   so the convention stays spelled in one package rather than three. This is the same boundary
   discipline REQ-4 invokes for the stderr match.

3. **[web-impl]** `forget`'s doc comment justifies itself with a scenario REQ-2 of this very
   plan eliminates. — `web/src/reader/memory.ts:59-61`:

   > "so a future session reusing this id doesn't inherit a stranger's open-file/acknowledged-
   > writes state"

   Ids are now never reissued within a data dir. The *behaviour* is still right (stale reader
   memory should not outlive its session, and localStorage should not grow without bound) —
   only the stated reason is wrong. Reword to that.

4. **[orchestrator]** `plans/session-lifecycle/plan.md` has no ```checks block —
   `gates.sh session-lifecycle --checks-only` reports "no ```checks block … baseline only,
   0 lines". Every D*/W*/E* criterion had to be verified by hand. Non-blocking (plan defect).

### Notes

1. **[note]** **The per-id lock cannot deadlock.** Verified every call site: nothing acquires a
   per-id mutex while holding `m.mu` (`LockSession` releases `m.mu` before `l.Lock()`), so the
   order is always `l` → `m.mu` and never the reverse. `Remove` → `removeLocked` → `endLocked`
   avoids re-entering `End`. `EndAll` snapshots ids under `m.mu`, releases it, then calls
   `End`. `markEnded`/`checkOneLiveness`/`Nudge` take no per-id lock at all.

2. **[note]** **It is held across tmux I/O — correctly.** The plan's Implementation Notes
   sentence "It must never be held across the tmux I/O that `m.mu` already forbids — take the
   per-id lock around the action" is self-contradictory read literally.
   `kb:adr/actions-serialized-per-session` states the coherent rule ("`Manager.mu` is still
   released before every tmux call") and the implementation matches the ADR. No change wanted;
   flagged because the lead asked, and because the ADR — not the plan sentence — is what
   survives.

3. **[note]** **Lock entries are reclaimed only on a successful `Remove`** (`manager.go:1093`)
   and in `shellRegistry.Kill`. Rows swept by reconcile, sessions that merely End, and failed
   Removes leave their entry behind, so `idLocks` grows with sessions-created-per-daemon-run,
   not with live sessions. Bounded and tiny for a single-user tool; the ADR's "entries
   reclaimed on Remove" is accurate as written. Separately, deleting the map entry while
   another goroutine is blocked on that same mutex means a later caller for the same id gets a
   *fresh* mutex — transiently breaking mutual exclusion for an id that has just been removed.
   Both registries share this shape. Not worth code today; worth remembering if ids ever
   become reusable.

4. **[note]** `Store.BumpIDWatermark` is a read-modify-write outside a transaction, unlike
   `InsertSession`'s watermark bump. Only reconcile calls it, synchronously at startup before
   anything is served, so nothing can race it today.

5. **[note]** REQ-16's reachability guard lives in `checkLiveness` (the sweep), not
   `checkOneLiveness` as the REQ words it, so `Nudge` and `End`'s post-kill check still trust a
   `PaneExists` miss on an unreachable server. daemon-implementation.md records the reasoning
   (avoiding a `ListSessions` per session per tick, which the orchestrator explicitly warned
   against). The REQ's actual harm — N simultaneous deaths in one tick — is closed. Accepted
   trade-off; no change requested.

6. **[note]** The action-error surface now shows raw tmux stderr to the user: the measured
   render read `tmux kill-session "muster-1": exit status 1`, because `end_failed` passes
   `endErr.Error()` straight into the envelope. The plan lists "raw tmux stderr echoed into
   HTTP error bodies" as explicitly out of scope, so this is a known consequence of REQ-17
   making the body visible rather than a new defect — but it is now user-facing, which it was
   not before.

7. **[note]** The `writeSettings` reorder is **not** a production nil-`paneSpawner` trap:
   `sessionLauncher.tmux` is always a real `*tmux.Client` in the composition root, and the nil
   exists only in one frozen test. The reorder is independently justified (a corrupt settings
   file is now caught with no row to roll back), REQ-7's "probe before `CreateSession`" still
   holds, and no REQ or Edge Case pins the old order. The only thing worth flagging is that
   daemon-implementation.md's Decisions entry leads with the test fixture as the reason — the
   right justification is the rollback one, which it gives second.

8. **[note]** `Manager.RepairOwnedSession` (REQ-8) revives a row without clearing
   `LastSnapshot`/`LastSnapshotAt`, unlike `RecordResume` which does. The adopted pane is the
   row's own still-running pane, so the stale capture is arguably still truthful, and the UI
   only renders snapshots for dead sessions. No change requested; recorded because the two
   revive paths now differ.

9. **[note]** The three gaps the lead disclosed are confirmed as stated and are not counted
   against the verdict: REQ-12 and `KillSession`'s still-there/check-failed branches rest on
   inspection (and Critical 1 is what that inspection missed); E6 is genuinely unreachable
   black-box — I reproduced the reasoning against the real `tmux` CLI above; REQ-11's Launch
   arm is uncovered but uncontendable by construction. The `-race` failure of
   `TestIngestRouting_StragglerFromBeforeAClearNeverMovesTranscriptOrPlan` is pre-existing and
   `make test` does not use `-race`.

---

# Review cycle 2 — fix wave 1

**Reviewed at**: `76574c0` (tip moved past the `d7b1f27` named in the handoff — `76574c0`
landed mid-review and closes cycle 1's Minor 3)
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=session-lifecycle role=review features=lifecycle,actions,launch,surfaces,ingest -->`

Not a Delta re-review — cycle 1 carried Criticals and Majors, so §1–§7 ran in full.

## Build & Tests

```
E2E tests:    pass — 355 passed (1.9m), exit 0   [make e2e, full suite, run by me at d7b1f27]
Daemon tests: pass — all packages ok             [make test]
Web tests:    pass — 37 files, 1582 tests        [re-run at 76574c0]
Daemon build: pass · Web build: pass
Lint:         pass — 0 issues
check-kb:     pass — 352 records, 0 problems; gen-kb leaves the tree clean
refs:         18 missing, all `.claude/settings.local.json` (verified: filtering that path
              out leaves no lines). Unchanged, not a regression.
contrast:     pass — 43 pairs × 3 themes, 0 failures
e2e-lint:     clean
```

`make e2e` was run at `d7b1f27`; the only later commit, `76574c0`, changes one doc comment
in `web/src/reader/memory.ts` and cannot alter behaviour. Web build and Vitest were re-run
at `76574c0`.

## Delta

| Cycle 1 finding | Status | Verified how |
|---|---|---|
| Critical 1 `[orchestrator:decision]` unreachable socket reads as a successful kill | **partly closed — re-opened as cycle 2 Critical 1** | approach verified sound; predicate is one errno short (measured below) |
| Critical 2 `[daemon-impl]` `not_resumable` split | **closed** | `sessions.go:319-327` now returns two distinct messages; D21 asserts they differ and that only the alive one says "alive" |
| Major 1 `[daemon-impl]` unparseable Muster-shaped names unreported | **closed** | `classifyTmuxNames` re-adds the `strings.HasPrefix(name, "muster-")` arm; D22 asserts report + warn log + no row. Shell names still short-circuit first, so they are still never reported — matches `main`. |
| Major 2 `[daemon-impl]` End's 500 path closed the terminal socket | **closed** | `closeSession(id)` gone from the `default` branch; D23 asserts the registry holds the *same* `*terminalConn` after a forced 500 |
| Major 3 `[daemon-impl]` unbounded tmux under the per-id lock | **closed at the sites I named**; tail remains | `endRemoveTmuxTimeout` on `CapturePane`/`KillSession`/`checkOneLiveness` in `endLocked`, on `removeLocked`'s kill, and `resizeTmuxTimeout` on `Bridge.Resize`. `Attach` left ctx-bound with a correct justification (attach-session is meant to live for the connection). See cycle 2 Minor 1 for the tail. |
| Major 4 `[daemon-impl]` non-atomic `writeSettings` | **closed** | `os.CreateTemp` in the same directory → write → close → chmod → `os.Rename`, with `defer os.Remove` covering every error path |
| Minor 1 `[daemon-impl]` `repairErr` dropped unlogged | **closed** | `l.log.Warn().Err(repairErr)…` added at `sessions.go:355` |
| Minor 2 `[daemon-impl]` hand-rolled `"muster-"` in `internal/server` | **closed** | `tmux.SessionName(id)` added beside `ShellSessionName`; `grep -rn '"muster-"' internal/server/ \| grep -v _test.go` is now empty |
| Minor 3 `[web-impl]` `forget()`'s comment | **closed** (`76574c0`) | rewritten to cite `kb:adr/lifecycle-session-ids-monotonic-never-reused` and give the correct reason |
| Minor 4 `[orchestrator]` no ```checks block | open | `gates.sh --checks-only` still reports 0 lines |

Boundary held again: `4682a53` authored D20–D23 red, `6d0ccd8` touched no test file
(`git show --stat 6d0ccd8` lists no `_test.go`), and `d7b1f27`'s two `assert.Error` →
`require.Error` conversions change no assertion — confirmed from the diff, both are on
`killErr`/`existsErr` with identical messages, and the chmod-restore `t.Cleanup` is
registered before them so an early abort still reaps the server. Disclosure confirmed.

## The narrowing you asked me to scrutinise

**`daemon-impl` was right, and for the right reason.** Fixing `PaneExists` rather than
`KillSession` is also a better answer than either option I offered — it removes the
one-value-means-two-things defect at the source instead of papering over it at one caller,
and it is what makes REQ-16's guard and the liveness poll honest rather than accidentally
correct. I have nothing to add to that part.

**The broad-match claim is substantiated.** I widened the predicate to bare
`strings.Contains(err.Error(), "error connecting to")` in a scratch copy and ran
`go test ./internal/... -count=1`:

```
--- FAIL: TestHandleRemoveSession_DeadSessionSucceeds
--- FAIL: TestHandleRemoveSession_FailingEndLeavesTheShellRunningAndTheRowPresent
--- FAIL: TestHandleShellTerminal_ShellDeathNeverNudgesTheParentsLiveness
--- FAIL: TestShellRegistry_EnsurePaneEnvironmentNeverCarriesMusterSession
--- FAIL: TestShellRegistry_EnsureSpawnsATmuxSessionNamedMusterIDShell
--- FAIL: TestShellRegistry_KillRemovesOnlyItsOwnSession
--- FAIL: TestShellRegistry_RespawnsAfterExternalKillWithNoMusterSession
```

Seven, not six, and every one is a `PaneExists` check against a socket with no server yet.
So excluding `No such file or directory` is load-bearing, exactly as the comment says.
(`internal/tmux/tmux.go` restored from a pre-edit copy; `git status --porcelain` clean.)

**`Connection refused` and the stale-socket case do NOT belong.** Measured on the installed
tmux 3.7b — a real AF_UNIX socket file bound and then closed, so nothing is listening:

```
$ ls -l /tmp/.../stale
srwxr-xr-x  1 damian  wheel  0 … /tmp/.../stale
$ tmux -S /tmp/.../stale list-panes -t muster-1
no server running on /tmp/.../stale          exit=1
```

tmux converts `ECONNREFUSED` into `no server running on <path>` — a different message that
never contains `error connecting to`, so it cannot match either way. And the reading is
correct on the merits: a live tmux server is by definition listening on its socket, so
`ECONNREFUSED` means no server, hence no sessions. The same holds for the two other shapes
I could produce — a plain file or a directory at the socket path both give
`error connecting to <path> (Socket operation on non-socket)`, which likewise means no
server is there. All three are rightly excluded. That is your least-sure residual answered:
no change needed.

**But the set is one errno short, and it is reachable.** See cycle 2 Critical 1.

## Issues

### Critical

1. **[daemon-impl]** `isConnectionFailure` matches only `EACCES`'s wording
   (`Permission denied`). `EPERM` — which macOS produces for a sandbox/MAC-denied
   `connect()` on a unix socket — renders as `Operation not permitted`, is not matched, and
   therefore still collapses to "gone". Cycle 1's Critical is reachable unchanged through it:
   `PaneExists` returns `(false, nil)`, `KillSession` reports success, and `removeLocked`
   deletes a row whose pane is still running. — `internal/tmux/tmux.go:368-370`.

   Measured, with the tmux server **alive throughout**:

   ```
   $ tmux -S /tmp/rv592291/sock new-session -d -s muster-9 'sleep 90'
   server up, session muster-9 running

   $ cat deny.sb
   (version 1)
   (allow default)
   (deny network*)

   $ sandbox-exec -f deny.sb tmux -S /tmp/rv592291/sock list-panes -t muster-9
   exit=1
   error connecting to /tmp/rv592291/sock (Operation not permitted)

   $ sandbox-exec -f deny.sb tmux -S /tmp/rv592291/sock kill-session -t muster-9
   exit=1
   error connecting to /tmp/rv592291/sock (Operation not permitted)

   $ tmux -S /tmp/rv592291/sock list-sessions -F '#{session_name}'
   muster-9                       # alive the whole time
   ```

   Exit 1 ⇒ `*exec.ExitError`; the string contains `error connecting to` but not
   `Permission denied`, so the predicate returns false. `EACCES` and `EPERM` are distinct
   errnos with distinct `strerror` text (`Permission denied` / `Operation not permitted`,
   confirmed via `os.strerror`), so one match does not imply the other.

   This is not an exotic configuration for this codebase: macOS sandboxing, MDM profiles
   and any `sandbox-exec`-wrapped parent produce exactly this, and Muster is a macOS-only
   tool that routinely runs under Claude Code.

   **Fix** (no decision needed this time — the code comment asked for a measured repro and
   a test before widening, and the repro above is that):

   ```go
   msg := err.Error()
   if !strings.Contains(msg, "error connecting to") {
       return false
   }
   return strings.Contains(msg, "Permission denied") ||
       strings.Contains(msg, "Operation not permitted")
   ```

   I applied exactly this in a scratch copy and ran `go test ./internal/... -count=1`:
   **no FAIL lines, whole suite green** — it costs nothing, because no existing test induces
   `EPERM`. It also stays inside the rule the ADR now states: connection-failure wording
   only, matched only to escalate. `internal/tmux/tmux.go` was restored from a pre-edit copy
   afterwards; `git status --porcelain` clean.

   D20 should gain the `EPERM` case. `sandbox-exec` is available on every macOS host and the
   repro above is deterministic, so this is testable rather than inspection-only — but if
   sandboxing in CI proves awkward, a `chmod 000` twin with the `EPERM` string asserted at
   the `isConnectionFailure` level is enough, since the predicate is pure.

   `kb:adr/actions-kill-is-idempotent` must not ship `accepted` until this is settled: its
   Decision paragraph names `(Permission denied)` as *the* shape meaning "a server may be
   live, we cannot ask", and that is incomplete.

### Major

1. **[daemon-impl]** `ListSessions` still collapses the very failure `PaneExists` now
   surfaces — and it is the input to the only path in the codebase that **deletes** rows.
   — `internal/tmux/tmux.go:411-419`; consumed at `internal/session/manager.go:342`
   (`Reconcile`) and `:1303` (REQ-16's guard).

   ```go
   func (c *Client) ListSessions(ctx context.Context) ([]string, error) {
       out, err := c.run(ctx, "list-sessions", "-F", "#{session_name}")
       if err != nil {
           var exitErr *exec.ExitError
           if errors.As(err, &exitErr) {
               return nil, nil        // ← a Permission-denied connection failure lands here
           }
   ```

   So on an unreachable socket `Reconcile` receives an *empty snapshot*, not an error. It
   does not take the fallback branch; it runs `classifySessionsByOwnership` against zero
   names, concludes no row owns a live `muster-<id>`, marks every `alive=1` row ended and
   **deletes every `alive=0` row** — while the panes run on. The startup preflight does not
   protect against this: `internal/tmux/preflight.go` only runs `tmux -V` and never contacts
   the socket, so an unreadable socket passes it.

   This is not a regression (on `main` the per-row `PaneExists` collapsed identically and the
   `alive=0` sweep never checked at all), which is why it is Major and not Critical. But it
   is the same bug class your own fix rationale names, left at the highest-consequence call
   site, and it is what makes REQ-16's guard only accidentally correct today — the guard
   passes, and the poll is saved downstream by `PaneExists`'s new error rather than by the
   guard itself.

   **Fix**, and one trap in it: reuse `isConnectionFailure` in `ListSessions` so it returns
   an error. Then do **not** let `Reconcile` fall through to `classifySessionsLegacy` on that
   error — `classifySessions` sweeps every `!r.alive` row unconditionally with no pane check
   (`manager.go:650-653`), which is R3, the exact behaviour REQ-9 replaced, so the fallback
   would delete the same rows anyway. Reconcile should log and act on **nothing** when it
   cannot enumerate the socket; the legacy fallback should stay reserved for its other
   trigger, a `Manager` built with no `SessionKiller`.

### Minor

1. **[daemon-impl]** The per-id lock is still held across unbounded tmux I/O on the
   **Launch and Resume** arms, so REQ-12's purpose clause ("a wedged tmux cannot hang
   End/Remove") is still defeated — just from a different entry point.
   `sessionLauncher.Resume` holds `LockSession(id)` across `l.tmux.NewSession`
   (`sessions.go:349`) and `manager.RepairOwnedSession` → `ResolveSessionTarget`, and
   `spawnAndRecordLaunch` holds it across `NewSession`/`KillWindow` — all under
   `context.WithoutCancel`, so no deadline and no cancellation, and `cmd.WaitDelay` never
   starts. A wedge there holds that id's lock forever and blocks every later End/Remove for
   it, which is precisely what `endRemoveTmuxTimeout` was added to prevent three lines away.

   Minor rather than Major because these are sites I failed to name in cycle 1 — the fix did
   everything I asked — and because `tmux new-session -d` returns without waiting on the
   spawned command, so the window is narrower than End/Remove's. Same remedy: wrap them in
   `context.WithTimeout(ctx, endRemoveTmuxTimeout)`.

2. **[orchestrator]** (carried) `plans/session-lifecycle/plan.md` still has no ```checks
   block; `gates.sh session-lifecycle --checks-only` reports 0 lines. Non-blocking.

### Notes

1. **[note]** `writeSettings` does not `fsync` the temp file before `os.Rename`. Rename is
   atomic against a concurrent *reader*, which is what Major 4 and
   `kb:adr/actions-serialized-per-session` asked for, so this is complete as specified — but
   on a power loss the renamed file can still be empty on some filesystems. Recorded, no
   change requested.

2. **[note]** The temp file is created as `.claude/.settings.local.json.tmp-*`. Every error
   path removes it via `defer`, so it only survives a hard kill mid-write — but if it does,
   it sits in the user's repo and is unlikely to be covered by a `.gitignore` entry written
   for `settings.local.json` exactly. Cheap to pre-empt by widening that ignore line; not
   worth a wave on its own.

3. **[note]** `classifyTmuxNames` now reports a muster-prefixed unparseable name as unknown
   but deliberately does not let it raise the id watermark (it yields no id). That matches
   `main` and is right — but it means `muster-99999-foreign` cannot reserve id 99999. Nothing
   depends on it: such a name can never collide with a `muster-<id>` spawn. Recorded because
   the asymmetry is easy to misread as an oversight later.

4. **[note]** Reconcile's `KeptAlive` counter now counts revived `alive=0` rows too, so the
   startup log line's meaning shifted slightly from "rows that were already alive and still
   are". Nothing consumes it but the log. No change requested.

## Verdict

**needs-changes** — one Critical and one Major, both `[daemon-impl]`, plus one agent-tagged
Minor. Everything else from cycle 1 is verified closed, the full E2E suite and every other
gate are green, and the approach taken on Critical 1 was better than either option I put up.

---

# Review cycle 3 — fix wave 2

**Reviewed at**: `e50b469`
**Verdict**: **approved**
**Pack**: `<!-- kb:pack plan=session-lifecycle role=review features=lifecycle,actions,launch,surfaces,ingest -->`

## Build & Tests

```
E2E tests:    pass — 355 passed (1.9m), exit 0   [make e2e, full suite, run by me]
Daemon tests: pass — go build ./... + make test, no FAIL lines
Web tests:    pass — 37 files, 1582 tests · Web build: pass
Lint:         pass — 0 issues
check-kb:     pass — 352 records, 0 problems; gen-kb leaves the tree clean
refs:         18 missing, all `.claude/settings.local.json` (filtering that path leaves
              no lines). Unchanged.
contrast:     pass — 43 pairs × 3 themes, 0 failures · e2e-lint: clean
```

## Delta

| Cycle 2 finding | Status | Verified how |
|---|---|---|
| Critical `[daemon-impl]` EPERM unmatched | **closed** | `isConnectionFailure` now `Permission denied \|\| Operation not permitted`, both gated on `error connecting to`; D24 pins both positives and the three measured negatives |
| Major `[daemon-impl]` `ListSessions` collapse | **closed** | `ListSessions` calls `isConnectionFailure` before its `(nil, nil)` collapse; D25 asserts an error *and* an empty name list against a real chmod-000 socket with a live session behind it |
| Major `[daemon-impl]` Reconcile acting blind | **closed** | the `ListSessions`-error branch logs and returns an empty report; D26 asserts the alive row is not ended **and** the not-alive row is not deleted, in memory and in the store |
| Minor `[daemon-impl]` lock over unbounded tmux I/O | **closed** | `launchTmuxTimeout` on `spawnAndRecordLaunch`'s and `Resume`'s `NewSession`/`KillWindow`; `endRemoveTmuxTimeout` extended to `RepairOwnedSession`'s `ResolveSessionTarget` |
| Note `[note]` no fsync before rename | closed (volunteered) | `tmp.Sync()` before `Close`/`Rename` |
| Minor `[orchestrator]` no ```checks block | open, non-blocking | still 0 lines from `gates.sh --checks-only` |

Boundary held: `git show --stat 49e4ba9` lists no `_test.go`; `e50b469`'s only test change
is D25's `assert.Error` → `require.Error`, verbatim as disclosed, same message, same
subject. Disclosure confirmed.

## The `sessionKiller == nil` judgement you asked me to check

**The impl agent was right, and the trap is structurally unreachable in production** — not
merely unlikely.

```
$ grep -rn 'session.NewManager' --include='*.go' . | grep -v _test.go
internal/server/server.go:152:	s.manager = session.NewManager(session.Config{
```

That is the only `NewManager` outside tests, and it wires `SessionKiller: tmuxClient`
where `tmuxClient := tmux.New(cfg.TmuxSocket)` (`server.go:135`). `tmux.New` returns
`&Client{…}` unconditionally — it cannot yield nil, and nothing between the two lines can
replace it. So `classifySessions`, and with it the unconditional `!alive` sweep, can only
run under a `Manager` built by a test. Keeping it for that case is correct and is exactly
the boundary I drew in cycle 2.

## Your two challenges

### 1. Is `(Permission denied)` + `(Operation not permitted)` the complete set?

**Complete for every shape I could actually induce**, which is now seven distinct ones.
Measured against the installed tmux 3.7b:

| Induced condition | tmux stderr | Matched? | Correct? |
|---|---|---|---|
| socket chmod 000, server alive (EACCES) | `error connecting to <p> (Permission denied)` | **yes** | yes |
| parent dir chmod 000, server alive (EACCES) | `error connecting to <p> (Permission denied)` | **yes** | yes |
| `sandbox-exec` deny network, server alive (EPERM) | `error connecting to <p> (Operation not permitted)` | **yes** | yes |
| no socket file / dangling symlink (ENOENT) | `error connecting to <p> (No such file or directory)` | no | yes — no server |
| plain file or directory at the path (ENOTSOCK) | `error connecting to <p> (Socket operation on non-socket)` | no | yes — no server |
| symlink loop at the path (ELOOP) | `error connecting to <p> (Too many levels of symbolic links)` | no | yes — no server |
| real socket, server exited (ECONNREFUSED) | `no server running on <p>` | no | yes — no server |

The two new ones this cycle (ELOOP, dangling symlink) both fall on the correct side without
any change.

I also tried to reach the one theoretically-live-but-unreachable case left, a saturated
listen backlog: I bound a unix socket with `listen(0)` and connected clients until it
refused. macOS accepted **128** pending connections and then *blocked* the 129th rather
than returning `EAGAIN`. So backlog saturation does not produce a connection-failure
string at all — it produces a **hang**, which is the bounded contexts' department, not the
predicate's. `ENOBUFS`/`ENOMEM` under memory exhaustion remain theoretical; I could not
induce them, and I am not going to recommend widening the match on a guess — the comment's
own standard.

The design also fails in the safe direction: an unmatched connection failure degrades to
the pre-fix reading ("gone"), never to a false "unreachable" that would break ordinary End.
I would land this set as it stands.

### 2. Does the fixed timeout abort a slow-but-healthy launch?

**No — and it would be harmless if it did.** Timed the worst realistic case, a *cold*
server (server start + `new-session` + all eleven `serverOptions`, all inside the one
bounded call), ten runs, taken while `make e2e` was loading the machine:

```
0.16 0.17 0.17 0.16 0.13 0.22 0.22 0.18 0.18 0.20   (seconds; bound is 5.0)
```

25–40× headroom. `tmux new-session -d` returns once the session exists and the child is
forked — it never waits for the spawned program, so a slow `claude` exec (Gatekeeper on a
freshly-downloaded binary, say) cannot push it over. And if the bound ever did fire, the
worst case is an orphaned `muster-<id>` with its row rolled back — which REQ-2's watermark
and REQ-7's floor probe render harmless by construction. That is this plan's own thesis
doing its job.

**The more interesting half of your question has a different answer, and it is a Note
rather than a finding.** A context timeout does *not* surface as `context.DeadlineExceeded`
from `exec` — it surfaces as an `*exec.ExitError`. Measured, with `run`'s exact shape
(`WaitDelay = 2s`, `CombinedOutput`):

```
err                        = signal: killed:
errors.As(*exec.ExitError) = true
errors.Is(DeadlineExceeded)= false
=> PaneExists would return: (false, nil)   <-- reads as GONE
```

So in principle the timeouts this plan added open a second door into the collapse it just
closed: a *hung* tmux (as opposed to a refused or unreachable one) gets SIGKILLed at the
deadline and reads as "the pane is gone". I traced every bounded call site, and **none of
them produces a wrong outcome today**:

- `KillSession`'s verification runs on the *same*, already-expired context, and `exec`
  returns `ctx.Err()` before it starts a process. Measured: `err = context deadline
  exceeded`, `isExitError=false` → `checkErr != nil` → the original kill error is returned.
  A hung tmux can never read as a successful kill. This is the load-bearing one and it
  holds.
- The liveness poll's context is the daemon-lifetime `context.WithCancel(context.Background())`
  (`manager.go:162`) — unbounded — so a hung tmux blocks the sweep rather than timing out
  into a false death, and `checkOneLiveness`'s poll default (`endOnCheckError=false`) leaves
  sessions as-is regardless.
- `endLocked`'s post-kill `checkOneLiveness(checkCtx, …, true)` runs only after a kill that
  already succeeded, so "ended" is the correct answer whatever the check says.
- Launch/Resume/`Ensure`/`Resize` turn a timeout into an honest error to the caller.

Recording it because the safety rests on two incidental facts — the shared expired context,
and the poll being unbounded. Giving `KillSession`'s verification its own fresh context, or
bounding the poll, would turn this into a live defect with no test standing in the way.

## Manual Verification

Cycle 3 changed no `web/` code, so cycle 1's browser pass still stands for the UI itself.
I did verify the one user-visible consequence of cycle 2's Critical 2 that nobody had seen
outside a unit test — the split `not_resumable` messages — end to end over HTTP against a
real daemon in a real browser session (throwaway spec, deleted; `git status --porcelain`
clean):

```
ALIVE CAUSE  {"status":409,"body":{"error":{"code":"not_resumable",
  "message":"session is still alive; resume is only for a dead session"}}}
NO-ID CAUSE  {"status":409,"body":{"error":{"code":"not_resumable",
  "message":"session never started a claude conversation and has no resumable claude session id"}}}
```

Distinct messages, identical code, exactly what `docs/protocol.md`'s
`kb:anchor/sessions.resume` now promises. Both surfaces' Resume controls were confirmed
disabled for the no-id session, so the 409 is not normally reachable from the dashboard —
the split serves API clients and any future surface, while W3's `title` is what the user
actually reads. That is consistent with REQ-17 as written, not a gap.

## Requirements

All seventeen now verified implemented and tested. The five that failed in cycle 1 —
REQ-6, REQ-9, REQ-12, REQ-13, REQ-17 — are each closed with a test authored red first
(D20–D26 across the two waves), and the Affected-Files item cycle 1 flagged
(atomic `writeSettings`) is closed and now also durable.

## Hard-Rule Checklist

Re-swept over the cumulative diff: all nine clean. The single `exec.Command("tmux", …)` in
the cycle-3 diff is D25's cleanup and passes `-S <private socket>`, never the user's
default server.

## Issues

### Critical
None.

### Major
None.

### Minor
1. **[orchestrator]** (carried, non-blocking) `plans/session-lifecycle/plan.md` still has no
   ```checks block; `gates.sh session-lifecycle --checks-only` reports 0 lines. Every
   criterion was verified by hand across all three cycles.

### Notes
1. **[note]** A context timeout reaches `PaneExists` as an `*exec.ExitError`, not
   `context.DeadlineExceeded`, so a *hung* tmux reads as "gone" at that layer. Harmless at
   every current call site (traced and measured above), but it stops being harmless if
   `KillSession`'s verification is ever given its own fresh context, or if the liveness
   poll's context is ever bounded. Worth a comment at `isConnectionFailure` or on
   `KillSession` if anyone touches either.
2. **[note]** Backlog saturation on macOS blocks rather than failing (128 pending
   connections accepted, the next one blocked), so it can never present as a
   connection-failure string — it is a hang, handled by the bounded contexts.
3. **[note]** `writeSettings`'s temp file is `.claude/.settings.local.json.tmp-*`; a hard
   kill between `CreateTemp` and `Rename` leaves one in the user's repo, probably outside a
   `.gitignore` written for `settings.local.json` exactly. Carried from cycle 2, still not
   worth a wave.

## Remaining `[orchestrator]` work before landing

Not defects and not blocking — the plan schedules all of it for Completion, listed so the
backstop acts on it:

- `TODO.md:268` — #26 still `- [ ]`; tick it and move the block to
  `docs/history/todo-done.md` under the same heading.
- The four out-of-scope backlog entries the plan names are not yet added to `TODO.md`.
- The ADR flip, still pending and still atomic: the four `proposed` records
  (`actions-kill-is-idempotent`, `actions-serialized-per-session`,
  `lifecycle-reconcile-converges-with-the-socket`,
  `lifecycle-session-ids-monotonic-never-reused`) → `accepted`, plus
  `lifecycle-reconcile-converges-with-the-socket` gaining
  `supersedes: [lifecycle-ended-rows-swept-next-start]` and that record's `status:` going
  `accepted` → `superseded` (confirmed still `accepted` at `e50b469`). Do not skip the
  second half.
- The ```checks block (Minor 1 above).

## Verdict

**approved.** Zero Critical, zero Major, zero issues of any severity tagged to a pipeline
agent. The full E2E suite and every other gate are green, all seventeen requirements are
implemented and tested, the hard-rule checklist is clean, and browser verification is done
and recorded. Both questions you raised are answered with measurement rather than
inspection, and both came back in the fix's favour.
