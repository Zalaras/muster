# Proposed backlog — stale-terminals-list-1

Proposed, not filed: the developer files what they want into `TODO.md`.

### A new terminal is not shown when the listing after its spawn fails

A spawn whose follow-up tmux listing fails answers a `rev` that predates it, so the window may
not show the new terminal until the next poll lists it (it then appears in the Terminals panel
but is not switched to). Expected: a terminal the daemon reports as spawned is shown.

- **Summary**: a spawn reply whose change was never broadcast carries an old `rev`, and the window reads the new terminal as already ended.
- **Source**: plan.md § Out of scope (edge case 7), copied verbatim in its first sentence.
- **Change requested**: no — the plan defers it; the contract (`kb:adr/surfaces-terminals-list-revision`) has no answer for a reply whose change was never broadcast.
- **Suggested section**: Bugs.
- **Pre-existing**: no — the "already ended" reading arrives with this branch (`web/src/features/surfaces.ts`).

### A running terminal can be read as ended when two terminal calls to one session overlap

When a rename or close reply reaches the window before an earlier, still-pending spawn reply for
the same session, the spawn's terminal is treated as already ended and not shown, even though it
runs. Expected: the terminal the spawn reply names is shown while it runs.

- **Summary**: a later call's reply raises the seen `rev` past an earlier spawn's, so that spawn reads as ended.
- **Source**: review.cycle1.md, correctness Note 1 `[note]` (the plan's untested edge case 8, wider than the plan stated).
- **Change requested**: no — "This follows the contract's wording in `sessions.shell` § Revisions, so it is not a defect of this branch."
- **Suggested section**: Bugs.
- **Pre-existing**: no — this branch adds the check.

### Timing tests fail under machine load

Five tests in files this branch does not touch each failed once in this batch's gate runs while
the machine's load average was 50–76, and passed on the retry of the same tree:
`cmd/musterd` `TestPortProc_DeclineSavesNothingAndServingStartsOnlyAfterThePromptIsAnswered`
(`port_proc_test.go:177`) and `TestOnExit_Leave_LiveSessionSurvivesShutdown`;
`web/e2e/masthead-update-dot.spec.ts:33`; `web/e2e/embedded.spec.ts:75` ("scratch musterd never
became healthy"); `web/render/focus.spec.ts:674` (two rows, 60 s timeout),
`web/render/rail.spec.ts:1251` and `web/render/reader-find.spec.ts:309`. Expected: each passes
whatever the machine's load.

- **Summary**: seven timing-sensitive tests flaked once each under a load average above 50; all passed on retry.
- **Source**: gate runs c1, c1b and c2 of this batch; review.md (cycle 2) correctness Note 1 `[note]` names the `TestPortProc` one as a backlog candidate.
- **Change requested**: no.
- **Suggested section**: Bugs.
- **Pre-existing**: yes — the branch touches none of these tests or the code they drive.

## Decisions (the developer, 2026-11-20)

1. A new terminal is not shown when the listing after its spawn fails — already done: 99b8742f
   fix(surfaces), filed and fixed as "A new terminal can be treated as already ended while it
   runs" (sweep terminal-ended-rule). Not filed.
2. A running terminal can be read as ended when two terminal calls to one session overlap —
   already done: 99b8742f, same entry. Not filed.
3. Timing tests fail under machine load — not doing ("Ignore the flakey test as we have multiple
   things running on this machine").
