# Doc Reconcile: new-session-improvement

**Verdict**: reconciled
**Features derived**: launch, focus, tiles (plan header: launch, focus, tiles, surfaces, connection, actions, rail, rename)

The plan's header was widened mid-run to eight features (decisions/features-scope), but the
staged `doc-delta.md` carries prose claims for exactly three: launch, focus, tiles (plus a
`protocol` entry already merged into `docs/protocol.md` at approval, commit `23f80e5`). Every
changed file's owning feature is inside the plan's widened header — no feature-set violation.
`internal/claudecode/modelcheck*.go`, `web/src/render/launchrestore*.ts` and the three new E2E
specs were already added to `docs/features/launch/spec.md`'s frontmatter globs before this run
(commit `ac20108`, user decision `decisions/check-kb-before-approval`) — verified present and
correct against the actual file locations, left as-is.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | "Model and Start in default to the directory's last-used values; with none, Start in is auto. A value picked before those values arrive is kept." | `web/src/api.ts:permissionModeToCheck` (falls back to `"auto"`), `web/src/render/launchrestore.ts:DEFAULT_MODEL`/`initialRestore`, `Touched` interface | added |
| launch | "Every Start-in mode, manual included, is sent as an explicit `--permission-mode` flag…" | `internal/claudecode/launch.go:BuildArgv` (switch over all four modes, no longer omitting `default`) | added |
| launch | Pre-check first sentence in § What launch does | `internal/claudecode/modelcheck.go:CheckModel`, `internal/server/sessions.go:sessionLauncher.Launch` (checkModel call before `UpsertRepo`) | added |
| launch | "A launch opens the launched session: Focus focuses it, and both views put keyboard focus in its terminal" | `web/src/features/launch.ts:564-576` (`onLaunched` calls `deps.focus.bringForward` then `deps.surfaces.focusSelected`) | added |
| launch | Diagram gains `CheckModel` step + refusal `alt` | `internal/server/sessions.go:206-223` (validate → checkModel → `isGit`/gitutil probes, i.e. before `S->>G`, not directly before `UpsertRepo`) — corrected per review cycle 1 Minor 1, not the plan's original "before UpsertRepo" wording | added |
| launch | Frontmatter refs gain 3 new facts, 3 new prose ADRs, lose 2 superseded ADRs | `docs/facts/{model-catalog-precheck-zero-token,permission-mode-no-flag-follows-configured-default,unknown-model-fails-first-turn}.md`, `docs/adr/{launch-refuses-model-outside-binary-catalog,launch-start-in-explicit-flag-auto-fallback,launch-opens-launched-session}.md` (each `supersedes`/dated 2026-09-23) | added |
| launch | Frontmatter refs also gain `kb:adr/launch-open-outcome-decided-in-controller` | ADR record exists, cites `web/src/features/launch.ts` + `web/src/render/launchrestore.ts` | added |
| launch | "and the card is broadcast from the inserted row, before any hook has arrived" duplicates § What launch does | existing sentence "…inserts the session row in `started`, broadcast immediately so the card appears before any hook arrives" | deleted |
| focus | "A launch focuses the launched session and puts keyboard focus in its terminal (kb:adr/launch-opens-launched-session)." | `web/src/features/focus.ts:114-121` (`bringForward` calls `app.focus` in Focus), `web/src/features/launch.ts:575` (`surfaces.focusSelected`) | added |
| tiles | "…demoting the lowest-priority tile when full, and keyboard focus moves to its terminal" | `web/src/features/focus.ts:118-119` (`bringForward` calls `deps.promoteTile` in Tiles), `web/src/features/launch.ts:575` (`focusSelected` runs regardless of view) | added |
| rail | (no claim staged) | — | none — doc-delta names no rail prose; `rg scrollIntoView web/src` returns nothing, confirming `kb:adr/rail-launch-leaves-rail-scroll-untouched` isn't contradicted, but no rail sentence exists to cite it from |

## Contradictions

None.

## For the orchestrator

None — the diagram-insertion correction and the already-landed launch globs named in the
amended delta were both verified against code and matched as described; no further action
needed.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 413 records, 23 features, 0 problem(s)
kb: all checks pass
```

Word counts (`wordsOutsideMermaid`, budget 800 for a spec):
- `docs/features/launch/spec.md`: 608 (was 526)
- `docs/features/focus/spec.md`: 188 (was 174)
- `docs/features/tiles/spec.md`: 250 (was 242)

`docs/protocol.md` § `sessions.create` was already reconciled at plan approval (commit
`23f80e5`) and needed no further edits from this step.

## Commits

- `8121cc3` — `docs(new-session-improvement): reconcile launch spec with what shipped`
- `c0b7b6e` — `docs(new-session-improvement): reconcile focus spec with what shipped`
- `304f994` — `docs(new-session-improvement): reconcile tiles spec with what shipped`
