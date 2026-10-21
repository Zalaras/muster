---
id: notes-unsaved-text-kept-in-browser-until-acknowledged
type: decision
status: accepted
date: 2026-10-21
summary: Note text musterd has not acknowledged is kept in local storage per session and re-sent on load and reconnect; an older kept draft may overwrite a newer save.
features: [notes]
tags: [ux, user-decision]
files: []
tests: []
refs: [plan:session-notes]
supersedes: []
---
**Context.** The spec promises that a reload, a browser close or a daemon outage loses no typed
character. A save on page unload is best-effort, and keepalive requests are capped at 64 KiB in
flight, so an unload flush alone cannot keep that promise.

**Decision.** Text not yet acknowledged by musterd is kept in the browser's local storage, keyed by
session. It is re-sent on the next load and on every reconnect. It is cleared when musterd
acknowledges that same text, and dropped when the session is removed.

**Consequences.** Nothing typed is lost across a reload or an outage. One accepted edge: when a
window closes with a kept draft and another window later saves newer text, the reopened first
window's older draft wins, which is consistent with last write wins.
