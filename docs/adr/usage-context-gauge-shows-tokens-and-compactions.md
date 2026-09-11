---
id: usage-context-gauge-shows-tokens-and-compactions
type: decision
status: accepted
date: 2026-08-16
summary: The context gauge shows the percentage together with absolute input tokens and a compaction counter, because the percentage alone misleads.
features: [usage]
tags: [ux, claude-code-format]
files: [web/src/render/context.ts, web/src/sessions/context.ts, internal/session/machine.go]
tests: [web/e2e/gauges.spec.ts, TestApply_INV2_RebindResetsContextAndCompactionsBeforeItsOwnRowApplies]
refs: [docs/history/spec-changelog.md, kb:fact/context-window-shape, kb:anchor/ws.session]
supersedes: []
---
**Context.** The gauge exists to say when a session is near the end of its useful life. The window size varies by model, so the same percentage means very different token counts, and after a compaction the percentage drops to near zero although a summary is still loaded.

**Options.** (A) A bare percentage. (B) The percentage plus the absolute token count. (C) B plus a counter of compactions, which the PreCompact hook provides for free.

**Decision.** C.

**Consequences.** The three context fields travel together on the wire and are populated all-or-nothing; the compaction counter is a per-conversation value that a clear resets along with the gauge. The card and the tile render the same row from the same data.
