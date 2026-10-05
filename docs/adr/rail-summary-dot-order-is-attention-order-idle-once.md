---
id: rail-summary-dot-order-is-attention-order-idle-once
type: decision
status: accepted
date: 2026-10-05
summary: A section header's summary lists states in attention order with idle counted once, after working, and ended members last under a neutral dot.
features: [rail, groups]
tags: [ux]
files: [web/src/sessions/sort.ts, web/src/render/sessions.ts]
tests: []
refs: [plan:groups, kb:spec/groups]
supersedes: []
---
**Context.** The header summary is a count plus a dot-and-number per state present, "in attention order". Attention order splits idle into unread (early) and read (last); a summary dot per state cannot show both without two idle dots.

**Options.** (A) Two idle entries, unread and read. (B) One idle entry placed where unread idle sorts. (C) One idle entry placed where read idle sorts: needs input, failed, started, planning, working, idle, then ended.

**Decision.** C. The summary answers "what needs me" first; an idle dot early in the row would read louder than it should. Ended members are not a state (kb:adr/lifecycle-alive-flag-not-a-state), so they take a neutral `--line-control` dot at the end.

**Consequences.** Each dot carries the state's own token and a title such as `2 needs input`, so colour is never the only carrier (design-system §3). The popover spells the same order out with the session titles.
