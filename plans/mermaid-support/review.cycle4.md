# Review: Mermaid Support

**Plan**: mermaid-support
**Verdict**: needs-changes
**Cycle**: 4 (full re-review — cycle 3's open issue was a Major, so §9's Delta path does not apply)
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role review` — 10491 words (over the
8000-word budget, warned): conventions (Stack, Go, TypeScript/web, Composition roots, Testing,
Commits, Comments, Knowledge records), the reader feature spec and its protocol contract slices
(`sessions.reader`, `sessions.reader-file`, `docChanged`, the Session object),
`kb:diagram/pipeline-execution-order`, 8 accepted reader ADRs, the plan's 5 `proposed` ADRs, and
11 lessons for this role. features=reader.

Cycle 3's Major is genuinely fixed, and both of the orchestrator's own commits hold up under the
same scrutiny I gave the agents' — I re-derived every claim in them against the code rather than
accepting the summary. Every gate is green: `make e2e` 371/371, all nine authored checks, and a
browser pass in which I measured every user-facing claim off the live DOM.

**One instance of the recurring species remains, and it is again in a file no previous sweep
covered** — not a spec file this time but the E2E *helper*, `web/e2e/helpers/reader.ts`.
`scriptRequestsContaining`'s doc comment claims a same-origin filter the method does not apply.
It is smaller than cycles 1–3's findings (it over-qualifies a helper's return set rather than
asserting a false causal mechanism about product code), so it is a Minor, not a Major — but it
blocks approval like any agent-tagged issue, and the fix is one clause.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 fences render | Yes | E2, E7, E12; measured live | pass |
| REQ-2 ELK, no registration | Yes | E12, E15; W23 check | pass |
| REQ-3 pinned 12.0.0, bundled, same-origin | Yes | W4 check, E5, E10 | pass |
| REQ-4 dynamic import, lazy | Yes | E5; W5 check; entry chunk 387.54 kB in my own build | pass |
| REQ-5 security surface | Yes | E4 + code read (`render/mermaid.ts:47-55, 79-82`) | pass |
| REQ-6 failure keeps source with reason | Yes | E3; measured live (`diagram not rendered: Parse error on line 4:`, kept source 1, other figure 1) | pass |
| REQ-7 theme map + re-render | Yes | E6; measured live (`muster-diagram-1-0`, viewBox `4 4 168 140`, 2 nodes, theme `default`) | pass |
| REQ-8 enlarge modal, focus restore | Yes | E8, E9, E10; measured live | pass |
| REQ-9 zoom/pan, clamp | Yes | E13, E14, W21; `+`→1.25, `0`→1.00 measured live | pass |
| REQ-10 late results discarded | Yes | REQ-10 spec; code read (W12) | pass |
| REQ-11 wide diagram scrolls its figure | Yes | E11 (+ cycle-3 soak 10/10) | pass |
| REQ-12 heading ids/outline untouched | Yes | REQ-12 pin | pass |
| REQ-13 `--sans` font | Yes | measured live: `system-ui, -apple-system, "Segoe UI", sans-serif` — still the only evidence; no automated test | pass |
| REQ-14 sequential, unique ids | Yes | W14 + measured live (19 ids, 0 duplicates after every pass) | pass |
| REQ-15 failure text selectable | Yes | `user-select: text` (`style.css`) | pass |
| DIAG | none — `kb for` on every changed source/spec/template file returns 0 `kb:diagram/` records | — | pass |

The plan's own `## Diagrams` sequence diagram covers the open path only, as its prose says, and is
still accurate for it; it is a plan diagram, not a kb record, so nothing is owed.

## Build & Tests

E2E tests: **pass** — `make e2e`, **371 passed (3.2m)**, full suite from the repo root, nothing
building beside it (kb:lesson/concurrent-build-invalidates-running-e2e). Run a second time by the
gates runner as check E1, also green.
Daemon tests: pass — `make test`, every package `ok` (see Note 3 for one transient first run).
No Go file changed on this branch: `git diff main...HEAD --name-only` matches zero `*.go`.
Web tests: pass — `make web-test`, 1639 tests.
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
| W6 | `! rg -n 'innerHTML\|outerHTML\|insertAdjacentHTML' -- <reader-owned modules>` | pass |
| W11 | `! rg -n "bindFunctions\(" web/src` | pass |
| W23 | `! rg -n "registerLayoutLoaders\|layout-elk" web/src web/package.json` | pass |
| E1 | `make e2e` | pass |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

**DOC detail.** No `deviation:` line in any log (`web-implementation.md:109` and `:154` state this
for both fix waves; `test-specs.md`'s cycle-3 fix section likewise), so no ADR is owed. All five
ADRs exist, `status: proposed`, each carrying `refs: [plan:mermaid-support, …]`, and
`.claude/rules/reader.md` lists all five. No `doc-delta:` line was emitted by any wave;
`doc-delta.md` carries the orchestrator's `e2e` glob amendment, which is what closes `check-kb`'s
four ownership problems. I re-checked the Doc Delta clause by clause against what shipped, not
against intent: "imported only when a document contains a fence" (E5 + `renderDiagrams` returning
before the import when `findFences` is empty), "bundled into the binary, never fetched" (E5/E10
origin trackers), "SVG crosses DOMPurify like the markdown does" (`render/mermaid.ts:79`), "keeps
its fenced source with a labelled reason beneath" (measured live), "follow the dashboard theme and
re-render when it changes" (measured live), "each enlarges into a modal with zoom and pan"
(measured live). Nothing in the delta overstates the code.

**The orchestrator's ADR edit (41f28c9).** The added clause — the dialog "drops it on close so a
closed modal keeps neither a full SVG copy nor its duplicate ids in the document" — is accurate and
I measured it rather than reading it: `diagramdialog.ts`'s `close` handler calls
`refs.diagramCanvas.replaceChildren()`, and live the document goes from 38 `muster-diagram-*` ids
with 19 duplicates while open to 19 ids with 0 duplicates after close, canvas child count 1 → 0.
Body is 285 words, inside the 300-word record budget. See Note 5 for the timing caveat I hit while
measuring it.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W7, W8, W9, W21 | full Vitest tables | pass | read both test files: 9 `isMermaidLanguageClass` cells, 6 `mermaidThemeFor` cells (incl. `""`/`null`), 7 `diagramErrorText` cases (multi-line, trim, 200-char cap, empty, whitespace-only, non-`Error`); `zoom.test.ts` clamps both bounds and the exact bounds, `wheelFactor` sign + inverse, `zoomAround` invariance at 3 points × 2 factors **plus an overshoot-the-clamp case**, `panBy`, `fitScale` wide/tall/degenerate/pre-layout, `resetZoom`, `transformOf` |
| W10 | mermaid init + sanitize options | pass | `render/mermaid.ts:47-55` (`startOnLoad:false`, `securityLevel:"strict"`, `htmlLabels:false` root **and** flowchart, `suppressErrorRendering:true`) and `:79-82` (`RETURN_DOM_FRAGMENT`, `html`+`svg`+`svgFilters`) |
| W12 | `isCurrent()` re-checked before every DOM write | pass | `diagrams.ts:82-84` and `:131-133`, each immediately before the only mutation in its loop |
| W13, W14 | touches only `pre > code` fences; ids per pass | pass | `findFences` is the only query in `renderDiagrams`; both call sites draw `nextDiagramInstanceId++` synchronously (`features/reader.ts:312`, `:399`) and are the only two callers in the tree |
| W15 | CLAUDE.md hand-written parts | pass | `web/src/reader/CLAUDE.md` names `mermaid.ts`/`zoom.ts` as pure exemplars and `render/mermaid.ts` as not Vitest-importable; `web/src/render/CLAUDE.md` names all three new modules and adds the backdrop-close invariant — which holds, since `dialog.modal { padding: 0 }` (`style.css:2103`) leaves no author padding uncovered |
| W16 | real build numbers | pass | `web-implementation.md:44-51` carries `ls -l` output and both entry-chunk names/sizes; my own build reproduced 387.54 kB |
| W17 | dialog markup byte-identical | pass | extracted both `<dialog class="modal diagram-modal">…</dialog>` blocks mechanically and compared — identical, 642 bytes each |
| W18 | failure text always from `diagramErrorText` | pass | `diagrams.ts:79` is the only producer of the error string; `suppressErrorRendering: true` |
| W19 | theme handler awaits in-flight pass, observer disconnected | pass | `features/reader.ts:400-408` chains on `this.diagramPass`; `instance` drawn before the chain; observer disconnected in `dispose` |
| W20 | dialog holds a clone | pass | `diagramdialog.ts:89` `cloneNode(true)`; measured live |
| W22 | non-passive wheel; `fit` on open/reset only | pass | `diagramdialog.ts` `{ passive: false }` + `preventDefault()`; `computeFitAndCenter` called only from `open` and `resetToFit` |
| E2–E15 | assertions match each criterion | pass | read every test against its criterion; E13's press arithmetic checks out independently (1.25¹² = 14.6 → clamped 8; 8·0.8¹⁶ = 0.225 → clamped 0.25, and 15 presses would not reach it), E14's drag delta and E12's 13-figure count (8 kinds + case + attribute + blockquote + 2 duplicates) likewise |

**Repairs tables.** Two, both re-verified. Validate attempt 1's E11 row drops a redundant click and
keeps both positive assertions verbatim — confirmed against the spec as it stands. The cycle-1 fix
row for E6 **added** four assertions (`viewBox` `/\S/`, `.node` count 2, both labels) and deleted,
skipped or weakened none. No assertion anywhere was replaced by a container-level `toBeVisible()`.
Fixture payloads are genuine mermaid source fed to the real bundled engine, not synthesized wire
shapes.

## Hard-Rule Checklist

No file under `internal/` or `cmd/` changed on this branch. Greps below run over every changed
file under `web/` (excluding `package-lock.json`).

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no `hook_event_name` / `rate_limits` / `permission_mode` / `transcript_path` in any changed file |
| 2 | No terminal-output state parsing | pass — `capture-pane` absent |
| 3 | Non-blocking hook handler | pass — no daemon change |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — the only `tmux` mention in the diff is the spec header's prose |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass — a failed fence is labelled with mermaid's own reason, never blanked; the destroyed-diagram case cycle 1 qualified this on is fixed and re-measured this cycle |
| 7 | Session identity on the tmux target | pass |
| 8 | No `~/.claude/settings.json` trespass | pass |
| 9 | No real `claude` outside canary/probes | pass — Claude Code faked via `envelopedSessionStart`/`rawPostToolUse` throughout, in the spec and in my own probe |

**Web conventions.** No `any`, `as any`, `@ts-ignore` or `biome-ignore` in any changed file. No
`innerHTML`/`outerHTML`/`insertAdjacentHTML` anywhere (the only hits are the two CLAUDE.md
sentences forbidding them). No second WebSocket, no new dependency beyond the pinned `mermaid`
12.0.0. Composition roots honoured: `web/src/main.ts` is not in the diff, and `render/reader.ts`
gains one `wireDiagramDialog(refs)` line — the sanctioned one-line registration
(docs/conventions.md § Composition roots). The pure/DOM split holds: `reader/mermaid.ts` and
`reader/zoom.ts` import nothing DOM-shaped and are fully Vitest-covered; `render/mermaid.ts` is the
only module that loads the engine.

**Design system.** Every colour in the CSS diff resolves to a semantic token (`--bg-hover`,
`--line`, `--fg-muted`, `--well`); no hex, `rgb()`, `hsl()` or named literal in any new
declaration — literals appear only in the per-theme token blocks, and the one `rgb(31, 32, 32)`
under `web/src` is a measured value quoted inside `render/mermaid.ts:67`'s doc comment. No web
font, no `@import`, no `@font-face`. `--term` correctly absent: the modal stage recesses on
`--well`. `make contrast` green in all three themes. `.md figure.diagram` mirrors `.md pre`'s token
pair and `margin: 0 0 10px`, and the codebase defines no spacing tokens, so the raw px matches the
surrounding convention. No state colour is used and no displayed value changes over time in the new
UI (`data-zoom` is an attribute; the toolbar reads `+ − fit Close`), so no `tabular-nums`
obligation arises. The new code toggles no `hidden` attribute — and `dialog.diagram-modal[open]` is
correctly scoped so the author `display: grid` never overrides the UA's
`dialog:not([open]) { display: none }`, the same trap as
kb:lesson/display-rule-overrides-hidden-attribute; the CSS comment records the live measurement
that found it. Honesty rules §6: a degraded fence is labelled, never hidden and never a blank
frame. Terminal rules §7: untouched — no live client, no geometry, no `resize-pane`.

**Accessibility.** `dialog` has `aria-label="Diagram"`; all four toolbar buttons and the enlarge
button carry accessible names matching the Testable UI Elements table exactly; the stage is
`tabindex="0"` and receives focus on open (measured: `document.activeElement` is `.diagram-stage`),
with Escape handled natively by `<dialog>`. Focus returns to the opener on close (measured), with
an `isConnected` fallback to `article.md` for the re-rendered-body case.

## Manual Verification

Drove the real app in Chromium against a scratch daemon with a throwaway probe spec, written, run
and deleted inside this review (`git status --porcelain` empty afterwards; the probe is not in the
diff). Fixture: `writeMermaidFixture`'s `flow.md` (`flowchart TD / A --> B`) and `broken.md`. Every
value below was read off the live DOM.

- **Initial render** — `id="muster-diagram-0-0"`, `viewBox="4 4 168 140"`, 2 `.node` elements,
  `data-mermaid-theme="dark"`, 19 `muster-diagram-*` ids in the document, **0 duplicates**.
- **REQ-13** — computed `font-family` on a node's text is
  `system-ui, -apple-system, "Segoe UI", sans-serif` — the dashboard's `--sans`, not mermaid's face.
- **REQ-8 enlarge** — `data-zoom="1.00"`, canvas holds 1 child, transform
  `translate(0px, 0px) scale(4.52143)` (fit folded into the scale, pan at literal zero),
  `document.activeElement` is `.diagram-stage`.
- **REQ-9 keyboard** — `+` → `1.25`; `0` → `1.00` with transform back to
  `translate(0px, 0px) scale(4.52143)`.
- **Close** — exactly 1 `dialog.diagram-modal` in the root (INV-3), canvas child count **0**,
  document back to 19 ids / 0 duplicates, focus on `.diagram-enlarge`. See Note 5: this state is
  reached a task later than the dialog hiding, which I first mis-sampled and then pinned down.
- **REQ-7 / cycle-1 Critical 1, the order that broke it** — enlarge → close → flip to `Light`:
  `id="muster-diagram-1-0"`, `viewBox="4 4 168 140"`, **2 nodes**, theme `default`, 0 duplicate
  ids.
- **REQ-6** — `broken.md` renders `diagram not rendered: Parse error on line 4:` with the kept
  `pre > code.language-mermaid` count at 1 and the valid fence's figure at 1.

Not verified, unchanged from cycles 1–3: the pop-out's theme behaviour (edge case 8 — the observer
is inert on `/doc.html`) and the engine-chunk-fails-to-load path (edge case 15, not drivable
without killing the daemon, which fails the file fetch first).

## The three commits since cycle 3

Reviewed with the same scrutiny as agent work, as asked, and each claim re-derived against the code
rather than taken from the summary.

1. **4124159 `[e2e-specs]`, cycle 3's Major.** The replacement wording is accurate. Both halves of
   the "either alone" claim hold: that the per-pass id alone suffices is *measured*
   (`test-specs.md` Fix Attempt 1 step 1 — reverting `replaceChildren()` alone left E6 green); that
   the close-handler clear alone suffices was never measured in isolation, but it follows without
   inference gaps — with no clone in the document there is no duplicate id for mermaid's
   `render(id, …)` to resolve against, which is exactly the pre-modal behaviour the
   `markdown-viewing` plan shipped green. Step 2 (revert both → red) proves the test detects the
   defect class, so "guards the defect class, not either fix in isolation" is also earned. The
   commit's diff over `web/e2e/` is comment-only; I confirmed it.
2. **41f28c9 `[orchestrator]`, the ADR.** Accurate and measured — see the DOC detail above. Within
   the word budget.
3. **e78cd44 `[orchestrator]`, the two authoring-mode comments.** Both replacements check out:
   - The file header's "The modules this plan adds … are in the tree and every test below runs
     green against them" — all five modules exist, the file holds 16 tests, none `skip`/`fixme`/
     `only`, and all 16 ran green in both of my full-suite sweeps. "All but the REQ-12 pin gated on
     collection only" matches `test-specs.md:64-67`, which records the pin as
     **ran-green-at-authoring** (`1 passed (3.3s)`) and everything else as `--list` only. The
     header's fixture claim ("every test takes the test-scoped `daemon` fixture") also holds and
     matches plan.md:7's Fixture plan; no `fileDaemon`/`startDaemon` appears.
   - The REQ-12 pin's comment: the quoted sentence *is* REQ-12's, at `plan.md:97-98` — the previous
     attribution to REQ-1 (`plan.md:54`) was indeed wrong. "Green then, against the bare markdown
     path, and green now with it running over the same document" is what the record and the current
     suite show.

   The boundary crossing (the orchestrator editing e2e-specs' file) is on the user's explicit
   instruction and is recorded in the handoff; nothing in either commit touches an assertion.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[e2e-specs]** **A doc comment claiming a same-origin filter the method does not apply** —
   `web/e2e/helpers/reader.ts`, `OriginRequestTracker.scriptRequestsContaining`:

   > Same-origin script requests recorded so far whose path contains `substr`
   > (case-insensitive) — the "engine chunk loaded" oracle for E5, without hardcoding a
   > Vite-hashed filename.

   The method applies no origin filter: it returns every recorded URL ending `.js` whose **whole
   URL** (not path) contains the needle. That is deliberate at the class level — the class doc
   says it records *every* request precisely so a CDN load can be caught — but it makes the
   method's own doc false in the one direction that matters. E5's positive assertion is
   `scriptRequestsContaining("mermaid").length > 0`, read as "the engine chunk loaded from the
   daemon"; a cross-origin mermaid load would satisfy it too. **E5 itself is sound**, because it
   calls `tracker.assertAllSameOrigin()` on the line immediately before each use — nothing shipped
   is wrong, and no assertion needs changing. The defect is that a maintainer writing the next
   origin-sensitive test would reasonably rely on a filter that isn't there.

   **Fix**: drop the unearned qualifier and the wrong noun — e.g. *"Script requests recorded so far
   whose URL contains `substr` (case-insensitive) — pair with `assertAllSameOrigin()`, which is
   what makes this the same-origin 'engine chunk loaded' oracle for E5."* (Adding a real origin
   filter would also make the comment true, but it would weaken the tracker: cross-origin hits are
   worth seeing.)

   Why Minor and not Major: unlike cycles 1–3, this asserts no false causal mechanism about product
   code and would not send anyone on a wrong revert experiment — it over-qualifies a test helper's
   return set, and the assertion it serves is correct as written. It still blocks approval, and the
   cycle after a Minors-only wave is a Delta re-review, not another full read.

### Notes

1. **[note]** **Fourth-instance sweep, re-derived independently rather than trusted.** I read every
   comment in the diff — all five new modules, `features/reader.ts`, `render/reader.ts`, both
   templates, the CSS block, the three CLAUDE.md files, both Vitest files, the whole E2E spec and
   the whole helper diff — against the code it describes. Everything the orchestrator listed checks
   out (`fitScale`'s fallback, the non-passive wheel `preventDefault`, `computeFitAndCenter`'s two
   call sites, `transformOf`'s algebra — I worked it: stage point `p` maps to canvas point
   `(p − x)/(z·fit)`, so `x' = p − (p − x)·applied` and `fit` cancels, exactly as `zoomAround`
   computes — the single `dataset["theme"]` read, `diagramPass`'s two assignment sites, W17's
   byte-identical markup, and `render/CLAUDE.md`'s backdrop-close caveat given `padding: 0`). The
   one thing it missed is Minor 1, in the helper file — `web/e2e/helpers/reader.ts` was outside
   both the cycle-2 sweep (`web/src`, tests excluded) and the cycle-3 sweep (`web/e2e/` searched,
   but for the close-handler/stale-clone phrasings specifically). A sweep for this species has to be
   a *read* of the changed comments, not a grep for the previous instance's words.
2. **[note]** `diagramdialog.ts`'s `close` handler calls `button.focus()` after the clear, but
   Chromium restores focus to the opener itself when a modal `<dialog>` closes — measured: the
   active element was already `.diagram-enlarge` before the queued `close` handler had run. The
   explicit call still earns its place as the edge-case-21 path (the `isConnected` fallback to
   `article.md`). No change requested.
3. **[note]** The first `make test` of this review exited non-zero; the failing package scrolled
   past before I captured it, and three consecutive re-runs were fully green (every package `ok`).
   It ran immediately after a `make e2e` sweep, so resource contention is the likely cause. No Go
   file changed on this branch, so nothing here can have caused it — recording it because an
   intermittently red `make test` is worth a `TODO.md` line if anyone sees it again.
4. **[note]** `kb for` on the three new `render/*` modules returns "nothing covers" today — the same
   four problems `check-kb` reports, which doc-reconcile's glob amendment closes. Related but *not*
   a finding: none of the five proposed ADRs names a new module in its `files:` frontmatter (e.g.
   `reader-diagram-svg-crosses-dompurify` names `reader/markdown.ts`, while the DOMPurify pass it
   decides lives in `render/mermaid.ts:79`). I checked the accepted reader ADRs before raising it:
   they are just as coarse (`reader-markdown-rendered-in-browser` names only `web/package.json`), so
   this matches the repo's convention, and the generated `.claude/rules/reader.md` routes anyone
   editing a reader file to all fifteen ADRs anyway. No change requested.
5. **[note]** A `<dialog>`'s `close` event is a queued task, so the canvas clear lands a tick *after*
   the dialog stops being visible: sampled immediately after `toBeHidden`, the canvas still held its
   clone and the document still had 19 duplicate ids; 500 ms later, 0 children and 0 duplicates.
   Cycle 3's measurement is correct — mine was simply taken too early at first. Worth remembering
   because any future assertion on "the canvas is empty after close" must poll rather than read
   once.
6. **[note]** `render/mermaid.ts:19-20` calls the dynamic import "the one line under `web/src` that
   names the package", while line 11's `typeof import("mermaid")["default"]` names it too. That one
   is a type query, erased before emit, so the claim is true of the shipped bundle and the
   parenthetical's point (why W5's grep doesn't fire) is correct. No change requested.
7. **[note]** `make refs` is red — 28 missing references, all under `.claude/settings.local.json`
   (gitignored) or `test/rig/captures/*` (local-only). I listed every source file: not one is
   touched by this branch, so the gate is red in any fresh clone independent of this plan.
8. **[note]** REQ-13 (`--sans` in diagram text) is still carried by manual measurement alone —
   verified live again this cycle, but no automated test pins it. Worth remembering if mermaid's
   `fontFamily` handling changes in a 12.0.x bump, which ADR 1 already says is manual.
9. **[note]** The `kb pack` for this role emits 10,491 words against an 8,000-word budget and warns.
   Not this plan's doing; it will keep firing for every reviewer.
10. **[note]** Cycle 3's notes 1, 2, 4 and 6 (and the cycle 1–2 notes they carry forward) all still
    hold; nothing in this cycle's diff touches them and none asked for a change.

## Verdict

`needs-changes`: zero Critical, zero Major, one agent-tagged Minor. Everything else is green — the
full suite, all nine authored checks, the hard-rule checklist, the design system, and a browser
pass that confirmed every user-facing claim by measurement. The Minor is a one-clause comment
reword in an E2E helper, with no assertion and no behaviour to change.
