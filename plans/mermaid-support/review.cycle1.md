# Review: Mermaid Support

**Plan**: mermaid-support
**Verdict**: needs-changes
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role review` — conventions (Stack, TypeScript/web, Composition roots, Testing, Comments, Knowledge records), the reader feature spec and its protocol contract slice (`sessions.reader`, `sessions.reader-file`), features=reader.

One Critical: the theme re-render destroys the on-page diagram once the enlarge modal has
been opened and closed. Found in the browser, not by a test — every gate is green, because
E6 asserts only that `data-mermaid-theme` flipped, never that a diagram survived the flip.
Everything else in the plan is implemented, and implemented well.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 fences render | Yes | E2, E7, E12 | pass |
| REQ-2 ELK, bundled, no registration | Yes | E12, E15; W23 check | pass |
| REQ-3 pinned 12.0.0, bundled, same-origin | Yes | W4 check, E5, E10 | pass |
| REQ-4 dynamic import, lazy | Yes | E5; W5 check; W16 measured | pass |
| REQ-5 security surface | Yes | E4 + code read | pass |
| REQ-6 failure keeps source with reason | Yes | E3; verified by hand | pass |
| **REQ-7 theme map + re-render** | **No — breaks after enlarge** | E6 (cannot detect it) | **FAIL** |
| REQ-8 enlarge modal, focus restore | Yes | E8, E9, E10; by hand | pass |
| REQ-9 zoom/pan, clamp | Yes | E13, E14; by hand | pass |
| REQ-10 late results discarded | Yes | code read (W12) + REQ-10 spec | pass |
| REQ-11 wide diagram scrolls its figure | Yes | E11 + soak | pass |
| REQ-12 heading ids/outline untouched | Yes | REQ-12 pin | pass |
| REQ-13 `--sans` font | Yes | by hand (see Manual Verification) | pass |
| REQ-14 sequential, unique ids | Partly — not unique across passes | none | fail (Major 1) |
| REQ-15 failure text selectable | Yes | `user-select: text`; seen by hand | pass |
| DIAG | none — `kb for` on every changed file returns decisions only, no `kb:diagram/` record | — | pass |

## Build & Tests

E2E tests: **pass** (371 passed, full suite, 2.2m) — plus `make e2e-soak SPEC=reader-mermaid.spec.ts N=10` → 160 passed, 10/10 repeats of the repaired E11 green.
Daemon tests: pass (`make test`, all packages ok) — no Go file changed.
Web tests: pass (39 files, 1639 tests)
Daemon build: pass (`go build ./...`)
Web build: pass (`npm run build`; Vite's 500 kB warning fires as the plan predicted, not raised or silenced)
Lint: pass (`make lint` 0 issues; Biome clean; `make contrast` 43 pairs × 3 themes, 0 failures; `sh web/scripts/e2e-lint.sh` clean, and it is wired into `npm run e2e`)
`make check-kb`: **fail — the 4 known "owned by no feature" problems only** (`web/e2e/reader-mermaid.spec.ts`, `web/src/render/{diagrams,diagramdialog,mermaid}.ts`). These are doc-reconcile's, already recorded in `plans/mermaid-support/doc-delta.md`; no other kb problem. Not a finding.

## Acceptance Checks

`.claude/skills/orchestrate/scripts/gates.sh mermaid-support --checks-only` — 9 lines, 0 failed.

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make web-lint` | pass |
| W4 | `rg -q '"mermaid": "12\.0\.0"' web/package.json` | pass |
| W5 | no static mermaid import | pass |
| W6 | no HTML-string assignment in reader-owned modules | pass |
| W11 | `bindFunctions(` absent | pass |
| W23 | no layout-loader registration / ELK add-on | pass |
| E1 | `make e2e` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass (see below) |

**DOC detail.** No `deviation:` line appears in any log, so no ADR is owed; the five ADRs the
plan names all exist, `status: proposed`, `refs: [plan:mermaid-support, …]`. No `doc-delta:`
line was emitted, and `doc-delta.md` already carries the orchestrator's `e2e` glob amendment.
`TODO.md`'s mermaid block is still open and the ADRs are still `proposed` — both are
Completion-step items the plan explicitly schedules there, not omissions. The Doc Delta's
sentence is accurate against the code **except** its clause "Diagrams follow the dashboard
theme and re-render when it changes", which Critical 1 currently falsifies; it becomes true
again with that fix, so the delta needs no edit, only the fix before it lands.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7 | `mermaidThemeFor` table | pass | `reader/mermaid.test.ts:24-35` — all six cells (`light`, `instrument`, `dark`, `""`, `null`, unrecognised) |
| W8 | `isMermaidLanguageClass` table | pass | `reader/mermaid.test.ts:8-22` — all nine cells |
| W9 | `diagramErrorText` | pass | `reader/mermaid.test.ts:37-75` — prefix, first non-empty line, trim, 200-char cap, empty/blank/non-`Error` fallbacks |
| W10 | mermaid config + DOMPurify profiles | pass | `render/mermaid.ts:47-55` (`startOnLoad:false`, `securityLevel:"strict"`, `htmlLabels:false` root **and** `flowchart`, `suppressErrorRendering:true`), `:79-82` (`RETURN_DOM_FRAGMENT`, `USE_PROFILES {html, svg, svgFilters}`, no `ADD_TAGS`, no `ADD_ATTR`, no `ALLOW_UNKNOWN_PROTOCOLS`) |
| W11 | `bindFunctions` never invoked | pass | `render/mermaid.ts:78` destructures `{ svg }` only; grep over `web/src` clean |
| W12 | `isCurrent()` before every DOM write | pass | `render/diagrams.ts:81` and `:123`, both after the await and before any mutation |
| W13 | pass reads/writes only `pre > code` fences | pass | `render/diagrams.ts:27-32, 47-52, 83-89`; no heading selector anywhere in the module |
| W14 | ids unique per instance **and per pass** | **fail** | `features/reader.ts:135` — `diagramInstanceId` is minted once per `ReaderInstance`, never per pass (Major 1) |
| W15 | `reader/CLAUDE.md` names the pure/impure split | pass | `web/src/reader/CLAUDE.md:6-8, 17-19` |
| W16 | real measured sizes in the impl log | pass | re-measured independently: `bin/musterd` 43,044,880 (log: identical); entry chunk `index-CCb6XLkC.js` 387,543 (log: identical) and it contains zero occurrences of `mermaid`; asset-tree delta 21.61 MB vs the log's 21.67 MB binary delta — consistent to ~60 kB of embed overhead, so the "before" 21,371,136 stands up |
| W17 | dialog markup byte-identical in both templates | pass | extracted both `<dialog …>…</dialog>` blocks and compared — identical |
| W18 | failure text always from `diagramErrorText` | pass | `render/diagrams.ts:76` is the only producer; `suppressErrorRendering:true` plus parse-before-render keeps mermaid's error SVG out |
| W19 | theme handler awaits the in-flight pass; observer disconnected | pass | `features/reader.ts:390-395` chains on `this.diagramPass`; `:198` disconnects in `dispose` |
| W20 | dialog shows a clone | pass | `render/diagramdialog.ts:89` `svg.cloneNode(true)` |
| W21 | `zoom.ts` table | pass | `reader/zoom.test.ts` — clamp both bounds, `wheelFactor` sign + inverse, `zoomAround` invariance at 2 states × 2 factors × 3 points plus an overshoot case, `panBy`, `fitScale` wide/tall/degenerate, `resetZoom` |
| W22 | non-passive wheel + `preventDefault`; `fit` on open/reset only | pass | `render/diagramdialog.ts:132-146` (`{ passive: false }`, `event.preventDefault()`); `computeFitAndCenter` called only from `open` and `resetToFit` |
| E2–E15 | assertions match each criterion's text | pass except E6 | read every test against its criterion; E6's assertion is strictly weaker than REQ-7 (Critical 2) |

**Repairs table** (`test-specs.md` § Repairs, one row): Repair #1 dropped a redundant
`fileEntry(tileRegion, "wide.md").click()` from E11. Both positive assertions survive
verbatim — `tileFigure.scrollWidth > tileFigure.clientWidth` is `true` and `article.md`'s is
`false`, in Focus and in the tile. Nothing was deleted, skipped, weakened, or replaced by a
container-level `toBeVisible()`, and the soak (10/10) shows the race is fixed rather than
dodged. Fixture payloads are genuine mermaid source, not synthesized wire shapes.

## Hard-Rule Checklist

Web-only plan; `git diff main...HEAD` touches no file under `internal/` or `cmd/`.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no Claude-Code field name in any changed file |
| 2 | No terminal-output state parsing | pass — `capture-pane` absent |
| 3 | Non-blocking hook handler | pass — no daemon change |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — no tmux call added |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass as a data-absence rule — but see Critical 1, which renders an empty framed box where a diagram was |
| 7 | Session identity on the tmux target | pass |
| 8 | No `~/.claude/settings.json` trespass | pass |
| 9 | No real `claude` outside canary/probes | pass — spec fakes Claude Code via `envelopedSessionStart`/`rawPostToolUse` throughout |

Design system: every new colour resolves to a semantic token (`--bg-hover`, `--line`,
`--fg-muted`, `--well`); no literal, no web font, no new token, `make contrast` green. No
displayed value changes over time in the new UI (`data-zoom` is an attribute, the toolbar
reads `+ − fit Close`), so no `tabular-nums` obligation. No `hidden` attribute is toggled by
the new code, so no `[hidden]` companion is owed. Terminal rules §7: untouched. Composition
roots: `web/src/main.ts` is not in the diff; `render/reader.ts` gains one `wireDiagramDialog(refs)`
line, which is the sanctioned one-line registration.

## Manual Verification

Drove the real app in Chromium against a scratch daemon (throwaway specs under `web/e2e/`,
written, run, and deleted within this review — `git status` is clean). Fixture: a genuine kb
mermaid fence copied from `docs/diagrams/pipeline-execution-order.md`, plus one deliberately
malformed fence.

Confirmed by hand, reading the rendered page and the measured DOM rather than a test's verdict:

- **Rendered diagram** — the pipeline flowchart draws fully in the instrument theme, ELK
  layout, legible node text, grounded in the `--bg-hover` figure with its 1px `--line` border.
- **REQ-13** — the SVG's own `<style>` reads
  `font-family:system-ui,-apple-system,"Segoe UI",sans-serif` — the dashboard's `--sans`, not
  mermaid's default face. This is the only evidence for REQ-13; no test covers it.
- **REQ-6** — the failure line reads `diagram not rendered: Parse error on line 4:` — real
  mermaid text, not a placeholder — with the fenced source kept directly above it.
- **REQ-8/REQ-9** — `Enlarge diagram` opens the modal fitted (`data-zoom="1.00"`, canvas
  `translate(0px, 0px) scale(0.782641)` — `fit` folded into the scale, pan at literal zero);
  two `Zoom in` clicks read `1.56` (= 1.25², as REQ-9 specifies) and the SVG stays crisp, not
  resampled. Escape closes and focus returns to the button.
- **REQ-11** — figure `scrollWidth/clientWidth` 678/678 and `article.md` 744/744 for a
  narrow diagram (no spurious scrollbar); the wide case is E11's, green under soak.
- **REQ-7 — this is where it broke.** After choosing `Light` in Settings, the figure is an
  **empty grey box**: `data-mermaid-theme` reads `default`, so E6 is satisfied, but the SVG
  inside has `viewBox: null`, zero `.node` elements and the 300×150 default replaced-element
  size. It never recovers, and flipping back to `instrument` does not restore it. Isolated to
  the enlarge path by three further runs — see Critical 1.

Not verified: the pop-out's theme behaviour (the plan's edge case 8 states the observer is
inert there because `/doc.html` has no live theme sync) and the engine-chunk-fails-to-load
path (edge case 15, not drivable).

## Issues

### Critical

1. **[web-impl]** **Changing the theme destroys the on-page diagram once the enlarge modal
   has been opened.** REQ-7 is a Must Have and this is a plain user path: open a doc with a
   diagram → `Enlarge diagram` → close → change the theme in Settings. The figure becomes an
   empty framed box and stays that way.

   *Cause, measured.* `render/diagramdialog.ts:115-123` — the `close` handler restores focus
   and clears `drag`, but never empties `refs.diagramCanvas`, so the cloned `<svg>` stays in
   the document carrying **the same `id` as the live figure's SVG** (`open` at `:89` clones
   the node wholesale, id included). `render/diagrams.ts:116` then re-renders with
   `renderDiagramSvg(existingSvg.id, source, theme)` — an id that is now present twice in the
   document — and mermaid's render resolves against the stale clone: afterwards the clone in
   `.diagram-canvas` carries `class="flowchart" style="max-width: 16px;" viewBox="-8 -…"`
   while the figure is left with an SVG that has no `viewBox` and no nodes.

   *Four runs isolate it.* (A) theme flip with the modal never opened → 2 nodes,
   `viewBox="4 4 168 140"`, correct. (B) enlarge → close → theme flip → 0 nodes,
   `viewBox: null`, 300×150. (C) enlarge → close → `docChanged` re-fetch → correct (that path
   replaces the body first, so the figure's own SVG is already gone). (D) enlarge → close →
   empty `.diagram-canvas` from outside the app → theme flip → **correct again**, 2 nodes,
   `viewBox="4 4 168 140"`.

   *Fix.* (D) shows one line closes it: `refs.diagramCanvas.replaceChildren()` in the `close`
   handler — which also stops a closed modal holding a full SVG copy alive. Please pair it
   with the durable half: never render with an id that is already in the document. Minting a
   fresh id per render in `rerenderDiagrams` (instead of reusing `existingSvg.id`) removes the
   whole class, and subsumes Major 1.

2. **[e2e-specs]** **E6 cannot fail for the bug it exists to catch** —
   `web/e2e/reader-mermaid.spec.ts:178-200`. It asserts `data-mermaid-theme` flips to
   `"default"` and that `/reader/file` was not re-fetched, and nothing about the diagram. In
   `render/diagrams.ts` the attribute is written at `:128`, one line *after*
   `button.replaceChildren(fragment)` at `:127`, so the attribute flips just as reliably when
   the fragment is degenerate — which is exactly what ships today. A green E6 over a wiped
   diagram is a vacuous pass. Add an assertion that the diagram survived the flip (a `.node`
   count, a `viewBox`, or a label still visible inside `figure.diagram svg`), and drive the
   failing order: enlarge → close → flip. REQ-7's Coverage row claims E6 covers it; it does
   not yet.

### Major

1. **[web-impl]** **`diagramId`'s doc comment states a safety property the code does not
   have, and W14 is unmet.** `web/src/reader/mermaid.ts:44-46` says `instance` is "bumped once
   per render pass so a re-render never reuses a stale id". It is bumped once per
   `ReaderInstance` (`features/reader.ts:135`, `nextDiagramInstanceId++` in a field
   initializer) — and both other comments on the same value say so correctly
   (`render/diagrams.ts:16-20` "never per pass", `features/reader.ts:131` "fixed for this
   instance's lifetime"), so one of the three is simply wrong. The consequence is W14's
   "unique per reader instance **and per pass**": two passes of one instance mint identical
   mermaid ids, which is the same collision family as Critical 1 — two concurrent passes (open
   file A, switch to B before A's render returns) both call `mermaid.render("muster-diagram-N-0", …)`.
   Fix the comment; making the id pass-unique fixes the criterion and Critical 1's durable
   half in the same edit.

2. **[orchestrator]** **E6's criterion text, as written in the plan, cannot detect a destroyed
   diagram.** "choosing `Light` in Settings makes the figure read `data-mermaid-theme="default"`
   with no further request to `/reader/file`" pins an attribute and a negative, never that a
   diagram is still there — so a spec that transcribes it faithfully (as this one did) is
   blind to Critical 1. REQ-7 says "re-renders", and the criterion should carry a clause that
   says so. Plan text, so no pipeline agent may edit it.

### Minor

1. **[web-tests]** `web/src/reader/mermaid.test.ts:87` — the case title reads "gives the same
   fence position a distinct id across passes (a re-render never reuses a stale id)". The
   assertion (`diagramId(1, 0) !== diagramId(2, 0)`) is correct about the function, but the
   parenthetical claims the shipped behaviour of Major 1, which is false: a re-render *does*
   reuse the id. Reword to describe what is tested — that `diagramId` is injective in
   `instance` — without asserting the caller varies it.

2. **[orchestrator]** W6's amended command is right to match assignment over mention, and I
   confirm the amendment's measurements: the only two bare-token hits in scope are
   `web/src/reader/markdown.ts:8` and `web/src/reader/CLAUDE.md:21`, both pre-existing on
   `main`, both stating the rule; `web/src` performs no HTML-string assignment at all. It is
   stronger than the original for `outerHTML` and `insertAdjacentHTML`, but slightly narrower
   in one spot: `innerHTML\s*=` does not match `innerHTML += …`, which the bare token did.
   Nothing in the tree uses `+=`, so this changes no verdict — `innerHTML\s*\+?=` would close
   it for the next plan that inherits the block.

### Notes

1. **[note]** The E13 amendment is sound. From the clamped `8.00`, dividing by `1.25` gives
   `0.3518` at fourteen presses and first reaches the `0.25` floor at the sixteenth
   (`0.2252`, clamped); fifteen reads `0.28`. `sixteen` is the only value consistent with
   REQ-9's factor and INV-5's clamp, and the spec presses `-` sixteen times.
2. **[note]** REQ-5's security surface holds as specified: `securityLevel: "strict"`, HTML
   labels off at both levels, `suppressErrorRendering: true`, `startOnLoad: false`, the SVG
   crossing DOMPurify with `html`+`svg`+`svgFilters` and `RETURN_DOM_FRAGMENT`, no `ADD_TAGS`
   / `ADD_ATTR` / `ALLOW_UNKNOWN_PROTOCOLS` widening, and `bindFunctions` never destructured.
   E4's fixture genuinely carries a `<script>` label, an `onerror` label, a `javascript:`
   `click` and a `securityLevel: "loose"` init directive — it is not a vacuous check.
3. **[note]** The implementer's two self-reported fixes both check out. The
   `dialog.diagram-modal[open]` scoping is present and correctly explained in the CSS comment.
   The explicit px `width`/`height` from `viewBox.baseVal` (`render/mermaid.ts:95-105`) is the
   real reason a wide diagram overflows: stripping mermaid's `width="100%"` and inline
   `max-width` alone leaves the SVG to the replaced-element default sizing, which stretches it
   to the containing block. E11 plus the soak back this.
4. **[note]** The REQ-10 spec holds `flow.md`'s *file fetch*, so it exercises the reader's
   pre-existing `fetchSeq` guard rather than the diagram pass's own `isCurrent()` — the body
   for `flow.md` is never set, so `renderDiagrams` never runs for it. That is fine: the plan
   assigns edge case 5 to W12 (Reviewer-Verified), and I verified both guard sites by code
   read. Worth knowing the coverage table's REQ-10/INV-4 row rests on the code read, not the
   test.
5. **[note]** mermaid's built-in `dark` theme draws edge labels on a light chip, which reads
   as a pale patch on the instrument ground (visible on "implementation-bug" in my run). It is
   mermaid's own theme, and `kb:adr/reader-diagram-theme-maps-to-builtin-themes` deferred
   token theming deliberately — recording it only so the deferral is a known cost.
6. **[note]** `make check-kb`'s four "owned by no feature" problems are doc-reconcile's per
   `doc-delta.md`; the tree cannot reach a green `check-kb` before that step, and no other kb
   problem exists.
