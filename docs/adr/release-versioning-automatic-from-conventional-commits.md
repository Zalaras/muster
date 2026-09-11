---
id: release-versioning-automatic-from-conventional-commits
type: decision
status: superseded
date: 2026-08-31
summary: Versions are computed from conventional commits since the last tag on every push to main; Muster stays on 0.x, so the breaking marker is not used.
features: [release]
tags: [pipeline, user-decision]
files: [.github/workflows/release.yml, docs/conventions.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/conventions.md, kb:adr/process-land-skill-is-the-landing-ritual]
supersedes: []
---
**Context.** Releases needed a version and a trigger. Muster's commit convention already carried types.

**Options.** (A) Tag versions by hand when a release feels due. (B) Derive the next version from the commit types since the last tag on every push to main: a feature bumps minor, a fix bumps patch, everything else releases nothing.

**Decision.** B, using a version tool that reads conventional commits. The commit convention thereby becomes load-bearing rather than stylistic.

**Consequences.** Muster stays on 0.x until the pre-v1 cleanup closes, so the breaking marker is not to be used; it would take 0.x straight to 1.0.0. The landing step shows the predicted bump before pushing, so landing chooses the version. The mapping from types to bumps was later widened and re-measured, recorded in a superseding entry.
