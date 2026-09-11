---
id: issue-disabled-button-affordance-deferred
type: decision
status: accepted
date: 2026-08-31
summary: The issue dialog ships its disabled primary button with no distinct visual state, like every other button; an app-wide disabled sweep is a backlog item.
features: [issue, theme]
tags: [ux, user-decision, deferred]
files: [web/src/features/issue.ts, web/src/style.css]
tests: []
refs: [docs/history/spec-changelog.md, plan:issue-capture, plans/issue-capture/decisions/disabled-button-affordance/decision.md, docs/design/design-system.md]
supersedes: []
---
**Context.** Review measured that the dialog's disabled submit button rendered pixel-identical to its enabled state. No disabled button anywhere in the dashboard had a visual disabled state, so this plan would have been the first to add one.

**Options.** (A) Style this one button's disabled state inside the plan. (B) Ship as-is, consistent with the rest of the dashboard, and file an app-wide token pass for disabled buttons.

**Decision.** B, Damian's call at review. A one-off style would have introduced an inconsistency dressed as a fix.

**Consequences.** No code change in the plan. The sweep is owned by the design system, not by whichever feature next notices the gap.
