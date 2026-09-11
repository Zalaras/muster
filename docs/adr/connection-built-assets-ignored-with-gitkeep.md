---
id: connection-built-assets-ignored-with-gitkeep
type: decision
status: accepted
date: 2026-08-31
summary: Built dashboard assets are gitignored; a committed placeholder keeps the embed directive compiling on a fresh clone, and the web build restores it.
features: [connection]
tags: [deps, pipeline]
files: [internal/webui/webui.go, .gitignore, web/vite.config.ts]
tests: [TestFS_RootedAtAssets]
refs: [docs/history/spec-changelog.md, plan:embed-dashboard, kb:adr/connection-dashboard-embedded-in-binary]
supersedes: []
---
**Context.** An embed directive fails to compile when its directory is empty or absent. The Go build had to keep working on a fresh clone with no Node installed, because the pipeline's daemon agents compile without the web toolchain.

**Options.** (A) Commit the built bundle. (B) Ignore the built files, commit an empty placeholder in the assets directory through an ignore carve-out, and have the web build put the placeholder back after it empties the directory.

**Decision.** B. A committed bundle would churn every frontend commit and drift from source.

**Consequences.** The build tree stays clean after a web build, so the version derived from git never carries a dirty suffix. The placeholder is restored in the bundler's final hook, because the earlier hook fires before the emptied directory is rewritten.
