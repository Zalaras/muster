---
id: connection-dashboard-embedded-in-binary
type: decision
status: accepted
date: 2026-08-31
summary: The built dashboard is embedded in musterd and served by default; the disk directory flag remains as a development override with unchanged behaviour.
features: [connection]
tags: [deps]
files: [internal/webui/webui.go, internal/server/server.go, cmd/musterd/main.go, web/vite.config.ts, Makefile]
tests: [TestStaticServing_Embedded, TestStaticServing_DiskOverride, web/e2e/embedded.spec.ts]
refs: [docs/history/spec-changelog.md, plan:embed-dashboard, kb:adr/connection-static-assets-from-disk, kb:adr/release-distribution-github-release-not-brew]
supersedes: [connection-static-assets-from-disk]
---
**Context.** The earlier decision served assets from a directory named by a flag and said to revisit only if a self-contained binary ever mattered. Distribution made it matter: a release archive has to run wherever it is copied.

**Options.** (A) Keep serving from disk and ship the bundle beside the binary. (B) Build the dashboard into a Go package directory, embed it, and serve the embedded filesystem when the flag is unset.

**Decision.** B. Flag set means disk exactly as before; unset, the new default, means embedded. Both paths sit behind the same cookie requirement.

**Consequences.** Build order is load-bearing: the web build must precede the Go build or the binary embeds a stale dashboard, so the E2E target orders them. The development loop keeps the disk override so a frontend change needs no relink. The embedded path has zero modification times and therefore no conditional responses, the only intended divergence. A missing web build is handled by a separate fail-fast record.
