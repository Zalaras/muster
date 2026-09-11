---
id: process-main-ruleset-blocks-deletion-and-force-push-only
type: decision
status: accepted
date: 2026-09-10
summary: The default-branch ruleset blocks deletion and force-push and nothing else; no required PRs or checks, because landing pushes squashes straight to main.
features: [release]
tags: [pipeline, security]
files: [scripts/go-public.sh, docs/go-public.md, .claude/skills/land/SKILL.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/go-public.md, kb:adr/process-repo-public, kb:adr/process-land-skill-is-the-landing-ritual, kb:adr/release-versioning-automatic-from-conventional-commits]
supersedes: []
---
**Context.** A public repository invites the usual branch protection: required reviews, required status checks, pull requests only. Muster's landing ritual squash-merges an approved plan branch locally and pushes to the default branch, and that push is what cuts a release.

**Options.** (A) Full protection with required pull requests and checks, moving landing onto pull requests. (B) Block only the two irreversible operations, deletion and force-push, and leave the landing ritual as it is.

**Decision.** B. Nobody but Damian pushes, review happens in the pipeline before landing, and a required-check gate would need the CI test job that is deliberately not built yet.

**Consequences.** Actions are separately restricted to GitHub-owned and verified creators with a read-only default token and first-time-contributor approval for fork runs, belt and braces since the only workflow triggers on a push a fork cannot make. Revisiting the CI job is where the required-checks question reopens.
