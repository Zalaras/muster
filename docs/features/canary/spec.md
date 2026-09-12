---
id: canary
type: spec
status: active
date: 2026-09-12
summary: The verified Claude Code version range, canary tiers, and the fragments tools/versions regenerates.
features: [canary]
tags: [claude-code-format, testing]
go: [test/canary/**, tools/versions/**, internal/claudecode/version*.go, internal/claudecode/observed_versions.txt]
web: []
e2e: []
protocol: [ws.hello]
refs: [kb:adr/canary-verified-range-observed-not-pinned, kb:adr/canary-claude-auto-updater-left-on, kb:adr/canary-drives-installed-claude-through-production-chain, kb:adr/canary-permission-mode-sweep-on-unauthenticated-path, kb:adr/canary-resume-run-through-production-argv, kb:adr/canary-live-tier-fails-never-skips, kb:adr/canary-static-tier-asserts-bundle-strings, kb:adr/canary-skips-on-ceiling-bump-extends-record, kb:adr/canary-interactive-dialog-rows-accepted-residual, kb:adr/canary-version-gated-adapters-not-built, kb:adr/connection-installed-claude-classified-never-refused, kb:adr/process-interface-probe-rig-in-repo, kb:fact/status-version-matches-installed, kb:fact/headless-fires-full-hook-sequence, docs/claude-code-versions.md]
---
Muster depends on Claude Code's hook payloads, status-line JSON and CLI flags, none of which
are documented or stable. The canary is how that dependency is kept honest.

**The verified range.** One embedded record, `internal/claudecode/observed_versions.txt`,
lists every Claude Code version the canary has gone green on; its minimum is the floor and
its maximum the ceiling (kb:adr/canary-verified-range-observed-not-pinned). At startup the
daemon reads the installed version and classifies it as unknown, below, verified or above,
carries the result on `kb:anchor/ws.hello`, and serves identically in all four; the
masthead shows a glyph and a remedy, never a refusal
(kb:adr/connection-installed-claude-classified-never-refused). Versions strictly inside the
range are inferred, not individually run. Claude Code's own auto-updater is left on
(kb:adr/canary-claude-auto-updater-left-on).

**The suite.** `make canary` is a build-tagged Go test that launches the installed `claude`
through the production chain: settings write, shell wrapper, enveloped POST into a real
handler (kb:adr/canary-drives-installed-claude-through-production-chain,
kb:fact/headless-fires-full-hook-sequence). Its tiers: a harness tier of a few haiku turns
that the field assertions read; zero-token tiers that sweep every permission mode on an
unauthenticated run and resume a real session through the production argv
(kb:adr/canary-permission-mode-sweep-on-unauthenticated-path,
kb:adr/canary-resume-run-through-production-argv); a live tier that runs the production
Keychain, usage and theme readers and fails rather than skips when a credential is missing
(kb:adr/canary-live-tier-fails-never-skips); and a static tier that scans the installed
bundle for interface strings Muster cannot drive (kb:adr/canary-static-tier-asserts-bundle-strings).
The interactive run's idle wait doubles as a zero-token keystroke tier — the status line's
tick cadence, Shift+Tab firing no hook, and `/clear` minting a new session id in the same pane
(kb:adr/canary-run-d-holds-two-claude-sessions, kb:adr/canary-refresh-interval-key-canary-only).
An offline mode compiles, classifies and runs the static tier only. The status-line
version is asserted equal to the installed one (kb:fact/status-version-matches-installed).

**Extending the range.** When the installed version equals the ceiling the token-burning
tiers skip unless forced. A green run on a version outside the range appends it to the
record, uncommitted, through `go run ./tools/versions bump`; `gen` and `check` keep the
fragments in `README.md` and `docs/claude-code-versions.md` in sync, and `check` runs under
`make check` (kb:adr/canary-skips-on-ceiling-bump-extends-record). The ritual for a red
canary is `docs/claude-code-versions.md`.

**Residuals.** Behaviours behind an interactive dialog stay outside the canary and are
verified on demand with the in-repo probe rig
(kb:adr/canary-interactive-dialog-rows-accepted-residual, kb:adr/process-interface-probe-rig-in-repo).
No version-gated adapters exist while every observed shape holds across the range
(kb:adr/canary-version-gated-adapters-not-built). All Claude Code format knowledge lives in
`internal/claudecode`, so a break is a one-package fix; when the interface breaks the
answer is fixing Muster, not pinning Claude Code.
