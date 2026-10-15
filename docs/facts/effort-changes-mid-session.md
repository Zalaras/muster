---
id: effort-changes-mid-session
type: fact
status: active
date: 2026-10-15
summary: /effort changes the level at once with only the status line saying so; the chosen effort survives /model, re-clamped per model; no hook carries it.
features: [ingest, usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go]
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/status-line-effort-key, kb:fact/model-switch-hooks, kb:fact/effort-levels-per-model, kb:fact/effort-default-saved-per-model]
verified: 2.1.300..2.1.300
guard: none
---
In one Haiku 5.5 session launched with `--effort low`:

- `/effort high`, then `/effort xhigh`: each changed the next status-line post's `effort.level`
  within a second, with no turn and **no hook** of any kind.
- `/model claude-haiku-4-5-20251001`: the key dropped from the next post. `/model haiku` brought
  it back at `xhigh`, the session's chosen level. `/model claude-opus-4-5-20251101` showed `high`
  (Opus 4.5's ceiling); back to `haiku` showed `xhigh` again. So the session holds one chosen
  level and each model shows it clamped to its own set (kb:fact/effort-levels-per-model).
- `PreModelSwitch` / `PostModelSwitch` payloads carry no effort field.
- `/effort auto` reset the level to the model's default (`medium` on Haiku 5.5).
- `/effort ultracode on` replied `Ultracode on (this session only): … Effort stays medium.` and
  left the level unchanged; `off` likewise. The status line has no ultracode key either way.
- On Haiku 4.5, `/effort high` was accepted and saved, but no post carried the key.

`/effort` with no argument opens a slider over `low medium high xhigh max` (all five even on
Haiku 4.5), with Tab toggling ultracode and `s` applying the level to this session only.

So effort is known only from the status line: a missed post leaves it stale until the next.

Evidence: probe instance 3, 2026-10-15, session `be474ab5`; 2.1.300.
