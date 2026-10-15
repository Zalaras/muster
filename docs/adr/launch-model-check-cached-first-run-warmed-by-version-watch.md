---
id: launch-model-check-cached-first-run-warmed-by-version-watch
type: decision
status: accepted
date: 2026-10-15
summary: The model check still runs on dialog open and caches per binary identity; a new binary's ~11 s first run is paid by the daemon's version watch, not the dialog.
features: [launch]
tags: [claude-code-format, ux, user-decision]
files: [internal/server/launcher*.go, internal/claudecode/modelcheck*.go]
tests: []
refs: [plan:claude-version-watch, kb:fact/new-claude-binary-first-run-slow-on-macos, kb:adr/connection-claude-version-watched-and-pushed, kb:anchor/models.check, "https://github.com/Zalaras/muster/issues/81"]
supersedes: [launch-model-check-cached-per-binary-identity, launch-refuses-model-outside-binary-catalog, launch-model-presets-passed-verbatim]
---
**Context.** Issue #81: after a Claude Code update the dialog's four model checks all hit their 5 s bound and nothing was cached. The record this supersedes said the first dialog open after an update "pays about a second". It pays about 11 s, because macOS holds the first run of a new binary (kb:fact/new-claude-binary-first-run-slow-on-macos).

**Options.** (A) Raise the model check's bound past 11 s. (B) Keep the check as it is and pay the first run elsewhere, as soon as the binary changes.

**Decision.** B, the developer's choice. A longer bound moves the wait from the session's pane to the dialog without shortening it. The check, its cache against the resolved binary's path, size and mtime, and launch's refusal are unchanged.

**Consequences.** The daemon's version watch (kb:adr/connection-claude-version-watched-and-pushed) runs `claude --version` within about 30 s of an update, so a dialog opened after that pays about a second. A dialog opened inside that window still times out, is not cached, and fails open as before.
