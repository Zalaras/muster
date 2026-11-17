# Browser review: sweep-2026-11-17-1

**Plan**: sweep-2026-11-17-1
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 7871 words (budget 30000)
**Rig**: `make web-build build` at 0c4beae4; `bin/musterd` spawned by the committed `daemon` fixture: data dir `/var/folders/.../T/muster e2e-a93be773-XIZvVr` (has a space), private socket `<data dir>/tmux.sock`, stub claude `.../T/muster e2e-stub-953c0b15a8cc21d6/claude`; headless Chromium at 1280×900, DPR 1; throwaway spec deleted; data dir and tmux server gone afterwards

The gates log has 21 lines and 0 failed (R1 shows 7 passed, render-test 501 passed, e2e 77 passed), so the binary I drove is the one that will ship.

To make the shell busy I ran `sleep 120` in the shell pane. tmux oracle: `pane_current_command` = `sleep`. To finish the work I sent `C-c` through the private tmux socket (independent of the UI). I changed themes from the Settings dialog radios by pointer. To measure ink I paused the indicator's animation at 0/90/180/270°, took a screenshot of the box plus 1.5 px and found the pixels that differ from the clip's corner pixel by more than 6.

## Matrix

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus (shell segment pressed, bg `--bg-hover`) | data (busy) | complete ring, bounds stable and centred at each angle | pass | ink 9×9 at 0/90/180/270; dx −0.31, dy 0.31 at every angle |
| REQ-1 | focus (claude pressed, shell unpressed) | data (busy) | same | pass | instrument/dark/light: ink 9×9 at all four angles, dx −0.31, dy 0.31 |
| REQ-1 | tiles footer (7 px) | data (busy) | same | pass | instrument/dark/light: ink 7×7 at all four angles, dx −0.14, dy 0.50 (half-pixel box, within the plan's 0.51) |
| REQ-1 | pop-out `/doc.html` | — | — | N/A — the pop-out has no surface switch (`web/doc.html` and `web/src/doc.ts` have no `surfseg` or `shellact`) | |
| REQ-1 | focus / tiles | no data (shell never run, then shell opened and idle) | no indicator | pass | `.shellact` count 0 in both states |
| REQ-1 | focus | daemon-down | indicator contained, banner prominent | pass (see Note 2) | banner `role=alert` "musterd unreachable — …" 1280×32 at y 46, opacity 1, display block; indicator box 1121,97 9.6² inside button 1110–1180 × 92–112 |
| REQ-1 | focus / tiles | data | placed / contained | pass | mainhead box 9×9 (unrotated) inside button [1110.3,60.2,1179.9,80.2]; tile 7×7 at 499,473.5 inside button [493.1,471,544.2,483] and segment [446.6,470,578.9,484] |
| REQ-1 | focus | data | settled (not rebuilt each tick) | pass | same element (expando kept) after 1.3 s; animation `running`, currentTime 1600 ms (never restarted) |
| REQ-2 | focus, tiles × instrument | data (busy) | top arc `--fg-dim`, other three sides `--line-control` | pass | computed top rgb(166,171,188) = `--fg-dim`; right/bottom/left rgb(52,58,74) = `--line-control`. Pixels: arc ink [160,166,183], track ink [50,57,72] on bg [23,26,36] / [28,32,41] |
| REQ-2 | focus, tiles × dark | data (busy) | same | pass | top rgb(180,184,192) = `--fg-dim`; others rgb(58,63,73) = `--line-control`. Track ink [57,62,71] on bg [31,34,40] |
| REQ-2 | focus, tiles × light | data (busy) | same, track faint but present | pass | top rgb(73,77,92) = `--fg-dim`; others rgb(203,201,194) = `--line-control`. Track ink [204,202,195] on bg [251,250,247] |
| REQ-2 | focus, tiles | data (busy) | the arc turns (it does not stay on top) | pass | pixel samples down the centre column: arc at the top at 0°, at the bottom at 180°, off-column at 90° and 270° |
| REQ-2 | focus, tiles | data, reduced motion | no animation, busy shape kept | pass | `animation-name: none`, `getAnimations()` 0, transform none; border colours unchanged; 9×9 / 7×7; opacity 1, visibility visible |
| REQ-2 | focus | data (done) | tick unchanged | pass | `data-act=done`, bottom/left border rgb(232,230,225) = `--fg`, rotate(−45°), no animation |
| REQ-2 | pop-out | — | — | N/A — no indicator in the pop-out | |
| Reviewer-verified | focus, tiles × 3 themes | data | reads as one arc over a faint ring, no slide | pass | measured above: two colours, bounds fixed at every angle; the declarations match mockup column (b) (`border-color: var(--line-control); border-top-color: var(--fg-dim)`) |
| Edge 1 (7×7 tile) | tiles | data | → REQ-1 | pass | see the tiles rows above |
| Edge 2 (reduced motion) | focus, tiles | data | → REQ-2 | pass | see the reduced-motion row |
| Keeps focus / Operable | — | — | — | N/A — the indicator is `aria-hidden` and not interactive; the plan changes no control | |
| §7 terminal rules | focus | data | one live client, scrollback 0 | not re-measured — this diff touches CSS only; the footer read "one live client · geometry owned by this pane" | |

## Issues

### Critical

### Major

### Minor

### Notes

1. **[note]** At DPR 1, `border-top-width` computes to `1px`, not the declared `1.5px`, because Chromium snaps borders to device pixels. This was true before the plan and the ring is still complete and centred. I did not measure DPR 2.
2. **[note]** Outside this plan's change (the animation rule is untouched): while the daemon is down, the busy spinner keeps turning (`playState: running` 1.5 s after SIGTERM). It shows last-known busy as if it were live, with no age (design-system §6 rule 8). The banner does say the daemon is unreachable, and the pane shows "disconnected — daemon down". This could become a backlog entry; this plan should not be asked to fix it.
