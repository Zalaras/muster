# Review: Mermaid Support

**Plan**: mermaid-support
**Verdict**: approved
**Cycle**: 5 (delta re-review — cycle 4's only open agent-tagged issue was a Minor, so §9 applies)
**Pack**: `go run ./tools/kb pack --plan mermaid-support --role review` — `kb: pack 10513 words`,
`features=reader`, over the 8000-word budget (warned; not this plan's doing — Note 6).

Cycle 4's Minor is fixed, and the replacement wording is accurate clause by clause — I re-derived
each against the code rather than against the handoff, which is the failure mode the orchestrator
asked me to guard. **No fifth instance of the comment-drift species.** The regression net ran in
full: `make e2e` green twice on this tree (371/371 and 371/371), builds, unit tests, lint and all
nine authored checks green.

One unrelated spec failed on a third full-suite run and is diagnosed as a pre-existing flake, not a
regression — the reasoning is spelled out under Build & Tests rather than buried, because it is the
one judgement call in this cycle.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 4 Minor 1 `[e2e-specs]` — "*Same-origin script requests recorded so far whose path contains `substr`*" claims an origin filter `scriptRequestsContaining` does not apply, and says "path" where the code matches the whole URL | `8a3c1d8` | Read the new comment against `web/e2e/helpers/reader.ts:674-681` clause by clause (below), and against both call sites (`reader-mermaid.spec.ts:167-173`, `:368`). Diff over `web/e2e/` is comment-only — confirmed: the method body, the class, and every other line of the file are byte-identical to cycle 4's tree. |

**Clause-by-clause verification of the replacement.** Code under review:

```ts
scriptRequestsContaining(substr: string): string[] {
  const needle = substr.toLowerCase();
  return this.urls.filter((u) => u.endsWith(".js") && u.toLowerCase().includes(needle));
}
```

- *"Every `.js` request recorded so far"* — matches `u.endsWith(".js")`. The one gap this phrasing
  papers over is a URL carrying a query (`…js?import`), which `endsWith` misses; I measured the
  real traffic rather than assuming (Manual Verification) and all 32 recorded requests are
  `…/assets/<name>-<hash>.js` with no query, so the wording is true of what this harness actually
  sees. Recorded as Note 1, not a finding.
- *"whose URL contains `substr`"* — correct, and the wrong noun ("path") is gone.
- *"(case-insensitive)"* — correct: both sides lowercased.
- *"the 'engine chunk loaded' oracle for E5, without hardcoding a Vite-hashed filename"* — correct,
  and it really is the engine chunk: the build emits `mermaid.core-VplRZwAz.js` and
  `mermaid-parser.core-CiKwYOjS.js`, so the `"mermaid"` needle matches the engine itself and not an
  incidental file.
- *"Applies no origin filter of its own"* — correct; `endsWith` and `includes` are the only filters.
- *"pair it with `assertAllSameOrigin()`, as E5 does, when the point is that the chunk came from the
  daemon"* — correct: E5 calls `assertAllSameOrigin()` at `:167` and `:172`, each on the line
  immediately before its `scriptRequestsContaining` assertion.

**On fixing the doc rather than the method** (the orchestrator asked directly): fixing the doc was
the right call, and I would have flagged the behavioural change as out of scope had it landed.
Adding `u.startsWith(this.origin) &&` would have narrowed a tracker whose class doc explicitly
exists to catch a CDN load — the cross-origin hit you most want to see is the one it would have
filtered out — and would have changed test-helper behaviour in a Minors-only cycle for no assertion
that needed changing. The guard now lives where a reader meets it: in the same sentence that tells
them the filter is absent.

**Fifth-instance sweep.** Re-read every doc comment this plan added to `web/e2e/helpers/reader.ts`
(the file that escaped the cycle-2 and cycle-3 sweeps) against the code and the fixtures, by
reading rather than grepping for the previous instance's vocabulary: the locator block's
"transcribed from the plan's Testable UI Elements table"; `diagramDialog`'s "matches only while
`[open]`, since a closed `<dialog>` has no accessible role" (true — a closed dialog is not in the
a11y tree, which is exactly why `diagramDialogRaw` exists for INV-3); `keptMermaidSource`'s "only
for a fence that failed" (measured in cycle 4); `canvasTransform`'s regex against the DOM sketch;
and every `MermaidFixtureTree` field against the bytes actually written — including `kindsPath`'s
"one fence of each of the kb's eight diagram kinds, plus case, attribute, blockquote and
duplicate-fence variants", which I counted in the fixture (C4Context, C4Container, C4Component,
classDiagram, stateDiagram-v2, sequenceDiagram, erDiagram, flowchart; then ` ```Mermaid `,
` ```mermaid title=x `, the blockquote fence, and two identical `M --> N` fences) and traced to
`plan.md:56`, which is where "eight kinds" comes from. All accurate. The one imprecision I found is
Note 2, and it is a note because I measured it and it costs nothing.

## Requirements

No product code changed since cycle 4. `git diff 99de4c8..HEAD --name-only` is exactly three paths —
`plans/mermaid-support/orchestration-state.json`, the `review.md`→`review.cycle4.md` rename, and
`web/e2e/helpers/reader.ts` (comment-only) — so cycle 4's verified requirements table stands
unchanged, and §9's skip of the §3–§7 re-read applies. REQ-1 … REQ-15 pass; `DIAG` pass (no
`kb:diagram/` record covers any changed file). Every one of them was additionally re-exercised by
the two green full-suite runs below, which include all 16 `reader-mermaid.spec.ts` tests.

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-15 | Yes (unchanged since cycle 4) | 16/16 in `reader-mermaid.spec.ts`, green in both full runs | pass |
| DIAG | none — `kb for` names no diagram record for any changed file | — | pass |

## Build & Tests

E2E tests: **pass** — `make e2e` **371 passed (3.8m)** (§1 sweep) and **371 passed (3.1m)** (third
run), both from the repo root with nothing building beside them
(kb:lesson/concurrent-build-invalidates-running-e2e).
Daemon tests: **pass** — `make test`, every package `ok` after the flake below; no `*.go` changed on
this branch.
Web tests: **pass** — `make web-test`, 1639 passed.
Daemon build: **pass** — `go build ./...`, exit 0.
Web build: **pass** — `make web-build`; entry chunk 387.54 kB, reproducing the implementation log's
figure. Vite's 500 kB warning fires as the plan predicted, neither raised nor silenced.
Lint: **pass** — `make lint` 0 issues; `make web-lint`, `make contrast`, `make e2e-lint` all clean
via the gates runner (W3 and the baseline gates).
`make check-kb`: **fail — the standing 4 "owned by no feature" problems and nothing else**
(`web/e2e/reader-mermaid.spec.ts`, `web/src/render/{diagrams,diagramdialog,mermaid}.ts`), 363
records / 23 features. Step 7 doc-reconcile's glob amendment closes these; recorded in
`doc-delta.md`. Not a finding, and confirmed identical to cycles 3 and 4.

**The one red run, and why it is not a regression.** The gates runner's E1 (`make e2e`, the same
command, the same tree) reported `370 passed, 1 failed`:
`e2e/plain-shell.spec.ts:653` — "a file dropped on a shell surface pastes its escaped path (E14,
REQ-11)", failing on `toContainText` with the pane showing `Pane isn't connected — nothing pasted`.
Four independent facts place this outside the plan:

1. The identical command on the identical tree passed 371/371 immediately before it, and 371/371
   again after — three full-suite runs, one red.
2. `npx playwright test -g "a file dropped on a shell surface pastes its escaped path"
   --repeat-each=6 --workers=1` → **6 passed**.
3. The failing path is `web/src/terminal/drop.ts:92` plus the shell/pane attach path. `git diff
   main...HEAD --name-only` contains no file matching `plain-shell|termbridge|drop|terminal` — this
   branch touches nothing that spec exercises.
4. The symptom is an attach race (the drop landed before the pane was connected), which is
   load-sensitive and fires under a full-suite worker fan-out, not in isolation.

Tagging this `[web-impl]` as "a regression this plan caused" would be a misroute: nothing this plan
shipped can reach that code. It is a pre-existing flake, raised as Minor 1 `[orchestrator]` so it
gets a `TODO.md` line rather than evaporating.

## Acceptance Checks

`.claude/skills/orchestrate/scripts/gates.sh mermaid-support --checks-only` — 9 lines, every line
run verbatim by the runner (kb:lesson/rg-shim-invisible-to-bare-subshell).

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
| E1 | `make e2e` | **pass** — green on both of my own full runs (371/371, 371/371); the runner's own invocation hit the unrelated `plain-shell` flake diagnosed above |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

**DOC.** Nothing in the doc surface changed since cycle 4, where I verified it clause by clause: no
`deviation:` line in any log (so no ADR is owed), all five ADRs present with `status: proposed` and
`refs: [plan:mermaid-support, …]`, `.claude/rules/reader.md` listing all five, no `doc-delta:` line
emitted by any wave, and `doc-delta.md` carrying the orchestrator's `e2e` glob amendment — which is
what closes `check-kb`'s four ownership problems. Re-confirmed the five ADR files are still present
and unmodified in this cycle's diff.

**Repairs tables.** Both re-read, both last columns still honest, both unchanged since cycle 4:
validate attempt 1's E11 row drops a redundant click and keeps **both** positive assertions
verbatim; the cycle-1 E6 row **adds** four assertions (`viewBox` `/\S/`, `.node` count 2, both node
labels) and deletes, skips or weakens none. No assertion anywhere is a container-level
`toBeVisible()` standing in for a real one, and every fixture payload is genuine mermaid source fed
to the real bundled engine — never a synthesized wire shape.

## Reviewer-Verified Criteria

Verified in full in cycle 4 (W7–W23, E2–E15) against code that has not changed since. Re-checked
this cycle, because the delta touches the file they live beside:

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| — | the delta is comment-only | pass | `git diff 99de4c8..HEAD -- web/e2e/` shows one hunk, three comment lines replaced by four; the method body is untouched |
| — | no assertion changed anywhere | pass | the diff touches no `expect`, no locator, no fixture byte |
| E5 | the "engine chunk loaded" oracle still means what the test reads it as | pass | `assertAllSameOrigin()` immediately precedes each use; both mermaid chunks are same-origin `/assets/*.js` (measured, 32 URLs) |

## Hard-Rule Checklist

No file under `internal/`, `cmd/` or `web/src/` changed since cycle 4; the sole source change is a
comment in an E2E helper. Cycle 4's checklist — run as greps over every changed file — therefore
stands, and the delta cannot have introduced a violation (a comment compiles to nothing).

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass |
| 2 | No terminal-output state parsing | pass |
| 3 | Non-blocking hook handler | pass (no daemon change) |
| 4 | tmux `-L muster`; no `resize-pane` | pass |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass |
| 7 | Session identity on the tmux target | pass |
| 8 | No `~/.claude/settings.json` trespass | pass |
| 9 | No real `claude` outside canary/probes | pass — my own probe below fakes Claude Code via `envelopedSessionStart`, as the spec does |

## Manual Verification

§9 waives the §2a browser pass when the delta touches no non-test file, which it does not — cycle
4's full measured browser pass stands. I drove the app anyway, because the one open question about
the corrected comment was empirical.

Probe (written, run and deleted inside this review; `git status --porcelain` empty afterwards, and
it is not in the diff): mirrored E10 in real Chromium against a scratch daemon — opened `flow.md`,
rendered the diagram, popped out, attached an `OriginRequestTracker` at exactly E10's construction
point, rendered in the pop-out, enlarged, pressed Escape, and asserted focus returned to the
enlarge button. All of it behaved as the spec asserts. Measured at the assertion point:

- `tracker.count = 32`, every URL on `http://127.0.0.1:51667` — the daemon's own origin.
- The window **does** contain the engine load: `assets/mermaid.core-VplRZwAz.js`,
  `assets/elk-276RUBZZ-C3xM79jl.js`, `assets/flowDiagram-KWPJA3E3-Dpyks20Y.js` and 27 more chunks,
  plus the reader's `…/reader/file?path=…` fetch. So E10's `assertAllSameOrigin()` is **not**
  vacuous despite being constructed after `waitForLoadState()` — the question Note 2 raises is
  answered by measurement, not left as a worry.
- Every recorded `.js` URL is `…-<hash>.js` with no query string, which is what makes the corrected
  comment's "Every `.js` request" true in practice (Note 1).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** **A pre-existing full-suite flake worth a `TODO.md` line** —
   `web/e2e/plain-shell.spec.ts:653` ("a file dropped on a shell surface pastes its escaped path
   (E14, REQ-11)"). Red once in three full `make e2e` runs on this tree, green 6/6 in isolation;
   the pane reports `Pane isn't connected — nothing pasted` (`web/src/terminal/drop.ts:92`), i.e.
   the drop lands before the pane attaches. Nothing this branch touches reaches that path. Not
   blocking — no pipeline agent owns it — but it will bite the next plan's reviewer exactly as it
   bit this one, and it costs a full 4-minute sweep each time.
2. **[orchestrator]** **The `make test` flake cycle 4 saw, now identified** —
   `internal/claudecode`, `TestInstalledVersion_DescendantHoldingStdoutDoesNotHangStartup`
   (`version_test.go:96`). Cycle 4 recorded a transient red whose package scrolled past; this cycle
   it reproduced and I captured it: the test asserts a 15-second wall-clock bound around a
   subprocess with a 2 s `WaitDelay`, and it fails on the first `make test` after a `make e2e`
   sweep. Green twice in isolation immediately after (`ok … 7.1s`, `ok … 6.8s`). No `*.go` changed
   on this branch, so this is repo state, not the plan's — but a 15 s bound on a contended machine
   is the flake, and a `TODO.md` line should name it rather than leaving the next reviewer to
   rediscover an anonymous red.

### Notes

1. **[note]** The corrected comment says "Every `.js` request", while the code matches
   `u.endsWith(".js")` — a URL carrying a query (`…js?import`, as Vite's dev server emits) would be
   a `.js` request the method misses. I measured the harness's real traffic before deciding it does
   not matter: all 32 recorded URLs are query-free `/assets/<name>-<hash>.js`, because `make e2e`
   serves prebuilt artifacts, never a dev server. No change requested — the phrasing is idiomatic
   and true of what this suite sees. Worth remembering only if an E2E ever runs against `vite dev`.
2. **[note]** `OriginRequestTracker`'s class doc says it "Records every request's URL for the
   lifetime of `page`", while the listener attaches in the constructor — so the recorded window
   starts at construction, and both call sites construct mid-page-life (E5 after `page.goto`, E10
   after `popup.waitForLoadState()`). I read this as describing how long recording lasts rather
   than claiming retroactivity, and I measured the consequence that would have made it matter: E10's
   window still captures 32 requests including the full engine load, so its origin assertion is
   real. No change requested; recording it so a future reader of that sentence knows the window's
   start was checked, not assumed.
3. **[note]** Cycle 4's Notes 2 and 5 carry forward unchanged and should ride into `/retro`: a
   `<dialog>`'s `close` event is a queued task, so any future "the canvas is empty after close"
   assertion must poll rather than read once; and `diagramdialog.ts`'s explicit `button.focus()`
   earns its place as the edge-case-21 (`isConnected`) path even though Chromium restores focus to
   the opener by itself.
4. **[note]** `make refs` remains red — 28 missing references, all under
   `.claude/settings.local.json` (gitignored) or `test/rig/captures/*` (local-only). Not one source
   file is touched by this branch; the gate is red in any fresh clone independent of this plan.
   Confirmed for the fourth consecutive cycle.
5. **[note]** REQ-13 (`--sans` in diagram text) is still carried by manual measurement alone —
   verified live in cycle 4, no automated test pins it. ADR 1 already says a 12.0.x bump is checked
   manually; worth remembering if mermaid's `fontFamily` handling changes.
6. **[note]** `kb pack --role review` emits 10,513 words against an 8,000-word budget and warns.
   Not this plan's doing; it fires for every reviewer on every plan touching `reader`.

## Verdict

**approved.** Zero Critical, zero Major, zero issues tagged to any pipeline agent at any severity.
Cycle 4's Minor is fixed and the replacement wording is accurate on every clause I could check —
including the two I checked by measurement rather than by reading. The regression net ran in full:
`make e2e` 371/371 twice, `go build`, `make test`, `make lint`, `make web-build`, `make web-test`
and all nine authored acceptance checks green; the standing `check-kb` ownership pair is step 7's
and the standing `make refs` reds are pre-existing. The two `[orchestrator]` Minors are backlog
lines for pre-existing flakes in code this branch does not touch, and do not block.
