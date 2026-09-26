# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 16131 words (budget 20000)
**Rig**: `make web-build build` at 3c2b8c0 (the only dirty files were the orchestrator's `orchestration-state.json` and a sibling reviewer's part file). Scratch daemons came from the committed `web/e2e/helpers` (`startDaemon`), with data dirs `$TMPDIR/muster e2e-XXXX` (the path contains a space) and tmux `-S <dataDir>/tmux.sock`. `claude` was the shared stub (`$TMPDIR/muster e2e-stub-cd75a542396fd84f`). Headless Chromium ran at 1280×720, 900×600 and 1280×560. One throwaway spec (15 probe tests) was deleted afterwards. `git status --porcelain` shows nothing of mine, and no `musterd` or `tmux` process is left running.

Gates log (cycle 2): every line is green. `16-e2e` passed 461, and `04-web-build` is clean, so the app I drove is the one that will ship.

This cycle re-checks cycle 1's three findings: browser Major 1, Minor 1 and Minor 2. Major 1 was settled by `decisions/model-refusal-message-placement`, outcome A, which makes browser Minor 1 a condition of that outcome. I also re-ran the full matrix against the new build, because the refusal path, the focus handling in `renderModelRowState` and the type moves all changed. The "remembered model that the binary now refuses" case was set up for real: launch `fable` on a clean stub, then restart the same scratch daemon with the stub refusing `fable` and `opus`. I stubbed a response body only where a cell needs one: `unchecked` for every model, a 500, a stale body, and a held response.

## Matrix

Hosts: **focus** means the dialog was opened from Focus view. **tiles** means it was opened after pressing Tiles (`aria-pressed=true`). **pop-out** is `/doc.html`, which has no launch dialog (`grep -c launch-dialog web/doc.html` = 0). Every pop-out cell is therefore N/A.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-9 / User Flow 5 (decision A) | focus, tiles | data | a custom refusal shows in `#model-error` only | pass | after a pointer click on Launch: `#model-error` computes `display:block`, and its accessible text is exactly the daemon message. `#launch-error` is `[hidden]` with `display:none` and empty text. One `POST /api/sessions` |
| REQ-9 (decision A) | focus, tiles | data | same result when submitted by keyboard (Tab to Launch, then Enter) or by Enter in Title | pass | `#launch-error` is `H/none ""` in every case |
| REQ-9 (decision A) | focus, tiles | data | the refused preset (open-time verdict `unchecked`, refused at Launch) shows in `#model-error` only | pass | fable is checked, `aria-invalid`, `aria-describedby=model-error`. `#model-error` holds the fable sentence and `#launch-error` is `H/none ""` |
| REQ-8/9 (cycle 1 Major 1's fix condition) | focus, tiles | data | once the mark clears, no visible text names the model that is no longer selected | pass | after Backspace: input not invalid, and both errors `none`, Launch enabled. After picking haiku by pointer: the same. After ArrowLeft off the refused fable radio, or a click on sonnet: the same |
| REQ-9 | focus, tiles | data | retyping the refused text re-marks it, and returning to `other…` with refused text re-marks it | pass | `…-zz` typed again: `inv=true`, message back, Launch disabled. Pointer on `other…`: the same |
| REQ-9 | focus, tiles | data | a fixed text launches | pass | `probe-ok-model` gives one POST, the dialog closes, and `/api/state` shows `probe-p1` with model id `probe-ok-model` |
| Focus after refusal (cycle 1 Minor 1, a condition of decision A) | focus, tiles | data | a pointer click on Launch moves focus to the invalid custom input | pass | `activeElement` = `INPUT#custom-model-input` right after the refusal |
| Focus after refusal | focus, tiles | data | Tab then Enter on Launch moves focus to the invalid custom input | pass | the same `activeElement` |
| Focus after refusal | focus, tiles | data | a preset refused at Launch moves focus to the invalid radio | pass | `activeElement` = `INPUT[name=model][value=fable]` (checked, invalid) |
| Keeps focus | focus, tiles | data | the moved focus survives a render tick | pass | I marked the node with an attribute, waited 1.5 s, and the same marked node was still `activeElement` (custom input and fable radio) |
| Focus after refusal | focus, tiles | data | Tab from the invalid control stays in the dialog, and Shift+Tab returns | pass | Tab went to an `INPUT` with `inDialog=true`; Shift+Tab went back to `#custom-model-input` |
| Focus after refusal | focus, tiles | data | a refusal submitted from Title does not steal focus | pass | `activeElement` stays `INPUT#title-input` (see Note 1) |
| Decision dissent (a11y) | focus, tiles | data | the newly focused control's accessible description is the refusal | pass | `toHaveAccessibleDescription` passes on `Custom model` with the exact daemon message, and the `⚠` glyph is excluded |
| REQ-8 | focus, tiles | data | Enter in the invalid custom input cannot submit | pass | 0 POSTs in 600 ms, and the state is unchanged |
| REQ-13 (new submit-generation capture) | focus | data | a refusal that lands after cancel and reopen marks nothing | pass | POST held, Escape, reopen, same `…-zz` typed, then released. After 1.5 s: input `inv=null`, both errors `none`, Launch enabled |
| REQ-6 | focus | no data yet | opening the dialog requests the four presets | pass | exactly one request, `?model=sonnet&model=opus&model=haiku&model=fable` |
| REQ-6 / edge 11 | focus, tiles | data | a restored non-preset gets its own request | N/A this cycle: the code path is unchanged since cycle 1's pass (`applyModelRestore` diff is comment-only), and E4-restore in the gate run is green | |
| UI States: no data yet | focus | no data yet (response held 1.2 s) | nothing is marked or disabled, and there is no spinner | pass | all radios enabled with no `I`, `#model-error` `H/none`, Launch enabled |
| REQ-7 | focus, tiles | data | an unrecognised preset that is not selected is disabled, and its title can be reached | pass | `fable:D` and `opus:D`. `elementFromPoint` at the label centre is the INPUT with `title="Claude Code doesn't recognise this model"`. Label `rgb(90,96,112)` = `--disabled-fg` |
| REQ-7 | focus | data | a pointer can't select it, and the keyboard skips it | pass | a forced click on fable leaves `haiku:C fable:D`. ArrowRight ×5 from sonnet goes `opus→haiku→other→sonnet→opus` |
| edge 4 | focus | data | a verdict that lands after switching presets doesn't mark the new selection | pass | click fable, click haiku, release: `haiku:C` unmarked, `fable:D` |
| REQ-8 (User Flow 3) | focus, tiles | data (remembered `fable`, now refused) | kept, marked, message shown, Launch disabled | pass | `fable:CId`, `opus:D`, `#model-error` `block` with the fable sentence, `#launch-error` `H/none`, Launch disabled |
| REQ-8 | focus, tiles | data | Enter in Title can't submit while blocked | pass | 0 POSTs |
| REQ-8 | focus, tiles | data | keyboard focus on the invalid radio survives a tick | pass | the marked fable radio is still `activeElement` after 1.5 s |
| REQ-8 / User Flow 4 | focus, tiles | data | picking sonnet clears the mark and disables fable | pass | `sonnet:C opus:D fable:D`, both errors `none`, Launch enabled |
| Placed / contained | focus, tiles | data, 1280×720 | `#model-error` sits inside the dialog without overflow | pass | preset invalid: box 297,521–983,534 inside dialog 280,85–1000,635, `scrollWidth 686 = clientWidth 686`, dialog `sh 548 = ch 548`. Custom invalid: 297,495–983,521 inside 280,59–1000,661, `sh 600 = ch 600` |
| Reachable | focus | data, 900×600 and 1280×560 | the custom-invalid dialog scrolls to Launch | pass | the dialog has `overflow-y:auto` and `max-height: calc(100% - 36px)`. At 600: `sh 600 > ch 562`. At 560: `sh 600 > ch 522`. See Note 2 |
| REQ-10 / edge 1 | focus, tiles | daemon-down (SIGTERM) | nothing is marked or disabled | pass | waited for `requestfailed` on `/api/models`, then 1.2 s: `sonnet:C`, all others enabled, `#model-error` `none`, Launch enabled |
| REQ-10 / §6 | focus, tiles | daemon-down | daemon-down is surfaced prominently | pass | `#banner` `display:block` at y 46, 1280×32, "musterd unreachable — …". The dialog's `#launch-error` reads "Could not reach musterd." |
| REQ-10 (decision A keeps other codes) | focus, tiles | daemon-down | a refusal with another code still goes to `#launch-error` | pass | Launch → `#launch-error` `block` "Choose a directory to launch into.", `#model-error` `none` |
| REQ-10 | focus | data (500) | a non-2xx response marks nothing | pass | every radio unmarked, Launch enabled |
| INV-4 (web half) | focus | data (`unchecked` for all) | `unchecked` never marks or disables | pass | `sonnet:C`, nothing `D` or `I`, no message |
| REQ-13 / edge 2 | focus | data | a late GET from a closed dialog is ignored | pass | the first open's response was held with sonnet and opus `unrecognized`. After close, reopen (settled `fable:D`) and release: `sonnet:C opus: fable:D`, no message |
| R4 | tiles (the view preference carried over) | data | invalid reads as "selected and wrong", distinct from disabled, in every theme | pass | instrument: invalid `rgb(243,183,183)` with a 1px outline `rgb(90,44,44)`, disabled `rgb(90,96,112)`. Dark: `rgb(244,185,185)` / `rgb(92,47,47)` against `rgb(94,100,110)`. Light: `rgb(122,31,31)` / `rgb(229,182,182)` against `rgb(166,170,179)`. The Light screenshot shows the checked background under the error tone |
| R3 | tiles | data | only `--banner-fg`, `--banner-line` and `--disabled-fg` are used | pass | every computed colour equals that theme's resolved token (`#f3b7b7`/`#5a2c2c`/`#5a6070`, `#f4b9b9`/`#5c2f2f`/`#5e646e`, `#7a1f1f`/`#e5b6b6`/`#a6aab3`) |
| design-system §5 | tiles | data | `#model-error` uses `--fs-xs` and a mono font | pass | 11.25 px = `.75rem` × the 15 px root, `ui-monospace, SFMono-Regular…`, colour = `--banner-fg` |
| Hidden | focus, tiles | all | a `[hidden]` `#model-error` or `#launch-error` computes `display:none` | pass | every reading where the element was `H` also read `none` |
| every row | pop-out | — | — | N/A: `/doc.html` has no launch dialog | |
| REQ-1–5 timing and cache | — | — | parallel checks, per-identity cache, single-flight | N/A: nothing about these is visible in the browser (the stub answers in milliseconds). D1–D5 and D9 are review-work's | |
| REQ-11 / REQ-12 / INV-5 | — | — | atomic wrapper write | N/A: a fact about daemon files, with nothing shown in the dashboard | |
| §7 terminal rules | — | — | — | N/A: the plan touches no terminal surface. The probe's launches opened normally in both hosts (the tiles host showed a live 84×10 tile) | |

## Issues

### Critical

(none)

### Major

(none)

### Minor

(none)

Cycle 1's findings are resolved:
- Major 1 (duplicate and stale refusal text) is fixed per decision A, in every host and every submit path.
- Minor 1 (focus dropped to `BODY`) is fixed for both the custom input and the invalid preset radio, and the fix survives a tick.
- Minor 2 is fixed: the E4 test and both E6 tests in `web/e2e/launch-model-check.spec.ts` now assert that `#launch-error` is hidden, including after the edit. So they would fail on the cycle 1 build. A new focus-retention test uses a node-identity check.

### Notes

1. **[note]** Decision A's dissent (`#model-error` has no live region) is answered only when Launch had focus. When the refusal comes from Enter in Title (or Enter in the custom input), focus correctly stays where it was. In the Title case, though, the focused control is not `aria-describedby="model-error"`, and neither `#model-error` nor anything else is `role="alert"` or `aria-live`. So nothing tells assistive technology about the refusal. This is the scope the decision chose ("after a refusal disables a focused Launch"), so no change is requested. It is recorded in case the orchestrator wants it for the design-system §5 write-up.
2. **[note]** At 900×600 the custom-invalid dialog is 600 px of content in a 562 px box. The inserted `#model-error` pushes the footer, including Launch at 582–607, just below the visible bottom (582) until you scroll. Before the refusal it fit, off by 1 px. The dialog scrolls (`overflow-y:auto`), Launch is disabled in that state anyway, and focus lands on the visible custom input. Editing the text hides the message and the footer comes back. At 1280×560 the custom row overflows even before any refusal, which predates this plan. No change requested.
3. **[note]** This predates the plan: while a `POST /api/sessions` is in flight, Launch stays enabled and focused (P5: `launchDisabled:false`, `activeElement = BUTTON#launch-button` during a held POST). INV-1 mentions an in-flight submit as a disable reason that composes with it, but none exists on this tree. This plan doesn't touch it, and nothing here depends on it.
4. **[note]** R4 and R3 were measured in the tiles host, because the view preference from the preceding tiles pass persisted. Cycle 1 measured the same tokens in the focus host, and the style rules changed only in comments since then.
