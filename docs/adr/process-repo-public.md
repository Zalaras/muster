---
id: process-repo-public
type: decision
status: accepted
date: 2026-09-10
summary: The repository is public, flipped by an idempotent script that also applies the branch ruleset, Actions limits, security features and topics, all verified.
features: [release]
tags: [security, user-decision]
files: [scripts/go-public.sh, docs/go-public.md, docs/design/open-sourcing.md, LICENSE, README.md]
tests: []
refs: [docs/history/spec-changelog.md, docs/go-public.md, docs/design/open-sourcing.md, kb:adr/process-licence-mit, kb:adr/process-contributions-deferred-to-first-pr, kb:adr/process-main-ruleset-blocks-deletion-and-force-push-only, kb:adr/process-dependabot-version-prs-off, kb:adr/release-no-ci-test-job-yet]
supersedes: []
---
**Context.** The spec's posture had been that the repository stays private. A pre-flight audit found nothing that needed scrubbing, the licence and contribution policy were settled, and the private repository was the one thing blocking an installer that needs no account, a Homebrew tap and free Actions minutes.

**Options.** (A) Stay private and keep the account-gated install path. (B) Go public, applying the settings as one scripted, dry-run-by-default step so the flip and its consequences are reviewable and repeatable.

**Decision.** B, Damian's decision, after confirming his employment IP terms. The script is never run unasked and applies only the steps marked for it; the rest of the checklist is done by hand.

**Consequences.** Existing releases and their binaries became public with the flip. Issue bodies became attacker-controlled text, which drove the triage hardening. Projects, wiki and discussions are off; delete-branch-on-merge is on; six topics are set. Two operational lessons are recorded beside the checklist: the visibility flag needs a recent GitHub CLI, and the repository is briefly locked after the flip, so the script is idempotent and re-run.
