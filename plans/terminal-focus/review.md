# Review: terminal-focus

**Plan**: terminal-focus
**Cycle**: 1
**Verdict**: approved

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (pointer click leaves focus in the live terminal) | Yes — `main.ts:762` `if (source === "pointer") surfaces.get(id)?.focus()` | Yes — E2E E1/E2 (focus oracle + typed round trip) | pass |
| REQ-2 (re-click the already-focused card) | Yes — same call site; `render()`'s surface diff is a no-op, `focus()` still fires | Yes — E2E E3 (focus parked on the rail-sort select first) | pass |
| REQ-3 (`TerminalSurface.focus()`, no-op for dead/disposed, never touches the socket) | Yes — `terminal/pane.ts:205–211` | Reviewer-verified by reading (plan's own Reviewer-Verified list); E5 is the behavioural twin for the dead case | pass |
| REQ-4 (focus moved **only** on the pointer path) | Yes — exactly one call site in `web/src/`, inside the rail callback, behind the `source` guard | Yes — E8/INV-1(a) tick, INV-1(b) sessionUpsert, INV-1(c) attention reorder, E6/INV-4 drag, E7 Enter, E4 pin | pass |
| REQ-5 (card controls never select, never focus a terminal) | Yes — existing `stopPropagation()`, unchanged | Yes — E4 (pin), End-on-live-card, Resume/Remove-on-ended-card: all four INV-3 source states | pass |
| REQ-6 (dead card: focus stays on the card) | Yes — `surfaces.get(id)` is `undefined` for a dead session (`render()`'s `aliveOnly` filter), so `?.` short-circuits | Yes — E5 (`#dead-surface` visible, 0 `Terminal:` containers, card `toBeFocused`) | pass |
| REQ-7 (drag-reorder unaffected, `pendingRailFocus` contract unchanged) | Yes — no edit to `dragreorder.ts` or the `pendingRailFocus` plumbing | Yes — E6 plus the second drag test covering INV-4 (ii) and (iii) | pass |
| REQ-8 (Enter/Space selects but leaves focus on the card) | Yes — `render/sessions.ts:245` passes `"keyboard"` | Yes — E7 (real `Enter` keypress, card still `toBeFocused`) | pass |
| REQ-9 (`ux-flows.md` §3.1 one-liner) | Yes — `docs/design/ux-flows.md:176-177` | N/A (prose) — reviewer-verified | pass |

## Build & Tests

E2E tests: **pass** (203/203, full suite, `make e2e` — a regression sweep across all 17 spec files, not just this plan's)
Daemon tests: **pass** (`make test`, uncached, all packages `ok`)
Web tests: **pass** (653/653 across 22 files, Vitest)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build` — tsc + Vite)
Lint: **pass** (`golangci-lint run` — 0 issues)
Contrast gate: **pass** (`make contrast` — instrument/dark/light, 43 pairs each, 0 failures)

## Acceptance Checks

Run via `.claude/skills/orchestrate/scripts/gates.sh terminal-focus --checks-only` (exit 0, 6 lines, 0 failed).

| ID | Command | Result |
|----|---------|--------|
| W6 | `git diff --quiet main -- web/src/render/tiles.ts` | pass |
| W7 | `test "$(git diff main -- web/src/main.ts \| grep -c -E '^[-+].*(focusNth\|addEventListener\("keydown")')" -eq 0` | pass |
| W10 | `make web-build` | pass |
| W11 | `make web-test` | pass |
| W12 | `make lint` | pass |
| E10 | `make e2e` | pass (203 passed, 49.4s) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W1 | `TerminalSurface` has a public `focus(): void` | pass | `web/src/terminal/pane.ts:209` — `focus(): void { if (this.disposed \|\| !this.term) return; this.term.focus(); }` |
| W2 | `focus()` does not throw for an `alive: false` surface | pass | Constructor (`pane.ts:74-76`) returns after `setOverlay("ended")` **before** `this.term` is assigned, so `term` stays `null` and the guard short-circuits |
| W3 | `focus()` does not throw after `dispose()` | pass | `dispose()` sets `this.disposed = true` as its **first** statement (`pane.ts:224`), before `term?.dispose()` — the guard reads a settled flag |
| W4 | card `click` listener passes `source === "pointer"` | pass | `render/sessions.ts:228` — `card.addEventListener("click", () => onClick(session.id, "pointer"))` |
| W5 | Enter/Space `keydown` branch passes `source === "keyboard"` | pass | `render/sessions.ts:245` — inside the `event.target !== card` guard and the `Enter`/`" "` branch |
| W6 | `render/tiles.ts` unchanged | pass | Automated check + read: `promoteSession(id: number)` (`main.ts:328`) ignores the widened callback's second argument, so a strip-card click still promotes without focusing — Scope decision 1 holds by construction |
| W7 | `focusNth` and the window `keydown` listener unchanged | pass | Automated check; `git diff main -- web/src/main.ts` is 9 lines, all inside the rail callback. `shortcut-fixes` will apply cleanly |
| W8 | no `any` in new web code | pass | Grepped `: any` / `as any` / `<any>` across `pane.ts`, `sessions.ts`, `main.ts` and the whole `web/e2e` diff — zero hits (the only `any` substring in the diff is the English word inside a comment) |
| W9 | `ux-flows.md` §3.1 carries the click-puts-cursor-in-pane line | pass | `docs/design/ux-flows.md:176-177`, on the **Main** bullet. Accurate for the live-pane case the bullet describes (see Note 1) |
| REQ-4 / INV-1 | `TerminalSurface.focus()` has exactly one call site in `web/src/` | pass | `grep -rn "\.focus()" web/src/` returns 12 hits; the only one on a `TerminalSurface` is `main.ts:762`, inside the rail callback, guarded by `source === "pointer"`. The other src hits are `render/focus.ts:60` (rail card restore), `render/launch.ts:292/409/412` (launcher list), `main.ts:253` (version-mismatch banner) — none touch a surface |
| Scope decisions 1–2 | no focus call added to `focusNth`, the strip promote path, or the dead-surface path | pass | `focusNth`/`promoteSession`/`renderDeadSurface` are byte-identical to `main`; `#sessions` lives inside `#view-focus` (`web/index.html:54,64`), which is `hidden` in Tiles — the rail click path is unreachable there |

## Hard-Rule Checklist

Web-only plan; the Go tree is untouched by the diff (`web/src`, `web/e2e`, `docs/`, `TODO.md`, `plans/` only).

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/` only) | pass — no Go change; no Claude-Code field names introduced in web code |
| 2 | No terminal-output state parsing | pass — `focus()` reads no pane text; the diff adds no `capture-pane` consumer |
| 3 | Non-blocking hook handler | pass — no ingest code touched |
| 4 | tmux always on a dedicated socket; `pty.Setsize` + `resize-window`, never `resize-pane` | pass — no geometry code touched; E2E harness keeps its per-run socket path |
| 5 | No payload logging | pass — nothing logged |
| 6 | Empty-gauge honesty | pass — no gauge touched; manually observed `5h unknown / 7d unknown / ctx unknown` still rendering as the word *unknown* with no track |
| 7 | Session identity on the tmux target | pass — `surfaces` is keyed on Muster's `session.id`, unchanged |
| 8 | No `~/.claude/settings.json` trespass, no `CLAUDE_CONFIG_DIR` | pass |
| 9 | No real `claude` outside canary/probes | pass — E2E uses the harness's stub `-claude-bin`; no new fixture invokes a real binary |

Design-system sweep: the diff contains **no CSS and no markup change** — no new colour literal, no font stack, no spacing, no new `[hidden]`-toggled element, no new numeric display, so §1/§6/§7 have no new surface. `--term`/`--term-fg` grounding, `scrollback: 0` (`pane.ts:80`) and the one-live-client rule are all untouched, and INV-2 was re-verified live (exactly one `Terminal:` container after the swap, session A's gone rather than hidden).

## Manual Verification

Drove the real dashboard in Chromium against a freshly spawned scratch daemon (temporary uncommitted harness spec, deleted after the run — `git status --porcelain` clean afterwards), two live sessions `rev-a` (auto-focused) and `rev-b`, and checked by hand rather than trusting an assertion:

- **Before any click**: `document.activeElement` is `BODY`; no `.xterm.focus` class anywhere. The load-time auto-focus genuinely does *not* move keyboard focus (REQ-1's narrow scope, and E8's first half).
- **After one pointer click on `rev-b`'s rail card**: `activeElement` is `TEXTAREA.xterm-helper-textarea` whose `closest('[aria-label^="Terminal: "]')` is `Terminal: rev-b`; `.xterm.focus` is present (the plan's UI Specifications claim about the visible change — solid rather than hollow cursor — verified, and visible in the screenshot as a filled block); `activeElement.closest('[data-testid="session-card"]')` is `null`, so the card's focus ring is genuinely gone; `#mainhead .name` reads `rev-b`; exactly **1** `Terminal:` container in the DOM and **0** for `rev-a`.
- **Typing with no click on the pane**: `page.keyboard.type("reviewer-typed-this")` + Enter, and the pane rendered `reviewer-typed-this` on its own line followed by `stub-echo:reviewer-typed-this` — read off the screenshot, not just a `toContainText`. That is the bug from issue #11 closed end to end.
- Sizenote line still reads `130×25 · one live client · geometry owned by this pane` after the swap, and the masthead gauges still read `5h unknown / 7d unknown` (honesty rule 6) with `ctx unknown` on both cards.

Not verified in the browser by hand: the dead-card path (E5) and the drag paths (E6/INV-4) — both need multi-step daemon state I let the E2E specs establish; I read their assertions instead and they are specific (`#dead-surface` visible, `toHaveCount(0)` on the terminal container, `toBeFocused()` on the card).

## Test Quality

The `## Repairs` table has one entry and its claim holds: the pin-button assertion was changed from `toHaveText("Pin")` — which the icon-only button (accessible name in `aria-label`, empty text content) can never satisfy — to `toHaveAttribute("aria-pressed", "false")` before, and `cardB.getByRole("button", { name: "Unpin" })` with `aria-pressed="true"` after. That is **stronger**, not weaker: it now proves both the accessible-name flip and the pressed state, matching `rail-order.spec.ts:535`'s established pattern, and the test's REQ-5/INV-3 assertions (live pane stays on A, focus outside every terminal) are untouched. No `test.skip`, `test.fixme`, or `.skip(` anywhere in `web/e2e`. No container-level `toBeVisible()` stood in for a real assertion. No fixture drift: every payload builder used (`envelopedSessionStart`, `rawUserPromptSubmit`, `rawNotification`) is reused verbatim from the existing measured set in `helpers/payloads.ts`; no new wire shape was synthesized.

The two new helpers in `web/e2e/helpers/terminal.ts` implement the plan's named focus oracle exactly (`closest()` on the `aria-label` container via `page.evaluate`) and never reach into xterm internals, per M2's standing rule.

`web-tests`' decision to add no Vitest file is correct and well-argued, not a coverage dodge: `focus()`'s two-field guard reads private state that only exists after real xterm/WebSocket/DOM construction, `TerminalSurface` has never had direct Vitest coverage (the testable part was deliberately extracted to `terminal/overlay.ts`), and `sessions.test.ts`'s `FakeDomNode` dispatches no events, so W4/W5 are unreachable from Vitest. The plan's own Reviewer-Verified list pre-authorised exactly this split, and I have verified W1–W5 by reading.

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[orchestrator]** `TODO.md`'s #11 entry is still unticked and its body still asserts the bug in the present tense — "today it selects the session but keyboard focus stays put, so the pane needs a second click" — which is now false of the shipped behaviour. The plan's own Doc-upkeep section assigns this to the orchestrator; tick the box and drop (or past-tense) that sentence at Completion. Does not block approval.
2. **[orchestrator]** No `SPEC.md` §11 changelog line yet for this decision. The plan specifies its content: rail pointer click moves keyboard focus into the terminal; keyboard activation, ⌘1–9 and the Tiles strip deliberately do not; a dead session's card leaves focus in place. Orchestrator Completion step.

### Notes

1. **[note]** `ux-flows.md` §3.1's new clause ("Clicking a rail card swaps which session is live, and puts the cursor in the pane") is accurate for the live-pane case the **Main** bullet describes, but it is silent on the two deliberate carve-outs — a dead session's card, and Enter/Space activation. The plan asked for exactly one line and §3.1 is a shape sketch, not the behaviour spec, so I am not requesting a change; if the carve-outs ever need to be discoverable from the docs, §3.3 (rail card) is the place, not §3.1.
2. **[note]** REQ-4's prose lists "a view switch" among the paths that must never call `focus()`, and e2e-specs deliberately did not author a Focus→Tiles→Focus test, reasoning that INV-1's six named source states don't include it. I agree with the call and the invariant is anyway settled structurally rather than empirically: `TerminalSurface.focus()` has exactly one call site, so no view-switch path can reach it. Worth remembering that this particular guarantee rests on the call-site count, which is a reviewer check, not a gate — if a future plan adds a second call site, this reasoning stops holding.
3. **[note]** The E8 render-tick spec spends 5 s in two `waitForTimeout(2_500)` waits. That is the honest cost of proving "two full ticks changed nothing" and the suite still finishes in ~50 s, so it is not worth optimising — noting it only so a future flakiness/duration investigation knows the wait is deliberate.
4. **[note]** The rail card's click listener is wired once, at `buildSessionCardElement` time, capturing that render pass's closure; `reconcileCards` never rebuilds an existing card. The closure only reads module-level `focusedId`/`surfaces` and calls the module-level `render()`, so it cannot go stale — but that is the property that makes the widened `(id, source)` signature safe, and it is worth knowing if anyone later tries to make the callback capture per-render state.
