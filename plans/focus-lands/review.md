# Review: focus-lands

**Plan**: focus-lands
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: focus-lands

**Plan**: focus-lands
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 43048 words (budget 30000)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `web/src/render/context.ts` `knownRowOf` finds a prior known row by its shape; `buildKnownRow` runs only when no row is found (first render, or after an unknown render's `textContent` cleared the children). Track class, fill width, percent, tokens and the compaction counter are then written to the existing nodes. Both callers share the builder (`render/sessions.ts:115` `.r3`, `render/tiles.ts:109` `.ctxinfo`) and were not changed. The unknown branch is byte-identical in output | Yes. rail-cards E1 tags the card's `.ctx`. The gauges "tile half" pin tags `.ctxinfo .ctx` and `.tok`. The gauges edge-2 pin covers the counter being added in place on both rows, and /clear going unknown then rebuilding with no counter. The validate step broke the impl on purpose and showed all three red | pass |
| REQ-2 | Yes. `features/surfaces.ts` `select` emits `surfaceSwitched` after the claude/docs render, and after a shell spawn resolves and renders (not on a failed or stale spawn). The surfaces listener focuses the `(id, kind)` terminal. The reader listener focuses `article.md` (`tabindex="-1"`, `index.html:466`). Both are guarded by `focusIsOnSwitchOrPage`. The Focus header and tile footer both build `.surfseg` through `buildSurfaceSegment`, so the guard covers both | Yes. plain-shell E2 covers the Focus header shell, docs and claude, by pointer and by Enter. E3 covers the tile footer to shell by pointer | pass |
| REQ-3 | Yes. `render/update.ts:60` sets `disabled = !checkEnabled && !checkBusy`. While a check is in flight the button carries `aria-busy` and `aria-disabled="true"`. `check()`'s `inFlight` guard (`features/update.ts:59`) ignores a press. `style.css` gives `[aria-disabled="true"]` the `:disabled` look and adds it to the exclusions of both `.btn` hover rules | Yes. update E4 checks focus after the Enter, after a tick of more than 1 s, and after the check settles. The existing e-note-4 still checks `isDisabled()` in flight, which now reads `aria-disabled`. The unit test REQ-10 checks a real `.disabled` when `canCheck` is false | pass |
| DIAG | `kb:diagram/web-components` (every changed file maps to it) | — | fail. `app.ts` now imports `SurfaceKind` from `terminal/surfaceswitch`, and the diagram draws no `app → terminal` edge (Major 1) |

## Build & Tests

E2E tests: pass (847/847, `17-e2e.log`) · Daemon tests (race): pass (24 packages ok, 0 FAIL, `02-test.log`) · Web tests: pass (2622, `05-web-test.log`) · Daemon build: pass (`01-build.log`, empty = clean) · Web build: pass (`04-web-build.log`) · Lint: pass (golangci-lint 0 issues; biome clean) · Contrast: pass (46 pairs × 3 themes, 0 failures) · kb check: pass · e2e-lint: clean · features-scope: pass (connection added to **Touches**, committed in `d60e5712`) · comment checks and ledger: clean, 1 block kept · size: WARN `web/src/features/reader.ts` 674 lines (`review-maintainability`'s, skipped this cycle). All read from `$GATES_LOG_DIR`, 0 failed lines.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| E1 | `cd web && npx playwright test rail-cards.spec.ts plain-shell.spec.ts update.spec.ts -g 'in place\|moves keyboard focus into\|keeps focus on it'` | pass (`18-E1.log`, 4 passed: rail-cards:774, plain-shell:804, plain-shell:869, update:1050) |
| W1 | `make web-lint` | pass (deduped to baseline `06-web-lint.log`) |
| W2 | `make web-test` | pass (deduped to baseline `05-web-test.log`, 2622 passed) |
| W3 | `make web-build` | pass (deduped to baseline `04-web-build.log`) |
| E5 | `make e2e` | pass (deduped to baseline `17-e2e.log`, 847 passed) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. The `TODO.md` group "Together — focus lands where the developer expects (#69, #76)" moved to `docs/history/todo-done.md` with all four entries ticked. The new `TODO.md` entry is the one the plan's `## Out of scope` names, as kb:adr/process-backlog-entries-are-the-users-to-file allows. The impl log has no `deviation:` line, so no ADR is owed, and no `proposed` ADR carries this plan. The `doc-delta:` line in the impl log is conditional on the surfaces spec listing app events, which it does not, so the plan's Doc Delta needs no amendment. Both Doc Delta assertions hold against the code (see Note 1 for a qualifier) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| R1 | A shell spawn that resolves moves focus only if focus is still on the switch segment or the page body | pass | `render/surfaceseg.ts:76` `focusIsOnSwitchOrPage` returns true only for `null`, `document.body` or a `.surfseg` descendant. It is checked in the surfaces listener before `surface.focus()` (`features/surfaces.ts:241-244`) and in the reader listener (`features/reader.ts:610-613`). The emit runs only after a non-stale, ok spawn (`surfaces.ts:146-161`). Pinned by the plain-shell R1 test: the POST is held, a real click moves focus into the rename field, the spawn is released, and focus stays on the same tagged field across a tick of more than 1 s. Validate showed it red with the guard forced true |
| R2 | The in-place row writes every field the rebuild wrote, and an unknown render followed by a known one rebuilds cleanly | pass | Each known pass writes `track.className` (`ctx` / `ctx hot`), `fill.style.width`, `pct` and `tok` text through `setText`, and `syncCompactCounter`. That function appends `.compact` when the count is positive and missing, removes it when the count is 0, and rewrites the class and text otherwise. These are the same fields the old builder wrote. `el.className = baseClass` drops `unk`. After an unknown render the element holds only a text node, so `knownRowOf` finds no `.ctx` child and `buildKnownRow` `replaceChildren`s cleanly. The gauges edge-2 pin covers the /clear → unknown → fresh-known path (`.ctx` count 1, no `⟳`) |
| R3 | `#update-check-button` is a real `disabled` only when `canCheck` is false. In flight it is `aria-disabled`, and `check()`'s in-flight guard ignores the press | pass | `features/updateview.ts:130` sets `checkEnabled = canCheck && !inFlight`. `render/update.ts:60` sets `disabled = !checkEnabled && !checkBusy`, which is true only when `canCheck` is false and no check is in flight. Lines 61-67 set and clear `aria-busy` and `aria-disabled` together. `features/update.ts:59` has `if (checkState.inFlight) return;` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. The diff is web-only, with no Claude Code field names |
| 2 | Terminal-output state parsing | pass. None |
| 3 | Blocking hook handler | pass. No daemon change |
| 4 | Bare tmux / resize-pane | pass. No tmux invocation |
| 5 | Payload logging | pass. No logging added |
| 6 | Empty-gauge dishonesty | pass. The unknown branch of `renderContextRow` is unchanged (word, `unk` class, no track). A known row never survives into an unknown render, because `textContent` clears it |
| 7 | Identity on `session_id` | pass. `surfaceSwitched` carries the Muster session id |
| 8 | Settings trespass | pass. None |
| 9 | Real `claude` outside canary | pass. The new specs use the stub and synthesized envelopes (`envelopedStatusLineFull`, `rawPreCompact`, the existing gauges E10 /clear sequence) |

Design tokens: the `style.css` change adds no literal. `.btn[aria-disabled="true"]` reuses `--disabled-fg`, `--disabled-bg` and `--disabled-line`. No old token name or web font. Contrast passed. No new `hidden` toggling. No `innerHTML`. No second WebSocket. No new dependency.

Fixtures: rail-cards uses `sharedDaemon()`/`fileDaemon` with a title-scoped test, plain-shell uses `daemon`, update uses `startDaemon`. All three match the **Fixture plan** header. Repairs honesty: `test-specs.md` has no `## Repairs` table, and the `--numstat` of every e2e file shows 0 deleted lines, so no existing assertion was weakened.

## Delta (delta re-review only)

n/a, cycle 1.

## Issues

### Critical

None.

### Major

1. **[orchestrator]** `kb:diagram/web-components` is stale (DIAG). The diagram says it is "Drawn from the `import` statements at directory granularity". It also says `app.ts` "depends on nothing above `sessions/`/`protocol/`" (`docs/diagrams/web-components.md:31-32`). `web/src/app.ts:21` now has `import type { SurfaceKind } from "./terminal/surfaceswitch"`, a new `app → terminal/` edge that the mermaid fence does not draw, and the fence already draws type-only edges such as `Rel(render, terminal, "segment types")`. Nothing cycles back, because `terminal/` does not import `app.ts`. Fix: add `Rel(app, terminal, "SurfaceKind type")` and change the sentence to name `terminal/`. The alternative is for web-impl to drop the import, but the type belongs in `terminal/`, so updating the diagram is the honest fix. Stale diagrams have been tagged `[orchestrator]` before; this one does not block approval.

### Minor

None.

### Notes

1. **[note]** The surfaces Doc Delta is worded without conditions: "moves keyboard focus into the surface switched to — the terminal for claude". Two cases fall outside it, both deliberate. Switching to `claude` on a dead session leaves focus where it was, because there is no terminal (plan edge case 3). A shell spawn that resolves after focus moved elsewhere also leaves focus alone (R1). `doc-reconcile` may want to say "on a live session" and "unless focus has moved on". The plan intends both cases, so this is not a defect.
2. **[note]** No E2E covers the tile-footer `claude` or `docs` switch, or the tile footer by keyboard: E3 covers only the footer to shell by pointer. These paths run through the same view-agnostic `surfaceSwitched` listeners that E2 exercises, and the plan's Proof named only the shell case.
3. **[note]** No assertion names `aria-disabled="true"` on Check now directly. It is pinned indirectly: e-note-4's `isDisabled()` would go false if the attribute were dropped, because the button is no longer `disabled` in flight, and E4's focus checks would fail if `disabled` came back. The `render/update.test.ts` fakes already record attributes (`checkAttrs`), so a one-line unit assertion would be cheap if wanted.
4. **[note]** The REQ-3 split leaves a theoretical gap: with `canCheck` false and a check in flight, `disabled` is false and `aria-disabled` is set. This cannot happen. `canCheck` is false only for an empty base URL or a dev install, both fixed at startup, and the button is truly disabled before any press can start a check.
5. **[note]** Stale comment at `web/src/style.css:2882-2888`. It says the rule set covers "every `.btn` disabled site" and that every hover rule is guarded `:hover:not(:disabled)`. Both now also involve `[aria-disabled="true"]`.
6. **[note]** `web/src/render/update.ts:27` `checkEnabled` lost its doc comment. Its meaning has also drifted: it is no longer the button's `disabled` state, which now also depends on `checkBusy`.
7. **[note]** The validate step's two `gauges.spec.ts` pins use the `daemon` fixture like every other test in that file. The plan's **Fixture plan** header lists only the three Proof files, so gauges is not named there.
8. **[note]** **Touches** `reader`: a docs switch now focuses the reader's `article.md`. No sentence in the reader spec becomes false, and the Doc Delta puts the claim on surfaces, so `reader` correctly stays under **Touches**.
9. **[note]** `web/src/features/reader.ts` is 674 lines (WARN size; the impl log gives the reason "already over 500, +10, not split"). Reading it is `review-maintainability`'s job, which was skipped this cycle (Shape: fix).

## Browser review

# Browser review: focus-lands

**Plan**: focus-lands
**Part verdict**: approved
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
