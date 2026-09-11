---
id: canary-exact-pin-bumped-after-green-runs
type: decision
status: accepted
date: 2026-08-29
summary: Muster pins one exact Claude Code version, and the pin moves only after the canary has run green against the new version.
features: [canary]
tags: [claude-code-format, testing, revisit]
files: [internal/claudecode/version.go, docs/claude-code-versions.md]
tests: [TestInstalledVersionClassifies]
refs: [docs/history/spec-changelog.md, docs/claude-code-versions.md, kb:adr/canary-drives-installed-claude-through-production-chain, kb:anchor/ws.hello]
supersedes: []
---
**Context.** Muster consumes wire formats nobody promises to keep stable. The daemon compares the installed claude against a version it knows and shows drift in the dashboard, so something has to say which version is known and how that changes.

**Options.** (A) Follow whatever is installed and treat every version as known. (B) Pin one exact version in code and move the pin only after the canary passes against the candidate, repeating the run to rule out flakiness. (C) Hold a verified range that the canary extends.

**Decision.** B, applied as a ritual written down beside the version file. C was noted as the post-v1 rethink and left open.

**Consequences.** Drift is a warning, never a refusal to run. Bumping is a small mechanical commit gated on a real run against a real subscription. The pin itself is a fact about the code, not restated here.
