# E2E Test Specs: Mermaid Support

**Plan**: mermaid-support
**Mode**: fix (review cycle 3)
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role e2e-specs` — conventions §Testing/§Comments/§Knowledge records, the reader feature spec + protocol contract slices, all 15 reader ADRs (5 `proposed` for this plan, 10 `accepted` prior art) named by `.claude/rules/reader.md`. No `docs/facts/` or `docs/lessons/` hits for this plan/role.
**Verdict**: pass
**Tests created**: 16 (E6 amended in review cycle 1; E6's comment reworded in review cycle 3, no assertion change)
**Live run**: 16/16 passing (fix, review cycle 3); full suite 371/371 passing

## Validate Attempt 1

**Rebuild**: `make web-build build` — clean, `bin/musterd` and `internal/webui/assets` current
(mermaid chunks: `mermaid.core-NV-cKFwj.js`, `mermaid-parser.core-BLqPRre2.js`).

**Own spec live run** (`npm run e2e -- e2e/reader-mermaid.spec.ts`, from `web/`): `16 passed
(9.5s)` — clean on the first attempt, no per-test repair needed beyond the one made below before
running (see Repairs #1).

**Investigated the three flagged findings from `web-implementation.md` § Handoff before running:**

1. **E11's compact-tile race** — read `features/reader.ts` to confirm web-impl's diagnosis
   independently rather than taking it on trust. Confirmed: `ReaderInstance.decideInitialOpen`
   (features/reader.ts:239-254) reads `this.memory.openPath` — loaded in the constructor via
   `loadMemory(window.localStorage, sessionId)`, keyed by *session id*, not by view/host
   (`kb:adr/reader-memory-split-browser-and-daemon`) — and auto-opens it before any test code
   runs. `openFile` persists `memory.openPath` via `saveMemory()` on every successful open
   (features/reader.ts:305-307). So when E11's test switches Focus's session into a compact tile,
   the tile's fresh `ReaderInstance` for the *same* session id auto-opens `wide.md` from that
   persisted memory on mount — the test's subsequent `fileEntry(tileRegion, "wide.md").click()`
   re-opens an already-open file, exactly the redundant click web-impl described. This is a
   defect in my spec (a stale assumption that the tile view needs an explicit file click), not
   the implementation — repaired (Repairs #1) by dropping the click.
2. **E5's chunk-name assumption** — confirmed directly from my own `make web-build build` output:
   `mermaid.core-NV-cKFwj.js` and `mermaid-parser.core-BLqPRre2.js`, both containing the literal
   substring `"mermaid"`. `scriptRequestsContaining("mermaid")` needs no repair.
3. **E2's non-default-fill selector** — the live run's E2 test passed cleanly against the real
   DOMPurify-sanitized markup with the selector as authored (`svg .node rect, svg .node polygon,
   svg .node circle, svg .node path`); no repair needed.

**Soak** (E11's repair touched a wait/click sequence in a test diagnosed as intermittently
flaky): `make e2e-soak SPEC=reader-mermaid.spec.ts N=10` → `160 passed (1.4m)`, all 10 repeats of
E11 (and every other test) green, each in 2.3-2.5s — confirms the redundant-click removal, not
luck, fixed the race.

**Full-suite sweep** (`make e2e` from the project root, required before reporting `pass` since a
repair could affect shared behaviour/timing): `371 passed (2.2m)` — every pre-existing spec in
all 31 files still green; no plan-superseded specs, no regressions from this plan's protocol/UI
delta.

**Re-verified collection** after the edit: `npx playwright test --list` → `Total: 371 tests in 31
files`, no duplicate-title abort.

**Other gates**: `python3 .claude/skills/orchestrate/scripts/dead-refs.py` → `568 references
checked, 0 missing` (the new comment's `kb:adr/reader-memory-split-browser-and-daemon` citation
resolves). `npm run -s lint` (Biome) — clean, no fixes applied.

---

## Tests created (authoring log below — verdict/live-run lines above supersede)

**Live run (authoring)**: 15 of 16 not run (authoring) — collection-only, since their new-behaviour
assertions fail today (mermaid is not in `web/package.json` and none of
`web/src/render/diagrams.ts`, `diagramdialog.ts`, `mermaid.ts`, `web/src/reader/mermaid.ts`,
`zoom.ts` exist in the tree yet). The REQ-12 test is a genuine regression pin — it exercises only
the reader's pre-existing markdown/outline path, unaffected by the (nonexistent) diagram pass —
and was run live: `make web-build build` then `npx playwright test e2e/reader-mermaid.spec.ts -g
"REQ-12"` → `1 passed (3.3s)`. Verified: `npx playwright test --list
e2e/reader-mermaid.spec.ts` (16/16 collected), `npx playwright test --list` full suite (371
tests, 31 files, no duplicate-title abort), `npx tsc --noEmit` clean, `npm run -s lint` (Biome)
clean, `sh scripts/e2e-lint.sh` clean.

## Tests

| File | Test Name | Requirement | What It Verifies | Status |
|------|-----------|-------------|------------------|--------|
| web/e2e/reader-mermaid.spec.ts | a valid flowchart fence renders as an SVG diagram with styled nodes, and the source pre is gone (E2, REQ-1) | E2, REQ-1 | `flow.md`'s fence becomes `figure.diagram svg` with a styled (non-default-fill) node; no `pre code.language-mermaid` remains | collection-only |
| web/e2e/reader-mermaid.spec.ts | a malformed fence among valid ones keeps its source with a failure line while the others render (E3, REQ-6) | E3, REQ-6 | `broken.md`'s bad fence keeps `pre code`, gains `p.diagram-error` as its next sibling matching `/^diagram not rendered: /`; the valid fence still renders | collection-only |
| web/e2e/reader-mermaid.spec.ts | script, onerror and javascript: content in a diagram's labels and click directive never reach the DOM, even under a loose init directive (E4, REQ-5) | E4, REQ-5 | `unsafe.md` (script label, onerror label, `javascript:` click, `securityLevel: "loose"` init) renders with no `script`/`[onerror]`/`javascript:` URL anywhere in the body and `window.__readerXss` stays undefined | collection-only |
| web/e2e/reader-mermaid.spec.ts | mermaid's chunk loads lazily only for a document with a fence, and every request stays on the daemon's origin (E5, REQ-3, REQ-4) | E5, REQ-3, REQ-4 | opening `plain.md` records zero same-origin script requests containing "mermaid"; opening `flow.md` afterwards records at least one; every recorded request is same-origin throughout | collection-only |
| web/e2e/reader-mermaid.spec.ts | changing the theme re-renders a diagram in the mapped mermaid theme without re-fetching the file (E6, REQ-7) | E6, REQ-7 | `data-mermaid-theme` starts `dark`, flips to `default` after picking Light in Settings, with zero `/reader/file` requests during the switch | collection-only |
| web/e2e/reader-mermaid.spec.ts | a routed Write hook for the open diagram file re-renders it with the changed node label (E7, REQ-1) | E7 | rewriting `flow.md`'s node label and posting a routed Write hook makes the new label text appear inside the rendered `svg` | collection-only |
| web/e2e/reader-mermaid.spec.ts | Enlarge diagram opens a fitted, focused modal; Escape, the backdrop and Close each close it and restore focus to the button (E8, REQ-8) | E8, REQ-8 | `Enlarge diagram` opens `dialog.diagram-modal[open]` with a focused stage at `data-zoom="1.00"`; Escape, a backdrop click and `Close` each close it and return focus to the button | collection-only |
| web/e2e/reader-mermaid.spec.ts | with two tiles open on the same diagram file, enlarging one tile's diagram opens only that tile's dialog (E9, INV-3) | E9, INV-3 | two tiles on the same diagram file each hold exactly one `dialog.diagram-modal`; enlarging tile A's diagram opens only A's dialog, never B's | collection-only |
| web/e2e/reader-mermaid.spec.ts | on the pop-out, Enlarge diagram opens and closes the modal with focus restored, and every request stays on the daemon's origin (E10, REQ-8) | E10 | the pop-out page's `Enlarge diagram`/Escape/focus-restore cycle behaves identically to Focus, with all requests same-origin | collection-only |
| web/e2e/reader-mermaid.spec.ts | a diagram wider than the body scrolls its own figure without giving article.md a horizontal scrollbar, in Focus and in a compact tile (E11, REQ-11) | E11 | `wide.md`'s 40-node flowchart overflows `figure.diagram` (`scrollWidth > clientWidth`) while `article.md` never does, checked in Focus and again in a 3×2 tile | collection-only |
| web/e2e/reader-mermaid.spec.ts | a file with a fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote and duplicate variants, renders every one (E12, REQ-1, REQ-2) | E12, REQ-1, REQ-2 | `kinds.md`'s 13 fences (8 kb kinds + `Mermaid`-cased + `title=x` + blockquote-nested + 2 identical) all render as `figure.diagram svg`, no `pre code` mermaid remains | collection-only |
| web/e2e/reader-mermaid.spec.ts | heading ids and the outline are unchanged by a document that also carries mermaid fences, valid and malformed, between its headings (REQ-12) | REQ-12 | `interleaved.md` (three `##` headings around a valid and a malformed mermaid fence) still lists all three headings in the outline, still assigns them ids `#top`/`#alpha`/`#beta`/`#gamma`, and outline click/scroll-spy still moves `aria-current` correctly — exercised entirely by the reader's pre-existing (already-implemented) markdown/outline path, since no diagram pass exists yet to touch it | **ran-green-at-authoring**: `1 passed (3.3s)` |
| web/e2e/reader-mermaid.spec.ts | in the open modal, Zoom in/out, +/-/=/0 keys and Reset zoom move data-zoom through the documented sequence, clamped to [0.25, 8] (E13, REQ-9, INV-5) | E13, REQ-9, INV-5 | transcribes the plan's amended E13 sequence: `Zoom in`→1.25, `Zoom out`→1.00, `-`→0.80, Reset→1.00, 12×`+`→8.00 (clamped), 12 more→8.00, 16×`-`→0.25, Escape+reopen→1.00 | collection-only |
| web/e2e/reader-mermaid.spec.ts | in the open modal, wheel-up zooms in, a pointer drag pans the canvas by the drag delta, and Reset zoom restores fit with no pan (E14, REQ-9) | E14, REQ-9 | a wheel-up over the stage raises `data-zoom` above 1.00; a 100×50px pointer drag moves the canvas `transform`'s translate by (100, 50); `Reset zoom` restores `translate(0px, 0px)` and `1.00` | collection-only |
| web/e2e/reader-mermaid.spec.ts | a flowchart naming layout: elk in frontmatter and one naming no layout both render (E15, REQ-2) | E15, REQ-2 | `elk.md`'s `layout: elk` flowchart and its no-layout sibling both render as `figure.diagram svg` with no registration call needed | collection-only |
| web/e2e/reader-mermaid.spec.ts | switching to a plain file while a diagram file's fetch is still held discards the late render (REQ-10, edge case 5) | REQ-10, edge case 5 | with `flow.md`'s `/reader/file` response held and `plain.md`'s free to complete, opening flow then plain shows only Plain's content once flow's held response is released — the late diagram never appears | collection-only |

## Fixture Changes

- `web/e2e/helpers/reader.ts` — added, all additive (no existing export changed):
  - **Locators**: `diagramFigures`/`diagramFigure`, `enlargeButton`, `keptMermaidSource`,
    `diagramErrorLine`, `diagramDialog` (role query, open-only) / `diagramDialogRaw` (raw CSS,
    for INV-3's closed-or-open count), `diagramStage`, `diagramCanvas`, `diagramZoomIn/Out/Reset`,
    `diagramClose` — transcribed from the plan's Testable UI Elements table and DOM sketch (`figure.diagram`, `button.diagram-enlarge` named "Enlarge diagram", `dialog.modal.diagram-modal` named "Diagram", the four toolbar buttons by their pinned names).
  - **Oracle**: `canvasTransform(canvas)` parses the DOM sketch's inline
    `translate(<x>px, <y>px) scale(<s>)` into numbers — Playwright has no numeric-CSS matcher, so
    E14's pan/zoom assertions need the parsed values directly.
  - **Fixture builder**: `writeMermaidFixture(dir)` — writes `flow.md`, `broken.md`, `unsafe.md`,
    `kinds.md`, `elk.md`, `wide.md`, `plain.md` exactly as the plan's Implementation Notes name
    them. Every mermaid source is genuine, syntactically-checked-by-hand mermaid text (a plain
    `flowchart TD`/`classDiagram`/`stateDiagram-v2`/`sequenceDiagram`/`erDiagram`/three C4 kinds,
    one deliberately broken fence, one with script/onerror/`javascript:` content under a loose
    init directive, a `layout: elk` frontmatter pair, a 40-node chain) — not a wire shape, so
    there is no capture to trace it to; these are inputs to the real bundled mermaid engine, the
    same way `buildMarkdownFixtureTree`'s prose is an input to the real markdown renderer.
  - **Oracle**: `OriginRequestTracker` — mirrors `ReaderRequestTracker`'s shape but records every
    request's URL unfiltered (a mermaid chunk's hashed filename isn't known ahead of a build), for
    INV-2's same-origin assertion and E5's "engine chunk requested only after a fence" check.
  - **Held response**: `holdReaderFileResponseFor(page, id, fileBasename)` — a per-file variant
    of the existing `holdReaderFileResponse`, needed because REQ-10's test must hold exactly one
    file's fetch while a different file's completes normally; holding both behind the same shared
    gate (the existing helper's shape) would release them in an arbitrary race and not demonstrate
    genuine lateness.
  - No new fixture builder was needed for the REQ-12 pin — its `interleaved.md` is written inline
    in the test (headings plus mermaid fences), matching how `reader.spec.ts`'s own E15/E16/E17
    one-off fixtures are written directly in their tests rather than through a shared helper.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | E2, E7, E12 |
| REQ-2 | E12, E15 |
| REQ-3 | E5 |
| REQ-4 | E5 |
| REQ-5 | E4 |
| REQ-6 | E3 |
| REQ-7 | E6 (review cycle 1: amended to also assert `figure.diagram svg` still carries a `viewBox` and both `.node` elements after enlarge → close → theme flip, per plan.md's amended criterion — see Fix Attempt 1) |
| REQ-8 | E8, E10 |
| REQ-9 | E13, E14 |
| REQ-10 | REQ-10/edge case 5 test |
| REQ-11 | E11 |
| REQ-12 | REQ-12 pin test |
| INV-2 | E5, E10 |
| INV-3 | E9 |
| INV-4 | REQ-10/edge case 5 test |
| INV-5 | E13 |

REQ-13 (`--sans` font) and REQ-14 (sequential/unique ids), both Should Have, and REQ-15
(selectable failure text, Nice to Have) have no dedicated E2E test — they are Reviewer-Verified
against `render/diagrams.ts`/`render/mermaid.ts` per the plan's own Automated Checks section.
INV-1 (sanitizer boundary) is exercised on the initial-open path by E4; the theme-rerender (E6)
and docChanged-refetch (E7) paths are covered for correct re-render but not re-tested for XSS,
since DOMPurify runs once per pass regardless of trigger and duplicating E4's check on every path
is redundant given `render/diagrams.ts` is the one function all three paths share (W12's
Reviewer-Verified check confirms this at the code level).

## Notes

- **REQ-12 send-back (resolved)**: the first pass claimed existing `reader.spec.ts` outline tests
  already covered REQ-12; the orchestrator checked the shared fixtures and found none of them
  carry a mermaid fence, so the (not-yet-existing) diagram pass never runs on any document those
  tests open — REQ-12 was genuinely untested. Added the regression-pin test above, run live
  against the current tree (`make web-build build` then `npx playwright test
  e2e/reader-mermaid.spec.ts -g "REQ-12"` → `1 passed (3.3s)`), since it exercises only the
  reader's pre-existing (already-implemented) markdown/outline path and must both pass now and
  keep passing once the diagram pass exists.
- **E13's arithmetic (resolved)**: flagged in the previous pass that "fourteen `-` presses reads
  `0.25`" didn't reconcile with REQ-9's divide-by-1.25 rule (my calculation landed near 0.352, not
  0.25). The orchestrator verified this and amended the plan's E13 from `fourteen` to `sixteen`
  presses (`plans/mermaid-support/plan.md`, "Amended 2026-09-15 (orchestrator, pre-review)" note
  under E13) — `8.00 / 1.25^16 ≈ 0.235`, which clamps to the `0.25` floor. The spec's E13 test now
  presses `-` sixteen times, matching the amended criterion; no other change.
- **E5's chunk-name assumption**: `scriptRequestsContaining("mermaid")` assumes Vite names the
  lazily-loaded mermaid chunk with "mermaid" somewhere in its hashed filename (Vite's default
  behavior for a named dynamic import target). If web-impl's actual build output names it
  differently, this is a locator repair in validate mode, not a defect — flagged per the
  "unmeasured → do not guess, but state the assumption" rule; there is no fact record for Vite's
  own chunk-naming behavior to cite instead.
- **E2's non-default-fill check** targets `svg .node rect/polygon/circle/path`, mermaid's own
  flowchart node class; if the implementation's actual SVG structure differs (e.g. DOMPurify's
  `ADD_TAGS` decision in Implementation Notes changes what survives), this is a validate-mode
  locator repair against the real rendered markup, not a spec defect.
- No test drives a real `claude` process; Claude Code is faked throughout via
  `envelopedSessionStart`/`rawPostToolUse`. mermaid itself is real (bundled in the build), so
  diagram rendering, not just wire shapes, is genuinely exercised once the implementation exists.
- Verified clean: `npx playwright test --list e2e/reader-mermaid.spec.ts` (16/16), full-suite
  `npx playwright test --list` (371 tests / 31 files, no collection abort), `npx tsc --noEmit`,
  `npm run -s lint` (Biome), `sh scripts/e2e-lint.sh`.

## Repairs (validate attempt 1)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | a diagram wider than the body scrolls its own figure without giving article.md a horizontal scrollbar, in Focus and in a compact tile (E11, REQ-11) | Diagnosed (not yet reproduced by me — web-impl's own live run showed it failing intermittently-but-reproducibly) as a race: `expect(tileOverflow).toBe(true)` at line ~391 could read the DOM mid-rebuild. | The test re-clicked `fileEntry(tileRegion, "wide.md")` on a file already open for that session. Confirmed independently by reading `features/reader.ts`: `decideInitialOpen` (lines 239-254) auto-opens `this.memory.openPath` on every new `ReaderInstance` construction, and that memory is keyed by session id (`kb:adr/reader-memory-split-browser-and-daemon`), not by view/host — so the tile's fresh reader instance for the same session already opens `wide.md` on mount, before the test's click. The redundant click triggered a second `setReaderBody` (wiping the already-correct, overflowing `figure.diagram` back to a bare `<pre>`) racing the following `.evaluate()` read, which — unlike `toBeVisible()` — has no retry semantics. | Dropped the redundant `fileEntry(tileRegion, "wide.md").click()` line; the test now relies on the tile's own auto-open of the already-selected file, then reads `tileFigure` directly. E11's own-run passed 16/16 on the first attempt after this fix, and a `make e2e-soak SPEC=reader-mermaid.spec.ts N=10` repeat ran E11 (and every other test in the file) 10/10 green (`160 passed (1.4m)`), confirming the race is gone rather than merely not hit this once. REQ-11's actual behaviour asserted is unchanged: `tileFigure.scrollWidth > tileFigure.clientWidth` must be `true` (the diagram overflows its figure) while `article.md`'s own overflow check stays `false`, in both Focus and a compact tile — the same two positive assertions as before, just no longer racing a redundant fetch. |

No assertion was deleted, skipped, or weakened.

E5's chunk-name locator and E2's non-default-fill selector were both checked against the real build/markup during this validate pass and needed no repair (see the Validate Attempt 1 section above).

## Test Run Output (validate attempt 1)

```
$ npm run e2e -- e2e/reader-mermaid.spec.ts
Running 16 tests using 4 workers
  16 passed (9.5s)

$ make e2e-soak SPEC=reader-mermaid.spec.ts N=10
  160 passed (1.4m)

$ make e2e   # full suite, project root
  371 passed (2.2m)

$ npx playwright test --list
  Total: 371 tests in 31 files
```

## Fix Attempt 1 (review cycle 1)

**Issue addressed**: review.md Critical 2 `[e2e-specs]` — E6 asserted only `data-mermaid-theme`
and a no-refetch negative, never that a diagram survived the flip, so it was blind to Critical 1
(the enlarge → close → theme-flip path that destroyed the on-page diagram). plan.md's E6
criterion was amended by the orchestrator this cycle to require the survival clause; this fix
rewrites the test against the amended criterion.

**Change**: `web/e2e/reader-mermaid.spec.ts` (E6, `changing the theme re-renders a diagram in the
mapped mermaid theme without re-fetching the file, and the diagram survives having been enlarged`)
now drives the failing order — `Enlarge diagram` → `Close` → flip the theme radio to `Light` —
before asserting the theme flip, then adds four assertions against `figure.diagram svg` that
were absent before: `viewBox` still has content, `.node` count is still 2 (flow.md's `A --> B`
fixture), and both node labels `A`/`B` are still visible in the SVG. Title reworded so a reader
sees the survival coverage without opening the file.

**Proving the new assertion is not vacuous** (both landed fixes from this cycle's web-impl wave,
commit ce34fa0, already close the exact defect Critical 1 named, so a test written against the
current tree passes regardless of whether it can detect the defect class — this had to be proven
by breaking the product, not by reading the diff):

1. First attempt — reverted only `refs.diagramCanvas.replaceChildren()` in
   `web/src/render/diagramdialog.ts`'s `close` handler (replaced with a comment), rebuilt
   (`make web-build build`), ran `npx playwright test e2e/reader-mermaid.spec.ts -g "E6"`: **still
   green**. Investigated why: `features/reader.ts:399` (`const instance =
   nextDiagramInstanceId++`) already mints a fresh instance id for every theme-flip pass — this
   cycle's other web-impl fix, "mint diagram ids per pass" (commit ce34fa0), which independently
   removes the id collision Critical 1 depended on. With that fix present, `rerenderDiagrams`
   (`render/diagrams.ts:120`, `diagramId(instance, n)`) never mints an id matching the stale
   clone's, so the clone left behind by the un-reverted close handler is inert — reverting the
   close-handler line alone cannot reproduce the bug on this tree. Restored the line immediately;
   confirmed `git diff --stat web/src` empty before proceeding.
2. Second attempt — reverted the *other* half instead: in `render/diagrams.ts`'s
   `rerenderDiagrams`, changed `const id = diagramId(instance, n);` to `const id = existingSvg?.id
   || diagramId(instance, n);` (reusing the figure's existing SVG id, the pre-fix behaviour), together
   with the same diagramdialog.ts close-handler revert from step 1 (so the stale clone stays in the
   document). Rebuilt, ran the same targeted test: **RED**, reproducing exactly the failure class
   Critical 1 named — `viewBox` empty and the id `muster-diagram-0-0` shown as reused/stolen by the
   stale clone. Output pasted below.
3. Restored both files verbatim (`git diff --stat web/src` empty), rebuilt, reran the targeted
   test: green. Ran the whole file (16/16 green), the full suite (`make e2e`, 371/371 green), and
   re-verified collection (`npx playwright test --list` → 371 tests/31 files, no abort).

This means the *specific* one-line revert named in the fix-wave brief does not, on its own,
reproduce Critical 1 on the current tree — both of this cycle's web-impl fixes close the same
defect class independently, and either one alone is sufficient. The assertion is proven capable
of detecting the underlying defect class (a destroyed on-page diagram after enlarge/close/theme
flip), which is what Critical 2 required; it is just not sensitive to *only* the close-handler
half in isolation, because the id-minting half alone already prevents the collision. Flagging this
for the record rather than silently declaring the single-line revert "confirmed red" when it
wasn't.

## Repairs (fix, review cycle 1)

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | changing the theme re-renders a diagram in the mapped mermaid theme without re-fetching the file, and the diagram survives having been enlarged (E6, REQ-7) | Review Critical 2: the test could not detect a destroyed diagram — it asserted only the theme attribute and a request-count negative. | The test never drove the enlarge/close path before flipping the theme, and asserted nothing about the SVG's own content. | Added enlarge → close before the theme flip, and four post-flip assertions on `figure.diagram svg`: `viewBox` matches `/\S/`, `.node` count is `2`, and both node labels `A`/`B` are visible. | REQ-7 (diagram re-renders in the mapped theme) and the amended E6 criterion in plan.md — a destroyed diagram (empty `viewBox`, 0 nodes) now fails this test, proven by the deliberate breakage in Fix Attempt 1 step 2 above, which turned exactly these new assertions red. |

No assertion was deleted, skipped, or weakened.

## Test Run Output (fix, review cycle 1)

```
$ make web-build build && cd web && npx playwright test e2e/reader-mermaid.spec.ts -g "E6"
  1 passed (2.6s)          # fixed tree, before breaking anything

# Step 1 (revert close-handler line only) — did NOT reproduce the bug:
  1 passed (2.8s)          # green — proves the id-minting fix alone already closes it

# Step 2 (revert close-handler line + revert id-minting to existingSvg.id) — reproduces it:
Error: expect(locator).toHaveAttribute(expected) failed
Locator: locator('[aria-label="Reader: mmd-e6"]').locator('article.md').locator('figure.diagram').first().locator('svg')
Expected pattern: /\S/
Received string:  ""
  - unexpected value "null"
  34 × locator resolved to <svg id="muster-diagram-0-0" role="graphics-document document" ...>
  1 failed

# Tree restored, both files verbatim (git diff --stat web/src: empty):
$ npx playwright test e2e/reader-mermaid.spec.ts
  16 passed (8.7s)

$ make e2e   # full suite, project root
  371 passed (2.2m)

$ npx playwright test --list
  Total: 371 tests in 31 files
```

## Notes (fix, review cycle 1)

- `web/scripts/e2e-lint.sh` clean after the edit.
- `git status --porcelain web/src` empty at every checkpoint in this fix — the temporary reverts
  used to prove non-vacuity were local measurements only, never committed.
- Comments added cite "review cycle 1 Critical 1/2" following this plan's existing citation style
  (`render/diagrams.ts`, `render/diagramdialog.ts` already comment this way), not a bare file path.

## Fix Attempt 2 (review cycle 3)

**Issue** (`[e2e-specs]`, Major, `web/e2e/reader-mermaid.spec.ts` E6 block): the second sentence of
the comment above the enlarge/close/theme-flip sequence claimed "the close handler must empty the
dialog's cloned SVG so the later re-render can't resolve against a stale clone" — the identical
false proposition cycle 2's Major removed from `diagramdialog.ts`. `rerenderDiagrams` mints a fresh
`diagramId(instance, n)` per pass regardless of what the close handler does, so the re-render never
depends on the clone being emptied; this plan's own Fix Attempt 1 above (steps 1-3) already measured
that reverting the close handler's `replaceChildren()` alone leaves E6 green, proving the close
handler is not what the later re-render depends on.

**Fix**: reworded the second/third sentence in place. Kept the first sentence ("Drive the order
that breaks it (review cycle 1 Critical 1): enlarge, close, then flip the theme.") verbatim per the
fix-wave instructions — it is correct. Replaced the false causal claim with: either the close
handler clearing the dialog's cloned SVG, or the re-render minting a fresh id per pass, each
independently stops the later re-render from resolving against a stale clone, so the test guards
the defect class rather than either fix in isolation. No assertion changed.

**Blast radius**: swept `web/e2e/**` for the same false-instance pattern
(`rg -n "close handler must empty|resolve against a stale clone|cloned SVG so the later|must empty
the dialog" web/e2e/` and a second pass for the cycle-1 `diagramId`/"instance value" wording) —
zero hits beyond the one line fixed. `web/e2e/reader-mermaid.spec.ts` is the only file this fix
touches.

**Repro** (reviewer's target test, before + after the wording change — behaviour unchanged, so a
single post-fix run suffices to confirm no regression):

```
$ make web-build build            # project root; web-build before build, binary embeds assets
... (vite + go build, clean)

$ npx playwright test e2e/reader-mermaid.spec.ts -g "E6"   # from web/
  1 passed (3.9s)

$ npx playwright test e2e/reader-mermaid.spec.ts           # full file
  16 passed (9.6s)

$ npx playwright test --list                               # suite-wide collection re-check
  Total: 371 tests in 31 files

$ make e2e                        # project root, full suite
  371 passed (2.3m)
```

## Notes (fix, review cycle 3)

- Words-only fix: no assertion or behaviour changed anywhere in `web/e2e/**`.
- No assertion was deleted, skipped, or weakened.
- `git status --short` before committing showed only `web/e2e/reader-mermaid.spec.ts` (mine) and
  the pre-existing, not-mine `plans/mermaid-support/orchestration-state.json` modification;
  `git diff --stat web/src` empty throughout.
