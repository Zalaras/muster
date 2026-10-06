# Doc Reconcile: launch-inflight-guard

**Verdict**: reconciled
**Pack**: kb: pack 6337 words (budget 30000)
**Features derived**: launch (plan header: launch)

Changed files `web/src/features/launch.ts`, `web/src/render/launch.ts`, `web/e2e/launch.spec.ts` all map to `launch` through its `web:` / `e2e:` globs. No widening, no uncovered file.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | Launch is disabled from the press until the answer; a second press sends nothing | `web/src/features/launch.ts:submit` (early return on `launchInFlight`, `setLaunchInFlight(true)` before dispatch), `refreshDialogFace` / `updateModelRowState`, `web/src/render/launch.ts:renderModelRowState` (`disabled = state.invalid \|\| launchInFlight`) | added |
| launch | A success closes the dialog | `web/src/features/launch.ts:submitNew` and `dispatchSubmit` (`elements.dialog.close()` then `onLaunched`) | added |
| launch | Any other refusal lifts the hold | `web/src/features/launch.ts:submit` (`finally` calls `setLaunchInFlight(false)`) | added |
| launch | `model_unrecognized` still blocks Launch until another model is picked | `renderModelRowState` (`disabled = state.invalid \|\| …`); `submitNew` merges the refusal into the verdict store | already stated in the model-check paragraph; the new sentence says "any other refusal" and relies on it |
| launch | Launch regains focus after a lifted hold only if it lost it to `<body>` | `web/src/features/launch.ts:restoreLaunchFocus` (needs `launchHadFocus`, dialog open, `activeElement === body`, Launch enabled) | added |
| launch | Every launch remembers its directory as a repo row | `internal/server/launcher.go` (`UpsertRepo`), `internal/server/launcherpast.go` (`TouchRepo`, `internal/store/repo.go` INSERT … ON CONFLICT) | reworded, hybrid-promotion tail deleted |
| launch | Directory memory is hybrid, promotion reserved for per-repo-config rows | — (budget cut; carried by `kb:adr/launch-hybrid-mru-directory-memory`) | deleted |
| launch | The dialog checks first, so Launch pays no subprocess on the common path | — (budget cut; the sequence diagram's "normally a hit" carries it) | deleted |

## Contradictions
None.

## For the orchestrator
- The cycle-1 wording "though a `model_unrecognized` refusal still blocks Launch" is not a separate clause in the new sentence: the model-check paragraph already says it, and the spec was at its cap. The sentence says "any other refusal lifts the hold".
- `web/src/features/launch.ts` is 804 lines over the 500 warning; the implementation log already records it as kept.

## Checks
```
go run ./tools/kb gen
kb: all generated files fresh
go run ./tools/kb check
kb: 531 records, 27 features, 0 problem(s)
kb: all checks pass
```
`docs/features/launch/spec.md`: body under the 800 cap (kb accepts; 797 before the edit).
