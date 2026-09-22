# Web Implementation: Terminal Fixes Cleanup

**Plan**: terminal-fixes-cleanup
**Mode**: initial
**Pack**: `go run ./tools/kb pack --plan terminal-fixes-cleanup --role web-impl` — decisions/facts/lessons for features `surfaces`, `theme` (see conversation header; not re-run standalone since the orchestrator's earlier pack call already surfaced it).

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/terminal/shellkeys.ts` | created | Pure key→bytes mapping (W1/W2: Option±Arrow → `ESC b`/`ESC f`, Cmd±Arrow → `0x01`/`0x05`) and the wheel deltaY→scroll-lines conversion (W4, clamped `[1,200]`) — one file, both are "shell surface input translation", no DOM/socket. |
| `web/src/terminal/shellactivity.ts` | created | Pure reducer over `shellActivity`/`snapshot.shellsBusy` and surface selection producing `"none"\|"busy"\|"done"` per session (REQ-2/3/4/11/13/14), epoch-guarded so `features/surfaces.ts` never needs to `clearTimeout` a stale timer. |
| `web/src/terminal/pane.ts` | edited | `kind === "shell"` only: `term.attachCustomKeyEventHandler` (readline translation) and `term.attachCustomWheelEventHandler` (coalesced `scroll` frame, one per animation frame) — both xterm.js 6 native hooks, never a second DOM listener racing xterm's own. Neither is installed for `kind === "claude"` (INV-1). |
| `web/src/terminal/surfaceswitch.ts` | edited | Removed `pipEl`/`.pip` entirely (REQ-1). Added `shellActEl`/`span.shellact`, `aria-hidden`, `data-act="busy"\|"done"`, same attach/detach-by-`.remove()` pattern the pip used. `updateSurfaceSegment` takes a 4th `activity: ShellActivityIndicator` param. |
| `web/src/protocol.ts` | edited | `ShellActivityMessage` (`shellActivity`) + parser; `Snapshot.shellsBusy?: number[]` + parser — **present-only** (see Decisions: not the "always-defaulted" pattern `update`/`claudeTheme` use). |
| `web/src/ws.ts` | edited | `WsClientHandlers.onShellActivity` + dispatch case. |
| `web/src/app.ts` | edited | `AppEvents.shellActivity` — the one new event `features/surfaces.ts` listens to. |
| `web/src/main.ts` | edited | Wires `onShellActivity` → `app.emit("shellActivity", …)` + render, same shape as `onDocChanged`/`onUpdate`. |
| `web/src/features/surfaces.ts` | edited | Owns `activityState: ShellActivityState`; new `activityFor(id)` on `SurfacesHandle`; hooks: `shellActivity` (live), `snapshot` (restore + reconcile-absent diff), `sessionRemoved`/`handleShellEnded` (`shellGone` — no transient tick), `select()`'s shell-success branch (`clearOnSelect`, REQ-4a). |
| `web/src/render/mainhead.ts` | edited | `renderMainhead` takes an optional 6th `activity` param (default `"none"`, so `mainhead.test.ts`'s pre-plan fixtures are untouched), passed through to both `updateSurfaceSegment` calls. |
| `web/src/features/focus.ts` | edited | `getSurfaces()` structural type gains `activityFor`; `renderView` reads it for the focused session and passes it to `renderMainhead`. |
| `web/src/features/tiles.ts` | edited | `getSurfaces()` structural type gains `activityFor`; `reconcileTilesGrid` passes it to `updateSurfaceSegment` for the tile footer. |
| `web/src/style.css` | edited | Removed `--shell-pip` from all three `[data-theme]` blocks and both `.surfseg .pip`/`.tfoot .surfseg .pip` rules. Added `.shellact`/`[data-act="busy"]` (border-spin keyframes, `--fg-dim`)/`[data-act="done"]` (checkmark, `--fg`) — monochrome, no state hue (W11). |
| `web/scripts/contrast-pairs.json` | edited | Removed the `--shell-pip` `exempt` entry and its `hueBands` entry. |
| `web/e2e/helpers/shell.ts` | edited | Removed `shellPip`, `expectMainheadShellSelectedAndRunning`, `expectPipUsesShellPipToken` (all now-unused, per the plan's explicit assignment — "web-impl owns this file, not e2e-specs"). Removed the now-unused `expect` import. Updated the header comment's stale pip reference. |

## Decisions

- **`shellsBusy` is present-only on `Snapshot`, not always-defaulted.** Affected Files describes it as "always present" (true of a real post-plan daemon), and my first pass matched `update`/`claudeTheme`'s "default to `[]` when the wire key is absent" pattern. That broke `protocol.test.ts`: 29 assertions do `expect(parseMessage(fixture)).toEqual(fixture)` against a shared `validSnapshot` that predates this field, and a synthesized `shellsBusy: []` in the parsed output is no longer deep-equal to the un-augmented input. Switched to the `usage.model`/`modelScoped` present-only idiom (`if ("shellsBusy" in rec) {...}`) instead: an absent key stays absent on the parsed object. Verified: `npx vitest run` went from 29 failures in `protocol.test.ts` to 0 with this change, no edit to that file. `features/surfaces.ts` reads `snapshot.shellsBusy ?? []`.

- **deviation: a snapshot-restored "done" always self-clears after ~3s regardless of whether `shell` is the selected surface — `restoreIdle` in `shellactivity.ts`, distinct from `observeIdle`.** → kb:adr/surfaces-snapshot-restored-tick-always-self-clears
  REQ-4 and edge case 4 (E8) are inconsistent once you can't tell them apart on the wire, and you genuinely can't: `internal/server/shellactivity.go`'s `reconcile()` comment says outright that "a shell disappearing from panes entirely (exited while busy, E7; reconcile-killed at daemon restart, E8)... both read as 'no longer in newBusy', the same path as going idle" — the daemon emits the identical `shellsBusy`-omission for "the command finished, shell still exists" (W6) and "the shell is gone" (E8). REQ-4 requires the *live* idle path to persist "done" indefinitely when `shell` isn't selected (User Flow 3: "the spinner becomes a tick **and stays**"); edge case 4 requires the *reconnect* idle path to reach "none" even though the E8 test never re-selects `shell`. Measured: with a single `observeIdle` used for both paths (gated only on `shellSelected`), the mainhead's `span.shellact` sat at `data-act="done"` for the whole 20s of a diagnostic poll after `daemon.restart()` while the test stayed on `claude` — it never had a timer to self-clear. Splitting the transition into `observeIdle` (live message, REQ-4's exact two-path rule) and `restoreIdle` (snapshot gap, **always** schedules the self-clear) fixed it: `npx playwright test e2e/shell-activity.spec.ts` went from 6/8 to 8/8 (later 7/8, see below) with no change to the live-message path. This does mean a tick that survives *only* because of a network blip (not because anyone is deliberately ignoring it) will now vanish on its own after ~3s even if `shell` is never selected — narrower than REQ-4's stated "and stays" guarantee, but the alternative (E8 stuck forever) is worse and the plan's own edge case 4 requires this outcome. `doc-delta:` `docs/features/surfaces/spec.md`'s "a tick clears once work finishes" sentence should note this reconnect-path nuance if it goes into implementation-level detail; the plan's own Doc Delta text ("the segment shows a spinner while busy and a tick once work finishes") doesn't need to change since it doesn't specify the clearing mechanism.

- **Confirmed, not a defect: shell-keys.spec.ts's 4 word/line-jump tests (E1, E2, and the two REQ-5/REQ-6 companions) fail in this sandbox because the daemon's spawned shell has `EDITOR=vi`, putting zsh's zle in `viins` keymap, not because the client sends the wrong bytes.**
  Measured with a throwaway debug spec (written, run, and deleted — never part of the diff): a `WsByteRecorder` on `/ws/shell/` shows the client sends exactly `1b62` (`ESC b`) for Option+Left and the shell's own tty echoes the resulting escape sequences and bell characters that only make sense for a shell in vi-mode (cursor moves correctly for the *first two* `ESC b` presses — vi's command-mode `b` motion — then every further keystroke, including plain letters, comes back as a bare `07` BEL with no insertion, and `bindkey -lL main` run inside that exact pane prints `bindkey -A viins main`; `echo $EDITOR` prints `vi`). `zsh -i` run directly in this same box (outside the daemon) is in `emacs` keymap (`bindkey -A emacs main`, confirmed), so this is specific to whatever environment `musterd`'s child process inherits when spawned by this sandbox's `startScratchDaemon()` — I could not pin down exactly where `EDITOR=vi` enters that chain (not `~/.zshrc`, `/etc/zshrc`, `~/.tmux.conf`, or Node's own `process.env.EDITOR`, which is `undefined`), and it's out of scope for me to chase further (`internal/server/shells.go` doesn't set it — grepped, no hits). The plan's own spike S7 measured `ESC b`/`ESC f` as correct against zsh and bash in emacs mode, which is the standard default; I implemented exactly the Protocol Contract's prescribed translation and verified byte-for-byte it's sent correctly. Flagged in Handoff for e2e-validate/review to re-run in an environment where the daemon's shell isn't vi-mode, since that's the only way E1/E2/REQ-5/REQ-6 can be observed passing or failing on their actual merits.

- **Confirmed, not a defect: shell-activity.spec.ts's first test ("a shell running a silent foreground command shows a spinner in both the mainhead and the tile footer…") checks the *mainhead's* indicator reaches `"done"` after the test has switched to Tiles view (`Meta+Backslash`), but the Focus mainhead's render phase (`focus.renderView`, which is what calls `updateSurfaceSegment` on the mainhead's segment) only runs while `app.state.view === "focus"` (`main.ts`'s render dispatch: `if (app.state.view === "focus") focus.renderView(frame); else tiles.renderView(frame)` — never both) and `viewFocusEl.hidden = app.state.view !== "focus"` (`features/views.ts`).**
  This is pre-existing, unrelated-to-this-plan architecture (the tiles feature's own CLAUDE.md calls it the "snapshot-not-live rule") — every other piece of mainhead-only state (End/Resume disabled, name, meta line) is equally frozen while Tiles is active; nothing in this plan changes that. The test's own tile-footer assertions (same test, same command) pass correctly, since the tile *is* live in Tiles view. Flagged in Handoff — the mainhead assertion needs to run while Focus is still the active view, or be dropped in favor of the tile check it's paired with.

- Every plan REQ assigned to web (REQ-1 through REQ-14 touching the client) is implemented; REQ-9 (Claude surface unchanged) and REQ-10 (typing-while-scrolled-back returns to the live bottom) are daemon-driven and need no client code beyond "don't install the handlers for `claude`" (verified) and "keep sending input bytes normally" (unchanged, `term.onData` untouched).

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` — **NOT BUILDING**, and `npx vitest run` / `make web-test` have 9 failing tests, all confined to one file: `web/src/terminal/surfaceswitch.test.ts`. This is sanctioned breakage, not a defect of mine to fix — the plan's own Automated Checks (E15: `! rg -n -e "pipEl" -e "shellPip" web/src web/e2e`) explicitly puts `*.test.ts` in scope for the pip-removal grep, so this file's `pipEl`/`FakeSurfacePip`/3-arg `updateSurfaceSegment` calls have to go regardless of who edits them, and I may not touch test files beyond an import fix. `npx vite build` (the bundler half of `npm run build`, no type-check) succeeds on its own — the shipped application code compiles and bundles cleanly; only the type-check step (which also covers this one Vitest file) is red.

Needed in `web/src/terminal/surfaceswitch.test.ts` (web-tests):
- `fakeSurfaceSegmentRefs()` (~line 303): rename its `pipEl`/`FakeSurfacePip` fields to `shellActEl`/`FakeShellActEl` (or similar), matching `SurfaceSegmentRefs.shellActEl: HTMLElement`.
- `hasPip()` (~line 330): rename/repurpose to read `.dataset["act"]` off the fake element instead of checking mere presence — `updateSurfaceSegment` now needs `refs.shellBtn.children.length`/dataset inspection to see `data-act`, since presence alone no longer distinguishes "busy" from "done".
- Every `updateSurfaceSegment(refs, state, connected)` call (12 call sites, lines 337–407): needs a 4th `activity: ShellActivityIndicator` argument (`"none" | "busy" | "done"`, from `web/src/terminal/shellactivity.ts`).
- The five tests under "States: 'no data yet' has no pip; a running shell shows one" test the *old* pip contract (presence == running) — these need re-authoring against the new contract (absence == `"none"`, presence + `data-act` == `"busy"`/`"done"`), not just a mechanical rename. I did not do this myself (forbidden — assertions/test bodies are not an import fix).

Also for **e2e-specs/orchestrator** (not a build gate, but affects what "green" means for this plan's own specs — see Decisions above for the measured evidence behind both):
- `web/e2e/shell-keys.spec.ts`'s four tests (E1, E2, and their REQ-5/REQ-6 companions) cannot pass in this sandbox because the daemon's spawned shell is in vi-mode (`EDITOR=vi`, `bindkey -A viins`), not because of a wrong byte translation (verified byte-for-byte correct via a throwaway `WsByteRecorder` script, not part of this diff). Needs re-running wherever the daemon's shell environment is emacs-mode (the plan's spike S7 measurement environment) to actually evaluate REQ-5/REQ-6.
- `web/e2e/shell-activity.spec.ts`'s first test (`web/e2e/shell-activity.spec.ts:23`) checks the Focus mainhead's indicator after switching to Tiles view, which this codebase's pre-existing render-phase architecture makes structurally unable to update. Not mine to edit; needs e2e-specs to either check the mainhead assertion before switching views, or drop it in favor of the (correct, passing) tile-footer assertion in the same test.
- `web/e2e/plain-shell.spec.ts:790`'s comment ("The 'pip resolves to --shell-pip token' pin... is retired here") still contains the literal string `--shell-pip`, which fails the plan's own E14 automated check (`! rg -n -e "--shell-pip" web/src web/scripts web/e2e`) since that check's scope explicitly includes `web/e2e`. Not mine to edit (a `*.spec.ts` file, not `helpers/shell.ts`).

**E2E smoke run** (plan's own specs, `make web-build build` then `npx playwright test`; `make web-build` itself fails at its `tsc` step for the reason above, so I ran `npx vite build` directly to produce fresh `internal/webui/assets`, then `go build ./...` at the repo root):
- `shell-keys.spec.ts`: 1/5 passed (E3/INV-1 — the Claude-surface regression pin; the other 4 are the vi-mode environment issue above).
- `shell-scroll.spec.ts`: 6/6 passed.
- `shell-activity.spec.ts`: 7/8 passed (the Tiles-view mainhead assertion above).
- `plain-shell.spec.ts`: 18/18 passed (pip→indicator locator swap holds).
- `reader.spec.ts`: 49/49 passed.

## Fix Attempt 1 (pre-review fix)

**Failures addressed**: `shellactivity.test.ts > resolveOnset — the delayed onset callback > W8: a busy period that ends before the onset delay elapses never shows a spinner` (web-tests, verdict `implementation-bug`, test committed at `ac41426`).

**Root cause** (confirmed by tracing the exact call sequence, not asserted from the diff): `resolveOnset`'s own doc comment claimed a `busy:false` arriving before the onset delay elapses "clears the entry back to a fresh epoch (see `observeIdle` below)". `observeIdle`'s actual guard, `if (current.indicator !== "busy") return { state, timer: null };`, is a genuine no-op for a still-`"none"` (pending-onset) entry — it never touches the epoch. So the epoch `observeBusy` handed the caller for its onset timer is still valid when that timer fires later, and `resolveOnset` promotes to `"busy"` even though the command already finished.

**Changes made**: `web/src/terminal/shellactivity.ts` — both `observeIdle` and `restoreIdle` gained a branch for `current.indicator === "none"`: if the id has a tracked entry at all (`state.has(id)`), bump its epoch (indicator stays `"none"`) so a `resolveOnset` scheduled against the old epoch sees a mismatch and no-ops; if there's no entry at all (never observed busy), stay a true no-op. `observeIdle`'s live-message path is the one W8 exercises; `restoreIdle`'s branch is currently unreachable from its one production caller (`features/surfaces.ts`'s snapshot handler already filters to `getShellActivity(...) === "busy"` before calling it) — fixed anyway per the request to check it, since it's the same shape of bug and costs nothing (verified: its own `EMPTY_SHELL_ACTIVITY`-based "not currently busy: no-op, identity" test has no entry to invalidate, so `state.has(id)` is false there and it stays a true `toBe` identity — no conflict, unlike `observeIdle`'s case below).

**Blast radius measured**: `rg -n "observeIdle|restoreIdle" web/src` — exactly one production call site each, both in `features/surfaces.ts` (line 226 `observeIdle`, line 264 `restoreIdle`), both already gating/shaping their inputs the way the fix expects. No other module imports either function.

**Reviewer's repro re-run**: `npx vitest run src/terminal/shellactivity.test.ts` — W8 now passes (`getShellActivity(afterOnset, 1)` is `"none"`, matching the assertion). Full suite: `npx vitest run` → `Test Files 1 failed | 42 passed (43)`, `Tests 1 failed | 1724 passed (1725)` — same aggregate count as web-tests' pre-fix report, but the failing test moved (see next item; not a new count, a substituted one). `npx tsc --noEmit` exits 0. `npm run build` exits 0. `npx vite build` succeeds. `go build ./...` succeeds. `npx playwright test e2e/shell-activity.spec.ts` — 7/8, identical to before the fix (the one failure is the pre-existing Tiles-view render-phase test defect already flagged in Handoff above, unrelated to this change; re-confirmed unchanged, not newly introduced).

**A pinned test this fix necessarily breaks, and the proof it's unavoidable**: `observeIdle — live shellActivity{busy:false} > not currently 'busy' (still 'none', pending onset): no-op, identity` (`shellactivity.test.ts:106-110`) asserts `expect(result.state).toBe(r.state)` — strict reference identity — for `observeIdle(r.state, 1, false)` where `r = observeBusy(EMPTY_SHELL_ACTIVITY, 1)`. This is the *exact same call*, on the *exact same input*, as W8's first step. Given that:
1. If `observeIdle` returns `r.state` unchanged (satisfying the identity test), then in W8, `afterIdle === r.state` — the identical object.
2. `resolveOnset(afterIdle, 1, r.timer!.epoch)` is then identical to `resolveOnset(r.state, 1, r.timer!.epoch)`.
3. The pinned, currently-passing test `resolveOnset — epoch matches, still 'none': promotes to 'busy'` (`shellactivity.test.ts:67-71`) requires *that exact call* to return `"busy"`.
4. W8 requires the *same call* to return `"none"`.

Points 3 and 4 are mutually exclusive for the same expression under any implementation — not just mine — because `resolveOnset` is pure and takes no input besides `(state, id, epoch)`, and by point 1 the `state` argument is byte-identical between the two tests. The only way to make `resolveOnset` behave differently between these two call sites is for `observeIdle` to leave *some* observable difference in the state it hands back for the "busy:false received" case — which necessarily breaks the `toBe` reference-identity assertion, since `withEntry` always allocates a new `Map`. I did not weaken or reinterpret W8 to reach this conclusion — reran it as written and it now passes; the identity test is the one that cannot also hold. Not edited (forbidden); flagging for the next test wave to reconcile — likely by asserting `getShellActivity(result.state, 1)).toBe("none")` and `result.state).not.toBe(r.state)` there instead of `toBe`.

**Decisions**: none beyond the fix itself and the conflict above — no new `deviation:`/`doc-delta:` lines this wave.

## Fix Attempt 2 (review cycle 1)

**Failures addressed**: review cycle 1, Major 1 and Major 5 (`plans/terminal-fixes-cleanup/review.cycle1.md`), both tagged `[web-impl]`.

**Major 1 — sub-line wheel deltas discarded (`web/src/terminal/pane.ts:193-200`, `flushWheelScroll`)**

Root cause as diagnosed: `wheelAccumDeltaY = 0` ran unconditionally, before the `lines === 0` early return, so any frame whose accumulated `deltaY` rounded to 0 lines threw its whole accumulator away instead of carrying it forward. A sustained slow gesture (many sub-`PIXELS_PER_LINE` deltas) therefore never crossed the rounding threshold.

Fix: moved the accumulator reset after the early return, and changed it from a hard zero to `this.wheelAccumDeltaY += lines * PIXELS_PER_LINE` — only the pixel amount that actually rounded into the sent `lines` is removed, so:
- `lines === 0`: accumulator is untouched; the next frame's events add onto it.
- `lines !== 0`: only the consumed portion is removed, leaving any genuine remainder (sub-rounding-threshold, or — deliberately — beyond the daemon's 200-line clamp on an extreme flick, which now spreads over more than one frame instead of losing the excess) queued for the next flush.

**Design decision — how much to carry, stated deliberately**: I carry the *exact* algebraic remainder (`accum + lines * PIXELS_PER_LINE`, not `accum % PIXELS_PER_LINE` or a hard reset to 0), including past the daemon's `[1, 200]` clamp. Rationale: `wheelDeltaToScrollLines` is pure and already owns rounding/clamping (`web/src/terminal/shellkeys.ts`); duplicating a truncation or modulo here would drift from that logic and re-introduce a second place that decides "how much was consumed." Feeding the clamp's own output back through the same formula keeps `flushWheelScroll` a straight accumulator with no independent scroll math, and it has a second-order benefit: a gesture large enough to hit the 200-line clamp no longer silently loses everything past the cap — it carries into the next frame instead. `PIXELS_PER_LINE` needed to be exported from `shellkeys.ts` (was a private `const`) for `pane.ts` to reuse it rather than hard-coding `20` a second time — sole export change, sole new import.

**Sign handling verified in both directions**: `wheelDeltaToScrollLines`'s documented convention (confirmed against `web/src/terminal/shellkeys.test.ts`) is negative `deltaY` (wheel up) → positive `lines`, so the consumed-pixel term is `lines * PIXELS_PER_LINE` added back to `wheelAccumDeltaY`, not subtracted — subtracting would have doubled the residual instead of canceling it. Worked through arithmetically for both directions before writing the code (`accum=-120, lines=6 → remainder = -120 + 120 = 0`; `accum=120, lines=-6 → remainder = 120 + (-120) = 0`), then confirmed with the real-pane repro below.

**Reviewer's exact repro re-run against a real pane** (not the theory — the actual measurement, `web/e2e/_wheel-repro-tmp.spec.ts`, a temporary spec created for this measurement and deleted immediately after — `git status --porcelain` on it confirmed empty afterward):

| Step | Before this fix (reviewer's numbers) | After this fix (this run) |
|---|---|---|
| `history_size` | 178 | 178 |
| 60 × `deltaY = -4` (25ms apart) → `#{pane_in_mode}` | `0` (never entered copy-mode) | `1` |
| same → `#{scroll_position}` | not measured (stayed at 0) | `12` |
| single `deltaY = -120` → `#{pane_in_mode}` / `#{scroll_position}` | `1` / `6` | `1` / `6` (unchanged — exact-multiple case was already correct) |

12 lines for 60×(-4) matches the math exactly: 240px of accumulated intent ÷ 20px/line = 12 lines, delivered as 12 separate 1-line frames (one crosses the rounding threshold roughly every 5 events at 25ms spacing, well under one animation frame each, so most frames send nothing and carry forward — consistent with the fix's intent). The single `-120` case is untouched, confirming the fix doesn't perturb the already-passing exact-multiple path.

**Blast radius of the shared constant**: `rg -n "PIXELS_PER_LINE" web/src` → two hits, the new `export const` in `shellkeys.ts` and the new import/use in `pane.ts`. No other consumer.

**E2E gate**: `make web-build build` (root) then `npx playwright test e2e/shell-keys.spec.ts e2e/shell-scroll.spec.ts e2e/shell-activity.spec.ts` (the plan's own specs, `test-specs.md`'s Tests table) — **19/19 passed**, including the E4/E5/E6/E9/E10 wheel-scroll tests (which all use deltas ≥ 300 and were unaffected, per the review's own note on why they didn't catch this).

**Major 5 — stale "pip" comments in `web/src/terminal/surfaceswitch.ts`**

Swept the category rather than just the two cited spots (`rg -n -i "\bpip\b" web/src --include="*.ts"` excluding `*.test.ts`, since test-file comments are `web-tests`' Major 6, not mine):
- `surfaceswitch.ts:37` (`DEFAULT_SURFACE_STATE` doc comment) — dropped the quoted `"claude selected, shell unselected, no pip"` States line (no pip exists), restated in plain prose.
- `surfaceswitch.ts:82-84` (`shellEnded` doc comment) — dropped "the pip clearing" / "only the pip clears," replaced with what `shellRunning` actually drives: `features/surfaces.ts`'s `isSurfaceAttachable`/`desiredSurfaceEntries` (attachability, plus the background-mount-under-`docs` case), since no indicator is driven by `shellEnded` at all — the busy/done indicator comes from `shellactivity.ts`'s reducer via `activityFor`, entirely separate state.
- `web/src/features/surfaces.ts:161` (same category, different file, found by the sweep, not named in the review issue) — "clears the pip/reverts state" → "reverts `shellRunning`/`selected` state," same reasoning.

Left untouched (accurate, not stale): `surfaceswitch.ts:22-23` and `shellactivity.ts:3-4`, both of which describe the pip **in the past tense as the thing this plan retired** ("is retired in favour of…", "supersedes the pip…") — correct history, not a claim that pip still exists.

**Gates re-run after both fixes**: `npx tsc --noEmit` exits 0. `npm run build` exits 0. `make web-lint` — clean (173 files, no fixes). `python3 .claude/skills/orchestrate/scripts/dead-refs.py` — `725 references checked, 0 missing`. E2E smoke above — 19/19.

**Decisions**: no new `deviation:`/`doc-delta:` lines this wave — both fixes are within the existing contract (`flushWheelScroll`'s external behaviour — one `scroll` frame per crossed line — is unchanged; comment wording carries no protocol or doc claim).

## Git

Branch `plan/terminal-fixes-cleanup`. Committing my own files (not `plans/terminal-fixes-cleanup/plan.md` or `orchestration-state.json`, which are the orchestrator's) plus this log.
