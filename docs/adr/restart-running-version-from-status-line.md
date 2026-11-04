---
id: restart-running-version-from-status-line
type: decision
status: accepted
date: 2026-11-04
summary: A session's running Claude Code version comes from the status line's version, stored on the row and null after launch, resume and death.
features: [actions, connection]
tags: [claude-code-format]
files: [internal/claudecode/status.go, internal/server/sessionwire.go]
tests: []
refs: [plan:restart-latest-claude, kb:fact/running-session-version-sources, kb:fact/status-version-matches-installed]
supersedes: []
---
**Context.** To offer a restart onto a newly installed Claude Code, Muster must know which version each live session is executing. The installed version is already watched; a running process keeps its original binary until relaunched (kb:fact/running-session-version-sources).

**Options.** (A) The status line's top-level `version`, already ingested and canary-guarded, posted before the first prompt. (B) `~/.claude/sessions/<pid>.json`'s `version`, unguarded and keyed by pid. (C) `CLAUDE_CODE_EXECPATH` in the hook environment, which would need the hook wrapper to forward it. (D) Transcript lines' `version`, written only on activity and mixed across a resume.

**Decision.** A. The version is stored on the session row so a daemon restart keeps it while the session is idle and posting nothing; it is cleared by launch, resume and every death, and kept by `/clear`.

**Consequences.** A session is uncounted until its first post after a launch or resume. Parsing stays in `internal/claudecode`.
