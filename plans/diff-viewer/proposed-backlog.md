# Proposed backlog — diff-viewer

Follow-up this run found, proposed for the developer to file or drop at `/land`. Nothing here is in
`TODO.md`.

### The diff viewer's change map draws blank and unreachable above about 530 changes

- **Summary**: Above ~530 changes each change-map mark is a 1 px border in the map's own colour: the map draws blank and later marks sit below the box.
- **Source**: `review.cycle2.md` § Below threshold, browser Major 1 `[web-impl]` (confidence 72; measured with a screenshot at 1000 changes: 472 marks outside the box, last at y 1165 on a 720 px page, reachable only by wheel-scrolling a map with a hidden scrollbar).
- **Change requested**: yes — "A fix must keep one clickable mark per change inside the map box at any change count" (cycle 1's Major 1, fixed only up to ~530).
- **Suggested section**: Bugs (diff viewer).
- **Pre-existing**: no — this branch adds the change map.

### The comment pass flags every comment that uses a removed identifier's name as an ordinary word

- **Summary**: One removed local named `branch` made `commentpass strip` flag 72 untouched comments in 40+ files as `stale-ref`.
- **Source**: orchestrator, review cycle 3's comment pass (`$TMPDIR/comment-pass-diff-viewer-c3`: 73 `stale-ref` of 77 candidates, 72 on `branch`, 1 on a `topLevel` that still exists in another package; all 77 kept).
- **Change requested**: no reviewer asked; the orchestrator proposes it — the false positives cost a judge pass over 77 blocks and nearly dropped true comments.
- **Suggested section**: Tooling.
- **Pre-existing**: yes — `tools/commentpass` is not changed by this branch.

### The Terminals client and render stubs disagree with `docs/protocol.md` on the shells write statuses

- **Summary**: main's Terminals client and render stubs expect `POST …/shells` 200 without `rev` and `DELETE` 204; the protocol says 201 with `rev` and 200.
- **Source**: `review.cycle3`'s correctness Note 2 (`review.md`, cycle 3).
- **Change requested**: no — the reviewer filed it as a note outside this plan's delta ("This is main's code; carry it to the proposed backlog").
- **Suggested section**: Bugs (surfaces / Terminals).
- **Pre-existing**: yes — main's `fc7599f4`; this branch only merged it.

## Decisions (the developer, 2026-11-20)

- The diff viewer's change map draws blank and unreachable above about 530 changes — filed: TODO.md § Bugs, "The diff viewer's change map draws blank and unreachable above about 530 changes"
- The comment pass flags every comment that uses a removed identifier's name as an ordinary word — already done: b0545e33 on main (an all-lowercase removed name matches only written as code). Not filed.
- The Terminals client and render stubs disagree with `docs/protocol.md` on the shells write statuses — already done: 61b24e09 and 99b8742f on main (shells writes answer 200/201 with `rev`, client parses it). Not filed.
