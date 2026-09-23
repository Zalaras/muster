# Daemon Implementation: Maintainability Cleanup — D2 session shape

**Plan**: maintainability-cleanup
**Mode**: initial
**Pack**: `kb: pack` — read `plan.md` § Units → D2, `review.maintainability.a-session.md` (Seed S3, Minors 1/3/5), and `daemon-implementation-F1.md` directly per the spawn prompt, plus `docs/conventions.md` § Design.

## Step 1 — pure moves only

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/manager.go` | rewritten (pure move) | Shrunk from 1970 to 351 lines. Keeps ports (`PaneChecker`/`PaneSnapshotter`/`Killer`/`Watcher`), sentinels, `Config`/`Manager`/`NewManager`/`LoadAll`/`LockSession`, `CreateParams`/`CreateSession` ("create"), `DeleteSession` ("delete"), `removeFromMemory`, `sessionTmuxName`, read accessors (`Get`/`Exists`/`Resolve`/`PaneOf`/`List`), `broadcast`. |
| `internal/session/writeorder.go` | created (pure move) | F1's write-ordering turnstile: `nextWriteTurnLocked`, `finishWrite`, `cloneRestore`. No imports needed. |
| `internal/session/reconcile.go` | created (pure move) | `ReconcileReport`, `targetResolver`, `Reconcile` (+ its long doc), `logReconcile`, `actOnReconcile`, `classifySessionsByOwnership`, `reconcileRow`, `classifiedTmuxNames`, `classifyTmuxNames`, `reportAndSweepUnknown`, `RepairOwnedSession`, `reviveOwnedSession`, `classifySessions`. |
| `internal/session/liveness.go` | created (pure move) | `Start`, `Stop`, `Snapshot`, `captureSnapshot`, `storeSnapshot`, `pollLoop`, `checkLiveness`, `Nudge`, `checkOneLiveness`, `markEnded`. |
| `internal/session/actions.go` | created (pure move) | `RecordLaunch`, `End`, `endLocked`, `EndAll`, `shellNamesOnSocket`, `KillAllShells`, `ShellCount`, `Remove`, `removeLocked`, `RecordResume`. |
| `internal/session/apply.go` | created (pure move) | `Apply`, `isBindKind`, `ApplyStatus`. |
| `internal/session/title.go` | created (pure move) | `SetTitle`, `MarkSeen`. |
| `internal/session/reader.go` | created (pure move) | `SetTranscript`, `SetPlan`, `MarkPlanWritten`, `ApplyPlanScan`. |
| `internal/session/manager_rail.go` | created (pure move) | `maxRailPosLocked`, `railEntriesLocked`, `railWrite`, `errRailWriteAborted`, `applyRailChangesLocked`, `persistAndBroadcastRail`, `SetPinned`, `SetOrder`. |
| `internal/session/row.go` | created (pure move) | `applyReaderRowFields`, `rowToSession`, `sessionToRow`. |

`internal/session/railorder.go` untouched (already pure algebra, per the spawn prompt).

## Decisions

- **RecordLaunch** is not named in the spawn prompt's mapping. It pairs with `RecordResume` — both stamp `TmuxTarget`/`TmuxPane` after a spawn, persist and broadcast, identical shape and both reference `sessionTmuxName`/`endRemoveTmuxTimeout`. It joins `actions.go` beside `RecordResume` rather than staying in `manager.go`, whose retained bucket is registry/lifecycle plumbing (`create`/`delete`/`removeFromMemory`) and read accessors, not per-session mutating actions.
- **MarkSeen** is not named in the mapping either. It is the same shape as `SetTitle` — an id-scoped setter behind `m.mu`, single-field change detection, persist+broadcast via `finishWrite`/`cloneRestore` — so it joins `title.go` rather than bloating `manager.go` with a business setter, which would undercut the point of the split.
- **sessionTmuxName** stays in `manager.go`: it's a small pure naming helper (`"muster-" + id`) used by both `reconcile.go` (`RepairOwnedSession`) and `actions.go` (`End`/`removeLocked`) — keeping it in the shared/core file avoids implying ownership by either sibling. `endRemoveTmuxTimeout`/`defaultPollInterval` stay as package-level consts in `manager.go` for the same reason (referenced from `reconcile.go`, `actions.go` and `liveness.go`).
- `writeorder.go` split out as its own file per the spawn prompt's suggestion — F1's turnstile primitives (`nextWriteTurnLocked`/`finishWrite`/`cloneRestore`) are generic write-ordering infrastructure used by every other file, not business logic of any one domain; giving them their own file avoids an arbitrary "which domain file owns the shared primitive" call.
- No code changes: every moved declaration (body, comments) is byte-identical to the original; only the per-file `import` blocks differ, computed per file from the identifiers actually used in that file's moved declarations.

**Pure-move verification**: stripped `import (...)` blocks, `package` lines and blank lines from the original `manager.go` (via `git show HEAD:internal/session/manager.go`) and from the concatenation of all ten resulting files, then `sort | uniq -c | sort -n` on each and diffed:

```
$ diff /tmp/old_lines_sorted.txt /tmp/new_lines_sorted.txt && echo "IDENTICAL MULTISET"
IDENTICAL MULTISET
$ wc -l /tmp/old_lines_sorted.txt /tmp/new_lines_sorted.txt
    1214 /tmp/old_lines_sorted.txt
    1214 /tmp/new_lines_sorted.txt
```

The multiset of non-import, non-blank lines is identical before and after.

## Gates (step 1)

```
$ go build ./...
(exit 0)

$ go vet ./...
(exit 0)

$ gofmt -l internal/session/
(no output — clean)

$ make lint
golangci-lint run
0 issues.

$ go test -count=1 ./internal/session/...
ok  	github.com/Zalaras/muster/internal/session	4.096s

$ go test -race -count=1 ./internal/session/... ./internal/server/...
ok  	github.com/Zalaras/muster/internal/session	31.573s
ok  	github.com/Zalaras/muster/internal/server	103.469s
```

`make size-warn`: `internal/session/manager.go`'s filelen warning is gone (1970 → 351 lines, well under the 500-line threshold); no new file in the split trips filelen (largest is `reconcile.go` at 376 lines). `row.go:19 rowToSession` (67 stmts) and `row.go:93 sessionToRow` (42 stmts) funlen warnings persist unchanged — that's a-m1, next in step 2.

## Handoff

**Build status**: `go build ./...` exits 0.
No test files needed changes — every existing test in `internal/session` still compiles and passes unmodified (test files reference package-level symbols, unaffected by which file declares them).

Step 1 complete, verified and committed by the main session (02e8051, blame-ignored in d4011fd).

## Step 2 — a-m1, a-m3, a-m5

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/session/row.go` | modified | a-m1: replaced the ~20 hand-written nil↔zero conversions (and the two-field `applyReaderRowFields` split that existed only to dodge gocyclo) with two generic helpers (`derefOrZero`/`ptrOrNil`, one line per simple optional scalar field) plus four small composite-mapping functions (`modelFromRow`/`modelToRow`, `contextFromRow`/`contextToRow`, `attentionFromRow`/`attentionToRow`, `failureFromRow`/`failureToRow`) for the four fields whose mapping is genuinely conditional (fallback display name, all-or-nothing group). `rowToSession`/`sessionToRow` are now each a flat list of field assignments plus calls to the four composite helpers — no arbitrary split needed to pass funlen/gocyclo. |
| `internal/session/reconcile.go` | modified | a-m3: `Reconcile`'s signature dropped its always-`nil` `error` return — `func (m *Manager) Reconcile(ctx context.Context) ReconcileReport`. |
| `internal/server/server.go` | modified | a-m3's one caller (`Start`, line 244) updated: `s.manager.Reconcile(ctx)` — the error check that could never fire is gone (it already discarded the report). |
| `internal/session/manager.go` | modified | a-m5: added a guard/reach doc comment above `mu`/`sessions`/`byClaude` stating what `mu` guards (all of `sessions`/`byClaude`/`idLocks`/`writeChain`/`nextRailPos`, and every field of a `*Session` in `sessions` — "mutable only while `mu` is held", tying it explicitly to the Critical-1 rule) and its reach (every exported read takes its own `Clone()` before releasing `mu`). `idLocks` is now created eagerly in `NewManager` (alongside `sessions`/`byClaude`) instead of lazily inside `LockSession`; `LockSession`'s nil-check on `m.idLocks` was removed accordingly. |

## Decisions

- design: `derefOrZero[T any](p *T) T` / `ptrOrNil[T comparable](v T) *T` — one generic pair covering every "nullable DB column ↔ zero-value Go field" mapping (`TranscriptPath`, `PlanPath`, `TmuxPane`, `ClaudeSessionID`, `LastSnapshot`, and `LastSnapshotAt`'s deref direction only — see below). `rg -n 'func deref|func ptrOrNil|func ptrIf|\[T any\]|\[T comparable\]' --type go` (excluding tests) found nothing to reuse; this is a new seam, justified by a-m1 naming exactly this repeated shape as the finding.
- design: `modelFromRow`/`contextFromRow`/`attentionFromRow`/`failureFromRow` (+ their `*ToRow` mirrors) are the "cohesive block" extraction a-m1 asks for, replacing the old `applyReaderRowFields` split that a-m1 called out as arbitrary (peeling out two unrelated fields only to dodge gocyclo). Each new helper is a real named concept ("build `*Model` from a row", "build `*Context` from a row", …) with its own conditional logic (Model's id→display-name fallback, Context's all-or-nothing three-column group), matching conventions § Go's "extracting a *cohesive* block" allowance rather than an arbitrary line-count split.
- `LastSnapshotAt`'s `sessionToRow` direction was deliberately **not** folded into the generic `ptrOrNil[T comparable]` despite being structurally identical to the string fields: `ptrOrNil` decides "is this the zero value" via `v == zero`, but the existing code (and every other zero-check on a `time.Time` in this package) uses `.IsZero()`. `time.Time`'s own doc says `==` is not the general way to compare instants (monotonic-reading component). Every actual value this field ever holds (either genuinely never-set, or `time.Now().UTC()`/DB round-tripped) would compare identically either way, but changing the comparison operator on a `time.Time` field is not a change this "behaviour unchanged" unit should make silently — kept as the original explicit `if !s.LastSnapshotAt.IsZero()` block, with a comment stating why it isn't `ptrOrNil`. The deref direction (`row.LastSnapshotAt *time.Time → time.Time`) has no such risk (it's a plain nil-pointer check, not a value comparison) and does use the generic `derefOrZero`.
- a-m3: no deviation — the plan's ask ("the signature says what the function can return") is exactly what shipped. The only production caller (`internal/server/server.go:244`) already discarded the report and only branched on an error that could never fire; per the finding, that branch is now gone rather than kept as dead code.
- a-m5: `writeChain`'s own lazy-init in `nextWriteTurnLocked` (writeorder.go, from F1) was left as-is — a-m5 names `idLocks` specifically ("LockSession also lazily creates idLocks … while NewManager eagerly creates the other two maps"); `writeChain` isn't one of "the other two maps" the finding contrasts idLocks against, and F1 already reviewed and shipped that lazy-init pattern for `writeChain` under its own review pass. Not addressed here to stay inside this unit's stated scope.
- No REQ from this unit's list (a-m1, a-m3, a-m5) is left undone.

## Gates (step 2)

```
$ go build ./...
(exit 0)

$ gofmt -l .
(no output — clean, repo-wide)

$ go test -count=1 ./internal/session/... ./internal/store/...
ok  	github.com/Zalaras/muster/internal/session	4.084s
ok  	github.com/Zalaras/muster/internal/store	2.111s
```

(This test run was taken right after the row.go/manager.go changes, before the a-m3 signature
change made the session package's *test files* stop compiling — see below.)

**a-m3's signature change breaks 11 existing call sites across 3 test files** (sanctioned —
`Reconcile ctx) (ReconcileReport, error)` → `(ReconcileReport)`, a changed constructor/method
signature is explicitly listed as sanctioned breakage in the plan's Rules):

```
$ rg -n 'Reconcile\(ctx\)' internal/session/*_test.go
internal/session/manager_rail_test.go:273:	_, err = mgr.Reconcile(ctx)
internal/session/manager_test.go:999:	report, err := mgr.Reconcile(ctx)
internal/session/manager_test.go:1056:	report, err := mgr.Reconcile(ctx)
internal/session/manager_test.go:1092:	report, err := mgr.Reconcile(ctx)
internal/session/manager_test.go:1150:	_, err = mgr.Reconcile(ctx)
internal/session/manager_test.go:2712:	_, err = mgr.Reconcile(ctx)
internal/session/manager_test.go:2760:	_, err = mgr.Reconcile(ctx)
internal/session/manager_test.go:2802:	_, err = mgr.Reconcile(ctx)
internal/session/reconcile_shell_test.go:47:	report, err := mgr.Reconcile(ctx)
internal/session/reconcile_shell_test.go:85:	report, err := mgr.Reconcile(ctx)
internal/session/reconcile_shell_test.go:107:	report, err := mgr.Reconcile(ctx)
```

Each needs its `err`-returning assignment/check removed (`x, err := mgr.Reconcile(ctx)` →
`x := mgr.Reconcile(ctx)`, plus whatever `require.NoError(t, err)`/similar follows). This is a
signature change, not an assertion change — inside the "moved symbol/changed constructor
signature" sanctioned-breakage carve-out — but I may not touch test files myself.

**This blinds `go vet ./internal/session/...` and `make lint`** for the whole repo (golangci-lint
stops at the first typecheck failure and reports nothing else) — restored signal via
`--tests=false` and by scoping vet/race to the packages that still compile:

```
$ go vet ./internal/store/... ./internal/server/... ./cmd/...
(exit 0)

$ golangci-lint run --tests=false ./...
internal/server/issue.go:541:18: func (*Server).buildIssueSnapshot is unused (unused)
internal/server/prefs.go:192:18: func (*Server).loadPrefs is unused (unused)
2 issues: * unused: 2
```

Both `unused` hits are pre-existing and untouched by this unit: `Server.buildIssueSnapshot` and
`Server.loadPrefs` are each documented in their own file as "a thin test-facing delegator"
(`issue.go:539-540`, `prefs.go:190-191`) that exists *only* so `issue_test.go`/`prefs_rail_test.go`/
`prefs_test.go` can call them directly — with `--tests=false` excluding those callers, golangci-lint
correctly (if noisily) reports them unused. Neither file is part of this unit's diff
(`git diff --stat -- internal/session internal/server/server.go` touches only `manager.go`,
`reconcile.go`, `row.go`, `server.go`). This is exactly the test-only-production-surface shape
b-m5 names for the server track's D6 unit, not mine to fix here.

```
$ go test -race -count=1 ./internal/server/... ./internal/store/...
ok  	github.com/Zalaras/muster/internal/server	102.775s
ok  	github.com/Zalaras/muster/internal/store	8.812s

$ go test -race -count=1 ./internal/session/...
FAIL	github.com/Zalaras/muster/internal/session [build failed]
(same 11 sanctioned assignment-mismatch errors as above — package cannot build until
daemon-tests updates those call sites)
```

`make size-warn`: `row.go:19 rowToSession`/`row.go:93 sessionToRow`'s funlen warnings (67/42
statements) are gone — no session-package function appears in the size-warn output at all now.
No new warning introduced.

## Handoff

**Build status**: `go build ./...` exits 0 (production tree compiles clean).

**Test files needing changes** (a-m3's signature change, sanctioned — I may not edit test files
beyond an import-path fix, and this is an assignment-arity fix, not one): the 11 call sites listed
above in `internal/session/manager_rail_test.go`, `internal/session/manager_test.go` and
`internal/session/reconcile_shell_test.go`. Until daemon-tests updates them, `internal/session`'s
test binary does not build, which also blinds `go vet ./internal/session/...` and whole-repo
`make lint` (both worked around above via `--tests=false` and package-scoped vet/race, both clean
against this unit's actual diff).
