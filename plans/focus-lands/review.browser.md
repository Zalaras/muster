# Browser review: focus-lands

**Plan**: focus-lands
**Verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 11579 words (budget 30000)
**Rig**: `make web-build build` at d60e5712 (`v0.20.2-54-gd60e5712-dirty`, the only dirt is `orchestration-state.json`); each test ran its own scratch daemon from `helpers/fixtures.ts` (`$TMPDIR/muster e2e-*` data dir, space in the path, private tmux socket inside it, killed on teardown), the harness's stub `claude`, and for REQ-3 a staged installer-kind `v0.1.0` binary pointed at `FakeReleaseServer`. Headless Chromium at 1440×900, driven by a throwaway spec (`web/e2e/zz-review-browser.spec.ts`, now deleted). The gates log (`gates-focus-lands-c1`) has 0 failed lines, so the app driven is the one that ships.

## Matrix

Hosts: the **focus rail** card (`.r3`), the **tile** header (`.ctxinfo` in `.thead`), the Tiles **strip** card (`#tiles-strip`, same template as the rail card), the **Focus header** switch, the **tile footer** switch, and the **Settings dialog**. "Churn" means a MutationObserver over the whole card or tile header that counts every element removed during the window.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | focus rail | no data | unknown context shows the word, with no track | pass | `.r3` class `r3 unk`, text `ctx unknown`, 0 `.ctx` elements |
| REQ-1 | focus rail | no data | a press on the row survives a render | pass | real mouse down on A's `.r3 unk`, held 1.5 s, released: pressed node still connected, 1 click, A `aria-current=true`, focus in A's terminal |
| REQ-1 | focus rail | no data | no rows rebuilt by a render | pass | churn over card A for 3.3 s: `{}` (0 removals) |
| REQ-1 | focus rail | data | correct value | pass | UI `40%80k` = `/api/state` context `usedPct 40, totalInputTokens 80000` |
| REQ-1 | focus rail | data | placed inside the card | pass | row 14,324–288,337 inside card 0,251–299,348; fill right edge at 35 on track 14–66 (≈40%) |
| REQ-1 | focus rail | data | visible | pass | computed display block or flex, visibility visible, opacity 1 on the row, track and fill |
| REQ-1 | focus rail | data | no rows rebuilt by a render | pass | churn over card B for 3.3 s with a live `00:0x` timer: `{}`. With the compaction counter present, 2.2 s: `{}` |
| REQ-1 | focus rail | data | #69: after typing in A's terminal, one click on B's context row selects B, even when a render and a status change land mid-press | pass | typed `typed-in-a` into A's terminal; mouse down on B's `SPAN.ctx`; status 40→41% posted during a 1.5 s hold; up: pressed node connected, 1 click, B `aria-current=true`, focus in B's terminal, row `41%82k`, tagged track kept |
| REQ-1 | focus rail | data | the same on the percent span | pass | press on `SPAN` (pct), 41→43% mid-hold: node connected, click fired, B selected |
| REQ-1 | focus rail | data | `hot` added and removed on the same node | pass | 65%: class `ctx hot`, fill `rgb(242,163,60)`, width 65%, tag kept; 50%: class `ctx`, fill `rgb(178,182,195)`, tag kept |
| REQ-1 | focus rail | data | the compaction counter appears on a later render | pass | after PreCompact: children `SPAN.ctx, SPAN, SPAN.tok, SPAN.compact`, text `50%100k⟳1`; API `compactions 1` |
| REQ-1 | focus rail | data | a `/clear` goes known→unknown→known and the row rebuilds cleanly | pass | before `ctx hot` 70% `⟳1`; after the clear: `r3 unk` `ctx unknown`, API all null and `compactions 0`; then 12%: a fresh track (old tag gone), `12%`/`24k`, no `.compact`, class `r3` |
| REQ-1 | focus rail | daemon-down | daemon-down is shown prominently, and rows stay in place | pass | `#banner` "musterd unreachable — …" display block, visible; `#connection-status` "reconnecting…"; churn over card B for 2.2 s: `{}` |
| REQ-1 | tiles | no data | unknown context shows the word, with no track | pass | `.ctxinfo unk`, `ctx unknown`, 0 `.ctx` |
| REQ-1 | tiles | data | correct value, placed in the header | pass | `40%80k` = API; info 579,95–661,108 inside `.thead` 2,86–719,117 inside tile 1,85–720,492 |
| REQ-1 | tiles | data | no header elements rebuilt by a render | pass | churn over `.thead` for 3.3 s: `{}` |
| REQ-1 | tiles | data | a held press on `.ctxinfo` survives a render and a status change | pass | press on `SPAN.ctx`, 40→65% mid-hold: node connected, 1 click on `.thead`, class turns `ctx hot`, tag kept |
| REQ-1 | tiles | data | the compaction counter appears in place and stays in the header | pass | `65%130k⟳1`, tag kept, info 554,94–661,108 inside `.thead` |
| REQ-1 | tiles | daemon-down | rows stay in place | pass | text unchanged, `.thead` churn 2.2 s `{}`; banner as above |
| REQ-1 | strip | data | placed, and not rebuilt by renders | pass | row 14,877–1429,890 inside card 0,803–1440,900; churn 2.2 s `{}` for both strip cards observed |
| REQ-1 | strip | data | a held press on the row with a status change mid-press still clicks | pass | press on `SPAN.ctx`, 30→31% mid-hold: node connected; the effect followed (the card left the strip, `liveTileById` count 1) |
| REQ-1 | pop-out | all | — | N/A: `/doc.html` hosts the reader only; it has no context row | |
| REQ-2 | Focus header | data | pointer `shell` (first spawn) → focus in the shell terminal | pass | active `TEXTAREA.xterm-helper-textarea` inside `Shell: …`, still there after 1.2 s |
| REQ-2 | Focus header | data | shell keystrokes reach the shell (operable) | pass | typed `echo rbshellmark-$((6*7))` + Enter, then `tmux capture-pane` of `muster-<id>-shell` shows `rbshellmark-42` |
| REQ-2 | Focus header | data | pointer `docs` → focus on `article.md` | pass | active `ARTICLE.md` in `Reader: …`, kept after 1.2 s |
| REQ-2 | Focus header | data | pointer `claude` → focus in the Claude terminal; keys reach Claude | pass | active xterm textarea; capture-pane of the session target shows `stub-echo:rbclaudemark` |
| REQ-2 | Focus header | data | keyboard Enter `docs` → `article.md` is focused and scrolls by key | pass | active `ARTICLE.md`; once the body re-lays out, PageDown scrolls it from 0 to 733 (sh 10060 / ch 773, `overflow-y: auto`) |
| REQ-2 | Focus header | data | keyboard Space `shell`, Enter `claude` → focus moves into each | pass | active xterm textarea in the shell, then the Claude terminal, kept after 1.2 s |
| REQ-2 | Focus header | data | R1 / edge 5: a held shell spawn that resolves after focus moved to the rename field does not steal focus | pass | POST `/shell` held; clicked `shell`, then rename; released; shell visible; after 1.5 s the active element is still `INPUT.name-edit` |
| REQ-2 | Focus header | data | edge 3: Enter on `claude` for a dead session leaves focus where it was | pass | tmux session killed and API `alive:false`; active is still `BUTTON[claude]`, `aria-pressed=true` |
| REQ-2 | Focus header | daemon-down | the switch is inert | pass | all three segments `disabled` (pre-existing gate) |
| REQ-2 | tile footer | data | pointer `shell` → focus in that tile's shell; keys reach it | pass | active xterm textarea; shell box 722,117–1438,463 inside tile 721,85–1439,492; capture-pane shows `rbtile-25` |
| REQ-2 | tile footer | data | pointer `docs` → that tile's `article.md` | pass | active `ARTICLE.md` in `Reader: rb-tile-two` |
| REQ-2 | tile footer | data | pointer `claude` → that tile's terminal; keys go to it alone | pass | capture-pane of s2 shows `stub-echo:rbtilemark`; s1's pane does not |
| REQ-2 | tile footer | data | keyboard Enter docs / shell / claude | pass | the active element is `ARTICLE.md`, then the shell textarea, then the Claude textarea; PageDown in the tile body scrolls 0→274 (sh 7198 / ch 314) |
| REQ-2 | tile footer | daemon-down | the switch is inert | pass | all three of the tile's segments `disabled` |
| REQ-2 | pop-out | all | — | N/A: `/doc.html` has no surface switch | |
| REQ-3 | Settings | data (canCheck) | keyboard Enter: focus stays on Check now in flight, across a tick, and after it settles | pass | in flight `disabled=false`, `aria-disabled=true`, `aria-busy=true`; focused at press, after 1.2 s, and after the status line `update check failed: … 404 …`; attributes then cleared |
| REQ-3 | Settings | data (canCheck) | reads as unavailable in flight | pass | in flight color `rgb(90,96,112)`, bg `rgb(34,38,47)`, border `rgb(44,49,64)`, cursor `not-allowed`, the same values as a real `.btn:disabled` reference; hover leaves them unchanged |
| REQ-3 | Settings | data (canCheck) | a press in flight does nothing | pass | Enter and then Space during the held check: `/latest` requests = 1, the original one only |
| REQ-3 | Settings | data (canCheck) | pointer click: the same focus behaviour | pass | focused in flight, after 1.2 s, and when settled (`BUTTON#update-check-button`) |
| REQ-3 | Settings | data (canCheck) | Tab after the settle continues from the button | pass | the next Tab lands on `#settings-close-button`, the next enabled control in dialog order (the inputs, then Check now, then Close) |
| REQ-3 | Settings | no data (canCheck false, dev install) | a real `disabled` | pass | `disabled=true`, no `aria-disabled`, no `aria-busy`, disabled look |
| REQ-3 | Settings | daemon-down | — | N/A: the dialog closes when the connection status changes (`features/settings.ts:35`, pre-existing), and focus returns to the Settings button | |
| REQ-3 | pop-out / tiles | all | — | N/A: Check now lives only in the Settings dialog | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[orchestrator:decision]** Switching to `docs` by keyboard draws Chrome's default focus ring around the whole reading body: `article.md:focus-visible` is true, and the computed outline is `auto 1px rgb(0,95,204)`, a blue ring around the 904×773 body (a pointer switch gives `:focus-visible` false and no ring). `style.css` has no global `:focus-visible` rule, and design-system §5 names "the amber focus ring" only for specific controls. The ring is new with REQ-2, because nothing focused the body by keyboard before.
   - **A: keep the UA ring.** It tells a keyboard user where focus went, it matches how unstyled `.btn`s already show focus, and it costs no CSS.
   - **B: style or suppress it** with `.md:focus-visible`, either the amber 1px inset outline the design system uses for segmented controls or `outline: none`, since the reading body is a scroll target and not a control. Either is one CSS rule. Suppressing it hides where focus went.
2. **[note]** For about 150 ms after a switch back to `docs`, `article.md` re-lays out with no scroll range (sample 1: sh 776 = ch 776; sample 2: sh 10060). A PageDown pressed inside that window does nothing; focus is already on the body. This is pre-existing re-show behaviour, not a focus defect.
3. **[note]** While the daemon is down, the context row keeps its last values with no age shown (for example `65%130k⟳1`). This is pre-existing, and the prominent `#banner` "musterd unreachable" covers the staleness. The plan does not change it.
4. **[note]** Not measured: the out-of-scope case of a rail card re-inserted by a reorder mid-press (plan § Out of scope). Every other cell above has a result.

Design-system §6/§7 checks for this surface: unknown context is the word, never a 0% track (rail, tile and strip all measured); the context percentage always shows with tokens, and with `⟳N` when compactions are positive; there is no Done state and no cost display; daemon-down is surfaced. §7 is untouched by this diff.
