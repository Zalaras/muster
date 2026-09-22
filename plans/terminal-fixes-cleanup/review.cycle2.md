# Review: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Verdict**: needs-changes
**Pack**: `kb: pack 18697 words (budget 8000)` — WARN over budget; sections rules 3167 · features 2088 · diagrams 3784 · decisions 5050 · proposed 1550 · facts 251 · lessons 2799 · runbooks 2 (features `surfaces`, `theme`)

Cycle 2. All six of cycle 1's Majors are fixed and verified below — including Major 1, which I
re-measured in a browser and then re-broke on purpose to prove its new regression test
discriminates. The verdict is `needs-changes` for one newly-observed defect: a plan-authored E2E
spec (E13) is flaky, which I hit once in a clean tree during this review.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 pip and its token gone, idle shell shows nothing | Yes | Yes (E14/E15 greps; browser: `--shell-pip` resolves to `""`, indicator count 0 while idle) | pass |
| REQ-2 spinner while busy, mainhead + tile footer | Yes | Yes (shell-activity basic test; browser: `data-act="busy"`, `animation-name: shellact-spin`) | pass |
| REQ-3 tick on busy→idle, never without a spinner | Yes | Yes (E2E + `observeIdle`/W8 units) | pass |
| REQ-4 (amended) tick clears on select; self-clears when already selected; snapshot-restored tick always self-clears | Yes | Yes (E2E away-surface, self-clear, E8) | pass |
| REQ-5 Option+Arrow word jump | Yes | Yes (E1 + Option+Right, capture-pane oracle) | pass |
| REQ-6 Cmd+Arrow line jump | Yes | Yes (E2 + Cmd+Right) | pass |
| REQ-7 wheel scrolls tmux history, never cursor keys | Yes | Yes — **now including sub-line gestures**: E4/E5/E6 for ordinary deltas, the new slow-trackpad test for the cycle-1 defect (discrimination independently proven, below) | pass |
| REQ-8 drag-to-select survives | Yes | Yes (E13) — but the spec is flaky, Minor 1 | pass (impl); spec defect |
| REQ-9 Claude surface untouched | Yes | Yes (E3/INV-1, two source states, byte-level) | pass |
| REQ-10 typing while scrolled back | Yes | Yes (E10 + daemon unit both source states) | pass |
| REQ-11 ~600 ms onset delay | Yes | Yes (W8 unit) | pass |
| REQ-12 scroll with no history | Yes | Yes (E9, `ScrollCopyMode` no-history no-op unit) | pass |
| REQ-13 a program waiting for input is never busy | Yes | Yes (daemon `TestTick_BusyGating_Table`, 8 subtests) | pass |
| REQ-14 silent work raises spinner and tick | Yes | Yes (E2E uses `sleep` throughout; D9 unit) | pass |
| DIAG `kb:diagram/daemon-components`, `kb:diagram/web-components` | Both updated | — | pass — `daemon-components` carries the `internal/tty` component and its `Rel`; `web-components` now says `terminal/` has "7 modules", and `ls web/src/terminal/*.ts` (excluding tests) is exactly 7. `kb for` on every changed source file names only these two records |

## Build & Tests

E2E tests: pass (395/395, whole-suite regression sweep — includes this cycle's new slow-trackpad test)
E2E soak (mine, this cycle): `shell-scroll.spec.ts` ×6 under 4 workers = 42/42; E13 alone ×12 = 12/12
Daemon tests: pass (`make test`, 20 packages)
Web tests: pass (1728/1728, 43 files)
Daemon build: pass
Web build: pass
Lint: pass (`make lint`, `make web-lint`, `make e2e-lint`)
Contrast (AA gate): pass
check-kb: **FAIL** — the 8 "owned by no feature" entries only; see the DOC row

## Acceptance Checks

One invocation: `GATES_LOG_DIR=/tmp/review-gates .claude/skills/orchestrate/scripts/gates.sh terminal-fixes-cleanup` — 23 lines, 1 failed.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D7 | `! rg -n "\"mouse\", \"on\"\|mouse on" internal/ --glob '!*_test.go'` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W10 | `! rg -n ": any\b" web/src/terminal` | pass |
| E14 | `! rg -n -e "--shell-pip" web/src web/scripts web/e2e` | pass |
| E15 | `! rg -n -e "pipEl" -e "shellPip" web/src web/e2e` | pass |
| E1 | `make e2e` | pass (395/395) |
| — | `make web-lint`, `make contrast`, `make check-versions`, `e2e-honest`, `dead-refs`, `make e2e-lint` | pass |
| — | `make check-kb` | **FAIL** — the 8 ownership problems, doc-reconcile's to close |
| DOC | doc upkeep + Doc Delta vs what shipped | pass |

**On `check-kb` — the split is still right, and the list is complete.** The 8 problems are exactly
`internal/server/shellactivity.go`, `internal/server/shellactivity_test.go`,
`internal/tty/canonical.go`, `internal/tty/canonical_test.go`, `web/e2e/helpers/shellinput.ts`,
`web/e2e/shell-activity.spec.ts`, `web/e2e/shell-keys.spec.ts`, `web/e2e/shell-scroll.spec.ts` — I
diffed the gate log against `doc-delta.md`'s list and they match one for one, all 8, no extras and
nothing missing. The globs that fix them live in `docs/features/*/spec.md`, which
`.claude/agents/doc-reconcile.md:23` names as that agent's input contract and which neither a
pipeline agent nor the orchestrator may edit here, so this gate cannot be green at review time for
any plan that adds files. Not routed to an agent; the run must not complete until doc-reconcile
closes it. Staged in `doc-delta.md`, so the backstop cannot lose it.

**On the DOC row.** Majors 3 and 4 are fixed correctly and in the right places. The busy-derivation
claim is amended in `plans/terminal-fixes-cleanup/doc-delta.md` (not `plan.md`, which correctly
stays as approved) and now names all three gates with the tty line discipline called out as
load-bearing — that is the file doc-reconcile reads, so the fix lands where it ships. Every other
Doc Delta line holds against what shipped: the wheel→`scroll`→copy-mode path with mouse mode off
(verified in code and E2E), the shell-only readline translation (INV-1 below), the pip's deletion
(browser: the token resolves to the empty string), and the narrowed scrollback-affordance sentence
(`kb:adr/surfaces-scrollback-affordance-claude-pane-only`, `proposed`, supersedes the old ADR).
Five `proposed` ADRs with `refs: plan:terminal-fixes-cleanup` cover the plan's four decisions plus
the one `deviation:` line, which describes what shipped; no new `deviation:`/`doc-delta:` lines
were produced this cycle. `TODO.md`'s "Together — the shell tab (#31, #33, #45)" block is still
open, which is what the plan specifies (moves across at Completion).

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W5 | `shell` button's accessible name is exactly `shell` in all four indicator states | pass | Drove a real browser this cycle (not cycle 1's numbers). `getByRole("button", { name: "shell", exact: true })` matched exactly **1** in the idle, busy and done states; the indicator carries `aria-hidden="true"` and `textContent === ""`, so the fourth state (the ~3 s self-clearing tick) is the same DOM as done |
| W11 | spinner and tick resolve to `--fg-dim`/`--fg`, no state hue | pass | Computed styles, measured: busy `border-left-color: rgb(166,171,188)` = `#a6abbc` = `--fg-dim`; done borders `rgb(232,230,225)` = `#e8e6e1` = `--fg`. `--teal` is `#56c5d0` and `--amber` is `#f2a33c` — neither matches. `--shell-pip` resolves to `""` |
| D5 | `alternate_on` gating reads correctly | pass | `internal/server/shellactivity.go:170` — `if pa.AlternateOn \|\| pa.CurrentCommand == p.shellBase { continue }` short-circuits before the ioctl, so an alternate-screen pane is never busy whatever its command; `TestTick_BusyGating_Table`'s 8 subtests assert both the verdict and whether the ioctl was reached |
| INV-1 | both handlers unreachable for `kind !== "shell"` | pass — **re-verified after this cycle's `pane.ts` change** | `pane.ts:159` `if (kind === "shell") this.installShellInputHandlers(term);` is still the sole call site, and `rg` over `web/src` finds `attachCustomKeyEventHandler`/`attachCustomWheelEventHandler` at exactly two lines, `pane.ts:170` and `:179`, both inside that method. The cycle-2 diff touched only `flushWheelScroll`'s body and its doc comment — the guard, the call site and the handler bodies are byte-identical to the version cycle 1 cleared |
| INV-2 | no code path sets tmux `mouse` on; no mouse-enable sequence reaches the browser | pass (with cycle 1's caveat, unchanged) | `serverOptions` untouched, D7's grep green, `tmux show-options -g mouse` asserted `off` after a shell spawn and again after a scroll + copy-mode auto-exit. The second clause (`?1000h`/`?1002h`/`?1003h`/`?1006h` never reaching the browser) still has no direct assertion; I accept the option oracle in its place for the reasons cycle 1 recorded — it is causally upstream, and a server→client byte recorder would be new infrastructure for a strictly weaker oracle |

## Manual Verification

Drove the dashboard in Chromium against a real scratch daemon, through a temporary spec I wrote,
ran, and deleted (`git status --porcelain` clean afterwards, verified). Everything below is a
measured value, not a re-read of a log.

- **Indicator lifecycle by hand**: launched a session, opened the shell surface, ran `sleep 3`,
  watched `span.shellact` go absent → `data-act="busy"` → `data-act="done"`. Accessible name and
  computed colours captured at each state (W5/W11 rows). Screenshots at
  `/tmp/review-gates/review2-busy.png` and `/tmp/review-gates/review2-done.png`.
- **Cycle 1 Major 1's exact repro, re-measured on the fixed build**: filled a shell pane to
  `history_size = 179`, then sent 60 wheel events of `deltaY = -4`, each in its own animation
  frame. Result: `#{pane_in_mode} = 1`, `#{scroll_position} = 12`. Cycle 1 measured `0` (nothing
  scrolled at all) on the same gesture. 12 lines is exactly 240 px ÷ 20 px/line, so nothing is lost
  and nothing is double-counted.
- **Proof the new regression test discriminates** (the thing worth more than the green run):
  I reintroduced the pre-fix bug in `web/src/terminal/pane.ts` myself — `this.wheelAccumDeltaY = 0`
  restored *before* the `lines === 0` early return — rebuilt (`make web-build build`) and ran the
  new test alone. It failed with precisely the cycle-1 symptom:
  `waiting for the slow gesture's accumulated sub-line deltas to enter copy-mode … Expected: "1" Received: "0"`,
  15 s timeout, at `shell-scroll.spec.ts:195`. I then restored the file from my own copy (no git
  checkout/stash/reset), rebuilt, and confirmed the same test green. So the test fails on the bug
  and passes on the fix — it is not a test that would pass either way. The load-bearing part is
  `waitForAnimationFrame` between dispatches: without it Playwright's CDP round-trips batch several
  wheel events into one flush, which crosses a line and hides the defect; with it, each event gets
  its own flush, which is the real trackpad cadence.
- **Flake hunt**: during that restore run, a *different* test in the same file — E13, drag-to-select —
  failed once (`drag target text has no bounding box`). I then ran E13 alone ×12 (12/12) and the
  whole `shell-scroll.spec.ts` file ×6 under 4 workers (42/42). One failure in ~120 runs; see
  Minor 1.

Not verified by hand: tile-footer indicator sizing at 3×2 density (no automated width oracle; the
E2E assertions cover presence and `data-act`, not layout) — unchanged from cycle 1.

## Hard-Rule Checklist

Swept over the plan's changed `.go`/`.ts`/`.css` files, not the whole tree.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code-format field names outside `internal/claudecode/` | pass — `rg` for `hook_event_name\|rate_limits\|permission_mode\|transcript_path\|status_line` over every changed file: no hits |
| 2 | No terminal-output state parsing | pass — `capture-pane` appears only as an E2E oracle (`helpers/shellinput.ts`, `shell-keys.spec.ts`) and the pre-existing display feed. The poller reads `#{pane_current_command}`/`#{alternate_on}`/`#{pane_tty}` and a TIOCGETA ioctl — tmux's process tracking, not pane content |
| 3 | No blocking hook handler / no >2 s hook timeout | pass — this plan touches no hook path |
| 4 | tmux always on a dedicated socket; sizing via `pty.Setsize` + `resize-window` | pass — `internal/tmux`'s `socketFlag()` still emits `-L`/`-S` for every invocation including the new `list-panes -a`; `resize-pane` appears nowhere in `internal/` or `web/` |
| 5 | No payload logging | pass — the three new log lines carry an error, a tty device path and a session id; no pane text, no prompt text |
| 6 | No empty-gauge dishonesty | pass — absent data renders *nothing* (indicator removed), never a 0 % or an empty track |
| 7 | Session identity on the tmux target | pass — `tmux.IsShellSessionName(pa.SessionName)` maps the tmux session name to Muster's own `int64` id; Claude's `session_id` is never involved |
| 8 | No settings trespass | pass — only two comments mention `settings.local.json`; no read or write, no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — the new specs drive `sleep`, `echo` and `seq` in a plain shell; `"claude"` appears only as a surface-button name |

## Code Review Notes

**Daemon.** `internal/tty/canonical.go` is 20 lines doing one thing, with `O_NONBLOCK|O_NOCTTY`
justified in the comment and both errors `%w`-wrapped. `internal/server/shellactivity.go` follows
the established `usagePoller`/`themePoller` Start/Stop/loop/tick shape, propagates `ctx`, honours
the shutdown deadline with a warning rather than a hang, keeps its `busy` map behind a mutex, gates
the tmux exec on `hasShells()`, and treats a vanished tty as a skipped session rather than a fatal.
Test seams are function fields (`paneActivityLister`, `ttyCanonicalChecker`), not fakes. The
composition root gets one registration line plus a three-line nil-default for the `ShellScroll`
override, which matches the existing `attach` pattern — within the one-line-registration rule's
intent.

**Web.** `flushWheelScroll`'s fix is arithmetically right in both directions
(`accum=-24 → lines=1 → accum=-4`; `accum=+24 → lines=-1 → accum=+4`), and the sign convention is
the one `wheelDeltaToScrollLines` documents. `PIXELS_PER_LINE` is exported with a reason and has
exactly two references. No `any` in `web/src/terminal` (W10). `updateSurfaceSegment` stays a pure
DOM writer over the reducer's verdict; `shellactivity.ts` stays free of DOM and sockets. The three
UI states are all handled — absent (no indicator), busy, done — and daemon-down is the existing
disabled-segment path.

**Design system (§6a).** Every colour in the new CSS resolves to a semantic token (`--fg-dim`,
`--fg`); `transparent` on the spinner's gap is not a colour literal. `--shell-pip` is gone from all
three `[data-theme]` blocks and from `contrast-pairs.json`'s exempt and hue-band lists — the exempt
list only shrank. No state hue is used for a non-state signal, and colour is not the sole carrier
(shape and `data-act` change too). No web fonts, no numerics needing `tabular-nums`, and no new
`hidden` toggles (the indicator attaches and `.remove()`s), so no `[hidden]` companion is owed.
Honesty rules (§6): absent data draws nothing rather than an empty track. Terminal rules (§7):
`scrollback: 0` unchanged, sizing untouched, no styling reaches pane contents, one live client per
target unchanged.

## Issues

### Critical

None.

### Major

None. All six of cycle 1's Majors are fixed and verified:

1. **Major 1 `[web-impl]`** — fixed in `6cfc53d` and measured green by me in a browser (12 lines for
   60 × `deltaY = -4`, was 0), with the new regression test proven to discriminate.
2. **Major 2 `[web-tests]`** — `shellactivity.test.ts`'s W8 comment now describes the shipped guard
   in the present tense, and it is accurate: `observeIdle`'s `indicator === "none"` branch does bump
   the epoch when an entry exists (`shellactivity.ts`), which is what makes the scheduled
   `resolveOnset` no-op. The dead "Implementation Bugs table" pointer is gone. Assertions untouched.
3. **Major 3 `[orchestrator]`** — the busy-derivation claim in `doc-delta.md` now names all three
   gates and flags the tty gate as the one that must not be dropped on promotion.
4. **Major 4 `[orchestrator]`** — `kb:diagram/web-components` says "7 modules"; I counted 7.
5. **Major 5 `[web-impl]`** — the two cited comments are reworded, and the sweep caught a third I had
   not cited (`features/surfaces.ts:161`). The surviving `pip` mentions are all explicit past tense
   ("is retired in favour of…", "supersedes the pip") — correct history, not false claims.
6. **Major 6 `[web-tests]`** — `surfaceswitch.test.ts`'s describe and test names now say
   `shellRunning` and explain what it actually gates; the assertions are byte-identical.

### Minor

1. **`[e2e-specs]`** E13 (drag-to-select) is flaky — `web/e2e/shell-scroll.spec.ts:81`, failing at
   `:100`. Observed once by me in a clean tree on the shipped code:

   ```
   Error: drag target text has no bounding box
     at /Users/damian/.../web/e2e/shell-scroll.spec.ts:100:21
   1 failed  [chromium] › dragging across a shell surface still selects text … (E13, REQ-8)
   ```

   Measured rate: 1 failure in ~120 runs — the one failure came in a whole-file run started
   immediately after `make web-build build` (i.e. with the machine still loaded), and I could not
   reproduce it in 12 isolated runs or 42 whole-file runs afterwards. The cause is in the spec, not
   the product: `const box = await textLine.boundingBox()` takes a single, non-retrying snapshot of
   an element inside xterm's DOM renderer, which rewrites row elements as output lands, so the box
   can come back `null` between the `toBeVisible` that preceded it and the read. `getByText(...)`
   can also match both the typed command line and the echoed output row, which is the same
   instability from the other side. Fix: make the box acquisition retry (e.g. poll until
   `boundingBox()` is non-null, or re-resolve inside the poll) and pin the locator to the echoed
   output row rather than any row containing the substring. Please do not chase a repro to prove
   the fix — at ~1 % a soak cannot distinguish a fix from luck; the argument has to be that the
   racy read is gone, plus the standard `make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10` to show
   nothing regressed. Left alone, this costs somebody an unrelated red `make e2e` and a diagnosis.

2. **`[orchestrator]`** The plan's ```checks block should have carried `make web-lint`, and that
   omission is exactly why wave 2 shipped a Biome format error under a gate that reported "0
   failed". This is a plan defect rather than something an agent can fix, and it does not block
   approval. Evidence that it is the intended mechanism, not a nice-to-have:
   `.claude/skills/orchestrate/scripts/gates.sh:243-245` says, in its own words, "A wave runs every
   authored check except the suites a later wave owns — this is what makes `make web-lint` (and any
   other static check the plan authored) part of every wave gate." The wave cases hard-code only
   `build`/`lint`/`test`/`web-build`/`web-test`/`e2e`; every other static gate is expected to reach
   a wave *through the plan's authored block*. With only `W1 make web-build` and `W2 make web-test`
   authored, no wave ever ran Biome, and the error surfaced only when the wave-3 agent ran it by
   hand. `make web-lint` is a baseline gate of `gates.sh`, so review time was always covered — the
   gap is purely mid-run. Two ways to close it, and the choice is a pipeline-doc matter for
   `/retro`, not something to fix inside this plan: author `W? make web-lint` in future plans (what
   the script's comment assumes), or add `web-lint` to the wave-2 hard-coded case so no plan can
   forget it.

### Notes

1. **[note]** *On the deliberate carry past the 200-line clamp — asked for, so here is the
   judgement: keep it.* `flushWheelScroll` subtracts only `lines * PIXELS_PER_LINE`, and
   `wheelDeltaToScrollLines` clamps `lines` to 200, so an accumulator above 4000 px keeps a
   residue. I traced the one case where that is observable: a flush is scheduled *only* by a wheel
   event, so the residue is not delivered on its own — it waits for the next wheel event, of any
   size and **any direction**. A gesture that accumulated, say, 10 000 px in a single animation
   frame would leave 6 000 px queued, and the user's next small nudge *downward* would still scroll
   200 lines *up*. Reaching it needs >4000 px of `deltaY` inside one ~16 ms frame (macOS trackpad
   flings run a few hundred px per frame), so I judge it unreachable in practice, and the
   alternative — clamping the carry — would put a second piece of scroll arithmetic outside the
   pure function that owns it, which is the mistake this fix was correcting. Recorded so the
   reasoning exists if a high-resolution mouse ever makes it reachable.
2. **[note]** The new Vitest coverage for the accumulator (`shellkeys.test.ts`'s
   `PIXELS_PER_LINE` describe) *mirrors* `flushWheelScroll`'s step in a local `accumulateFrame`
   helper rather than calling shipped code — the real accumulator is private and DOM-bound, and the
   test says so honestly. It follows that reverting `pane.ts` to the pre-fix zeroing would leave
   these unit tests green; the E2E test is the one that binds, and I proved it does. If the
   arithmetic ever changes again, the cheap fix is to lift the step into `shellkeys.ts` as a pure
   `(accum, deltaY) => { accum, lines }` and have `pane.ts` call it. No change requested now.
3. **[note]** `shellact-spin` is the only `animation:` declaration in the whole stylesheet, and
   there is no `prefers-reduced-motion` block anywhere in `web/src` or `docs/design`. The design
   system does not ask for one, so this is not a compliance defect — flagged only because a
   0.7 s infinite spinner is the app's first sustained motion, and if a reduced-motion rule is ever
   wanted, this is the element that needs it.
4. **[note]** Cycle 1's Notes 1–11 all still hold and are not repeated here. The two worth keeping
   in view: the one wasted `send-keys -X cancel` after copy-mode auto-exits (Debug-logged, injects
   nothing), and a shell that exits while busy with no shell surface mounted leaving a tick that
   clears on the next `shell` selection.
5. **[note]** The `## Repairs` table gained one row this cycle — "None", for a wave that added a
   test and a helper and touched no existing assertion. I verified that independently: the cycle-2
   diff of `web/e2e/` is purely additive (`wheelSlowScroll`, `waitForAnimationFrame`, one new
   `test(...)` block); no assertion was deleted, skipped, weakened or replaced by a container-level
   `toBeVisible()`, and no fixture payload changed. Cycle 1's five rows re-checked and still sound.
