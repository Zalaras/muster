---
id: nongoal-resource-gauges
type: decision
status: rejected
date: 2026-08-16
summary: No CPU or memory gauges per session or for the machine; usage means Claude usage limits and context, never host resources.
features: [usage]
tags: [never, user-decision]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/nongoal-cost-tracking]
supersedes: []
---
**Context.** The mockup and the research both showed host resource gauges beside sessions. Muster's success framing is awareness of what Claude is doing: usage windows, context, state and navigation.

**Options.** (A) Sample process CPU and memory per session and render gauges. (B) Render only Claude-side gauges: rate-limit windows and context percentage.

**Decision.** B, marked never.

**Consequences.** The daemon never samples host processes and has no process-tree knowledge beyond the tmux panes it owns. Every gauge on the dashboard comes from the status line or the usage endpoint.
