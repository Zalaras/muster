---
id: lifecycle-bind-model-display-name-is-id
type: decision
status: accepted
date: 2026-10-01
summary: A SessionStart naming a different model sets the display name to the id until the status line confirms it; the same id changes nothing.
features: [lifecycle, card-location]
tags: [claude-code-format]
files: []
tests: []
refs: [plan:stale-dirs-models-branches, kb:fact/sessionstart-model-optional-string, kb:fact/status-model-is-object, kb:fact/model-switch-hooks]
supersedes: []
---
**Context.** `applyBind` replaced the model id from `SessionStart.model` but carried the old
display name over. That left it empty on a resumed session with no recorded model, and stale
when the id changed. The protocol already promised that the display name "is the id until the
status line confirms it".

**Options.** (A) Ignore `SessionStart.model` and wait for the status line. (B) Adopt it, with
the display name set to the id.

**Decision.** B. A bind naming the current id leaves `model` untouched, so a late
`SessionStart` never erases a display name the status line already confirmed. A different id,
or a null model, becomes `{id, displayName: id}`. The display name is never empty.

**Consequences.** The status line stays the source of the display name, `/model` included.
