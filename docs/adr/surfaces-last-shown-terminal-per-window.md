---
id: surfaces-last-shown-terminal-per-window
type: decision
status: accepted
date: 2026-11-20
summary: shell returns to the terminal last shown in this window, in memory only; else the lowest-numbered running terminal takes its place.
features: [surfaces]
tags: [ux]
files: [web/src/terminal/surfaceswitch.ts]
tests: []
refs: [plan:better-terminal, kb:adr/surfaces-terminals-numbered-attach-targets]
supersedes: []
---
**Context.** With several terminals, `shell` must pick one, and a terminal that ends while on screen must be replaced by something.

**Options.** (A) Last shown, per window, in memory. (B) Last shown, persisted in browser storage or by the daemon. (C) Always the lowest-numbered.

**Decision.** A, with C as the fallback. One click on `shell` returns to the terminal last shown in this window; when it is no longer running, or after a reload, the lowest-numbered running terminal is shown, and with none running `shell` starts one. The same rule replaces a terminal that ends on screen; with none left the session returns to `claude`. Persisting (B) adds a storage-unavailable state for a convenience a reload rarely needs.

**Consequences.** Two windows may show different terminals of one session; the one-live-client law is per terminal, so they never supersede each other.
