---
id: usage-masthead-model-from-freshest-sample
type: decision
status: accepted
date: 2026-08-23
summary: The masthead shows the model from the freshest usage sample; flicker under mixed-model sessions is accepted.
features: [usage]
tags: [ux]
files: [web/src/render/masthead.ts, internal/server/usagewire.go]
tests: [web/e2e/gauges.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m3-gauges, kb:anchor/ws.usage, kb:fact/status-model-is-object]
supersedes: []
---
**Context.** Rate limits are account-wide but the status line reports them alongside the posting session's model. The masthead wanted a model readout and had to pick whose.

**Options.** (A) No model in the masthead; show it per session only. (B) The model of the freshest sample, accepting that two sessions on different models make it alternate. (C) A user-selected model.

**Decision.** B. The usage object gains a nullable model field carrying the freshest sample's id and display name.

**Consequences.** Per-session model stays on the card and tile. The readout flickers exactly when the user is running mixed models, which is honest about what the account is doing. A later per-model usage bar added a user-selected model for that bar without changing this readout.
