# Review: sweep-2026-11-17-1

**Plan**: sweep-2026-11-17-1
**Verdict**: approved
**Cycle**: 1
**Gates**: 0 failed
**Parts**: code, browser | skipped: maintainability
**Part verdicts**: code approved, browser approved

_Merged by orch-state.py merge-review; the verdict is computed from the parts and the gate run, never edited by hand._

## Correctness review

# Correctness review: sweep-2026-11-17-1

**Plan**: sweep-2026-11-17-1
**Part verdict**: approved
**Cycle**: 1
**Pack**: kb: pack 17370 words (budget 30000)

Scope: `git diff main...HEAD` touches only `web/src/style.css` (the one `.shellact[data-act="busy"]` rule and the comment above `.shellact`) and `web/render/surfaces.spec.ts` (two new render tests), plus the plan's own files. (`main..HEAD` also lists `.claude/skills/proto/*` and `Makefile` because `main` moved on after the branch was cut. Those changes are not on this branch.)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 | Yes. `web/src/style.css:1223-1228`: the busy border is now a full 1.5px `--line-control` ring with a `--fg-dim` top, so the ring is complete at every angle. The 7×7 tile override (`:1276`) still applies and is unchanged. | Yes, by render tests: `surfaces.spec.ts:294` (mainhead, `shell-busy`) and `:304` (tile footer, `shell-busy-tiles`). The test author's log shows both were red against the pre-fix CSS (dy 0.8125 and 1 > 0.51) and green at HEAD (21-R1.log). | pass |
| REQ-2 | Yes. Both colours are existing semantic tokens, each defined in all three theme blocks (`style.css:39/89/139` for `--line-control`). There is no literal and no new token. The reduced-motion rule (`:1287-1291`) and the done tick (`:1243-1250`, `:1281-1285`) are byte-identical to `main`. | The colours are reviewer-verified (see below), as the plan intends. The unchanged reduced-motion and still-spins tests (`surfaces.spec.ts:143`, `:167`) are green in 21-R1.log. | pass |
| DIAG | `kb for web/src/style.css` names `kb:diagram/web-components`, which shows modules by directory. A change to one CSS rule's colours leaves it true. The plan has no `## Diagrams` delta. | — | pass |

## Build & Tests

E2E tests: pass (77, scoped to 7 files: plain-shell, shell-activity, shell-keys, shell-scroll, shell, terminal, theme) · Daemon tests (race): skipped (no `.go` file changed since main; the full suite runs at Final Validation) · Web tests: pass (3267 in 112 files) · Render tests: pass (501) · Daemon build: pass · Web build: pass · Lint: pass (golangci-lint 0 issues; biome clean) · Contrast: pass (54 pairs × 3 themes, 0 failures). All of this was read from $GATES_LOG_DIR (23 lines, 0 failed, 2 warn-only).

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| build | `go build ./...` | pass |
| test | `make test` | SKIP (no `.go` change; runs at Final Validation) |
| lint | `make lint` | pass |
| web-build | `make web-build` | pass |
| web-test | `make web-test` | pass (3267) |
| render-fixtures | `make check-render-fixtures` | pass (116 scenarios up to date) |
| render-lint | `make render-lint` | pass |
| render-test | `make render-test` | pass (501) |
| web-lint | `make web-lint` | pass |
| contrast | `make contrast` | pass |
| features-inventory | `features_inventory` | pass |
| versions | `make check-versions` | pass |
| e2e-honest | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| kb-check | `make check-kb` | pass (699 records, 0 problems) |
| e2e-lint | `make e2e-lint` | pass |
| features | `go tool kb scope --plan sweep-2026-11-17-1 --touch` | pass |
| comments | `comment-checks.py --gates` | pass |
| comment-ledger | `go run ./tools/commentpass verify sweep-2026-11-17-1` | pass |
| size | `size-warn.sh --changed` | WARN-only, 0 hits (review-maintainability's) |
| e2e-level | `e2e-lint.sh --census` | WARN-only. Every hit is in a pre-existing e2e spec this plan did not touch. |
| e2e | `make e2e SPECS='…7 specs…'` | pass (77) |
| R1 | `cd web && npx playwright test -c playwright.render.config.ts render/surfaces.spec.ts` | pass (7) |
| R2 | `make render-test` | pass (deduped to the gates' render-test line) |
| W1 | `make lint` | pass (deduped to the gates' lint line) |
| DOC | doc upkeep + Doc Delta vs what shipped | pass. This is a sweep batch, so the #126 tick in `TODO.md` is the loop's job on `main`. There are no `deviation:` or `doc-delta:` lines in the log. "No doc change" holds for `docs/features/surfaces/spec.md:72-73` ("a spinner while busy … a tick", which is still true) and `docs/protocol.md`. See Minor 1 for the design-system and ADR wording. |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| RV1 | The busy glyph reads as one `--fg-dim` arc over a faint `--line-control` ring in all three themes, matches mockup column (b), and no longer appears to slide around its centre. | pass (code half) | The shipped declarations are the two in the mockup's `.opt-b` rule (`plans/sweep-2026-11-17/mockups/spinner.html:36`: `border-color: var(--line-control); border-top-color: var(--fg-dim)`), on the same 1.5px border. No `[data-theme]` or other rule overrides `.shellact` colours (`rg shellact web/src` finds only the base rule, the tile size override and the reduced-motion rule). Both tokens are defined in all three theme blocks. The centring is measured by R1 (both hosts, four angles). How it reads per theme on screen is review-browser's to observe. |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass. No Go or protocol code changed. |
| 2 | Terminal-output state parsing | pass. CSS and a render test only. |
| 3 | Blocking hook handler | pass. Not touched. |
| 4 | Bare tmux / resize-pane sizing | pass. Not touched. |
| 5 | Payload logging | pass. Not touched. |
| 6 | Empty-gauge dishonesty | pass. Not applicable to a busy-only glyph; the "none" state removes the element as before (`render/surfaceseg.ts:85`). |
| 7 | Identity on `session_id` | pass. Not touched. |
| 8 | Settings trespass | pass. Not touched. |
| 9 | Real `claude` outside canary/probes | pass. The render tests run with no daemon on generated fixtures. |

Design tokens: no colour literal was added outside a theme block, and no new token, old token name, web font or state hue appears. `[hidden]` and tabular-nums do not apply. The new `--line-control` track is a track under the `--fg-dim` arc, the same case as the exempt list's "gauge tracks under a fill", so the closed exempt list needs no entry. `make contrast` is green.

Test quality: both new tests open their state only through `dashboard.open("shell-busy" | "shell-busy-tiles")`, which are the two scenarios the **Render fixtures** header names. No fixture was edited (`check-render-fixtures` is green and no file under `web/render/fixtures` changed). The oracle measures the property REQ-1 states (ink bounds centred and stable across four angles) and not the CSS declaration, and the test author's log shows it going red against the pre-fix rule. The repair in `c3a092d6` loosened the centre tolerance from 0.35 to 0.51 and tightened the clip. That repair keeps the test discriminating: the pre-fix readings are 0.8125 and 1. The 0.51 bound and the 1.5px margin each come with their arithmetic in a doc comment. No Repairs table exists because no E2E Validate step ran (E2E Scope: none).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** Two documents still describe the spinner's colours without the new track. The accepted `kb:adr/theme-shell-pip-retired-for-activity-indicator` Consequences say "The spinner and tick are **monochrome** — `--fg-dim` and `--fg`". `docs/design/design-system.md:33` lists `--line-control`'s roles as "button borders, badge borders, drag/drop outline". The busy spinner now also paints a `--line-control` track (`web/src/style.css:1225`). The plan argues the ADR still holds (the token is neutral, existing and not a state hue), and that is a fair reading of the ADR's intent. However, the research mockup the developer chose from says outright that (b) "adds a second colour against the 'one grey only' decision" (`spinner.html:91`), so the developer's choice of (b) over (a) is a decision with a rejected alternative, and it has no record. A fix must make both statements true: a `proposed` ADR (`refs: plan:sweep-2026-11-17-1`) recording "busy spinner = `--fg-dim` arc over a `--line-control` track; (a) two opposite arcs rejected", and "the busy spinner's track" added to the `--line-control` row in design-system §1. This does not block approval.
   id: docs/design/design-system.md:line-control-role:spinner-track-unlisted | confidence: 70

### Notes

1. **[note]** The plan's `## Proof` paragraph for e1 was spliced out of order by `0c4beae4`: "…split into one test per host (mainhead, tile footer)" sits mid-sentence before "centre on each axis at every angle, and the bounds' width…". The meaning is still recoverable and the text is not promoted anywhere.
2. **[note]** The plan's check W1 is `make lint`, which is golangci-lint, for a web-only plan. It passed (deduped), and the baseline `web-lint` line covered the CSS. The planner probably meant `make web-lint`.
3. **[note]** The tile-footer case passes with almost no headroom. A complete ring there reads about 0.5px off-centre (its 7px box sits on a half pixel) against the 0.51 tolerance. Rendering at a fixed DPR is deterministic so this is not a flake today, but a change to the render config's device scale factor would show up here first. The pre-fix reading (1.0) is still well clear on the red side.

## Browser review

# Browser review: sweep-2026-11-17-1

**Plan**: sweep-2026-11-17-1
**Part verdict**: approved
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
