---
id: connection-protocol-bumps-only-on-shape-change
type: decision
status: accepted
date: 2026-09-10
summary: The protocol version bumps only when an existing field changes shape; additive messages and fields do not bump, and a skewed open tab is told to reload.
features: [connection]
tags: [envelope, ux]
files: [internal/server/ws.go, web/src/protocol.ts, docs/protocol.md]
tests: [web/e2e/claude-version.spec.ts, web/e2e/resilience.spec.ts]
refs: [docs/history/protocol-changelog.md, docs/history/spec-changelog.md, plan:version-claude-interface, kb:anchor/ws.hello, kb:adr/connection-dashboard-embedded-in-binary, kb:adr/connection-installed-claude-classified-never-refused]
supersedes: []
---
**Context.** The hello frame's Claude Code object changed from pinned-installed-drift to installed-floor-verified-status, the first change to an existing field's shape since the protocol was written. Earlier plans had added endpoints, messages and fields without a bump, so the rule for when the number moves needed stating.

**Options.** (A) Bump on every wire change. (B) Bump only when an existing field's shape changes so an old client would misread it; additive changes never bump. (C) Never bump; let the client tolerate anything.

**Decision.** B. The dashboard is embedded in the binary, so the only client that can be skewed is a tab left open across a daemon upgrade, and the gate already tells it to reload.

**Consequences.** The auto-update work that landed the same day was additive and did not bump. A bump is one number on both sides and one changelog line, and the reload banner is the whole migration path.
