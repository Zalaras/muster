---
id: usage-masthead-shows-no-model
type: decision
status: accepted
date: 2026-10-12
summary: The masthead shows no model and the usage object drops its model field; the model shows per session only, and usage history still records it.
features: [usage]
tags: [ux, user-decision]
files: [internal/server/usagewire.go, web/src/protocol/usage.ts, web/src/render/masthead.ts, web/index.html]
tests: []
refs: [plan:masthead-indicators, https://github.com/Zalaras/muster/issues/85, kb:anchor/ws.usage, kb:adr/usage-masthead-one-selectable-model-window, kb:adr/usage-sample-dedup-by-value]
supersedes: [usage-masthead-model-from-freshest-sample]
---
**Context.** The masthead labelled the account bars with the freshest status-line sample's model. With every session on one model it never changes, and it reads as a launch model (#85). The per-model weekly bar now carries its own model selector, which leaves this label very little to do.

**Options.** (A) No model in the masthead; per session only. (B) Keep the freshest sample's model. (C) Keep it on the wire but stop rendering it.

**Decision.** A, and the `model` field leaves the wire too, so nothing carries data no client reads. The daemon still reads the model from status posts to record and dedup `usage_sample` rows.

**Consequences.** A change in the model alone still records a history row and sends a `usage` message identical on the wire to the last one apart from its re-stamped `sampledAt`, which is harmless. Removing an optional field changes no existing field's shape, so the protocol version does not bump (kb:adr/connection-protocol-bumps-only-on-shape-change).
