# Proposed backlog: better-terminal

### A stale terminals list can switch a window away from a terminal it just created
- **Summary**: A `terminals` list sent before a spawn, arriving after its 201, replaces the new terminal with the lowest one.
- **Source**: `review.md` cycle 1, Below threshold — correctness Minor 3 `[web-impl]` (confidence 40, no reproduction).
- **Change requested**: yes — "A fix should let a client-initiated show survive a list older than its own spawn: for example, hold the requested `n` as pending until a list containing it arrives."
- **Suggested section**: Bugs (surfaces).
- **Pre-existing**: no — this branch adds the code (`features/surfaces.ts` `applyTerminalList` → `terminalsChanged`).

## Decisions (the developer, 2026-11-20)

- A stale terminals list can switch a window away from a terminal it just created — filed: TODO.md § Bugs, "A stale terminals list can switch a window away from a terminal it just created"
