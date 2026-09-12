---
id: release-no-ci-test-job-yet
type: decision
status: rejected
date: 2026-08-31
summary: No test or lint job runs in CI for now; the release build is the compile gate, and adding the check target is one step when open-sourcing makes it worth having.
features: [release]
tags: [pipeline, testing, revisit]
files: [.github/workflows/release.yml, Makefile]
tests: []
refs: [docs/history/spec-changelog.md, docs/history/design/open-sourcing.md, kb:adr/process-repo-public]
supersedes: []
---
**Context.** With a release workflow in place, the obvious next step was a CI job running the unit tests and linters on every push.

**Options.** (A) Add a test and lint job now. (B) Let the release build stand as the compile gate and run the check target locally, revisiting when the repo goes public or gains a contributor.

**Decision.** A is not built for now; B stands. For a single user who runs the checks before every landing, CI tests cost runner minutes and add no information.

**Consequences.** Adding the job is a one-line step invoking the existing check target. This record is revisited by the open-sourcing work.
