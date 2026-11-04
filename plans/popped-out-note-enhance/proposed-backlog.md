# Proposed backlog — popped-out-note-enhance

Proposals only; nothing here is filed in `TODO.md`. `/land` puts each to the developer.

### Render tests that hold the banner up by closing `/ws` may flake
**Summary**: The banner/readout-over-panel render tests cycle the socket every ~500 ms; a hit test in the gap could fail.
**Source**: `review.md` cycle 3, correctness Note (possible flake)
**Change requested**: no — the reviewer asked for nothing; green in every gate run so far.
**Suggested section**: Tweaks (test infrastructure)
**Pre-existing**: no — added by this branch (`web/render/notes-places.spec.ts`).

### `web/src/reader/CLAUDE.md` does not name `query.ts`
**Summary**: The shared `?session=` parse lives in `reader/query.ts`, which the reader directory brief omits (at its word budget).
**Source**: web-implementation.md Fix Attempt 2 handoff; `review.cycle2.md` maintainability Note 3
**Change requested**: no — noted, not requested.
**Suggested section**: Tooling and docs
**Pre-existing**: no — this branch added `query.ts`.

### E3 "within two seconds" note save missed its budget under heavy load
**Summary**: notes E3 (save within 2 s while editing) failed once in a 10x soak at load average ~37 from a sibling worktree; clean at ~11.
**Source**: test-specs.md Fix Attempt 2 (soak)
**Change requested**: no — judged environmental; budget deliberately not raised.
**Suggested section**: Bugs (only if it recurs on a quiet machine)
**Pre-existing**: yes — the test and its budget predate this branch.

## Decisions (the developer, 2026-11-04)

1. Render tests that hold the banner up by closing `/ws` may flake — filed: TODO.md § Tooling and docs, "Render tests that hold the banner up by closing `/ws` may flake"
2. `web/src/reader/CLAUDE.md` does not name `query.ts` — filed: TODO.md § Tooling and docs, "`web/src/reader/CLAUDE.md` does not name `query.ts`"
3. E3 "within two seconds" note save missed its budget under heavy load — deferred
