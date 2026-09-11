---
id: nongoal-ship-flow
type: decision
status: rejected
date: 2026-08-16
summary: No ship flow in the dashboard; no pull-request create or merge buttons, no archive, no CI status.
features: []
tags: [revisit]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/issue-daemon-creates-issues-only]
supersedes: []
---
**Context.** Managers in the research let a user open, merge and archive pull requests from the session list and showed CI status beside each branch.

**Options.** (A) Build the ship flow: pull request creation and merge, branch archive, CI status polling. (B) Leave shipping to the terminal and the GitHub CLI, which the sessions themselves can drive.

**Decision.** B, cut for now.

**Consequences.** Muster's GitHub involvement stays at filing its own issues. No CI polling, no pull-request state on the wire, no merge authority in a dashboard button. If shipping ever comes back it arrives as a feature plan of its own.
