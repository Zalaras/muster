# Daemon Implementation: Maintainability Cleanup — D3 session and store duplicates

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: `kb: pack 68098 words (budget 8000)` — WARN over budget; read `plan.md` § Units → D3,
`review.maintainability.a-session.md` in full (Seed S4–S8, Critical 1 (context only, F1's), Major
1–3, Minors 1–8, Notes 1–10) and `review.maintainability.c-adapters.md` Minor 4/5 + Notes directly
per the spawn prompt, plus `daemon-implementation-F1.md`/`-D2.md` and `docs/conventions.md` § Design.

## Scope actually covered (per spawn prompt, not the full a-session ledger)

a-seed S4–S7 (S8 is X1's comment sweep); a-M1 (ports); a-m2 (store time helpers); a-m4 (paired
with S7: one removal routine); a-m6 (duplicate migration version); a-m7 (`GetRepo`); a-note-6 (one
transaction idiom); c-adapters Minor 4 (`"muster-"` prefix) and Minor 5 (absent-vs-could-not-ask).
a-m1 (row mapping), a-m3 (`Reconcile` error) and a-m5 (`mu` guard doc) were already landed by D2 —
verified untouched.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/tmux/tmux.go` | modified | c-m4: `sessionPrefix` constant declared once; `ShellSessionName`/`SessionName`/`IsShellSessionName`/`ParseSessionName`/`NewSession` all build from it; added `HasSessionPrefix` for Reconcile's "was this at least meant for us" check. c-m5: added `tmuxAbsence` classifying the shared "confirmed absent vs. couldn't ask" decision; `ListPaneActivity`/`PaneExists`/`ListSessions` now call it instead of each hand-rolling the `*exec.ExitError`+`isConnectionFailure` branch. |
| `internal/session/manager.go` | modified | a-M1: `Killer` renamed `TmuxSessions`, gained `ResolveSessionTarget` (folding in the old `targetResolver`); `Config`/`Manager` fields `SessionKiller`/`sessionKiller` renamed `TmuxSessions`/`tmuxSessions`; `NewManager` panics if `PaneChecker`/`PaneSnapshotter`/`TmuxSessions` is nil. S4: `sessionTmuxName` now delegates to `tmux.SessionName`. S6+a-m4/S7: new `removeSessionRecord` (store-delete → memory-drop → idLocks/writeChain reclaim → optional `OnRemoved`) shared by `DeleteSession`, `Remove` and Reconcile's sweep; `DeleteSession` and `removeFromMemory`'s docs updated. S6: new `sessionSnapshot` value type + generic `collectLocked` helper replacing `reconcileRow`, `classifySessions`' local `row` and `livenessTarget`. |
| `internal/session/reconcile.go` | modified | a-M1: removed `targetResolver` and the `sessionKiller == nil` fallback branch (`classifySessions` deleted entirely — one classification path). `RepairOwnedSession`/`reviveOwnedSession` call `m.tmuxSessions.ResolveSessionTarget` directly, no type-assertion, no `resolver`/`canResolve` params. S6: `RepairOwnedSession`/`reviveOwnedSession`'s identical persist tail factored into `persistAndFinishLocked`. `classifySessionsByOwnership` rebuilt on `collectLocked`/`sessionSnapshot`. S7/a-m4: sweep loop calls `removeSessionRecord`. c-m4: unknown-name check uses `tmux.HasSessionPrefix`. |
| `internal/session/actions.go` | modified | S5: `RecordLaunch`'s ad-hoc `fmt.Errorf("recording launch: unknown session %d", id)` → `ErrUnknownSession`. S6: new `killSessionWithTimeout` shared by `endLocked` and `removeLocked`'s not-alive branch. `endLocked`'s capture block now calls `captureAndStoreSnapshot`; its `paneSnapshotter`/`sessionKiller`/`paneChecker` nil-guards removed (all three required now). `EndAll` rebuilt on `collectLocked`. `shellNamesOnSocket`'s nil-guard removed. `Remove`/`removeLocked` rebuilt on `removeSessionRecord` (S7/a-m4). |
| `internal/session/liveness.go` | modified | S6: `captureSnapshot` renamed `captureAndStoreSnapshot`, taking separate capture/persist contexts so `endLocked`'s bounded-capture-but-unbounded-persist behaviour is preserved exactly while sharing the body with `checkOneLiveness`. `checkLiveness`'s `paneChecker`/`sessionKiller` nil-guards removed; its `livenessTarget` inline type replaced by `collectLocked`/`sessionSnapshot`. `Nudge`'s `paneChecker` nil-guard removed. |
| `internal/session/apply.go` | modified | S5: `Apply`'s and `ApplyStatus`'s ad-hoc `fmt.Errorf(... "unknown session %d")` → `ErrUnknownSession`. |
| `internal/session/CLAUDE.md` | modified | "Killer" → "TmuxSessions" in the Owns line (hand-written part must stay true). |
| `internal/store/store.go` | modified | a-m2: added `encodeTime`/`decodeTime` (RFC3339) and `encodeReceiptTime`/`decodeReceiptTime` (RFC3339Nano) as the package's one encode/decode pair per format. `InsertEvent` uses `encodeReceiptTime`; `EventSummary`'s previously-swallowed `LastReceivedAt` parse failure now surfaces as a summarizing error instead of silently staying nil. |
| `internal/store/session.go` | modified | a-m2: every `.UTC().Format(time.RFC3339)` site and every `time.Parse(time.RFC3339, …)` site in `InsertSession`/`UpdateSession`/`scanSession`/`UpdateSnapshot` now goes through `encodeTime`/`decodeTime`; `scanSession`'s five silently-discarded parse errors (`state_since`, `created_at`, `attention_since`, `ended_at`, `last_snapshot_at`) now return a scan error naming the column. |
| `internal/store/repo.go` | modified | a-m7: `GetRepo`'s doc corrected — no production caller (verified by `rg`), exists for test setup, not "used when building a Session's repo/branch wire fields". a-m2: `UpsertRepo`/`scanRepo` use `encodeTime`/`decodeTime`; the two silently-discarded parses (`last_launched_at`, `created_at`) now return a scan error. |
| `internal/store/usage.go` | modified | a-m2: both `InsertUsageSample`/`InsertUsageModelSamples` receipt stamps use `encodeReceiptTime`; the `ResetsAt` fields use `encodeTime`. a-note-6: `InsertUsageModelSamples`'s explicit per-error `tx.Rollback()` calls replaced with the package's deferred-Rollback idiom. |
| `internal/store/migrate.go` | modified | a-m6: `loadMigrations` now errors if two files share a version instead of silently applying only the first and skipping the second forever. a-note-6: the per-migration transaction body extracted into `applyOneMigration` (needed its own function scope for the deferred-Rollback idiom to fire per iteration, not once at `Migrate`'s return) and uses `encodeTime`. |
| `internal/server/server.go` | modified (1 line) | Wiring only, per the spawn prompt's carve-out: `SessionKiller: tmuxClient` → `TmuxSessions: tmuxClient` (the Manager's Config field rename). No other line in this file is mine — it shows concurrent D4 edits (logger-last constructor args) in `git diff`; I did not touch those. |

## Decisions

- design: `TmuxSessions` interface (manager.go) folds `ResolveSessionTarget` into what was
  `Killer` — `rg -n 'func.*ResolveSessionTarget' internal/tmux` showed the method already exists
  verbatim on `*tmux.Client` (tmux.go), so no new tmux-side method was needed, only moving its
  declaration from the deleted `targetResolver` interface into the port every caller already held.
  Removes the "resolver + canResolve" parameter pair Major 1's own Naming complaint named.
- design: `NewManager` panics on a missing required port rather than returning `(*Manager, error)`.
  `rg -n 'panic\(' internal --type go -g '!*_test.go'` found no repo-wide precedent for a required-
  dependency-nil check (the four existing panics are all "this literal embedded/generated data is
  malformed", not "a caller passed nil"), and no existing `New*`-style constructor in this codebase
  returns `(T, error)` for a required-field check either (`store.Open`'s error return is for real
  I/O). A panic makes the failure occur exactly at construction (the finding's literal ask —
  "required at construction", not "required at first use") and can never be silently satisfied by
  a lazily-nil-checked call path the way the deleted `classifySessions` fallback was; production
  can never trip it (server.go always wires all three to the same `*tmux.Client`).
- design: `removeSessionRecord(ctx, id, notify bool)` is the one removal routine a-m4 asks for.
  Order is store-delete-first (matching `removeLocked`'s pre-existing order) per the spawn prompt's
  explicit instruction, since `git log -S` on the reorder commit (`acc541e`) and session-lifecycle
  REQ-14's text (names only `Remove`) turned up no rationale for the other two paths' memory-first
  order — recorded in the function's own doc rather than only here, so a future reader hits the
  same evidence.
- design: `sessionSnapshot` + `collectLocked[T any]` (manager.go) — `rg -n 'func.*\[T ' internal/session'`
  before adding found `derefOrZero`/`ptrOrNil` (row.go, from D2's a-m1) as the package's only existing
  generic helpers, confirming a generic locked-collect helper matches an established local idiom
  rather than introducing a new one. Used by `classifySessionsByOwnership`, `EndAll` and
  `checkLiveness` — the three S6 "collect under lock" duplicates — each with its own
  include/take closures rather than forcing one shared shape onto genuinely different filters
  (EndAll wants every alive id; checkLiveness wants alive-with-a-target id+target pairs).
- design: `persistAndFinishLocked` factors only the byte-identical tail
  (`sessionToRow`→`Clone`→`nextWriteTurnLocked`→unlock→`finishWrite`) shared by `RepairOwnedSession`
  and `reviveOwnedSession` — verified identical by diffing the two functions' tails before extracting.
  Deliberately **not** extended to `RecordLaunch`/`RecordResume`/`markEnded`/`applyRailChangesLocked`,
  which have the same shape: those are F1's already-reviewed/tested writers and none of S6's four
  named pairs (Repair/revive, kill-with-timeout, capture, collect-alive-ids) includes them — pulling
  them in would be scope creep into another unit's landed, tested code for a dedup nobody asked for
  in this pass. Flagging as a real future generalization, not doing it here.
- design: `killSessionWithTimeout` and `captureAndStoreSnapshot` are S6's other two named dupes.
  `captureAndStoreSnapshot` takes two contexts (`captureCtx`, `persistCtx`) rather than one, because
  `endLocked` bounds only the tmux capture call to `endRemoveTmuxTimeout` while `storeSnapshot`'s DB
  write keeps the outer request `ctx` — collapsing to one context would have silently rebound that
  DB write to the 5s tmux timeout, a real behaviour change the "behaviour unchanged" rule forbids.
  `checkOneLiveness` passes the same `ctx` for both, unchanged from before.
- a-m2: two encode/decode pairs, not one — `internal/store/CLAUDE.md`'s own gotcha already
  distinguishes "RFC3339 UTC text" (general columns) from "nanosecond precision for receipt
  stamps" (deliberately chosen so two immediate inserts don't collide, per `InsertEvent`'s existing
  comment) — collapsing them into one format would be a behaviour change (event/usage timestamp
  precision), not a refactor. `EventSummary`'s previously-swallowed parse failure now returns an
  error (a-m2's explicit "no silent failures" ask) — this is a deliberate behaviour change the
  finding asks for, verified safe: `go test ./internal/store/...` still passes unmodified, so no
  existing fixture exercises a corrupt `received_at`.
- a-m7: kept `GetRepo` (didn't delete it) — the finding's own text offers either fix ("either the
  method goes and the tests read through ListRepos, or its doc says it exists for tests"). Deleting
  it would break `repo_test.go` (in-package, listable) **and** `internal/server/sessions_test.go`
  (a different track's test file, `rg '\.GetRepo\(' -g '!*_test.go'` confirms zero production
  callers today but 6 test callers across two packages) for zero behavioural gain; correcting the
  doc closes the finding ("no false claim") with zero test breakage.
- a-note-6: `applyOneMigration` had to become its own function, not just a `defer` added inline in
  `Migrate`'s loop — a `defer` inside a `for` body only fires when the *enclosing function* returns,
  not per iteration, so leaving it in the loop would have deferred every migration's rollback to the
  very end of `Migrate` instead of right after each one's own commit/rollback. Verified this doesn't
  change behaviour: `go test ./internal/store/...` (includes `migrate_test.go`) passes unmodified.
- No REQ from this unit's assigned list (S4, S5, S6, S7, a-M1, a-m2, a-m4, a-m6, a-m7, a-note-6,
  c-m4, c-m5) is left undone.
- doc-delta: `docs/diagrams/daemon-components.md:20` says "`internal/server`: it declares its own
  `PaneChecker`, `PaneSnapshotter` and `Killer` ports" — `Killer` is now `TmuxSessions`. I did not
  edit `docs/` myself (not mine to write); flagging for whoever runs the X2/docs unit.

## Handoff

**Build status**: `go build ./...` exits 0.

```
$ gofmt -l .
(no output — clean, repo-wide)

$ go build ./... && echo BUILD_OK
BUILD_OK

$ go vet ./...
# github.com/Zalaras/muster/internal/session
vet: internal/session/manager_test.go:749:54: unknown field SessionKiller in struct literal of type Config
# github.com/Zalaras/muster/internal/server
vet: internal/server/sessions_test.go:789:81: unknown field SessionKiller in struct literal of type session.Config
(both sanctioned — see below; every other package vets clean)

$ go vet ./internal/store/... ./internal/tmux/... ./cmd/... ./internal/claudecode/...
(exit 0)

$ golangci-lint run --tests=false ./...
internal/server/issue.go:535:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:195:18: func (*Server).loadPrefs is unused (unused)
2 issues: * unused: 2
(both pre-existing, outside this unit's diff — D2's log already attributes them to b-m5/D6;
`git diff --stat` confirms neither issue.go nor prefs.go is touched by this unit)

$ go test -race -count=1 ./internal/store/... ./internal/tmux/...
ok  	github.com/Zalaras/muster/internal/store	9.960s
ok  	github.com/Zalaras/muster/internal/tmux	11.393s
ok  	github.com/Zalaras/muster/internal/tmux/tmuxtest	2.348s

$ python3 .claude/skills/orchestrate/scripts/dead-refs.py
dead-refs: 351 references checked, 0 missing
```

`internal/session` and `internal/server`'s own test binaries do not build (sanctioned — see below),
so `go test`/`-race` cannot run for those two packages until daemon-tests updates the call sites.

**Test files needing changes (sanctioned — a-M1's required-ports change and the `Killer`→
`TmuxSessions` rename)**:

1. **`Config.SessionKiller` field renamed to `TmuxSessions`** — every struct-literal site using
   the old field name fails to compile:
   - `internal/session/reconcile_shell_test.go`: lines 44, 81, 102
   - `internal/session/manager_test.go`: lines 1052, 1087, 1144, 2654, 2983, 3001, 3032, 3045, 3060
   - `internal/server/sessions_test.go`: lines 789, 856, 1147
2. **`session.Killer` type renamed `session.TmuxSessions`** — any test declaring a variable or
   parameter of that exact type name (as opposed to just passing a value via the `Config` field
   above) needs the type name updated. `rg -n 'session\.Killer\b' internal/server/sessions_test.go`
   shows it used only in two comments (lines 760, 1081), not a type position, so no server-side
   signature fix is needed here beyond the field-name rename above.
3. **Every `NewManager`/`session.NewManager` call site that omits one or more of
   `PaneChecker`/`PaneSnapshotter`/`TmuxSessions` now panics at construction** (a-M1's required-
   ports change) instead of building a degraded Manager:
   - `internal/session`: 32 call sites across `manager_test.go`, `manager_rail_test.go`,
     `manager_writeorder_test.go`, `reconcile_shell_test.go` (full list: `rg -n
     'NewManager\(Config\{' internal/session/*_test.go` — pasted in this unit's spawn-prompt
     evidence above). A handful already supply all three (e.g. `manager_test.go:2654` via a real
     `*tmux.Client`) and are unaffected.
   - `internal/server/sessions_test.go`: 16 call sites (`rg -n
     'session\.NewManager\(session\.Config\{' internal/server/sessions_test.go`), all of which
     supply at most `PaneChecker`+`SessionKiller`/none at all — every one of these panics under the
     new required-ports rule.
4. **Three test doubles need a `ResolveSessionTarget` method to satisfy `TmuxSessions`** wherever
   they're passed as one:
   - `internal/session/manager_test.go`'s `fakeKiller` (no `ResolveSessionTarget` today —
     `manager_writeorder_test.go`'s `fakeResolvingKiller` already wraps it with one, and is
     otherwise unaffected once its `NewManager` call's `SessionKiller:` field is renamed).
   - `internal/server/sessions_test.go`'s `errKiller` and `spawnerKiller` (neither has
     `ResolveSessionTarget`).
   - A minimal implementation matching Repair/revive's existing "fake that doesn't support it
     returns an error" contract (e.g. `return "", "", errors.New("not supported")`) preserves every
     existing test's intent, since none of these three doubles is used with a repair/reconcile-revive
     path today (confirm with `rg` before adding real per-test resolve behaviour).
5. **One shared test constructor (a-m8), which this unit's Major 1 explicitly depends on**: a
   single helper supplying default fakes for `PaneChecker`, `PaneSnapshotter` and `TmuxSessions`
   (satisfying `ResolveSessionTarget` too) with per-test overrides, to replace the 32+16 inline
   `NewManager(Config{...})`/`session.NewManager(session.Config{...})` sites above. Without it,
   every one of those 48 call sites needs its own three-field patch.

No other test file needed a change — the store and tmux packages' existing tests all still compile
and pass unmodified (verified above), confirming a-m2/a-m6/a-note-6/c-m4/c-m5's behaviour-preserving
claim.

## Fix Attempt 1 — `loadMigrations` fs seam (follow-up to a-m6)

**Failures addressed**: none (not a review finding) — a follow-up requested directly by team-lead:
`TestLoadMigrations_DuplicateVersionIsLoadError` (added above) swaps the package-level
`migrationsFS` var to inject a duplicate-version fixture, which is itself a
`docs/conventions.md` § Go violation ("never mutate state shared with other tests in the
package"). Asked to give `loadMigrations` an injectable seam instead so the test agent can pass
an `fstest.MapFS`.

**Changes made**: `internal/store/migrate.go` — `loadMigrations()` → `loadMigrations(fsys
fs.FS)`, reading via `fs.ReadDir`/`fs.ReadFile` (stdlib `io/fs` helpers, which work over any
`fs.FS` including `embed.FS` and `fstest.MapFS`) instead of calling `migrationsFS.ReadDir`/
`.ReadFile` directly. `Migrate` now calls `loadMigrations(migrationsFS)` — its one caller,
unchanged behaviour, production still reads the real embed. No other function touched.

- design: parameter named `fsys` (not `fs`) to avoid shadowing the `io/fs` package import —
  `rg -n '\bfsys\b' internal --type go` before naming it turned up no existing convention either
  way in this codebase, so this is a fresh, unshadowed choice, not a matched sibling.

**Decisions**: none beyond the above — behaviour is unchanged (`Migrate`'s only caller passes
the same `migrationsFS` it always read).

**Handoff (test file, sanctioned, not touched)**: `internal/store/migrate_test.go:87-97`
(`TestLoadMigrations_DuplicateVersionIsLoadError`) calls `loadMigrations()` with no argument and
swaps the package-level `migrationsFS` var — both now need to change (call
`loadMigrations(migratetest.DuplicateVersion)` directly, or switch to an inline
`fstest.MapFS` per the team-lead's stated plan of retiring `internal/store/migratetest`
entirely). This is the exact test-body change the team-lead's task description assigns to the
test agent, not an import-path fix, so left alone.

```
$ gofmt -l internal/store/migrate.go
(no output)

$ go build ./...
(exit 0)

$ go vet ./internal/store/...
vet: internal/store/migrate_test.go:91:27: not enough arguments in call to loadMigrations
	have ()
	want (fs.FS)
(sanctioned — see Handoff above; every other package unaffected by this change)

$ golangci-lint run --tests=false ./internal/store/...
0 issues.
```
