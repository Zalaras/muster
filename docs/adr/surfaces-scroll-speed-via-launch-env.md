---
id: surfaces-scroll-speed-via-launch-env
type: decision
status: accepted
date: 2026-09-03
summary: Wheel scrolling moves five lines per notch through an undocumented Claude Code environment variable in the launch and resume env, guarded by the canary.
features: [surfaces, launch]
tags: [claude-code-format, ux]
files: [internal/claudecode/launch.go, spikes/S6-scroll-bandwidth.md]
tests: [TestInstalledBinaryCarriesInterfaceStrings]
refs: [docs/history/todo-done.md, spikes/S6-scroll-bandwidth.md, kb:fact/scroll-speed-env-present, kb:adr/canary-static-tier-asserts-bundle-strings, kb:adr/surfaces-scrollback-affordance-not-built, "#13"]
supersedes: []
---
**Context.** Scrolling in a pane moved about one line per wheel notch. The report blamed tmux copy-mode and asked for a design pass on surfacing scrollback from the browser; a controlled spike disproved both causes. With mouse mode off the wheel reaches Claude Code, which requests mouse tracking itself, and its scroll speed is governed by an environment variable absent from its help text and found by reading strings out of the binary.

**Options.** (A) Leave it. (B) Route the wheel into tmux copy-mode. (C) Set the environment variable in the launch environment, merged into both launch and resume so a resumed session behaves the same.

**Decision.** C. Measured end to end at roughly five lines per notch through a Muster-launched session.

**Consequences.** An unsupported interface degrades silently on an upstream rename, so the canary's static tier asserts every launch-environment key as a byte string in the installed bundle; the effect itself stays measured in the spike. The scrollback affordance the same report asked for is recorded separately as not built.
