# Plan: rename-claude-session

**Status**: completed
**Shape**: fix
**Work Type**: daemon
**E2E Scope**: none
**Fixture plan**: none
**Features**: rename, ingest, launch, lifecycle
**Description**: A dashboard rename reaches Claude Code's own session name once — on the session's next prompt, or as `--name` on resume — is never re-sent, and a later name change in Claude Code wins (#71).

## Symptom

From `TODO.md` § Issues, "On their own":

- **Renaming in Muster does not rename Claude session** ([#71](https://github.com/Zalaras/muster/issues/71)) —
  renaming a session in Muster leaves Claude Code's own session name unchanged. A rename should
  reach both.

## Findings

The claim held as written. A dashboard rename sets only Muster's title override
(kb:adr/rename-muster-owned-title-override-wins); `docs/features/rename/spec.md` says so in its
last paragraph. Nothing carries it to Claude Code:

- No code under `internal/` or `web/src` produces `sessionTitle` or `hookSpecificOutput`.
- The ingest handler always answers `200` with an empty body (`internal/server/ingest.go:290-310`),
  and the hook wrapper discards whatever comes back: `curl … --output /dev/null`
  (`internal/claudecode/settings.go:350`).
- A resume passes `--resume <id>` and deliberately omits `--name` (`internal/claudecode/launch.go:64-68`);
  the in-place resume in `internal/server/launcher.go:534-538` passes no title at all.

The routes that do work were measured on 2.1.289: a `UserPromptSubmit` hook reply carrying
`hookSpecificOutput.sessionTitle` renames the session at that prompt
(kb:fact/hook-output-sets-session-title), and `--resume <id> --name X` renames on resume
(kb:fact/session-name-survives-clear-compact-resume). A name Claude Code already holds is
skipped. A duplicate name is never refused: with Claude Code's server-side uniqueness flag off it is
taken as-is, with it on Claude Code takes `<name>-<adjective>-<noun>` (kb:fact/session-name-uniqueness-flagged).

That last fact is why the accepted 2026-10-05 decision's "send while the override differs from
Claude's name" rule is wrong: a suffixed name never matches, so every prompt would re-send it and
Claude Code would re-suffix each time. The developer chose (2026-10-15) to send each rename once,
drop the duplicate-name warning and the registry read-back — the warning needed a daemon↔UI
protocol change and the read-back a new Claude Code file format. Recorded as
kb:adr/rename-pushed-to-claude-once (supersedes kb:adr/rename-pushed-to-claude-via-prompt-hook).

Sending once still left two holes, because the override wins on the dashboard
(kb:adr/rename-muster-owned-title-override-wins) and what was sent is held only in memory. A
`/rename` typed after the send (it fires no hook — kb:fact/slash-rename-immediate-no-hook) leaves
the dashboard on the old Muster title; and after a daemon restart the override no longer matches
Claude Code's name (renamed or suffixed), so it would be sent again, undoing the `/rename` on every
restart. The developer chose (2026-10-15) "last rename wins, wherever it was made": once a rename
has reached Claude Code, a later different name from Claude Code clears the override. Recorded as
kb:adr/rename-claude-change-after-delivery-clears-override.

## Requirements
### Must Have
- **REQ-1**: After a dashboard rename to a non-null title that differs from Claude Code's
  last-known name, the next `UserPromptSubmit` hook routed to that session gets a `200` whose body
  is `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"<override>"}}`.
- **REQ-2**: Each override value is sent to Claude Code at most once per daemon run: a later
  `UserPromptSubmit` for the same session gets an empty body, whatever name Claude Code then reports
  (a suffixed name included). Only a rename to a different value arms a new send.
- **REQ-3**: Every other hook event, the status-line endpoint, an unroutable envelope (unknown
  session, pane mismatch), a session with no override, and a session whose override already equals
  Claude Code's last-known name all still get `200` with an empty body.
- **REQ-4**: The ingest answer stays immediate: building the reply reads only in-memory session
  state, never the DB or the event queue (kb:adr/ingest-seq-assigned-at-ingest).
- **REQ-5**: The hook wrapper passes the daemon's response body to stdout only on a `2xx`
  response; any other outcome (non-2xx, timeout, daemon down) prints nothing and still exits 0.
- **REQ-6**: Resuming a dead session whose override is set and differs from Claude Code's
  last-known name passes the override as `--name` beside `--resume <id>`, and counts as that
  value's one send (the next prompt sends nothing).
- **REQ-7**: An override counts as *delivered* once it has been sent (REQ-1, REQ-6) or once Claude
  Code's reported name equals it. After delivery, a reported Claude Code name that differs from both
  the override and the name Claude Code had just before delivery clears the override (persisted,
  and one `sessionUpsert` broadcast), so the dashboard shows Claude Code's name. A suffixed name and
  a `/rename` both clear it this way; a straggling report of the pre-delivery name never does.
- **REQ-8**: Before delivery, a reported Claude Code name never touches the override (today's rule
  stands until the rename has reached Claude Code).

## Affected Files
### Daemon (daemon-impl)
- `internal/server/ingest.go` — REQ-1–REQ-4: a routed `UserPromptSubmit` may answer with the
  rename body instead of an empty one.
- `internal/session/title.go` — REQ-2: a rename to a new value arms one send; the sent value is
  remembered per session in memory.
- `internal/claudecode/settings.go` — REQ-5: the wrapper prints a 2xx body; REQ-1: the reply body
  is Claude Code format, built here.
- `internal/session/apply.go` — REQ-7, REQ-8: a status update may clear a delivered override.
- `internal/claudecode/launch.go` — REQ-6: a resume may carry `--name`.
- `internal/server/launcher.go` — REQ-6: the in-place resume passes the override.
### Existing tests this breaks
- daemon-tests: `internal/claudecode/launch_test.go:95-101` — "ResumeSessionID emits --resume and
  omits --name even when Title is also set" stops being true.
- daemon-tests: `internal/claudecode/settings_test.go:735` — the template check that curl discards
  its output stops being true.
- daemon-tests: `internal/session/title_test.go:185` `TestApplyStatusUpdate_NeverTouchesTitleOverride`
  — true now only before delivery (REQ-8); after delivery a different name clears it (REQ-7).

## Proof
A new test in `internal/server` (daemon-tests): enveloped `UserPromptSubmit` posted for a
session whose override was set by `SetTitle` → the response body's
`hookSpecificOutput.sessionTitle` equals the override; a second `UserPromptSubmit` → empty body.
Red today on the first assertion (the body is empty).

## Edge Cases
1. Claude Code suffixes the name (status line reports `<name>-calm-brook`) → no re-send, and the override clears so the dashboard shows the suffixed name → D2
2. Rename A → B → A: each rename sends once → D2 (shared with edge case 1)
3. Override cleared (null) → nothing sent → D2 (shared with edge case 1)
4. Override equals Claude Code's last-known name (e.g. launch `--name` then rename to the same) → nothing sent → D2 (shared with edge case 1)
5. Non-`UserPromptSubmit` events and the status endpoint → empty body → D2 (shared with edge case 1)
6. Envelope with an unknown `musterSession` or a mismatched `tmuxPane` → empty body → D2 (shared with edge case 1)
7. Daemon restart with an undelivered override → it is sent at the next prompt as usual; a delivered override has normally been cleared or matched by then, so nothing is re-sent → D2 (shared with edge case 1)
8. The reply is lost (curl timeout, wrapper killed) → not re-sent until the next rename or a resume → untested: accepted loss, hook delivery is at-most-once by design
9. `/clear` mints a new `session_id` in the same pane → routing is by envelope, the name survives `/clear` (kb:fact/session-name-survives-clear-compact-resume), no extra send → D2 (shared with edge case 1)
10. Resume with an unsent override → `--name` on the argv, and the next prompt sends nothing → D3
11. Daemon down or a non-2xx answer → the wrapper prints nothing → D4
12. Resume-from-list (a new row from a transcript) has no override → argv unchanged → D3 (shared with edge case 10)
13. `/rename` in the terminal after delivery → the next status post clears the override; the dashboard shows the `/rename` name → D2 (shared with edge case 1)
14. A reordered status post still carrying the pre-delivery name arrives after the send → override kept → D2 (shared with edge case 1)
15. Override set equal to Claude Code's current name (delivered at once), then `/rename` → override clears → D2 (shared with edge case 1)
16. `/rename` typed after a Muster rename but before the next prompt → that prompt still sends Muster's name over it (the hook fires before any status post reports the `/rename`) → untested: accepted, Muster cannot see the `/rename` in time
17. Daemon restart between a send and the next status post → memory of the pre-delivery name is lost; the override may be sent once more → untested: a narrow window, accepted (kb:adr/rename-claude-change-after-delivery-clears-override)

## Acceptance Criteria
### Automated Checks
```checks
D1 go test -count=1 -run 'TestIngest' ./internal/server/
D2 go test -count=1 ./internal/server/ ./internal/session/
D3 go test -count=1 ./internal/claudecode/ -run 'TestBuildArgv|TestLaunch'
D4 go test -count=1 ./internal/claudecode/
D5 make lint
```
### Reviewer-Verified
- Building the reply touches no DB, queue or file — only in-memory session state (REQ-4).
- The `sessionTitle` / `hookSpecificOutput` strings appear only under `internal/claudecode/` (CLAUDE.md hard rule).
- No hook payload or reply body is logged.

## Doc Delta
**rename** — becomes true:
- A dashboard rename reaches Claude Code's own name once: as the next prompt's hook reply, or as
  `--name` when the session is resumed first. A second prompt never re-sends the same name; a
  name Claude Code suffixes (kb:fact/session-name-uniqueness-flagged) stays suffixed, and the
  dashboard follows it (last rename wins, below).

**rename** — stops being true:
- "Rename does not change Claude Code's own session name" (the clause before "and does not touch
  the rail order").
- "Status posts keep refreshing Claude's name into its own column but never read or write the
  override" — after delivery a different Claude name now clears it.

**rename** — becomes true (last rename wins):
- Once a rename has reached Claude Code, a later different name from Claude Code (a `/rename`, or a
  suffix) clears the override, and the dashboard shows Claude Code's name.

**rename** — also stops being true (`docs/features/rename/spec.md` and `docs/protocol.md` § `kb:anchor/sessions.title`):
- "while an override is set, a post that changes only Claude's name broadcasts nothing" (protocol:
  "persists and broadcasts nothing") — true now only before delivery; after delivery a different
  name clears the override, persists and broadcasts one `sessionUpsert`.

**lifecycle** — stops being true (`docs/protocol.md` § The Session object, `titleOverride` comment):
- "Never touched by status posts, rebinds, resume or reconcile." — becomes: never touched by
  rebinds, resume or reconcile; a status post clears it once the rename has reached Claude Code and
  Claude Code reports a different name (kb:adr/rename-claude-change-after-delivery-clears-override).

**ingest** — stops being true (`docs/features/ingest/spec.md` § Transport and its "One post, end to end" diagram):
- "The handler returns `200` with an empty body at once and enqueues the raw body; a single worker
  parses it" — becomes: the handler enqueues the raw body and answers `200` at once; its only
  request-path work is an in-memory parse and session-state read to build a routed
  `UserPromptSubmit`'s rename reply; persistence, `seq` and state transitions stay in the single worker.
- In the diagram, `H-->>W: 200, empty body` becomes `200, empty body (or a routed UserPromptSubmit's
  rename reply)`, and the Note "no parsing, no DB work on the request path" becomes "no DB work on
  the request path; only the prompt-reply parse".

**ingest** — becomes true (`docs/protocol.md` § `kb:anchor/ingest`):
- The hook endpoint answers `200` with an empty body, except a routed `UserPromptSubmit` carrying
  a not-yet-sent rename, whose body is `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","sessionTitle":"…"}}`.
  The hook wrapper (`hook.sh`, not `status-line.sh`) prints a 2xx body to stdout.

**ingest** — stops being true:
- "Return `200` with empty body immediately" as an unconditional rule.

**launch** — becomes true (`docs/protocol.md` § `kb:anchor/sessions.resume`):
- The spawned argv is `claude --model <model.id> --resume <claudeSessionId> [--name <titleOverride>] [--permission-mode <latched>]`,
  `--name` present only when the override is set, not yet sent, and differs from Claude Code's last-known name.

**launch** — stops being true:
- The same sentence without `[--name <titleOverride>]`.

## Out of scope
- A `/rename` typed between a Muster rename and the next prompt is overwritten by that prompt's
  send (edge case 16). Not filed.
- Warning before a rename when another live Claude session already holds the name, and reading
  Claude Code's name back from `~/.claude/sessions/` — dropped by the developer 2026-10-15
  (kb:adr/rename-pushed-to-claude-once). Not filed.
