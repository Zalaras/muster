# Web Implementation: new-ui-design-colors

**Plan**: new-ui-design-colors
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/style.css` | rewritten (token section) + edited | REQ-1/2/3: two-layer token architecture — bare `:root` font stacks, three `[data-theme]` palette blocks transcribed verbatim from `docs/design/mockups/a-instrument.html` (W11), two terminal-pair blocks keyed by `data-claude-family`. Global rename of every old token name (`--ink`→`--bg` etc., `--panel2` before `--panel`) across the whole file. `--well` applied to chrome recesses (`.placeholder`, `.snapshot.ended`, `.browse`, form inputs, `#issue-preview`, `#issue-error-detail`); `--edge` applied to input/select/textarea/`.seg-track` borders. `.btn.key`'s hard-coded `color: var(--ink)` fixed to `var(--amber-fg)` (the blanket rename would otherwise have left it `var(--bg)`). Added `.btn:disabled` (REQ-8, placed after every `.btn.*` colour rule so it wins the cascade tie), `:hover:not(:disabled)` on both `.btn` hover rules, ghost-danger fill-on-hover (`.btn.danger:hover:not(:disabled)`), and `#settings-form.fields`/`#settings-form .hint` layout rules for the new dialog. |
| `web/src/theme.ts` | created | REQ-7: `THEMES`/`ThemeName`/`ThemeChoice` registry, pure `resolveTheme(choice, family)`, and `readThemeHint`/`writeThemeHint` (REQ-11) against `localStorage["muster.theme-hint"]`. |
| `web/src/render/settings.ts` | created | REQ-9: `initSettingsDialog` — DOM + wiring only (open/close/setChecked), modelled on `render/confirm.ts`'s controller shape. No store access; `onChooseTheme` fires immediately on radio change (no Save). |
| `web/src/protocol.ts` | edited | `Prefs.theme: string` (REQ-19 default `"follow"`), `ClaudeFamily`/`ClaudeThemeInfo`/`Snapshot.claudeTheme` (REQ-19 default `{family:"unknown"}`), `ClaudeThemeMessage` (flat `{type,family}` per §5.6 — deliberately NOT nested like the snapshot field), parsers, `Message` union. |
| `web/src/api.ts` | edited | `PrefsRequest.theme?: string`. |
| `web/src/ws.ts` | edited | `onClaudeTheme?: (family) => void` handler + dispatch case. |
| `web/src/terminal/pane.ts` | edited | Constructor's xterm theme now reads `--term-fg` (was `--paper`) for the foreground; added `applyTheme()` (REQ-12) which re-reads `--term`/`--term-fg` and reassigns `term.options.theme` in place — never recreates the `Terminal`. |
| `web/src/main.ts` | edited | `themeChoice`/`claudeFamily` state (defaults `"follow"`/`"unknown"`, never applied before the first real message — preserves REQ-11's hint-painted first frame), `applyThemeAttributes()` (sets both `data-*` attributes via `resolveTheme`, fans out `applyTheme()` to every live surface, writes the hint), `requestTheme()`, Settings dialog wiring (`#settings-button`/`#settings-dialog`), `settingsDialog.close()` added to the daemon-down path, `applyPrefsFromSnapshot` now adopts `prefs.theme` and calls `setChecked` (INV-7), `onSnapshot`/`onPrefs`/`onClaudeTheme` handlers call `applyThemeAttributes()` per REQ-12/INV-2 (a `prefs` message never touches `claudeFamily`; `claudeTheme` never touches `themeChoice`). |
| `web/index.html` | edited | REQ-11 inline `<head>` hint script (plain, non-module, try/catch, before the stylesheet `<link>`); `#settings-button` after `#issue-button`; `#settings-dialog` markup exactly per the plan's pinned DOM. |
| `web/scripts/contrast.mjs` | created | REQ-4/6: Node-stdlib-only gate. Strips comments up front (several `:root` blocks are directly preceded by explanatory comments, which would otherwise defeat the `startsWith(":root")` selector check and also false-positive the named-colour scan on prose like "amber, rose, violet, teal"). Parses every top-level `:root...{...}` rule, harvests the three `[data-theme]` blocks' token maps, computes WCAG relative-luminance contrast per `contrast-pairs.json` pair, checks hue bands/saturation ceilings, then scans everything outside those six root blocks for hex/`rgb()`/`rgba()`/`hsl()`/named-colour literals (stripping `var(...)` refs and the legitimate `white-space` property first to avoid false positives). Prints `<theme> <fg> on <bg> <ratio> (min <n>)` per failure, a per-theme summary line on success (REQ-20), exits non-zero on any failure. |
| `web/scripts/contrast-pairs.json` | created | REQ-5/6: 43 pairs (31 text ≥4.5:1, 12 non-text ≥3:1) per Implementation Notes' list; the exempt list, exactly REQ-5's six entries with reasons; hue bands for amber/rose(wrapping)/violet/teal; saturation ceiling for idle. |
| `web/package.json` | edited | `"contrast": "node scripts/contrast.mjs"`. |
| `Makefile` | edited | New `contrast` target; `check: lint test contrast` (was `lint test`). |

## Decisions

- **`--danger`/`--danger-line`/`--danger-fg` values changed from the pre-plan bare-root values** (`#c94f4f`/`#7a3535`/`#fff`) to the mockup's per-theme values (`#c24646`/`#7a3535`/`#ffffff` instrument+dark, `#b23838`/`#8c2b2b`/`#ffffff` light). This is REQ-2/W11's explicit contract (mockup is the authority, transcribed verbatim) — not a bug, just flagging the visible change.
- **rgba()/decimal formatting**: I wrote the three theme blocks' `--scrim`/`--bg-raised-95` values as `rgba(8, 9, 13, 0.72)` (spaced, leading zero) rather than the mockup's compact `rgba(8,9,13,.72)`. Numerically identical; matches this file's own pre-existing formatting convention for the same two tokens (verified: the original `style.css` already wrote `--scrim: rgba(8, 9, 13, 0.72);` and `--panel-95: rgba(23, 26, 36, 0.95);` in this exact spaced/leading-zero style before my edit). `contrast.mjs`'s `parseColor` accepts both forms so this doesn't affect W3.
- **`--green` intentionally left undeclared** in all three `style.css` theme blocks even though the mockup declares it in each — per Implementation Notes ("`--green` stays declared in the mockups... and undeclared in `style.css`... it arrives with its first real consumer"), continuing the m1-sessions Minor 5 precedent already documented in the pre-plan file.
- **`#settings-form.fields`/`#settings-form .hint` are new CSS rules**, not a reuse of the existing `#launch-form .fields` rule — that rule is ID-scoped to the launch dialog specifically (confirmed via `grep -n "#launch-form .fields"`: only one such rule exists, and the bare `.fields` class elsewhere only carries child-selector rules like `.fields .lab`, never the grid `display` itself). I added a same-shaped grid rule scoped to `#settings-form`, plus a `.hint` rule that spans both grid columns (`grid-column: 1 / -1`) so the hint paragraph reads as a full-width line under the Theme row rather than misplacing into column 1 via the grid's implicit auto-placement.
- **`.btn:disabled` placed after `.btn.key`, `.btn.key-danger`, `.btn.danger:hover`, `.btn.sm`** (verified via `grep -n` — lines 1313/1382/1392/1398/1410 in that order) rather than immediately after the base `.btn`/`.btn:hover` rules. `.btn.key`/`.btn.key-danger` both set `color`+`background` at the same specificity (0,2,0) as `.btn:disabled`; CSS resolves the tie by source order, so the disabled rule must come later in the file to actually override the filled variants. This differs from the mockup's own approach (a compound `.btn:disabled,.btn.key:disabled` selector, which wins via higher specificity on the second half regardless of order) — I used single-selector-plus-ordering instead because the plan's REQ-8 text asks for "one rule set: `.btn:disabled`", not a compound one per variant.
- **Settings button carries no `aria-label`** (unlike `#issue-button`, which needs one because its visible text "Issue" differs from its required accessible name "File an issue"). The Settings button's visible text is already "Settings", matching the Testable UI Elements table's required name exactly, so an aria-label would be redundant.
- **Testable UI Elements table**: every row was implementable as specified — none needed a workaround or substitution.

## Handoff

**Build status**: NOT BUILDING — `npx tsc --noEmit` (and therefore `npm run build`) fails with exactly two errors, both pre-existing and out of my edit scope:
```
src/ws.test.ts(16,3): error TS2741: Property 'theme' is missing in type '{ view: "focus"; density: "2x2"; usageModel: string; railSort: "manual"; }' but required in type 'Prefs'.
src/ws.test.ts(21,3): error TS2741: Property 'theme' is missing in type '{ view: "tiles"; density: "3x2"; usageModel: string; railSort: "manual"; }' but required in type 'Prefs'.
```
This is the sanctioned-breakage case from my constraints: REQ-19 requires `Prefs.theme`/`Snapshot.claudeTheme` to be **required** fields (matching the wire's "always present" contract, docs/protocol.md §5.2/§5.5), and `web/src/ws.test.ts` declares two typed literals (`const snapshot: Snapshot = {...}` at line 12, `const prefsMessage: PrefsMessage = {...}` at line 19) predating this plan. I confirmed via `npx vite build` (run directly, bypassing the `tsc` gate) that the actual shipped code compiles and bundles cleanly — the break is isolated entirely to this one test file's fixtures.

**Test files needing changes I was not allowed to make** (both in `web/src/ws.test.ts`):
- Line 16: `prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual" }` needs `theme: "follow"` added.
- Line 21: `prefs: { view: "tiles", density: "3x2", usageModel: "Opus", railSort: "manual" }` needs `theme: "follow"` added.
- Line 12–17's `snapshot: Snapshot` object additionally needs a top-level `claudeTheme: { family: "unknown" }` — `tsc` didn't surface this as a separate diagnostic (it appears to stop enumerating top-level missing-property errors once a nested property, `prefs`, already has its own type mismatch), but it is required by the type and will surface once `theme` is added.

Also `npm test` (Vitest, not part of the hard gate but recorded for web-tests): **12 pre-existing tests now fail** — 11 in `web/src/protocol.test.ts`, 1 in `web/src/ws.test.ts` — all `toEqual`/`toHaveBeenCalledWith` assertions against frozen fixtures that predate `theme`/`claudeTheme` and now need those two fields added to their expected values, the same pattern this file's own comments already document for `usageModel`/`railSort`'s prior additions. Full list (`npm test 2>&1 | grep FAIL`):
```
protocol.test.ts > parseMessage — snapshot > parses the M0 empty-sessions, null-usage snapshot
protocol.test.ts > parseMessage — snapshot > parses a snapshot with a populated usage bucket
protocol.test.ts > parseMessage — snapshot > parses a snapshot whose usage carries the M3 model field (REQ-11/12)
protocol.test.ts > parseMessage — snapshot > parses prefs.density '3x2' alongside an explicit usageModel (plan usage-model-bar REQ-8)
protocol.test.ts > parseMessage — snapshot > defaults a missing prefs.usageModel to 'Fable' (pre-plan daemon payload, plan usage-model-bar REQ-8)
protocol.test.ts > parseMessage — snapshot > ignores unknown fields inside usage and prefs (additive evolution)
protocol.test.ts > parsePrefs — railSort (plan order-sidebar REQ-5/§3.3) > defaults a missing railSort to 'manual' (pre-plan daemon payload)
protocol.test.ts > parsePrefs — railSort (plan order-sidebar REQ-5/§3.3) > parses an explicit railSort of 'attention'
protocol.test.ts > parseMessage — prefs (M2 REQ-10/INV-4: the PUT /api/prefs echo broadcast) > parses a fully-populated prefs message
protocol.test.ts > parseMessage — prefs (M2 REQ-10/INV-4: the PUT /api/prefs echo broadcast) > ignores unknown fields inside prefs (additive evolution)
protocol.test.ts > parseMessage — snapshot with sessions (M1: non-empty for the first time) > parses a snapshot with multiple valid sessions
ws.test.ts > WsClient — full socket lifecycle via an injected fake socket > dispatches a prefs frame to onPrefs
```
594 other tests pass unchanged.

**Verified separately** (not part of the hard gate, run for confidence since `tsc` blocks the normal path): `npx vite build` (direct, no `tsc`) succeeds — HTML/CSS/module wiring is sound. `make contrast` / `node web/scripts/contrast.mjs` passes: `instrument: 43 pairs, 0 failures`, `dark: 43 pairs, 0 failures`, `light: 43 pairs, 0 failures`. W4/W5 negative-grep checks pass, **except** one W4 hit I cannot fix: `web/e2e/sessions.spec.ts:351` has a comment mentioning `--dim` (`// "ended" treatment is a pure visual cue (design-system --dim, no pinned role/text)`) — that file is owned by e2e-specs and out of my edit scope; flagging for the orchestrator/e2e-specs to update the comment's stale token name.
