---
id: finding-severity-misrouted
type: lesson
status: active
date: 2026-09-07
summary: Approved with a Major, Minors deferred to TODO, a false README filed as a nit, an agent-tagged note: four labelling mistakes that each lost a fix or a wave.
features: []
tags: [pipeline]
roles: [review, orchestrator]
files: []
tests: []
refs: [plan:m4-hook-quoting, plan:v1-cleanup, plan:tmux-installation, plan:usage-model-bar, .claude/agents/review-work.md, .claude/skills/orchestrate/SKILL.md]
---
**What happened.** Four labelling mistakes across four runs. A review approved with a Major open, so a missing regression test shipped as backlog instead of a five-minute wave. Three cosmetic Minors were deferred to `TODO.md` instead of a two-minute wave. A README stating the opposite of a verified criterion was filed as a comment nit and shipped as a TODO line. A Minor tagged for an agent that said "purely a note" cost a judgement call and a re-review.

**Cost.** Two fixes lost to the backlog, one shipped falsehood, one wasted re-review.

**What changed.** Any agent-tagged issue at any severity blocks approval and routes to its wave; Minors are never deferred. A doc line contradicting a verified criterion is Major and tagged to the file's owner. An observation with no change wanted is `[note]`, never agent-tagged, under its own heading. A Minors-only wave is followed by a cheap delta re-review, so the label costs little.
