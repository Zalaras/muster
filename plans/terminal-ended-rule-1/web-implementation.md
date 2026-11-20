# Web Implementation: terminal-ended-rule-1

**Plan**: terminal-ended-rule-1
**Mode**: initial
**Pack**: not run (small track, brief given in the prompt)

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/terminalsrev.ts` | edited | State gains `appliedBase`/`appliedBySession`; new `appliedRev` and `applyListRev`; snapshot reset sets both bases, forget clears both (REQ-1) |
| `web/src/features/surfaces.ts` | edited | `observeSpawnReply` compares against `appliedRev`; the `terminals` handler uses `applyListRev`; replies still only raise the floor (REQ-1) |

## Decisions

design: applied-list rev lives beside the floor in `TerminalsRevState` (same module and owner, `revState` in surfaces.ts); `raiseSeenRev`, `seenRev`, `isStaleList` keep their signatures so existing tests are untouched. No precedent beyond that module.
REQ-2 and REQ-3 are daemon-side, not done here.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0; lint clean; full vitest 3408/3408 (the 3 red tests are green)
**E2E smoke**: no spec authored
None
