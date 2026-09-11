---
id: nongoal-diff-review-placeholder-button
type: decision
status: rejected
date: 2026-08-16
summary: No inline diff review with comments fed back to the agent; the placeholder is a button that opens the worktree in VSCode, an acknowledged hack.
features: []
tags: [ux, revisit]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, docs/research/claude-session-manager-handoff.md]
supersedes: []
---
**Context.** The research called diff review the killer feature for a session manager. Damian reviews agent output outside any manager today and has his own ideas about how review should work.

**Options.** (A) Build inline diff review in the dashboard with comments routed back to the session. (B) Keep review out of scope and, at most, offer a button that opens the session's checkout in the editor.

**Decision.** B. Review is deliberately left for a separate effort; the button, when it is built, is a placeholder and not a design.

**Consequences.** Nothing in the data model or protocol carries diffs or review comments. The placeholder is allowed to be a hack because it will be replaced, not grown.
