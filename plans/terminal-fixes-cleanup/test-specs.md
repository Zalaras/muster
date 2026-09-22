# E2E Test Specs: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Mode**: fix (review cycle 2)
**Pack**: `go run ./tools/kb pack --plan terminal-fixes-cleanup --role e2e-specs` — 11079 words (over the
8000 budget; WARN, not an error), sections rules 841 / features 2088 / decisions 5050 / facts 251 /
lessons 2841 / runbooks 2 — features `surfaces`, `theme`.
**Verdict**: pass
**Tests created**: 24 (23 from validate attempt 2, plus 1 new in `shell-scroll.spec.ts` for review
cycle 1 Major 1), plus edits retiring 6 obsolete pip assertions and deleting 1 obsolete test in
`plain-shell.spec.ts`/`reader.spec.ts`; review cycle 2 repaired E13's locator/read in place (no new
test)
**Live run**: `shell-scroll.spec.ts` 7/7 passing (review cycle 2 fix run, foreground, below); full
suite 395/395 passing (`make e2e`, foreground, from `plan/terminal-fixes-cleanup` post `make web-build
build`); `shell-scroll.spec.ts` soaked 70/70, 0 retries (`make e2e-soak SPEC=e2e/shell-scroll.spec.ts
N=10`, review cycle 2)

## Tests

| File | Test Name | Requirement | What It Verifies |
|------|-----------|-------------|------------------|
| web/e2e/shell-keys.spec.ts | Option+Left twice, then a typed character, lands at the previous word boundary in a shell surface, verified against tmux capture-pane (E1, REQ-5) | REQ-5, E1 | shell key handler translates Option+Left to `ESC b` |
| web/e2e/shell-keys.spec.ts | Option+Right, after Option+Left twice, lands a typed character at the next word boundary in a shell surface (REQ-5) | REQ-5 | Option+Right → `ESC f` |
| web/e2e/shell-keys.spec.ts | Cmd+Left, then a typed character, lands at the start of the line in a shell surface (E2, REQ-6) | REQ-6, E2 | Cmd+Left → `0x01` |
| web/e2e/shell-keys.spec.ts | Cmd+Right, after Cmd+Left, lands a typed character at the end of the line in a shell surface (REQ-6) | REQ-6 | Cmd+Right → `0x05` |
| web/e2e/shell-keys.spec.ts | Option+Left and Cmd+Left over a Claude surface are sent as xterm's own raw, untranslated bytes — both before any shell exists and after switching back from a shell on the same session (E3, INV-1) | E3, INV-1 | Claude surface never installs the key handler, from two source states — **regression pin, ran green** |
| web/e2e/shell-scroll.spec.ts | the tmux server's mouse option stays off once a shell is spawned (D7, INV-2) | D7, INV-2 | `internal/tmux` never turns mouse on — **regression pin, ran green** |
| web/e2e/shell-scroll.spec.ts | dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8) | E13, REQ-8 | drag-to-select survives the new wheel/copy-mode wiring — **regression pin, ran green** |
| web/e2e/shell-scroll.spec.ts | a wheel-up over a shell surface with real history enters copy-mode, and wheeling back down leaves it by itself with the mouse option still off (E4, E5, REQ-7, INV-2) | E4, E5, REQ-7, INV-2 | `scroll` frame → copy-mode enter/auto-exit, `#{scroll_position}`, mouse stays off |
| web/e2e/shell-scroll.spec.ts | a slow trackpad-shaped wheel gesture — many sub-line deltas, one flush per event — still scrolls the pane (REQ-7, review cycle 1 Major 1) | REQ-7 | `flushWheelScroll`'s sub-line accumulator carries a remainder across animation frames instead of discarding it — the reviewer's exact measured trackpad shape (60 × `deltaY = -4`, one flush per event) |
| web/e2e/shell-scroll.spec.ts | a wheel-up over a shell surface never inserts a character into the shell's command line — the #45 symptom itself (E6) | E6 | no cursor-key fallback reaches the live prompt |
| web/e2e/shell-scroll.spec.ts | wheeling up hard on a shell with almost no history clamps without error and is not left in copy-mode after scrolling back down (E9, REQ-12, edge case 10) | E9, REQ-12 | clamp behaviour on a near-empty pane |
| web/e2e/shell-scroll.spec.ts | typing while a shell is scrolled back cancels copy-mode, returns to the live bottom, and still delivers the keystroke (E10, REQ-10) | E10, REQ-10 | `send-keys -X cancel` before writing input |
| web/e2e/shell-activity.spec.ts | a shell running a silent foreground command shows a spinner in both the mainhead and the tile footer, then a tick once it finishes (REQ-2, REQ-3, REQ-14) | REQ-2, REQ-3, REQ-14 | busy→done round trip, both hosts, silent command |
| web/e2e/shell-activity.spec.ts | the spinner stays visible on the shell segment while the user is on the Claude surface, becomes a tick when the work finishes, and clicking shell clears the tick immediately (User Flows 1-4, REQ-2, REQ-3, REQ-4) | REQ-2, REQ-3, REQ-4 | indicator survives a surface switch; click-clears |
| web/e2e/shell-activity.spec.ts | a tick clears itself about 3s later when the shell surface was already selected when the work finished (REQ-4, User Flow 5) | REQ-4 | self-clear timer |
| web/e2e/shell-activity.spec.ts | a shell that exits while busy leaves no spinner and no tick behind (E7, edge case 1) | E7 | poller drops a dead session from the busy set |
| web/e2e/shell-activity.spec.ts | a daemon restart mid-command clears the shell activity indicator to nothing rather than to a tick (E8, edge case 4) | E8 | reconcile-killed shell never leaves a stray tick |
| web/e2e/shell-activity.spec.ts | with two sessions' shells busy at once, exactly those two segments show spinners and a third idle shell shows none (E11, INV-4) | E11, INV-4 | no cross-talk between sessions' indicators |
| web/e2e/shell-activity.spec.ts | a shell surface superseded by a second window while busy still tracks the spinner through /ws (E12) | E12 | indicator driven by `/ws`, independent of the shell PTY socket |
| web/e2e/shell-activity.spec.ts | createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline) | INV-3 | accessible name stays exactly "shell"; indicator absent when idle |
| web/e2e/plain-shell.spec.ts | (5 assertions retired: pip presence/absence → `shellActivityIndicator` absence or a duplicated tmux-session-existence check) | REQ-1 | idle shell shows no indicator (REQ-1's "indistinguishable" claim) |
| web/e2e/reader.spec.ts | (1 assertion retired: pip absence → `shellActivityIndicator` absence, same locator swap) | REQ-1 | same |

## Fixture Changes

No new fixture/payload builders were needed. Shell activity and copy-mode scrolling are entirely
tmux-derived (not Claude-Code-format), so every test in this plan drives a **real** shell and a real
tmux pane through the existing `daemon`/`launchSession`/`createShellViaApi` machinery — nothing here is
synthesized over HTTP. New oracle/locator helpers were added in a **new** file,
`web/e2e/helpers/shellinput.ts` (not `helpers/shell.ts` — the plan's Affected Files assigns that file's
pip-locator removal to web-impl, not e2e-specs):

- `shellActivityIndicator(segmentButton)` — `span.shellact` locator (Testable UI Elements).
- `tmuxCapturePane(daemon, target)` / `lastNonBlankLine(capture)` — the E1/E2/E6 oracle.
- `tmuxMouseOption(daemon)` — `tmux show-options -g mouse` (D7/INV-2 oracle).
- `WsByteRecorder` + `OPTION_LEFT_RAW`/`OPTION_RIGHT_RAW`/`ESC_B`/`ESC_F`/`CTRL_A`/`CTRL_E` — records raw
  binary client→server frames on a named socket, for the byte-level INV-1 oracle. The raw-CSI byte
  values are taken directly from the plan's own spike measurement (S7: "xterm.js emits ESC[1;3D for
  Option+Left ... Cmd+Arrow emits nothing at all today"), not invented.

## Coverage

| Requirement | E2E Tests |
|-------------|-----------|
| REQ-1 | plain-shell.spec.ts / reader.spec.ts retired assertions; shell-activity.spec.ts's "createShellViaApi leaves a shell idle..." |
| REQ-2, REQ-3 | shell-activity.spec.ts's basic and away-surface tests |
| REQ-4 | shell-activity.spec.ts's away-surface (click-clears) and self-clear tests |
| REQ-5 | shell-keys.spec.ts Option+Left/Option+Right tests |
| REQ-6 | shell-keys.spec.ts Cmd+Left/Cmd+Right tests |
| REQ-7 | shell-scroll.spec.ts E4/E5 test |
| REQ-8 | shell-scroll.spec.ts E13 test |
| REQ-9 | shell-keys.spec.ts E3 test (Claude untouched) |
| REQ-10 | shell-scroll.spec.ts E10 test |
| REQ-12 | shell-scroll.spec.ts E9 test |
| REQ-13 | not directly E2E'd — edge cases 18-20 (REPL/vim/trust-prompt) are daemon-unit (D5/D8) and Reviewer-Verified territory; a real interactive REPL/vim in this harness risked environment fragility for coverage the daemon acceptance criteria already pin. Flagged in Notes. |
| REQ-14 | shell-activity.spec.ts's basic test uses `sleep 2` (silent, zero-output) throughout |
| INV-1 | shell-keys.spec.ts E3 test, two source states |
| INV-2 | shell-scroll.spec.ts D7 test and the E4/E5 test's trailing mouse-option check |
| INV-3 | shell-activity.spec.ts's idle-baseline test (accessible name) |
| INV-4 | shell-activity.spec.ts E11 test |
| E1-E13 | one test each as tabulated above |
| E14, E15 | **not** Playwright tests — the plan's own Automated Checks block runs these as negative greps (`rg` over `web/src`, `web/scripts`, `web/e2e`), which this authoring pass satisfies by retiring every `shellPip`/`expectPipUsesShellPipToken` reference from the two files that had them |

## Regression pins vs. new-behaviour tests

Authoring mode: the implementation doesn't exist yet, so every test asserting genuinely *new* behaviour
(the readline key translation, the `scroll` control frame and copy-mode wiring, the whole activity
indicator) is collection-only — I did not run them, and several would currently fail (e.g. E1/E2's
capture-pane oracle would see literal `3D` garbage from today's unfixed xterm fallback, not the intended
word-jump). Three tests assert behaviour this plan does **not** change, so they were run live against
`make web-build build` and are green today:

1. **shell-keys.spec.ts E3/INV-1** — pane.ts currently has no custom key handler at all (grepped: no
   `attachCustomKeyEventHandler`), so Option+Left already produces xterm's raw CSI bytes on the Claude
   socket and Cmd+Left already produces nothing — true before this plan and required to stay true after.
2. **shell-scroll.spec.ts D7/INV-2** — tmux mouse has always been off in Muster; this plan doesn't touch
   `serverOptions`.
3. **shell-scroll.spec.ts E13/REQ-8** — drag-to-select is existing xterm.js behaviour REQ-8 requires
   this plan to leave alone.

All three passed on the first structurally-complete attempt except E13, whose original oracle
(`window.getSelection()`) was wrong — see Repairs-equivalent note below (authoring mode has no formal
Repairs table, but the fix is worth recording for validate mode).

**E13 self-repair (authoring, before finalizing):** the first draft polled
`page.evaluate(() => window.getSelection()?.toString().length)`, which timed out at 0 every time.
Investigation (`grep -o ".getSelection()" node_modules/@xterm/xterm/lib/xterm.js`) showed xterm.js's DOM
renderer never populates the native browser selection — its own `SelectionService` tracks selection
internally and its only `document.getSelection()` call is inside the (unrelated) AccessibilityManager.
The real, visible drag-select is rendered as `div` children appended under a `.xterm-selection` overlay
element (`b="xterm-selection"` in the minified bundle). Fixed to poll
`shellRegion.locator(".xterm-selection").evaluate(el => el.childElementCount) > 0` instead; reran and it
passed in <1s. This is a defect in my own draft locator, not a product issue — noted here so validate
mode isn't surprised by the oracle if the underlying DOM structure ever needs re-checking.

## Notes

- **Ownership boundary**: `web/e2e/helpers/shell.ts`'s pip-locator/token-assertion removal is web-impl's
  per the plan's own Affected Files line ("web-impl owns this file, not e2e-specs"). I did not touch that
  file; the 9 assertions the plan flags as "the test agents' to retire" were retired at their **call
  sites** in `plain-shell.spec.ts` (5) and `reader.spec.ts` (1) by swapping the import to the new
  `shellActivityIndicator` locator in `helpers/shellinput.ts`. Three of those call sites changed from
  asserting pip *presence* (`toHaveCount(1)`, proving "shell is running") to asserting indicator
  *absence* (`toHaveCount(0)`) — not a weakening: REQ-1 makes "no indicator" the correct assertion for an
  idle-but-running shell, and where the original test's real purpose was "still running" (the Tiles
  round-trip test, E4/REQ-6), I preserved that with the tmux-session-existence check the test already had
  earlier in its own body rather than the now-meaningless pip check. One whole test
  ("a running shell's pip resolves to the --shell-pip token, not --teal") was deleted outright — it pins
  exactly the token this plan's REQ-1 removes, per `kb:adr/theme-shell-pip-retired-for-activity-indicator`
  superseding `kb:adr/theme-shell-pip-own-token`. `reader.spec.ts`'s one-line swap was verified by
  collection only, not a live run — it's a like-for-like locator substitution inside a large,
  reader-feature test I judged out of scope to run end-to-end for a one-line change; validate mode's full
  suite run will exercise it for real.
- **REQ-13 (never-busy for a program waiting on input)**: edge cases 18-20 name a REPL, `vim`, and Claude
  Code's trust prompt. I judged a real `python3`/`vim` process in this harness a fragility risk (PATH,
  `$EDITOR`, terminal-size assumptions) for coverage the daemon's own D5/D8 acceptance criteria and the
  plan's Reviewer-Verified line already pin at the unit level. If validate mode's daemon-tests turn out
  not to cover this, it should come back to E2E then, not now.
- **E14/E15 are not Playwright tests.** They're the plan's own Automated Checks (negative `rg` greps over
  `web/src`, `web/scripts`, `web/e2e`) — my job for them was making sure no spec file I own still contains
  `shellPip`/`pipEl`, which the edits above accomplish; the token itself (`--shell-pip` in
  `web/src/style.css` and `web/scripts/contrast-pairs.json`) is web-impl's to remove.
- **W1-W11** are Web (Vitest) acceptance criteria per the plan's own section split, not E2E — not
  duplicated here.
- `go run ./tools/kb pack` reported the pack over its 8000-word budget (WARN, not a hard failure) —
  flagging per the pack's own convention; no action taken since it's advisory.

## Git

Branch `plan/terminal-fixes-cleanup`. Files to commit: `web/e2e/shell-keys.spec.ts`,
`web/e2e/shell-scroll.spec.ts`, `web/e2e/shell-activity.spec.ts`, `web/e2e/helpers/shellinput.ts`,
`web/e2e/plain-shell.spec.ts`, `web/e2e/reader.spec.ts`, `plans/terminal-fixes-cleanup/test-specs.md`.

## Validate Attempt 2

**Context.** A previous validate agent (attempt 1) did the actual repair work and crashed before
running the suite to completion or writing a verdict. Its five repairs survived uncommitted and were
committed by the orchestrator as 1f5a200 (`chore(terminal-fixes-cleanup): commit e2e-specs's
uncommitted work`). My job this attempt was to verify those repairs are correct — re-measuring the two
that change what an assertion expects — and run the gates that attempt 1 never reached.

**What I did:**

1. `make web-build build` from the project root (clean tree at 1f5a200) — built without error.
2. `npm run e2e -- e2e/shell-keys.spec.ts e2e/shell-scroll.spec.ts e2e/shell-activity.spec.ts` from
   `web/`, in the foreground: `e2e-lint: clean`, then **19 passed (20.5s)**, no retries, first attempt.
3. Independently re-measured both oracle-changing repairs before trusting them, rather than taking
   attempt 1's log on faith:
   - **`EDITOR=vi` injection.** `node -e "console.log(JSON.stringify(process.env.EDITOR))"` → `undefined`
     in my own shell (no `EDITOR` set); `npx -y node -e "..."` → `"vi"`; `env -u EDITOR -u VISUAL npx -y
     node -e "..."` → still `"vi"` — confirms `npx` injects `EDITOR=vi` into the child unconditionally,
     independent of the invoking shell's own environment, exactly as attempt 1's comment in
     `helpers/daemon.ts:713-728` claims.
   - **zsh forward-word landing.** Spawned a throwaway tmux session directly (`tmux -S
     /tmp/zsh-test-socket new-session -d -x 80 -y 24 "env EDITOR= VISUAL= zsh -i"`, outside the E2E
     harness, own socket, killed after). `bindkey -lL main` read back `bindkey -A emacs main` (confirms
     the empty-`EDITOR` fix does land emacs keymap, not just in the harness). Then sent literal keys:
     `foo bar`, `ESC b` ×2, `ESC f`, then typed `Q` — `tmux capture-pane -p` read back `foo Qbar`, never
     `fooQ bar`. This matches the repaired oracle in `shell-keys.spec.ts`'s Option+Right test exactly:
     zsh's ZLE `forward-word` lands at the START of the next word, not the end of the current one.
     Session killed and scratch socket file removed afterward.
4. Full suite: `make e2e` from the project root, foreground, from the same clean tree after the same
   `make web-build build` — **394 passed (2.5m), exit code 0**. This covers all 35 spec files, including
   the three this plan owns and every other file that exercises `helpers/daemon.ts` (the `buildEnv()`
   change's blast radius, since it's shared by every scratch daemon spawn in the suite).
5. Re-ran `npx playwright test --list` after all edits (none were made by me this attempt — see below):
   collection stays clean, matching the 394-test full-suite count.

**I made no new spec edits this attempt.** Attempt 1's five repairs, verified above, were already
correct and already committed; there was nothing left for me to fix. All work below is attribution and
write-up.

### Repairs

One row per spec/helper edit made across both validate attempts. All five originate from attempt 1 (the
crashed run); I am recording them here because attempt 1 never reached a verdict or a Repairs table, and
because two of them (rows 4 and 5) are oracle changes the pipeline's rules say must be independently
re-measured before being trusted, which I did in step 3 above.

| # | Test / File | Symptom | Root cause in the spec/helper | Fix | Assertion still covers |
|---|------|---------|-----------------------|-----|------------------------|
| 1 | `web/e2e/helpers/daemon.ts` (`buildEnv()`, shared by every spec) | Every shell surface's zsh came up in `viins` keymap instead of the spike-measured emacs default; Option/Cmd word- and line-jump tests looked broken even though the product was correct | `npx playwright test` (the suite's own invocation) inherits no `EDITOR`, and `npx` unconditionally injects `EDITOR=vi` into every child it spawns — every scratch daemon, and therefore every shell pane's zsh, inherited that injected value | `buildEnv()` now always returns `{ ...process.env, EDITOR: "", VISUAL: "", ... }`, so it can no longer be `undefined` and no scratch daemon can inherit an ambient `EDITOR`/`VISUAL` | Every existing spec that called `buildEnv()` (the whole suite, since it underlies every daemon spawn) keeps whatever it asserted before — this only removes a previously-uncontrolled variable. Proven by the 394/394 full-suite run in step 4: nothing that depended on `buildEnv()` returning `undefined` broke |
| 2 | `web/e2e/plain-shell.spec.ts` (E14 comment, no code change) | The retirement comment for the pip-token pin named the literal token string `--shell-pip`, which `web/scripts/e2e-lint.sh`'s / the plan's E14 grep check treats as a live reference | Comment said "resolves to the `--shell-pip` token" instead of describing the token generically | Reworded to "resolves to its dedicated colour token" — no literal `--shell-pip` string remains in `web/src`, `web/scripts`, or `web/e2e` | REQ-1 (E14): `! rg -n -e "--shell-pip" web/src web/scripts web/e2e` finds nothing — re-ran this myself, no matches |
| 3 | `web/e2e/shell.spec.ts` (`GET /api/state` M0 snapshot pin) | The M0 snapshot-equality pin didn't know about the plan's new top-level `shellsBusy` key, so it failed once the daemon started sending it | This plan's Protocol Contract adds `shellsBusy` to the top-level state snapshot so a reconnecting dashboard re-syncs without waiting for a transition | Added `shellsBusy: []` to the expected object, in the same style as the pre-existing `density`/`usageModel`/`railSort`/`theme` fields this test already updates per protocol addition | Still asserts full snapshot equality (`expect(body).toEqual({...})`) — REQ's Protocol Contract addition is now what the pin proves, not a hole in it |
| 4 | `web/e2e/shell-activity.spec.ts` (basic busy→done test) | `await expect(mainheadIndicator).toHaveAttribute("data-act", "done", ...)` timed out after the test switches to Tiles view (`Meta+Backslash`) | `main.ts`'s render dispatch (`web/src/main.ts:76-77`) runs exactly one of `focus.renderView`/`tiles.renderView` per tick — once Tiles is active, the mainhead's DOM (only ever written by `focus.renderView`) is frozen, so it structurally cannot show a later "done" transition. Confirmed by reading `main.ts` directly: the dispatch is an `if/else`, unconditional, with no plan-owned change nearby | Removed the post-switch mainhead "done" assertion; the mainhead is still asserted at "busy" *before* the switch (line 51), and the tile footer indicator remains the oracle for "done" after the switch (line 58) | REQ-2/REQ-3/REQ-14's busy→done transition is still asserted end-to-end via the tile footer, which is live in the view the test is actually in; the mainhead's "busy" state is still proven in the view where it's live. Nothing about the transition itself stopped being checked — only an assertion against a frozen, non-live element was removed |
| 5 | `web/e2e/shell-keys.spec.ts` (Option+Right test) | `await expect.poll(... includes("fooQ bar"))` timed out — the typed `Q` never landed there | The original oracle assumed bash/GNU-readline's `forward-word`, which lands at the end of the current word. zsh's ZLE `forward-word` (bound to `ESC f`) lands at the **start** of the next word instead, skipping the separating space | Oracle changed to poll for `"foo Qbar"` instead of `"fooQ bar"` | Still proves REQ-5's Option+Right → word-jump translation lands the cursor at a word boundary and a typed character shows up there — only the specific boundary zsh's own word-motion semantics land on changed, which I independently re-measured in step 3 above against a real pane outside the harness, not just re-read the comment |

`No assertion was deleted, skipped, or weakened.` Row 4 removes one assertion, but it removed it
because the element it targeted cannot, by the product's own existing (non-plan) rendering
architecture, ever show the value being polled for once the view switches — proven by reading
`web/src/main.ts`'s dispatch directly, not inferred — and the same busy→done transition stays fully
covered through the tile footer, which is live in that view. Row 5 changes an oracle's expected string,
not its strength: it still requires the cursor to land at a specific, correct word boundary and a typed
character to appear there; I re-measured the zsh behavior independently (outside the E2E harness, in a
throwaway tmux session) before accepting it, per this run's own rule that an oracle-changing repair
needs independent verification, not just a re-read of the prior agent's comment.

### Full Suite Run

```
$ make web-build build && npm run e2e -- e2e/shell-keys.spec.ts e2e/shell-scroll.spec.ts e2e/shell-activity.spec.ts
e2e-lint: clean
Running 19 tests using 4 workers
  ... (19 individual ✓ lines omitted for brevity, see Test Run Output below)
  19 passed (20.5s)

$ make e2e
394 passed (2.5m)
[exited with code 0]
```

### Test Run Output

```
> muster-web@0.0.0 e2e
> sh scripts/e2e-lint.sh && playwright test e2e/shell-keys.spec.ts e2e/shell-scroll.spec.ts e2e/shell-activity.spec.ts

e2e-lint: clean

Running 19 tests using 4 workers

  ✓ e2e/shell-activity.spec.ts › a shell that exits while busy leaves no spinner and no tick behind (E7, edge case 1) (6.1s)
  ✓ e2e/shell-activity.spec.ts › a shell running a silent foreground command shows a spinner in both the mainhead and the tile footer, then a tick once it finishes (REQ-2, REQ-3, REQ-14) (7.8s)
  ✓ e2e/shell-activity.spec.ts › the spinner stays visible on the shell segment while the user is on the Claude surface, becomes a tick when the work finishes, and clicking shell clears the tick immediately (User Flows 1-4, REQ-2, REQ-3, REQ-4) (7.9s)
  ✓ e2e/shell-activity.spec.ts › a tick clears itself about 3s later when the shell surface was already selected when the work finished (REQ-4, User Flow 5) (10.6s)
  ✓ e2e/shell-activity.spec.ts › createShellViaApi leaves a shell idle with no activity indicator until a command is actually run (INV-3 baseline) (604ms)
  ✓ e2e/shell-activity.spec.ts › with two sessions' shells busy at once, exactly those two segments show spinners and a third idle shell shows none (E11, INV-4) (4.1s)
  ✓ e2e/shell-activity.spec.ts › a daemon restart mid-command clears the shell activity indicator to nothing rather than to a tick (E8, edge case 4) (6.9s)
  ✓ e2e/shell-keys.spec.ts › Option+Left twice, then a typed character, lands at the previous word boundary in a shell surface, verified against tmux capture-pane (E1, REQ-5) (2.7s)
  ✓ e2e/shell-keys.spec.ts › Option+Right, after Option+Left twice, lands a typed character at the next word boundary in a shell surface (REQ-5) (2.7s)
  ✓ e2e/shell-activity.spec.ts › a shell surface superseded by a second window while busy still tracks the spinner through /ws (E12) (7.3s)
  ✓ e2e/shell-keys.spec.ts › Cmd+Left, then a typed character, lands at the start of the line in a shell surface (E2, REQ-6) (2.6s)
  ✓ e2e/shell-scroll.spec.ts › the tmux server's mouse option stays off once a shell is spawned (D7, INV-2) (778ms)
  ✓ e2e/shell-keys.spec.ts › Option+Left and Cmd+Left over a Claude surface are sent as xterm's own raw, untranslated bytes — both before any shell exists and after switching back from a shell on the same session (E3, INV-1) (1.4s)
  ✓ e2e/shell-keys.spec.ts › Cmd+Right, after Cmd+Left, lands a typed character at the end of the line in a shell surface (REQ-6) (2.6s)
  ✓ e2e/shell-scroll.spec.ts › dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8) (1.2s)
  ✓ e2e/shell-scroll.spec.ts › wheeling up hard on a shell with almost no history clamps without error and is not left in copy-mode after scrolling back down (E9, REQ-12, edge case 10) (1.0s)
  ✓ e2e/shell-scroll.spec.ts › a wheel-up over a shell surface never inserts a character into the shell's command line — the #45 symptom itself (E6) (3.0s)
  ✓ e2e/shell-scroll.spec.ts › a wheel-up over a shell surface with real history enters copy-mode, and wheeling back down leaves it by itself with the mouse option still off (E4, E5, REQ-7, INV-2) (3.1s)
  ✓ e2e/shell-scroll.spec.ts › typing while a shell is scrolled back cancels copy-mode, returns to the live bottom, and still delivers the keystroke (E10, REQ-10) (2.6s)

  19 passed (20.5s)
```

Full-suite run (`make e2e`, project root, foreground, clean tree at 1f5a200 post `make web-build
build`): **394 passed, 0 failed, exit code 0** — independently reproduced by the orchestrator from the
same commit with the same result.

### Notes

- No soak was run against these three files this attempt. They are new files with no prior flake
  history and passed cleanly first-try in both the targeted run (19/19) and inside the full 394-test
  sweep; nothing in this attempt's changes (attribution/write-up only, no spec edits) creates new soak
  obligations beyond what attempt 1's repairs already discharged by passing the full suite once clean.
  If the reviewer wants a soak on `shell-activity.spec.ts` specifically (it has the longest per-test
  wall time, up to 10.6s, and the most timing-sensitive assertions — the 3s self-clear timer, the
  restart-mid-command race), that's a reasonable ask for the next cycle; I did not judge it necessary
  to reach `pass` given the clean full-suite run.
- REQ-13 remains not directly E2E'd, per the authoring-mode Notes above — unchanged this attempt.
- Committing `plans/terminal-fixes-cleanup/orchestration-state.json` is explicitly out of scope for
  this agent per this attempt's instructions; it is left as the pre-existing working-tree modification
  it was found in.

## Fix Attempt 1 (review cycle 1, wave 3)

**Task.** Review cycle 1's Major 1 (`[web-impl]`, fixed in `6cfc53d`) was a real product defect that
394 green E2E tests missed: a wheel gesture smaller than one line was discarded instead of
accumulating, so a slow trackpad scroll over a shell surface never scrolled at all. The reviewer's own
diagnosis named the coverage gap: "The E4/E5/E6 specs all use deltas ≥ 300, which is why nothing caught
it." No `[e2e-specs]` issue was tagged in `review.cycle1.md` — this was a concrete coverage task from
the orchestrator, not a repair of a tagged issue. `web-tests.md`'s Fix History (Fix Attempt 2 section)
independently flagged the same gap and pinned the accumulator's *pure* step at the `shellkeys.ts` seam
(`PIXELS_PER_LINE`, `wheelDeltaToScrollLines`), but noted the accumulator field itself
(`wheelAccumDeltaY`) is private to `TerminalSurface` and DOM-bound — "not reachable without a DOM
harness" — which is exactly what this wave adds.

**What I read first:** `web/src/terminal/pane.ts` (`flushWheelScroll`, current post-fix shape) and
`web/src/terminal/shellkeys.ts` (`PIXELS_PER_LINE`, `wheelDeltaToScrollLines`) to confirm the exact
arithmetic, `review.cycle1.md`'s Major 1 for the reviewer's measured numbers (60 × `deltaY = -4` over
`history_size = 178`, one large `deltaY = -120` as the contrasting exact-multiple case), and both
implementation logs' `## Fix Attempt` sections named in my task (`web-implementation.md` Fix Attempt 2,
`web-tests.md` Fix History's "Review cycle 1 fix wave" entry) — neither added any other new
user-facing behaviour; both are scoped to the wheel accumulator plus stale-comment rewording (no
behaviour change), so no further coverage gap was found beyond Major 1 itself.

**What I built.** A new test in `web/e2e/shell-scroll.spec.ts`, "a slow trackpad-shaped wheel gesture —
many sub-line deltas, one flush per event — still scrolls the pane (REQ-7, review cycle 1 Major 1)":
reuses `fillShellHistory` (same ~200-line history the E4/E5/E10 tests already build) and a new
`wheelSlowScroll` helper that dispatches 60 wheel events of `deltaY = -4` each, alternating with a new
`waitForAnimationFrame(page)` helper (added to `web/e2e/helpers/shellinput.ts`) between every dispatch.
Asserts against the same tmux oracle the E4/E5 test already uses — `daemon.tmuxDisplay(target,
"#{pane_in_mode}")` reaches `"1"` and `"#{scroll_position}"` leaves `"0"`.

**Why `waitForAnimationFrame` is load-bearing, not decorative.** `flushWheelScroll` is scheduled via
`requestAnimationFrame` from the `wheel` event handler, coalescing everything accumulated since the
last flush into one frame. Playwright's `page.mouse.wheel` calls round-trip over CDP fast enough
(sub-frame) that firing 60 of them back-to-back with no wait between them risks batching several
`deltaY = -4` events into a single flush before it ever runs — at which point the *pre-fix* bug (reset
the whole accumulator whenever a flush's `lines` rounds to a nonzero total >0 within one frame) would
never trigger, since the discarded-on-a-zero-frame bug only bites when a single flush's own
accumulated total rounds to *zero* lines. A test that doesn't force one wheel event per animation frame
would pass on both the buggy and the fixed code — exactly the kind of vacuous coverage this task
exists to avoid. `waitForAnimationFrame` resolves exactly when the browser's next `requestAnimationFrame`
callback fires (`page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))`),
which is event-driven rather than a fixed-duration guess and is registered strictly after `pane.ts`'s
own `requestAnimationFrame(flushWheelScroll)` call for that same wheel event, so it reliably serializes
one dispatch → one flush → next dispatch.

**Discrimination proof — the assertion was proven red against the pre-fix code, then the tree was
restored.** Since this is a brand-new test (not a repair of an existing assertion), the fix-mode brief
still asked me to verify it genuinely discriminates. I temporarily reproduced review cycle 1's exact
described defect in `web/src/terminal/pane.ts`'s `flushWheelScroll` (zero the accumulator
unconditionally, before the `lines === 0` early return — the pre-`6cfc53d` shape) and its matching
import change (dropping the now-unused `PIXELS_PER_LINE` import, since the buggy shape predates that
export), ran `make web-build build` (succeeded), then `npx playwright test e2e/shell-scroll.spec.ts -g
"slow trackpad"` from `web/`:

```
Expected: "1"
Received: "0"
    (Timeout 15000ms exceeded while waiting on the predicate)
```

— `#{pane_in_mode}` stayed `"0"`, matching the reviewer's own measurement exactly (`pane_in_mode = 0`
after 60 small events). I then ran `git checkout -- web/src/terminal/pane.ts` to restore the real fix,
confirmed via `git status --porcelain` that only my own spec/helper files remained modified, and
`make web-build build` again to leave the built binary matching the committed tree before re-running
anything else.

**Gates, all in the foreground:**

1. `make web-build build` (project root) — succeeded, both before and after the discrimination proof's
   temporary edit and its restore.
2. `npx playwright test --list` from `web/` — clean, **395 tests in 35 files** (was 394; +1 for this
   test), no duplicate titles, no collection errors.
3. `npm run e2e -- e2e/shell-scroll.spec.ts` from `web/` — `e2e-lint: clean`, **7 passed (8.0s)**, no
   retries, first attempt.
4. `make e2e` (project root, foreground, `timeout: 600000` to avoid the 120s default auto-backgrounding
   a subagent can never be woken from per this run's own standing lesson) — **395 passed (2.5m), exit
   code 0.**
5. `make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10` — **70 passed (57.5s), 0 retries** — the new test
   passed all 10 concurrent repeats alongside the file's six pre-existing tests.

No other spec file needed a change: neither implementation log's Fix Attempt section added any other
new user-facing behaviour, and the E4/E5/E6/E9/E10 tests in this same file are unaffected by the fix
(their deltas are all ≥ 300, well above one line, so their flush path was never the buggy one).

### Repairs

None — this wave added one new test and one new helper function; it did not modify or weaken any
existing assertion. `No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
$ npm run e2e -- e2e/shell-scroll.spec.ts
e2e-lint: clean
Running 7 tests using 4 workers
  ✓  the tmux server's mouse option stays off once a shell is spawned (D7, INV-2) (2.1s)
  ✓  dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8) (2.4s)
  ✓  wheeling up hard on a shell with almost no history clamps without error and is not left in copy-mode after scrolling back down (E9, REQ-12, edge case 10) (962ms)
  ✓  a wheel-up over a shell surface with real history enters copy-mode, and wheeling back down leaves it by itself with the mouse option still off (E4, E5, REQ-7, INV-2) (4.4s)
  ✓  a wheel-up over a shell surface never inserts a character into the shell's command line — the #45 symptom itself (E6) (2.9s)
  ✓  typing while a shell is scrolled back cancels copy-mode, returns to the live bottom, and still delivers the keystroke (E10, REQ-10) (2.4s)
  ✓  a slow trackpad-shaped wheel gesture — many sub-line deltas, one flush per event — still scrolls the pane (REQ-7, review cycle 1 Major 1) (7.0s)
  7 passed (7.8s)

$ make e2e
395 passed (2.5m)

$ make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10
70 passed (57.5s)
```

### Notes

- The discrimination-proof edit to `web/src/terminal/pane.ts` was temporary and reverted via `git
  checkout --`; it never appears in any commit from this wave. Confirmed by `git diff --stat` after the
  revert, which shows only `web/e2e/helpers/shellinput.ts` and `web/e2e/shell-scroll.spec.ts` (plus the
  orchestrator's own pre-existing `orchestration-state.json` change, untouched by me).
- `wheelSlowScroll` and `waitForAnimationFrame` are additive to their respective files — no existing
  helper or test body was changed.

## Fix Attempt 2 (review cycle 2)

**Task.** `review.cycle2.md` tagged exactly one issue, Minor 1, `[e2e-specs]`: E13 (drag-to-select,
`web/e2e/shell-scroll.spec.ts`) is flaky at ~1% — one failure (`drag target text has no bounding box`)
in ~120 runs, all others green. Nothing about the product changed this cycle; the reviewer's own
diagnosis pinned the cause in the spec, not the implementation, and explicitly asked for a structural
fix argued from the code, not a reproduction: at ~1% a soak cannot distinguish a fix from luck. I did
not attempt to reproduce the flake — the review's own instruction and this file's task both say so —
and built the fix from reading the failing code instead.

**What I read first:** the failing test itself (`web/e2e/shell-scroll.spec.ts:81`, "dragging across a
shell surface still selects text in the browser, exactly as it does today (E13, REQ-8)") and its two
surrounding helpers/oracles already in the file (`.xterm-selection` overlay poll, `fillShellHistory`).
No implementation file changed this cycle (both impl logs' Fix Attempt sections were read per the
standing instruction to catch newly-added user-visible behaviour — cycle 2 added none; its only fix
was the plan-level `doc-delta.md` amendment plus doc/diagram edits, nothing in `web/src`), so there was
no new behaviour to cover beyond the repair itself.

**Root cause, from the code, not a repro.** Two independent defects compound into the observed
failure:

1. `const textLine = shellRegion.getByText("shell-scroll-e13-drag-target")` is a substring match with
   no `exact`. The typed command line the pty echoes back before Enter is processed —
   `echo shell-scroll-e13-drag-target` — contains the same substring as the command's own output row
   (`shell-scroll-e13-drag-target`, with no `echo` prefix). Both rows can match. In the common case
   (no argument-highlighting shell) this resolves to exactly the two rows in document order; in an
   interactive shell that colours a command's arguments in their own span, the typed line's argument
   token can even become its own element with the exact same text as the output row, giving getByText
   three eligible matches instead of two. Whichever row the un-anchored locator happens to resolve to
   first is not guaranteed to be the settled output row.
2. `const box = await textLine.boundingBox()` reads once. xterm.js's DOM renderer keeps one row `div`
   per screen line in a fixed top-to-bottom document order and rewrites a row's *content* in place as
   output streams in and the display repaints, rather than replacing or reordering the row nodes
   themselves. A single boundingBox() call can land in the gap between an outgoing paint and the
   incoming one, where the resolved element is momentarily present but has no layout box (`display:
   none` / zero dimensions for an instant) — `boundingBox()` returns `null` in that case rather than
   waiting, unlike the `toBeVisible()` assertion that ran immediately before it and passed. That
   explains the observed shape exactly: `toBeVisible` green, the very next line's `boundingBox()` null.

**The fix.** Both causes are structural, so both are closed at the code level, independent of any
particular run:

- `.last()` on the `getByText(...)` locator. Regardless of how many rows match (two in the common
  case, three under argument highlighting), the output row is always the *last* one added to
  `.xterm-rows`' fixed document order — it necessarily renders after whatever produced it. `.last()`
  removes the ambiguity structurally: there is no longer a locator that can resolve to the wrong row,
  because "wrong" would require a row than renders later than the output row, and none can.
- The `boundingBox()` read is now inside `expect.poll(...)`, one full retry loop rather than one
  snapshot: each poll iteration calls `textLine.boundingBox()` fresh (re-resolving the locator against
  the live DOM, not a cached handle) and the poll only succeeds once a non-null box comes back. The
  result is captured on an object property (`captured.box`), not a bare reassigned `let`, purely to
  keep TypeScript's control-flow narrowing sound outside the closure — `tsc --noEmit` rejected the
  first version of this fix (`Property 'x' does not exist on type 'never'`) because it treated a
  `let` only ever written inside the poll's callback as permanently `null` outside it; a property read
  doesn't hit that narrowing rule. This closes cause 2 the way the review asked: "poll until
  boundingBox() is non-null... re-resolve inside the poll."

Neither change touches what the test asserts: the mouse-down/move/up sequence, the `.xterm-selection`
overlay oracle, and REQ-8/INV-2's claim (a real drag over a shell surface produces a non-empty browser
text selection) are byte-identical to before this cycle.

**Why this doesn't need a repro to be trusted.** The failure mode was "the wrong element, or no
element with a usable box, is read once." After this fix there is exactly one row the locator can ever
resolve to (the last match, which is definitionally the output row once it exists) and the box read
now retries until that row has a real layout box instead of trusting a single sample. Neither
mechanism that could produce the old symptom exists anymore in this code path — the argument isn't
"it didn't fail in N runs," it's that the two code shapes that could produce `getByText` picking a
stale/wrong row or `boundingBox()` returning null on a fine row are both gone.

**Gates, all in the foreground:**

1. `make web-build build` (project root) — first attempt failed at `tsc --noEmit` (the `let`/`never`
   narrowing issue above, TS2339 ×6); fixed by capturing the polled value on an object property
   instead of a bare `let`; second attempt succeeded.
2. `npx playwright test --list` from `web/` — clean, **395 tests in 35 files**, no duplicate titles, no
   collection errors (run both right after the fix and again after the full-suite sweep below).
3. `make web-lint` (project root) — clean, 173 files, no fixes applied.
4. `npm run e2e -- e2e/shell-scroll.spec.ts` from `web/` — `e2e-lint: clean`, **7 passed (9.1s)**, 0
   retries, first attempt (includes E13 itself, plus the six other pre-existing tests in the file,
   untouched by this fix).
5. `make e2e` (project root, foreground, `timeout: 600000` — the standing lesson from this run's own
   fix-wave-1 log about a subagent never being woken from a backgrounded gate) — **395 passed (2.7m),
   exit code 0.**
6. `make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10` — **70 passed (56.6s), 0 retries.** As instructed,
   this is offered only as evidence nothing regressed, not as evidence the flake is fixed — a green
   soak at N=10 cannot distinguish a real fix from the same ~1% luck the review already had running
   against it in 120 prior runs.

No other spec file needed a change: this cycle's implementation logs added no new user-visible
behaviour (confirmed by reading both Fix Attempt sections), so there was no coverage gap beyond the
one tagged issue.

### Repairs

| # | Test | Symptom | Root cause in my spec | Fix | Assertion still covers |
|---|------|---------|------------------------|-----|-------------------------|
| 1 | dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8) | Reviewer observed (once, ~1% rate): `Error: drag target text has no bounding box` at the `boundingBox()` read, after the preceding `toBeVisible()` had passed | (a) `getByText(...)` with no anchor could resolve to the typed command-echo row instead of the output row — both contain the search substring, and an argument-highlighting shell can add a third matching span with the exact same text; (b) a single `boundingBox()` snapshot could land in the moment xterm's DOM renderer had rewritten the resolved row's content and left it momentarily boxless | (a) `.last()` on the locator — the output row is structurally always the last DOM match in xterm's fixed top-to-bottom row order; (b) wrapped the `boundingBox()` read in `expect.poll(...)`, which re-resolves the locator each attempt instead of trusting one sample | REQ-8/INV-2: a real mouse-down/move/up drag over the shell surface still produces a non-empty `.xterm-selection` overlay (`childElementCount > 0`) — the drag simulation, the oracle, and the pass/fail condition are unchanged; only how the drag's start coordinates are obtained was repaired |

`No assertion was deleted, skipped, or weakened.`

### Test Run Output

```
$ npx playwright test --list
Total: 395 tests in 35 files

$ npm run e2e -- e2e/shell-scroll.spec.ts
e2e-lint: clean
Running 7 tests using 4 workers
  ✓  the tmux server's mouse option stays off once a shell is spawned (D7, INV-2) (2.5s)
  ✓  dragging across a shell surface still selects text in the browser, exactly as it does today (E13, REQ-8) (2.6s)
  ✓  wheeling up hard on a shell with almost no history clamps without error and is not left in copy-mode after scrolling back down (E9, REQ-12, edge case 10) (947ms)
  ✓  a wheel-up over a shell surface with real history enters copy-mode, and wheeling back down leaves it by itself with the mouse option still off (E4, E5, REQ-7, INV-2) (5.2s)
  ✓  a wheel-up over a shell surface never inserts a character into the shell's command line — the #45 symptom itself (E6) (3.0s)
  ✓  typing while a shell is scrolled back cancels copy-mode, returns to the live bottom, and still delivers the keystroke (E10, REQ-10) (2.9s)
  ✓  a slow trackpad-shaped wheel gesture — many sub-line deltas, one flush per event — still scrolls the pane (REQ-7, review cycle 1 Major 1) (8.1s)
  7 passed (9.1s)

$ make e2e
395 passed (2.7m)

$ make e2e-soak SPEC=e2e/shell-scroll.spec.ts N=10
70 passed (56.6s)
```

### Notes

- No implementation file was touched this cycle — `web/e2e/shell-scroll.spec.ts` is the only file this
  fix wave changed. `git diff --stat` shows exactly that one file.
- Did not attempt to reproduce the flake, per the review's own instruction and this wave's task: the
  argument for the fix is structural (both failure mechanisms are gone from the code), not statistical.
