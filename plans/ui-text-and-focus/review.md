# Review: ui-text-and-focus

**Plan**: ui-text-and-focus
**Cycle**: 2
**Verdict**: approved

Cycle 1's Critical and both Majors are fixed and independently verified. The view-switch
rename cancel now holds on both mechanisms and both surfaces, measured live in a browser
rather than read from the diff, and it is pinned by three new E2E tests whose mutation
check is recorded. Ordinary blur-commit (REQ-14) is untouched and now has its own
regression pin. All nine authored acceptance checks pass and the full 242/242 suite is
green with no regression in any spec this plan did not author.

One Minor remains, a small behaviour regression the fix introduced on a degenerate
gesture (clicking the view segment already active discards an open edit). It does not
block approval; the orchestrator should carry it into `TODO.md`.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 rail `currentId` / `aria-current` | Yes | Yes (W6 Vitest, E1–E3, browser) | pass |
| REQ-2 `.card.current` treatment | Yes | Yes (focus-marker.spec REQ-2, browser) | pass |
| REQ-3 marker follows every focus path | Yes | Yes (E1, ⌘2, removal, drag reorder) | pass |
| REQ-4 contrast-pairs minimums | Yes | Yes (`make contrast`) | pass |
| REQ-5 theme blocks transcribe the mockups | Yes | Yes (W10 diff, cycle 1) | pass |
| REQ-6 seven-step `--fs-*` ramp on bare `:root` | Yes | Yes (E10; measured 15px root again this cycle) | pass |
| REQ-7 no `font-size` literal in `style.css` | Yes | Yes (W4 check) | pass |
| REQ-8 xterm 12.5/1.65 unchanged | Yes | Yes (W8 check + empty `pane.ts` diff) | pass |
| REQ-9 `title_override` column + migration 0007 | Yes | Yes (D9 round-trip) | pass |
| REQ-10 `PUT /api/sessions/{id}/title` | Yes | Yes (D8, 9-case 400 table) | pass |
| REQ-11 wire `title` is the display title | Yes | Yes (D4, D5/INV-1; browser round-trip) | pass |
| REQ-12 status posts never touch the override | Yes | Yes (D6/INV-2, D10) | pass |
| REQ-13 rename trigger on both surfaces | Yes | Yes (E4, E11, browser) | pass |
| REQ-14 `titleCommand` commit/cancel semantics | Yes | Yes (W5, E7, **new blur-commit pin**, browser) | pass |
| REQ-15 edit isolation and mid-edit cancels | Yes | Yes (**three new view-switch pins**, browser) | **pass** (was FAIL) |
| REQ-16 rename a dead session | Yes | Yes (rename.spec REQ-16) | pass |
| REQ-17 design-system §1/§2/§5 updated | Yes | Reviewer-Verified | **pass** (was Major 1) |
| REQ-18 mockups stay the authority | Yes | Yes (W10) | pass |
| REQ-19 revert-hint tooltip | Yes | Reviewer-Verified | pass |

### Delta detail — how the two cycle-1 defects were closed

**Critical 1 (REQ-15 view-switch cancel).** `2737ab6` extracts a shared
`cancelOpenRenames()` in `web/src/main.ts` and calls it from two places, not one. The
reviewer-suggested location — inside `applyPrefsFromSnapshot`'s `if (prefs.view !== view)`
block, before the assignment — covers the ⌘\ shortcut, a reload's snapshot, and a `view`
arriving from another tab. web-impl then found live that it does **not** cover a direct
click on the masthead Focus/Tiles buttons: the browser's own `mousedown` default action
blurs the open input before the `click` listener runs, so `onBlur` commits long before the
prefs round-trip returns. A `mousedown` listener on each of the two buttons closes that
gap, because `closeEditor()` detaches the input's blur listener before the native blur
fires. That second finding is a genuine addition to the cycle-1 diagnosis, not a
restatement of it, and web-impl recorded the failing measurement that produced it.

**Major 1 (design-system px literals).** All three `10.5px` occurrences are replaced with
`--fs-xs` (11.25px), and §2's contradictory `Body / buttons` row is split into a `Body`
(`--sans`, `--fs-base`) row and a `Buttons, segmented controls` (`--mono`, `--fs-xs`) row.
I checked the new claim against the shipped stylesheet rather than accepting it: `.btn`
(`web/src/style.css:1392`) and `.seg-btn` (`:233`) both resolve to `--mono` / `--fs-xs`.
No `font-size` px literal survives anywhere in `design-system.md`; the only px values left
in the document are borders, dialog widths, and the terminal's 12.5px, which REQ-8 fixes
deliberately.

**Major 2 (missing E2E pin).** `f8ca30e` adds four tests to `web/e2e/rename.spec.ts`
covering the ⌘\ path, the masthead-click path, the mainhead mirror direction, and an
ordinary blur-commit case. Each cancel test asserts both halves of the claim: zero title
PUTs **and** that the view actually switched, so a handler that simply never ran cannot
pass. Tests 1 and 2 assert the field is focused before typing, so no test can pass
vacuously against an editor that never opened.

## Build & Tests

E2E tests: pass (242/242, full suite, 1.0m — the regression sweep, run via E1)
Daemon tests: pass (`make test`, green)
Web tests: pass (746, 26 files)
Daemon build: pass
Web build: pass
Lint: pass (`golangci-lint`, 0 issues)

The full-suite sweep found no failure in any spec, authored or pre-existing. 238 + 4 new
= 242, matching e2e-specs' claim exactly.

## Acceptance Checks

Run with `.claude/skills/orchestrate/scripts/gates.sh ui-text-and-focus --checks-only`.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make contrast` | pass |
| W4 | `! rg -n -e "font-size:\s*[0-9.]+(px\|rem\|em\|%)" web/src/style.css` | pass |
| W8 | `rg -q -e "fontSize: 12.5" web/src/terminal/pane.ts` | pass |
| E1 | `make e2e` | pass |

9 lines, 0 failed.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D4–D10 | named daemon tests present | pass | unchanged since cycle 1; no daemon file changed this cycle |
| W5–W7, W12 | named web tests present | pass | unchanged since cycle 1 |
| W8 | `pane.ts` xterm options unchanged | pass | `git diff main...plan -- web/src/terminal/pane.ts` is empty |
| W9 | 1280px masthead layout | pass | re-measured this cycle: 46px single row, 14 leaf elements spanning tops 0–15, zero clipped, no horizontal scroll |
| W10 | mockup ↔ `style.css` token equality | pass | verified cycle 1; no theme block changed since |
| W11 | design-system §1/§2/§5 text | **pass** | §1 floors, §2 token-per-role (now including the split Body/Buttons rows), §5 rail-card `current` entry at line 182; the three stale `10.5px` literals are gone and the replacements match the CSS |
| — | no `any` in new web code | pass | grepped `main.ts`, `render/rename.ts`, `sessions/rename.ts`, `e2e/rename.spec.ts`; every hit is the English word in a comment |
| — | no colour literal outside theme blocks | pass | no CSS changed this cycle; `make contrast` enforces it |
| REQ-12/INV-2 | `status.go` has no path to `TitleOverride` | pass | verified cycle 1; `status.go` unchanged since |
| REQ-8 | terminal visual size unchanged | pass | `pane.ts` untouched across the whole branch |

## Hard-Rule Checklist

The delta since cycle 1 is three files: `web/src/main.ts`, `docs/design/design-system.md`,
`web/e2e/rename.spec.ts`. Nothing in it approaches a hard rule; the full-branch results
from cycle 1 stand and were re-confirmed against the current tree.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude-Code payload field read outside `internal/claudecode` |
| 2 | Terminal-output state parsing | pass — no `capture-pane` or pane-text parsing |
| 3 | Blocking hook handler | pass — no hook path touched |
| 4 | Bare tmux / `resize-pane` | pass — no tmux invocation added; my own verification daemon used a private socket path and its server was killed |
| 5 | Payload logging | pass — `handleSetTitle` logs only `session_id` and the wrapped error |
| 6 | Empty-gauge dishonesty | pass — gauges render `unknown`; observed on screen again this cycle |
| 7 | Session identity on `session_id` | pass — `SetTitle` keys on the Muster session id |
| 8 | Settings trespass | pass — no reference to `settings.json` or `CLAUDE_CONFIG_DIR` |
| 9 | Real `claude` outside canary | pass — every test uses the harness stub, and my browser verification used the same stub script rather than the real binary |

Design-system §6 honesty rules and §7 terminal rules: pass. No gauge, cost, "Done" state or
staleness display is added or changed; the terminal is untouched; no second live client is
opened; the marker uses no state colour.

## Manual Verification

Driven in a real Chromium against a scratch daemon on 127.0.0.1:18921, with the same
stub `claude` script the E2E harness writes, a private tmux socket, and two sessions
launched through the real `POST /api/sessions`. A `fetch` interceptor recorded every
`PUT /api/sessions/{id}/title`. Every value below is observed, not inferred from the
diff. The daemon and its tmux server were killed afterward and `tmux ls` reports no
server; `git status` is clean.

**Cycle-1 Critical repro, mouse path.** In Tiles, opened tile 1's rename field
(`data-editing="true"`, `.thead` `draggable="false"`, input focused), typed
`CLICK PATH SHOULD NOT COMMIT`, then clicked the masthead **Focus** button. Result: zero
title PUTs recorded, the view did switch (`aria-pressed="true"` on Focus), and
`GET /api/state` still returns `title: "review-alpha"`, `titleOverride: null`. In cycle 1
this exact sequence sent a PUT and persisted the override.

**Cycle-1 Critical repro, keyboard path.** In Focus, opened the mainhead field, typed
`CMD BACKSLASH SHOULD NOT COMMIT`, pressed ⌘\. Result: zero title PUTs, the view switched
to Tiles, the editing marker was cleared, and the heading and state still read
`review-alpha` with `titleOverride: null`.

**REQ-14 not over-corrected.** Opened the mainhead field, typed `renamed by review`,
clicked **New session** (a control with no cancel guard). Result: exactly one PUT with
body `{"title":"renamed by review"}`, and `GET /api/state` returns
`title: "renamed by review"`, `titleOverride: "renamed by review"` — INV-1 holds, and the
heading updated from the broadcast rather than a local write.

**Marker and W9.** At 1280×800 in Focus: rail card 1 carries `aria-current="true"` and
class `card s-start current`; card 2 carries neither. Root font size 15px. The masthead is
one 46px row, its 14 text-bearing leaves span tops 0–15, no element's `scrollWidth`
exceeds its client width, and the document does not scroll horizontally.

**The Minor below was found by measurement here**, not by reading: with the mainhead
field open and `active-segment-click` typed, clicking the **Focus** button while already
in Focus produced zero PUTs, cleared the editor, and left the title unchanged — the typed
text was discarded silently.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** Clicking the view segment that is **already active** now discards an
   open rename instead of committing it. The `mousedown` guard on `viewFocusBtn` /
   `viewTilesBtn` (`web/src/main.ts:884-885`) calls `cancelOpenRenames()` unconditionally,
   but neither button is disabled when its view is current, so the guard fires on a click
   that switches nothing. Measured: in Focus, with `active-segment-click` typed into the
   mainhead field, clicking **Focus** produced zero PUTs and dropped the text. REQ-15
   governs a *view switch*; this gesture is not one, so REQ-14's blur-commit should apply.
   The gesture is degenerate and the loss is one uncommitted field, which is why this is
   Minor and not a blocker — but it is a regression the cycle-1 fix introduced, so it is
   worth a line rather than silence.
   **Fix**: guard each listener by the view it would select, e.g.
   `viewFocusBtn.addEventListener("mousedown", () => { if (view !== "focus") cancelOpenRenames(); })`
   and the mirror for Tiles. `view` already mirrors the daemon's prefs, so the test is
   accurate at mousedown time. The same guard also stops a right- or middle-click on the
   switcher from cancelling an edit.

2. **[orchestrator]** `SPEC.md:1213` and `TODO.md` lines 664, 698, 708 and 717 all say
   this plan was "approved review cycle 1". It was approved at cycle 2. Correct the cycle
   number in all five places. Carried from cycle 1 as agreed; not a blocker.

### Notes

1. **[note]** In the usage **data** state (gauge bars plus `· resets Thu` labels), the
   masthead is two rows at 1280px. This is pre-existing: with identical DOM and content
   and only the stylesheet swapped, the branch measures 63px and `main` 60px, and neither
   overflows horizontally. W9's stated scenario (two sessions, fresh load, gauges
   `unknown`) is a single 46px row. The plan's edge case 20 named this as a risk; the
   measurement says the ramp did not cause it. Worth knowing before anyone widens the
   masthead's content again.

2. **[note]** `attachRenameEditor`'s `setEnabled` is never called for the mainhead's own
   instance — `renderMainhead` sets `renameBtn.disabled` directly, matching its three
   sibling buttons. `web-implementation.md` records this deliberately. The method is
   exercised by every tile, so it is not dead code.

3. **[note]** The rename trigger is visually indistinguishable from static text (no
   border, no underline, `cursor: text`, discoverable only by the tooltip). That is what
   design-system §5 and REQ-13 specify, so it is not a defect — but it is the plan's one
   deliberate discoverability trade-off and worth revisiting if Damian finds the
   affordance invisible in daily use.

## Test Quality

The fix wave's `## Repairs` entry claims "None — no existing assertion was touched,
narrowed, or rewritten this wave." Verified: `git diff 8f013b2..HEAD -- web/e2e/rename.spec.ts`
has **zero** deletion lines, so the 168 added lines are all new test bodies. No
`test.skip`, `test.fixme` or `.only` exists anywhere under `web/e2e` or `web/src`, and no
fixture payload changed — the new tests synthesize nothing, they drive the real UI and
read `GET /api/state`, the oracle the rest of the file already uses.

The absence assertions are the risky kind (a test that asserts nothing happened passes
trivially if nothing ran at all), so I checked them three ways. They each pair the "zero
PUTs" assertion with proof the handler ran (`aria-pressed="true"` moved) and with a state
read, not just a DOM read. e2e-specs recorded a mutation check — the fix disabled, three
tests red, the unrelated mid-edit-status test still green — and confirmed a clean restore
by comparing the rebuilt bundle hash. And my own live browser run reproduced the same
behaviour independently, against the behaviour cycle 1 measured as broken, so the pins
describe a real change and not a tautology.

The fourth test earns its place separately: it asserts the *opposite* outcome on an
unguarded control, which is the only thing standing between a future over-broad
`cancelOpenRenames()` and a silent REQ-14 regression. That the same test would not have
caught the Minor above (it uses "New session", not the active view segment) is the reason
the Minor is written with a concrete locator rather than left as a remark.

The only main.ts deletion in this cycle is the three-line disconnect branch being replaced
by a call to the extracted helper under the identical `status !== "connected"` guard —
behaviour-preserving, and `setStatus`'s cancel-on-disconnect is unchanged.
