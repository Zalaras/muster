# Doc Reconcile: sweep-2026-11-03-2

**Verdict**: reconciled
**Pack**: kb: pack 10970 words (budget 30000)
**Features derived**: focus, rail, groups, actions, theme (plan header: focus, rail, groups, actions; Touches: theme)

## Claims

| Feature | Claim | Verified against | Action |
|---------|-------|------------------|--------|
| focus | Dismiss hiding the strip while it holds focus returns focus to the selected terminal, else the header Session actions `⋯` | `web/src/features/focus.ts:renderView` (focusSelected, then moreBtn.focus when focusIsLost) | added |
| rail | Card menu: one read toggle, Stop…/Resume and Remove…, Pin/Unpin, Move to last | `web/src/features/railmenu.ts:cardEntries`, `railmenuitems.ts:readToggle,cardMenuItems` | edited |
| rail | Selection menu: toggle (Mark as read when any unread), Stop…, Remove…, Move to | `railmenu.ts` selection menu.open, `railmenuitems.ts:selectionMenuItems` | edited |
| rail | "Move to, Pin or Unpin, then Mark as read and Mark as unread, always" and "Move to and the marks" | — | deleted |
| rail, actions | citation moved to kb:adr/rail-card-menu-read-toggle-first-move-to-last | `docs/adr/rail-card-menu-read-toggle-first-move-to-last.md` (supersedes the old one) | edited |
| groups / theme | design-system § Section header names 20px caret, ~9x6 triangle | `web/src/style.css:.ghead .disc` (20px, 9x6 clip-path) verified; file outside my boundary | not edited |

## Contradictions
None

## For the orchestrator
- [orchestrator] `docs/design/design-system.md` § Section header still lacks the caret size (20px button, about 9x6 px triangle clip-path, `--fg-muted`, `--fg` on header hover). It is outside doc-reconcile's boundary; the claim is verified against `web/src/style.css`.
- [orchestrator] The delta's claim touches theme (Touches): the caret's colours and size are a theme-adjacent change, promote theme to `**Features**` if wanted.
- [orchestrator] The new ADR is `proposed` on this branch; `/orchestrate` flips it to accepted at Completion. The specs now cite it.

## Checks
make gen-kb && make check-kb: kb: all generated files fresh; 657 records, 29 features, 0 problem(s); all checks pass.
Words: rail 900, focus 833, actions 725.
