# Web Implementation: shortcut-fixes

**Plan**: shortcut-fixes
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/shortcuts.ts` | created | REQ-3: the whole binding table + `matchShortcut(event): ShortcutAction \| null`, matching on `event.code` and an exact 4-modifier signature (INV-2). Also exports `SHORTCUT_HELP` (REQ-12, label+chord data, no overlay built). |
| `web/src/sessions/sort.ts` | modified | Added `pickNeediest(sessions)` — `sortSessions(sessions.filter(s => s.alive))[0] ?? null` (REQ-6/REQ-7/INV-4), next to `orderRail`. |
| `web/src/main.ts` | modified | Replaced the inline `event.key`/`Number(event.key)` keydown matcher with a `matchShortcut` dispatch (`toggle-view`, `focus-nth`, `focus-neediest`); added `focusSession`/`focusNeediest`; added `isBlockingDialogOpen()` for edge case 8 (session-focus shortcuts no-op under any modal `<dialog>` other than launch); fixed `focusNth`'s doc comment (order-sidebar follow-up 4) and three other stale `⌘1`/`⌘N` comments. |
| `web/src/render/launch.ts` | modified | Collapsed the two separate `⌘N`/`⌘↑` window listeners into one `matchShortcut` dispatch (`new-session`, `launch-parent-dir`); dropped the "always swallow the browser's own Cmd+N" comment/behaviour (REQ-2) — a bare `⌘N` no longer matches any binding, so this listener never sees it. |
| `web/index.html` | modified | `#main-empty`, `#tiles-empty`, and the launch dialog's `.kbd` chip: `⌘N` → `⌥⌘N` (REQ-9). |
| `docs/design/design-system.md` | modified | §4.1 keyboard line: `⌘1–9` → `⌥⌘1–9`, added the `⌥⌘0` sentence. |
| `docs/design/ux-flows.md` | modified | §1 mockup line, §3.7 New-session-in-Tiles line, §3.8, §4 scope note: all `⌘N`/`⌘1–9` references updated to `⌥⌘N`/`⌥⌘1–9`, `⌥⌘0` added where the plan calls for it. |

## Decisions

- The Binding Table's two *unchanged* bindings (`⌘\` toggle-view, `⌘↑` launch-parent-dir) were also folded into `shortcuts.ts`'s `matchShortcut`, per REQ-3 ("main.ts and render/launch.ts dispatch from it; neither matches keys itself") and the Affected Files note that the `⌘↑` handler "dispatches from it too". Their chords are unchanged; only where the matching code lives moved.
- `render/launch.ts`'s two former window-level listeners (`⌘N`, `⌘↑`) are now one listener switching on the matched action — Binding Table's "Dispatch site" column assigns both to this file, and one listener is simpler than two now that both route through the same `matchShortcut` call.
- Edge case 8 (session shortcuts no-op under a non-launch modal dialog): implemented as `isBlockingDialogOpen()` in `main.ts` — `document.querySelectorAll("dialog[open]")` filtered to exclude `#launch-dialog` by id, applied only to `focus-nth`/`focus-neediest` (not `toggle-view`, which the plan's wording ("session-focusing shortcuts") and prior behaviour don't cover). `preventDefault()` still fires unconditionally for a matched action (REQ-8) even when the guard no-ops the actual effect.
- REQ-12 (nice-to-have): added `SHORTCUT_HELP` as a small standalone array (label+chord strings) rather than deriving it from `BINDINGS`, since folding the 9 `focus-nth` digit bindings back into one `⌥⌘1–9` display row would need more machinery than a nice-to-have with no consumer yet justifies.
- Fixed three more stale `⌘1`/`⌘N` comments beyond the plan's named line numbers (`main.ts:395` `promoteSession` doc comment, `main.ts:874` a comment on the click-vs-shortcut focus distinction) — found via `grep -n "⌘N\|⌘1" web/src`, not otherwise called out in Affected Files.
- `SPEC.md` and `TODO.md` are untouched per the plan's own routing ("not listed under an impl track — see Implementation Notes → Doc upkeep").

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.

**Automated Checks run**: W11/W12 (negative greps on `web/src/`) pass — 0 matches. W17 (`make web-build`) and the underlying `vitest run` (746 tests, 26 files) pass.

**Plan's own E2E specs run** (`make web-build build`, then `npx playwright test e2e/shortcuts.spec.ts e2e/launch.spec.ts e2e/views.spec.ts e2e/rail-order.spec.ts e2e/focus-marker.spec.ts e2e/permission-mode.spec.ts`): 92/93 passed. W13/W14's target files (`launch.spec.ts`, `views.spec.ts`, `rail-order.spec.ts`, `focus-marker.spec.ts`, `permission-mode.spec.ts`) are all green, including every repointed `Alt+Meta+...` press.

**One failure — locator defect in the spec, not my code**: `e2e/shortcuts.spec.ts:246` "pressing Opt+Cmd+0 in Tiles does not demote another tile when the neediest session is already live (edge case 6)". It calls `stateBadge(liveTile(page, targetTitle))` and expects visible text `/needs input/i` inside a **live tile**. Live tiles never render that visible state-word text — `render/tiles.ts:67` only sets it as the state dot's `title` attribute (`stateBadgeText`, checked elsewhere via `.sdot`'s `title`, e.g. `views.spec.ts`'s passing "a tile's state dot title tracks the state word" test). `stateBadge()` is built for rail/strip cards, which do render that word as visible text (`sessions/card.ts`'s `badge`/`BADGE_TEXT`) — the two other `makeNeedsInput` assertions in this same file target a **strip card** (`stripCard(...)`, not a live tile) and pass. I did not touch `render/tiles.ts` or `sessions/card.ts` in this plan, and confirmed via `grep` that neither file appears in my diff — this is a pre-existing architectural fact the test's author didn't account for when reusing `stateBadge()` against a live-tile locator. Reran 3x (`--retries=2`), fails identically every time — not a flake.
  - **Fix for validate mode**: assert the dot's `title` (e.g. `liveTile(page, targetTitle).locator(".sdot")` → `toHaveAttribute("title", /needs input/i)`) instead of `stateBadge(liveTile(...))`.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: [web-impl] Major — `docs/design/mockups/a-instrument.html:541` and `docs/design/mockups/d-tiled.html:334,360,382,404,427,453` still showed the old `⌘N`/`⌘<n> focus`/`⌘5 resume` chords, contradicting `design-system.md`'s own reference-render pointers and this plan's `⌥⌘1–9` edit to §4.1.

**Changes made**:
- `docs/design/mockups/a-instrument.html:541` — `New session ⌘N` → `New session ⌥⌘N` (text only, same `<button>` markup).
- `docs/design/mockups/d-tiled.html` — six tile-footer `.sp` spans, text only:
  - line 334 `⌘1 focus` → `⌥⌘1 focus`
  - line 360 `⌘2 focus` → `⌥⌘2 focus`
  - line 382 `⌘3 focus` → `⌥⌘3 focus`
  - line 404 `⌘4 focus` → `⌥⌘4 focus`
  - line 427 `⌘5 resume` → `⌥⌘5 resume`
  - line 453 `⌘6 focus` → `⌥⌘6 focus`

**Evidence** — `grep -rn '⌘[1-9N]' docs/design/` after the fix returns only the two deliberately-excluded rejected-direction files, plus `design-system.md`/`ux-flows.md` lines that already read `⌥⌘...` (matched by the character class, not stale):
```
docs/design/mockups/b-editorial.html:308:  <button class="btn" onclick="document.body.classList.toggle('is-new')">New session ⌘N</button>
docs/design/mockups/c-terminal.html:265:  <button class="btn" onclick="document.body.classList.toggle('is-new')">new session ⌘N</button>
docs/design/design-system.md:154:- Keyboard: **⌘\\** toggles. `⌥⌘1–9` keeps its meaning in both views — focus session *n*,
docs/design/ux-flows.md:33:New session                                       ⌥⌘N
docs/design/ux-flows.md:298:  it opens the §1 modal exactly as the rail button and ⌥⌘N do. A session launched while in
docs/design/ux-flows.md:304:- Masthead segmented control, or **⌘\\**. `⌥⌘1–9` keeps meaning in both views: focus session
docs/design/ux-flows.md:324:- Keyboard model beyond ⌥⌘1–9/⌥⌘0 focus and ⌥⌘N new session.
```
No markup, layout, colour or token changes were made in either file. `b-editorial.html:308` and `c-terminal.html:265` (rejected directions from the 2026-08-16 comparison) were left untouched per the review's explicit instruction.

**Build status**: unchanged — this fix touches only static HTML mockup files under `docs/design/mockups/`, not `web/src`, so `npx tsc --noEmit` and `npm run build` are unaffected (still exit 0 per the initial Handoff).
