# Correctness review: focus-lands

**Plan**: focus-lands
**Verdict**: approved
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
