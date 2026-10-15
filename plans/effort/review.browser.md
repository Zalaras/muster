# Browser review: Effort

**Plan**: effort
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 14240 words (budget 30000)
**Rig**: `make web-build build` under the gate lock at 7c30b541 (dirty only in the orchestrator's `plans/effort/` files); scratch daemons from `helpers/fixtures.ts` (`$TMPDIR/muster e2e-*`, a data dir with a space, `tmux.sock` inside it, torn down per test), stub `claude` from `helpers/daemon.ts`, headless Chromium through a throwaway spec (now deleted). `git status --porcelain` shows nothing of mine, and no scratch daemon or directory is left behind.

Gate log `GATES_LOG_DIR=…/gates-effort-c2`: 0 failed lines. `17-e2e.log` reads `905 passed (9.0m)`, so the build I drove is the build that ships.

Cycle 1's browser Major 1 is fixed. I measured it below (REQ-8, node identity).

## Matrix

There are four hosts: **focus**, **tiles**, **dialog** (the launch dialog, opened from each view) and **pop-out** (`/doc.html`). The plan puts the effort readout and the strip in the Focus mainhead only (§ Out of scope, § Views), so the tiles and pop-out cells for header rows are N/A. The viewport is 1280×900 unless a cell says otherwise.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 | dialog (focus) | no data | Effort row sits between Model and Start in | pass | radiogroup boxes in y order: Model 591–616, Effort 627–652, Start in 663–688; all inside dialog 280,148–1000,753 |
| REQ-1 | dialog (tiles) | no data | same | pass | identical boxes: Model 591–616, Effort 627–652, Start in 663–688 inside 280,148–1000,753 |
| REQ-1 | dialog (focus/tiles) | no data | six segments visible, in order | pass | labels `default low medium high xhigh max`, x 382–697, y 628–651; each computed `display:block; visibility:visible; opacity:1`; legend `Effort` |
| REQ-1 | dialog (focus/tiles) | 620px tall | Launch reachable | pass | `#launch-dialog` `overflow-y:auto`, scrollHeight 603 > clientHeight 582; after scrollIntoView, Launch is at 918,576–983,601, inside the viewport |
| REQ-1 | dialog (Resume tab) | data | Resume tab gains no Effort row | pass | radiogroup box 0×0, `checkVisibility()` false; ancestor chain `div.seg-track` → `fieldset.seg` (`contents`) → `div.fields[hidden]` computed `display:none` |
| REQ-1 | dialog (focus/tiles) | data | keyboard operable, keeps focus | pass | clicked `low`, pressed ArrowRight: active radio `medium`, checked; the same node is still `document.activeElement` and checked after 1.3 s, in both views |
| REQ-2 | dialog (focus/tiles) | data | the keyboard-chosen level is what spawns | pass | tmux `#{pane_start_command}` carries `--effort medium` from each view |
| REQ-4 | dialog (focus/tiles) | data | reopening on the directory restores the level | pass (settled) | 6/6 fresh runs (3 per view) read `xhigh` at open and 1.5 s later; 6/6 second launches on a remembered directory (pointer, keyboard, with and without a Recent click) restore `medium`. See Note 1 for the transient before repos arrive |
| REQ-4 | dialog (focus/tiles) | data | a Recent click restores the level over a pick | pass | picked `max`, clicked the directory's Recent: `medium` checked |
| REQ-6 | focus | no data (alive, no post) | `<model> (…)` | pass | `.model` `claude-haiku-4-5-20251001 (…)`, `.eff` ` (…)`, wire `effort:null` |
| REQ-6 | focus | no data (dead, never reported) | model with no brackets; header does not move | pass | text `claude-haiku-4-5-20251001`, 0 `.eff`; `.model` width 196.42 both alive and dead (the `holds-eff` reservation) |
| REQ-6 | focus | data | `<model> (<level>)` | pass | `Opus 4.5 (high)`, then `Opus 4.5 (medium)`, `Opus 5.5 (medium)`, `Opus 4.5 (low)` as posts change it |
| REQ-6 | focus | data (no-effort model) | bare model | pass | innerHTML `Haiku 4.5`, 0 `.eff`, `::after` content `none` |
| REQ-6 | focus | data (dead, reported) | keeps the last-known level | pass | after End: `Opus 4.5 (low)` |
| REQ-6 | focus | data (Resume tab, null model) | `unknown` then brackets | pass | `unknown (max)`; argv `--effort max`; no strip |
| REQ-6 | tiles / pop-out | any | — | N/A — plan § Out of scope: no effort on tiles; the pop-out shows the reader only | |
| REQ-6/R4 | focus | data, windows 1440/1000/800/700/640/616 | the model never truncates | pass | `.model` scrollWidth = clientWidth (102/102) at every width; `.eff` right = `.model` right (e.g. 602/602 at 616); document scrollWidth = clientWidth at every width |
| REQ-6/8 | focus | data | `.eff` node and the model text node are stable across passes (cycle 1 Major 1) | pass | MutationObserver on `.model` (childList, subtree, characterData, attributes): **0 mutations** in 2.5 s with no post, 3.5 s warned, and 1.5 s after a repeat post of the same level; the tagged `.eff` and the text node are the same and connected |
| REQ-6/8 | focus | data | each change touches only what changed | pass | level change: one childList swap inside `.eff` (` (high)` → ` (medium)`); model change: one characterData `Opus 4.5` → `Opus 5.5`; Dismiss: one attribute `eff warn` → `eff`; the node is the same in every case |
| REQ-7/8 | focus | data (clamped) | strip sentence | pass | `Asked for max — Opus 4.5 started at high.` |
| REQ-7/8 | focus | data (no effort) | strip sentence | pass | `Asked for high — Haiku 4.5 has no effort setting, so it started without one.`; header `Haiku 4.5`, no `.eff` |
| REQ-8 | focus | data | strip under the mainhead, above the slot, full width | pass | mainhead 300,46–1280,126; strip 300,126–1280,160; slot 300,160–1280,694; xterm 300,160–1280,688 |
| REQ-8 | focus | data | strip and tint visible | pass | strip computed `display:flex; visibility:visible; opacity:1`; `.eff.warn` colour rgb(232,207,90) = `--warn` (Instrument) |
| REQ-8/12 | focus | data, Instrument / Dark / Light | strip and tint use the warn tokens; `--warn` is not amber | pass | Instrument `.eff` 232,207,90 = `#e8cf5a`, bg 74,65,22 = `#4a4116`, fg 251,239,184 = `#fbefb8`; Dark 227,205,87 / 64,58,26 / 246,236,192 = `#e3cd57/#403a1a/#f6ecc0`; Light 97,83,0 / 251,241,194 / 90,74,0 = `#615300/#fbf1c2/#5a4a00`; `--warn-line` defined in all three; `--amber` differs (`#f2a33c`, `#e6a642`, `#844800`) |
| R4 | focus | data, windows 1440 → 616 | Dismiss stays in view; the strip does not overflow | pass | Dismiss x 1365–1426 at 1440 … 541–602 at 616; strip scrollWidth = clientWidth at every width (316/316 at 616); the strip wraps from 34px to 43px at ≤700 |
| REQ-8 | tiles | data (warned) | no strip outside Focus | pass | `#effort-strip` box 0×0 (its Focus container is hidden); `Asked for` absent from `innerText` |
| REQ-8 | pop-out | — | — | N/A — plan § Views: Focus only | |
| REQ-8 | focus | data, after Dismiss | the hidden strip is really hidden | pass | `hidden=true`, computed `display:none` |
| REQ-9 | focus | data | pointer Dismiss clears the strip and the tint | pass | strip `display:none`, `.eff` class `eff`, colour 166,171,188, wire `effortWarning:null`, effort `medium` kept |
| REQ-9 | focus | data | keyboard Dismiss keeps focus across a tick, then Enter clears it | pass | the tagged Dismiss is still `document.activeElement` after 1.3 s; Enter → strip `display:none`, wire `effortWarning:null` (focus then drops to `BODY`, Note 2) |
| REQ-9 | focus, second window | data | the strip goes in every window | pass | window 2's strip `Asked for xhigh — Opus 4.5 started at high.` before; count 0 after window 1's Dismiss; window 2 header `Opus 4.5 (high)`, class `eff` |
| REQ-9 | focus | data, two warned sessions | the bystander keeps its warning | pass | after B was dismissed, A reads `Asked for max — Opus 4.5 started at high.`, `.eff warn` |
| REQ-10 | focus | data (Stop → Resume) | level kept; the spawn carries it | pass | dead `Opus 4.5 (low)` → Resume → argv `--effort low`, header `Opus 4.5 (low)`, wire effort `low` |
| REQ-11 | dialog → focus | data | Resume-tab spawn and seed from the transcript's last line | pass | transcript efforts `[medium, max]` → argv `--effort max`, header `unknown (max)` before any post, no strip |
| REQ-13 | focus (claude surface) | data | the pane refits when the strip appears and goes | pass | note vs tmux `#{window_width}x#{window_height}`: 130×23/130x23 → 130×22/130x22 with the strip; a second run 24 → 23 → 24, tmux equal at each read |
| REQ-13 | focus (claude surface) | data, windows 1440 → 616 | the refit holds at width with the strip wrapped | pass | note = tmux at every width (151×26, 93×25, 93×25, 53×25, 45×24, 41×24) |
| REQ-13 | focus (shell surface) | data | same, for the shell pane | pass | shell target `muster-<id>-shell`: 130×24 → 130×23 with the strip → 130×24 after Dismiss, the note equal each time; xterm viewport 576 → 552 → 576 (closes cycle 1 Note 2) |
| REQ-13 | focus (docs surface) | data | the reader sits under the strip | pass | strip 300,95–1280,129; `section.reader` 300,129–1280,720 |
| REQ-12 | all | — | the token family is present | pass | four tokens resolve in all three themes (theme row above); `make contrast` is gate line `07`, green |
| Edge 16 / E11 | focus | data, reload and daemon restart | the warning survives | pass | after `page.reload()` and after `daemon.restart()`: `Asked for max — Opus 4.5 started at high.`, `.eff warn`, `Opus 4.5 (high)` |
| Edge 4 / E13 | focus | daemon-down (SIGTERM) | header and strip keep their state; banner is prominent | pass | `role=alert` banner 0,46–1280,78 full width, `display:block; opacity:1`: `musterd unreachable — hook output in open panes is Muster's absence, not session failure.`; header `Opus 4.5 (high)`, `.eff warn`, strip `display:flex` |
| States § daemon down | focus | daemon-down | a failed Dismiss leaves the strip and reports in the action-error line | pass | strip still `flex`; `#action-error` `display:block` reads `Could not reach musterd.` 1.5 s later |
| States § daemon down | focus | daemon back | — | note | `#action-error` still reads `Could not reach musterd.` 2 s after reconnect (Note 3) |
| REQ-1 | dialog | daemon-down | — | N/A — the plan leaves the dialog's daemon-down behaviour unchanged, and the Effort row is static markup | |
| §6 honesty | focus | all | no fake value for unknown effort; no Done; no cost | pass | unknown reads `(…)`, a placeholder rather than a fake value; a no-effort model shows no brackets rather than a guessed level |
| §7 terminal | focus | data | one live client; geometry moves on refit; scrollback 0 | pass | `totalAttachedClients()` = 1 at every read; the note says `one live client · geometry owned by this pane`; after 60 Enter presses, the xterm viewport scrollHeight 552 = clientHeight 552 (no scrollback) |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

### Notes

1. **[note]** For a moment after it opens, the launch dialog can show Effort `default`. Sometimes it is already on the remembered directory, sometimes no directory is pressed yet. Within 1.5 s it settles on the remembered level (seen in 4 of 6 opens in one flow, settled `medium` in all 6). This is the repos fetch arriving after the open, and REQ-4 deliberately keeps a pick made in that window. The settled state is correct, so I raise no defect (kb:adr/process-transient-displays-not-oracles). A spec that reads the checked radio straight after `toBeVisible()` without a web-first wait would flake on it.
2. **[note]** Carried from cycle 1: when a keyboard user presses Dismiss, the strip hides and focus drops to `<body>`. The plan names no place for focus to go. A candidate for a follow-up.
3. **[note]** Carried from cycle 1, measured again: after a failed daemon-down Dismiss, `#action-error`'s `Could not reach musterd.` stays up after the daemon is back (still shown 2 s after the banner hid), until the next action replaces it. The plan sets no rule for this. It is the existing action-error line's behaviour, not new in this plan.
4. **[note]** Carried from cycle 1: on a dead session the effort shows its last-known value (`Opus 4.5 (low)`) with no age. The plan defines the value as last-known and display-only, so no defect.
5. **[note]** Not measured: header widths below a 616px window. The 300px rail leaves the existing header overflowing at 400 and 316 regardless of this plan (cycle 1 Note 5).
