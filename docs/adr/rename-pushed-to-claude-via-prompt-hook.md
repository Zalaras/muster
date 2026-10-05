---
id: rename-pushed-to-claude-via-prompt-hook
type: decision
status: accepted
date: 2026-10-05
summary: A rename reaches Claude Code via the UserPromptSubmit hook's sessionTitle and --name on resume; it warns on a name a live session holds and reads Claude's back.
features: [rename, ingest, launch]
tags: [claude-code-format, ux, user-decision]
files: []
tests: []
refs: [kb:adr/rename-muster-owned-title-override-wins, kb:adr/ingest-seq-assigned-at-ingest, kb:fact/hook-output-sets-session-title, kb:fact/slash-rename-immediate-no-hook, kb:fact/session-name-uniqueness-flagged, kb:fact/session-name-survives-clear-compact-resume, kb:fact/session-registry-names-running-sessions, "#71"]
supersedes: []
---
**Context.** A rename from the dashboard sets Muster's title override and leaves Claude Code's own name
unchanged (#71). The 2026-10-05 probe measured the routes. Typing `/rename` into the pane lands on
whatever the prompt box holds, so an unsent draft would be submitted with the command appended.
The name survives `/clear`, `/compact` and resume. A server-side flag can make Claude Code suffix
a name another live session holds, whichever route set it.

**Options.** (A) Type `/rename` into the pane. (B) Return the title from Muster's `UserPromptSubmit`
hook, and pass `--name` when resuming. (C) Leave Claude Code's name alone.

**Decision.** B, chosen by the developer. Muster's title override stays the displayed title
(kb:adr/rename-muster-owned-title-override-wins). While an override differs from Claude Code's name,
the next `UserPromptSubmit` reply carries it as `hookSpecificOutput.sessionTitle`, and a resume
passes it as `--name`. Before committing a rename, Muster warns when another live session on the
machine holds that name (case-insensitively), and never refuses it. Claude Code's actual name is read
back from its session registry entry, matched on the bound session id, beside the status line.

**Consequences.** The rename reaches Claude Code at the session's next prompt, not at once. A
stopped session gets it on resume. Nothing is typed into the pane. The `UserPromptSubmit` reply is
the one hook answer that carries a body, and it is built from the stored override without waiting on
event processing, so ingest still answers at once (kb:adr/ingest-seq-assigned-at-ingest). The hook
wrapper has to pass that reply to stdout for this event only. If the flag is on and Claude Code adds
a suffix, the dashboard keeps showing Muster's title while Claude Code's prompt box and resume
picker show the suffixed name. Reading the registry is Claude Code format knowledge and lives in
`internal/claudecode`.
