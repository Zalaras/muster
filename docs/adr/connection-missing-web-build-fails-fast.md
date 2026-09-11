---
id: connection-missing-web-build-fails-fast
type: decision
status: accepted
date: 2026-08-31
summary: A musterd built with no dashboard and no disk override exits non-zero at startup naming both remedies, replacing the old silent-404 mode.
features: [connection]
tags: [ux]
files: [cmd/musterd/main.go, internal/webui/webui.go]
tests: [TestCheckWebDist_NothingOnDiskNothingEmbeddedIsFatal, TestCheckWebDist_DiskOverrideEmptyDirWarnsButDoesNotFail, TestHasDashboard]
refs: [docs/history/spec-changelog.md, plan:embed-dashboard, kb:adr/connection-dashboard-embedded-in-binary]
supersedes: []
---
**Context.** Before embedding, a binary that could not find its assets served 404s at the root and otherwise ran normally, which read as a broken dashboard rather than a build mistake.

**Options.** (A) Keep serving 404s. (B) Log a warning and run. (C) Refuse to start when neither an embedded dashboard nor a disk override is present, and say what to do.

**Decision.** C for the embedded default: the message names both remedies, building the dashboard before the Go build or passing the disk flag. A disk override pointing at a directory without an index stays a warning, because that is the permissive development path.

**Consequences.** The failure is at startup, where the person who built the binary is watching, not at first page load. The check is a pure function over the two sources and is unit-tested in every combination.
