# Maintainability review: Settings update failures

**Plan**: settings-update-failures
**Verdict**: needs-changes
**Cycle**: 3
**Pack**: kb: pack 21844 words (budget 8000) — WARN pack exceeds budget; sections rules 1938 · features 7186 · diagrams 4297 · decisions 7251 · proposed 0 · facts 168 · lessons 354 · runbooks 644
**Scope**: 22 files from `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts'`, the same set as cycle 2. Since the cycle 2 review (`7af3044`), 9 non-test files changed: `cmd/musterd/main.go`, `internal/selfupdate/failure.go`, `internal/server/{server,update,updatemanager,ws}.go`, `web/src/features/updaterestart.ts`, `web/src/main.ts` and `web/src/wsapp.ts`, plus two CLAUDE.md files. Of those, `internal/server/CLAUDE.md` changed only its generated trailer. `web/src/features/CLAUDE.md` changed its hand-written Owns line. I re-read the whole of each changed file. For unchanged files, cycle 2's reading still holds.

## Cycle 2 findings, re-checked

| Cycle 2 | State now | Evidence |
|---|---|---|
| Minor 1: `wsHub` logger patched in after construction | resolved | The constructor is now `newWSHub(log zerolog.Logger)` (`ws.go:61-63`), matching the package's other logger-taking constructors. `server.go:152` passes `cfg.Logger` into it. `rg -n "^\s+s\.[a-zA-Z]+\.[a-zA-Z]+ = " internal/server/server.go` finds nothing. `New`'s funlen is back to 41, which its existing reason (`server.go:136-142`) covers. The test call at `shellactivity_test.go:439` is updated. |
| Minor 2: `drainOutboxes` has its own bounded-wait loop | resolved | The comment at `ws.go:147-154` now says why `boundedwait.Wait` doesn't fit: its contract needs the WaitGroup to reach zero, and an ack a peer never dequeues would block `Wait`'s watcher goroutine. That is the divergence reason the rule asks for. |
| Note 1: features/CLAUDE.md said every `<owner><concern>.ts` file is a pure decision | resolved | The Owns line now names `updaterestart.ts` as the one exception. |
| Note 4: `UpdateConfig.Install` comment | resolved | `update.go:31-35` now says reclassification works from exePath, home and the write probe, not from this field. |

## Files

| File | Siblings opened | design: line | Size warnings | Result |
|------|-----------------|--------------|---------------|--------|
| cmd/musterd/main.go | preflight.go, onexit.go | n/a (comment-only change this cycle) | filelen 502, reason holds; funlen `parseFlags` 41 / `run` 44 were already over on main | pass |
| internal/selfupdate/apply.go | verify.go, lock.go, release.go | yes | — | pass (unchanged since cycle 2) |
| internal/selfupdate/failure.go | verify.go, release.go, apply.go | yes (Fix Attempt 3: fallback guard, fallback wording) | — | Minor 2, Note 2 |
| internal/selfupdate/install.go | exeversion.go, semver.go | yes | — | pass (unchanged since cycle 2) |
| internal/selfupdate/release.go | apply.go | yes | — | pass (unchanged since cycle 2) |
| internal/selfupdate/CLAUDE.md | — | n/a | — | pass |
| internal/server/server.go | ingest.go, shells.go, themepoll.go (constructor shape) | yes (Fix Attempt 3) | funlen `New` 41 (41 on main), reason holds | pass |
| internal/server/update.go | updatewire.go, usage.go | n/a (comment-only change this cycle) | — | pass |
| internal/server/updatemanager.go | updatewire.go, usagepoll.go, bgloop.go | n/a (comment-only change this cycle) | filelen 551, reason holds | pass |
| internal/server/ws.go | ingest.go, bgloop.go, internal/boundedwait/boundedwait.go | yes (Fix Attempt 3) | — | pass |
| web/src/app.ts | wsapp.ts | yes | — | pass (unchanged since cycle 2) |
| web/src/features/connection.ts | connectionrestore.ts, connectionversion.ts, updaterestart.ts | yes | — | pass; see Minor 1 |
| web/src/features/updaterestart.ts | update.ts, connection.ts, actions.ts (handle shape) | yes (`reloading()` reuses the `reloaded` flag) | — | Minor 1 |
| web/src/features/CLAUDE.md | — | n/a | — | pass |
| web/src/main.ts | (composition root) | n/a | — | pass (still a single-call registration) |
| web/src/render/banner.ts | render/masthead.ts, render/issue.ts | yes | — | pass (unchanged since cycle 2) |
| web/src/style.css | (itself) | n/a | — | pass |
| web/src/ws.ts | wsapp.ts | yes | — | pass (unchanged since cycle 2) |
| web/src/wsapp.ts | ws.ts, features/connection.ts, features/actions.ts | yes (gate placement), but the reason covers ws.ts only, not connection.ts | — | Minor 1 |

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** Whether a mismatched hello shows the protocol-mismatch screen is now decided in two places: `wsapp.ts:90-93` and `features/connection.ts:160-164`. That breaks the one route the code itself says update-restart uses to reach connection.
   - **What the neighbours say:**
     - `wsapp.ts:5-6` (its header): "Connection-status handling itself stays owned by `features/connection.ts` — this module only calls into whatever `WsAppConnection` the caller already built."
     - `updaterestart.ts:4-6`: "`features/connection.ts` reads `bannerOverride` through its own structurally-typed `ConnectionDeps`, the one cross-feature contact point".
     - `connection.ts:1` names protocol mismatch as part of what connection owns.
   - **What the new code does:**
     - `onProtocolMismatch` now reads `updateRestart.reloading()` and skips `connection.showProtocolMismatch()`. So `wsapp.ts` holds a cross-feature decision, not a relay.
     - `updaterestart.ts` now reaches connection behaviour by a second route that bypasses `ConnectionDeps`.
     - `connection.ts:160-164` still reads as unconditional.
     - Every other `dashboardWsHandlers` entry (`wsapp.ts:73-97`) is a store write, emit, render or single delegation. That includes the precedent the `design:` line cites, `onSessionRemoved: (id) => actions.handleRemoved(id)` (`wsapp.ts:73`).
   - **Why it matters:** a newcomer who asks "why didn't the mismatch screen show?" opens `connection.ts` first and finds no answer there.
   - **Why the stated reason is incomplete:** the `design:` line (web log, gate placement) weighs only `ws.ts` against `wsapp.ts`. It never considers `connection.ts` through `ConnectionDeps`, although that is the documented contact point and `main.ts:85` already hands it an `updateRestart` method.
   - **Rule broken:** `docs/conventions.md` § Design, "One owner per concept. A piece of state, a wire shape, a rule has one home; everything else asks it."
   - **A fix must make true:** the mismatch suppression has one home, and the module headers agree about where it is. Either:
     - it sits behind the existing `ConnectionDeps` contact point and `wsapp.ts` stays a relay; or
     - `wsapp.ts`'s and `updaterestart.ts`'s headers name the second contact point, and a `design:` line says why it doesn't sit behind `ConnectionDeps`.

2. **[daemon-impl]** A plan-scoped invariant ID has come back into a production comment: `internal/selfupdate/failure.go:77-78` reads "so INV-2 holds for every error LatestTag/CheckNewer can return".
   - **Why it's a problem:** `rg -n "INV-2" docs/features docs/adr docs/protocol.md docs/conventions.md` prints nothing. A reader outside this plan cannot resolve the reference, and `plans/` is not durable.
   - **History:** this is the class cycle 1's Major 1 cleared. Cycle 2's check grep didn't look for `INV-`. `git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' | grep '^+' | grep -nE "REQ-[0-9]|INV-[0-9]|\bW[0-9]+\b|\bD[0-9]+\b"` now finds exactly this one line.
   - **Rule broken:** `docs/conventions.md` § Comments ("a choice, `kb:adr/<slug>`").
   - **A fix must make true:** the comment states the invariant itself (no URL on the wire) or cites its durable record, `kb:adr/update-failure-one-sentence-chain-in-log`, which the function's own doc comment (`failure.go:58`) already cites. No plan-local ID stays in the diff.

### Notes

1. **[note]** For review-work (comment truth): `updaterestart.ts:4-6` still calls `ConnectionDeps` "the one cross-feature contact point", which `reloading()` via `wsapp.ts` now makes untrue. Fixing Minor 1 either way settles it.
2. **[note]** The URL-leak guard now exists twice in one file, with two different replacement phrases.
   ```
   $ rg -n '"://"' internal cmd -g '!*_test.go'
   internal/selfupdate/failure.go:29:	if strings.Contains(cause, "://") {
   internal/selfupdate/failure.go:80:	if strings.Contains(msg, "://") {
   ```
   - The predicate is a single stdlib call. The Fix Attempt 3 `design:` lines explain why the fallback's wording differs from `networkCause`'s ("a response *was* read").
   - No change is requested while the check stays a bare `strings.Contains`. If URL detection ever gets stricter, it should get one named home so the two call sites cannot drift.
   - This supersedes cycle 2's Note 5, which said `networkCause` held the classifier's only string check.
3. **[note]** `dashboardWsHandlers` now takes four positional parameters, two of them `Pick<…Handle, …>` feature slices (`wsapp.ts:65-70`). The shape is consistent with the `actions` precedent. If a third feature slice arrives, a named deps object would match the `init<Name>(app, deps)` convention better. No change requested.
4. **[note]** Concurrency:
   - `wsHub.log` is now set once, in the constructor, before any goroutine exists.
   - `reloaded` in `updaterestart.ts` is single-threaded page state. It is written only in the `helloArrived` handler and read by `reloading()`, and `dispatch` calls both synchronously in order (`ws.ts:129-131`).
   - The gates' `go test -race -count=1 ./...` passed `internal/server` (152.9s) and `internal/selfupdate` (5.7s) (`02-test.log`).
5. **[note]** Size warnings on this branch (`14-size.log`, 10 hits) are unchanged from cycle 2, except that `New` is back to 41:
   - `main.go` filelen 502: reason holds.
   - `updatemanager.go` filelen 551: reason holds.
   - `parseFlags`/`run` funlen: already over on main.
   - The test funlen hits are outside this diff.
   - No `dupl` hit.
   - For review-work: the test name `TestHandleCheckUpdate_ExactREQ8Message` (`updatereclassify_test.go:441`) still carries a plan ID (cycle 2 Note 8).
