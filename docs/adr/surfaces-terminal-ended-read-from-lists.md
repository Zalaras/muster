---
id: surfaces-terminal-ended-read-from-lists
type: decision
status: accepted
date: 2026-11-20
summary: Lists and replies carry a rev; a spawned terminal reads as ended only against the last list applied, and a failed follow-up listing answers a fresh rev.
features: [surfaces]
tags: [tmux]
files: [internal/server/shellactivity.go, internal/server/shells.go, web/src/features/surfaces.ts, web/src/terminal/terminalsrev.ts]
tests: []
refs: [kb:adr/surfaces-terminals-list-on-state-stream, kb:adr/surfaces-last-shown-terminal-per-window]
supersedes: [surfaces-terminals-list-revision]
---
**Context.** `kb:adr/surfaces-terminals-list-revision` numbered every terminals list and reply so a window drops a list older than a reply. Its "already ended" rule compared a spawn reply's `rev` with the highest rev seen from lists **and** replies. Two cases then hide a running terminal: a rename or close reply raises the seen rev before the list carrying a new terminal arrives, so the slower spawn reply reads as ended; and a spawn whose follow-up listing fails answers an old rev, so its terminal reads as ended too.

**Options.** (A) Keep the rule and file both as known gaps. (B) Read "ended" from lists only, and give a failed follow-up listing a fresh rev.

**Decision.** B. Everything in the superseded decision stands — `rev` on `terminals`, `snapshot.terminalsRev`, `rev` on all four terminal routes' replies, `DELETE` answering `200 {rev}`, and the per-session floor below which a list is ignored — with two changes. A spawn reply reads as ended only if its rev is at or below the rev of the last list the window **applied** for that session (or the snapshot's) and that list lacks its terminal; other replies raise only the stale-list floor. When a call's follow-up listing fails, its reply carries a fresh counter value taken without a broadcast, and the next successful poll broadcasts that session's list even if unchanged.

**Consequences.** Message revs can now have gaps. A window keeps two numbers per session: the floor, and the rev of the last applied list.
