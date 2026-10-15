# Browser review: Effort

**Plan**: effort
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 14240 words (budget 30000)
**Rig**: `make web-build build` at d81f25cb (tree dirty only in `plans/effort/orchestration-state.json`); scratch daemons from `helpers/fixtures.ts` (`$TMPDIR/muster e2e-*`, a data dir with a space, `tmux.sock` inside it, torn down per test), stub `claude` from `helpers/daemon.ts`, headless Chromium through a throwaway spec (deleted afterwards); `git status --porcelain` shows nothing of mine.

Gate log: `17-e2e.log` is red on one line, `effort-header.spec.ts:893` (Dark theme, `.eff` colour `""`). I re-ran that test's three theme variants with `--repeat-each=10`: **3 of 30 failed**, all with `Received: ""`. The cause is measured below (browser Major 1). The app I drove is the build that ships.

## Matrix

Hosts: **focus** (Focus view), **tiles** (Tiles view), **dialog** (the launch dialog opened from the masthead in each view), **pop-out** (`/doc.html`). The plan puts the effort readout and the strip in the Focus mainhead only ("Effort on rail cards, tiles or Resume-tab rows" is out of scope), so the tiles and pop-out cells for header rows are N/A. Viewport is 1280×900 unless a cell says otherwise.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | dialog (focus) | no data | Effort row placed between Model and Start in | pass | radiogroup boxes in y order: Model 591–616, Effort 627–652, Start in 663–688; all inside dialog 280,148–1000,753 |
| REQ-1 | dialog (focus/tiles) | no data | six segments visible | pass | 6 labels `default low medium high xhigh max`, x 382–697 y 628–651, computed `display:block; visibility:visible; opacity:1`; legend `Effort` |
| REQ-1 | dialog (focus/tiles) | no data, 620px tall | Launch reachable | pass | `#launch-dialog` `overflow-y:auto`, scrollHeight 603 > clientHeight 582; after scrollIntoView Launch is at 918,576–983,601, inside the 620px viewport |
| REQ-1 | dialog (tiles) | data | operable by keyboard, keeps focus | pass | clicked `low`, pressed ArrowRight: active radio `medium` checked; the same tagged node is still active and checked after 1.3 s |
| REQ-2 | dialog (tiles) | data | keyboard-chosen level is spawned | pass | tmux `#{pane_start_command}` carries `--effort medium` |
| REQ-4 | dialog (focus) | data | reopen on the directory and a Recent click restore the level | pass | after an `xhigh` launch: on open the checked value is `xhigh`; after a Recent click it is `xhigh` |
| REQ-4 | dialog (tiles) | data | same | pass | open `xhigh`, Recent click `xhigh` |
| REQ-6 | focus | no data (alive, no post) | `<model> (…)` | pass | `.model` text `claude-haiku-4-5-20251001 (…)` (the bind's model id), `.eff` ` (…)` |
| REQ-6 | focus | no data (dead, never reported) | model with no brackets; header does not move | pass | text `claude-haiku-4-5-20251001`, no `.eff`; `.model.holds-eff::after` holds ` (…)` invisibly, so the box is 680–877 both alive and dead |
| REQ-6 | focus | data | `<model> (<level>)` | pass | `Opus 4.5 (high)`; `.eff` ` (high)`; wire `effort:{level:"high"}` |
| REQ-6 | focus | data (no-effort model) | bare model | pass | `Haiku 4.5`, no `.eff` node, no `::after` |
| REQ-6 | focus | data (Resume tab, null model) | `unknown` then brackets | pass | `unknown (max)`; argv `--effort max` |
| REQ-6 | tiles / pop-out | any | — | N/A — plan § Out of scope: no effort on tiles; the pop-out shows the reader only | |
| REQ-6/R4 | focus | data, windows 1440/1280/1000/900/800/760/700/640/616 | model never truncates | pass | `.model` scrollWidth = clientWidth (102/102) at every width; `.eff` right edge = `.model` right edge; model right 602 ≤ 616 at the narrowest; no horizontal page scroll |
| REQ-7/8 | focus | data (clamped) | strip sentence | pass | `Asked for max — Opus 4.5 started at high.` |
| REQ-7/8 | focus | data (no effort) | strip sentence | pass | `Asked for high — Haiku 4.5 has no effort setting, so it started without one.` |
| REQ-8 | focus | data | strip placed under mainhead, above slot, full width | pass | mainhead 300,46–1280,95; strip 300,95–1280,129; slot 300,129–1280,874 |
| REQ-8 | focus | data | strip and tint visible in `--warn` | pass | strip `display:flex; visibility:visible; opacity:1`; `.eff.warn` colour = `--warn` (rgb 232,207,90 Instrument) |
| REQ-8/R3 | focus | data, Instrument / Dark / Light | strip and tint use the warn tokens | pass | `.eff` = `--warn`, strip bg = `--warn-bg`, fg = `--warn-fg` in all three (Dark 227,205,87 / 64,58,26 / 246,236,192; Light 97,83,0 / 251,241,194 / 90,74,0); `--warn` ≠ `--amber` (242,163,60) |
| REQ-8 | focus | data | the `.eff` node is stable across render passes | FAIL | the tagged `.eff` node is gone after 1.3 s; a MutationObserver counts 6 child removals on `.model` in 3 s; the gate's computed-style read gets `""` in 3 of 30 runs (Major 1) |
| R4 | focus | data, windows 1440 → 616 | Dismiss stays in view | pass | Dismiss inside the strip and the window at every width, e.g. 541–602 at 616; strip wraps from 34px to 43px tall at ≤700 |
| REQ-8 | tiles | data (warned) | strip not shown outside Focus | pass | `#effort-strip` box 0×0 (its Focus container is hidden); `Asked for` absent from `innerText` |
| REQ-8 | pop-out | — | — | N/A — plan § Views: Focus only | |
| REQ-9 | focus | data | Dismiss with keyboard clears strip and tint | pass | focused Dismiss, pressed Enter: strip `display:none`, `.eff` class `eff` (colour back to 166,171,188), wire `effortWarning:null` |
| REQ-9 | focus | data | Dismiss keeps focus across a tick before it is pressed | pass | the tagged Dismiss node is still `document.activeElement` after 1.3 s |
| REQ-9 | focus, second window | data | the strip goes in every window | pass | page 2 strip present (`Asked for xhigh …`) before; `null` after page 1's Dismiss; header `Opus 4.5 (high)` stays |
| REQ-9 | focus | data, two warned sessions | the bystander keeps its warning | pass | after dismissing B, A still reads `Asked for max — Opus 4.5 started at high.` with `.eff warn` |
| REQ-10 | focus | data (Stop → Resume) | level kept; spawn carries it | pass | dead `Opus 5.5 (low)`, Resume → `Opus 5.5 (low)`, argv `--effort low`, wire effort `low` and the warning unchanged |
| REQ-11 | dialog → focus | data | Resume-tab spawn and seed | pass | argv `--effort max`, header `unknown (max)` before any post, no strip |
| REQ-13 | focus | data | the pane refits when the strip appears and goes | pass | size note vs tmux `#{window_width}x#{window_height}`: 130x32 → 130x31 when the strip shows → 130x32 after Dismiss; they agree in every read |
| REQ-13 | focus | data, windows 1440 → 616 | the refit holds at width, strip wrapped | pass | note = tmux at every width (151x26, 130x25, 79x25, 66x25, 61x25, 53x25, 45x24, 41x24) |
| REQ-12 | all | — | token family present | pass | four tokens resolve in all three themes (row above); `make contrast` is gate line `07` (green) |
| Edge 16 / E11 | focus | data, reload and daemon restart | warning survives | pass | after `page.reload()`: `Asked for xhigh — Opus 4.5 started at high.`; after `daemon.restart()`: the same, `.eff warn` ` (high)` |
| Edge 4 / E13 | focus | daemon-down (SIGTERM) | header and strip keep their state; banner shows | pass | banner `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; `Opus 4.5 (high)`, `.eff warn`, strip `display:flex` |
| States § daemon down | focus | daemon-down | a failed Dismiss leaves the strip and reports in the action-error line | pass | after a click: strip still `flex`; `#action-error` `display:block` reads `Could not reach musterd.` (still shown 1.5 s later) |
| REQ-1 | dialog | daemon-down | — | N/A — the dialog's daemon-down behaviour is unchanged by this plan; the Effort row is static markup | |
| §6 honesty | focus | all | no `0%`-style fake for unknown effort; no Done; no cost | pass | unknown reads `(…)`, which is a word-like placeholder, not a fake value; a no-effort model shows no brackets rather than a guessed level |
| §7 terminal | focus | data | one live client; geometry moved on refit | pass | size note reads `one live client · geometry owned by this pane`; tmux agrees after every strip show/hide |

## Issues

### Critical

(none)

### Major

1. **[web-impl]** The Focus header's `.eff` span is thrown away and rebuilt on every render pass. In a warned session, a node I tagged was gone 1.3 s later, and a MutationObserver on `.model` counted 6 child removals in 3 s with nothing on the page changing. A locator that resolves `.eff` can therefore point at a node that is detached by the time it is read. That is what turned gate line `17-e2e` red: `effort-header.spec.ts:893` read `getComputedStyle(.eff).color` as `""`. Re-run with `--repeat-each=10`, it fails 3 of 30 times across all three themes, so the red line is not specific to Dark. The cause is `renderModel` in `web/src/render/mainhead.ts:57-67`, which calls `createElement("span")` and `replaceChildren` on every pass. A fix must keep the same `.model` text node and `.eff` element across passes, and touch the DOM only when the brackets text or the `warn` flag changes. The strip in `render/effortstrip.ts` already works this way with a signature memo. To prove it: `make e2e-soak SPEC=effort-header.spec.ts N=10` green, plus a node-identity check across a render tick.

### Minor

(none)

### Notes

1. **[note]** If a keyboard user presses Dismiss, the strip hides and focus drops to `<body>` (measured: `document.activeElement` is `BODY` afterwards). The plan names no place for focus to go, and `web-implementation.md` already records this. No change requested; it is a candidate for a follow-up.
2. **[note]** Not measured: the strip's refit while the **shell** or **docs** surface is selected. All REQ-13 cells used the claude surface, because the shell pane's tmux target is not exposed to the oracle without more harness work. The strip sits above the shared `#main-terminal-slot`, so the same refit path should apply.
3. **[note]** Not measured: whether `#action-error`'s `Could not reach musterd.` from a failed daemon-down Dismiss clears once the daemon comes back. The plan sets no rule for this.
4. **[note]** On a dead session the effort shows its last-known value (`Opus 5.5 (low)`) with no age. §6.8 is about state that may be stale. Effort is display-only and the plan defines it as last-known, so I raise no defect. Any wording change would be the orchestrator's decision, not an impl fix.
5. **[note]** At window widths 400 and 316 the existing header already overflows the window, because the 300px rail leaves `.main` 100px and 16px wide (web-impl handoff item 5). I measured R4 down to a 616px window, where the header's content is about 316px wide, and it passed. The plan's "316px" wording is `review-work`'s to rule on.
