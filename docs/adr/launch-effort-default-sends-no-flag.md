---
id: launch-effort-default-sends-no-flag
type: decision
status: accepted
date: 2026-10-15
summary: The launch form's Effort row offers default plus the five levels; default sends no --effort, so Claude Code's own (possibly saved) default applies.
features: [launch]
tags: [claude-code-format, ux]
files: []
tests: []
refs: [plan:effort, kb:fact/effort-flag-values, kb:fact/effort-default-saved-per-model, kb:fact/effort-levels-per-model, "#68"]
supersedes: []
---
**Context.** `--effort` takes `low|medium|high|xhigh|max`; an unknown value warns and starts at the
default (kb:fact/effort-flag-values). A flagless launch starts at the developer's last saved level
for that model (kb:fact/effort-default-saved-per-model). Unlike Start in, there is no reason to
force a flag every time: Claude Code's own default is a legitimate choice.

**Decision.** Effort is a segmented row of `default` plus the five levels, remembered per directory
as the repo row's `lastEffort` (null for `default`). A level is passed as `--effort <level>`;
`default` passes none. `auto` and `ultracode` are not offered.

**Consequences.** A `default` launch never raises the launch-mismatch warning, because nothing was
asked for. Levels a model does not offer are not greyed out; the warning reports a clamp instead.
