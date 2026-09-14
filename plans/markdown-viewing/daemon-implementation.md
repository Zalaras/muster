# Daemon Implementation: Markdown viewing

**Plan**: markdown-viewing
**Mode**: initial
**Pack**: `<!-- kb:pack plan=markdown-viewing role=daemon-impl -->` (features: reader, surfaces, lifecycle, ingest)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `internal/claudecode/plan.go` | created | Moved from the spike, adapted: `PlanFile{Path,Source}`, `LocatePlanFile(transcriptPath, home)`, `scanPlanFile`, `DefaultPlansDir`, `IsUnderDefaultPlansDir`. `home` is now an explicit parameter (not `os.UserHomeDir()` read internally) so tests control it without mutating process-wide `$HOME`. |
| `internal/claudecode/files.go` | created | `FileSignal{TranscriptPath, WrittenPath, PlanMaybeReady}` and `InterpretFiles(eventType, payload) FileSignal` — the only other reader of transcript_path/tool_name/tool_input.file_path. |
| `internal/claudecode/claudecodetest/claudecodetest.go` | modified | Additive builders: `RawPostToolUseFile`, `RawPreToolUseTool`, `EnvelopedSessionStartTranscript`, `PlanAttachmentLine`, `SlugLine` — wire-shaped fixtures for D5/D6/D9/D13/D16/D20 tests. No existing builder's signature or output changed. |
| `internal/session/session.go` | modified | `Session` gains `TranscriptPath`, `PlanPath`, `PlanExists` (display-only, never read by `machine.go`). |
| `internal/session/manager.go` | modified | `SetTranscript(ctx, id, claudeSessionID, path) (bool, error)` (persist-only-on-change, never broadcasts, D15) and `SetPlan(ctx, id, claudeSessionID, path, exists) (*Session, bool, error)` (persist+broadcast on change). Both refuse (no persist/broadcast) when `claudeSessionID` doesn't match the session's current binding — REQ-26/INV-8. `rowToSession`/`sessionToRow` carry the three fields; the two new ifs in `rowToSession` were pulled into a helper `applyReaderRowFields` to stay under the gocyclo-15 ceiling (was pushing it to 17). |
| `internal/store/session.go` | modified | `SessionRow` gains `TranscriptPath *string`, `PlanPath *string`, `PlanExists bool`; insert (unaffected — new columns default NULL/0), update and select SQL/scan updated. SQL column is `transcript_file` (matches the migration), Go field `TranscriptPath`. |
| `internal/store/migrations/0008_reader.sql` | created | `transcript_file TEXT`, `plan_path TEXT`, `plan_exists INTEGER NOT NULL DEFAULT 0` — exactly the plan's Schema Changes block. |
| `internal/server/reader.go` | created | `readerFeature{manager, hub, log, runGit, home, writes}`, `mount` (the two GETs), `Observe` (transcript → `SetTranscript`; written path → write log + `docChanged` + plan-exists flip; `PlanMaybeReady` → `scanPlan` → `SetPlan`), pure `confine`/`readerPathQualifies`, `listMarkdown`/`walkMarkdown` (git `ls-files -co --exclude-standard -z` with a walk fallback, capped at 20,000), `writeLog` (per-session map capped at 512, `forgetSession`). |
| `internal/server/readerwire.go` | created | `readerFileWire`, `readerPlanWire`, `readerListingWire`, `docChangedMessage`, `sessionWirePlan` + `toWireSessionPlan`. |
| `internal/server/sessionwire.go` | modified | `sessionWire` gains `Plan *sessionWirePlan`; `toWireSession` fills it via `toWireSessionPlan`. |
| `internal/server/ingest.go` | modified | `ingestQueue` gains an optional `files filesObserver` field (interface: `Observe(ctx, sessionID, claudeSessionID, sig)`); `process` calls it after `Apply`, for routed hook events only (the existing `status_line` early return already skips it). |
| `internal/server/sessions.go` | modified | `sessionsFeature` gains a `reader writeLogForgetter` field (interface: `forgetSession(id)`); `handleRemoveSession` calls it once, after a successful `Remove` (edge case 28). |
| `internal/server/server.go` | modified | `s.reader = register(s, newReaderFeature(s.manager, s.hub, cfg.Logger))`, `s.sessions.reader = s.reader`, `s.ingest.queue.files = s.reader` — one-line registration plus the two post-construction wiring assignments the existing `usage`/`update`/`ingest` features already use. |
| `internal/claudecode/CLAUDE.md`, `internal/server/CLAUDE.md`, `internal/session/CLAUDE.md` | modified | Hand-written head only: added `reader` to **Features**. |

## Decisions

- `LocatePlanFile`'s signature gained an explicit `home string` parameter (spike had none — it called `os.UserHomeDir()` internally). Rationale: `docs/conventions.md` §Go forbids tests mutating state shared with other tests in the package, and `os.Setenv("HOME", …)` is process-global — an explicit parameter is the only way `TestLocatePlanFile` (D5) controls the slug-fallback directory without that hazard. This is a private Go signature inside `internal/claudecode`, not a REQ or the protocol contract; `IsUnderDefaultPlansDir` (used only from `InterpretFiles`, whose own signature is fixed by the plan) still resolves `$HOME` internally since it has no caller-supplied value to thread through.
- `readerFeature.home` is resolved once at construction (`os.UserHomeDir()`, warned-and-empty on error) and threaded into every `LocatePlanFile` call (`Observe`'s `scanPlan` and `handleReaderList`'s reader-open trigger) — the field the Affected Files line named but didn't otherwise explain a use for.
- `docChanged`'s scope check (`readerPathQualifies`) uses **lexical** confinement (`filepath.Clean` + prefix, no symlink resolution) per the Protocol Contract's own wording ("after `filepath.Clean`, sits lexically under…"), while `/reader/file`'s `confine` uses **symlink-resolved** confinement (REQ-20/INV-2) — these are deliberately two different checks, not one shared function, because the contract specifies different rules for the two surfaces.
- `writeLog` records a routed write into its per-session map regardless of whether `claudeSessionID` matches the session's current binding — only `SetTranscript`/`SetPlan` (persisted, wire-visible state) enforce the REQ-26/INV-8 gate. This matches edge case 5 verbatim ("its written path is recorded… but the transcript path is not moved").
- Renamed the production `git` exec helper to `readerRunGit` (not `runGit`) — `internal/server/repos_test.go` already declares a test helper named `runGit`; `go vet` failed with a redeclaration error before the rename. No test file was edited.
- `rowToSession`'s two new one-line `if row.X != nil` blocks were extracted into `applyReaderRowFields` — `golangci-lint`'s `gocyclo` flagged the function at 17 (ceiling 15) with them inline.
- `walkMarkdown`'s two intentional "skip this unreadable/unrelatable entry, don't fail the listing" `return nil` branches inside a non-nil-`err` check needed `//nolint:nilerr` (each with its own reason) — this is the standard idiom for a `filepath.WalkDir` callback that deliberately continues past one bad entry, and `nilerr` has no other way to allow it.

## Handoff

**Build status**: `go build ./...` exits 0.
`go vet ./...`, `gofmt -l .` (whole tree) and `make lint` (`golangci-lint run`) are all clean (0 issues). `python3 .claude/skills/orchestrate/scripts/dead-refs.py` reports 0 missing (732 checked).

**Sanctioned test breakage** (frozen assertions the plan's Schema Changes necessarily invalidates — I may not edit test files beyond an import-path fix, and this isn't one):
- `internal/store/migrate_test.go:42` (`TestMigrate_AppliesInitSchema`) and `:46` — hardcodes `assert.Equal(t, 7, schemaMigrationsCount(...))`; now 8 migrations (`0008_reader.sql` added).
- `internal/store/migrate_test.go:63` (`TestMigrate_SecondCallIsANoOp`) — same hardcoded `7`.
- `internal/store/store_test.go:45` (`TestOpen_SecondOpenOnSamePathDoesNotReapplyMigrations`) — same hardcoded `7`.
All three need their literal bumped from `7` to `8`. `go test ./...` is otherwise entirely green (every other package, including `internal/session`, `internal/server` and `internal/claudecode`, passes as-is).

**Expected, not a defect**: `make check-kb` reports `internal/claudecode/plan.go`, `internal/claudecode/files.go`, `internal/server/reader.go` and `internal/server/readerwire.go` as "owned by no feature" — `docs/features/reader/spec.md`'s `go: []` glob is empty until the orchestrator updates it at Completion (plan's own Doc upkeep note: "the orchestrator updates its go/web/e2e globs if the impl agents named files differently"). Not mine to fix.

Every daemon-side REQ (1, 3, 9, 10 partially covered by listMarkdown/tree data — REQ-10's tree/filter/outline rendering is web-impl's), REQ-16 through REQ-21, REQ-24 through REQ-26 is implemented above. REQ-2, REQ-4 through REQ-8, REQ-11 through REQ-15, REQ-22, REQ-23, REQ-27, REQ-28 are web/ADR-side and out of this agent's scope.
