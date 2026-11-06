# Browser review: sweep-2026-11-06-1

**Plan**: sweep-2026-11-06-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 8269 words (budget 30000)
**Rig**: `make web-build build` at a1f1788b (`bin/musterd` v0.27.3-27-ga1f1788b-dirty; the only dirty file was `orchestration-state.json`). One scratch daemon per probe test from `helpers/fixtures.ts`: data dir `$TMPDIR/muster e2e-*` (path has a space), tmux socket `<data-dir>/tmux.sock` (killed in teardown), E2E stub `claude` (`$TMPDIR/muster e2e-stub-*/claude`). Headless Chromium at 1440×900, driven by a throwaway `web/e2e/zz-review-browser-probe.spec.ts` (since deleted). Gates log c1b: 0 failed lines, and `e2e` and `web-build` are green, so the app I drove is the one that ships.

Method: a popped panel was dragged by its header (real pointer) so `#connection-status` (box 1410,15.5 14×14) lies inside it. The panel settles at 1080,0 360×300. "Hit" means `document.elementFromPoint` at the readout's centre (1417,22.5). The oracle for health is the readout's own `data-health`, together with the daemon process state (killed, or restarted by the harness). Every cell was re-measured after a settle of 1.2 s or more.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus | data, ok | panel draws above readout | pass | hit `BUTTON.ctl` inside `.npanel`; readout z `auto`, pos `relative`; panel z `45`, `fixed`, display `flex`, opacity 1, visible |
| REQ-1 | focus | data, ok (settled) | same after a render tick | pass | after 1.2 s: same hit `BUTTON.ctl` in `.npanel`, same boxes |
| REQ-1 | focus | data, ok | panel control over the readout is operable | pass | Close moved onto the readout (close 1407,12.5 20×20 covers readout 1410,15.5 14×14). A real `mouse.click` at the readout's centre closed the panel (`.npanel` count 0) |
| REQ-1 | focus | data, ok after down→restart | panel back above readout | pass | after `daemon.restart()`, `data-health=ok`, readout z `auto`, hit `BUTTON.ctl` in `.npanel`; banner `[hidden]` with display `none` |
| REQ-1 / EC1 | focus | data, pending (update restart) | panel draws above readout | pass | `update` broadcast with `apply.phase: restarting`, then daemon killed: `data-health=pending`, text `reconnecting…`, title `Restarting musterd for an update…`, readout z `auto`; hit `BUTTON.ctl` in `.npanel`; same after 1.2 s |
| REQ-2 / EC1 | focus | data, pending (update restart) | banner above panel | pass | banner 0,46 1440×32 shows `Updating musterd to v0.2.0 …`; hit at (1085,51), inside both banner and panel, is `DIV#banner` |
| EC1 | focus | data, pending (before first hello) | panel above readout | N/A — no panel can show before the first hello (no session state). Measured: after a reload with `/ws` held, `.npanel` count 0 and readout `pending` is the hit. Once `/ws` is released and `ok`, the panel returns at 1080,0 and is the hit | |
| REQ-2 | focus | data, down | readout above panel, hit target at its centre | pass | `data-health=down`, title `musterd unreachable — reconnecting…`, readout z `46`; hit `SPAN#connection-status`; same after 1.2 s |
| REQ-2 | focus | data, down | banner above panel | pass | banner 0,46 1440×32, display `block`, opacity 1, text `musterd unreachable — …`; hit at (1085,51), inside both banner and panel, is `DIV#banner` |
| REQ-1 | tiles | data, ok | panel above readout | N/A — the notes spec hides the panel in Tiles. Measured: `.npanel` count 0, readout is the hit, banner `[hidden]` with display `none` | |
| REQ-2 | tiles | data, down | readout/banner above panel | N/A — no panel in Tiles. Measured: readout z `46` and is the hit, banner display `block` | |
| REQ-1 | tiles→focus | data, ok | panel returns above readout | pass | back in Focus after a down/restart in Tiles: panel at 1080,0 360×300, hit `BUTTON.ctl` in `.npanel` |
| REQ-1/2 | focus | no data, ok / down | readout unaffected when no panel | pass | no sessions, `.npanel` count 0. ok: readout z `auto` and is the hit. down: readout z `46` and is the hit, banner shows |
| REQ-1/2 | pop-out (`/doc.html`, `/note.html`) | any | panel vs readout | N/A — neither page has a `#connection-status` masthead readout (grep of both HTML files), and the note window reports its own status in its header | |
| Hidden | focus/tiles | ok | `[hidden]` banner not displayed | pass | `#banner` has `hidden`, and its computed display is `none` in every ok and pending-before-hello cell |

## Issues

### Critical

### Major

### Minor

### Notes
1. **[note]** While musterd is down, a panel placed under the readout has its control at that spot covered by the red dot (measured: the hit is `SPAN#connection-status` where the panel's `BUTTON.ctl` sits while `ok`). The proposed ADR `notes-readout-above-popped-panel-only-while-down` accepts this as a consequence, so no change is requested.
2. **[note]** After Close, the glyph reopens the note as the anchored panel (Pop in count 0, box 314,80.7 400×360), not the popped panel. This behaviour predates this plan and is outside its scope. It is recorded only because it showed up during the operability cell.
