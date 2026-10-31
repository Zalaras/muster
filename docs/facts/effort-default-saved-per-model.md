---
id: effort-default-saved-per-model
type: fact
status: active
date: 2026-10-15
summary: /effort saves a per-model default that a no-flag launch starts at; --effort overrides it, /effort auto clears it, the slider's s saves nothing.
features: [launch]
tags: [claude-code-format, security]
files: [internal/claudecode/launch.go]
tests: []
refs: [kb:fact/slash-model-effort-write-user-settings, kb:fact/effort-levels-per-model]
verified: 2.1.300..2.1.300
guard: none
---
Still true from kb:fact/slash-model-effort-write-user-settings: `/effort <level>` replies `(saved
as your default for new sessions)` and changes the user settings file's hash. Measured on 2.1.300:

- The saved default is **per model**. After `/effort low` in a Haiku 5.5 session, a new
  `--model haiku` launch with no `--effort` started at `low`, while a new `--model sonnet` launch
  started at Sonnet 5.5's own default `high`. (The settings schema describes `effortLevel` keyed
  per model under `modelSettings`.)
- `--effort max` on a new Haiku 5.5 launch started at `max` despite the saved `low`: the flag wins.
- `/effort auto` replied `Effort level set to auto`; the next no-flag Haiku 5.5 launch started at
  `medium` again.
- The slider's `s` replied `(this session only)` and left the user settings hash unchanged.

So a launch that omits `--effort` starts at whatever the developer last saved for that model,
not at a fixed default; only an explicit flag is deterministic.

Evidence: probe instance 3, 2026-10-15, sessions `388105f6`, `a23e8f6e`, `64c4307b`, `49c7e636`;
2.1.300. The settings content was never read; only `md5 -q` was compared.

Raw probe capture (local only, not in git): `capture-3.jsonl`.
