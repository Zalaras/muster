---
id: surfaces-unrecognised-tmux-version-warns
type: decision
status: accepted
date: 2026-08-31
summary: The stated minimum tmux is the version whose features the tmux package uses; a version string that runs but does not parse is a warning, not fatal.
features: [surfaces]
tags: [tmux]
files: [internal/tmux/preflight.go]
tests: [TestPreflight_UnrecognizedVersionIsNotFatal, TestPreflight_NewerDoubleDigitMinorIsOK, TestPreflight_TooOld]
refs: [docs/history/spec-changelog.md, plan:tmux-installation, kb:adr/surfaces-tmux-preflight-at-startup]
supersedes: []
---
**Context.** The preflight needed a minimum version and a rule for output it cannot read, such as a development build reporting a word instead of a number.

**Options.** (A) Treat anything unparseable as too old and refuse. (B) Warn and continue, since Muster cannot prove an unrecognised build lacks the features it uses.

**Decision.** B. The minimum is derived from the two tmux options the package relies on, environment on new-session and the terminal-features option, both introduced in the same release.

**Consequences.** Versions compare as two integers, never as strings, so a double-digit minor orders above a single-digit one. Raising the minimum is a one-constant change with the reason beside it.
