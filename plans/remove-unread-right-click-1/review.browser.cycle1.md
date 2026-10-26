# Browser review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 14319 words (budget 30000)
**Rig**: `make web-build build` at 5190e9e1 (v0.25.3-24-g5190e9e1-dirty; dirty = orchestrator's plan/state files only), each daemon a fresh copy of `bin/musterd` from `helpers/fixtures.ts` on a space-bearing data dir `$TMPDIR/muster e2e-6908ffbc-*` with private `-S <data-dir>/tmux.sock` (killed and deleted at teardown), shared stub `claude` (`$TMPDIR/muster e2e-stub-*/claude`); headless Chromium through two throwaway specs (deleted); gates log 0 failed lines, `e2e`/`web-build` green.

## Matrix

Hosts: **focus** = Focus rail card / Focus header ⋯; **tiles** = Tiles strip card (and the tile header for REQ-6); **pop-out** = `/doc.html`, the docs reader pop-out. It holds no session card, no mainhead and no note marker (`grep -c "mainhead|session-card|class=\"mk\"" web/doc.html` → 0), so every pop-out cell is N/A for that reason. **Daemon-down** = scratch daemon sent SIGTERM (`daemon.kill()`), page left open.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1/2 | focus rail | data | Mark as unread sets `unread` on an idle read card | pass | pointer click → `data-unread="true"`, aria-label `br-alpha, unread`, `/api/state` `unread:true`, still so after a 1.2 s settle |
| REQ-1/2 | focus rail | data | Mark as read clears it | pass | pointer click → `data-unread` absent, wire `false` (settled 1.2 s); keyboard path too: Shift+F10, ArrowDown to `Mark as read` (activeElement checked), Enter → wire `false` |
| REQ-1/2 | focus rail | data | Mark as unread on working / ended session is a no-op, item still enabled | pass | gamma (working): item display flex, visibility visible, opacity 1, not disabled; after click wire `false`, no `data-unread`. delta (ended): wire `false` |
| REQ-2 | focus rail | data | both marks on every card, after Pin, non-danger, enabled whatever the state | pass | idle/idle/working/ended menus each end `…Pin, Mark as read, Mark as unread`; class `mi` (no `danger`), `aria-disabled` false, computed visible/opacity 1 |
| REQ-2 | focus rail | data | selection menu: marks after Move to, per id | pass | `Actions for 2 sessions`: `Stop…, Remove…, New group…, No group, Mark as read, Mark as unread`; Mark as unread over idle+working → alpha `true`, gamma `false` (Edge case 3); Mark as read → both `false` |
| REQ-2 | tiles strip | data | both marks shown; round-trip | pass | `Actions for tl-g1` same 7 labels; Mark as read → wire `false`; Mark as unread → `data-unread="true"`, wire `true`; Mark as read → absent, `false` (each settled 1.5 s) |
| REQ-2 | focus / tiles | no data | marks on menu | N/A — no card exists to open a menu on | |
| REQ-2 | focus rail, header ⋯, tiles strip | daemon-down | menu opens, marks disabled like Pin | pass | banner shown (display block, `musterd unreachable — hook output in open panes…`); every item incl. both marks `aria-disabled` true in rail, header and strip menus (Edge case 5) |
| REQ-3 | focus rail | data | live card offers `Stop…` then `Remove…` (danger) | pass | items 0,1 = `Stop…` (`mi`), `Remove…` (`mi danger`) on idle and working cards; ended card `Resume, Remove…` |
| REQ-3 | focus rail | data | Remove… on live opens today's confirm | pass | dialog `Remove session? br-gamma — … This ends the session first. …`, box 500,352–940,548 inside 1440×900; Cancel sent nothing visible |
| REQ-3 | focus rail | data | all-live selection offers Remove… | pass | labels `Stop…, Remove…, New group…, No group, Mark as read, Mark as unread`; dialog `Remove 2 sessions? 2 of them are alive and will be stopped first.` |
| REQ-3 | tiles strip | data | live strip card Remove… → confirm → removed | pass | dialog `…This ends the session first.…`; confirmed → strip card count 0, `/api/state` titles no longer list `tl-g4` |
| REQ-3 | any | no data / daemon-down | | N/A — no card / disabled per the daemon-down row above | |
| REQ-4 | focus header | data (live idle) | no Stop/Resume/Remove; `.acts` = switch then ⋯ | pass | `#mainhead` buttons: Note, name, group, claude, shell, docs, Session actions; `getByRole(button,/^(Stop|Resume|Remove)/)` count 0; `.acts` children `[DIV.surfseg, BUTTON.btn icon more]` |
| REQ-4 | focus header | data (ended) | no Resume/Remove in header; ⋯ still visible | pass | visible buttons `Note, br-delta, no group▾, claude, shell, docs, Session actions`; ⋯ display block, visible, opacity 1 |
| REQ-4 | focus header | data | ⋯ placed inside the header and the cluster, aria attrs | pass | ⋯ 1395,58–1426,83 inside `.acts` 1223,58–1426,83 inside `#mainhead` 300,46–1440,95; `aria-haspopup=menu`, `aria-expanded=false`, `title=Session actions` |
| REQ-4 | focus header | data, narrow | ⋯ stays in the header as it narrows | pass ≥ 500 px | 1000/800: cluster on row two, ⋯ inside head; 620–500: inside; 480: ⋯ right 485 > head right 480 (see Note 1) |
| REQ-4 | focus header | no data | header hidden | pass | `#mainhead` `hidden`, computed display none; ⋯ width 0 |
| REQ-4 | tiles | data / no data | header ⋯ | N/A — the mainhead is the Focus view's; measured hidden in Tiles (`checkVisibility()` false, width 0) | |
| REQ-4 | focus header | daemon-down | ⋯ stays visible | pass | display block, visible, opacity 1, 1395,90–1426,115 (below the banner) |
| REQ-5 | focus header | data | ⋯ opens the same menu as right-clicking the focused card | pass | label `Actions for br-beta` on both; item labels, classes and disabled flags identical (7 items) |
| REQ-5 | focus header | data | anchored to the button, inside the viewport | pass | menu 1236,87–1426,341 right-aligned with ⋯ right edge 1426, top 4 px below ⋯ bottom 83; at 1000/800/640/480 menu inside viewport (480: 282–472) |
| REQ-5 | focus header | data | `aria-expanded` kept in step, second click closes | pass | open → `true`; second click → no menu, `false`; after choosing an item `false` and activeElement back on the ⋯ |
| REQ-5 | focus header | data | choosing an item acts on the focused session | pass | Mark as unread from ⋯ on focused idle beta → `data-unread="true"`, wire `true`, still `true` after 2.5 s (Edge case 2); Remove… → `Remove session? br-beta — … This ends the session first.` |
| REQ-5 | focus header | data | keyboard: keeps focus across a tick, opens and returns | pass | Shift+Tab/Tab onto ⋯ → activeElement === ⋯, still so after 1.3 s; Enter → menu, activeElement inside menu; Escape → back on ⋯, `aria-expanded=false` |
| REQ-5 | focus header | data (ended) | menu offers Resume | pass | `Actions for br-delta`: `Resume, Remove…, New group…, No group, Pin, Mark as read, Mark as unread` |
| REQ-5 | focus header | data, Select mode | focused card selected → selection menu (Edge case 4) | pass | focused ended delta selected with alpha and gamma → ⋯ opens `Actions for 3 sessions` with the selection items |
| REQ-6 | focus rail | data | the marker inherits no title; `.r2` keeps its own | pass | `elementFromPoint` at marker centre → `use`; first titled ancestor-or-self `SPAN.mk=""`; `.r2` title = repo line; note tip shown after 1.2 s hover (display block, visible, opacity 1, 277,736–577,806). The repo text (`.rf`) still resolves to `.r2`'s title |
| REQ-6 | tiles strip | data | as above | pass | first titled = `SPAN.mk=""`, `.r2` titled |
| REQ-6 | tiles tile header | data | tile marker has no titled ancestor | pass | first titled ancestor-or-self of the tile `.mk` hit point: none |
| REQ-6 | any | no data / daemon-down | | N/A — no note marker without a session; the marker's title is a static template attribute that a disconnect doesn't touch | |
| §6/§7 | focus, tiles | all | honesty/terminal rules on surfaces this plan touches | pass | no Done/cost text in any menu or header; daemon-down banner visible in both hosts; context reads `ctx unknown` and the masthead `unknown` before data; Tiles 2×2 holds 4 `.xterm` for 4 grid sessions, strip cards static |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** At a 480 px window the Focus header's content box is 152 px and the cluster (surface switch 141 px plus the ⋯ 25 px) overflows it: ⋯ 460–485 against `#mainhead` right 480 and viewport 480 (`scrollWidth` 185 vs `clientWidth` 180). From 500 px up it fits (500: ⋯ right 486 < head 500). It still opens its menu, and the menu stays in the viewport. The removed Stop+Remove pair made the cluster wider, so this change only improves the old overflow. No change requested.
2. **[note]** The native `title` tooltip itself can't be seen in headless Chromium. REQ-6 was measured on what Chrome reads to show it: the first ancestor-or-self with a `title` attribute from the element under the pointer.
3. **[note]** The single-card menu also has a separator before the marks (web-implementation.md Decisions). That matches REQ-2's ordering ("after Pin/Unpin"); the selection menu has its separator after the Move to entries as REQ-2 says.
