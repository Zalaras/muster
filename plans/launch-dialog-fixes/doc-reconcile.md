# Doc Reconcile: launch-dialog-fixes

**Verdict**: reconciled
**Pack**: kb: pack 6942 words (budget 30000)
**Features derived**: launch (plan header: launch)

Re-run after the earlier blocked verdict (0d61c9aa). The developer approved a minimal promotion, committed as ab38551f. Every sentence it changed in `docs/features/launch/spec.md` was re-verified against the code. No sentence needed fixing.

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| launch | Model, Effort and Start in (mode) show the directory's last-used values from open, then follow the fresh recents; a value changed first is kept (ADR cited) | `web/src/features/launch.ts:refreshKnownRepos`, `restoreFromKnownRepos`, `initOpen`; `launchrestore.ts:initialRestore`, `untouchedOnly` (skips touched fields) | promoted (ab38551f), verified |
| launch | Open with a gone directory, failed fetch or no recents returns untouched fields to defaults (carried by the cited ADR) | `launch.ts:initOpen` (`defaultRestore` on empty repos and on `"failed"`), `launchrestore.ts:defaultRestore` | covered via ADR, verified |
| launch | A closed dialog's refusal is ignored; one for a model no longer selected moves no focus | `launch.ts` (`appliedToCurrentStore = generation === modelVerdicts.generation`; `updateModelRowState(appliedToCurrentStore && selectedModel() === model)`) | promoted (ab38551f), verified |
| launch | "a value picked before they arrive is kept" (old wording) | — | replaced |
| launch | Trims ("asks (models.check)", "from press to answer", invalid-JSON sentence, trust-prompt sentences, worktree line) | meaning unchanged; no fact removed | verified |
| launch | `kb:adr/launch-restore-from-last-known-repos-at-open` in refs | file exists; `check-kb` passes | added |

## Contradictions
None

## For the orchestrator
None

## Checks
`make check-kb` (run by the orchestrator at ab38551f and re-run here) passes. Spec body is within the 800-word budget (whole file 1028 words including frontmatter; the budget check is `check-kb`).
