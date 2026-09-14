# Review: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=markdown-viewing role=review features=reader,surfaces,lifecycle,ingest -->`

Cycle 3, full re-review (cycle 2 closed with agent-tagged Critical/Major issues).

**Both of cycle 2's findings are genuinely fixed, and I verified each by measuring rather than
by reading the diff or trusting the log.** The nav's tree and outline are now independently
scrollable and their last rows are reachable in the full Focus pane, in a 2×2 tile, in a 3×2
tile and on `/doc.html`; and the `.docbar` order is `basename, path, cue, pop out` in **all
six** present/absent transitions of `.path`/`.chg` I drove, including the Tiles→Focus return
leg that was broken. Cycle 2's fixes introduced no regression in the areas I could measure —
scroll position survives the once-a-second tick, survives a body scroll that moves
`aria-current`, and re-clamps (rather than resetting) when the outline shrinks; the filter
still narrows and restores correctly from a scrolled tree.

Every gate is green: **336/336** E2E (full suite, clean rebuild), `make test`, `make lint`,
`make web-build`, `make web-test`, `make web-lint`, `make contrast`, `make check-kb`,
`make refs`, `make e2e-lint`, and all **14** authored acceptance checks via
`gates.sh --checks-only` (14 lines, 0 failed).

Two new blocking findings, neither caused by this cycle's diff, both user-visible and both
with **no measurement anywhere in the suite pinning them** — which is why three green cycles
have passed over them:

1. **Critical 1 `[web-impl]`** — `/doc.html` has **no host sizing rule at all** (`#reader-host`
   / `.reader-host` appears in `doc.html` and `doc.ts` but in no CSS rule), so the reader grid
   grows to its content instead of filling the viewport. Measured with a 30-heading document:
   the page is 2559px tall in a 720px viewport, `article.md` never scrolls
   (`scrollHeight === clientHeight`), and therefore **REQ-14 is dead on the pop-out** — the
   scroll-spy's `aria-current` stays on the first heading after scrolling the window past
   fourteen of them, and clicking an outline entry leaves the body where it was and lands the
   target heading 513px below the viewport. The `.docbar` (name, path, freshness cue) scrolls
   off the top while reading.
2. **Major 1 `[web-impl]`** — every tree and outline button is destroyed and rebuilt whenever
   `aria-current` or a changed dot moves, so **keyboard-activating any of them drops focus to
   `<body>`**. Measured with real key presses: Enter on an outline entry, on a tree file and on
   a folder toggle each leaves `document.activeElement` at `BODY`. This is
   kb:lesson/select-rebuilt-every-tick-passed-selectoption's exact pattern ("an interactive node
   persists across render passes and is rebuilt only when its option set genuinely changes"),
   on a feature whose entire nav is keyboard-operable buttons.

The daemon is untouched since cycle 1 (`git diff 5353cad..HEAD` names no file under `internal/`
or `cmd/`): its cycle-1 verification stands and every daemon gate was re-run green here.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `docs` segment, built once | Yes | E1, W4 | pass |
| REQ-2 selecting `docs` mounts the reader only there | Yes | E1, E2 | pass |
| REQ-3 works on a dead session, plan slot absent | Yes | E22 | pass |
| REQ-4 bar: badge, basename, absolute path, cue, pop out, arrow | Yes | E3, E18, live-compact | **pass** — cycle-2 Major 1 fixed; I measured the order in six states (below) |
| REQ-5 GFM body on `--well` with `--disp`/`--sans`/`--mono` | Yes | E15 | pass |
| REQ-6 whole file; >10 MiB is 413 | Yes | D12, E26 | pass |
| REQ-7 last open file remembered per session | Yes | E3, E19, W7 | pass |
| REQ-8 `pop out ↗` to `/doc.html` carrying bar, body, nav | Partial | E21 | **fail** — Critical 1 (the bar scrolls out of view; the page does not fill the viewport) |
| REQ-9 plan slot pinned, `no plan yet` | Yes | E3, E4 | pass |
| REQ-10 file tree, folders collapsed with counts | Yes | E6, W5, nav-placement | **pass** — cycle-2 Critical 1 fixed; last row reachable in all four hosts |
| REQ-11 filter narrows + expands ancestors | Yes | E7, W6 | pass — re-measured from a scrolled tree |
| REQ-12 `aria-current` on the open file | Yes | E8 | pass |
| REQ-13 changed dot until opened | Yes | E9, W7 | pass |
| REQ-14 outline, scroll-spy, independent folds | Partial | E17, E18 | **fail** — Critical 1 (scroll-spy and click-to-scroll are both inert on `/doc.html`) |
| REQ-15 compact in a tile; nav collapsed at 3×2 | Yes | E27 + live-compact | pass |
| REQ-16 transcript kept + bounded scan triggers | Yes | D5, D6, D9, E5 | pass |
| REQ-17 `session.plan` additive | Yes | W10, D14 | pass |
| REQ-18 `docChanged` on routed Write/Edit/MultiEdit | Yes | D13, D16, E9, E10 | pass |
| REQ-19 re-fetch on mount / window focus | Yes | E12, E13 | pass |
| REQ-20 two GETs, confinement, no writes | Yes | D10, D11, D17, E20 | pass |
| REQ-21 Claude-format knowledge stays in `internal/claudecode` | Yes | D4 | pass |
| REQ-22 marked 18.0.13 + DOMPurify 3.4.15, fragment only | Yes | W12, W13, E16 | pass |
| REQ-23 ADR records the renderer choice + alternatives | Yes | — | pass |
| REQ-24 no cue element until a write is seen | Yes | E11 | pass |
| REQ-25 walk cap 20,000 + `truncated` | Yes | D8 | pass |
| REQ-26 straggler never moves transcript/plan | Yes | D20, E29 | pass |
| REQ-27 pop-out shares component, socket, memory | Partial | E21 | **fail** — shares the component, but the unbounded host makes the shared component behave differently there (Critical 1) |
| REQ-28 deleted file keeps last render | Yes | E25 | pass |

## Build & Tests

E2E tests: **pass** (336/336, `make e2e` from a clean rebuild, exit 0; 34 tests in `reader.spec.ts`; no skips anywhere under `web/e2e` or `web/src`)
Daemon tests: **pass** (`make test`)
Web tests: **pass** (`make web-test`, Vitest)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`make lint`, `make web-lint`, `make e2e-lint` — "e2e-lint: clean")
Knowledge: **pass** (`make check-kb` — 343 records, 23 features, 0 problems; `make refs` — 2547 references, 0 missing)

## Acceptance Checks

Run verbatim via `.claude/skills/orchestrate/scripts/gates.sh markdown-viewing --checks-only`
— **14 lines, 0 failed**.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | boundary grep (no Claude-format keys outside `internal/claudecode/`) | pass |
| D5 | `go test ./internal/claudecode -run TestLocatePlanFile` | pass |
| D6 | `go test ./internal/claudecode -run TestInterpretFiles` | pass |
| D17 | no mutating route under `/api/sessions/{id}/reader` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make web-lint` | pass (2e3c244's formatting fix holds) |
| W11 | `make contrast` | pass |
| W12 | `marked` pinned to 18.0.13 | pass |
| W13 | `dompurify` pinned to 3.4.15 | pass |
| E1 | `make e2e` | pass (336/336) |
| DOC | doc upkeep | pass — unchanged since cycle 1 (feature globs, fact `guard`/`files`, `SPEC.md` § 3.1, protocol anchors, generated files fresh). The `TODO.md` tick+move and the seven `proposed`→`accepted` ADR flips remain Completion-step work by design. |
| KB | `make check-kb` | pass |

No `deviation:` line exists in any `## Decisions` log, and the plan's seven `proposed` ADRs are
all present with `refs: [plan:markdown-viewing]`. This cycle's two changes (scrollable nav
sections; a conditional insertion anchor) are CSS/DOM implementation details with no REQ, wire
or DOM-contract consequence, so neither needs an ADR.

## Reviewer-Verified Criteria

Only criteria this cycle's diff could move are re-verified from scratch; the rest stand from
cycles 1–2 and their gates were all re-run green.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W14 | no `any` in new web code | pass | `git diff cf9b64d..HEAD -- web/src web/e2e` added lines grepped for `: any` / `as any` / `any[]` / `<any>` — none |
| W18 | new CSS references tokens only | pass | this cycle's `style.css` diff adds only `overflow-y`/`overflow-x` and a comment — no colour, font or spacing literal; `make contrast` green |
| W19 | `doc.html` carries the same theme-hint script | pass | unchanged; read in `web/doc.html:8-21` |
| W4–W10 | unit cases assert what the prose says | pass | unchanged this cycle; `make web-test` green |
| W15 | sanitized markdown only via a DOMPurify fragment | pass | unchanged; `innerHTML` appears nowhere under `web/src` |
| W16 | `ReaderInstance` built/disposed only in `features/reader.ts` | pass | unchanged; `render/reader.ts` still takes refs + view-model only, no fetch, no socket |
| W17 | `sessionRemoved` disposes the reader; daemon drops its write log | pass | unchanged this cycle |
| D7–D16, D18–D20 | named Go tests assert the prose | pass | no Go file changed since cycle 1 (`git diff 5353cad..HEAD` touches no `internal/` or `cmd/` path); `make test` green |
| E2–E29 | Playwright tests assert the prose | pass, with the gap named in Major 2 | full suite green; both of this cycle's additions read end to end and were proven load-bearing by deliberate reversion (below) |
| REQ-23 | the ADR records the alternatives | pass | unchanged |

### Repairs table (`test-specs.md`)

Cycle 3 adds rows 3 and 4 and labels them correctly as **coverage additions, not repairs** —
both tests were green before and after; they simply could not see cycle 2's two defects. I
verified the last column by reading the diff: every prior assertion in both tests is intact
(`barPath`, `fileCount`, class toggling, the outer-box geometry checks in Focus and in a tile);
the additions are strictly new assertions. No `test.skip` / `test.fixme` / `.only(` anywhere
under `web/e2e` or `web/src`. The two cycle-1 repairs are unchanged and still locator-only.

The "proof both additions are load-bearing" record (reverting 7d69d8e, rebuilding, watching
`expect(overflowY).toBe("auto")` receive `"hidden"` and `.path ~ .chg` receive count 0, then
restoring) is the right discipline and matches what the assertions actually test. No flake
repair exists in this plan, so no `e2e-soak` was required.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4's grep green; no Go file changed since cycle 1 |
| 2 | No terminal-output state parsing | pass — the only `capture-pane` mention under `web/src` is `api.ts:335`'s display-source comment |
| 3 | No blocking hook handler | pass — no ingest/hook code changed |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — no tmux invocation in the diff |
| 5 | No payload logging | pass — no log site added or changed |
| 6 | No empty-gauge dishonesty | pass — the cue element is absent (not hidden) before any write; `.n` absent before the listing and in compact; plan slot reads `no plan yet` |
| 7 | Identity on the tmux target | pass — unchanged |
| 8 | No settings trespass | pass — unchanged |
| 9 | No real `claude` outside canary | pass — the specs synthesize hooks only; my throwaway verification specs did the same |

### Design-system compliance

- **Tokens** — this cycle's CSS is two overflow declarations and a comment; no literal of any
  kind. `make contrast` green.
- **No web fonts** — none added.
- **State colour** — the reader still uses no `--amber` / `--rose` / `--violet` / `--teal`.
- **Tabular numerics** — `.docbar .chg`, `.rnav .hd .n`, `.rnav .f .cnt` unchanged.
- **`[hidden]` companions** — swept all nine `.hidden =` sites in `render/reader.ts`
  (`popOut`, `planLabel`, `planSlot`, `notice`, `nav`, `collapsedArrow`, `filter`, `tree`,
  `outline`); each has its `[hidden] { display: none; }` rule in `style.css`, including
  `.rnav .tree[hidden], .rnav .outline[hidden]` at 1163-1164, which the newly-scrollable
  sections still depend on for the fold.
- **§6 honesty** — no gauge, no percentage, no cost display; the freshness cue is absent
  rather than `unknown`-shaped when no write was seen. Clean.
- **§7 terminals** — `docs` still never has a `TerminalSurface`; nothing this cycle touches
  geometry, `resize-pane` or xterm.js.

## Manual Verification

Drove the real dashboard and the real pop-out page in Chromium against scratch `musterd`
instances (six throwaway specs using the committed E2E helpers, run and then deleted —
`git status` shows nothing left under `web/e2e/`, and `web/test-results` was removed).
Everything below is a measured number off the live DOM; the fixture is 20 top-level `.md`
files plus a 30-heading file, except where noted.

**Cycle-2 Critical 1 (nav content unreachable) — fixed, in all four hosts.** Each section's own
`overflow-y` is `auto`; reachability measured by scrolling *the owning element* to its own
`scrollHeight`:

```
FOCUS     tree    scrollHeight 441 clientHeight 175   outline 651 / 258
          after scroll: file-20.md bottom 424    <= tree bottom 423.86 (+1)     reachable
          after scroll: "Section 30" bottom 719.86 <= outline bottom 720        reachable
TILE 2×2  tree    441→315 / clientHeight 20          outline 651 / 41
          after scroll: last row bottom 294 <= tree bottom 294.05               reachable
          after scroll: "Section 30" bottom 373.05 <= outline bottom 373.5      reachable
TILE 3×2  identical to 2×2 (nav re-opened via "Show files")                     reachable
/doc.html tree    441 / 441  (does not clip — the page itself grows, see Critical 1)
          "Section 30" and file-20.md both reachable, by scrolling the window
```

**No regression from the fix.** Measured on the same instance:

```
tick persistence   tree.scrollTop 266 / outline.scrollTop 393 → unchanged after 3.5 s of ticks
body scroll        outline.scrollTop 393 unchanged while aria-current moved to "Section 15"
                   (replaceChildren is one operation, so no intermediate clamp to 0)
outline click      past-the-fold entry clicked at scrollTop 393: stays 393, entry still in view
tree click         scrollTop re-clamps 266 → 28 because the outline shrank and the tree grew
                   (441 - 413 = 28); the opened row stays in view — a clamp, not a reset
filter mid-scroll  from a bottom-scrolled tree, "file-1" → 10 rows, fits (210/210), first row
                   at the container top; clearing restores 21 rows, 441/413
```

**Cycle-2 Major 1 (`.path` after `.chg`) — fixed, verified across every combination**, not just
the broken one. `.docbar` child order read off the live DOM at each step:

```
A  path+ chg-  Focus, file open, no write yet   ["fname","path","ib","arr[h]"]
B  path+ chg+  after a routed PostToolUse Write ["fname","path","chg","ib","arr[h]"]
C  path- chg+  Tiles (compact)                  ["fname","chg","ib","arr[h]"]
D  path+ chg+  back in Focus (the broken case)  ["fname","path","chg","ib","arr[h]"]   ✓ fixed
E  path- chg-  a second session mounted compact ["fname","ib","arr[h]"]
F  path- chg+  that session after a Write       ["fname","chg","ib","arr[h]"]
innerText at B and D: "TODO.md  /var/.../TODO.md  changed now  pop out ↗"   ← REQ-4 order
pop-out page:  ["fname","path","ib[h]","arr[h]"]                            ← link hidden (REQ-27)
```

**New Critical 1 — `/doc.html` is not viewport-bounded.** Same 30-heading document, 1280×720:

```
window.innerHeight 720
#reader-host   scrollHeight 2559  clientHeight 2559   (no CSS rule exists for it at all)
section.reader scrollHeight 2559  clientHeight 2559   overflow visible
article.md     scrollHeight 2511  clientHeight 2511   → never scrolls
document       scrollHeight 2559  clientHeight  720   → the WINDOW is the only scroller
aria-current after window.scrollTo(0, 1200): "Outline"   (same file in Focus: "Section 15")
outline click "Section 25": article.md.scrollTop 0 → 0; heading top ends at 1233 (viewport 720)
after window.scrollTo(0, 1500): .docbar top -1500 — the bar, path and cue are off-screen
```

**New Major 1 — focus is destroyed by every nav activation.** Real key presses, not clicks:

```
outline entry "Section 5" focused → Enter → document.activeElement = BODY
tree file "file-03.md"    focused → Enter → document.activeElement = BODY   (file opens)
folder "docs/"            focused → Enter → document.activeElement = BODY   (folder expands)
filter box: keeps focus across typing and the re-render (it is a persistent node) ✓
```

Not verified: real Claude Code behaviour (fixtures only, by design), and the plans-directory
override (plan edge case 18, already recorded as unobservable on this machine).

## Issues

### Critical

1. **[web-impl]** `/doc.html` never bounds the reader to the viewport, and REQ-14 is inert
   there as a result. `web/doc.html:25` renders `<div id="reader-host" class="reader-host">`,
   and **neither selector has any rule in `web/src/style.css`** (`rg "reader-host" web/src` →
   only `doc.ts:5`'s comment and `doc.ts:21`'s lookup). `#reader-host` is therefore an
   auto-height block; `.reader`'s `flex: 1` (`style.css:694`) has no flex parent to act in, and
   its `grid-template-rows: auto auto 1fr` (`style.css:697`) resolves `1fr` against an
   indefinite height — so the grid grows to its content and `article.md`'s `overflow: auto`
   (`style.css:816`) never engages.
   Measured on the live pop-out with a 30-heading document (numbers above): the page is 2559px
   tall in a 720px viewport, `article.md` has `scrollHeight === clientHeight`, and so
   - **REQ-14 scroll-spy is dead**: `attachScrollSpy` listens on the `.md` container's `scroll`
     event (`render/reader.ts:358`), which never fires. After `window.scrollTo(0, 1200)` — past
     fourteen headings — `aria-current` is still on the first heading, `"Outline"`. The same
     file in the Focus host reports `"Section 15"`.
   - **REQ-14 click-to-scroll is dead**: `scrollHeadingIntoView` does `container.scrollTop +=
     delta` (`render/reader.ts:367`) on a non-scrollable element — a no-op. Clicking
     `"Section 25"` leaves `md.scrollTop` at 0; the window moves only because the clicked button
     takes focus, and the target heading ends up at y=1233, 513px below the viewport.
   - The plan's UI Specification for this view ("**Pop-out** (`/doc.html`) — the reader alone,
     **filling the viewport**") and REQ-8's "a second page carrying the full reader (bar, body,
     nav)" are both false: the `.docbar` — name, absolute path, freshness cue — scrolls off the
     top as soon as the reader scrolls (`.docbar` top measured at -1500).
   Not introduced this cycle; cycle 1 and cycle 2 both measured `#reader-host`'s box on a
   *short* document (h:307), where an unbounded host looks merely small rather than broken.
   Fix: give the pop-out host a definite height so the shared component's own scrolling
   engages — e.g. `.reader-host { display: flex; height: 100%; min-height: 0; }` in
   `style.css` (`html, body { height: 100% }` is already there, `style.css:187-190`), which is
   presumably what the unused `reader-host` class was put on the div for. Verify by
   measurement, not by a locator: on `/doc.html` with a document taller than the viewport,
   `article.md.scrollHeight > article.md.clientHeight`, `document.documentElement.scrollHeight
   === clientHeight`, the `.docbar` stays at a fixed top after scrolling the body, and
   scrolling `article.md` moves `aria-current` off the first heading.

### Major

1. **[web-impl]** Every tree and outline button is rebuilt whenever `aria-current` or a changed
   dot moves, so activating one by keyboard drops focus to `<body>`.
   `web/src/render/reader.ts:250-255` (`renderTree`) and `:268-273` (`renderOutline`) both key
   their memo on `JSON.stringify(entries)`, and `FlatTreeEntry.current` / `OutlineEntryVM.current`
   are part of those entries — so opening a file, expanding a folder, or merely scrolling the
   body past a heading replaces every button in the section, including the focused one.
   Measured with real key presses (above): Enter on an outline entry, on a tree file and on a
   folder toggle each leaves `document.activeElement` at `BODY`; a keyboard user must re-Tab
   from the document start after every single activation, which makes the nav effectively
   mouse-only.
   This is kb:lesson/select-rebuilt-every-tick-passed-selectoption's settled rule — "an
   interactive node persists across render passes and is rebuilt only when its option set
   genuinely changes" — applied to the wrong key: `current` and `dirty` are attribute-level
   state, not the option set. The module's own header comment claims the tick "never steals
   focus from a tree/outline button"; that is true of the *tick* and false of every activation.
   Fix: move `current`/`dirty` out of the rebuild key and apply them to the existing nodes
   (`setAttribute("aria-current")` / add-remove `span.dot`), rebuilding only when the row set,
   names, depths or expansion actually change — or, failing that, restore focus to the
   equivalent rebuilt node. Verify the lesson's way: focus a tree button and an outline button,
   press Enter, wait past a tick, and assert `document.activeElement` is still that control.

2. **[e2e-specs]** No spec measures either finding, on any host, which is how both survived
   three green cycles. Two additions once the fixes land (the plan's own Reviewer-Verified list
   cannot carry them — they need a live page):
   - *Pop-out* (`web/e2e/reader.spec.ts`, E21) asserts content and re-render on `/doc.html` but
     nothing about its layout. Add, on a document taller than the viewport: `article.md` is the
     scroller (`scrollHeight > clientHeight`) while the document is not
     (`documentElement.scrollHeight === documentElement.clientHeight`), the `.docbar`'s
     `boundingBox().y` is unchanged after scrolling `article.md`, and scrolling `article.md`
     moves `aria-current` off the first outline entry. `buildLargeMarkdownFixtureTree` already
     produces a suitable file; note the pop-out URL must be reached through the `pop out ↗` link
     (a hand-built `/doc.html?...` URL drops the dashboard token and lands on "Muster is not
     running here" — I hit this).
   - *Keyboard*: no reader spec uses focus + keys anywhere; E8/E17/E18 all use `click()`, which
     cannot see Major 1. Add one spec that focuses a tree file button and an outline entry,
     activates each with `Enter`, waits past a render tick, and asserts `document.activeElement`
     is still that button — the shape kb:lesson/select-rebuilt-every-tick-passed-selectoption
     already mandates for interactive controls.

### Minor

None.

### Notes

1. **[orchestrator:decision]** The nav's vertical space is split between the tree and the
   outline by plain proportional flex-shrink, which in a tile produces a one-row file tree.
   Measured in a 2×2 tile with a 30-heading file open: `.tree` `clientHeight` **20px** against
   `scrollHeight` 315 (21 rows), `.outline` 41px against 651 (31 rows). Both are reachable by
   scrolling — this is not Critical 1 returning — but a 1-row tree is a poor compact reader, and
   any plan or ADR opened in a tile has 30+ headings. It is also unchanged by this cycle's fix
   (the same 20px was allocated before, just clipped instead of scrollable), and the mockups are
   static single-screen renders that settle neither. Because the answer is a density judgement
   rather than a defect, it is not mine to assign:
   - **Option A — leave as measured**: proportional shrink, no floor. Zero further change; a 2×2
     tile reader shows one file row and two outline rows at a time when a long file is open.
   - **Option B — floor each section**: e.g. `min-height` of ~3 rows on `.rnav .tree` and
     `.rnav .outline` (with the nav's own `overflow: hidden auto` picking up the remainder), so
     each section always shows a usable window. Costs one CSS rule plus a re-measure of the
     tile hosts; risks the nav itself scrolling in a 3×2 tile, which the chosen model avoids.
2. **[note]** With a *short* outline and a long tree in the full Focus pane, the outline's single
   row is clipped by exactly 1px (`scrollHeight 21` vs `clientHeight 20`) and gains a scrollbar
   it does not need. Cosmetic, sub-pixel, and Option B above would incidentally remove it — no
   change requested on its own.
3. **[note]** My hypothesis that the signature-memo rebuild would reset the nav's scroll position
   (now that it has one) is **disproved by measurement**: `replaceChildren` is a single
   operation, so no intermediate layout clamps `scrollTop` to 0. The tree's 266→28 change on
   opening a file is a legitimate re-clamp — the outline shrank, the tree grew to 413px, and
   `441 - 413 = 28` is the new maximum scroll. Recording it so the next cycle does not re-derive
   it.
4. **[note]** Cycle-1 Notes 1–7 and cycle-2 Notes 1–4 (the `LocatePlanFile(…, home)` signature,
   `reader/CLAUDE.md`'s heading, the declined Vitest coverage of `markdown.ts`, `maybeAutoOpenPlan`,
   `walkMarkdown`'s no-op branch, `ReaderMemory.clearedAt` growth, `too_large` naming the resolved
   path, E10 no longer being the grammar guard, the `agoSuffix` refactor, and the explicit
   `grid-row`/`grid-column` placement) all still stand unchanged and still need no action.
5. **[orchestrator]** Completion still owes the `TODO.md` § Pre-v1 Cleanup tick + move to
   `docs/history/todo-done.md` and the seven `proposed`→`accepted` ADR flips — Completion-step
   work by design (plan § Doc upkeep), not a gap in this cycle.
