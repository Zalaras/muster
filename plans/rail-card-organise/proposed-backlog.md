# Proposed backlog: rail-card-organise

### Card menu opened while the daemon is down closes on every reconnect attempt
**Summary**: an open card menu closes at each reconnect attempt while the daemon is down (seen at about 2 s, 4 s and 8 s).
**Source**: review.browser.md (cycle 2) Note 1.
**Change requested**: no. The reviewer said "You may want to propose it for the backlog", and REQ-10 still holds.
**Suggested section**: rail card.
**Pre-existing**: yes. Sibling menus, popovers and dialogs share the pattern. This branch adds the card menu, which inherits it.

### `Resume…` carries an ellipsis but opens no dialog
**Summary**: the card menu's `Resume…` acts at once, as the Focus header's Resume does, but its ellipsis suggests a dialog.
**Source**: review.code.md (cycles 1 and 2) Note 3; review.browser.md (cycle 1) Note 2.
**Change requested**: no. Both reviewers left it as a wording call for the developer.
**Suggested section**: rail card.
**Pre-existing**: no. The label comes from this plan's Testable UI table.

## Decisions (the developer, 2026-10-14)

- Card menu opened while the daemon is down closes on every reconnect attempt: filed: TODO.md § Pre-v1, "Review how menus behave while the daemon is down" (2026-10-15)
- `Resume…` carries an ellipsis but opens no dialog: already done: 4fe7d7b7 drops the ellipsis. Not filed.
