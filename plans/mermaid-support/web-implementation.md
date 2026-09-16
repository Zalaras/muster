# Web Implementation: Mermaid Support

**Plan**: mermaid-support
**Mode**: initial
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role web-impl` — conventions §Testing/§Comments/§Composition roots, reader feature spec + protocol contract slice, all 15 reader ADRs (5 `proposed` for this plan), 8 lessons (authored-tests-never-run-before-validate, concurrent-build-invalidates-running-e2e, display-rule-overrides-hidden-attribute, effect-claimed-from-the-diff, first-exec-of-fresh-script-costs-270ms, handoff-commit-defects, sanctioned-test-break-blinds-lint, surface-never-measured-against-its-host, unmentioned-req-costs-a-review-minor). 6345 words.

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/package.json`, `web/package-lock.json` | modified | `"mermaid": "12.0.0"` (exact) added to `dependencies`. |
| `web/src/reader/mermaid.ts` | created | Pure: `isMermaidLanguageClass`, `mermaidThemeFor`, `diagramErrorText`, `diagramId`. |
| `web/src/reader/zoom.ts` | created | Pure: `ZoomState`, `ZOOM_MIN`/`ZOOM_MAX`, `fitScale`, `clampZoom`, `zoomAround`, `wheelFactor`, `panBy`, `resetZoom`, `transformOf`. |
| `web/src/render/mermaid.ts` | created | DOM: `loadEngine` (memoised dynamic import), `ensureInitialized`, `renderDiagramSvg` — mermaid config, parse-before-render, DOMPurify pass, and the explicit width/height fix described in Decisions. |
| `web/src/render/diagrams.ts` | created | DOM: `renderDiagrams` (initial pass, sequential, per-fence try/catch) and `rerenderDiagrams` (theme pass from retained source), `WeakMap<Element,string>` source retention. |
| `web/src/render/diagramdialog.ts` | created | DOM: `wireDiagramDialog` — delegated enlarge click, backdrop/Escape/Close, wheel/drag/keyboard/toolbar zoom-pan, focus restore with the article.md fallback. |
| `web/src/render/reader.ts` | modified | `ReaderRefs` gains the seven diagram-dialog fields; `buildReader` wires them and calls `wireDiagramDialog`. |
| `web/src/features/reader.ts` | modified | Per-instance `diagramInstanceId`/`diagramPass`/`themeObserver`; `openFile` starts `renderDiagrams` after `setReaderBody`; `handleThemeChange` chains `rerenderDiagrams` behind the in-flight pass (W19); observer disconnected in `dispose`. |
| `web/index.html`, `web/doc.html` | modified | `#reader-template` gains the `<dialog class="modal diagram-modal">` markup (byte-identical in both, W17) and `tabindex="-1"` on `article.md` (edge case 21's focus fallback target). |
| `web/src/style.css` | modified | `.md figure.diagram`, `.diagram-enlarge`, `.diagram-error`, `dialog.diagram-modal[open]`, `.diagram-stage`, `.diagram-canvas`; toolbar buttons reuse the existing `.btn` class. |
| `web/src/reader/CLAUDE.md` | modified | Hand-written part: names `mermaid.ts`/`zoom.ts` as pure exemplars, `render/mermaid.ts` as not-Vitest-importable (W15). |
| `web/src/render/CLAUDE.md` | modified | Hand-written part: Owns line gains the diagram-pass modules; a gotcha for the backdrop-click pattern. |

## Decisions

- **DOMPurify's default profile keeps mermaid's `<style>` element — measured, no `ADD_TAGS` added** (Implementation Notes' open question). Built a throwaway probe page (`web/_mermaid-probe.html`, deleted before finishing) that ran the real installed mermaid 12.0.0 + DOMPurify 3.4.15 through Vite dev (bare `import "mermaid"`/`"dompurify"` so pre-bundling matched production) and rendered a flowchart. Result: `hasStyleRaw: true`, `defaultHasStyle: true` (no `ADD_TAGS` needed), a flowchart node's `getComputedStyle(...).fill` came back `"rgb(31, 32, 32)"` — non-default, confirming E2's fill assertion is satisfiable with the default profile alone. `ADD_TAGS: ["style"]` was tested too (`addTagsHasStyle: true`, same result) — redundant, not added.
- **REQ-11 needed an extra step beyond stripping mermaid's own sizing attrs.** mermaid emits `width="100%"` plus an inline `style="max-width: <intrinsic>px"`. Removing both (my first pass) still didn't make a wide diagram overflow: measured via a second throwaway probe, an inline `<svg>` with *no* width/height at all does not fall back to its `viewBox`'s own pixel size in this Chromium — the CSS replaced-element default-sizing algorithm instead stretches it to the containing block's width (a `4 4 7656 61` viewBox measured `computedSvgWidth: "796.188px"`, not ~7656px). Fix (`render/mermaid.ts`): after stripping, read `svgEl.viewBox.baseVal` and set `svgEl.style.width`/`height` explicitly in px from it. Re-measured: `svgClientWidth: 7656`, `figureScrollWidth: 798` vs `figureClientWidth: 798` in a plain container test, and E11's Focus-mode assertion (real E2E) now passes. Neither probe file was committed — both were written and deleted within this session (`web/_mermaid-probe.html`, `web/_wide-probe.html`, and their driver `.mjs` scripts).
- **`dialog.diagram-modal { display: grid; ... }` was unconditional in my first pass and broke every closed-dialog state** — this overrides the UA's own `dialog:not([open]) { display: none; }` the same way an author `display` rule beats `[hidden]` (kb:lesson/display-rule-overrides-hidden-attribute), just for `<dialog>`'s native open/closed state instead of the `[hidden]` attribute. Measured live: `npx playwright test e2e/reader-mermaid.spec.ts` initially failed 10/16 tests, every one timing out on `.diagram-stage ... subtree intercepts pointer events` because the "closed" dialog was still `display: grid` and sat on top of the page. Fixed by scoping the rule to `dialog.diagram-modal[open]`. Re-ran clean: 15/16 pass (see Handoff for the one remaining, unrelated finding).
- **E11's "compact tile" sub-assertion is a transient async-render race in the test, not a rendering defect** — see Handoff; not something I'm permitted to fix (`web/e2e/**` is e2e-specs' file) or that should be fixed by changing shared `openFile`/`selectRelative` behavior (out of this plan's scope, and risks `reader.spec.ts`'s existing re-fetch-on-click coverage).
- Toolbar buttons (`Zoom in`/`Zoom out`/`Reset zoom`/`Close`) carry the shared `.btn` class in addition to their own class, matching the confirm/launch dialogs' existing pattern, rather than inventing new button chrome — the plan's DOM sketch shows the minimum required classes/attributes, not an exhaustive list, and the Testable UI Elements table only pins role+name, which the extra class doesn't affect.
- Keyboard/toolbar `Zoom in`/`Zoom out`/`+`/`-` all zoom around the stage's own center point (not a remembered pointer position) — REQ-9 only specifies wheel-zoom as pointer-anchored; a stage-center anchor for the discrete controls is the conventional choice and doesn't affect the `data-zoom` numeric sequence E13 checks (only `zoomAround`'s zoom output depends on the factor, never the anchor point).
- Visual centering of the modal's fitted diagram is achieved by computing the canvas's own `left`/`top` CSS position (not the pan-state translate) once on open and on Reset zoom (W22), keeping `ZoomState`'s `x`/`y` at literal `0` for "no pan" — this is what makes `transform-origin: 0 0` (required for `zoomAround`'s point-invariance algebra, verified analytically: the standard "zoom around a point" formula only holds with a 0,0 origin) compatible with E14's literal `translate(0px, 0px)` expectation after Reset zoom, which a center-based `transform-origin` could not have given without breaking that algebra.
- Every REQ-1 through REQ-15 plus INV-1 through INV-5 is implemented; REQ-13 (`--sans` font) is read fresh in `render/mermaid.ts:readSansStack` at each `ensureInitialized` call rather than cached once, since it's cheap and avoids an assumption about the token never changing at runtime — no test exercises this, Reviewer-Verified per the plan.
- No protocol, schema, or daemon change — confirmed nothing under `internal/`/`cmd/` was touched.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 — clean. `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — `543 references checked, 0 missing`. `npm run -s lint` (Biome) — clean.

**Plan spec smoke run** (`web/e2e/reader-mermaid.spec.ts`, this plan's own spec — smoke check only, not a verdict): 15 of 16 pass, reproducibly, both at 4 workers (the suite default) and at `--workers=1` (rules out parallel-worker contention). The one failure:

- **`E11`'s second half ("...in a compact tile")**, `expect(tileOverflow).toBe(true)` at `e2e/reader-mermaid.spec.ts:391`, fails intermittently-but-reproducibly. Root cause, measured with a throwaway duplicate of the test (`web/e2e/_debug-e11.spec.ts`, written, driven, and deleted within this session — never committed): the test's own setup clicks `fileEntry(tileRegion, "wide.md")` on a file that's *already open* (carried over from the Focus half of the same test via the reader's per-session `openPath` memory) — `features/reader.ts`'s `selectRelative`/`openFile` unconditionally re-fetches and re-renders on any file click, open-or-not (pre-existing behavior, not introduced by this plan). That redundant click triggers a fresh `setReaderBody` (wiping the existing, already-correctly-overflowing `figure.diagram` back to a bare `<pre>`) followed by a new async `renderDiagrams` pass that takes tens of milliseconds (real ELK/dagre layout work for a 40-node flowchart) to re-produce the figure. `await expect(tileFigure.locator("svg")).toBeVisible())` can resolve on the *pre-click* figure (still present and visible right up until the fetch resolves) a moment before that wipe-and-rebuild happens, so the very next line's bare `.evaluate() → expect(...).toBe(true)` — which has no retry semantics, unlike a `toBeVisible()`/`toHaveAttribute()` matcher — can read mid-rebuild. Verified two ways: (1) an identical repro *without* the redundant `fileEntry(...).click()` (relying on the already-open file staying open across the Focus→Tiles view switch, which it does — same `ReaderInstance`, just relocated between hosts) passed 100% (3/3 runs); (2) wrapping the *same* final check in `expect.poll(..., { timeout: 2000 }).toBe(true)` passed 3/3 runs, and an immediate follow-up plain read after the poll settled was `true` every time — confirming the value is stable and correct once the async re-render finishes, not permanently wrong. This is a locator/assertion-timing gap in the authored spec, not a CSS or markup defect: e2e-specs' options at validate are dropping the redundant `fileEntry` click (the file is already open) or wrapping that one assertion in `expect.poll()`.

**W16** (`ls -l`/build-output numbers, from real builds, before this plan's changes and after):

| | Before | After |
|---|---|---|
| `bin/musterd` | `-rwxr-xr-x 1 bob    staff 21371136 … bin/musterd` | `-rwxr-xr-x 1 bob    staff 43044880 … bin/musterd` |
| `index` entry chunk | `index-BHSaM5U5.js` — 387566 bytes | `index-CCb6XLkC.js` — 387543 bytes |

"Before" is the tree exactly as `e2e-specs` left it (verified: `internal/webui/assets/assets/` had no mermaid chunk and matched the `index-BHSaM5U5.js` name test-specs.md's own REQ-12 live run used). The index entry chunk is essentially unchanged (387566 → 387543 bytes) — confirms REQ-4: mermaid is not in the eagerly-loaded entry chunk, only in its own lazily-loaded chunks. `bin/musterd` roughly doubled (+21.7 MB) because `//go:embed` now carries mermaid's full dependency tree (ELK, cytoscape, katex, dagre, every mermaid diagram-type chunk, and non-release sourcemaps) — inherent to ADR 1's "bundled, no CDN" choice, not something to trim from this side.

**E5's mermaid chunk filenames** (real build, for the `scriptRequestsContaining("mermaid")` locator, which passed as-is — no repair needed): `mermaid.core-NV-cKFwj.js` and `mermaid-parser.core-BLqPRre2.js` — both hashed names retain the literal substring `"mermaid"`, matching the test-specs.md-flagged assumption.

No test files needing changes I wasn't allowed to make, beyond the one named above (not a change — an observation for validate mode).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: review.md Critical 1 ("Changing the theme destroys the on-page
diagram once the enlarge modal has been opened") and Major 1 (`diagramId`'s doc comment
claims a safety property the code doesn't have; W14 unmet — ids aren't unique per pass).

**Changes made**:

| File | What and why |
|------|--------------|
| `web/src/render/diagramdialog.ts` | `close` handler now calls `refs.diagramCanvas.replaceChildren()` before restoring focus — empties the cloned `<svg>` (same `id` as the live figure's) that was otherwise left in the document past close, where a later theme re-render's `renderDiagramSvg(existingSvg.id, …)` could resolve against it instead of the live figure. |
| `web/src/render/diagrams.ts` | `rerenderDiagrams` gains an `instance: number` parameter and mints a fresh `diagramId(instance, n)` per figure in document order, instead of reusing `existingSvg.id`. Removes the whole "render against an id already present twice in the document" class, not just the dialog-clone instance of it. `DiagramPassOptions.instance`'s doc comment rewritten from "unique per reader instance (never per pass)" to "unique per reader instance *and* per pass" (W14's actual criterion). |
| `web/src/reader/mermaid.ts` | `diagramId`'s doc comment corrected — it no longer claims `instance` "is bumped once per render pass"; it now says the caller mints a fresh value per pass (matching what the other two comments already said, and what the code now actually does). |
| `web/src/features/reader.ts` | Removed the `private readonly diagramInstanceId = nextDiagramInstanceId++` field (a value fixed once per `ReaderInstance`'s lifetime, the root cause both of Major 1's unmet W14 and Critical 1's collision family). `openFile`'s `renderDiagrams` call and `handleThemeChange`'s `rerenderDiagrams` call each now draw a fresh `nextDiagramInstanceId++` at the point the pass starts, so every pass — including two concurrent ones (open A, switch to B before A's render returns) — gets a distinct id space. Updated the three doc comments that name this value (module-level `nextDiagramInstanceId`, the field docstring that used to sit on `diagramInstanceId`) to describe the new invariant instead of the old one. |

**Blast radius measured before editing** (per Fix Mode rule 6):
- `rg -n "rerenderDiagrams\(|diagramInstanceId|renderDiagrams\("  web/src web/e2e` — only
  `web/src/features/reader.ts` calls `renderDiagrams`/`rerenderDiagrams` or reads
  `diagramInstanceId`/`nextDiagramInstanceId`; `web/src/render/diagrams.ts` is the sole
  definition site. No test file references `rerenderDiagrams`, `DiagramPassOptions`, or
  `diagramInstanceId` — confirmed by `grep -rn "diagramId\|DiagramPassOptions"
  web/src/**/*.test.ts` returning only `web/src/reader/mermaid.test.ts`'s calls to the
  2-arg `diagramId(instance, n)` pure function, whose signature I left untouched (the
  fix changes what value callers pass as `instance`, never `diagramId`'s own arity), so
  that frozen test file needed no changes.

**Re-ran the reviewer's own repro (A–D), not just the suite.** Built a throwaway spec
(`web/e2e/_tmp-critical1-repro.spec.ts`, written, run, and deleted within this fix wave —
`git status` is clean of it) reproducing runs A and B exactly as the reviewer measured
them, against `make web-build build`'s real embedded binary and a real ELK/mermaid
render, one genuine `flow.md` fixture:

| Run | Steps | Before (review.md) | After (measured this session) |
|-----|-------|---------------------|-------------------------------|
| A | theme flip, modal never opened | 2 nodes, `viewBox="4 4 168 140"` | 2 nodes, `viewBox="4 4 168 140"` (unchanged, control) |
| B | enlarge → close → theme flip | 0 nodes, `viewBox: null`, 300×150 | **2 nodes, `viewBox="4 4 168 140"`** — matches A |

Also measured the dialog's `.diagram-canvas` child count immediately after close (via
`diagramDialogRaw`, since a closed `<dialog>` has no accessible role): **0**, confirming
the clone is actually removed, not merely hidden. Console output from the run:
`RUN A STATS {"viewBox":"4 4 168 140","nodes":2,"width":168,"height":140}`,
`RUN B STATS {"viewBox":"4 4 168 140","nodes":2,"width":168,"height":140}`,
`CANVAS CHILDREN AFTER CLOSE 0`. Runs C and D were not re-driven (C is a different code
path — `docChanged` replaces the body first, unaffected by this fix; D was the reviewer's
own external-manipulation control, already explained by the same mechanism this fix now
performs automatically on every close).

Also re-ran this plan's own authored spec as a smoke check (not a verdict):
`npx playwright test e2e/reader-mermaid.spec.ts` — **16/16 pass**, including E6 (theme
re-render) and E9 (two tiles, same file, distinct SVG ids — the concurrent-instance half
of W14 that this fix's id-minting also has to keep true).

**Decisions**: none beyond the two changes review.md specified — no new `deviation:` or
`doc-delta:` line. The Doc Delta's sentence flagged in review.md ("Diagrams follow the
dashboard theme and re-render when it changes") is accurate again now that Critical 1 is
fixed; no edit needed there.

**Gates re-run after the fix**: `npx tsc --noEmit` — clean. `npm run build` — clean (same
500 kB chunk-size warning the plan predicted, unrelated to this fix). `npm run lint`
(Biome) — clean. `npm run test` (Vitest) — 39 files, 1639 tests, all pass, unchanged from
before this fix (no test file needed editing). `python3
.claude/skills/orchestrate/scripts/dead-refs.py` — 568 references checked, 0 missing.
`bash web/scripts/e2e-lint.sh` — clean.

## Handoff (Fix Attempt 1)

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 — clean.

No test files needing changes I wasn't allowed to make. E6's own criterion/assertion gap
(Critical 2 / Major 2, "E6 cannot fail for the bug it exists to catch") is
`[e2e-specs]`/`[orchestrator]` scoped, not mine — nothing for me to do there beyond
confirming (above) that E6 now genuinely exercises the fixed path and passes.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: Major 1 [web-impl] — the close handler's comment at
`web/src/render/diagramdialog.ts` (then lines 119-123, now 119-124 after the edit) asserted
`rerenderDiagrams` is "keyed by that same id" and would resolve against the stale clone left
by the dialog. `render/diagrams.ts:99-108`/`:120` mints a fresh `diagramId(instance, n)` per
theme-flip pass rather than reusing the figure's existing id (that fix landed in the same
commit, `ce34fa0`, as this now-false comment), so the sentence was wrong the moment it
shipped — same species as cycle 1 Major 1.

**Changes made**: reworded the comment in `wireDiagramDialog`'s `close` listener
(`web/src/render/diagramdialog.ts`) to state that `rerenderDiagrams` no longer keys on the
clone's id, so `refs.diagramCanvas.replaceChildren()` here is defence in depth rather than
the only guard, while still being independently sufficient and worth keeping for dropping the
full SVG copy (plus its derived marker/gradient/filter ids) from the document between close
and the next open. The `replaceChildren()` line itself is untouched — words only, no
behaviour change. Swept the rest of the tree for other comments naming `rerenderDiagrams`,
`diagramId`, or `instance` (`rg -n "rerenderDiagrams|diagramId|keyed by" web/src --glob
'*.ts' -g '!*.test.ts'`): the only other prose hits are `render/diagrams.ts:99-108` (already
states "mints a fresh id per figure from `instance` rather than reusing the figure's existing
SVG id" — correct) and `features/reader.ts:136-142` (already states each pass "draws its own
fresh id... never a value fixed for this instance's lifetime" — correct); no third
disagreeing comment found.

**Decisions**: none — words-only fix, no `deviation:` or `doc-delta:` line.

**Gates re-run**: `npx tsc --noEmit` — clean. `npm run build` — clean (same pre-existing
500 kB chunk-size warning, unrelated). No behaviour changed, so the E6 repro (measured in Fix
Attempt 1 above) was not re-driven — this attempt touches only a comment string.
