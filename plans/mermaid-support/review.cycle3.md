# Review: Mermaid Support

**Plan**: mermaid-support
**Verdict**: needs-changes
**Cycle**: 3 (full re-review — cycle 2's single open issue was a Major, not Minors only)
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role review` — 10491 words (over the
8000-word budget, warned): conventions (Stack, Go, TypeScript/web, Composition roots, Testing,
Commits, Comments, Knowledge records), the reader feature spec and its protocol contract slices
(`sessions.reader`, `sessions.reader-file`, `docChanged`, the Session object),
`kb:diagram/pipeline-execution-order`, 8 accepted reader ADRs, the plan's 5 `proposed` ADRs, and
11 lessons for this role. features=reader.

Cycle 2's Major is genuinely fixed and the new comment is accurate in every clause. Every gate is
green: `make e2e` 371/371, a 10× soak 160/160, all 9 authored checks, and I re-drove the feature
in a real browser and read the numbers off the live DOM.

**One Major remains, and it is the same species a third time — in the one directory the previous
sweeps never searched.** `web/e2e/reader-mermaid.spec.ts:192-194` still states that the close
handler is what stops a later re-render resolving against the stale clone. That is the exact
proposition cycle 2's Major removed from `diagramdialog.ts`, and this plan's own
`test-specs.md` records the measurement that disproves it.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 fences render | Yes | E2, E7, E12; measured live | pass |
| REQ-2 ELK, no registration | Yes | E12, E15; W23 check | pass |
| REQ-3 pinned 12.0.0, bundled, same-origin | Yes | W4 check, E5, E10 | pass |
| REQ-4 dynamic import, lazy | Yes | E5; W5 check; W16 measured (entry chunk 387,566 → 387,543 B, re-confirmed 387.54 kB in my own build) | pass |
| REQ-5 security surface | Yes | E4 + code read (`render/mermaid.ts:47-55, 79-82`) | pass |
| REQ-6 failure keeps source with reason | Yes | E3; measured live (`diagram not rendered: Parse error on line 4:`, kept source 1, other figure 1) | pass |
| REQ-7 theme map + re-render | Yes | E6; measured live both directions | pass |
| REQ-8 enlarge modal, focus restore | Yes | E8, E9, E10; measured live | pass |
| REQ-9 zoom/pan, clamp | Yes | E13, E14, W21; measured live | pass |
| REQ-10 late results discarded | Yes | code read (W12), REQ-10 spec | pass |
| REQ-11 wide diagram scrolls its figure | Yes | E11 + soak 10/10 | pass |
| REQ-12 heading ids/outline untouched | Yes | REQ-12 pin | pass |
| REQ-13 `--sans` font | Yes | measured live (see Manual Verification) — still the only evidence; no test covers it | pass |
| REQ-14 sequential, unique ids | Yes | W14 + measured live (0 duplicate ids after every pass) | pass |
| REQ-15 failure text selectable | Yes | `user-select: text` (`style.css`) | pass |
| DIAG | none — `kb for` on all 11 changed source/spec/template files returns 0 `kb:diagram/` records | — | pass |

The plan's own `## Diagrams` sequence diagram covers the open path only, as its prose says, and is
still accurate for it; it is a plan diagram, not a kb record, so nothing is owed.

## Build & Tests

E2E tests: **pass** — `make e2e`, **371 passed (2.3m)**, full suite from the repo root, nothing
building beside it (kb:lesson/concurrent-build-invalidates-running-e2e). Plus `make e2e-soak
SPEC=reader-mermaid.spec.ts N=10` → **160 passed (1.6m)**, 10/10 repeats of the repaired E11 and
the rewritten E6.
Daemon tests: pass — `make test`, every package `ok`. No Go file changed on this branch.
Web tests: pass — `make web-test`, 39 files, 1639 tests.
Daemon build: pass — `go build ./...`, exit 0.
Web build: pass — `make web-build`; Vite's 500 kB chunk warning fires as the plan predicted,
neither raised nor silenced.
Lint: pass — `make lint` 0 issues; `make web-lint` 160 files clean; `make contrast` 43 pairs × 3
themes, 0 failures; `make e2e-lint` clean.
`make check-kb`: **fail — exactly the 4 "owned by no feature" problems and nothing else**
(`web/e2e/reader-mermaid.spec.ts`, `web/src/render/{diagrams,diagramdialog,mermaid}.ts`), 363
records / 23 features. Step 7 doc-reconcile's, recorded in `doc-delta.md` including the `e2e` glob
amendment. Not a finding.

## Acceptance Checks

`.claude/skills/orchestrate/scripts/gates.sh mermaid-support --checks-only` — **9 lines, 0 failed.**
Every line run verbatim by the gates runner, not by hand (kb:lesson/rg-shim-invisible-to-bare-subshell).

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `make web-lint` | pass |
| W4 | `rg -q '"mermaid": "12\.0\.0"' web/package.json` | pass |
| W5 | `! rg -n '^import [^t].*from "mermaid"' web/src` | pass |
| W6 | `! rg -n 'innerHTML\s*\+?=\|outerHTML\s*\+?=\|insertAdjacentHTML' -- <reader-owned modules>` | pass |
| W11 | `! rg -n "bindFunctions\(" web/src` | pass |
| W23 | `! rg -n "registerLayoutLoaders\|layout-elk" web/src web/package.json` | pass |
| E1 | `make e2e` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

**DOC detail.** No `deviation:` line in any log (`web-implementation.md:109` and `:154` state this
explicitly for both fix waves), so no ADR is owed. All five ADRs exist, `status: proposed`, each
carrying `refs: [plan:mermaid-support, …]`, listed by `kb ls --feature reader --status proposed`.
No `doc-delta:` line was emitted by any wave, and `doc-delta.md` carries the orchestrator's `e2e`
glob amendment. I checked the Doc Delta's prose clause by clause against what shipped rather than
against the code's intent: "imported only when a document contains a fence" (E5 + `renderDiagrams`
returning before the import when `findFences` is empty), "bundled into the binary, never fetched"
(E5/E10 origin trackers), "SVG crosses DOMPurify like the markdown does" (`render/mermaid.ts:79`),
"keeps its fenced source with a labelled reason beneath" (measured live), "follow the dashboard
theme and re-render when it changes" (measured live, both directions), "each enlarges into a modal
with zoom and pan" (measured live). Nothing in the delta overstates the code. `TODO.md`'s block and
the ADR status flips are Completion-step items the plan schedules there.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7, W8, W9 | full Vitest tables | pass | read `web/src/reader/mermaid.test.ts` — 9 `isMermaidLanguageClass` cells, 6 `mermaidThemeFor` cells (incl. `""` and `null`), 7 `diagramErrorText` cases covering multi-line, trim, the 200-char cap, empty, whitespace-only and non-`Error` |
| W21 | zoom arithmetic | pass | read `zoom.test.ts` — clamp at both bounds, `wheelFactor` sign and inverse, `zoomAround` point-invariance at 3 points × 2 factors **plus an overshoot-the-clamp case**, `panBy`, `fitScale` wide/tall/degenerate, `resetZoom`, `transformOf` |
| W10 | mermaid init + sanitize options | pass | `render/mermaid.ts:47-55` (`startOnLoad:false`, `securityLevel:"strict"`, `htmlLabels:false` root **and** flowchart, `suppressErrorRendering:true`) and `:79-82` (`RETURN_DOM_FRAGMENT`, `html`+`svg`+`svgFilters`) |
| W12 | `isCurrent()` re-checked before every DOM write | pass | `diagrams.ts:82-83` and `:124-125`, each immediately before the only mutation in its loop |
| W13, W14 | touches only `pre > code` fences; ids per pass | pass | `findFences` is the only query in `renderDiagrams`; both call sites draw `nextDiagramInstanceId++` synchronously (`features/reader.ts:312`, `:399`) and those are the only two callers in the tree |
| W15 | CLAUDE.md hand-written parts | pass | `web/src/reader/CLAUDE.md` names `mermaid.ts`/`zoom.ts` as pure exemplars and `render/mermaid.ts` as not Vitest-importable; `web/src/render/CLAUDE.md` names all three new modules |
| W16 | real build numbers | pass | `web-implementation.md:44-51` carries `ls -l` output (21,371,136 → 43,044,880) and both entry-chunk names/sizes; my own build reproduced 387.54 kB |
| W17 | dialog markup byte-identical | pass | extracted both `<dialog class="modal diagram-modal">…</dialog>` blocks and `diff`ed — no output |
| W18 | failure text always from `diagramErrorText` | pass | `diagrams.ts:78` is the only producer of the error string; `suppressErrorRendering: true` |
| W19 | theme handler awaits in-flight pass, observer disconnected | pass | `features/reader.ts:400-408` chains on `this.diagramPass`; `instance` drawn before the chain; observer disconnected in `dispose` |
| W20 | dialog holds a clone | pass | `diagramdialog.ts:89` `svg.cloneNode(true)`; measured live, canvas child count 1 while open, 0 after close |
| W22 | non-passive wheel; `fit` on open/reset only | pass | `diagramdialog.ts:139-153` `{ passive: false }` + `preventDefault()`; `computeFitAndCenter` called only from `open` and `resetToFit` |
| E2–E15 | assertions match each criterion | pass | read every test against its criterion; E13's sequence matches the amended sixteen-press arithmetic, E6 matches the amended survival clause clause for clause |

**Repairs tables.** Two, both re-verified this cycle. Validate attempt 1's E11 row drops a
redundant click and keeps both positive assertions verbatim (soak 10/10, re-run by me). The cycle-1
fix row for E6 **added** four assertions (`viewBox` `/\S/`, `.node` count 2, both labels) and
deleted, skipped or weakened none. No assertion anywhere was replaced by a container-level
`toBeVisible()`. Fixture payloads are genuine mermaid source fed to the real bundled engine, not
synthesized wire shapes — `helpers/reader.ts:108-113` says so and the sources bear it out.

## Manual Verification

Drove the real app in Chromium against a scratch daemon with a throwaway probe spec, written, run
and deleted inside this review (`git status --porcelain` empty afterwards; the probe is not in the
diff). Fixture: `writeMermaidFixture`'s `flow.md` (`flowchart TD / A --> B`) and `broken.md`. Every
value below was read off the live DOM.

- **Initial render** — `id="muster-diagram-0-0"`, `viewBox="4 4 168 140"`, 2 `.node` elements,
  `data-mermaid-theme="dark"`, 19 `muster-diagram-*` ids in the document, **0 duplicates**.
- **REQ-13** — computed `font-family` on a node's `<text>` is
  `system-ui, -apple-system, "Segoe UI", sans-serif` — the dashboard's `--sans`, not mermaid's face.
- **REQ-8 enlarge** — `data-zoom="1.00"`, canvas holds 1 child, transform
  `translate(0px, 0px) scale(4.52143)` (fit folded into the scale, pan at literal zero),
  `document.activeElement` is `.diagram-stage`.
- **REQ-9 keyboard** — `+` → `1.25`; `0` → `1.00` with transform back to
  `translate(0px, 0px) scale(4.52143)`.
- **Close** — exactly 1 `dialog.diagram-modal` in the root (INV-3), canvas child count **0**,
  focus back on `.diagram-enlarge`.
- **Duplicate-id window** — 38 ids with **19 duplicates** while the modal is open, back to 19 with
  0 duplicates after close. This is the measurement behind cycle 2's note 1, reproduced.
- **REQ-7 / cycle-1 Critical 1, the order that broke it** — enlarge → close → flip to `Light`:
  `id="muster-diagram-1-0"`, `viewBox="4 4 168 140"`, **2 nodes**, theme `default`, 0 duplicate
  ids. Flipping back to `Instrument`: `muster-diagram-2-0`, same viewBox, 2 nodes, theme `dark`.
  Recovers in both directions.
- **REQ-6** — `broken.md` renders `diagram not rendered: Parse error on line 4:` with the kept
  `pre > code.language-mermaid` count at 1 and the valid fence's figure at 1.

Not verified, unchanged from cycles 1–2: the pop-out's theme behaviour (edge case 8 — the observer
is inert on `/doc.html`) and the engine-chunk-fails-to-load path (edge case 15, not drivable
without killing the daemon, which fails the file fetch first).

## Hard-Rule Checklist

`git diff main...HEAD --name-only` names no file under `internal/` or `cmd/` — no Go code changed
on this branch. Greps below run over the 11 source, spec, helper and template files the plan touches.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no `hook_event_name` / `rate_limits` / `permission_mode` / `transcript_path` in any changed file |
| 2 | No terminal-output state parsing | pass — `capture-pane` absent |
| 3 | Non-blocking hook handler | pass — no daemon change |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — no hit in any changed file |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass — a failed fence is labelled, never blanked; the destroyed-diagram case cycle 1 qualified this on is fixed and re-measured above |
| 7 | Session identity on the tmux target | pass |
| 8 | No `~/.claude/settings.json` trespass | pass — no `settings.local.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — Claude Code faked via `envelopedSessionStart`/`rawPostToolUse` throughout, in the spec and in my probe |

**Web conventions.** No `any`, no `as any`, no `@ts-ignore`, no `biome-ignore` in any new module.
No `innerHTML`/`outerHTML`/`insertAdjacentHTML` anywhere in the changed files (W6 is the
mechanical gate; I also grepped the two files W6's path list does not name). No second WebSocket,
no new dependency beyond the pinned `mermaid` 12.0.0. Composition roots honoured:
`web/src/main.ts` is not in the diff, and `render/reader.ts` gains one `wireDiagramDialog(refs)`
line — the sanctioned one-line registration (docs/conventions.md § Composition roots). The pure/DOM
split holds: `reader/mermaid.ts` and `reader/zoom.ts` import nothing DOM-shaped and are fully
Vitest-covered; `render/mermaid.ts` is the only module naming the engine.

**Design system.** Every colour in the CSS diff resolves to a semantic token (`--bg-hover`,
`--line`, `--fg-muted`, `--well`); no hex, `rgb()`, `hsl()` or named literal in any declaration —
the one `rgb(31, 32, 32)` under `web/src` is a measured value quoted inside `render/mermaid.ts:67`'s
doc comment. No web font, no `@import`, no `@font-face`. `--term` correctly absent: the modal stage
recesses on `--well`. `make contrast` green in all three themes. `.md figure.diagram` mirrors
`.md pre`'s token pair and `margin: 0 0 10px`, and the codebase defines no spacing tokens, so the
raw px matches the surrounding convention. No state colour is used and no displayed value changes
over time in the new UI (`data-zoom` is an attribute; the toolbar reads `+ − fit Close`), so no
`tabular-nums` obligation arises. The new code toggles no `hidden` attribute, so no `[hidden]`
companion is owed — and `dialog.diagram-modal[open]` is correctly scoped so the author
`display: grid` never overrides the UA's `dialog:not([open]) { display: none }`, the same trap as
kb:lesson/display-rule-overrides-hidden-attribute; the CSS comment records the live measurement
that found it. Honesty rules §6: a degraded fence is labelled with mermaid's own reason, never
hidden and never a blank frame. Terminal rules §7: untouched — no live client, no geometry, no
`resize-pane`.

**Accessibility.** `dialog` has `aria-label="Diagram"`; all four toolbar buttons and the enlarge
button carry accessible names matching the Testable UI Elements table exactly; the stage is
`tabindex="0"` and receives focus on open, with Tab reaching the toolbar and Escape handled
natively by `<dialog>`. Focus returns to the opener on close, with an `isConnected` fallback to
`article.md` for the re-rendered-body case.

## Issues

### Critical

None.

### Major

1. **[e2e-specs]** **A third comment asserting the close handler is what prevents the stale-clone
   collision — this one in the E2E spec, which neither previous sweep searched.**
   `web/e2e/reader-mermaid.spec.ts:192-194`, in E6:

   > Drive the order that breaks it (review cycle 1 Critical 1): enlarge, close, then
   > flip the theme. **The close handler must empty the dialog's cloned SVG so the later
   > re-render can't resolve against a stale clone sharing the live figure's id.**

   The second sentence is the same false proposition cycle 2's Major removed from
   `render/diagramdialog.ts`. `rerenderDiagrams` (`render/diagrams.ts:120`) mints
   `diagramId(instance, n)` fresh on every pass, so a later re-render **cannot** resolve against
   the clone whether or not the close handler cleared it. This plan's own
   `test-specs.md` § "Proving the new assertion is not vacuous", step 1, records the measurement:
   reverting `refs.diagramCanvas.replaceChildren()` alone left E6 **green**. Cycle 2's reviewer
   reproduced it independently. So the comment tells a maintainer that deleting that line would
   turn this test red, and it would not — the precise wrong belief that cost the cycle-1 fix wave
   a wasted revert experiment.

   The first sentence is fine and should stay: enlarge → close → flip is still the order that
   broke it, and the test still needs to drive it. Only the causal clause is wrong. Something
   like: *the close handler empties the dialog's cloned SVG and `rerenderDiagrams` mints a fresh
   id per pass; either alone keeps this green (test-specs.md § Proving the new assertion is not
   vacuous), and this test fails only when neither is present.*

   **Why it survived two sweeps.** `web-implementation.md:146-149` records the cycle-2 sweep as
   `rg -n "rerenderDiagrams|diagramId|keyed by" web/src --glob '*.ts' -g '!*.test.ts'` — scoped to
   `web/src` and excluding test files, so `web/e2e/` was never searched. The finding is against the
   comment, not against that sweep's honesty; I note the scope so the next one covers `web/e2e`
   and the `*.test.ts` files too. My own sweep this cycle covered `web/src` **and** `web/e2e` and
   found no fourth instance: the only other comments naming `rerenderDiagrams`, `diagramId` or the
   instance value — `render/diagrams.ts:9-12`, `:17-22`, `:99-108`; `reader/mermaid.ts:44-47`;
   `features/reader.ts:55-63`, `:135-142`, `:388-392`; `render/mermaid.ts:13-14` — each check out
   against the code, and `helpers/reader.ts`'s "review cycle 2 Critical 1" references belong to the
   prior `markdown-viewing` plan and are untouched by this branch.

### Minor

None.

### Notes

1. **[note]** Cycle 2's fix to `render/diagramdialog.ts:119-124` is correct in every clause, and I
   checked each against the code rather than accepting it: the canvas does hold an id-carrying
   clone (`:89`, `cloneNode(true)`); `rerenderDiagrams` does mint a fresh id per pass (`:120` of
   `diagrams.ts`); the clear is independently sufficient (cycle 2's revert matrix, which I did not
   need to re-run since no behaviour changed); and it does drop a full SVG copy plus its derived
   ids from the document — measured live this cycle at 38 ids → 19.
2. **[note]** I agree with the orchestrator's reading of cycle 2's note 2: a theme flip driven from
   **another** window leaves an open modal's clone in the previous theme until it is reopened. Not
   reachable from the window itself (`showModal()` makes Settings inert behind the backdrop), not
   an honesty-rule violation (a diagram in the previous colour theme is not state the daemon does
   not know), and no plan edge case covers it. A known cost, not a defect; no change requested.
3. **[note]** `make refs` is red — 28 missing references, all resolving to
   `.claude/settings.local.json` (19, gitignored) or `test/rig/captures/*` (9, local-only). None
   comes from a file this branch touches, so the gate is red in any fresh clone independent of this
   plan. Pre-existing repo condition; a `TODO.md` candidate, not a fix wave.
4. **[note]** REQ-13 (`--sans` in diagram text) is still carried by manual measurement alone —
   verified live again this cycle, but no automated test pins it. Worth remembering if mermaid's
   `fontFamily` handling changes in a 12.0.x bump, which ADR 1 already says is manual.
5. **[note]** The `kb pack` for this role emits 10,491 words against an 8,000-word budget and warns.
   Not this plan's doing; recording it because the warning will keep firing for every reviewer.
6. **[note]** Cycle 1's notes 1–5 and cycle 2's notes 1, 4 and 5 all still hold; nothing in this
   cycle's diff touches them and none asked for a change.

## Verdict

`needs-changes`: zero Critical, one agent-tagged Major. Everything else is green — full suite,
soak, all nine authored checks, the hard-rule checklist, the design system, and a browser pass that
confirmed every user-facing claim by measurement. The Major is a two-line comment reword in one
E2E spec, with no behaviour to change.
