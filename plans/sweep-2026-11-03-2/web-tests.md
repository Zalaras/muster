# Web Tests: sweep-2026-11-03-2

**Plan**: sweep-2026-11-03-2
**Verdict**: authored
**Pack**: not run (red-first, W1 only)

## Summary
Red-first, Proof 3 W1. 14 of 41 tests in `railmenuitems.test.ts` fail on assertion (two mark items received, one expected); `tsc --noEmit` passes.

## Handoff Received
None

## Notes
`cardMenuItems`/`selectionMenuItems` rewritten cases pass objects carrying `unread` via variables (no excess-property error). Assumes the toggle is the single entry of `marks`.

## Test Run Output
Received `["Mark as read", ...], ["Mark as unread", ...]` where one toggle item was expected.
