# Doc Reconcile: maintainability-regressions

**Verdict**: reconciled
**Features derived**: launch, ingest, connection (plan header: launch, ingest, connection)

Every changed file (`git diff main --stat`) was checked with `go run ./tools/kb for <path>`:
all of them resolve to `launch`, `ingest` or `connection` (`web/src/api/launch*.ts` and
`internal/server/server.go` land on `connection` via its `web/src/api/**`/`cmd+internal/server`
globs, not because connection's own behaviour changed — nothing in the delta touches it).
No file mapped outside the header; no fix-wave change widened the feature set.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | Dialog-open asks `GET /api/models` for the four presets, and again for a restored non-preset model | `web/src/features/launch.ts:openModal` (`requestModelVerdicts`), `applyModelRestore` | added |
| launch | An unrecognised, unselected preset is disabled; a selected unrecognised model stays selected, is marked invalid under the Model row, blocks Launch | `web/src/features/launchmodels.ts:deriveModelRowState`, `web/src/render/launch.ts:renderModelRowState` | added |
| launch | Verdicts cached against resolved `claude` binary path+size+mtime; an update re-checks; concurrent requests for one model share one run | `internal/claudecode/modelcheck.go:ResolveBinaryIdentity`, `internal/server/launchermodels.go:modelsFeature.verdict` (inflight map) | added |
| launch | Launch reads the same cache and refuses with `model_unrecognized`; `unchecked` (error/timeout/unresolvable binary) proceeds and is not cached | `internal/server/launcher.go:checkModel` → `models.verdict`, `internal/server/launchermodels.go` | added |
| launch | Old sentence "checks the model … with a zero-token `--bare` run" on every launch, citing the superseded ADR | — | deleted |
| launch | A `model_unrecognized` refusal shows only in `#model-error`, never also in `#launch-error` | `web/src/features/launch.ts:submit` (skips `showError` for that code) | added |
| launch | Focus moves to the invalid control regardless of prior focus on a launch-time refusal (unless the dialog was cancelled and reopened, generation mismatch); a dialog-open verdict only steals focus from a focused Launch | `web/src/render/launch.ts:renderModelRowState` (`forceFocusInvalid`, `launchHadFocus`), `web/src/features/launch.ts:submit` (`appliedToCurrentStore`) | added |
| launch | "One launch, end to end" pre-check step now reads the cache instead of running `CheckModel` inline; new "The model check" diagram shows the dialog-open flow | `internal/server/launchermodels.go`, plan.md § Diagrams delta | added (diagram) |
| launch | frontmatter refs: drop superseded `kb:adr/launch-refuses-model-outside-binary-catalog`, add `kb:adr/launch-model-check-cached-per-binary-identity`, `kb:adr/launch-unrecognized-model-marked-blocks-launch`, `kb:adr/launch-model-refusal-shown-in-field-error-only` | `docs/adr/*` (in-code citations already moved by the fix waves; confirmed no source file still cites the superseded record) | added/deleted |
| launch | `docs/protocol.md` `models.check` anchor + `POST /api/sessions` cache pre-check paragraph; frontmatter `protocol:` list names `models.check` | `docs/protocol.md` (diffed against `main`: already present) | verified, no action (already merged at plan approval) |
| launch | Old `docs/protocol.md` sentence "the daemon runs `claude --bare …` in `directory`" | — | verified gone |
| launch | Spec sentence showing a refusal in `#launch-error` | — | verified: never present in this spec to begin with |
| ingest | Wrapper scripts "replaced atomically at daemon start when their content changed, so a hook never runs a partly written script" | `internal/claudecode/settings.go:AtomicWriteFile`, `writeScriptAtomically` | added |
| ingest | The same write path also writes the project-scoped `settings.local.json` at launch | `internal/server/launcher.go:writeSettings` → `claudecode.AtomicWriteFile` | added |
| ingest | Old sentence "rewritten at every daemon start" | — | deleted |
| ingest | frontmatter refs: add `kb:adr/ingest-wrapper-scripts-replaced-atomically` | `docs/adr/ingest-wrapper-scripts-replaced-atomically.md` | added |

## Contradictions

None. Every `becomes true` / `stops being true` claim in `doc-delta.md` matched the shipped
code exactly; no rewriting toward what shipped was needed.

## For the orchestrator

None. `docs/design/design-system.md` §5, `docs/diagrams/containers.md` and
`docs/diagrams/web-components.md` were already updated (review cycle 1) and are correct as-is
(`web/src/protocol/` measured at 8 files, matching the diagram's "8 modules" after
`protocol/models.ts` was deleted in the web-impl fix wave). The two `proposed` ADRs this delta
relies on (`launch-model-check-cached-per-binary-identity`,
`launch-unrecognized-model-marked-blocks-launch`, `launch-model-refusal-shown-in-field-error-only`)
and the superseded `launch-refuses-model-outside-binary-catalog` are left exactly as the pipeline's
Completion step is meant to flip them — not doc-reconcile's to touch.

`plans/maintainability-regressions/orchestration-state.json`, `TODO.md`,
`docs/history/todo-done.md` and `plans/maintainability-regressions/proposed-backlog.md` were
left uncommitted/untouched — none are doc-reconcile's to write.

## Checks

```
$ make gen-kb
go run ./tools/kb gen
kb: all generated files fresh

$ make check-kb
go run ./tools/kb check
kb: 442 records, 23 features, 0 problem(s)
kb: all checks pass
```

Word counts (body, mermaid fences excluded, 800-word spec budget):
- `docs/features/launch/spec.md`: within budget (`kb check` reports 0 problems; two large
  paragraphs and a new diagram were added and the section prose tightened to fit — an earlier
  draft measured 857 words and failed `check-kb`, trimmed until it passed).
- `docs/features/ingest/spec.md`: within budget, comfortably (~573 words).

## Commits

- `5f4a9a7` `docs(maintainability-regressions): reconcile launch spec with what shipped`
- `5453880` `docs(maintainability-regressions): reconcile ingest spec with what shipped`

Generated files needed no changes this run (`make gen-kb` reported "all generated files
fresh" both before and after committing), so nothing generated rides these commits.
