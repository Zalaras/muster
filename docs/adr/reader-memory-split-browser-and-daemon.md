---
id: reader-memory-split-browser-and-daemon
type: decision
status: accepted
date: 2026-09-14
summary: Last open file and cleared change dots are browser memory per session; which files Claude wrote is daemon memory lost on restart; nothing goes to SQLite.
features: [reader]
tags: [ux, store]
files: []
tests: []
refs: [plan:markdown-viewing, kb:adr/surfaces-shell-is-attach-target-not-session, kb:adr/reader-change-signal-is-the-write-hook]
supersedes: []
---
**Context.** The reader remembers three things: which file was open, which changed dots the user has already cleared by opening a file, and which files Claude wrote this session. Each could live in the browser, in daemon memory or in a session column.

**Options.** (A) Everything in SQLite on the session row. (B) Everything in the browser. (C) Split by who produces the fact: the user's reading position and cleared dots in browser storage keyed by session id, the daemon's observation of writes in daemon memory.

**Decision.** C. Browser storage is shared by the dashboard and the pop-out tab, survives reloads and needs no wire; every access is guarded so a throwing storage falls back to defaults. Write times live in the daemon for its lifetime and are served with the listing.

**Consequences.** A daemon restart forgets write times, so freshness cues are absent until the next write, which is labelled honesty rather than a wrong age. A different browser starts with nothing open, which then defaults to the plan. No schema is spent on reading state.
