---
id: launch-trust-prompt-never-auto-answered
type: decision
status: accepted
date: 2026-08-16
summary: The workspace-trust prompt is surfaced to the user and never auto-answered; it is detected by absence of signal plus Muster's records.
features: [launch]
tags: [security, ux]
files: [web/src/render/sessions.ts, web/src/sessions/card.ts, internal/store/repo.go]
tests: [web/e2e/launch.spec.ts]
refs: [docs/history/spec-changelog.md, docs/design/ux-flows.md, kb:fact/trust-prompt-preselects-exit, spikes/FINDINGS.md]
supersedes: []
---
**Context.** On the first launch in a directory Claude Code has not seen, a trust prompt blocks startup: no hooks fire and no status line renders, so the session looks merely slow. Headless runs do not record trust, so nothing can pre-trust a directory.

**Options.** (A) Auto-answer the prompt by sending keystrokes into the pane. (B) Surface the blocked state and let the user answer in the terminal. For detection: (C) read the pane text, or (D) infer it from the absence of a SessionStart together with Muster's own records.

**Decision.** B with D. The prompt is the only gate before Claude Code can read, edit and execute in a folder, so answering it is a security decision that stays with the user. A directory with no prior repo row is expected to block; otherwise a session with no SessionStart after a short wait shows a no-signal-yet state.

**Consequences.** Muster never parses the pane for state, here or anywhere. A first launch into a new directory always needs one keystroke from the user. The test harness answers the prompt itself, which is a test concern and does not touch this rule.
