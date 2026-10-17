# Proposed backlog: docs-search-bar

Proposals only; nothing here is filed. The developer decides each at `/land`.

### The shortcuts listener's header still claims every bound chord

- **Summary**: `web/src/features/shortcuts.ts`'s header calls itself the one window listener for every bound chord; ⌘F is dispatched by the reader.
- **Source**: review cycles 2–4 correctness Note 1 (`review.cycle2.md`, `review.cycle3.md`, `review.md`); `web-implementation.md` `doc-delta:` line 45.
- **Change requested**: no — every reviewer filed it as a `[note]`; it is a pre-existing comment the branch did not add, so the comment pass never saw it, and `commentpass drop` would remove the whole (otherwise true) header.
- **Suggested section**: Issues › Together — what code comments cite.
- **Pre-existing**: yes; this branch does not touch the file.

### Issues #93, #95, #96 sit under an unrelated TODO group

- **Summary**: the 2026-10-15 triage run appended #93–#96 to "Together — the gate outside the developer's checkout", which they have nothing to do with.
- **Source**: the orchestrator, moving #94 at completion.
- **Change requested**: no — observed, not raised by a reviewer.
- **Suggested section**: regroup under the surface each centres on (sessions, the session card) per the triage-groups-by-feature preference.
- **Pre-existing**: yes; this branch only moved #94 out.

## Decisions (the developer, 2026-10-17)

1. The shortcuts listener's header still claims every bound chord — already done: fixed on this branch at `/land` (`web/src/features/shortcuts.ts` header now excepts ⌘F and names `./readerfind.ts`). Not filed.
2. Issues #93, #95, #96 sit under an unrelated TODO group — not doing (covered by the Pre-v1 "Restructure TODO.md so its sections can be picked up as work").
