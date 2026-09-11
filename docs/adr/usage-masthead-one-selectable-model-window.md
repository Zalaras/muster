---
id: usage-masthead-one-selectable-model-window
type: decision
status: accepted
date: 2026-08-30
summary: The wire carries every model-scoped weekly window; the masthead shows one, chosen by a selector and persisted as a preference with a default model.
features: [usage, settings]
tags: [ux, user-decision]
files: [web/src/features/usage.ts, web/src/render/masthead.ts, internal/server/prefs.go]
tests: [TestLoadPrefs_DefaultUsageModelIsFable, web/e2e/usage-model.spec.ts]
refs: [docs/history/spec-changelog.md, docs/history/protocol-changelog.md, plan:usage-model-bar, kb:anchor/ws.usage, kb:anchor/prefs.put, docs/design/design-system.md]
supersedes: []
---
**Context.** The usage endpoint returns a list of per-model windows whose membership depends on the account. The masthead has room for a bounded number of bars.

**Options.** (A) Render a bar per window and let the masthead grow. (B) Carry the whole list on the wire and show one window, chosen from a selector whose choice is a persisted preference.

**Decision.** B, settled with Damian. The default is the model he uses most.

**Consequences.** The masthead keeps a fixed order: five-hour, seven-day, model-week, refresh control, model readout, daemon health. A model missing from the list renders unknown with no track, and a failed fetch leaves the last good bar labelled stale rather than hiding it. Adding a model costs no daemon release; the preference is validated only for length.
