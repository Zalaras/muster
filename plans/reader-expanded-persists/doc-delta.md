# Doc Delta — reader-expanded-persists

Seeded from the approved plan's `## Doc Delta` by the orchestrator, amended with the
implementation logs' `doc-delta:` lines. `plan.md` itself stays as approved.

## reader — becomes true

- `docs/features/reader/spec.md` states that the last open file, cleared dots, expanded folders
  and the Files/Outline folds are remembered per session in the browser.
- The pop-out and the dashboard share that memory live: a change in one window shows in the
  other without a switch or reload. (Fix waves 2–3; the existing "sharing … that memory"
  clause may carry it — no new sentence is needed if it already reads as live.)

## reader — stops being true

- "Last open file and cleared dots are remembered per session in the browser."

## Already applied (no action)

- `web/src/reader/CLAUDE.md` memory description, filter-clear gotcha, and the live-adoption
  invariant — applied on the branch (ddbda3e8, c17427e6, f28db9b8).
