---
id: release-drops-js-sourcemap
type: decision
status: accepted
date: 2026-08-31
summary: Release builds omit the dashboard's JavaScript sourcemap; local and E2E builds keep it, so the shipped artifact differs from the tested one by the maps alone.
features: [release, connection]
tags: [deps, user-decision]
files: [web/vite.config.ts, .goreleaser.yaml]
tests: []
refs: [docs/history/spec-changelog.md, plan:embed-dashboard, kb:adr/connection-dashboard-embedded-in-binary]
supersedes: []
---
**Context.** Embedding put the whole web build inside the binary, and the review of that work deferred the question of the large sourcemap to the distribution work.

**Options.** (A) Ship the map, keeping the release identical to the E2E-tested build. (B) Drop it in release builds through an environment switch and keep it everywhere else.

**Decision.** B, accepted deliberately. The map serves debugging in development, not a released single-user binary.

**Consequences.** The shipped artifact differs from the E2E-tested one by the maps alone, and nothing else in the build is conditional on the switch, so the divergence stays bounded to that one file.
