---
id: slash-model-effort-write-user-settings
type: fact
status: active
date: 2026-10-01
summary: /model and /effort save the choice to ~/.claude/settings.json as the new-session default; probes set model and effort with launch flags only.
features: []
tags: [claude-code-format, security]
files: [test/rig/newprobe.sh]
tests: []
refs: [kb:fact/model-switch-hooks, kb:fact/status-line-effort-key, kb:adr/launch-project-scoped-settings-not-config-dir]
verified: 2.1.286..2.1.286
guard: none
---
Typing `/model <m>` in a session prints `Set model to <M> and saved as your default for new
sessions`. When the project's `.claude/settings.json` pins a model it adds `.claude/settings.json
pins <pinned> — that applies on restart`. `/effort <level>` prints `Set effort level to
<level> (saved as your default for new sessions)`. The save goes to the **user** file:
`md5 -q ~/.claude/settings.json` changed after the first `/model sonnet`, after `/effort high`
and after `/model <haiku id>`. A repeat `/model sonnet` with the same value did not change
it. The file's content was not read.

So in a probe, or anything that runs against the developer's real config, `/model` and
`/effort` break the never-modify rule for `~/.claude/settings.json`. Change model and effort
only with `--model` / `--effort` at launch. Whether a launch flag ever persists is unmeasured.
Neither flag changed the hash in this probe.

Evidence: probe instance 3, 2026-10-01: 3 changes of the user-settings hash, each right after
one of those commands.
