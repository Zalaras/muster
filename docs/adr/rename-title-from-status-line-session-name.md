---
id: rename-title-from-status-line-session-name
type: decision
status: accepted
date: 2026-08-16
summary: A session's displayed title is read from the status line's session_name, which reflects --name, /rename and the auto-generated title alike.
features: [rename, usage]
tags: [claude-code-format, ux]
files: [internal/claudecode/status.go, internal/session/status.go]
tests: [TestInterpretStatus_PreFirstResponse_SessionNameSurfacesAsTitle, TestInterpretStatus_EmptySessionNameDoesNotSurfaceAsATitle]
refs: [docs/history/spec-changelog.md, kb:fact/status-session-name-source, kb:fact/name-flag-reaches-title, kb:anchor/ws.session]
supersedes: []
---
**Context.** Muster wanted a human title per session without maintaining its own mapping. Claude Code has three title mechanisms and auto-generates a title when none is given, and the spike measured which surface reflects all of them.

**Options.** (A) Keep a Muster-owned title keyed by session, set at launch. (B) Read the SessionStart hook's title field, which is present only when a name flag was passed. (C) Read the status line's session name, which reflects every mechanism live.

**Decision.** C for the launch-time and Claude-side title. The launch form's title reaches Claude Code unchanged as the name flag and comes back through the status line.

**Consequences.** A slash-command rename is learned at the next status-line post, not instantly. The title is absent until the status line first carries one. A dashboard-side rename is a separate question, decided later as a Muster-owned override that wins over this source.
