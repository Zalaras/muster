---
id: lifecycle-card-shows-launch-directory-marks-claude-elsewhere
type: decision
status: accepted
date: 2026-10-01
summary: The card, shell, docs reader and file drop stay on the launch directory; a secondary ↳ readout shows where Claude is only while in another checkout.
features: [lifecycle, rail, focus, tiles, card-location]
tags: [user-decision, ux]
files: []
tests: []
refs: [plan:stale-dirs-models-branches, kb:fact/cwd-follows-claude-mid-session, kb:fact/enter-worktree-moves-project-dir, docs/design/mockups/claude-location/options.html]
supersedes: [lifecycle-card-directory-follows-claude-cwd]
---
**Context.** The superseded decision had the card show the directory Claude reports, once the
2026-10-01 probe showed it moves (a `cd`, an `/add-dir` directory, `EnterWorktree`). While
planning, the developer weighed what else would move with it: the shell pane, the docs
reader and the file drop all root at the session's directory, and resume must spawn in the
launch directory for Claude Code to find its transcripts.

**Options.** (A) The card and its surfaces follow Claude's directory. (B) Everything stays on
the launch directory, and a marker says when Claude is somewhere else, with the full location
on hover. Four marker designs were mocked (`options.html`).

**Decision.** B, with mockup option C: a dim `↳ <folder> / <branch>` block on the rail card
and in the Focus header, and a bare `↳` glyph in the tile header. Neutral colours only. It
appears only when Claude is in a **different checkout**, such as a worktree or another repo
added with `/add-dir`. A `cd` inside the launch checkout never shows it, because Claude's Bash
tool stays in subfolders routinely.

**Consequences.** `directory` keeps its launch meaning on the wire, and a new `claudeLocation`
carries the rest. A worktree under `<repo>/.claude/worktrees/` sits inside the launch path but
counts as elsewhere, because it has its own top level.
