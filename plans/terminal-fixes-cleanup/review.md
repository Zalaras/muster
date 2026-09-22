# Review: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Verdict**: approved
**Pack**: `kb: pack 18697 words (budget 8000)` — WARN over budget; sections rules 3167 · features 2088 · diagrams 3784 · decisions 5050 · proposed 1550 · facts 251 · lessons 2799 · runbooks 2

Cycle 3, **delta re-review** (§9): cycle 2's only open agent-tagged issue was one Minor. The full
gate run still happened — it is the regression net and I am still the final validation. The
cycle-2 diff (`d48ad27..HEAD`) touches `web/e2e/shell-scroll.spec.ts`, `test-specs.md`,
`proposed-backlog.md` and `orchestration-state.json` and **nothing** under `web/src/`, `internal/`
or `cmd/` (`git diff --stat 25ae83c..HEAD -- web/src internal cmd` is empty), so §2a and the §3–§7
re-read are skipped per §9. Cycle 2's Requirements, Hard-Rule, Reviewer-Verified and Manual
Verification findings stand unchanged and are not restated.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 … REQ-14 | Yes (unchanged since cycle 2) | Yes | pass — verified in cycle 2; no product code changed since |
| REQ-8 drag-to-select survives | Yes | Yes (E13) — **spec defect now fixed**, see Delta | pass |
| DIAG `kb:diagram/daemon-components`, `kb:diagram/web-components` | Both updated | — | pass — unchanged since cycle 2; no changed file this cycle has a `kb for` diagram |

## Build & Tests

E2E tests: pass (395/395, whole-suite regression sweep, 2.5 m)
E2E soak (mine, this cycle): `make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10` → **70/70** in 59.1 s
Daemon tests: pass (`make test`)
Web tests: pass (`make web-test`)
Daemon build: pass
Web build: pass
Lint: pass (`make lint`, `make web-lint`, `make e2e-lint`)
Contrast (AA gate): pass · versions: pass · dead-refs: pass · e2e-honest: pass
check-kb: **FAIL** — the same 8 "owned by no feature" entries only; see the DOC row

## Acceptance Checks

One invocation: `GATES_LOG_DIR=/tmp/review-gates .claude/skills/orchestrate/scripts/gates.sh terminal-fixes-cleanup` — 23 lines, 1 failed.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass (deduped — same command as the baseline gate, proven against this tree) |
| D2 | `go build ./...` | pass (deduped) |
| D3 | `make lint` | pass (deduped) |
| D7 | `! rg -n "\"mouse\", \"on\"\|mouse on" internal/ --glob '!*_test.go'` | pass |
| W1 | `make web-build` | pass (deduped) |
| W2 | `make web-test` | pass (deduped) |
| W10 | `! rg -n ": any\b" web/src/terminal` | pass |
| E14 | `! rg -n -e "--shell-pip" web/src web/scripts web/e2e` | pass |
| E15 | `! rg -n -e "pipEl" -e "shellPip" web/src web/e2e` | pass |
| E1 | `make e2e` | pass (395/395, deduped) |
| — | `make web-lint`, `make contrast`, `make check-versions`, `e2e-honest`, `dead-refs`, `make e2e-lint` | pass |
| — | `make check-kb` | **FAIL** — the 8 ownership problems, doc-reconcile's to close |
| SOAK | `make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10` | pass (70/70) — run by me because the diff repairs a flaky spec the ```checks block does not soak |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

**On `check-kb`.** Unchanged from cycle 2 and re-confirmed against this tree: the 8 problems are
exactly the plan's new files (`internal/server/shellactivity{,_test}.go`,
`internal/tty/canonical{,_test}.go`, `web/e2e/helpers/shellinput.ts`,
`web/e2e/shell-{activity,keys,scroll}.spec.ts`). The globs that close them live in
`docs/features/*/spec.md`, which neither a pipeline agent nor the orchestrator may edit — this gate
cannot be green at review time for any plan that adds files. Not routed to an agent; it is
doc-reconcile's, and the run must not complete until it is closed. Staged in `doc-delta.md`, so the
backstop cannot lose it.

**On the DOC row.** No new `deviation:` or `doc-delta:` lines were produced this cycle (the only
log touched is `test-specs.md`, whose new section records a repair, not a decision). The five
`proposed` ADRs, the `doc-delta.md` claims and the open `TODO.md` block are all as cycle 2 verified
them. The `## Repairs` table gained one row, verified below.

## Reviewer-Verified Criteria

All cycle-2 rows (W5, W11, D5, INV-1, INV-2) stand — none of the code they cover changed. One row
re-derived because the diff touches its spec:

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| INV-2 / REQ-8 | E13 still asserts the real drag, unweakened | pass | `git show 25ae83c:web/e2e/shell-scroll.spec.ts` vs HEAD: the `mouse.move` → `down` → `move(…, {steps: 10})` → `up` sequence and the `.xterm-selection` `childElementCount > 0` poll are **byte-identical**. Only the locator and the box acquisition changed |

## Manual Verification

Skipped under §9 — the diff contains no non-test change under `web/src/`, `internal/` or `cmd/`,
so the browser behaviour cycle 2 measured by hand (indicator lifecycle, computed token colours,
the 60 × `deltaY = -4` gesture scrolling 12 lines) is the behaviour that ships. In its place I ran
the repaired spec against a real daemon and real tmux 70 times (10 × the 7-test file), which drives
the same drag through a real Chromium.

## Delta

| Prior Minor | Fix commit | Verified how |
|-------------|------------|--------------|
| cycle 2 Minor 1 `[e2e-specs]` — E13 flaky: "a single, non-retrying snapshot… the box can come back `null`", plus a `getByText` that can match both the typed command line and the echoed output row | `951f8b2` | Diff read in full; pre-fix and post-fix bodies compared line by line; the structural argument checked against xterm.js's DOM renderer and Playwright's locator semantics (below); `make e2e` 395/395 and my own 70/70 soak as regression evidence, not as proof of the fix |
| cycle 2 Minor 2 `[orchestrator]` — `make web-lint` never runs in a wave gate | not fixed, by design | Correct. I framed it as a pipeline-doc matter for `/retro`, not fixable inside this plan, and non-blocking. It is recorded in `proposed-backlog.md` with my `gates.sh:243-245` evidence, both remedies, and "Change requested: yes" — faithful |

**The racy read is gone.** `expect.poll`'s callback calls `textLine.boundingBox()` on a *Locator*,
not a handle: Playwright re-resolves a locator against the live DOM on every call, so each attempt
re-queries rather than re-reading a node that may already be detached. The observed failure mode —
`boundingBox()` returning `null` for a row xterm had momentarily emptied — is exactly the condition
the poll retries on, and the `captured.box` non-null is what ends it. The surviving
`if (!box) throw` is dead in practice but needed for TS narrowing; the object-property wrapper and
its comment are the honest reason why, not cargo cult.

**`.last()` is sound.** Playwright's text engine matches the *smallest* element containing the
substring, so the candidates are per-row elements (or spans inside them), never an ancestor
wrapping both rows. xterm.js's DOM renderer keeps one row element per screen line in
`.xterm-rows` in fixed top-to-bottom document order and rewrites a row's children in place rather
than reordering nodes, so document order equals visual order and the bottommost match is the output
row — which is always below the command that produced it, never above. If the command row has
scrolled off and only the output row matches, `.last()` is still that row. The comment states this
argument rather than asserting the outcome, which is the right shape for a locator whose soundness
depends on a renderer's invariant.

**The assertion is unweakened.** Same synthesized drag, same `.xterm-selection` overlay oracle,
same `> 0` threshold, same REQ-8/INV-2 claim. Nothing was deleted, skipped, replaced by a
container-level `toBeVisible()`, or swapped for a weaker oracle; the repair touches only how the
drag's start coordinates are obtained. The `## Repairs` row's last column says exactly that, and it
is true — I checked it against the diff rather than taking it.

Per my own cycle-2 instruction the agent did not chase a ~1 % repro, and offered the soak only as
regression evidence. That is the right call and I have judged the fix on the structure, not on the
green run.

## Hard-Rule Checklist

Re-swept over the one changed source file (`web/e2e/shell-scroll.spec.ts`); cycle 2's full sweep
stands for everything else.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no Claude-Code-format field names in the diff |
| 2 | No terminal-output state parsing | pass — `capture-pane` untouched by this diff; E13's oracle is the browser's own selection overlay |
| 3 | No blocking hook handler / >2 s timeout | pass — no hook path touched |
| 4 | tmux on a dedicated socket; `resize-pane` absent | pass — no tmux invocation added |
| 5 | No payload logging | pass |
| 6 | No empty-gauge dishonesty | pass |
| 7 | Session identity on the tmux target | pass |
| 8 | No settings trespass | pass |
| 9 | No real `claude` outside canary/probes | pass — E13 drives `echo` in a plain shell |

## Issues

### Critical

None.

### Major

None.

### Minor

None. Cycle 2's Minor 1 is fixed and verified above; Minor 2 is `[orchestrator]`'s and correctly
left for `/retro`.

### Notes

1. **[note]** The disposition of my cycle-2 findings in `proposed-backlog.md` is faithful, and I am
   recording that explicitly because it was asked: Minor 2 carries "Change requested: yes" with my
   `gates.sh:243-245` quotation and both remedies; Note 2 (lift the accumulator step into a pure
   `(accum, deltaY) => { accum, lines }`) and Note 3 (`prefers-reduced-motion` for `shellact-spin`)
   each carry "Change requested: **no**" in my own words. Nothing is overstated and nothing of mine
   is missing. Filing any of it remains the user's call
   (kb:adr/process-backlog-entries-are-the-users-to-file).
2. **[note]** Residual, not a defect: if the drag-target row never attaches at all, the poll's first
   `boundingBox()` inherits the project's action timeout rather than failing fast, so that genuine
   failure would surface as a test timeout instead of the old explicit message. That path is a real
   product failure, not a flake, and the `toBeVisible({ timeout: 15_000 })` immediately above it
   already fails first in practice. No change requested.
3. **[note]** `make check-kb`'s 8 "owned by no feature" problems are doc-reconcile's, exactly as
   cycle 2 recorded. The run must not be marked complete until that gate is green.
4. **[note]** Cycle 1's and cycle 2's notes all still hold and are not repeated here. The two worth
   keeping in view: the deliberate carry past `wheelDeltaToScrollLines`'s 200-line clamp (traced
   and judged unreachable in practice, cycle 2 Note 1), and a shell that exits while busy with no
   shell surface mounted leaving a tick that clears on the next `shell` selection.
