# Proposed backlog: maintainability-regressions

Proposals only — nothing here is filed. `/land` puts each to the developer.

### Fold `selfupdate.installBinary`'s binary replace into `claudecode.AtomicWriteFile`'s pattern
- **Summary**: a third temp-file-and-rename writer remains in `internal/selfupdate` (fixed temp name, no fsync).
- **Source**: review cycle 1 maintainability Major 1 (asked whether it folds in); cycle 2 maintainability Note 1 ("folding it in deserves a `TODO.md` entry").
- **Change requested**: no — a `[note]`; daemon-impl left it as a documented third variant because the update feature is outside this plan.
- **Suggested section**: From the maintainability cleanup → Fix.
- **Pre-existing**: yes; this branch does not touch `internal/selfupdate`.

### Launch stays enabled while a launch request is in flight
- **Summary**: a second Launch can be pressed during the ~1 s pre-check; the plan's INV-1 assumed an in-flight disable that does not exist.
- **Source**: review cycle 2 browser Note 3, cycle 4 browser Note 4.
- **Change requested**: no — reviewer marked it pre-existing.
- **Suggested section**: Pre-v1.
- **Pre-existing**: yes; `submit()` never disabled Launch on `main`.

### A refusal can move focus after the selection changed within the same open dialog
- **Summary**: refuse A, edit to B and submit, edit back to A and click Title — B's refusal moves focus to the custom input.
- **Source**: review cycle 4 browser Note 1; cycle 4 code Note 2 (the preset variant).
- **Change requested**: no — "a contrived sequence … filed as a note"; the fix would also require the refused model to equal the current selection.
- **Suggested section**: Pre-v1.
- **Pre-existing**: no; this branch added the focus move.

### The comments gate misses Reviewer-Verified IDs (`R1`, `R2`)
- **Summary**: `comment-checks.py`'s plan-ID regex matches `[DWE]\d` only, so `R`-ID citations in comments pass the gate.
- **Source**: review cycle 1 code Note 7.
- **Change requested**: no — "Whether to widen it is a pipeline change the orchestrator can propose."
- **Suggested section**: a `/retro` pipeline change rather than `TODO.md`.
- **Pre-existing**: yes.

## Decisions (the developer, 2026-09-26)

- Fold `selfupdate.installBinary` into `AtomicWriteFile`'s pattern — filed: TODO.md § Issues › From the maintainability cleanup (Refactor), "The self-updater swaps in the new binary with its own temp-file-and-rename writer".
- Launch stays enabled while a launch request is in flight — filed: TODO.md § Issues › Together — a launch request in flight, "Launch can be pressed again while a launch is in flight".
- A refusal can move focus after the selection changed — filed: TODO.md § Issues › Together — a launch request in flight, "A model refusal can move focus after the selection changed".
- The comments gate misses Reviewer-Verified IDs — not doing.
