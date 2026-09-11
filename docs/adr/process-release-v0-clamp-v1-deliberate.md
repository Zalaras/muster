---
id: process-release-v0-clamp-v1-deliberate
type: decision
status: accepted
date: 2026-09-01
summary: The release workflow runs svu with the v0 clamp, so no marker cuts 1.0.0 by accident; version 1 is cut by deliberately removing the flag.
features: [release]
tags: [pipeline, user-decision]
files: [.github/workflows/release.yml, docs/conventions.md, TODO.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:adr/process-release-breaking-marker-bang-gated, kb:adr/process-release-bump-map-widened-perf-refactor]
supersedes: []
---
**Context.** Muster is on a pre-1.0 line until its cleanup backlog closes. Any breaking marker the version tool recognised would have taken the version straight to 1.0.0, and the earlier rule against writing one was a convention with no enforcement.

**Options.** (A) Keep the convention and hope. (B) Have the workflow pass the tool's v0 clamp, under which a breaking marker bumps minor while the current version is below 1.0, and make the flag's removal the act that cuts 1.0.0.

**Decision.** B, settled with Damian and measured on a scratch repository: a breaking feature on a 0.x tag advanced the minor, not the major.

**Consequences.** While the flag exists, 1.0.0 is impossible, so a breaking marker on this line is safe to write when sanctioned. Cutting version 1 is a one-line workflow change made together with a breaking feature commit, listed in the backlog as the last pre-v1 step. Nothing else in the release chain has to know which line it is on.
