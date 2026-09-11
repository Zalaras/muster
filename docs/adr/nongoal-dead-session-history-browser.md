---
id: nongoal-dead-session-history-browser
type: decision
status: rejected
date: 2026-08-16
summary: No browsable history of dead sessions in v1; the append-only event table already holds what such a view would read.
features: [lifecycle]
tags: [store, revisit]
files: []
tests: []
refs: [SPEC.md, docs/history/interview-notes.md, kb:adr/nongoal-attention-ribbon-post-v1, kb:adr/actions-pane-snapshot-display-only]
supersedes: []
---
**Context.** Every hook event is logged with a daemon-assigned sequence and correlation ids, so the story of a finished session is on disk. Rendering it is a history surface the dashboard does not otherwise have.

**Options.** (A) Build a dead-session browser in v1. (B) Keep the event log complete and defer the view.

**Decision.** B. The event table accommodates the feature without schema change, so deferring costs nothing.

**Consequences.** Dead sessions keep their row and last pane snapshot until removed, which is the only history the dashboard shows. Any timeline rendering joins the same post-v1 family as the attention ribbon.
