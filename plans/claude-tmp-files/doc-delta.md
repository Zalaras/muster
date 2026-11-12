# Doc delta: claude-tmp-files

Seeded from plan.md § Doc Delta and amended by the orchestrator with the implementation logs'
`doc-delta:` lines and review cycle 1 (correctness Major 5, Minor 1, Minor 2). plan.md stays as approved.

**reader** — becomes true (`docs/features/reader/spec.md`):
- The nav's top section is **claude**, folded by default to one summary row with chips for the plan and the number of scratch files; unfolded it lists the plan row, then the session's scratchpad `.md` files newest first, each with a `tmp` badge and its age as a bare bucket (`now`, `2m`, `1h`, `2d` — kb:adr/reader-scratch-row-age-bare). The chips stay on the summary row in both fold states (kb:adr/reader-claude-chips-stay-when-unfolded). The `tmp` badge, on a row and in the docbar, is neutral with a dashed border, not a state colour (kb:adr/reader-scratch-badge-neutral-not-teal).
- The daemon keeps the scratchpad folder the session's current Claude session id named on its hooks, persisted and never moved by a straggler (kb:fact/scratchpad-dir-per-session-id); the listing carries its `.md` files and the file route serves them.
- A write of a `.md` under the scratchpad sends `docChanged`; a new scratch path or a moved folder re-fetches the listing.
- The claude section stays on an ended session.
- The nav scrolls as one column: the claude section, the Files tree and the Outline each take their natural height and never shrink, so every row is reachable by scrolling the nav in every host (kb:adr/reader-nav-scrolls-as-one-column).

**reader** — stops being true:
- "the plan slot pinned on top" (the nav now opens with the claude section).
- "Works on a dead session with the plan slot — and the nav's plan header row — removed."
- In § Does not: "never lists files outside the directory other than the plan" becomes "other than the plan and the session's scratchpad markdown".
- In § Serving and confinement: "or the resolved plan path" gains "or a `.md` under the resolved scratchpad folder".

**ingest** — becomes true (`docs/features/ingest/spec.md`, § Signals and their sources):
- A new row: **Claude's scratchpad folder** — `scratchpad_dir` on the hooks that carry it, taken only when absolute, clean, ending in `scratchpad` under a parent named for the hook's `session_id`, and only from the session's current Claude session id; read in `internal/claudecode` alone (kb:adr/reader-scratchpad-dir-from-hooks-persisted, kb:fact/scratchpad-dir-per-session-id).
