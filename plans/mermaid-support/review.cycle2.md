# Review: Mermaid Support

**Plan**: mermaid-support
**Verdict**: needs-changes
**Cycle**: 2 (full re-review — cycle 1 carried Criticals, not Minors only)
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role review` — conventions (Stack,
TypeScript/web, Composition roots, Testing, Comments, Knowledge records), the reader feature spec
and its protocol contract slice (`sessions.reader`, `sessions.reader-file`), features=reader.

Both cycle-1 Criticals are genuinely fixed, and I confirmed each by measurement rather than by
reading the fix waves' reports. Every gate is green, the full suite and a 10× soak pass, and the
new E6 provably fails on the bug it exists to catch. One Major remains, and it is small: the
comment justifying the close-handler line asserts something about `rerenderDiagrams` that the
same commit made false.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 fences render | Yes | E2, E7, E12 | pass |
| REQ-2 ELK, bundled, no registration | Yes | E12, E15; W23 check | pass |
| REQ-3 pinned 12.0.0, bundled, same-origin | Yes | W4 check, E5, E10 | pass |
| REQ-4 dynamic import, lazy | Yes | E5; W5 check; W16 measured | pass |
| REQ-5 security surface | Yes | E4 + code read | pass |
| REQ-6 failure keeps source with reason | Yes | E3 | pass |
| **REQ-7 theme map + re-render** | **Yes — fixed** | **E6 (now non-vacuous)** | **pass** |
| REQ-8 enlarge modal, focus restore | Yes | E8, E9, E10; measured by hand | pass |
| REQ-9 zoom/pan, clamp | Yes | E13, E14; measured by hand | pass |
| REQ-10 late results discarded | Yes | code read (W12) + REQ-10 spec | pass |
| REQ-11 wide diagram scrolls its figure | Yes | E11 + soak 10/10 | pass |
| REQ-12 heading ids/outline untouched | Yes | REQ-12 pin | pass |
| REQ-13 `--sans` font | Yes | measured by hand (see Manual Verification) | pass |
| **REQ-14 sequential, unique ids** | **Yes — now unique per pass** | W14 + measured | **pass** |
| REQ-15 failure text selectable | Yes | `user-select: text` | pass |
| DIAG | none — `kb for` on all six changed source files returns no `kb:diagram/` record | — | pass |

The plan's own `## Diagrams` sequence diagram covers the open path only (as its prose says) and
is still accurate for that path; it is a plan diagram, not a kb record, so nothing is owed.

## Build & Tests

E2E tests: **pass** — `make e2e`, **371 passed (2.2m)**, full suite from the repo root, nothing
building beside it. Plus `make e2e-soak SPEC=reader-mermaid.spec.ts N=10` → **160 passed (1.4m)**,
10/10 repeats of both the repaired E11 and the rewritten E6.
Daemon tests: pass (`make test`, every package `ok`) — no Go file changed on this branch.
Web tests: pass (`make web-test`, 39 files, 1639 tests).
Daemon build: pass (`go build ./...`, exit 0).
Web build: pass (`make web-build`; Vite's 500 kB warning fires as the plan predicted, neither
raised nor silenced).
Lint: pass (`make lint` 0 issues; `make web-lint` 160 files clean; `make contrast` 43 pairs × 3
themes, 0 failures; `make e2e-lint` clean; `make check-versions` fresh).
`make check-kb`: **fail — the same 4 "owned by no feature" problems and nothing else**
(`web/e2e/reader-mermaid.spec.ts`, `web/src/render/{diagrams,diagramdialog,mermaid}.ts`). Step 7
doc-reconcile's, already recorded in `doc-delta.md`. Not a finding.

## Acceptance Checks

`.claude/skills/orchestrate/scripts/gates.sh mermaid-support --checks-only` — **9 lines, 0 failed.**

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

**DOC detail.** No `deviation:` line in any log, so no ADR is owed; `web-implementation.md:109`
states this explicitly for the fix waves. All five ADRs exist, `status: proposed`, under
`kb ls --feature reader --status proposed`. No `doc-delta:` line was emitted by any wave, and
`doc-delta.md` already carries the orchestrator's `e2e` glob amendment. The Doc Delta's one
clause cycle 1 flagged as false — "Diagrams follow the dashboard theme and re-render when it
changes" — is now true and measured (Manual Verification, passes 2 and 3), so the delta needs no
edit. `TODO.md`'s block and the ADR status flips are Completion-step items the plan schedules
there.

W6's widened command is the one I suggested in cycle 1 Minor 2 and it passes; the amendment note
at `plan.md:367` is accurate. E6's amended criterion (`plan.md:433-444`) and the shipped spec
match clause for clause, including the failing order.

## Reviewer-Verified Criteria

Cycle 1 verified W7–W13, W15–W18, W20–W22 and E2–E15 by reading every file and test against its
criterion; nothing in this cycle's diff touches them, and I re-confirmed the two the fix waves
could have disturbed plus the one that previously failed.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| **W14** | ids unique per reader instance **and per pass** | **pass** (was fail) | Both call sites draw `nextDiagramInstanceId++` synchronously at call time — `features/reader.ts:312` (open) and `:399` (theme flip); those are the only two callers in the tree (`grep` over `web/src`, `web/e2e`). Measured in the browser: four consecutive passes minted `muster-diagram-0-0`, `-1-0`, `-2-0`, `-4-0`. |
| W17 | dialog markup byte-identical in both templates | pass | extracted both `<dialog class="modal diagram-modal">…</dialog>` blocks from `web/index.html` and `web/doc.html` and diffed — identical |
| W19 | theme handler awaits the in-flight pass; observer disconnected | pass | `features/reader.ts:400-407` still chains on `this.diagramPass`; `instance` is drawn before the chain, so two rapid flips cannot share a value |
| W5/W11 | no static mermaid import; `bindFunctions` never invoked | pass | `render/mermaid.ts:22` is the only runtime `import("mermaid")`; `:11` is `typeof import(...)`, type-only and erased; `:78` destructures `{ svg }` alone |
| E6 | assertion matches the amended criterion | pass | drives enlarge → close → flip, then asserts `viewBox` `/\S/`, `.node` count 2, and both labels — and it is not vacuous (proof below) |

**Repairs tables.** Two now: validate attempt 1's E11 row (unchanged from cycle 1 — a redundant
click dropped, both positive assertions verbatim, soak 10/10) and the new fix-wave row for E6.
The E6 row's last column holds: the repair **added** four assertions and deleted, skipped and
weakened none. I verified the claim rather than accepting it — see below. Fixture payloads are
still genuine mermaid source run through the real bundled engine, not synthesized wire shapes.

## Vacuity Proof — verified independently, not accepted

e2e-specs reported that reverting the close-handler line alone left E6 green, and that reverting
the id-minting fix as well reproduced Critical 1. **That reasoning holds, and I extended it.** I
backed both files up, ran each revert myself, and restored (`git diff --quiet` clean before and
after; the tree was rebuilt from restored source):

| Tree | E6 |
|------|-----|
| as shipped | **pass** |
| id-minting reverted to `renderDiagramSvg(existingSvg.id, …)`, close-handler line **kept** | **pass** |
| both reverted | **fail** — `toHaveAttribute("viewBox", /\S/)` got `null`; 34 retries resolved to `<svg id="muster-diagram-0-0">`, the collided id |

So the two halves are **each independently sufficient**, and E6 fails exactly when neither is
present. The new assertion is not vacuous, and the reported green on the close-only revert is
explained rather than suspicious: both fixes break the same collision, from opposite ends.

## Manual Verification

Drove the real app in Chromium against a scratch daemon, with a throwaway probe spec written,
run and deleted inside this review (`git status` clean; the probe is not in the diff). Fixture:
`writeMermaidFixture`'s `flow.md` (`flowchart TD / A --> B`). Every number below is read off the
live DOM, not off a test verdict.

- **Initial render** — `id="muster-diagram-0-0"`, `viewBox="4 4 168 140"`, 2 `.node` elements,
  `data-mermaid-theme="dark"`.
- **REQ-13** — computed `font-family` on a node's `<text>` is
  `system-ui, -apple-system, "Segoe UI", sans-serif` — the dashboard's `--sans`, not mermaid's
  default face. Still the only evidence for REQ-13; no test covers it.
- **REQ-8 enlarge** — `data-zoom="1.00"`, canvas holds 1 child, transform
  `translate(0px, 0px) scale(4.52143)` — fit folded into the scale, pan at literal zero.
- **Critical 1 fix, the close half** — after `Close`, `.diagram-canvas` has **0 children** and
  `document.activeElement` is `BUTTON.diagram-enlarge`. The document's `muster-diagram-*` id list
  returns to the 19 the live figure owns, from the 38 held while the modal was open.
- **Critical 1 fix, the durable half** — enlarge → close → flip to `Light`:
  `id="muster-diagram-1-0"`, `viewBox="4 4 168 140"`, **2 nodes**, `data-mermaid-theme="default"`.
  This is cycle 1's run B, which read 0 nodes / `viewBox: null` / 300×150. Flipping back to
  `Instrument` gives `muster-diagram-2-0`, same viewBox, 2 nodes, theme `dark` — it recovers in
  both directions, which cycle 1's broken build did not.
- **Enlarging again after two flips** — the clone's id is `muster-diagram-2-0`, equal to the live
  figure's current id, so the modal shows the current diagram rather than a stale one.
- **Major 1's second path, the one the fix wave was asked to close** — opening `kinds.md` and then
  `flow.md` back to back on one reader instance (two diagram passes on one instance, the "open
  file A, switch to B before A's render returns" shape) leaves `muster-diagram-4-0` live and
  **0 duplicate ids in the document** (`ids.length - new Set(ids).size === 0`). The collision
  class is closed, not just the instance of it that shipped.

Not verified, unchanged from cycle 1: the pop-out's theme behaviour (edge case 8 — the observer
is inert on `/doc.html`) and the engine-chunk-fails-to-load path (edge case 15, not drivable).

## Hard-Rule Checklist

`git diff main...HEAD --name-only -- internal cmd` is empty — no Go file changed anywhere on this
branch. Greps below run over the eight source and spec files the plan touches.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no `hook_event_name` / `rate_limits` / `permission_mode` / `transcript_path` / `session_id` in any changed file |
| 2 | No terminal-output state parsing | pass — `capture-pane` absent |
| 3 | Non-blocking hook handler | pass — no daemon change |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — the single `tmux` hit is a comment in the spec header |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | **pass** — cycle 1 qualified this because a destroyed diagram left an empty framed box; that is fixed and measured |
| 7 | Session identity on the tmux target | pass |
| 8 | No `~/.claude/settings.json` trespass | pass — no `settings.local.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — Claude Code faked via `envelopedSessionStart`/`rawPostToolUse` throughout |

**Design system.** Every colour in the CSS diff resolves to a semantic token (`--bg-hover`,
`--line`, `--fg-muted`, `--well`); no hex, `rgb()`, `hsl()` or named literal anywhere outside a
`[data-theme]` block — the one `rgb(31, 32, 32)` in `render/mermaid.ts:67` is a measured value
quoted in a doc comment, not a declaration. No web font, no `@import`, no `@font-face`.
`--term` is correctly absent: the modal stage recesses on `--well`. `make contrast` green in all
three themes. `.md figure.diagram` mirrors `.md pre` exactly (same token pair, same
`margin: 0 0 10px`), and the codebase defines no spacing tokens, so the raw px matches the
surrounding convention. No displayed value changes over time in the new UI (`data-zoom` is an
attribute; the toolbar reads `+ − fit Close`), so no `tabular-nums` obligation. The new code
toggles no `hidden` attribute, so no `[hidden]` companion is owed — and
`dialog.diagram-modal[open]` is correctly scoped so the author `display: grid` never overrides
the UA's `dialog:not([open]) { display: none }`, the same trap as
kb:lesson/display-rule-overrides-hidden-attribute; the CSS comment records the measurement.
Terminal rules §7: untouched, no live client added. Composition roots: `web/src/main.ts` is not
in the diff; `render/reader.ts` gains one `wireDiagramDialog(refs)` line, the sanctioned one-line
registration.

## Issues

### Critical

None. Both cycle-1 Criticals are fixed and independently verified above.

### Major

1. **[web-impl]** **The close handler's comment asserts something about `rerenderDiagrams` that
   the same commit made false** — `web/src/render/diagramdialog.ts:119-123`. It reads:

   > leaving it in the document past close lets a later theme re-render (`rerenderDiagrams`,
   > **keyed by that same id**) resolve against this stale clone instead of the live figure.

   `rerenderDiagrams` is not keyed by that id any more. `render/diagrams.ts:120` mints
   `diagramId(instance, n)` per pass, and its own doc comment at `:99-101` says so in the opposite
   words — "mints a fresh id per figure from `instance` **rather than reusing** the figure's
   existing SVG id". Both comments shipped in `ce34fa0`. A maintainer who follows this pointer
   concludes `rerenderDiagrams` still reuses ids and that this line is the only thing holding the
   diagram together; both are wrong, and my experiment above shows the line is not load-bearing.

   This is the same species as cycle 1's Major 1 — a comment stating a property of a value that
   the code does not have — and the rubric puts a false comment at Major, not Minor. The fix is
   words only; the line itself should stay (see the note below on why it earns its place).
   Something like: *the canvas holds a clone of the figure's own SVG (W20), id included.
   `rerenderDiagrams` no longer keys on that id, so this is defence in depth rather than the only
   guard — but it is independently sufficient, and it stops a closed modal holding a full SVG
   copy, and its duplicate ids, in the document until the next open.*

### Minor

None.

### Notes

1. **[note]** **The close-handler line earns its place, and I would keep it.** It is not
   redundant defence: with the id-minting fix reverted it alone keeps E6 green (measured above),
   so the two guards close the defect from opposite ends rather than one shadowing the other. It
   also does something the id fix does not — measured, the document carries **38**
   `muster-diagram-*` ids while the modal is open and **19** after close, so the line drops a
   full SVG copy plus its 18 derived marker/gradient/filter nodes instead of holding them until
   the next enlarge. And it closes the duplicate-id window entirely: while the modal is open, the
   clone's own `url(#…)` references resolve to the *live figure's* defs, since `getElementById`
   and SVG reference resolution both take the first match in document order. That is harmless
   today because the two copies are identical, but it is a standing hazard for anything else that
   resolves by id. One line and a comment is the right price. The only thing wrong with it is the
   comment, which is the Major above.
2. **[note]** With the modal open in one window, a theme flip driven from **another** window
   re-renders the on-page figure but leaves the modal's clone in the previous theme until it is
   closed and reopened. Not reachable from the window itself — `showModal()` makes the Settings
   button inert behind the backdrop — and no edge case in the plan covers it. Not an honesty-rule
   violation either: a diagram in the previous colour theme is not state the daemon does not
   know. Recording it so the cost is known, not asking for a change.
3. **[note]** `make refs` is red — 28 missing references — and I agree with the orchestrator's
   reading. Every one resolves to `.claude/settings.local.json` (19, gitignored at
   `.gitignore:42`) or `test/rig/captures/*` (9, a local-only probe-rig output directory that is
   untracked on `main`). The 21 source files naming them are all pre-existing and none is touched
   by this branch, so the gate is red in any fresh worktree or clone independent of this plan.
   Pre-existing repo condition, not a defect this plan shipped; a `TODO.md` candidate, not a fix
   wave.
4. **[note]** `make check-kb`'s four "owned by no feature" problems are doc-reconcile's per
   `doc-delta.md`, which already carries the `e2e` glob amendment. No other kb problem exists.
5. **[note]** Cycle 1's notes 1 (the E13 sixteen-press arithmetic), 2 (REQ-5's security surface),
   3 (the explicit px sizing being the real reason a wide diagram overflows), 4 (the REQ-10 spec
   exercising `fetchSeq` rather than the pass's own `isCurrent`) and 5 (mermaid's `dark` theme
   drawing edge labels on a light chip) all still hold — nothing in this cycle's diff touches
   them, and none asked for a change.

## Verdict

`needs-changes`: zero Critical, one agent-tagged Major. Everything else is green, and the Major is
a comment reword in a single file.
