# Proposed backlog — plan `groups`

Follow-up this run found, proposed for the developer to file or decline at `/land`
(kb:adr/process-backlog-entries-are-the-users-to-file). Nothing here is filed.

### `unknown_session` carries two message strings

- **Summary**: `POST /api/groups` answers an unknown session id with `unknown session` (the approved contract's text) while the older endpoints say `unknown session id`; one string would do.
- **Source**: `plans/groups/daemon-implementation.md` ## Decisions, third `deviation:` line (the implementer's flag, not a reviewer finding).
- **Change requested**: no — the contract was implemented as written; the implementer flagged the split "in case the two should be one string".
- **Suggested section**: Pre-v1 → Fix, or fold into the next protocol touch.
- **Pre-existing**: the older string predates this branch; this branch adds the second.

### Two terminal tests flake under the race detector

- **Summary**: `TestHandleTerminal_SecondSocketSupersedesTheFirst` (terminal_test.go:408) and `TestHandleShellTerminal_ScrollErrorIsLoggedNotFatal` (shellscroll_test.go:195) each failed once in a full `make test-race`, pass alone and on re-run; neither is touched by this branch.
- **Source**: review.cycle1.md code Note 1 and browser Note 1; daemon-tests.md.
- **Change requested**: no — reviewers filed both as notes.
- **Suggested section**: Pre-v1 → Fix (beside "Two E2E specs fail on a release-tag commit").
- **Pre-existing**: yes.

### The rail never scrolls a newly focused card into view

- **Summary**: focusing a card off-screen (⌥⌘n, default focus, a launch) leaves the rail's scroll position where it was; the flat rail behaves the same, so groups did not cause it.
- **Source**: review.cycle2.md browser notes (cycle 2, Note "No scroll into view").
- **Change requested**: no — a note.
- **Suggested section**: Pre-v1 → Polish.
- **Pre-existing**: yes.

### `#rail-count` reads an empty string with zero sessions

- **Summary**: with no sessions the rail count renders `""` rather than `0`.
- **Source**: review.cycle1.md browser Note 8.
- **Change requested**: no.
- **Suggested section**: Pre-v1 → Polish.
- **Pre-existing**: yes.

### Delete-group `remove` can report `deleted:false` with no failed member

- **Summary**: a session moved into the group by another window during a `remove` batch leaves the group in place with `deleted:false` and an empty `failed` list, though the contract says `false` only follows a failed member; the group correctly stays.
- **Source**: review.cycle1.md code Note 4.
- **Change requested**: no — "the race is narrow and the group correctly stays".
- **Suggested section**: Post v1.
- **Pre-existing**: no — this branch adds the endpoint.

### An older daemon's snapshot with sessions is rejected whole

- **Summary**: `parseSession` requires `groupId` (W2), so a snapshot from a pre-groups daemon that carries any session is dropped entirely; the plan's "renders flat" holds only for an empty snapshot. Moot once this release ships, since the dashboard and daemon ship together.
- **Source**: review.cycle1.md code Note 5.
- **Change requested**: no.
- **Suggested section**: Post v1, or decline.
- **Pre-existing**: no.

### The new-group modal shows the daemon's raw `unknown session`

- **Summary**: removing a selected session while the New group from selection modal is open makes Create show the daemon's raw message inside the dialog rather than a human line.
- **Source**: review.cycle3.md browser Note (for review-work).
- **Change requested**: no.
- **Suggested section**: Pre-v1 → Polish.
- **Pre-existing**: no.

## Decisions (the developer, 2026-10-06)

- `unknown_session` carries two message strings — filed: TODO.md § Pre-v1, "`unknown_session` carries two message strings" (to be fixed straight after landing).
- Two terminal tests flake under the race detector — filed: TODO.md § Pre-v1, "Two terminal tests flake under the race detector" (to be fixed straight after landing).
- The rail never scrolls a newly focused card into view — already done: duplicate of the open TODO.md § Pre-v1 entry "Keep the current session's rail card on screen" (from `plans/new-session-improvement/`). Not filed.
- `#rail-count` reads an empty string with zero sessions — filed: TODO.md § Pre-v1, "`#rail-count` reads an empty string with zero sessions" (to be fixed straight after landing).
- Delete-group `remove` can report `deleted:false` with no failed member — not doing.
- An older daemon's snapshot with sessions is rejected whole — not doing.
- The new-group modal shows the daemon's raw `unknown session` — not doing.
