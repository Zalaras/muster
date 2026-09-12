---
id: permission-prompt-needs-unallowlisted-tool
type: lesson
status: active
date: 2026-08-16
summary: The user's allowlist applies to spike sessions: Bash(echo hello) was auto-approved and no PermissionRequest fired. Pick a tool the allowlist does not cover.
features: [canary]
tags: [testing, claude-code-format]
roles: [e2e-specs, e2e-validate, daemon-tests]
files: []
tests: []
refs: [docs/history/spikes/canary-fields.md, CLAUDE.md, kb:fact/local-settings-honoured]
---
**What happened.** The spike deliberately did not isolate `~/.claude/settings.json`, because Damian's live sessions depend on it. His personal permission allowlist therefore applied to spike sessions: a `Bash(echo hello)` was auto-approved, produced no permission prompt, and the probe waiting on `PermissionRequest` waited on a hook that was never going to fire.

**Cost.** A probe run spent on a non-event, and a wrong conclusion narrowly avoided about whether the hook exists.

**What changed.** Any E2E or probe that depends on a permission prompt picks a tool the user's allowlist does not cover; the `Write` tool worked. The rule never to read or modify the user's settings stands, so isolation is always a project-scoped `.claude/settings.json` in a scratch repo, and a permission-dependent assertion names the tool it relies on.
