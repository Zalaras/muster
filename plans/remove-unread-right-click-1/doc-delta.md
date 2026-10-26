# Doc delta: remove-unread-right-click-1

Seeded from plan.md § Doc Delta, with the implementation logs' `doc-delta:` lines folded in.

**rail** — becomes true: the card menu (single and several-selected) offers Mark as read and Mark as
unread always, and Remove… on live sessions too (after Stop…). The same menu opens from the Focus
header's Session actions ⋯, just under the button; right-click and keyboard opening are unchanged (at
the pointer / under the card). Stops being true: "Stop or Resume and Remove" offered by state; Remove
only on ended cards.

**lifecycle** — becomes true: `unread` is also set/cleared by the developer through
`kb:anchor/sessions.unread`; a hand-set unread persists until the next attach or leaving idle.

**focus** — becomes true: the header's right cluster is the surface switch and one Session actions ⋯
that opens the focused card's menu. Stops being true: the one Stop/Resume button and Remove in the
header, "so Stop and Resume never move it", "the surface switch and the actions move together" (the
switch and the ⋯ move together).

**actions** — stops being true: "They live in the Focus mainhead …", "In the Focus mainhead Stop and
Resume are one button"; becomes true: Stop, Resume and Remove are reached from the card menu (rail,
strip, the Focus header ⋯), the tile footers and the dead surface's Resume; the menu opens at the
pointer, just under the card from the keyboard, or just under the header ⋯ when opened from it.

**notes** — no spec change.

Already done on the branch (verify only): `docs/protocol.md` per the plan's Protocol delta (daemon
log: "protocol.md is already changed per the delta"); `docs/design/design-system.md` Focus mainhead
sentence (orchestrator, review cycle 1).

ADR citations: specs citing kb:adr/actions-mainhead-one-stop-resume-button,
kb:adr/focus-surface-switch-pinned-with-actions, kb:adr/rail-card-menu-on-selected-card-acts-on-selection
or kb:adr/rail-unread-inferred-from-live-terminal-client cite their successors
(kb:adr/focus-header-holds-switch-and-session-menu, kb:adr/rail-card-menu-offers-remove-and-marks-whatever-the-state,
kb:adr/rail-unread-also-marked-by-hand), which flip to accepted at Completion.
