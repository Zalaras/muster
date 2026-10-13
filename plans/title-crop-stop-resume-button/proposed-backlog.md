# Proposed backlog: title-crop-stop-resume-button

Follow-up this run found. Nothing here is filed; `/land` puts each to the developer.

### `launch.spec.ts` E2 can see an `Up` button that is not there

- **Summary**: the launch dialog's E2 test failed once in a full sweep (`Up` count 1, expected 0), then passed 5/5 alone.
- **Source**: orchestrator, cycle-2 gate run (`make e2e`, 797 passed, 1 failed); review.code.md cycle 2 Note 5 filed it as a flake.
- **Change requested**: no (review-work: "a flake, not a regression"); the orchestrator suspects the `{ name: "Up" }` locator matches any browse-root folder whose name contains "up", since role-name matching is substring unless `exact: true`. Not measured.
- **Suggested section**: Issues → On their own.
- **Pre-existing**: yes; this branch does not touch the launch dialog or its spec.

### Resume enablement is written inline in three render files

- **Summary**: `render/dead.ts`, `render/tiles.ts` and `render/sessions.ts` each re-derive Resume enablement instead of asking `sessions/card.ts`.
- **Source**: review.maintainability.md cycle 1 Note and cycle 2 Note 1.
- **Change requested**: no (maintainability: "predates the branch").
- **Suggested section**: Post v1, or with the tiles rework (Tiles per group).
- **Pre-existing**: yes; this branch moved the label-to-action map into `sessions/card.ts`, which such a cleanup would reuse.

### The reserved ended-age slot leaves blank room after a short model name

- **Summary**: the header reserves a 14ch slot under the model so Stop moves nothing; with `haiku` that is ~61 px of blank, so the row gives way earlier than its text needs.
- **Source**: review.browser.md cycle 2 Note 2.
- **Change requested**: no (browser: "the trade the fix made for REQ-6, and I'm not asking for a change").
- **Suggested section**: Issues → On their own, only if the developer dislikes it in use.
- **Pre-existing**: no; this branch added the slot.

## Decisions (the developer, 2026-10-13)

- `launch.spec.ts` E2 can see an `Up` button that is not there: already done: fixed on this branch in b80fcd2b (exact names; the `muster e2e-XXXXXX` ancestor crumb matched "up" as a substring, reproduced red with `TMPDIR` containing `Up`, green after, `make e2e-soak SPEC=launch.spec.ts N=10` 450 passed). Not filed.
- Resume enablement is written inline in three render files: already done: fixed on this branch in d4cf0483 (`actionEnabled` in `sessions/card.ts`). Not filed.
- The reserved ended-age slot leaves blank room after a short model name: not doing
