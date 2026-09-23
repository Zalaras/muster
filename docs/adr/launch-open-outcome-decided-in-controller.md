---
id: launch-open-outcome-decided-in-controller
type: decision
status: accepted
date: 2026-09-23
summary: The dialog's open-time navigation outcome is acted on inside initOpen with no pure relabelling seam; its three branches are asserted end to end.
features: [launch]
tags: [testing]
files: [web/src/features/launch.ts, web/src/render/launchrestore.ts]
tests: []
refs: [plan:new-session-improvement, plans/new-session-improvement/web-tests.md]
supersedes: []
---
**Context.** The plan put the open-time fallback in a pure `openFallback(outcome)` so a unit
test could pin it (W6). In review cycle 1, the maintainability reviewer found it was a 1:1
relabel of `NavigateOutcome` (`ok→restore`, `failed→browse-root`, `superseded→none`), and the
caller branched on its result exactly as it would on the outcome itself. So the seam decided
nothing.

**Options.** (A) Keep the seam for the unit test's sake. (B) Remove it, let `initOpen` switch on
the outcome, and test the three branches end to end.

**Decision.** B. A seam exists where a test needs one and the seam decides something (conventions
§ Design). The touched-field filter, `initialRestore`, stays pure and unit-tested, because it
does decide something.

**Consequences.** W6 is amended away. REQ-6(b)/(c) are asserted by E10 (superseded), E11 (ok)
and E12 (a deleted first recent falls back to the browse root, added because no test covered it).
