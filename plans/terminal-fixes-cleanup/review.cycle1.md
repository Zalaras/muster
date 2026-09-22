# Review: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Verdict**: needs-changes
**Pack**: `kb: pack 18690 words (budget 8000)` — WARN over budget; sections rules 3167 · features 2088 · diagrams 3777 · decisions 5050 · proposed 1550 · facts 251 · lessons 2799 · runbooks 2 (features `surfaces`, `theme`)

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 pip and its token gone, idle shell shows nothing | Yes | Yes (E14/E15 greps, plain-shell/reader retirements, browser: `--shell-pip` resolves empty) | pass |
| REQ-2 spinner while busy, mainhead + tile footer | Yes | Yes (shell-activity basic test, both hosts) | pass |
| REQ-3 tick on busy→idle, never without a spinner | Yes | Yes (E2E + `observeIdle`/W8 units) | pass |
| REQ-4 (amended) tick clears on select; self-clears when already selected; snapshot-restored tick always self-clears | Yes | Yes (E2E away-surface, self-clear, E8) | pass |
| REQ-5 Option+Arrow word jump | Yes | Yes (E1 + Option+Right, capture-pane oracle) | pass |
| REQ-6 Cmd+Arrow line jump | Yes | Yes (E2 + Cmd+Right) | pass |
| REQ-7 wheel scrolls tmux history, never cursor keys | Partial | Yes for ordinary gestures (E4/E5/E6) | **fail** — sub-line wheel deltas are discarded, Major 1 |
| REQ-8 drag-to-select survives | Yes | Yes (E13) | pass |
| REQ-9 Claude surface untouched | Yes | Yes (E3/INV-1, two source states, byte-level) | pass |
| REQ-10 typing while scrolled back | Yes | Yes (E10 + daemon unit both source states) | pass |
| REQ-11 ~600 ms onset delay | Yes | Yes (W8 unit, post-fix) | pass |
| REQ-12 scroll with no history | Yes | Yes (E9, `ScrollCopyMode` no-history no-op unit) | pass |
| REQ-13 a program waiting for input is never busy | Yes | Yes (daemon `TestTick_BusyGating_Table`, 8 subtests; deliberately not E2E) | pass |
| REQ-14 silent work raises spinner and tick | Yes | Yes (E2E uses `sleep` throughout; D9 unit) | pass |
| DIAG `kb:diagram/daemon-components`, `kb:diagram/web-components` | daemon-components updated (`internal/tty` node + rel) | — | **fail** — web-components still says `terminal/` has "5 modules"; it has 7 (Major 4) |

## Build & Tests

E2E tests: pass (394/394, whole-suite regression sweep, reused as proven against this tree)
E2E soak: pass (`make e2e-soak SPEC=e2e/shell-activity.spec.ts N=10` — 80/80, 0 retries)
Daemon tests: pass (`make test`)
Web tests: pass (1726/1726)
Daemon build: pass
Web build: pass
Lint: pass (`make lint`, `make web-lint`, `make e2e-lint`)
Contrast (AA gate): pass — exempt list only shrank
check-kb: **FAIL** — see the DOC row

## Acceptance Checks

Run in one invocation: `GATES_LOG_DIR=/tmp/review-gates .claude/skills/orchestrate/scripts/gates.sh terminal-fixes-cleanup` — 23 lines, 1 failed.

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
| E1 | `make e2e` | pass (394/394) |
| — | `make web-lint`, `make contrast`, `make check-versions`, `e2e-honest`, `dead-refs`, `make e2e-lint` | pass |
| — | `make check-kb` | **FAIL** — 8 "owned by no feature" for this plan's new files |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — Doc Delta busy-derivation line is incomplete (Major 3); `kb:diagram/web-components` stale (Major 4) |

**On `check-kb`.** The 8 problems are the new files (`internal/tty/*`, `internal/server/shellactivity*`, `web/e2e/shell-*.spec.ts`, `web/e2e/helpers/shellinput.ts`) needing a `docs/features/<name>/spec.md` glob. Those globs live in a file neither I nor the orchestrator may edit — `doc-reconcile` owns it and runs after approval — so this gate cannot be green at review time for any plan that adds files. I agree with the orchestrator's read: not routed to a pipeline agent, but the run **must not complete** until `doc-reconcile` closes it. Listed here so the backstop cannot lose it.

The four ADRs the plan promised plus the mid-run deviation ADR are all present, `status: proposed`, `refs: [plan:terminal-fixes-cleanup, …]`, with correct `supersedes` (`theme-shell-pip-own-token`, `surfaces-scrollback-affordance-not-built`). The one `deviation:` line has its ADR and it describes what shipped. The one `doc-delta:` line is staged in `doc-delta.md` and correctly concludes the plan's Doc Delta text needs no change *on that point*. `TODO.md`'s "Together — the shell tab (#31, #33, #45)" block is still open, which is what the plan specifies ("moves across at Completion").

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W5 | `shell` button's accessible name is exactly `shell` in all four indicator states | pass | Drove a real browser (below). `getByRole("button", { name: "shell", exact: true })` matched exactly 1 in the absent, busy and done states; indicator carries `aria-hidden="true"` and empty text, so the fourth state (the ~3 s self-clearing tick) is the same DOM as `done` |
| W11 | spinner and tick resolve to `--fg-dim`/`--fg`, no state hue | pass | Computed styles in the browser: busy `border-left-color: rgb(166,171,188)` = `#a6abbc` = `--fg-dim`; done borders `rgb(232,230,225)` = `#e8e6e1` = `--fg`. Neither equals `--teal` `#56c5d0` nor `--amber` `#f2a33c`. `--shell-pip` resolves to the empty string — the token is gone from `:root` |
| D5 | `alternate_on` gating reads correctly | pass | `shellactivity.go:173` — `if pa.AlternateOn \|\| pa.CurrentCommand == p.shellBase { continue }` short-circuits before the ioctl, so an alternate-screen pane is never busy whatever its command; `TestTick_BusyGating_Table`'s 8 subtests assert both the verdict and whether the ioctl was reached, matching spike S7's measured table |
| INV-1 | both handlers unreachable for `kind !== "shell"` | pass | `pane.ts:65` `private readonly kind`, assigned once at `:89`; `:159` `if (kind === "shell") this.installShellInputHandlers(term);` is the sole call. `rg` over `web/src` finds `attachCustomKeyEventHandler`/`attachCustomWheelEventHandler` only inside that method; the only other `wheel` listener in the tree is `render/diagramdialog.ts` |
| INV-2 | no code path sets tmux `mouse` on; no mouse-enable sequence reaches the browser | pass (with a caveat) | `serverOptions` untouched; D7's grep is green; `tmux show-options -g mouse` asserted `off` after a shell spawn and again after a scroll + copy-mode auto-exit. The plan's second half — asserting `?1000h`/`?1002h`/`?1003h`/`?1006h` never reach the browser — is **not** asserted anywhere; see Note 2 for why I accept the option oracle in its place |

## Manual Verification

Drove the dashboard in Chromium through the E2E harness's own scratch-daemon fixture (temporary spec, run, then deleted — tree verified clean afterward).

- **Indicator lifecycle by hand**: launched a session, opened the shell surface, ran `sleep 4`, watched `span.shellact` go absent → `data-act="busy"` (spinning, `animation-name: shellact-spin`) → `data-act="done"`. Accessible name and computed colours captured at each state (W5/W11 rows above). Screenshot at `/tmp/review-gates/shellact-done.png`.
- **Wheel scrolling, measured rather than trusted**: filled a shell pane to `history_size = 178`, then sent 60 wheel events of `deltaY = -4` each (240 px of intent, ~12 lines' worth) with 25 ms between them. `#{pane_in_mode}` stayed **0** — nothing scrolled at all. A single `deltaY = -120` immediately gave `pane_in_mode = 1`, `scroll_position = 6`. This is Major 1; the cause is in `flushWheelScroll`.
- **`send-keys -X cancel` outside copy-mode**: probed against a real tmux on a private socket (`-S /tmp/review-cancel-probe`, killed afterward). It prints `not in a mode`, exits 1, and injects nothing into the pane — so the stale `inCopyMode` after an auto-exit costs one failed exec and never corrupts the pane (Note 1).
- **The developer's own shell**: `zsh -i` here reports `EDITOR=[]`, `VISUAL=[]`, `bindkey -A emacs main`, so REQ-5/REQ-6 hold in real use on this machine (Note 3).

Not verified by hand: tile-footer indicator sizing at 3×2 density (no automated width oracle; the E2E tile-footer assertions cover presence and `data-act`, not layout).

## Issues

### Critical

None.

### Major

1. **[web-impl]** A wheel gesture smaller than one line is discarded instead of accumulating, so a slow trackpad scroll over a shell surface never scrolls at all (REQ-7) — `web/src/terminal/pane.ts:193-200` (`flushWheelScroll`). `wheelDeltaToScrollLines` returns `0` for any accumulated `|deltaY| < 10` (`PIXELS_PER_LINE = 20`, `Math.round`), and `flushWheelScroll` zeroes `this.wheelAccumDeltaY` at `:196`, **before** the `if (lines === 0) return;` at `:197`, so each animation frame's sub-line remainder is thrown away rather than carried into the next. Measured, not inferred: 60 × `deltaY = -4` over a pane with `history_size = 178` left `#{pane_in_mode} = 0`; one `deltaY = -120` scrolled 6 lines. macOS trackpads emit exactly this shape of small per-event delta at low scroll speed, so the headline fix for #45 is dead for gentle scrolling. Fix: only reset the accumulator by what was consumed — return early on `lines === 0` while leaving `wheelAccumDeltaY` intact (and, when a frame is sent, subtract `lines * PIXELS_PER_LINE` rather than zeroing), so sub-line deltas accumulate until they reach a line. The E4/E5/E6 specs all use deltas ≥ 300, which is why nothing caught it.

2. **[web-tests]** A test comment states the shipped implementation still has the bug this plan fixed, and cites a section that does not exist — `web/src/terminal/shellactivity.test.ts:89-95`. It says the W8 case is "Expected to fail", and describes `observeIdle`'s guard as "`current.indicator !== "busy"` leaves a still-'none' entry's epoch untouched" — both were true before `680ea45` and are false of the code that shipped (the test passes; the guard now bumps the epoch at `shellactivity.ts:142-148`). It also points at "web-tests.md's Implementation Bugs table", which is not a section of that file (it has `## Fix History`). Rewrite the comment to describe the invariant the test pins, in the present tense.

3. **[orchestrator]** The plan's `## Doc Delta` describes the busy derivation with two of its three gates, and `doc-reconcile` promotes that line verbatim into `docs/features/surfaces/spec.md`. It reads "a shell reports a busy flag derived from tmux's foreground command and alternate-screen flag" — the shipped derivation adds **the pane tty's line discipline**, and that third gate is the load-bearing one: it is what separates a REPL or a trust prompt (raw) from silent work like `sleep` (canonical), it is why `internal/tty` exists at all, and it is the whole subject of `kb:adr/surfaces-shell-busy-from-tmux-process-state`. `docs/protocol.md` (already merged) states all three correctly; the feature spec would end up contradicting it. Amend the Doc Delta line before reconciliation.

4. **[orchestrator]** `kb:diagram/web-components` is stale for code this plan shipped — `docs/diagrams/web-components.md:51` labels the `terminal/` node `"5 modules"`; `web/src/terminal/` now holds 7 (`drop`, `notice`, `overlay`, `pane`, `shellactivity`, `shellkeys`, `surfaceswitch`). `kb for web/src/terminal/pane.ts` names this record, so CLAUDE.md's doc upkeep requires it in the same commit as the code. The sibling `kb:diagram/daemon-components` **was** updated correctly (new `internal/tty` component plus its `Rel`), so this is the one that slipped.

5. **[web-impl]** Stale comments in `web/src/terminal/surfaceswitch.ts` assert a UI element this plan deleted. Line 37: `States: "before the first switch: claude selected, shell unselected, no pip"`. Lines 82-84 (on `shellEnded`): "the swap-back and the pip clearing are one atomic state change" and "only the pip clears". Nothing named pip exists any more, and `shellRunning` — which is what `shellEnded` actually clears — no longer drives any indicator at all (the indicator comes from `shellactivity.ts`'s reducer via `activityFor`, and `handleShellEnded` clears it separately through `shellGone`). A reader following these comments would look for an indicator `shellEnded` no longer touches. Reword to describe `shellRunning`'s real job (attachability and background mounting).

6. **[web-tests]** Same staleness in the test file's own prose — `web/src/terminal/surfaceswitch.test.ts:119` (`describe("… reverts to claude and clears the pip atomically")`) and `:126` (`"still clears shellRunning (the pip) even when claude was already the visible surface … pip stays lit until the next click otherwise"`). The assertions are correct and specific; only the naming is false about what shipped.

### Minor

None.

### Notes

1. **[note]** `ScrollCopyMode` returns `entered = true` for any successful scroll, including a `scroll-down` that reaches the bottom and makes `copy-mode -e` exit by itself. `pumpShellSocketToPTY` therefore still believes the pane is in a mode and fires one `CancelCopyMode` on the next keystroke. Probed against real tmux: that call prints `not in a mode`, exits 1, injects nothing, and the handler logs it at Debug and writes the input anyway — then clears the flag, so it is exactly one wasted exec, once. Not worth a fix wave; recorded so nobody reads the Debug line as a symptom.

2. **[note]** INV-2's second clause — "assert no mouse-enable sequence (`?1000h`, `?1002h`, `?1003h`, `?1006h`) ever reaches the browser" — has no assertion anywhere, and `test-specs.md`'s coverage table records INV-2 as covered without saying so. I accept the substitute rather than asking for the test: `show-options -g mouse` is causally upstream (tmux with `mouse off` emits none of those sequences, and nothing else in the pipeline injects them), it is asserted at two points, and the existing `WsByteRecorder` only records client→server binary frames — a server→client recorder would be new infrastructure for a strictly weaker oracle. No change requested.

3. **[note]** REQ-5/REQ-6 depend on the user's zsh being in the emacs keymap. The E2E harness now pins `EDITOR=""`/`VISUAL=""` (`web/e2e/helpers/daemon.ts` `buildEnv`), which is the right layer — the alternative would be injecting env into the user's own `$SHELL -i`, which `kb:adr/surfaces-shell-pane-carries-no-session-env` forbids — but it does mean a user whose `EDITOR=vi` gets zsh's `viins` keymap, where `ESC b`/`ESC f` are not the word-motion bindings. Not actionable here (this developer's shell is emacs-mode, verified), and Muster cannot fix it without breaching that ADR.

4. **[note]** W4 ("at most one `scroll` frame per animation frame") is only half-tested: `shellkeys.test.ts` pins the pure `deltaY → lines` conversion, while the `requestAnimationFrame` coalescing lives in `pane.ts` and is verified by reading only (conventions put DOM interaction in Playwright, and no spec asserts frame counts). The guard is six lines and obviously correct; asserting it would need a client→server *text*-frame recorder that does not exist. No change requested.

5. **[note]** Epoch collision after `shellGone`: `shellGone` deletes the entry, so a later `observeBusy` restarts at epoch 1 and a timer scheduled against the *previous* epoch 1 can match. The effect is only ever that a spinner or a self-clear lands earlier than its own delay, never a wrong indicator. Not worth a monotonic counter.

6. **[note]** A shell that exits while busy **with no shell surface mounted** (the user is on `claude` or `docs`) gets no `4001`, so `shellGone` never runs; the poller's `busy:false` reaches `observeIdle` and raises a persisting tick for a shell that is gone. The daemon genuinely cannot distinguish "finished" from "killed" on that wire (the same ambiguity `kb:adr/surfaces-snapshot-restored-tick-always-self-clears` records), the tick clears the moment `shell` is selected, and E7 as written keeps the surface mounted. Recorded, not requested.

7. **[note]** `docs/design/mockups/markdown-viewing/a2-nav-tiles.html` and `reader-anatomy.html` still render `.pip` on `--shell-pip`. They are that plan's dated design artifacts, not the design system's reference renders (`a-instrument.html` and `d-tiled.html` contain no pip), and E14's grep scope deliberately excludes `docs/`. Flagged only so nobody copies a retired element out of them.

8. **[note]** I judge the mid-run deviation the right call, and the code matches the ADR. REQ-4 ("the tick… stays") and edge case 4/E8 ("clears to nothing, not to a tick") are genuinely unsatisfiable together once the wire cannot separate them — `shellactivity.go:190-193`'s `reconcile` comment says so in the daemon's own words, and the 20 s stuck-tick measurement in `web-implementation.md` is the proof. Splitting by *source* rather than by surface selection resolves the contradiction at the only place that knows the difference (the client, which knows whether the transition came from a live message or a snapshot gap), costs REQ-4's guarantee only on a reconnect path where no user can tell, and is bounded by a 3 s timer rather than left open. The inline **Amended** note on REQ-4 in `plan.md` plus the `proposed` ADR is the right paper trail. `restoreIdle`'s own `"none"` branch is currently unreachable from its single call site (which pre-filters to `"busy"`), and fixing it anyway was correct — it makes the function's contract independent of that filter.

9. **[note]** The W8 fix is complete and its sibling is right. `observeBusy` from `"none"` records a pending entry at epoch *n*; `observeIdle`/`restoreIdle` now bump to *n+1* while holding the indicator at `"none"`, so the `resolveOnset` scheduled against *n* no-ops — and both keep a true reference-identity no-op when no entry exists at all (`!state.has(id)`), which is what lets `restoreIdle`'s own identity test still assert `toBe`. The reconciliation in `70b59c2` is honest: it split the old `toBe` test into a genuine-identity case and an observable-contract case (`getShellActivity` stays `"none"`, `timer` stays `null`, `state` is `not.toBe`), rather than deleting the assertion.

10. **[note]** The `EDITOR`/`VISUAL` harness fix has whole-suite blast radius and I re-proved it rather than trusting the log: `make e2e` ran 394/394 green on this tree, and every scratch daemon in the suite goes through `buildEnv()`. `buildEnv()` becoming non-optional is safe because it still spreads `process.env` first, so the previous `undefined` (inherit) and the new explicit object differ only in the two pinned keys.

11. **[note]** Repairs row 5's oracle change (`"fooQ bar"` → `"foo Qbar"`) is a correction, not a weakening: zsh's ZLE `forward-word` lands at the start of the next word where GNU readline lands at the end of the current one, so the assertion still requires the cursor to reach a specific correct boundary and a typed character to appear there. The validate agent re-measured it against a real pane outside the harness. Repairs row 4's removed assertion is likewise sound — `web/src/main.ts:75-78`'s render dispatch is an unconditional `if/else`, so the Focus mainhead's DOM cannot update while Tiles is active, and the same busy→done transition stays asserted through the tile footer, which *is* live in that view. The mainhead's `busy` state is still asserted before the switch. No repair deleted, skipped or weakened an assertion; no fixture payload drifted.
