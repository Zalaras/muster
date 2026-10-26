# Browser review: remove-unread-right-click-1

**Plan**: remove-unread-right-click-1
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14319 words (budget 30000)
**Rig**: `make web-build build` at 8052e4ed (v0.25.3-33-g8052e4ed-dirty; the dirty files are the orchestrator's plan/review files only). Each daemon is a fresh copy of `bin/musterd` from `helpers/fixtures.ts`, on a space-bearing data dir `$TMPDIR/muster e2e-6908ffbc-*` with a private `-S <data-dir>/tmux.sock` (killed and deleted at teardown, none left afterwards), using the shared stub `claude` (`$TMPDIR/muster e2e-stub-*/claude`). Driven in headless Chromium through one throwaway spec, now deleted. The gates log has 0 failed lines; `e2e` (383 passed) and `web-build` are green.

This cycle's diff (63252581..8052e4ed) touches three things the browser can see: `MarkSeen` now delegates to `SetUnread` (the attach clear), `CardMenuRequest.card` is renamed to `opener` (the menu anchor for card, strip and header ⋯), and `cardMenuItems` derives Stop/Resume without `stopResumeButton`. I re-ran the whole matrix and added rows for the attach clear and the leave-idle clear.

## Matrix

Hosts:
- **focus**: the Focus rail card and the Focus header ⋯.
- **tiles**: the Tiles strip card, plus the tile header for REQ-6.
- **pop-out**: `/doc.html`, the docs reader pop-out. It holds no session card, mainhead or note marker (`grep -c 'mainhead\|session-card\|class="mk"' web/doc.html` → 0), so every pop-out cell is N/A for that reason.

**Daemon-down** means the scratch daemon got SIGTERM (`daemon.kill()`) with the page left open.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-2/3 | focus rail | data | every card's menu: lifecycle item first, then `Remove…` (danger), then the two marks after Pin, non-danger, enabled whatever the state | pass | idle-read alpha, idle-unread beta, working gamma: `Stop…, Remove…, New group…, No group, Pin, Mark as read, Mark as unread`. Ended delta: `Resume, Remove…, …`. Every item has `aria-disabled` false and computes `flex/visible/1`; only `Remove…` carries `danger`. Covers the cycle-2 `primary` rewrite |
| REQ-1/2 | focus rail | data | Mark as unread (pointer) sets the flag on an idle read card | pass | `data-unread="true"`, aria-label `br-alpha, unread`, `/api/state` `unread:true`, unchanged after a 1.2 s settle |
| REQ-1/2 | focus rail | data | Mark as read (pointer) clears it | pass | `data-unread` absent and wire `false` after a 1.2 s settle |
| REQ-1/2 | focus rail | data | keyboard round-trip | pass | card focused, Shift+F10, ArrowDown until activeElement reads `Mark as unread`, Enter → wire `true`, `data-unread="true"` after a 1.2 s settle, focus back on the card |
| REQ-1 | focus rail | data | **attach still clears unread** (the cycle-2 `MarkSeen` → `SetUnread`) | pass | clicking unread beta to Focus it → wire `false`, `data-unread` absent after 1.2 s. Hand-marked alpha, no longer focused, stayed `true`. Re-focusing alpha → `false`, attribute gone |
| REQ-1 | focus rail | data | leaving idle clears a hand-set unread | pass | beta (idle, unattached) Mark as unread → `true`; then a `UserPromptSubmit` moves the badge to working → wire `false`, attribute absent |
| REQ-1/2 | focus rail | data | Mark as unread on a working or ended session is a no-op, and the item stays enabled | pass | gamma (working): item `flex/visible/1`, not disabled; after the click the wire stays `false` and there's no `data-unread`. delta (ended): wire `false` |
| REQ-2 | focus rail | data | selection menu: marks after Move to, one call per id | pass | `Actions for 2 sessions`: `Stop…, Remove…, New group…, No group, Mark as read, Mark as unread`. Mark as unread over idle alpha and working gamma → alpha `true`, gamma `false` (Edge case 3) |
| REQ-2 | tiles strip | data | both marks shown; round-trip | pass | `Actions for tl-g3`, the same 7 items, all enabled and `flex/visible/1`. Mark as read → `false`; Mark as unread → `data-unread="true"`, wire `true`; Mark as read → absent, `false` (each after a 1.5 s settle) |
| REQ-2 | focus / tiles | no data | marks on the menu | N/A — there's no card to open a menu on | |
| REQ-2/3 | focus rail, header ⋯, tiles strip | daemon-down | menu opens; every item, both marks included, is disabled like Pin | pass | banner `display:block`, `musterd unreachable — hook output in open panes is Muster's absence…`, 0,46–1440,78. In the rail, header and strip menus all 7 items have `aria-disabled` true and stay visible (Edge case 5) |
| REQ-3 | focus rail | data | Remove… on a live card opens today's confirm | pass | `Remove session? br-gamma — … This ends the session first. …`, box 500,352–940,548 inside 1440×900; after Cancel, gamma is still `alive` |
| REQ-3 | focus rail | data | an all-live selection offers Remove… | pass | dialog `Remove 2 sessions? 2 of them are alive and will be stopped first.` |
| REQ-3 | tiles strip | data | live strip card Remove… → confirm → removed | pass | first two items `Stop…, Remove…`; dialog `…This ends the session first.…`; after confirming, the strip card count is 0 and `/api/state` no longer has the id |
| REQ-3 | any | no data | | N/A — no card | |
| REQ-4 | focus header | data (live idle) | no Stop/Resume/Remove; `.acts` = switch then ⋯ | pass | visible `#mainhead` buttons: `Note, br-alpha, no group▾, claude, shell, docs, Session actions`; `getByRole(button,/^(Stop|Resume|Remove)/)` count 0; `.acts` children are `DIV.surfseg, BUTTON.btn icon more` |
| REQ-4 | focus header | data (ended) | no Resume/Remove; ⋯ still visible | pass | `Note, br-delta, no group▾, claude, shell, docs, Session actions`; ⋯ `block/visible/1` |
| REQ-4 | focus header | data | ⋯ placement and aria attributes | pass | ⋯ 1395,58–1426,83 inside `.acts` 1223,58–1426,83, inside `#mainhead` 300,46–1440,95; `aria-label`/`title` `Session actions`, `aria-haspopup=menu`, `aria-expanded=false` |
| REQ-4 | focus header | data, narrow | ⋯ stays inside the header as the window narrows | pass ≥ 490 px | 1000: 955–986 in a head ending at 1000; 800: 755–786; 640: 601–626; 500: 461–486; 490: 460–485. At 480 and below the cluster overflows (Note 1) |
| REQ-4 | focus header | no data | header hidden | pass | `#mainhead` has `hidden` and computes `display:none`; ⋯ has no box |
| REQ-4 | tiles | data | header ⋯ | N/A — the mainhead belongs to the Focus view; measured `checkVisibility()` false in Tiles | |
| REQ-4 | focus header | daemon-down | ⋯ stays visible | pass | `block/visible/1`, 1395,90–1426,115, below the banner |
| REQ-5 | focus header | data | ⋯ opens the same menu as right-clicking the focused card | pass | the `{label, items with class, disabled flag and computed style}` JSON is identical on both: `Actions for br-alpha`, 7 items |
| REQ-5 | focus header | data | anchored to the button (the cycle-2 `opener` rename), inside the viewport | pass | menu 1236,87–1426,341: right edge flush with the ⋯ right edge at 1426, top 4 px under the ⋯ bottom at 83. At 1000/800/640/500/490 the menu is anchored under the ⋯ and inside the viewport (e.g. 500: 296–486) |
| REQ-5 | focus header | data | `aria-expanded` kept in step; a second click closes | pass | open → `true`; second click → 0 menus, `false`; after choosing an item → `false` and activeElement back on the ⋯ |
| REQ-5 | focus header | data | choosing an item acts on the focused session | pass | Mark as unread from the ⋯ on focused, attached alpha → `data-unread="true"`, wire `true`, still `true` after 2.5 s (Edge case 2). Remove… → `Remove session? br-alpha — … This ends the session first.` |
| REQ-5 | focus header | data | keyboard: keeps focus across a tick, opens, returns | pass | Shift+Tab then Tab onto the ⋯ → activeElement === ⋯, still so after 1.3 s; Enter → menu holds focus; Escape → focus back on the ⋯, `aria-expanded=false` |
| REQ-5 | focus header | data (ended) | the menu offers Resume | pass | `Actions for br-delta`: `Resume, Remove…, New group…, No group, Pin, Mark as read, Mark as unread` |
| REQ-5 | focus header | data, Select mode | focused card is selected → selection menu (Edge case 4) | pass | focused delta selected with alpha and gamma → the ⋯ opens `Actions for 3 sessions` with the selection items |
| REQ-6 | focus rail | data | the marker inherits no title; `.r2` keeps its own | pass | `elementFromPoint` at the marker centre → `use`; the first titled ancestor-or-self is `SPAN.mk=""`; `.r2` title is the repo line. Note tip shown after a 1.2 s hover (`block/visible/1`, 277,297–577,367). The repo text still resolves to `DIV.r2`'s title |
| REQ-6 | tiles strip | data | as above | pass | first titled = `SPAN.mk=""` |
| REQ-6 | tiles tile header | data | the tile marker has no titled ancestor | pass | first titled ancestor-or-self of the hit point: none |
| REQ-6 | any | no data / daemon-down | | N/A — there's no note marker without a session, and the marker's title is a static template attribute that a disconnect doesn't touch | |
| §6/§7 | focus, tiles | all | honesty and terminal rules on the surfaces this plan touches | pass | no Done or cost text in any menu or header; the daemon-down banner is `block/visible/1` in both Focus and Tiles; before data, the context and masthead read `unknown`; the Tiles 2×2 holds 4 `.xterm` for 4 grid sessions and the strip card is static |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes
1. **[note]** Below about 490 px the Focus header's right cluster overflows the header, and the ⋯ overflows the viewport. Measurements: at 480, ⋯ 460–485 in a 480 viewport (`#mainhead` scrollWidth 210 vs clientWidth 180); at 440, ⋯ 208–233 against a header that ends at 188. This is cycle 1's Note 1, now measured further. A real pointer click at the ⋯ centre opens the menu at 480 (checked twice, including with the ⋯ previously focused), and keyboard Enter opens it at every width down to 400. A Playwright locator `click()` at 480 and 470 does not open it, because the auto scroll-into-view scrolls `#app` (`overflow-x: hidden`) by 5 px (`scrollLeft=5`). That `scroll` event closes the menu 8 ms after it opens (`+menu` then `-menu` in the event log). So any focus-driven scroll-into-view of an overflowing ⋯ can leave `#app` shifted 5 px with the menu closed. The overflow predates this plan (the removed Stop+Remove pair made the cluster wider), and this desktop dashboard is used at ≥ 1000 px, so no change is requested. A spec that drives the ⋯ below 490 px with `locator.click()` will see the menu vanish.
2. **[note]** Headless Chromium can't show the native `title` tooltip itself. So REQ-6 was measured on what Chrome reads to show it: the first ancestor-or-self with a `title` attribute from the element under the pointer.
