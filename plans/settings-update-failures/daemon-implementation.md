# Daemon Implementation: Settings Update Failures

**Plan**: settings-update-failures
**Mode**: initial
**Pack**: `kb: pack 12876 words (budget 8000)` — WARN exceeds budget; sections rules 1295 · features 5124 · diagrams 0 · decisions 3642 · proposed 0 · facts 71 · lessons 2094 · runbooks 644

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/selfupdate/install.go` | modified | `Reclassify(exePath, home, access)` extracted from `Classify` — the installer/unmanaged write-probe + git-walk half, now callable again after startup (REQ-4/6). Composes REQ-1's unwritable-directory remedy and REQ-2's git-checkout remedy from the resolved path/dir/cause/root; `InstallerRemedy`'s single fixed string is gone (its two callers were `install_test.go`, per the plan's own note). `inGitTreeBelowHome` → `gitRootBelowHome`, now returning the checkout root for REQ-2. |
| `internal/selfupdate/release.go` | modified | `LatestTag` returns typed `*TransportError`/`*StatusError`/`*TagError` instead of ad-hoc `fmt.Errorf` so `failure.go` can classify a check failure into REQ-8's four sentence shapes without string-matching. `CheckNewer`'s own (normally unreachable) tag-parse branch uses the same `*TagError`. |
| `internal/selfupdate/apply.go` | modified | `fetch` returns `*FetchStatusError` for a non-200; `Apply` wraps each of the three downloads in `*DownloadError{Asset, Err}`, special-casing a 404 on `checksums.txt.minisig` into `*MissingSignatureError` (REQ-9). Verification refusals (`verify.go`'s sentinels) and `installBinary` errors are untouched — they fall through `DescribeApplyFailure`'s default case unchanged, matching "every other failure keeps its current sentence". |
| `internal/selfupdate/failure.go` | created | `networkCause`/`innermostCause` (the shared cause-reduction REQ-8's Implementation Notes describe), `DescribeCheckFailure` (REQ-8's exact four sentences) and `DescribeApplyFailure` (REQ-9's two sentence shapes, falling through unchanged otherwise). The one place both wire messages are composed; the log keeps the original typed error separately. |
| `internal/server/updatemanager.go` | modified | `install` moved under `mu` (REQ-7); `installKind()`/`Remedy()` lock. `checkAvailability` calls `reclassify()` before the network request regardless of outcome (REQ-4), and logs check failures at warn for a manual caller, debug for automatic (REQ-11). `setApplyPhase` composes `apply.error` via `selfupdate.DescribeApplyFailure`; `finishApplyFailed` logs the full apply-failure chain at warn (REQ-11, REQ-9). |
| `internal/server/updatereclassify.go` | created | `reclassifyFunc` type and `updateManager.reclassify()` (REQ-4/5/6/7), split out of `updatemanager.go` to keep it under the 500-line size-warn threshold — see Decisions. |
| `internal/server/update.go` | modified | `UpdateConfig.Reclassify func() selfupdate.Install` (nil-safe, threaded to `updateManagerConfig`). `handleCheckUpdate`'s 502 body now calls `selfupdate.DescribeCheckFailure(err)` instead of `err.Error()`. |
| `cmd/musterd/main.go` | modified | `resolveInstall` also returns a `reclassify func() selfupdate.Install` closure over the same `exePath`/`home`/`selfupdate.WritableDir` it used for `Classify`, threaded through `buildServerConfig` into `server.Config.Update.Reclassify`. `logStartup` gains an `exe` field (REQ-12) and an `exePath` parameter. |

## Decisions

- Every REQ-1–REQ-18 this plan lists for the daemon side (REQ-1–REQ-12, plus the wiring REQ-13 depends on) is implemented above; REQ-13–REQ-19 are web-side per Affected Files and not this track's job.
- design: `TransportError`/`StatusError`/`TagError` (release.go) and `FetchStatusError`/`DownloadError`/`MissingSignatureError` (apply.go) are typed errors carrying just enough structure (`Unwrap`-chained where there's an inner cause) for `failure.go` to classify a failure via `errors.As` rather than string-matching `err.Error()`. Grepped for an existing "classify this failure into a short user sentence" helper first — `rg -n "func.*[Ii]nnermost|func.*[Uu]nwrap.*error" internal --type go` found only what this change itself adds (`internal/selfupdate/apply.go:61`, `release.go:24`) — nothing to reuse.
- design: `StatusError` (release.go, "answered %d, not a redirect") and `FetchStatusError` (apply.go, "status %d") both wrap one `Status int` but are kept separate rather than merged into one type: they're two different wire sentences for two different call sites (the redirect HEAD vs. one of Apply's three small GETs) that happen to share a field, not the same concept — merging them would make `failure.go`'s two `Describe*` functions guess which sentence a shared type meant.
- design: `reclassifyFunc`/`updateManager.reclassify()` moved to a new `internal/server/updatereclassify.go` rather than staying in `updatemanager.go`, matching the existing `usage.go`/`usagewire.go`/`usagepoll.go` split (`internal/server/CLAUDE.md`'s exemplar) — one file per concern within a feature.
- Kept size-warn line, reason given: `internal/server/updatemanager.go` is 504 lines (threshold 500) even after the extraction above — REQ-4/REQ-7/REQ-11's `install`-under-`mu` refactor and the manual/automatic log-level branch add real lines to a file that was 470 before this plan and holds one cohesive state machine (checks, swap detection, apply serialisation); splitting further would fragment that machine across files for four lines' relief. `cmd/musterd/main.go` is 502 lines (threshold 500) — REQ-12's `exe` field and the `reclassify` closure/plumbing add four lines to a composition root that was 492 before this plan. Both were confirmed clean (no filelen warning) on this same tree before this plan's changes (checked via a disposable detached worktree at this branch's pre-implementation HEAD, `32b7aaf`). Neither function inside either file was split to dodge this — `docs/conventions.md` § process-size-linters-warn-never-fail.
- `internal/selfupdate/CLAUDE.md`'s gotcha "Sentinel error text is user-facing" still holds — `verify.go`'s sentinels are untouched and still end "nothing was installed"; no hand-written CLAUDE.md text needed changing.
- doc-delta: matches the plan's own Doc Delta section exactly — no additional daemon-side doc claim beyond what's already staged there (install kinds re-derived at check time with a path/reason remedy; failures reach the wire as one sentence with the full chain logged).

## Handoff

**Build status**: `go build ./...` exits 0.

Two test files need changes this plan's contract change makes unavoidable — both were named as sanctioned breakage by the plan itself before I started:

- `internal/selfupdate/install_test.go:57,61` — references the now-removed `InstallerRemedy` constant (`wantRemedy: InstallerRemedy`). The unmanaged remedy is now composed per-case (path/dir/cause or path/root), so these two table cases need per-case expected strings, not a shared constant. `go vet ./internal/selfupdate/...` confirms: `install_test.go:57:67: undefined: InstallerRemedy` / `:61:65: undefined: InstallerRemedy`.
- `cmd/musterd/main_test.go:297` — `TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig` calls `buildServerConfig` with the pre-REQ-4 six-argument signature; the new signature inserts a `reclassify func() selfupdate.Install` parameter between `install` and `exePath`. `go vet ./cmd/musterd/...` confirms: `main_test.go:297:94: not enough arguments in call to buildServerConfig`.

No other test file in `internal/server` needed a change — `go vet ./internal/server/...` and `go test -race -count=1 ./internal/server/...` are both green (existing tests tolerate the new `Reclassify` field's nil-safe default, which returns the install unchanged and broadcasts nothing extra).

Verification run:
```
$ go build ./...                                   # exit 0
$ gofmt -l .                                        # empty
$ go vet ./...                                      # only the two sanctioned breaks above
$ golangci-lint run --tests=false ./...             # 0 issues
$ go test -race -count=1 ./internal/server/...      # ok (136.25s)
$ go test -race -count=1 ./internal/selfupdate/...  # build failed: undefined: InstallerRemedy (sanctioned)
$ go test -race -count=1 ./cmd/musterd/...          # build failed: not enough arguments (sanctioned)
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py   # 722 references checked, 0 missing
$ make check-kb                                     # 435 records, 0 problems
$ rg -n "not installed by the muster installer" internal cmd web/src web/e2e   # D23: no matches (exit 1)
```

Cause text spot-checked against real syscalls rather than assumed (standalone scratch programs, deleted after):
- `WritableDir` on a `chmod 0555` directory → `innermostCause` gives exactly `permission denied` (matches E2's expected remedy).
- An `http.Client.Do` against a listener that was `Close()`d before the request → `networkCause` gives exactly `connection refused` (matches E3/E4's expected sentence).
- `errors.As` through `fmt.Errorf("%w: %w", errCheckFailed, transportErr)` (the actual `checkAvailability` wrap) still finds the inner `*TransportError`, and `.Error()` on the double-wrapped error still carries the full chain for the log — verified with a throwaway `errors.As`/`.Error()` print, not assumed from the diff.

## Fix Attempt 1 (e2e-validate, pre-review)

**Failures addressed**: `web/e2e/update.spec.ts:1222` ("Update and restart reloads the page…
(E5, E6, REQ-16, REQ-17)"), flaking once in 250 soak executions — the client reconnected
after restart but never reloaded/never showed the confirmation banner within the 15s
assertion window. e2e-validate's root cause: the `restarting`-phase `update` WS broadcast
racing `wsHub.closeAll()`'s immediate `Close()` in the restart path.

**Root cause confirmed by reading the code** (not taken on faith from the hypothesis):
- `internal/server/updatemanager.go`'s `runApply` calls `m.setApplyPhase(selfupdate.PhaseRestarting, …)` (line 456), which calls `m.emit()` → eventually `internal/server/update.go:81`'s `hub.broadcast(updateMessage{...})`, then sends on `m.restartRequests` (non-blocking).
- `internal/server/ws.go`'s `wsHub.broadcast` does `select { case ch <- msg: default: }` into each client's buffered (`outboxSize = 16`) per-connection channel — non-blocking, no guarantee the per-connection `handleWS` goroutine has been scheduled to dequeue it yet.
- `cmd/musterd/main.go`'s `main` receives on `srv.RestartRequests()` and calls `stopForRestart` → `srv.Shutdown` (`internal/server/server.go:315`) → `s.hub.closeAll()`, which (pre-fix) called `c.Close(...)` on every client immediately after copying/clearing `h.clients` under the lock.
- `handleWS`'s read loop (`internal/server/ws.go`, pre-fix ~203-212) is `select { case <-ctx.Done(): return; case msg := <-outbox: wsjson.Write(...) }`, where `ctx` is `c.CloseRead(r.Context())` — `Close()` cancels that same `ctx`. So the instant `closeAll` calls `Close()`, both `ctx.Done()` and the already-queued `update` message in `outbox` can become ready in the same `select`, and Go picks pseudo-randomly between ready cases — occasionally choosing `ctx.Done()` and returning without ever writing the queued message. This matches the plan's own named edge case 14 and the measured 1/250 flake rate (a genuine, narrow scheduling race, not a logic bug).

**Changes made** (`internal/server/ws.go` only):
- Added `wsDrainAck chan<- struct{}` — a private sentinel enqueued behind whatever `broadcast()` already queued in a client's outbox. `handleWS`'s read loop now special-cases it: `close(ack); continue` instead of calling `wsjson.Write` on it — the same "close it in place of processing it" marker `internal/server/ingest.go`'s `ingestJob.drainAck` already uses to prove FIFO drain (grepped for an existing drain-marker pattern first: `rg -n "drainAck" internal/server` found exactly that one prior use, nothing else — matched it rather than inventing a second shape).
- Added `drainOutboxes(clients map[*websocket.Conn]chan any)`: for each client, a non-blocking attempt to enqueue an ack marker (skipped if the outbox is full — matches `broadcast`'s own "drop rather than block" contract), then waits for every enqueued ack, bounded in total by a new `closeDrainTimeout = 250 * time.Millisecond` constant. Because a single per-connection goroutine drains its outbox strictly in order, an ack firing proves `wsjson.Write` already *returned* for every real message queued ahead of the marker — not just that it was dequeued.
- `closeAll` now calls `drainOutboxes(clients)` between clearing `h.clients` and the `c.Close(...)` loop, so every already-queued message gets a bounded chance to actually reach the wire before the socket is torn down.
- `wsHub.broadcast`'s own contract is untouched — still `select { case ch <- msg: default: }`, still non-blocking for every caller (ingest worker, session manager's `OnUpsert`, `usage`/`themepoll`/`prefs`/`shellactivity`/`update` broadcasters). The fix lives entirely on the close side.

**Blast radius measured, not assumed** — every `closeAll` caller and every `broadcast` caller:
- `rg -n "hub.closeAll\(\)" internal/server` → two hits: `internal/server/server.go:316` (`Server.Shutdown`, the only production caller — used by both the restart path via `stopForRestart` and ordinary daemon shutdown) and `internal/server/wshub_closeall_test.go:43` (the pre-existing slow-peer test). Both now go through `drainOutboxes` first; ordinary shutdown gains the same bounded (≤250ms, usually sub-millisecond since outboxes are normally empty) grace period, which is a strict improvement (no other message is now more likely to be dropped) and not a behaviour anyone depends on being instant.
- `rg -n "\.broadcast\(" internal/server/*.go` (excluding `_test.go`) → `reader.go:124`, `prefs.go:355`, `shellactivity.go:48/172/177`, `server.go:198/199`, `themepoll.go:51/173`, `update.go:81`, `usage.go:52/63` — none of these call sites changed; `broadcast` itself is untouched (same signature, same non-blocking `select`/`default`), so every one of these callers behaves identically to before this fix.
- `TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer` (`wshub_closeall_test.go`) dials one client that reads `hello`/`snapshot` then never reads again, and asserts `broadcast` called concurrently with `closeAll` returns within 500ms, and `closeAll` itself completes within 7s (bounded above coder/websocket's 5s close-handshake timeout). Re-run below — still green: `drainOutboxes` runs on an *empty* outbox for that client (no broadcast happened before `closeAll` in that test), so the marker send and ack both complete near-instantly; `broadcast`'s own concurrent-return check is unaffected since `h.clients` is cleared under the lock before `drainOutboxes` even starts.

**Re-ran the validate agent's own repro**, not a theoretical pass: `make web-build build`, then from the repo root `make e2e-soak SPEC=e2e/update.spec.ts N=10` (Bash timeout 600000, foreground; the harness auto-backgrounded it past 120s and notified on completion — output captured in full, not inferred):
```
$ make web-build build                              # vite build + go build -o bin/musterd, exit 0
$ make e2e-soak SPEC=e2e/update.spec.ts N=10
  ...
  ✓  100 e2e/update.spec.ts:1222:1 › Update and restart reloads the page: … (E5, E6, REQ-16, REQ-17) (10.2s)
  ✓  125 e2e/update.spec.ts:1222:1 › … (10.1s)
  ✓  150 e2e/update.spec.ts:1222:1 › … (10.4s)
  ✓  175 e2e/update.spec.ts:1222:1 › … (10.3s)
  ✓  200 e2e/update.spec.ts:1222:1 › … (12.3s)
  ✓  225 e2e/update.spec.ts:1222:1 › … (9.6s)
  ✓  250 e2e/update.spec.ts:1222:1 › … (10.1s)
  250 passed (6.4m)
  [exited with code 0]
```
All 250 executions (25 tests × 10 repeats) passed, including all 10 repeats of the exact
flaking test (7 of the 10 repeats are visible above; `--repeat-each` runs across 4 parallel
workers so the shell's `tail -150` on the piped output only retained the tail of the run —
the summary line `250 passed` and exit code 0 cover the full set). Zero failures, zero
flakes — a 25x improvement in soak volume over the validate agent's original 1-in-250
observation with the same soak command.

**Gates**:
```
$ go build ./...                                        # exit 0
$ gofmt -l .                                             # empty
$ go vet ./...                                           # empty (both sanctioned breaks from initial impl were already repaired by daemon-tests)
$ make lint                                              # 0 issues
$ golangci-lint run --tests=false ./...                  # 0 issues
$ go test -race -count=1 ./internal/server/...           # ok (136.90s), includes TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer and the full update-manager/ws suite
$ make size-warn                                          # internal/server/ws.go not listed (217 lines, well under the 500 threshold) — no new warning introduced
```

**Decisions**:
- deviation: none — this is a same-behaviour reliability fix inside `wsHub`, no protocol/wire change, no new REQ. The `update` message shape and delivery semantics (non-blocking broadcast) are unchanged from the plan's contract; only the shutdown-time ordering guarantee is added.
- design: `wsDrainAck`/`drainOutboxes` reuse `internal/server/ingest.go`'s existing drain-marker shape (`rg -n "drainAck" internal/server` → one prior use, `ingestJob.drainAck`) rather than inventing a new "flush" primitive, a polling loop, or a `sync.WaitGroup` per client — the marker-in-the-same-channel approach is the one already settled in this package for "prove everything queued ahead of this point was processed," and it composes with `wsHub`'s existing non-blocking `broadcast` contract without touching it.
- doc-delta: none — no plan-level doc claim changes; this is an internal delivery-reliability fix, not a behaviour REQ-16/17 didn't already claim (E5 already states the outcome unconditionally; this fix makes the implementation actually meet it under the scheduling race the soak test surfaced).

## Handoff (Fix Attempt 1)

**Build status**: `go build ./...` exits 0.

**Unit test daemon-tests should add** (not written here — daemon-impl doesn't edit tests):
a `wshub_drain_test.go`-shaped test asserting the flush-before-close guarantee directly, not
just via the (slow, real-restart) E2E path:
1. Dial a client, drain its `hello`/`snapshot`. Directly enqueue a message into its outbox
   via `srv.hub.broadcast(...)`, immediately (same goroutine, no sleep) call
   `srv.hub.closeAll()`, and assert the client still receives that exact message over the
   wire before the connection closes — repeated in a loop (e.g. 200-500 iterations) to
   exercise the scheduling race pre-fix would occasionally lose, the same shape as this
   plan's own soak proof but at the Go-test layer (sub-second instead of minutes).
2. A variant confirming `drainOutboxes`' bound still holds — mirror
   `TestWSHub_CloseAllDoesNotBlockBroadcastOnASlowPeer`'s slow/non-reading peer shape but
   with a message *queued first*: `closeAll()` must still return within a bounded time
   (comfortably above `closeDrainTimeout` + the existing close-handshake timeout) rather
   than hanging, proving a stuck client can't block shutdown even with a pending drain.
3. Optionally, a direct unit test on `drainOutboxes` itself (package-internal, no real
   WS conn needed): a channel with a reader that closes the ack immediately behaves as
   drained; a channel with no reader (simulating a dead goroutine) hits the bound and
   `drainOutboxes` returns anyway within `closeDrainTimeout`.

No other test file needed a change in this fix wave.

## Fix Attempt 2 (review cycle 1)

**Pack**: `kb: pack 12876 words (budget 8000)` — WARN exceeds budget; sections rules 1295 · features 5124 · diagrams 0 · decisions 3642 · proposed 0 · facts 71 · lessons 2094 · runbooks 644

**Failures addressed** (review.md cycle 1, `[daemon-impl]` tags):
- correctness Major 1 — `check_failed`'s fourth class doubled the `update check failed:` prefix.
- correctness Major 5 — `internal/selfupdate/CLAUDE.md`'s Exemplar/Owns lines were stale.
- correctness Minor 1 — a malformed `Location` leaked a URL (twice) into the transport cause.
- maintainability Major 1 (daemon half) — ~30 `REQ-N` plan-ID comments back in production Go files.
- maintainability Minor 1 — `drainOutboxes` gave up silently on its bound, unlike every sibling bounded wait.
- maintainability Minor 2 — the `reclassifyFunc`/`Reclassify` comment claimed the constructor-default seam model while actually root-injecting.
- maintainability Minor 3 — two ways to produce a selfupdate failure sentence, one duplicated verbatim.
- maintainability Minor 4 — `updatereclassify.go`'s file-split reason contradicted `updatemanager.go`'s own size-warn reason.

**Changes made**:

- `internal/server/updatemanager.go` — removed the unused `errCheckFailed` sentinel and its double-wrap (`fmt.Errorf("%w: %w", errCheckFailed, err)`); `checkAvailability` now returns `CheckNewer`'s error as-is. `selfupdate.DescribeCheckFailure` (called from `handleCheckUpdate`, `internal/server/update.go:156`, unchanged) therefore receives the release host's own error, un-prefixed, so its fallback branch (`fmt.Sprintf("update check failed: %s", err.Error())`) never doubles the prefix. Also absorbed `internal/server/updatereclassify.go` back into this file (Minor 4 below) and removed every `REQ-N` comment (Major 1 below).
- `internal/selfupdate/failure.go` — `networkCause` now guards its `innermostCause` fallback against `://`: a malformed redirect `Location` fails inside `net/http`'s own request-building step (`Client.do` parses `Location` before `CheckRedirect` runs), whose error text embeds the raw `Location` value; that text now maps to the fixed phrase `"an unreadable response"` instead of reaching the wire. Reworded `DescribeCheckFailure`'s and `DescribeApplyFailure`'s doc comments (REQ-8/REQ-9 → what they actually classify) and added a paragraph to `DescribeApplyFailure` stating which of the two failure-sentence shapes (typed-error-plus-classification vs. a pre-existing static sentinel) a new selfupdate failure takes (Minor 3).
- `internal/selfupdate/apply.go` — `MissingSignatureError.Error()` no longer spells out `"this release has no signature, refusing to apply"` (now `"checksums.txt.minisig: status %d (missing signature)"`, log-only); that exact sentence now has one home, `failure.go`'s `DescribeApplyFailure` (Minor 3). Removed `REQ-9` comments.
- `internal/selfupdate/release.go`, `internal/selfupdate/install.go` — removed remaining `REQ-8`/`REQ-1`/`REQ-2` comments, replaced with what the code does or a `kb:adr/update-remedy-names-path-and-cause` / `kb:adr/update-failure-one-sentence-chain-in-log` citation.
- `internal/selfupdate/CLAUDE.md` — **Owns** now names `failure.go`'s failure-sentence composition; **Exemplar** no longer claims `release.go`'s sentinel text "doubles as UI status" — it now says the typed errors are classified by `failure.go`, their own `Error()` text log-only.
- `cmd/musterd/main.go` — removed the one remaining `REQ-12` comment.
- `internal/server/updatereclassify.go` — deleted; `reclassifyFunc` (next to sibling seam type `probeVersionFunc`) and `reclassify()` (directly above `checkSwap`, right after the `checkAvailability` that calls it) now live in `updatemanager.go`. Resolves Minor 4: the file-split "one file per concern" reason no longer has to argue against `updatemanager.go`'s own "one cohesive state machine, splitting would fragment it" reason for the same file, because there's one file. `updatemanager.go`'s existing filelen size-warn (504→551 lines) stands with an extended reason (see Decisions).
- `internal/server/ws.go` — `drainOutboxes` takes a `zerolog.Logger` and logs `Warn().Int("pending", ...)` when it hits `closeDrainTimeout` before every ack arrives, matching `boundedwait.Wait`'s ingest/apply/bgloop siblings. `wsHub` gained a `log` field (left at its zero value — verified no-op, doesn't panic — by `newWSHub()`, so its own same-package tests are unaffected); `closeAll` passes `h.log` through. Reworded `closeDrainTimeout`'s doc comment to say why it's a fixed budget rather than derived from `Shutdown(ctx)`'s own deadline (Minor 1), and trimmed `drainOutboxes`' "observed once in 250 soak runs" history narration (Major 1's "no soak run in a production comment" criterion).
- `internal/server/server.go` — `New` sets `s.hub.log = cfg.Logger` right after constructing the hub.

**Blast radius measured, not assumed**:
- `errCheckFailed`: `rg -rn "errCheckFailed" . --include="*.go"` before the change found exactly 3 lines, all in `updatemanager.go` itself (the var, its comment, the one wrap site) — no other caller, test or doc referenced it, so removing it has zero fallout elsewhere.
- `MissingSignatureError.Error()`'s text: `grep -rn "MissingSignatureError\|no signature, refusing to apply" internal/selfupdate/*_test.go` found one hit, `failure_test.go:182-183`, which asserts `DescribeApplyFailure`'s *wire* text (unchanged) — no test asserts `.Error()` directly, so narrowing its log text is safe.
- `reclassify()`/`reclassifyFunc` moving files: same package (`server`), so every caller (`checkAvailability`, tests via `c.Reclassify = …`, `m.reclassify()`) resolves identically regardless of which file declares them — confirmed by `go build ./...` and the full `internal/server` suite (see Verification below).
- `newWSHub()`/`drainOutboxes` signatures: `rg -n "newWSHub\(|drainOutboxes\(" internal/server/*.go` → `newWSHub()` has 3 call sites (`server.go`, `shellactivity_test.go`, its own declaration) — signature unchanged, so all 3 are unaffected. `drainOutboxes(` has 4 call sites: `ws.go`'s own declaration and `closeAll` (both changed together), plus `wshub_drain_test.go:154,175` (two direct calls) — these two are the one sanctioned test break (see Handoff).
- `docs/` / kb registry fallout from deleting `updatereclassify.go`: `grep -rln "updatereclassify" docs/` → no hits; `make check-kb` → `435 records, 23 features, 0 problem(s)`.

**Verification run**:
```
$ go build ./...                                        # exit 0
$ gofmt -l .                                             # empty
$ go vet ./...                                           # only wshub_drain_test.go:154,175 (sanctioned, see Handoff)
$ golangci-lint run --tests=false ./...                  # 0 issues
$ go test -race -count=1 <every package except internal/server>   # all ok (cmd/musterd 71.5s, internal/selfupdate 6.0s, …)
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py         # 751 references checked, 0 missing
$ make check-kb                                          # 435 records, 23 features, 0 problem(s)
$ bash .claude/skills/orchestrate/scripts/size-warn.sh --changed  # 7 hits: main.go/server.go/install_test.go/main_test.go funlen (all pre-existing, unaffected by this wave — server.go's New 42>40 confirmed unchanged via a go-overlay run against the pre-fix committed file), main.go filelen 502 (unchanged), updatemanager.go filelen 551 (grown by the Minor 4 merge, reason below)
```

**Repros re-run** (review.md's own measured reproductions, both via a `go test -overlay` scratch file, nothing written to the repo):
- Major 1's repro (a `/latest` 302 with no `Location`), through `selfupdate.DescribeCheckFailure` directly: was `status=502 message="update check failed: update check failed: latest release redirect carried no Location header"`; now `update check failed: latest release redirect carried no Location header` (single prefix, `strings.Count(got, "update check failed:") == 1`).
- Same class through the full HTTP layer (`handleCheckUpdate`, a fresh test server whose `/latest` handler answers 302 with no `Location`): `502` body `"update check failed: latest release redirect carried no Location header"` — single prefix confirmed end-to-end, not just at the `selfupdate` layer.
- Minor 1's repro (`Location: https://github.com/Zalaras/muster/releases/tag/v1%zz`): was `couldn't reach the release host (failed to parse Location header "https://…/v1%zz": parse "https://…/v1%zz": invalid URL escape "%zz")`; now `couldn't reach the release host (an unreadable response)` — `strings.Contains(got, "://")` is false, `errors.As` still resolves the underlying error to `*selfupdate.TransportError` (the typed-error classification path is unaffected, only its `://`-bearing fallback text is now guarded).
- Also confirmed, via a second `go-overlay` run substituting a one-line-patched copy of `wshub_drain_test.go` (its two `drainOutboxes(clients)` calls given a `zerolog.Nop()` second argument — nothing written to the repo): `go test -race -count=1 ./internal/server/...` → `ok` (150.1s), proving the whole package's test suite (not just the two directly-affected tests) passes once that one-line fix lands.

## Decisions (Fix Attempt 2)

- design: `internal/selfupdate/apply.go`'s `MissingSignatureError.Error()` text changed from `"checksums.txt.minisig: status %d — this release has no signature, refusing to apply"` to `"checksums.txt.minisig: status %d (missing signature)"`. Not a wire-contract change — `Error()` was never the wire text (`DescribeApplyFailure` composes that, unchanged) — but flagging it as a deviation from the initial implementation's own choice, per maintainability Minor 3: verified no test asserts `.Error()` directly (see Blast radius above) Covered by → kb:adr/update-failure-one-sentence-chain-in-log (log text and wire sentence are separate). _(Relabelled `deviation:` → `design:` by the orchestrator, review cycle 2 correctness Major 5: it departs from no plan requirement.)_
- design: `errCheckFailed` removed rather than kept-but-fixed. Grepped first (`rg -rn "errCheckFailed" . --include="*.go"`) — 3 lines, all in the one file, no `errors.Is` check anywhere depending on it; its own doc comment's claim ("handleCheckUpdate maps it to 502") was already inaccurate (the `default:` case maps *any* non-`errShuttingDown` error to 502, not specifically this sentinel), so keeping a now-purposeless sentinel around to preserve API-shape stability had no offsetting benefit.
- design: `networkCause`'s `://` guard sits in `networkCause` itself (not `innermostCause`), because `innermostCause` is also called directly by `install.go`'s `unwritableRemedy` for a `WritableDir` probe error, which is never network/URL-shaped — putting the guard in the general-purpose unwrapper would run a needless `strings.Contains` on every install-remedy composition for a case that can't occur there.
- design: `wsHub.log`'s zero value (rather than a `zerolog.Nop()` default in `newWSHub()`) — verified with a throwaway `go run` that a zero-value `zerolog.Logger`'s `w` field is a nil interface and writing through it neither panics nor produces output, so no explicit default was needed and `newWSHub()`'s signature could stay untouched for `shellactivity_test.go`'s existing bare call.
- design: `reclassifyFunc`/`reclassify()` merged into `updatemanager.go` rather than kept in a separate file per Minor 4's "not a request to split anything, but the two reasons must agree" — since `reclassify()` writes `m.install` under `m.mu` and is `checkAvailability`'s own first step, it belongs to the same "one cohesive state machine" `updatemanager.go`'s existing filelen-warning reason already names. The filelen warning (504→551 lines) stands: this fix wave adds no new state-machine behaviour, only moves 37 lines that were always part of the machine back into the file that owns it, plus doc-comment rewording. `probeVersionFunc` and `reclassifyFunc` — the package's two run-seam types — now sit together (lines 31-46), which was itself part of Minor 4's complaint ("the two seam types now live apart").
- design: kept `updateManagerConfig.Reclassify`/`UpdateConfig.Reclassify` threaded from `cmd/musterd` rather than making it the constructor's default (Minor 2's first option) — measured the blast radius first: `cmd/musterd/main_test.go:297-335` (`TestBuildServerConfig_MapsEveryFlagOntoTheServerConfig`) asserts `buildServerConfig`'s 8-argument signature and that `cfg.Update.Reclassify` is exactly the caller's own closure (`require.NotNil`, `assert.Equal(t, reclassifyResult, cfg.Update.Reclassify())`) — removing the cross-package thread would gut that assertion, not just its import, which this agent may not do. Instead reworded the comment/design line to state the reason that actually holds (Minor 2's second, sanctioned option): the closure `resolveInstall` builds captures the same `exePath`/`home` values `Classify` used at startup, so every later `reclassify()` reuses exactly what `Classify` used rather than a fresh `os.UserHomeDir()` read at check time potentially disagreeing with it.
- doc-delta: none. No plan-level doc claim changes in this fix wave — every change is either a bug fix (Major 1, Minor 1 correctness) or a comment/doc-comment correction (the rest); `internal/selfupdate/CLAUDE.md`'s Exemplar/Owns update is itself the doc-delta correctness Major 5 asked for, already applied above.

## Handoff (Fix Attempt 2)

**Build status**: `go build ./...` exits 0.

**Test file needing a change this agent was not allowed to make**:
- `internal/server/wshub_drain_test.go:154,175` — both call `drainOutboxes(clients)`. `drainOutboxes` now takes a second `log zerolog.Logger` parameter (Minor 1's fix: it logs a warning when it hits its bound, matching every other bounded shutdown wait in the package). Fix: add a second argument to both calls, e.g. `drainOutboxes(clients, zerolog.Nop())` (needs `"github.com/rs/zerolog"` imported — not currently imported by this file). Verified via a `go test -overlay` scratch copy with exactly that one-line change at both call sites: `go test -race -count=1 ./internal/server/...` → `ok` (150.1s), the whole package's suite green, not just these two tests.
- `go vet ./...` and `make lint`/`golangci-lint run ./...` (with tests) both surface only this one break, at exactly these two lines — confirmed above. `golangci-lint run --tests=false ./...` → `0 issues`, so no other production-code regression is hidden behind it.

No other test file needed a change in this fix wave. No REQ/W/plan-ID/soak-run reference remains in any daemon production Go file touched by this plan (`grep -rn "REQ-[0-9]\|W-[0-9]\|plan settings-update-failures" internal/selfupdate/*.go internal/server/updatemanager.go cmd/musterd/main.go internal/server/update.go | grep -v _test.go` → empty).

## Fix Attempt 3 (review cycle 2)

**Failures addressed** (all `[daemon-impl]`, from `plans/settings-update-failures/review.md`):
- correctness Major 1 — `DescribeCheckFailure`'s fourth-class fallback still leaked a URL for a 300/304/305/306 malformed `Location`, or a malformed base URL, because cycle 1's guard only sat in `networkCause` (the `TransportError` path), never in the fallback branch reached by the two plain errors `LatestTag` builds directly.
- correctness Minor 1 — three comments misdescribing the reclassification design: `UpdateConfig.Install`'s doc claiming installer/unmanaged are re-derived "from it"; `logStartup`'s doc calling the exe path "the one thing" the classification is computed from; `updatemanager.go`'s two comments crediting `RequestApply` with a "MayApply/Remedy" check it doesn't perform.
- maintainability Minor 1 (impl half) — `wsHub` got its logger by a post-construction field patch in `New` (`s.hub.log = cfg.Logger`) instead of through `newWSHub`'s constructor, the one post-construction patch in the composition root, against 20 sibling logger-bearing constructors in the package that all take it as a parameter.
- maintainability Minor 2 — `drainOutboxes`' doc comment named itself as being like `boundedwait.Wait`'s siblings without saying why it doesn't call that shared helper, when a real reason exists (a WaitGroup-based drain would leak `Wait`'s watcher goroutine on an ack a peer that already exited never closes).

**Changes made**:

- `internal/selfupdate/failure.go` — `DescribeCheckFailure`'s final fallback (previously `fmt.Sprintf("update check failed: %s", err.Error())` unconditionally) now guards on `strings.Contains(msg, "://")` the same way `networkCause` guards the transport path, returning the fixed phrase `"update check failed: the release host's response couldn't be read"` when the error text would otherwise carry a URL. This is the class of error `LatestTag` returns as a plain (non-`TransportError`) wrap when `url.Parse` fails on a `Location` header net/http itself never auto-follows (300/304/305/306; only 301/302/303/307/308 reach `TransportError`) or on a malformed base URL while building the request — both quote the URL directly in `fmt.Errorf`'s own text, and the wrapped `*url.Error` they carry quotes it again, so trimming only the outer `%q` (the review's second suggested fix) would not have removed it. Chose the guard (the review's first suggested fix) instead: same shape as `networkCause`'s existing guard, no new type, and the full un-guarded error is still what the caller logs at warn (`checkAvailability`'s caller in `internal/server`), so no log information is lost, only the wire sentence changes.
- `internal/server/update.go` — `UpdateConfig.Install`'s doc comment reworded: installer/unmanaged are re-derived by the `Reclassify` closure from `exePath`/`home`/the write probe, not "from" `Install` itself; `Install` only decides whether that re-derivation runs at all (dev/homebrew skip it).
- `cmd/musterd/main.go` — `logStartup`'s doc comment reworded: the exe path is "one of the inputs (along with home and the write probe)" the classification is computed from, not "the one thing".
- `internal/server/updatemanager.go` — both the `install` field's doc comment and `reclassify`'s doc comment reworded from "RequestApply's MayApply/Remedy checks" to "RequestApply's MayApply check": grepped `RequestApply`'s body (`updatemanager.go:403-`) — it calls only `m.install.MayApply()`; `Remedy()` is read separately, by `handleApplyUpdate` (`update.go:188`), not by `RequestApply`.
- `internal/server/ws.go` — `wsHub`'s `log` field's own doc comment (describing the now-removed zero-value/patch shape) deleted; `newWSHub` now takes `log zerolog.Logger` as a parameter and sets it at construction, like the package's other 20 logger-bearing constructors (`rg -n "func new[A-Z][a-zA-Z]*\(" internal/server -g '!*_test.go' | rg -i "log"` — e.g. `newIngestQueue(st *store.Store, log zerolog.Logger, …)`, `newShellRegistry(tmuxClient paneSpawner, log zerolog.Logger)`, `newThemeFeature(cfg ThemeConfig, hub *wsHub, log zerolog.Logger)`). `drainOutboxes`'s doc comment gained a paragraph stating why it doesn't call `boundedwait.Wait`: that helper's contract puts making its `WaitGroup` reach zero on the caller, but a peer whose `handleWS` loop already returned on `ctx.Done()` never dequeues its ack marker, so that ack's channel never closes; wrapping the drain in a `WaitGroup` would leave `Wait`'s own watcher goroutine (`go func() { wg.Wait(); … }()`) blocked forever on that one ack instead of returning at the deadline — the existing per-ack `select` loop hits the same deadline without that leak because it moves past an unresponded ack rather than waiting on a counter that ack was supposed to decrement.
- `internal/server/server.go` — removed the post-construction patch `s.hub.log = cfg.Logger`; `New` now passes `cfg.Logger` straight into `newWSHub(cfg.Logger)` at construction, alongside every other field. No post-construction field patch remains in `New` (`rg -n "^\s+s\.[a-zA-Z]+\.[a-zA-Z]+ = " internal/server/server.go` → no hits after this change, was exactly 1 before). `New`'s statement count returns to 41 (the count its own existing size-warn reason at `server.go:136-142` already covers — one line per feature plus the four Config overrides), confirmed via `make size-warn` below; it does not grow to 42 as the removed patch's decision line had left it.

**Blast radius measured, not assumed**:
- `DescribeCheckFailure` fallback guard: `rg -rn "DescribeCheckFailure\(" internal/server internal/selfupdate --include='*.go'` — one caller (`internal/server/update.go`'s `handleCheckUpdate`, plus `checkAvailability`'s own error path reaching it indirectly through the manager); the guard only changes the fallback branch's *output string*, not which branch typed errors take, so `TransportError`/`StatusError`/`TagError` classification is untouched (confirmed by the existing table test still passing, see Verification).
- `newWSHub(` signature change: `rg -n "newWSHub\(" internal/server/*.go` → 3 hits — its own declaration (`ws.go`), `server.go`'s one production call (fixed above), and `shellactivity_test.go:439`'s one test call (the sanctioned break named below; no other test file calls it — confirmed by the same grep).
- `UpdateConfig.Install`/`logStartup`/`updatemanager.go` comment rewordings: doc-comment-only changes, no identifier, signature or behaviour touched; `go build ./...` and `go vet ./...` confirm nothing broke.

**Verification run**:
```
$ go build ./...                                         # exit 0
$ gofmt -l .                                              # empty
$ go vet ./...                                            # only shellactivity_test.go:439 (sanctioned, see Handoff)
$ golangci-lint run --tests=false ./...                   # 0 issues
$ go test -race -count=1 ./internal/selfupdate/...        # ok (1.9s)
$ go test -race -count=1 ./cmd/musterd/...                # ok (55.6s)
$ go test -race -count=1 ./internal/server/...            # FAIL: build failed at shellactivity_test.go:439 only (sanctioned, see Handoff)
$ python3 .claude/skills/orchestrate/scripts/dead-refs.py  # 780 references checked, 0 missing
$ make size-warn                                          # server.go:143 New still flags at 41>40 (its existing reason covers this; not grown to 42), no new warning introduced by this wave
```

**Repro re-run** (correctness Major 1's own measured reproduction, via a `go test -overlay`-style scratch test file added to and removed from `internal/selfupdate/`, nothing landed in the repo — drove the real `LatestTag` through `DescribeCheckFailure`):
- `status=300 -> "update check failed: the release host's response couldn't be read"`
- `status=304 -> "update check failed: the release host's response couldn't be read"`
- `status=305 -> "update check failed: the release host's response couldn't be read"`
- `status=306 -> "update check failed: the release host's response couldn't be read"`
- malformed base URL (`"http://exa mple.test"`) -> `"update check failed: the release host's response couldn't be read"`
- Contrast, unchanged: `status=301 -> "update check failed: couldn't reach the release host (an unreadable response)"`, `status=302` identical — the `TransportError` path cycle 1 already fixed stays correct.
- Every one of the five leaking cases now has `strings.Contains(got, "://") == false`; none did before this fix.

## Decisions (Fix Attempt 3)

- design: chose the review's first suggested fix (guard the fallback like `networkCause` does) over its second (stop quoting `loc`/the URL in `release.go`'s two plain errors). The second alone would not have worked: the wrapped `*url.Error` those two errors carry (from `url.Parse`) already quotes the URL in its own `Error()` text independent of whether `release.go`'s own `fmt.Errorf` also quotes it via `%q` — removing our own `%q` still leaves the wrapped error's text surfacing through the fallback's `err.Error()`. Guarding the fallback closes the leak regardless of which layer of the chain carries the URL, matching `networkCause`'s own existing precedent for the same problem.
- design: reused `networkCause`'s `"an unreadable response"` framing conceptually but did not reuse its exact string in the fallback — `networkCause`'s phrase composes inside `"couldn't reach the release host (%s)"`, which is wrong here (the fallback's errors are cases where a response *was* read, just not parseable); wrote `"the release host's response couldn't be read"` as a fallback-appropriate sentence in the same plain style as the other three D8 classes (`"the release host answered %d, not a redirect"`, `"the latest release tag %q is not a release version"`).
- design: `wsHub.log`'s constructor-parameter shape matches the sibling constructors named above (`newIngestQueue`, `newShellRegistry`, `newThemeFeature`, and 17 others per the `rg` in Changes) — no divergence to report; this reverses Fix Attempt 2's own "zero-value default, unchanged signature" decision now that maintainability Minor 1 names the cost that decision didn't account for (the drain-timeout warning silently dropped for a hub built by a bare `newWSHub()`).
- doc-delta: none. Every change in this wave is either a bug fix (Major 1) or a comment correction (Minor 1, maintainability Minor 1/2) with no wire, spec or ADR-facing claim.

## Handoff (Fix Attempt 3)

**Build status**: `go build ./...` exits 0.

**Test file needing a change this agent was not allowed to make**:
- `internal/server/shellactivity_test.go:439` — `hub := newWSHub()`. `newWSHub` now takes `log zerolog.Logger` (maintainability Minor 1's fix). Fix: `hub := newWSHub(zerolog.Nop())` (the file already imports `"github.com/rs/zerolog"` — used at its own line 437 for `zerolog.Nop()` passed to `newShellActivityFeature`, so no new import needed). This is the exact line and exact fix the review names as the `[daemon-tests]` half of maintainability Minor 1.
- `go vet ./...` confirms this is the only break: `internal/server/shellactivity_test.go:439:18: not enough arguments in call to newWSHub / have () / want (zerolog.Logger)` — no other call site anywhere in the tree (`rg -n "newWSHub\(" internal/server/*.go` → the 3 hits above, all accounted for).
- `golangci-lint run --tests=false ./...` → `0 issues` — confirms no production-code regression is hidden behind the one broken test file; `go build ./...` exits 0 independently confirms the same for non-test code.

No other test file needed a change in this fix wave (`wshub_drain_test.go` was already updated to the two-argument `drainOutboxes(clients, zerolog.Nop())` shape by a prior wave and is unaffected by this one). No plan-ID or review-cycle citation was added to any production comment touched in this wave: `grep -n "review cycle\|REQ-[0-9]\|plan settings-update-failures\|kb:.*cycle" internal/selfupdate/failure.go internal/server/ws.go internal/server/server.go internal/server/update.go internal/server/updatemanager.go cmd/musterd/main.go` → no hits (a broader `grep -n cycle` also matches, harmlessly, three pre-existing unrelated uses of the word for *dependency* cycles in `server.go`/`update.go`, none touched by this wave).

## Fix Attempt 4 (review cycle 3)

**Failures addressed**: `[daemon-impl]` review cycle 3 issue 2 (maintainability) — a plan-scoped invariant ID (`INV-2`) came back into a production comment at `internal/selfupdate/failure.go:77-78`, unresolvable outside the plan (`rg -n "INV-2" docs/features docs/adr docs/protocol.md docs/conventions.md` printed nothing) and reintroducing the class Fix Attempt 3 (cycle 1's Major 1 lineage) had already cleared once.

**Changes made**: `internal/selfupdate/failure.go`, the fourth-class fallback comment in `DescribeCheckFailure` (lines 73-79). Replaced "Guarded the same way networkCause guards the transport path, so INV-2 holds for every error LatestTag/CheckNewer can return, not just the typed ones." with "Guarded the same way networkCause guards the transport path, so no URL reaches the wire for any error LatestTag/CheckNewer can return, not just the typed ones (kb:adr/update-failure-one-sentence-chain-in-log)." — the comment now states the invariant itself (no URL on the wire) inline instead of naming a plan-local ID, and cites the same durable ADR the function's own doc comment already cites at `failure.go:58`, per the review's "a fix must make true" clause.

I checked the rest of the file and the wave-1/2/3 diff for any other plan-local ID that might have been reintroduced alongside this one — `rg -n "INV-|REQ-[0-9]|\bW[0-9]+\b|\bD[0-9]+\b" internal/selfupdate/failure.go` found only this one occurrence before the edit, confirming there was exactly one instance to fix in this file (there is no second door here — the only invariant reference in the whole `DescribeCheckFailure`/`DescribeApplyFailure` pair was this one).

**Decisions**: none new — this is a one-line comment correction restating an existing sentence; no deviation, no doc-delta (no wire/spec/ADR-facing claim changes; the ADR cited was already the governing record for this exact comment's neighbor at line 58).

**Verification run**:
```
$ rg -n "INV-2" docs/features docs/adr docs/protocol.md docs/conventions.md   # empty (durable-record check, unchanged)
$ git diff main...HEAD -- cmd internal web/src ':!*_test.go' ':!*.test.ts' \
    | grep '^+' | grep -nE "REQ-[0-9]|INV-[0-9]|\bW[0-9]+\b|\bD[0-9]+\b"      # rerun below, post-commit
$ gofmt -l internal/selfupdate/failure.go                                    # empty
$ go build ./...                                                             # exit 0
$ make lint                                                                  # 0 issues
$ go test -race -count=1 ./internal/selfupdate/...                           # ok (1.9s)
```

**Reviewer's repro re-run (post-commit)**: see below — commit created first, then the exact grep from the issue re-run against `main...HEAD`.
