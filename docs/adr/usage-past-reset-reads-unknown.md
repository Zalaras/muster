---
id: usage-past-reset-reads-unknown
type: decision
status: accepted
date: 2026-10-26
summary: A usage bar whose reset has passed reads unknown until a fresh value arrives, and the daemon never adopts a value already past its reset.
features: [usage]
tags: [user-decision, ux]
files: [web/src/sessions/usage.ts, internal/usage/aggregator.go]
tests: []
refs: [plan:usage-bar-consistency, kb:adr/usage-unknown-renders-word-not-track, kb:adr/usage-all-windows-polled-and-refetched-at-reset]
supersedes: []
---
**Context.** Once a window resets, its last percentage is no longer a measurement, yet the masthead kept showing it. With two sources feeding the bars, a late status post could also bring back a value whose reset had already passed.

**Options.** Past a reset, show (A) 0%, (B) unknown, or (C) a new "reset" readout.

**Decision.** B, the developer's choice (2026-10-26: "unknown is fine since we already use it"). The dashboard compares each bar's reset with its own clock, strictly, and renders unknown past it. The daemon refuses any incoming value whose reset is at or before its arrival.

**Consequences.** The bar turns unknown at the reset instant even with the daemon down, and stays so for the second or two the reset-time fetch takes, or until the next status post when the fetch fails or polling is off. 0% was rejected because use outside Muster since the reset would read as zero.
