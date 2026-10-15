---
id: session-effort-tri-state-from-status-line
type: decision
status: accepted
date: 2026-10-15
summary: A session's effort is read from every status post and carried on the wire as not-yet-reported, a level, or reported-with-no-effort.
features: [card-location, focus]
tags: [claude-code-format, store]
files: []
tests: []
refs: [plan:effort, kb:fact/status-line-effort-key, kb:fact/effort-changes-mid-session, kb:fact/effort-levels-per-model, "#68"]
supersedes: []
---
**Context.** No hook carries effort; the status line's top-level `effort.level` is the only
signal, and it is absent when the model has no effort setting (kb:fact/status-line-effort-key).
The Focus header must tell "not reported yet" from "this model has none".

**Options.** (A) A plain string with a sentinel for "none". (B) An object `{level}` that is null
before the first report, with a null `level` for "none".

**Decision.** B. The Session object's `effort` is null until a status post reports after a launch,
`{"level": <level>}` while the key is present, `{"level": null}` when a post lacks it. It is set by
every routed status post, persisted on the row, and kept by Stop, `/clear`, a Resume-button resume
and a daemon restart.

**Consequences.** A dead session that never reported renders no brackets, decided from `alive`.
A missed post leaves the value stale until the next one.
