---
id: restart-pending-marks-held-until-installed-known
type: decision
status: accepted
date: 2026-11-04
summary: A pending mark reloaded at daemon start stays off the wire and unfired until the first installed-version result re-derives it; the sweep runs then.
features: [actions]
tags: [user-decision]
files: []
tests: []
refs: [plan:restart-latest-claude, kb:adr/restart-busy-sessions-queued-until-free, kb:adr/restart-behind-means-older-than-installed, kb:fact/new-claude-binary-first-run-slow-on-macos]
supersedes: []
---
**Context.** Pending marks persist across a daemon restart, but at start the installed version is unknown until the background check returns (up to 30 s; about 11 s on a newly updated binary). The contract says `behind` is true only while `claudeCode.installed` is non-null and `restartPending` implies `behind`; reloading a mark straight onto the wire, and sweeping it right after reconcile, broke both and could restart a session before the daemon knew what it would restart onto.

**Options.** (A) Keep reloaded marks live and write the start-up window into the contract as an exception. (B) Hold reloaded marks daemon-side, off the wire, until the first installed result re-derives them; run the start sweep on that result.

**Decision.** B, the developer's choice (review cycle 1). Until the first installed-version result a reloaded mark shows as `restartPending: false`, `behind: false` and cannot fire. That result re-derives it: still behind → the mark returns to the wire and a free session restarts at once; not behind, or installed unknown → the mark is cleared.

**Consequences.** Both wire invariants hold at every instant. A queued restart waits up to 30 s after a daemon restart. A first check that cannot resolve the binary clears the held marks, as an unknown installed version already does.
