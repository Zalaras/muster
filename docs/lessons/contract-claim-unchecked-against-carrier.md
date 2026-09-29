---
id: contract-claim-unchecked-against-carrier
type: lesson
status: active
date: 2026-09-29
summary: A contract promised a null the wire struct cannot carry, and keyed a guard on an id only a late hook assigns; both surfaced mid-run as user decisions.
features: [launch, past-sessions]
tags: [pipeline, envelope]
roles: [planner, review]
files: [.claude/skills/plan-work/SKILL.md]
tests: []
refs: [plan:resume-and-dangerously-allow, plans/resume-and-dangerously-allow/review.cycle1.md, plans/resume-and-dangerously-allow/decisions/display-name-falls-back-to-id/decision.md, plans/resume-and-dangerously-allow/decisions/pending-resume-holds-id/decision.md]
---

**What happened.** The approved Protocol Contract said a resumed session's `model.displayName` may be null, but the wire field is a non-pointer string, so the daemon could not send null and the web widened a type it never received. The one-alive-row guard was keyed on the Claude session id, which only a `SessionStart` hook assigns, although the plan's own fact said no hook arrives while Claude Code waits on its bypass warning.

**Cost.** Two mid-run user decisions, one contract amendment each, two cycle-1 Criticals and four Majors, and a web widening that a later wave reverted.

**The lesson.** Before approval, check every nullable field against the wire struct that must carry it, and every guard key against the event that assigns it: a key only a hook assigns leaves a window as long as the plan's own facts say hooks can be absent.
