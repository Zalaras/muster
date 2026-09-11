---
id: canary-verified-range-observed-not-pinned
type: decision
status: accepted
date: 2026-09-10
summary: The Claude Code posture is an observed verified range held in one embedded record of green canary versions; the exact pin and its equality check are gone.
features: [canary]
tags: [claude-code-format, user-decision]
files: [internal/claudecode/observed_versions.txt, internal/claudecode/version.go, docs/claude-code-versions.md]
tests: [TestFloorAndVerified_MatchEmbeddedRecord, TestRangeOf_MinMaxIndependentOfRowOrder, TestClassify_UsesEmbeddedRecord]
refs: [docs/history/spec-changelog.md, plan:version-claude-interface, kb:adr/canary-exact-pin-bumped-after-green-runs, kb:adr/canary-drives-installed-claude-through-production-chain, kb:adr/connection-installed-claude-classified-never-refused, docs/history/spikes/canary-fields.md]
supersedes: [canary-exact-pin-bumped-after-green-runs]
---
**Context.** One pinned version, equality-checked at startup, produced a bump ritual that fell behind: the installed binary went green on the canary while the constant named an older version, and the drift warning meant nothing to anyone who had not set the pin. Claude Code auto-updates and a user's install may sit anywhere.

**Options.** (A) Keep the exact pin and bump faster. (B) A declared floor with defined behaviour below it and best effort above, open-ended. (C) An observed range: one embedded record with a row per version the canary has gone green on, floor and ceiling its semver minimum and maximum, no other version literal anywhere.

**Decision.** C. The range is a record of what has been observed, not a claim made in advance; a version between two rows is verified by inference, stated as such rather than implied.

**Consequences.** The pinned constant, the drift error and the equality check are deleted. Startup and the version flag report the range. The canary extends it on a green run outside it and skips on an unchanged install. Adapters and probes for divergent shapes are deliberately not built while there are no change points.
