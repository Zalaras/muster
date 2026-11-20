---
id: diff-viewer-in-dashboard-comments-stay-local
type: decision
status: accepted
date: 2026-11-20
summary: The dashboard shows a session's code diff with comments kept for the developer; nothing from the viewer reaches Claude Code.
features: [diff]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:diff-viewer, kb:adr/nongoal-diff-review-placeholder-button, kb:adr/process-prototype-first-track]
supersedes: [nongoal-diff-review-placeholder-button]
---
**Context.** kb:adr/nongoal-diff-review-placeholder-button kept diff review out of the dashboard, with comments fed back to the agent named as the thing not built, and allowed only an open-in-editor placeholder. The developer prototyped a diff viewer (2026-11-17 to 11-19) and accepted it.

**Options.** (A) Keep the non-goal. (B) Build a viewer whose comments are fed to the agent. (C) Build a viewer whose comments stay with the developer.

**Decision.** C, the developer's choice: Unified, Split and a Review view, with comments and review ticks kept with the session and never sent to Claude Code.

**Consequences.** The non-goal's first half is superseded; its refusal to feed comments to the agent still holds here. The open-in-editor button stays its own backlog entry.
