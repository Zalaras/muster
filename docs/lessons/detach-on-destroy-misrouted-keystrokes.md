---
id: detach-on-destroy-misrouted-keystrokes
type: lesson
status: active
date: 2026-08-23
summary: A spike value measured under one tmux topology was carried into the plan that replaced it; killing one session sent keys to another's claude.
features: [surfaces]
tags: [tmux, testing]
roles: [plan-work, daemon-tests, e2e-specs]
files: []
tests: []
refs: [plan:m2-terminal, spikes/FINDINGS.md, .claude/skills/plan-work/SKILL.md, .claude/agents/daemon-tests.md, .claude/agents/e2e-specs.md]
---
**What happened.** The spike measured `detach-on-destroy off` as correct under the first milestone's topology, where every pane shared one tmux session. The terminal plan replaced that topology with a session per pane and carried the value over unexamined. Under the new topology killing one session's window detached its client onto another session and keystrokes went to the wrong claude. Every kill test ran one session, so nothing saw it.

**Cost.** A review cycle. The measurement was real; its applicability had expired.

**What changed.** A measured value is evidence for the configuration it was measured in. When a plan applies one under a different tool, permission mode, auth state, version or topology, it re-checks that value in writing, per value. Destructive per-session paths get a variant with two or more sessions live that asserts the bystanders' client count, pane content and socket are unaffected, in unit tests and E2E alike; "nothing else was harmed" is an assertion.
