---
id: slash-rename-immediate-no-hook
type: fact
status: active
date: 2026-10-05
summary: /rename <name> applies at once, even mid-turn, and fires no hook; the registry and transcript change immediately, the status line only on its next post.
features: [rename]
tags: [claude-code-format]
files: []
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/status-session-name-source, kb:fact/transcript-session-lines, kb:fact/refresh-interval-seconds]
verified: 2.1.289..2.1.289
guard: none
---
`/rename <name>` typed into a running interactive session prints `Session renamed to: <name>`
and relabels the prompt box at once. Typed while a turn is streaming it is not queued: it runs
mid-turn, while the registry still reads `status: "busy"` (2/2).

What changes, and when:

- `~/.claude/sessions/<pid>.json` — `name`, `nameSource: "user"` and `nameSince` (epoch ms)
  are rewritten immediately (kb:fact/session-registry-names-running-sessions).
- The transcript gains a `custom-title` and an `agent-name` line carrying the new name
  (kb:fact/transcript-session-lines).
- No hook event fires at all.
- The status line's `session_name` follows on its **next** post. With `refreshInterval: 5`
  that was within 5 s; without `refreshInterval` (Muster's configuration) an idle session made
  no post in the 12 s after a rename (1/1), so a dashboard reading only the status line sees the
  new name at the session's next event.

The command arrives as keystrokes, so it lands wherever the prompt box is: typed on top of an
unsent draft, the box read `my half typed draft/rename …`, which Enter would submit as a
prompt (observed before Enter, then cleared with `C-u`; not submitted).

A bare `/rename` with no argument asks Claude Code to generate a name, and fails with "no
conversation context yet" in an empty session (bundle text, not exercised).

Evidence: probe sessions s1, s2, s6 and s7 on capture-3, 2026-10-05.
