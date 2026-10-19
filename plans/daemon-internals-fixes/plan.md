# Plan: daemon-internals-fixes

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Features**: ingest, update, launch
**Description**: Cap the ingest body at 20 MiB, and swap in the self-updater's new binary through the daemon's one shared atomic write, moved to its own package.

## Symptom

Two entries from `TODO.md` § Daemon internals: ingest and the self-updater (the third entry
in that group, the owner of the ingest route and `MUSTER_SESSION`, is held back):

- **The ingest endpoint accepts hook bodies of any size.** From `plans/maintainability-cleanup/`.
- **The self-updater swaps in the new binary with its own temp-file-and-rename writer** — it
  should use the daemon's shared atomic write (a fresh temp name, synced before the rename). From
  `plans/maintainability-regressions/`.

## Findings

**Ingest.** `handleIngest` (`internal/server/ingest.go:321`) reads the body with an unbounded
`io.ReadAll`; `locate.go:60` bounds its upload with `http.MaxBytesReader`. A throwaway test posted a
64 MiB hook body through `srv.Handler()`:

```
status=200 bodyLen=67108942
persisted events for huge-1: 1
```

Real sizes, measured read-only on the developer's live `muster.db` (39,415 events, 2026-08-22 →
2026-10-19): the largest is a `PostToolBatch` at 703,253 bytes; `PostToolUse` peaks at 636,182 (a
Read); `status_line` never exceeds 2,137. The developer chose a 20 MiB cap (~28× the largest seen).
Over the cap the post is still answered `200` (never make Claude Code retry, `kb:anchor/ingest`)
and dropped, as malformed JSON already is; truncating would only produce malformed JSON.

**Self-updater.** `installBinary` (`internal/selfupdate/apply.go:220`) writes to the fixed name
`.musterd-<tag>.tmp` beside the binary with `os.WriteFile`, chmods, renames — no fsync before the
rename, and anything already at that fixed name blocks the install. A throwaway test with a
directory left at `.musterd-v9.9.9.tmp`:

```
installBinary err=writing new binary: open …/.musterd-v9.9.9.tmp: is a directory; exe now="old"
```

The shared writer, `AtomicWriteFile` (`internal/claudecode/settings.go:387`: `os.CreateTemp` in the
target's directory, chmod, write, `Sync`, rename, unchanged content left untouched), lives in
`internal/claudecode` only because the wrapper scripts were its first caller
(`plans/maintainability-regressions/daemon-implementation.md`, the `design:` line). The
maintainability review there called it generic file I/O that does not belong in the Claude Code
package. The developer chose to move it to its own leaf package, `internal/atomicfile`, beside
`internal/boundedwait`/`keyedlock`/`evict`, with all three callers on it. The `ingest` feature owns
the new package (its first use, kb:adr/ingest-wrapper-scripts-replaced-atomically); its `go:` glob
gains `internal/atomicfile/**` in a `docs(daemon-internals-fixes)` commit the orchestrator makes once
the package exists (`check-kb` refuses a glob that matches no file, and impl agents do not edit `docs/`).

## Requirements

### Must Have

- **REQ-1**: A hook or status post whose body exceeds 20 MiB (20 × 2²⁰ bytes) is answered `200`
  with an empty body, persists no event, enqueues nothing, and logs one line naming the endpoint
  kind and the limit — never the body. A body of exactly 20 MiB is accepted as today.
- **REQ-2**: The self-updater installs the new binary through `atomicfile.Write` at mode `0o755`: a
  fresh temp name in the binary's directory, synced before the rename. A leftover file or directory
  named `.musterd-<tag>.tmp` beside the binary no longer blocks the install. Every failure still
  leaves the binary byte-identical and no temp file behind (kb:adr/update-trust-root-minisign-signed-checksums).
- **REQ-3**: `internal/atomicfile` holds the one atomic-replace implementation, moved verbatim from
  `claudecode.AtomicWriteFile`, which no longer exists. `claudecode.writeScriptAtomically` and
  `server`'s settings write in `launcher.go` call it. Behaviour unchanged for both: same modes, same
  skip of unchanged content.

## Affected Files

### Daemon (daemon-impl)

- `internal/server/ingest.go` — REQ-1: bound the body read with `http.MaxBytesReader` at a named
  20 MiB constant; on a too-large error answer `200`, log kind and limit at warn, enqueue nothing.
- `internal/atomicfile/atomicfile.go` (new) — REQ-3: `Write(path string, content []byte, perm os.FileMode) error`, moved from `claudecode.AtomicWriteFile` with its doc comment.
- `internal/claudecode/settings.go` — REQ-3: drop `AtomicWriteFile`; `writeScriptAtomically` calls `atomicfile.Write`.
- `internal/server/launcher.go` — REQ-3: the settings write calls `atomicfile.Write`.
- `internal/selfupdate/apply.go` — REQ-2: `installBinary` calls `atomicfile.Write(exePath, data, 0o755)`; its doc comment and `Apply`'s say what is now true. The `tag` parameter goes if nothing else needs it.

### Existing tests this breaks

- none expected. `internal/claudecode/settings_test.go`'s `TestWriteScriptAtomically_*` call the
  unexported wrapper, which stays. Any selfupdate test asserting the fixed temp name would break;
  daemon-tests checks.

## Proof

Written red-first by **daemon-tests**:

1. `internal/server/ingest_test.go` — `TestHandleIngest_OversizedBodyReturns200AndPersistsNothing`:
   a hook body of 20 MiB + 1 byte (a valid `SessionStart` padded in an extra field) posted to
   `/ingest/<token>/hook` gets `200` and, after the worker drains, `countEventsForSession == 0`.
   Red today: the event persists (count 1).
2. `internal/selfupdate/apply_test.go` (or the file holding installBinary's tests) —
   `TestInstallBinary_StaleFixedTempNameDoesNotBlockInstall`: a directory at
   `.musterd-<tag>.tmp` beside the binary; `installBinary` returns nil and the binary holds the new
   bytes. Red today: `is a directory`.

After green, daemon-tests in its ordinary mode adds `internal/atomicfile/atomicfile_test.go`: the
`TestWriteScriptAtomically_*` behaviours (rename keeps an open fd reading old content; unchanged
content keeps inode and mtime; fresh path written at the given mode) asserted against
`atomicfile.Write` directly.

## Edge Cases

1. A body of exactly 20 MiB is accepted and persists → D1 (`TestHandleIngest_BodyAtLimitPersists`).
2. An oversized status post (not only hook) is dropped too → D1 (shared with edge case 1; same handler, one test may table both endpoints).
3. The oversized-body log line carries no payload text → D1 (shared with edge case 1; extend or mirror `TestHandleIngest_NeverLogsPayloadBodies`).
4. A failed install leaves no temp file in the binary's directory → D2.

## Acceptance Criteria

### Automated Checks

```checks
D1 go test -count=1 -run 'TestHandleIngest_' ./internal/server/
D2 go test -count=1 -run 'TestInstallBinary_' ./internal/selfupdate/
D3 go test -count=1 ./internal/atomicfile/ ./internal/claudecode/ ./internal/selfupdate/
D4 ! rg -n 'func AtomicWriteFile' internal/
D5 ! rg -n 'os\.WriteFile\(tmpPath' internal/selfupdate/
D6 make lint
```

### Reviewer-Verified

- `internal/atomicfile` imports nothing internal; `internal/selfupdate` does not import `internal/claudecode`.
- The oversized-body log line is at warn, names the kind and the limit, and nothing from the body.

## Doc Delta

- **ingest** — becomes true: a post whose body exceeds 20 MiB is answered `200` and dropped with a
  log line naming its kind, like malformed JSON (`docs/features/ingest/spec.md` handler paragraph;
  `docs/protocol.md` `kb:anchor/ingest` bullet "Malformed JSON is still `200`").
- **daemon-components diagram** (`docs/diagrams/daemon-components.md`) — becomes true:
  `internal/atomicfile` is a shared primitive (Shared primitives boundary, plus the prose paragraph
  on primitives) imported by `internal/claudecode`, `internal/server` and `internal/selfupdate`.
  Stops being true: "`internal/claudecode` import[s] nothing internal" — it now imports one
  shared primitive; the sentence says so.
- **update** — `docs/features/update/spec.md` says the binary is written "beside the running one and
  renames it over the resolved path"; still true, add "synced, under a fresh temp name" only if the
  surrounding text names the temp file.

## Out of scope

- Who owns the ingest route and `MUSTER_SESSION` (the third entry in the group) — held back by the
  developer: it renames things in `internal/claudecode` while plan/see-added-dirs is open there.
