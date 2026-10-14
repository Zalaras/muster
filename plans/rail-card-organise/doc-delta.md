# Doc delta: rail-card-organise

Seeded from plan.md § Doc Delta, then amended by the orchestrator with every `doc-delta:` line from the implementation logs and the review cycles.

## From the plan

**rail** — becomes true:
- A dead card greys out. No card renders a Stop, Resume or Remove button; a right-click, the context-menu key or Shift+F10 opens the session's menu: Stop, or Resume and Remove, then Move to and Pin or Unpin (kb:spec/actions).
- Where cache warmth is known, the timer fades from the foreground to grey over the cache's lifetime, is underlined in its last 15% and names the warmth on hover (kb:spec/usage).
- Cards drag in both sort modes (kb:spec/groups).

**rail** — stops being true:
- "A live card offers no action button (kb:adr/rail-live-card-offers-no-actions); a dead card greys out and offers Resume and Remove in its hover-revealed action row (kb:spec/actions)."

**groups** — becomes true:
- In either sort mode a card dropped on a header or among a section's cards joins that group, and one dropped among Ungrouped's cards leaves its group; in attention mode the drop changes only the group. Move to does the same.
- While Select mode is on, a click toggles a card instead of focusing it; dragging a selected card carries the whole selection, an unselected card does not drag, and a drag released where it started changes nothing.
- After the dots, the summary shows the timer of the last member to start waiting on the developer, tinted by cache warmth, its hover counting the warm ones; the popover tints each session's timer.

**groups** — stops being true:
- "In manual mode a card dropped on a header or among a section's cards joins that group; Move to does the same in either mode."
- "Cards are not draggable while it is on, and a click toggles a card instead of focusing it (kb:adr/rail-select-mode-disables-card-drag)."

**actions** — becomes true:
- They live in the Focus mainhead above the terminal, in tile footers, and in the right-click menu of rail and strip cards; no card renders an action button.

**actions** — stops being true:
- "They live in the Focus mainhead above the terminal, in tile footers, and in hover-revealed action rows on ended rail and strip cards; a live rail or strip card offers no action button (kb:adr/rail-live-card-offers-no-actions)."

**usage** — becomes true:
- Each session also carries its prompt-cache warmth from the status line's `prompt_cache` (kb:fact/prompt-cache-status-shape): when it expires and its lifetime, which varies (kb:fact/haiku-main-cache-ttl-5m-on-2-1-299). It is unknown before the session's first reply and after `/clear`, and survives Stop, Resume and a daemon restart, since a resume inside the lifetime reads the same cache (kb:fact/resume-reads-prior-prompt-cache). The dashboard reads the expiry against its own clock, so warmth keeps changing while a session sends nothing.

**usage** — stops being true:
- nothing

**canary** — becomes true:
- After the first turn, the harness tier asserts that the status line's `prompt_cache` carries a `ttl` Muster can read and an `expires_at` of the turn's end plus that TTL (kb:fact/prompt-cache-status-shape).

**canary** — stops being true:
- nothing

**protocol** — `docs/protocol.md` gains the Protocol Contract above at approval (the Session object's `cache`, the order endpoint's wording).

## Amendments from the run

**groups**: corrects the plan's sentence "…and a drag released where it started changes nothing". In Select mode a press released without moving is the click that toggles selection (REQ-15). A drag that never leaves the card cannot be told apart from that click, so what changes nothing is a drag released outside the rail, on the section it came from (attention mode), or on a section the filter hides. Source: web-implementation.md doc-delta; e2e validate Handoff item 8.

**groups**: manual mode, made explicit (REQ-14 amended, correctness Major 4). A drop among a section's cards sets position and pin through `kb:anchor/sessions.order` with `groupId`. A drop on a header, or on a section's body away from every card, changes only the group, through `kb:anchor/sessions.group` (correctness cycle 2 note 2: "among a section's cards" means on a card).

**groups**: the popover lists each session as a line carrying its title and its warmth-tinted timer. The header summary's extra timer comes after the dots. Source: web-implementation.md doc-delta.

**rail / actions**: the card menu opens at the pointer, or just under the card's top-left from the keyboard. It is named `Actions for <title>`. `Resume…` acts at once with no dialog, as the Focus header's Resume does; `Stop…` and `Remove…` confirm. Source: web-implementation.md Decisions; orchestrator's call on the e2e Handoff.

**usage**: a corrupt stored cache expiry reads back as unknown (both fields absent) and does not fail the load. Source: daemon-implementation.md doc-delta note.

**design-system.md** (`docs/design/`, not a feature spec): the orchestrator already corrected §5's `current` card action row, the Select-mode `draggable` line and the Menu opener wording during review cycle 1's fix wave. Doc-reconcile verifies them and does not edit them.
