# Browser review: Maintainability Regressions

**Plan**: maintainability-regressions
**Verdict**: needs-changes
**Cycle**: 1
**Pack**: kb: pack 16131 words (budget 20000)
**Rig**: `make web-build build` at ef572b9 (tree dirty only in `orchestration-state.json`); scratch daemons from the committed `web/e2e/helpers` (`startDaemon`), data dirs `$TMPDIR/muster e2e-XXXX` (space-bearing), tmux `-S <dataDir>/tmux.sock`, the shared stub `claude` (`$TMPDIR/muster e2e-stub-cd75a542396fd84f`); headless Chromium at 1280×720 and 900×600; two throwaway specs (19 probe tests), deleted afterwards; `git status --porcelain` shows only the orchestrator's `orchestration-state.json`; no `musterd`/tmux left running.

Gates log: the one red line is `14-comments` (plan IDs in `style.css` comments, which belongs to review-work). `16-e2e` (460 passed) and `04-web-build` are green, so the app I drove is the one that will ship.

How I set things up: a "Claude Code update that drops a model" was simulated by launching a session with that model on a clean stub, then restarting the same scratch daemon with the stub's `MUSTER_E2E_STUB_UNRECOGNIZED_MODELS` set to it. That gives a real recent whose remembered model the binary now refuses (plan User Flow 3 and edge case 11), without faking any response. I stubbed a response body only where the cell needs one: `unchecked`, a non-2xx reply, and a stale body.

## Matrix

Hosts: **focus** = the dialog opened from Focus view. **tiles** = opened after pressing Tiles (`aria-pressed=true`). **pop-out** = `/doc.html`, which has no launch dialog (`grep launch-dialog web/doc.html` finds nothing), so every pop-out cell is N/A for that reason.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-6 | focus, tiles | no data yet | open requests the four presets | pass | route saw exactly `?model=sonnet&model=opus&model=haiku&model=fable`, one request per open |
| REQ-6 / edge 11 | focus, tiles | data | a restored non-preset gets its own request | pass | requests `[…4 presets…, "?model=zephyr-probe"]` |
| REQ-6 | pop-out | — | — | N/A — no dialog in `/doc.html` | |
| no-data-yet (UI States) | focus, tiles | no data yet (response held 1.2 s) | nothing marked or disabled, no spinner | pass | all 5 radios enabled with no `aria-invalid`; `#model-error` `hidden` + computed `display:none`; Launch `disabled=false` |
| REQ-7 | focus, tiles | data | unrecognised unselected preset disabled | pass | `fable:D`, label computed `color rgb(90,96,112)` = resolved `--disabled-fg` |
| REQ-7 | focus, tiles | data | marked "not recognised" (title reachable) | pass | `elementFromPoint` at the label centre is the INPUT, which carries `title="Claude Code doesn't recognise this model"` |
| REQ-7 | focus, tiles | data | pointer can't select it | pass | real click on fable's label: fable `checked=false`, sonnet still checked |
| REQ-7 | focus, tiles | data | keyboard skips it | pass | Tab into group, then ArrowRight ×5: `sonnet→opus→haiku→other→sonnet→opus` |
| REQ-7 | focus, tiles | data | keeps focus across a render tick | pass | focused radio `haiku` before and after 1.5 s |
| REQ-8 | focus, tiles | data (remembered `fable`, now refused) | kept selected, marked, message, Launch disabled | pass | `fable:CI` (checked, enabled, `aria-invalid=true`, `aria-describedby=model-error`); label `color rgb(243,183,183)`=`--banner-fg`, `outline solid 1px rgb(90,44,44)`=`--banner-line`; `#model-error` `display:block`, accessible text (aria-hidden glyph excluded, trimmed) exactly the daemon message; Launch `disabled=true` |
| REQ-8 | focus, tiles | data | Enter in Title can't submit while blocked | pass | Enter pressed in `#title-input`: 0 `POST /api/sessions`, dialog open |
| REQ-8 | focus, tiles | data | keyboard focus on the invalid radio survives a tick | pass | `fable` before and after 1.5 s |
| REQ-8 | focus, tiles | data | pointer pick of sonnet clears it, fable disabled | pass | `sonnet:C`, `fable:D`, `#model-error` `display:none`, Launch enabled; Launch then posts once and closes |
| REQ-8 / INV-2 | focus, tiles | data | `#model-error` contained, not overflowing | pass | box x297–983 inside dialog 280–1000; `scrollWidth 686 = clientWidth 686`; dialog `sh 548 = ch 548`; at 900×600 dialog 25–575 fits the 600 viewport |
| REQ-9 | focus, tiles | data | custom refusal marks Custom model | pass | input `aria-invalid=true`, `outline solid 1px rgb(90,44,44)`, `color rgb(243,183,183)`; Launch disabled; the same happens for Enter from the input |
| REQ-9 | focus, tiles | data | message in `#model-error`, **not** `#launch-error` (User Flow 5) | FAIL | both visible with the same sentence (`#launch-error` `display:block`, same text) (Major 1) |
| REQ-9 | focus, tiles | data | editing the text clears the mark | pass | Backspace: input `aria-invalid` removed, `#model-error` `display:none`, Launch enabled |
| REQ-8/9 | focus, tiles | data | after edit or re-select, no refusal message remains | FAIL | after Backspace, and after picking `haiku`, `#launch-error` still reads `…the model "muster-e2e-unrecognized-zz"…` while Launch is enabled (Major 1) |
| REQ-9 | focus, tiles | data | focus survives a refusal from a focused Launch | FAIL | pointer click or Tab+Enter on Launch → refusal disables Launch → `activeElement` = `BODY`; the next Tab also leaves `BODY` (Minor 1) |
| REQ-9 | focus | data | retyping the refused text re-marks it | pass | `zz` again → `aria-invalid=true`, message back (the latest verdict for that text) |
| REQ-10 / edge 1 | focus, tiles | daemon-down (SIGTERM) | nothing marked or disabled | pass | all radios enabled with no `aria-invalid`; `#model-error` `display:none`; Launch enabled |
| REQ-10 | focus, tiles | daemon-down | daemon-down surfaced prominently (§6) | pass | `#banner` "musterd unreachable — …" at 0,46 1280×32 `display:block`; dialog `#launch-error` "Could not reach musterd." |
| REQ-10 | focus, tiles | daemon-down | Launch reports its own error as today | pass | Launch → `#launch-error` "Choose a directory to launch into." (behaviour predates this plan, see Note 3) |
| REQ-10 | focus | data (non-2xx reply) | a 500 marks nothing | pass | fulfilled 500: every radio unmarked, Launch enabled |
| INV-4 (web half) | focus | data (`unchecked` for all) | `unchecked` never marks or disables | pass | `sonnet:C opus: haiku: fable: other:`, no message, Launch enabled |
| INV-1 | focus | data | custom selected with empty text doesn't block | pass | `other:C`, custom `""`, Launch enabled, no message |
| REQ-13 / edge 2 | focus | data | a late response from a closed dialog is ignored | pass | 1st open's response held, dialog closed and reopened, then a stale body (`sonnet`/`opus` unrecognized) released: sonnet/opus unmarked and enabled; only the reopen's fable verdict applies |
| REQ-13 / edge 2 | focus | data | closed before arrival, reopen issues its own | pass | reopen settles to `fable:D`, sonnet unmarked |
| REQ-13 / edge 3 | focus | data | custom edited while its verdict is in flight | pass | restored `zed-probe`, typed `x`, then released: `zed-probex` unmarked, Launch enabled; Backspace back to `zed-probe` → marked (correct verdict for that text) |
| edge 4 | focus | data | verdict lands after switching presets | pass | fable clicked, then haiku, then release: `haiku:C` unmarked, `fable:D` |
| R4 | focus | data | invalid reads "selected and wrong", distinct from disabled, in each theme | pass | instrument: invalid `rgb(243,183,183)`+`1px rgb(90,44,44)` vs disabled `rgb(90,96,112)`; dark: `rgb(244,185,185)`+`rgb(92,47,47)` vs `rgb(94,100,110)`; light: `rgb(122,31,31)`+`rgb(229,182,182)` vs `rgb(166,170,179)`; screenshots confirm the checked background stays under the error tone |
| R3 | focus | data | only `--banner-fg`/`--banner-line`/`--disabled-fg` | pass | every computed colour above equals the resolved token in that theme |
| Hidden | focus, tiles | all | `[hidden]` `#model-error` computes `display:none` | pass | `display:none` in every hidden reading (covered by `.fields [hidden]`) |
| REQ-1 / edge 9 / edge 10 | — | data (oracle) | wire shape, dedupe, errors | pass | `?fable&sonnet&fable&opus` → 3 entries in first-seen order, `message` only on fable; none, empty and 9 models → 400 `invalid_request`; no cookie → 401 `unauthorized` |
| REQ-1/2/3/4/5 timing and cache | — | — | parallel cost, per-identity cache, single-flight | N/A — no browser-observable consequence; the stub answers in ms (cold 28 ms, warm 6 ms). D1–D5, D9 are review-work's | |
| REQ-11 / REQ-12 / INV-5 | — | — | atomic wrapper write | N/A — a daemon file fact, nothing in the dashboard | |
| §7 terminal rules | — | — | — | N/A — the plan touches no terminal surface; launches from the probe opened normally in both hosts | |

## Issues

### Critical

(none)

### Major

1. **[web-impl] [orchestrator:decision]** A `model_unrecognized` refusal shows the same sentence twice, and one copy goes stale. `web/src/features/launch.ts` `submit()` calls `showError(result.error.message)` for every refusal as well as folding it into the verdict store. So `#launch-error` and `#model-error` both show the refusal, about 125 px apart (P4, Q2, and the custom-invalid screenshots in all three themes). Plan User Flow 5 says the message goes "in `#model-error`, not in `#launch-error`". Worse, `#launch-error` is never cleared by the edit or re-selection that clears the mark. After Backspace in the field, or after picking `haiku`, the dialog still says `Claude Code doesn't recognise the model "muster-e2e-unrecognized-zz"` while Launch is enabled and the field holds a different value. That contradicts REQ-8's "clears the mark and the message". web-impl kept the call on purpose, because E6's two pre-existing tests assert `#launch-error`. The plan contradicts itself (Flow 5 against "E6 passes unchanged"), which is why this needs a decision:
   - **(A)** A `model_unrecognized` refusal goes to `#model-error` only (no `showError` for that code). E6's two existing tests move their assertion to `#model-error`, and the plan records that E6 changed.
   - **(B)** Keep both, but clear `#launch-error` whenever the model selection or custom text changes, and amend Flow 5 to say both show.

   Either fix must make this true: once the mark has cleared, no visible refusal text names a model that is no longer selected.

### Minor

1. **[web-impl]** Launch loses keyboard focus when a refusal disables it. If Launch is activated from the button (a pointer click, or Tab then Enter), the refusal sets `launchButton.disabled = true` on the focused element. `document.activeElement` drops to `BODY`, and the next Tab leaves `BODY` too; only Shift+Tab gets back to Cancel (Q2). `web/src/render/launch.ts` `renderModelRowState`. A fix must make this true: after a refusal that disables a focused Launch, focus lands on the invalid control (the custom input or the invalid radio).
2. **[e2e-specs]** The E4 test in `web/e2e/launch-model-check.spec.ts` ("an unrecognised custom model submitted via Launch…") asserts `launchError(dialog)` has the refusal text, next to a comment reading "via #model-error, not #launch-error". So it encodes Major 1's duplicate as expected, and no test checks that `#launch-error` is gone after the edit. It could not have failed for Major 1. Whichever option is chosen, the spec should assert that option's `#launch-error` state after the refusal and after the edit.

### Notes

1. **[note]** When `other…` is selected, `#model-error` sits between the Model row and the `Custom model` input it describes, so the message reads above its field (custom-invalid screenshots). This is where the plan puts it ("directly after the Model fieldset"). No change requested; it is recorded for the design-system §5 pattern write-up.
2. **[note]** When `#model-error` appears, the dialog grows 24 px and re-centres. It moves up 12 px (y 97→85), so the Model row shifts under the pointer about 1 s after open, in the post-update case. No change requested.
3. **[note]** With the daemon down, pressing Launch replaces "Could not reach musterd." with "Choose a directory to launch into.", because the browse listing never loaded. This predates this plan, and REQ-10 keeps it as it was.
4. **[note]** The cells for REQ-1–5 (parallelism, per-identity cache, single-flight) and REQ-11/12 (atomic write) have no browser-visible consequence. I cross-checked only the wire shape, dedupe, 400 and 401 against `GET /api/models`; the rest belongs to review-work's D1–D9.
5. **[note]** The red gate `14-comments` (plan IDs in `web/src/style.css` comments at 2900/2913) belongs to review-work.
