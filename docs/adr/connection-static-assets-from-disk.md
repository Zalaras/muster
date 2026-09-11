---
id: connection-static-assets-from-disk
type: decision
status: superseded
date: 2026-08-22
summary: The dashboard's static assets are served from a directory given by a flag, not embedded, so the Go build never depends on the web build.
features: [connection]
tags: [deps, revisit]
files: [cmd/musterd/main.go, internal/server/server.go]
tests: [TestRoutes_StaticRequiresCookie, web/e2e/embedded.spec.ts]
refs: [docs/history/spec-changelog.md, plan:m0-skeleton]
supersedes: []
---
**Context.** The daemon and the dashboard build separately. Embedding the bundle ties every Go compile to a prior web build, and the pipeline's daemon agents should not need Node to compile.

**Options.** (A) Embed the built bundle in the binary. (B) Serve from a directory named by a flag, with the cookie requirement in front of it.

**Decision.** B, to be revisited only if a self-contained binary ever matters.

**Consequences.** The Go build is independent of the web toolchain. Running the daemon by hand means pointing it at a built bundle. The stated revisit condition arrived with distribution, and a later record embeds the bundle by default and turns the flag into a development override.
