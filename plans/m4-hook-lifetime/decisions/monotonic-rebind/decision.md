# Decision: monotonic-rebind

**Outcome**: B — make the rebind monotonic: an enveloped event never rebinds *backwards* onto a claude id this session has already left (`byClaude[incoming id]` already points at this session and it is not the current `ClaudeSessionID` → route and apply the event, do not rebind/reset).
**Reached by**: user decision (Damian, 2026-08-28). Not debated — the issue touches the protocol contract (§4.2/§7.3), which the `decide` skill's never-debated list routes to the user.
**Source**: plans/m4-hook-lifetime/review.md, cycle 1, Critical 1.
**Decisive argument**: hook delivery is unordered by hard rule; the reordered `SessionEnd(reason:"clear")` was measured to reset a working session and permanently zero its compaction count. The manager already retains the stale id, so the guard costs ~4 lines and one protocol sentence and leaves every forward case intact.
**Dissent to honour**: None.
**Landed in**: docs/protocol.md §4.2 (binding rule + transition table row), plans/m4-hook-lifetime/plan.md (REQ-9 amendment, Protocol Contract binding rule, Edge Case 6a), SPEC.md §11 changelog.
