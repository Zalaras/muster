---
id: status-line-effort-key
type: fact
status: active
date: 2026-10-01
summary: The status line has effort{level} only while the model supports effort; it tracks --effort and /effort at once, and /effort fires no hook.
features: [usage]
tags: [claude-code-format]
files: [internal/claudecode/status.go]
tests: []
refs: [test/rig/captures/capture-3.jsonl, kb:fact/status-line-keys, kb:fact/model-switch-hooks]
verified: 2.1.286..2.1.286
guard: none
---
A status-line post has a top-level `effort: {"level": "<level>"}` key **only when the current
model supports effort**. In the bundle it is `...supportsEffort(model) && {effort:{level}}`.

- Haiku 4.5: absent on every post (0 of 100 posts across 4 sessions), including one launched
  with `--effort low`.
- Sonnet 5.5: present. With no flag the level was `medium`. In a session launched with
  `--effort low` on Haiku, switching to Sonnet showed `low`, so the flag's level applies once
  the model can take it.
- `/effort high` changed the next post to `high` within a second, with no turn. It fired no
  hook: `ConfigChange` was registered and stayed silent.
- Switching back to Haiku dropped the key from the next post.

Levels seen: `low`, `medium`, `high`. The bundle's enums also contain `xhigh` and `max`; which
models offer them is unmeasured. `thinking.enabled` is a separate key and was `true`
throughout.

So effort can change mid-session with nothing but the status line saying so. A missing key
means "this model has no effort setting", not "unknown".

Evidence: probe instance 3, 2026-10-01, sessions `50447df0`, `c80dcde6`, `8b5e8581`, `f0f21860`; Sonnet posts 15 of 15 carry the key.
