---
id: usage-unknown-renders-word-not-track
type: decision
status: accepted
date: 2026-08-16
summary: An unknown gauge renders the word unknown with no track drawn; a zero-filled track is forbidden because it reads as zero percent used.
features: [usage]
tags: [ux]
files: [web/src/render/context.ts, web/src/render/masthead.ts]
tests: [web/e2e/gauges.spec.ts]
refs: [docs/history/spec-changelog.md, kb:fact/unknown-before-first-response, kb:anchor/conventions]
supersedes: []
---
**Context.** Before a session's first API response the rate-limit key is absent and the context percentages are null, and on API-key accounts the rate limits never arrive. A gauge component drawn with an empty track would show those cases as zero percent used.

**Options.** (A) Draw the track empty when the value is null. (B) Draw the track with a placeholder marker. (C) Draw no track at all and render the word unknown.

**Decision.** C. Null is not zero, and the display must never claim a measurement it does not have.

**Consequences.** Every gauge renderer branches on presence before it branches on value, and E2E tests assert the absence of track markup, not merely an empty fill. The same honesty rule governs the issue-capture snapshot and any text readout: unknown values print the word unknown, never a zero.
