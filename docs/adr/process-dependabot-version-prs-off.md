---
id: process-dependabot-version-prs-off
type: decision
status: rejected
date: 2026-09-10
summary: Dependabot alerts, secret scanning and private vulnerability reporting are on; Dependabot version-update PRs are not, since pins are deliberate and no PRs land.
features: [release]
tags: [deps, security]
files: [scripts/go-public.sh, docs/go-public.md, go.mod, web/package.json]
tests: []
refs: [docs/history/spec-changelog.md, docs/go-public.md, kb:adr/process-repo-public, kb:adr/process-contributions-deferred-to-first-pr]
supersedes: []
---
**Context.** Going public unlocks GitHub's security features. Alerts, scanning and a private reporting channel are pure upside. Automated version-update pull requests are a different matter: the project accepts no pull requests, and its dependency pins, from the Node version to the terminal library, are chosen on purpose.

**Options.** (A) Turn on version-update pull requests too and merge them as they come. (B) Alerts and scanning only; dependency bumps stay deliberate commits made in a session that runs the gates.

**Decision.** A is rejected; B stands. A bot-authored pull request would be the only pull request in the repository, and a merged bump that skipped the canary or the E2E suite is exactly the kind of change the pins exist to prevent.

**Consequences.** A vulnerability alert is a prompt to bump by hand under the usual gates. The reporting button in the security policy works because private vulnerability reporting is on.
