# Review: Markdown viewing

**Plan**: markdown-viewing
**Verdict**: needs-changes
**Pack**: `<!-- kb:pack plan=markdown-viewing role=review features=reader,surfaces,lifecycle,ingest -->`

Cycle 2, full re-review (cycle 1 closed with agent-tagged Critical/Major issues). All four
of cycle 1's agent-tagged findings are genuinely fixed and I verified each by measuring in
a browser, not by reading the diff: the nav is now a right-hand column bounded by its host
in Focus, in a 2×2 tile, in a 3×2 tile and on `/doc.html`; `compact` tracks the current host
across a Focus↔Tiles round trip; the cue reads `changed now`; and `.path` does come back
after a compact round trip.

Every gate is green — 336/336 E2E (the full suite, including the two new tests), `make test`,
`make lint`, `make web-build`, `make web-test`, `make web-lint`, `make contrast`,
`make check-kb`, `make refs`, `make e2e-lint`, and all 14 authored acceptance checks.

Two new blocking findings, both in the layout the Critical-1 fix touched, both invisible to
the suite for the same reason cycle 1's were — **no spec measures the nav's internal
reachability, and no spec carries a freshness cue through the compact round trip**:

1. **Critical 1** — bounding the nav's height (which is what the fix did, correctly) exposed
   `.rnav .tree` / `.rnav .outline { overflow: hidden }`. Both are flex items that now shrink
   and clip, and neither they nor `.rnav` scroll. Measured in the **full Focus pane** with 14
   top-level `.md` files: 6 of them are unreachable, and `Section 24` of a 25-heading outline
   sits 264px below the outline's own clipped bottom with no scrollbar anywhere. REQ-10 and
   REQ-14 render a list the user cannot reach.
2. **Major 1** — `renderBar`'s `.path` re-insert anchor was moved to `.ib` (c9e3c52), which
   fixes the never-reappears bug but puts `.path` **after** `.chg` when a cue is present.
   Measured bar after Focus→Tiles→Focus with a real write hook:
   `TODO.md / changed now / /var/.../TODO.md / pop out ↗` — REQ-4's stated left-to-right order
   is `basename, path, cue, pop out`.

The daemon is untouched this cycle (`git diff 5353cad..HEAD` names no file under `internal/`
or `cmd/`); its cycle-1 verification stands and every daemon gate was re-run green.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `docs` segment, built once | Yes | E1, W4 | pass |
| REQ-2 selecting `docs` mounts the reader only there | Yes | E1, E2 | pass |
| REQ-3 works on a dead session, plan slot absent | Yes | E22 | pass |
| REQ-4 bar: badge, basename, absolute path, cue, pop out, arrow | Partial | E3, E18 | **fail** — Major 1 (order after a compact round trip) |
| REQ-5 GFM body on `--well` with `--disp`/`--sans`/`--mono` | Yes | E15 | pass |
| REQ-6 whole file; >10 MiB is 413 | Yes | D12, E26 | pass |
| REQ-7 last open file remembered per session | Yes | E3, E19, W7 | pass |
| REQ-8 `pop out ↗` to `/doc.html` | Yes | E21 | pass |
| REQ-9 plan slot pinned, `no plan yet` | Yes | E3, E4 | pass |
| REQ-10 file tree, folders collapsed with counts | Partial | E6, W5 | **fail** — Critical 1 (entries past the fold unreachable) |
| REQ-11 filter narrows + expands ancestors | Yes | E7, W6 | pass (same clipping applies to a long match list) |
| REQ-12 `aria-current` on the open file | Yes | E8 | pass |
| REQ-13 changed dot until opened | Yes | E9, W7 | pass |
| REQ-14 outline, scroll-spy, independent folds | Partial | E17, E18 | **fail** — Critical 1 (outline entries past the fold unreachable) |
| REQ-15 compact in a tile; nav collapsed at 3×2 | Yes | E27 + new live-compact test | pass — cycle-1 Major 1 fixed and now measured both directions |
| REQ-16 transcript kept + bounded scan triggers | Yes | D5, D6, D9, E5 | pass |
| REQ-17 `session.plan` additive | Yes | W10, D14 | pass |
| REQ-18 `docChanged` on routed Write/Edit/MultiEdit | Yes | D13, D16, E9, E10 | pass |
| REQ-19 re-fetch on mount / window focus | Yes | E12, E13 | pass |
| REQ-20 two GETs, confinement, no writes | Yes | D10, D11, D17, E20 | pass |
| REQ-21 Claude-format knowledge stays in `internal/claudecode` | Yes | D4 | pass |
| REQ-22 marked 18.0.13 + DOMPurify 3.4.15, fragment only | Yes | W12, W13, E16 | pass |
| REQ-23 ADR records the renderer choice + alternatives | Yes | — | pass |
| REQ-24 no cue element until a write is seen | Yes | E11 | pass (re-measured by hand: count 0) |
| REQ-25 walk cap 20,000 + `truncated` | Yes | D8 | pass |
| REQ-26 straggler never moves transcript/plan | Yes | D20, E29 | pass |
| REQ-27 pop-out shares component, socket, memory | Yes | E21 | pass |
| REQ-28 deleted file keeps last render | Yes | E25 | pass |

## Build & Tests

E2E tests: **pass** (336/336, `make e2e` from a clean rebuild, exit 0; no skips anywhere under `web/e2e` or `web/src`)
Daemon tests: **pass** (`make test`)
Web tests: **pass** (`make web-test`, Vitest)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`make lint`, `make web-lint`, `make e2e-lint` — "e2e-lint: clean")
Knowledge: **pass** (`make check-kb` — 343 records, 0 problems; `make refs` / `dead-refs --all` — 2547 references, 0 missing)

## Acceptance Checks

Run verbatim via `.claude/skills/orchestrate/scripts/gates.sh markdown-viewing --checks-only`
— 14 lines, 0 failed.

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
| W3 | `make web-lint` | pass |
| W11 | `make contrast` | pass |
| W12 | `marked` pinned to 18.0.13 | pass |
| W13 | `dompurify` pinned to 3.4.15 | pass |
| E1 | `make e2e` | pass (336/336) |
| DOC | doc upkeep | pass — unchanged from cycle 1 (feature globs, fact `guard`/`files`, SPEC.md § 3.1, protocol anchors, generated files fresh). The `TODO.md` tick+move and the seven `proposed`→`accepted` ADR flips remain Completion-step work by design. |
| KB | `make check-kb` | pass |

No `deviation:` line exists in any `## Decisions` log, and `kb ls --status proposed` shows
exactly the seven ADRs the plan named, all `refs: [plan:markdown-viewing]`. The Critical-1
fix took the CSS-grid option over the wrapper option, leaving the plan's DOM sketch and every
E2E locator intact — a CSS implementation detail with no REQ, wire or DOM consequence, so it
needs no ADR.

## Reviewer-Verified Criteria

Only the criteria this cycle's diff could move are re-verified; the rest stand from cycle 1
(`review.cycle1.md`) and their gates were all re-run green.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | `changedText` renders the age copy | pass | `freshness.test.ts` now asserts `"changed now"` **and** `.not.toContain("now ago")` for the sub-minute bucket, and per-bucket that every other bucket ends in ` ago` — strengthened, not weakened |
| W4–W8, W10 | unit cases assert what the prose says | pass | unchanged this cycle; `make web-test` green |
| W14 | no `any` in new web code | pass | `git diff 5353cad..HEAD -- web/src` added lines grepped for `: any`/`as any`/`any[]`/`<any>` — none |
| W15 | sanitized markdown only via a DOMPurify fragment | pass | unchanged this cycle |
| W16 | `ReaderInstance` built/disposed only in `features/reader.ts` | pass | still one `new ReaderInstance`, inside `newInstance`; `render/reader.ts` still takes refs + view-model only |
| W17 | `sessionRemoved` disposes the reader; daemon drops the write log | pass | unchanged this cycle |
| W18 | new CSS is tokens only | pass | the style.css diff adds `display/grid-*/min-width` only — no colour, font or spacing literal; `make contrast` green |
| W19 | `doc.html` carries the same theme-hint script | pass | unchanged this cycle |
| D7–D16, D18–D20 | named Go tests assert the prose | pass | no Go file changed this cycle; `make test` green |
| E2–E29 | Playwright tests assert the prose | pass | full suite green; the two new tests read end to end (see Test Quality) |
| REQ-23 | the ADR records the alternatives | pass | unchanged this cycle |

### Repairs table (test-specs.md)

Cycle 2 added **no new repairs** ("Attempt 2: no repairs"); the two cycle-1 repairs are
unchanged and still locator-only (tracker constructed before `page.goto`; `exact: true` on the
`Files` toggle) — neither deletes, skips or weakens an assertion, and both still assert
REQ-2/INV-6 and REQ-14/REQ-4 exactly as before. The one assertion this cycle *changed*
(E10's `/^changed .+ ago$/` → `/^changed (now|.+ ago)$/`) is a widening the cycle-1 review
explicitly asked for; it still requires a cue element carrying real freshness text (see Note 1
for what it no longer distinguishes). No flake repair exists, so no `e2e-soak` was required.
No `test.skip`/`test.fixme` anywhere under `web/e2e` or `web/src`.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D4's grep green; no Go file changed this cycle |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in the diff |
| 3 | No blocking hook handler | pass — no ingest/hook code changed this cycle |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — no tmux invocation in the diff |
| 5 | No payload logging | pass — no log site added or changed |
| 6 | No empty-gauge dishonesty | pass — re-measured by hand: the cue element count is **0** before any write hook (not a hidden element), the `.n` count is absent before the listing and in compact, the plan slot says `no plan yet` |
| 7 | Identity on the tmux target | pass — unchanged |
| 8 | No settings trespass | pass — unchanged |
| 9 | No real `claude` outside canary | pass — the two new specs synthesize hooks only |

### Design-system compliance

- **Tokens** — the style.css diff introduces no colour, font or spacing literal; every changed
  declaration is layout (`display`, `grid-template-*`, `grid-column`, `grid-row`, `min-width`).
  `make contrast` green.
- **No web fonts** — none added.
- **State colour** — the reader still uses no `--amber`/`--rose`/`--violet`/`--teal`.
- **Tabular numerics** — `.docbar .chg`, `.rnav .hd .n`, `.rnav .f .cnt` unchanged.
- **`[hidden]` companions** — no new `hidden` toggle this cycle. Re-swept the existing nine;
  each still has its `[hidden] { display: none; }` rule, including `.rnav[hidden]`, on which the
  grid's column-2 collapse depends.
- **§6 honesty** — no gauge, no percentage, no cost display; the cue is absent rather than
  `unknown`-shaped when no write was seen. Clean.
- **§7 terminals** — `docs` still never has a `TerminalSurface`; nothing in this cycle touches
  geometry, `resize-pane` or xterm.js.

## Manual Verification

Drove the real dashboard in Chromium against scratch `musterd` instances (four throwaway
specs using the committed E2E helpers, run and then deleted — `git status` shows nothing left
under `web/e2e/`). Everything below is a measured number off the live DOM.

**Cycle-1 Critical 1 (grid layout) — fixed, in all four hosts.** `getBoundingClientRect`:

```
Focus       host #main-terminal-slot {x:300,  y:90,  w:980,   h:630}
            article.md               {x:300,  y:122, w:744,   h:598}
            nav.rnav                 {x:1044, y:122, w:236,   h:598}   ← beside, x == body right edge
            nav bottom 720 == host bottom 720                            ← no overflow

Tile 2×2    tile                     {x:1,   y:87,  w:638.5, h:315.5}
            article.md               {x:2,   y:151, w:446.5, h:222.5}
            nav.rnav                 {x:448.5,y:151, w:190,   h:222.5}
            nav bottom 373.5 <= tile bottom 402.5                        ← was 25.5px past it

Tile 3×2    tile                     {x:1,   y:87,  w:425.3, h:315.5}
            nav.rnav                 {x:235.3,y:151, w:190,   h:222.5}
            .reader scrollWidth 423 == clientWidth 423                   ← no horizontal overflow

/doc.html   #reader-host             {x:0,   y:0,   w:1280,  h:307}
            article.md               {x:0,   y:52,  w:1044,  h:255}
            nav.rnav                 {x:1044,y:52,  w:236,   h:255}
```

**Cycle-1 Major 1 (live compact) — fixed.** Same session, same instance: Focus → class `reader`,
`.path` count 1, `.n` count 1, nav 236px; Cmd+\ → class `reader compact`, `.path` count 0, `.n`
count 0, nav 190px; Cmd+\ again → back to the Focus values.

**Cycle-1 Major 2 (freshness copy) — fixed.** After a routed `PostToolUse` Write for the open
file, `.chg` textContent is exactly `"changed now"`.

**c9e3c52's `.path` anchor — half-fixed (Major 1 below).** `.docbar` child order measured at each
step of a Focus → Tiles → Focus round trip **with** a real write hook in between:

```
Focus, no cue yet        ["fname","path","ib","arr[hidden]"]            ✓ REQ-4 order
Focus, plan open         ["badge","fname","path","ib","arr[hidden]"]    ✓
Focus, after the Write   ["fname","path","chg","ib","arr[hidden]"]      ✓
Tile (compact)           ["fname","chg","ib","arr[hidden]"]             ✓ path dropped
Back in Focus            ["fname","chg","path","ib","arr[hidden]"]      ✗ path AFTER the cue
innerText there: "TODO.md / changed now / /var/.../TODO.md / pop out ↗"
```

`refs.popOut` *is* a safe anchor as claimed — it is never removed anywhere in
`render/reader.ts` (only `.hidden` is assigned to it, including on `/doc.html` where I measured
`["badge","fname","path","ib[hidden]","arr[hidden]"]`), and `setPresence` has exactly three call
sites whose other anchor, `fname`, is likewise never removed. The defect is ordering, not
reinsertion.

**New Critical 1 (nav content unreachable).** In the **full Focus pane** (nav 598px tall), with
14 top-level `.md` files and a 25-heading file open:

```
nav.rnav   scrollHeight 598  clientHeight 598          ← the nav itself does not scroll
.tree      scrollHeight 294  clientHeight 152  overflow-y hidden   (14 rows, ~8 visible)
.outline   scrollHeight 546  clientHeight 281  overflow-y hidden   (26 rows)
doc-13.md      row bottom 543    vs .tree bottom 400.5    visible: false
"Section 24"   row bottom 984.5  vs .outline bottom 720   visible: false
```

Worse in a 2×2 tile with one folder of 60 files expanded: `.tree` clientHeight 81 against
scrollHeight 947, and `file-059.md` renders at y=1172 while the nav ends at y=373.5.

Not verified: real Claude Code behaviour (fixtures only, by design) and the plans-directory
override (plan edge case 18, already recorded as unobservable on this machine).

## Issues

### Critical

1. **[web-impl]** The nav's file tree and outline are **clipped and unreachable** once their
   content exceeds the nav's height — in the full Focus pane, not just a tile.
   `web/src/style.css:1151-1154` (`.rnav .tree, .rnav .outline { overflow: hidden; }`) against
   `web/src/style.css:959-971` (`.rnav { display: flex; flex-direction: column; overflow: hidden auto; }`).
   Both are flex items in a column container; because their `overflow` is not `visible`, their
   automatic flex minimum size is 0, so they shrink to whatever is left and clip the remainder.
   `.rnav`'s own `overflow: hidden auto` never engages, because nothing overflows it — its
   children absorbed the pressure by shrinking. Net: `scrollHeight 294 / clientHeight 152` on the
   tree and `546 / 281` on the outline, **with no scrollbar on either element or on the nav**
   (measurements above).
   This is not a pre-existing defect surfacing on its own: before bc715e3 the nav's height was
   content-driven (`flex: none` in a column flex `.reader`), which is exactly why cycle 1
   measured it overflowing 25.5px past a tile. Bounding it — the right fix — is what made the
   inner clipping reachable, and it now bites on any directory bigger than the E2E fixture. The
   muster repo's own root has 70+ `.md` files.
   REQ-10 ("a file tree of every `*.md` under the session directory") and REQ-14 ("the open
   file's headings") are rendered but not reachable, and REQ-11's filter has the same ceiling on
   a broad match.
   Fix (either model works; the mockups are static single-screen renders and settle neither, so
   pick one and say which in the log): give `.rnav .tree` and `.rnav .outline`
   `overflow-y: auto` so each section scrolls inside its own shrunken box; **or** set `flex: none`
   on both so they keep their content height and `.rnav`'s existing `overflow: hidden auto`
   scrolls the whole nav as one column. Verify by measuring, not by a locator: for a directory
   whose tree exceeds the nav, the last tree row and the last outline row must be reachable —
   either `row.bottom <= container.bottom` after scrolling the owning element, or
   `scrollHeight > clientHeight` on an element whose computed `overflow-y` is `auto`/`scroll`.

### Major

1. **[web-impl]** `.path` renders **after** the freshness cue once it is re-inserted, breaking
   REQ-4's stated left-to-right order (`badge, basename, path, cue, pop out, arrow`).
   `web/src/render/reader.ts:165-167`: both `.path` and `.chg` are inserted before the same
   anchor `refs.popOut`, so when `.chg` is already attached (any session whose open file has seen
   a write hook) and `.path` is re-inserted (any Tiles→Focus switch, REQ-15's compact toggling
   `pathVisible`), `insertBefore(path, popOut)` lands `.path` on the wrong side of `.chg`.
   `setPresence(chg, popOut, true)` on the next line cannot repair it — `.chg` is already
   connected, so that call is a no-op.
   Measured (table above): the bar reads `TODO.md / changed now / /var/.../TODO.md / pop out ↗`.
   The fix commit's claim that "calling both insertions in left-to-right order against the same
   anchor still preserves the sequence either way" holds only when both are absent at the start
   of the pass; it is false in the one combination the compact round trip produces.
   Fix: make the position deterministic rather than dependent on what was already connected —
   e.g. insert right-to-left (`.chg` before `popOut`, then `.path` before `.chg` when `.chg` is
   connected and before `popOut` otherwise), or have `setPresence` always `insertBefore` when
   `present` (a no-op move when already in place) and order the calls accordingly. Keep the
   anchor off `.chg` for the *absent* case — that part of c9e3c52 is right.

2. **[e2e-specs]** The two new specs are good and pin exactly what they claim, but neither can
   see either finding above, which is how both shipped past a green 336/336 sweep. Two
   additions, once the fixes land:
   - *Live compact* (`web/e2e/reader.spec.ts`, "compact follows the current host…") runs on a
     session that never receives a write hook, so `.chg` is absent for the whole test and the
     ordering combination never occurs. Post a routed `PostToolUse` Write for the open file
     before the Focus→Tiles→Focus round trip and assert the `.docbar`'s element order on the
     return leg (the `.path`/`.chg` sequence), not just `.path`'s presence.
   - *Nav placement* (`…"the reader nav sits beside the body…"`) measures the nav's outer box but
     nothing about reaching its contents. Add a fixture whose tree and outline exceed the nav
     (the existing `buildMarkdownFixtureTree` is far too small) and assert the last tree row and
     last outline row are reachable, by the measurement named in Critical 1.

### Minor

None.

### Notes

1. **[note]** E10's widened `/^changed (now|.+ ago)$/` also matches the old ungrammatical
   `"changed now ago"` (via the `.+ ago` alternative), so it is no longer the guard for Major 2's
   copy fix. That is fine and is what the cycle-1 review asked for — the real guard is
   `web/src/reader/freshness.test.ts`, which now asserts `toBe("changed now")` **and**
   `.not.toContain("now ago")`. Recording it so nobody later mistakes E10 for the grammar guard.
2. **[note]** `web/src/sessions/format.ts`'s `agoSuffix` refactor is behaviour-preserving for
   every pre-existing caller: `formatEndedAgo` is now `agoSuffix(formatEndedAge(...))`, which is
   the same expression it inlined before, and its three call sites (`render/dead.ts:87,99`,
   `render/mainhead.ts:45`, `render/tiles.ts:270`) are untouched. It also gained direct unit
   coverage it never had (`format.test.ts`), which `web-tests` added unprompted — the right call.
3. **[note]** The Critical-1 fix's explicit `grid-row`/`grid-column` placement (rather than
   auto-placement) is correct and worth keeping as written: `.reader-notice` is `[hidden]`
   → `display: none` on the common path, and auto-placement would then pull `.md`/`.rnav` up into
   the `auto`-sized second row. The comment in `style.css:683-692` says exactly this.
4. **[note]** Cycle-1 Notes 1–7 (the `LocatePlanFile(…, home)` signature, `reader/CLAUDE.md`'s
   heading, the declined Vitest coverage of `markdown.ts`/`features`/`render`, `maybeAutoOpenPlan`,
   `walkMarkdown`'s no-op branch, `ReaderMemory.clearedAt` growth, and `too_large` naming the
   resolved path) all still stand unchanged and still need no action.
5. **[orchestrator]** Completion still owes the `TODO.md` § Pre-v1 Cleanup tick + move to
   `docs/history/todo-done.md` and the seven `proposed`→`accepted` ADR flips. Both are
   Completion-step work by design (plan § Doc upkeep), not gaps in this cycle.
