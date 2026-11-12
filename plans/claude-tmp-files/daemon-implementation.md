# Daemon Implementation: claude-tmp-files

**Plan**: claude-tmp-files
**Mode**: initial
**Pack**: kb: pack 25515 words (budget 30000)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/files.go` | modified | REQ-1: `FileSignal.ScratchpadDir`, set only when `scratchpad_dir` is absolute, clean, base `scratchpad`, parent named for the hook's `session_id` |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | `ScratchpadDir` option on `SessionStartOpts` and `ToolFileOpts` for wire-shaped fixtures |
| `internal/store/migrations/0020_scratchpad.sql` | created | `session.scratchpad_dir TEXT` |
| `internal/store/session.go` | modified | row field, update, select and scan for `scratchpad_dir` |
| `internal/session/session.go`, `row.go`, `writeorder.go` | modified | `Session.ScratchpadDir`, row mapping, write-order restore + field coverage list |
| `internal/session/reader.go` | modified | REQ-2/3: `Manager.SetScratchpad` (gated on current Claude session id, never clears, persists, broadcasts on change) |
| `internal/reader/reader.go` | modified | REQ-5/6: `Scope.ScratchDir` widens `PathQualifies` (lexical) and `Confine` (symlink-resolved) |
| `internal/reader/scratch.go` | created | REQ-4: `ListScratch` (nested, dot-dirs skipped, mtime desc then path) |
| `internal/server/reader.go` | modified | Observe calls `SetScratchpad`; scope shared by write observation and file route; listing carries `scratch` and plan `modifiedAt` |
| `internal/server/readerwire.go`, `sessionwire.go` | modified | REQ-3/4/13: `scratchpadDir`, `scratch` block, plan `modifiedAt` |
| `internal/server/renderfix.go`, `renderfix_normalise.go`, `renderfix_scenarios_reader.go` | modified | three scenarios (`reader-docs-scratch`, `-ended`, `-only`), scratch files recorded, `modifiedAt` normalised |
| `web/render/fixtures/*.json` | regenerated | every session now carries `scratchpadDir`; reader listings gain `scratch` and plan `modifiedAt` |

REQ-6 (docChanged + write log for scratch writes) is covered by the widened `PathQualifies` feeding the existing `observeWrite`.

## Decisions

design: `reader.ListScratch` is a small function in a new file beside `WalkMarkdown`, which it calls for the walk and 20,000 cap; `rg "WalkMarkdown|ModTime" internal/reader` found no mtime lister to reuse. Matches `Scope`/`WalkMarkdown` shape (pure fs, no logger).
design: `Manager.SetScratchpad` copies `SetTranscript`'s gate-and-persist shape, but broadcasts (REQ-3), via `persistWholeRowLocked(..., true)` like `SetPlan`. Writer: only the ingest worker through `readerFeature.Observe`; guard `Manager.mu` + write-order turnstile; `ScratchpadDir` added to `restoredSessionFields`.
design: `wellFormedScratchpad` has one owner, in `internal/claudecode/files.go`, beside `InterpretFiles` (the only reader of `scratchpad_dir`).
design: `readerScope(sess)` builds the `reader.Scope` for both `observeWrite` and the file route, replacing two inline literals.
deviation: render fixtures' scratch `modifiedAt` values are renumbered by the normaliser in tree walk order (listing is newest first, so the newest file gets the earliest minute); distinct values survive but chronology does not. Ages in render tests must be driven by the test's clock, not by these. → kb:adr/process-render-fixtures-normalise-modified-at
deviation: `modifiedAt` added to `renderfixTimeKeys` (plan's Affected Files lists renderfix_scenarios_reader.go only); needed so fixtures are stable across runs. → kb:adr/process-render-fixtures-normalise-modified-at
Not changed: the listing still answers 409 when the session's directory is missing, before the scratch block is built (contract silent; unchanged behaviour).
Size: `internal/store/session.go` is 559 lines (already over 500 before this change; +4 lines).
doc-delta: none beyond the plan's Doc Delta.

## Handoff

**Build status**: `go build ./...` exits 0. `make lint` reports one issue in a test file I may not edit: `test/canary/resume_test.go:240` testifylint `require-error` (from the earlier canary commit, not this work). `golangci-lint run --tests=false ./...` reports only `internal/claudecode/interpret_transcript.go:37 scanInterrupt unused`, which this work did not touch (it is used only by tests).

Test files needing changes: none required by compilation. Frozen-shape tests asserting the Session or reader listing JSON key set may need the new keys (`scratchpadDir`, `scratch`, plan `modifiedAt`): daemon-tests to update per the Protocol Contract delta.

Sanctioned breakage (migration 0020 raises the count from 19 to 20; test-file assertions are the test agent's): `internal/store/migrate_test.go:39,43,60` (`TestMigrate_AppliesInitSchema`, `TestMigrate_SecondCallIsANoOp`) and `internal/store/store_test.go:52` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`) expect 19 migrations. All other tests in claudecode, reader, session and server pass under -race. These test files compile; none is a compile break, so `make lint` was not blinded beyond the canary testifylint issue above.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: render-tests needs-scenario `reader-docs-scratch-tiles-3x2`; the earlier transient stale result from `make check-render-fixtures`.
**Changes made**:
- `internal/server/renderfix_scenarios_reader.go`: scenario `reader-docs-scratch-tiles-3x2` = `driveReaderScratch(scratchOpts{plan: true})` under `withPrefs` view=tiles, density=3x2 (same shape as `reader-docs-tiles-3x2`). New fixture `web/render/fixtures/reader-docs-scratch-tiles-3x2.json` (prefs view tiles, density 3x2 verified in the file).
- Flake cause, measured: a mid-run `gen` rewrote `reader-docs-plan.json` and `reader-docs-scratch.json` with `plan.modifiedAt` collapsed to the epoch. The normaliser numbers distinct RFC3339 values at second granularity, and the plan file's mtime (written at "now") sometimes fell in the same second as a session timestamp, so two instants merged and every later minute shifted. `writeReaderPlan` now sets the plan mtime to one hour ago, so it is never equal to a session instant (the scratch files already used offsets).
**Evidence**: after the change, `make gen-render-fixtures` leaves reader-docs-plan/scratch byte-identical to HEAD and adds only the new fixture; `make check-render-fixtures` run twice: both exit 0, "render fixtures up to date (114 scenarios)". `golangci-lint run --build-tags renderfix ./internal/server/...`: 0 issues; `go build ./...` exits 0.
**Decisions**: design: reused `withPrefs` and `driveReaderScratch` (siblings in the same file); no new type. Blast radius of `writeReaderPlan`: callers `driveReaderDocsPlan` and `driveReaderScratch(plan:true)` (scenarios reader-docs-plan, reader-docs-scratch, -ended, -tiles-3x2); the regenerated fixtures for the first three are unchanged.
- `internal/claudecode/claudecodetest/claudecodetest.go`: `RawPreToolUseTool` now calls `addScratchpad(body, opts.ScratchpadDir)` like `RawPostToolUseFile`, so REQ-1's table can be exercised on PreToolUse. Other consumers pass no ScratchpadDir, so their payloads are unchanged.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: code Major 4, maintainability Minor 3, 4, 5.
**Changes made**:
- `internal/reader/CLAUDE.md`: Owns names `ScratchDir` and `ListScratch`; Confine invariant names `Dir`, `ScratchDir`, the plan path; exemplar says three paths.
- `internal/server/readerwire.go` `wireScratchpadDir`: copies (`v := s.ScratchpadDir; return &v`) like `sessionwire.go` ClaudeSessionID. Only caller of the helper is the session wire builder; every path now yields a copy.
- `internal/server/renderfix.go`: scratch capture moved to `readerScratchPaths` in `renderfix_scenarios_reader.go` (the reader render-fixture home). renderfix.go is 564 lines (was 563 on main); the one-line call it keeps is the reader capture's existing seam.
- `driveReaderScratch`: transcript is `filepath.Join(r.root, "_transcripts", "reader-scratch.jsonl")`, matching `writeReaderPlan`; every path the scenario names is under `r.root`.
**Evidence**: `make gen-render-fixtures`, then `make check-render-fixtures` twice: "render fixtures up to date (114 scenarios)" both times; fixtures unchanged. `make lint` 0 issues; `go test -race ./internal/reader ./internal/server` ok; build and vet clean.
**Decisions**:
- design: `readerScratchPaths` sits beside `writeReaderPlan` and the other reader scenario helpers; `rg "scratch" internal/server/renderfix*.go` found no existing helper to reuse. `renderfix_scenarios_reader.go` is 517 lines (filelen WARN), kept because it is the one file holding reader fixture drivers and the moved function is its natural member; the split into another file would only silence the warning.

## Fix Attempt (review cycle 1, scenario)

**Failures addressed**: render-tests Handoff `needs-scenario: reader-docs-scratch-large`.
**Changes made**: `internal/server/renderfix_scenarios_reader.go` — `scratchOpts.large` writes `readerLargeDocs()` (20 files + outline) under the session dir before the scratch files; scenario `reader-docs-scratch-large` = `scratchOpts{plan: true, large: true}` (4 scratch files, plan, ~21 `.md`). Fixture `web/render/fixtures/reader-docs-scratch-large.json` generated; `make check-render-fixtures` twice: "up to date (115 scenarios)". Build, vet, gofmt, `make lint` (0 issues), `go test -race ./internal/server/...` green.
**Decisions**: design: extended the existing `scratchOpts` and reused `readerLargeDocs` (sibling `driveReaderDocsLarge`) rather than a new driver; paths all under r.root.

## Fix Attempt (review cycle 1, large tiles scenario)

**Failures addressed**: render-tests Handoff `needs-scenario: reader-docs-scratch-large-tiles-3x2`.
**Changes made**: `internal/server/renderfix_scenarios_reader.go` adds scenario `reader-docs-scratch-large-tiles-3x2` = `driveReaderScratch(scratchOpts{plan: true, large: true})` under `withPrefs` view=tiles, density=3x2 (same derivation as `reader-docs-scratch-tiles-3x2`). Fixture `web/render/fixtures/reader-docs-scratch-large-tiles-3x2.json` generated (prefs view tiles, density 3x2 verified).
**Evidence**: `make check-render-fixtures` run twice: "render fixtures up to date (116 scenarios)" both; `go build ./...` exits 0; `make lint` 0 issues. Only the new fixture was added.
**Decisions**: design: reused `withPrefs` and `driveReaderScratch`; no new type.
