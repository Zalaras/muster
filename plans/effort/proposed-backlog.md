# Proposed backlog: effort

Follow-up this run found. Nothing here is filed; `/land` puts each to the developer.

### Focus lands nowhere after a keyboard Dismiss of the effort-mismatch strip

- **Summary**: pressing Dismiss with the keyboard hides the strip and drops focus to `<body>`.
- **Source**: review.browser.md (cycles 1 and 2) Note 2.
- **Change requested**: no — "The plan names no place for focus to go. A candidate for a follow-up."
- **Suggested section**: Issues → Focus view header.
- **Pre-existing**: no — the strip is new on this branch.

### `Could not reach musterd.` outlives the reconnect

- **Summary**: after a failed action while the daemon is down, `#action-error` keeps its message after the daemon is back, until the next action.
- **Source**: review.browser.md (cycles 1 and 2) Note 3.
- **Change requested**: no — "It is the existing action-error line's behaviour, not new in this plan."
- **Suggested section**: Issues → connection.
- **Pre-existing**: yes — the action-error line predates this branch; the effort Dismiss is one more way to reach it.

### One spelling for the null-or-string decode check across `web/src`

- **Summary**: `isNullableString` now lives in `protocol/decode.ts`, but about 20 sites still write `x !== null && typeof x !== "string"` inline.
- **Source**: review.maintainability.md (cycle 2) Note 6.
- **Change requested**: no — raised as "a follow-up you could propose".
- **Suggested section**: Post v1 → maintainability.
- **Pre-existing**: mostly — three of the inline sites (`protocol/session.ts`) are new on this branch.

### Effort row briefly shows `default` while the dialog's repos load

- **Summary**: for up to 1.5 s after opening, the launch dialog's Effort row can read `default` before settling on the directory's remembered level.
- **Source**: review.browser.md (cycle 2) Note 1.
- **Change requested**: no — REQ-4 deliberately keeps a pick made in that window; the note warns a spec reading the radio without waiting would flake.
- **Suggested section**: Issues → launching a session.
- **Pre-existing**: yes — Model and Start in share the same repos-arrive-after-open window.

## Decisions (the developer, 2026-10-15)

- Focus lands nowhere after a keyboard Dismiss — filed: TODO.md § Pre-v1, "Focus lands nowhere after a keyboard Dismiss of the effort warning".
- `Could not reach musterd.` outlives the reconnect — filed: TODO.md § Pre-v1, "\"Could not reach musterd.\" stays after the daemon is back".
- One spelling for the null-or-string decode check — fixed on this branch at /land, at the developer's request. Not filed.
- Effort row briefly shows `default` — filed: TODO.md § Pre-v1, "Launch dialog briefly shows the wrong effort".
