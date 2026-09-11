---
id: launch-bypass-and-dontask-unoffered
type: decision
status: rejected
date: 2026-09-03
summary: The bypass-permissions and dont-ask modes stay unoffered until a permissions UI with guardrails exists; auto's guardrail is Claude Code's classifier.
features: [launch]
tags: [ux, security, revisit, user-decision]
files: [web/src/features/launch.ts, TODO.md]
tests: []
refs: [docs/history/spec-changelog.md, plan:fix-auto-mode-select, kb:fact/permission-mode-flag-on-wire, kb:adr/launch-permission-modes-offered-four-tabbed]
supersedes: []
---
**Context.** Claude Code accepts six permission modes on its flag. Two of them, bypass-permissions and dont-ask, remove the permission prompt entirely; the other four are the ones its own interface cycles through.

**Options.** (A) Offer all six modes the flag accepts. (B) Offer the four tabbed modes and leave the two prompt-removing modes out until the planned permissions UI supplies guardrails around them.

**Decision.** A is rejected; B stands. Auto is offered because its guardrail is Claude Code's own classifier; the other two have none but the user's judgement, and a one-click radio is too easy a place to grant that.

**Consequences.** The request validation names exactly the four offered values. Offering the remaining two is tied in the backlog to the permissions UI, not to any wire change, so a version bump alone never reopens this.
