# Web Tests: shortcut-fixes

**Plan**: shortcut-fixes
**Verdict**: pass

## Summary

Tests created: 251 (new) | Passing: 996 (whole suite) | Failing: 0

New files/additions:
- `web/src/shortcuts.test.ts` — new file, 241 tests (matchShortcut + SHORTCUT_HELP; 192 of
  these are the generated W6/INV-2 loop).
- `web/src/sessions/sort.test.ts` — extended with 10 new tests for `pickNeediest` (existing
  `sortSessions`/`orderRail` tests untouched).

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|----------------|--------|
| `shortcuts.test.ts` | returns new-session for Opt+Cmd+N (W1) | W1 | pass |
| `shortcuts.test.ts` | returns focus-nth with n=%i for Opt+Cmd+%i (W2) ×9 | W2 | pass |
| `shortcuts.test.ts` | returns focus-neediest for Opt+Cmd+0 (W3) | W3 | pass |
| `shortcuts.test.ts` | returns toggle-view for Cmd+\ (REQ-10) | REQ-10 | pass |
| `shortcuts.test.ts` | returns launch-parent-dir for Cmd+ArrowUp (REQ-10) | REQ-10 | pass |
| `shortcuts.test.ts` | returns null for bare Cmd+N (W4) | W4 | pass |
| `shortcuts.test.ts` | returns null for bare Cmd+%i, no Opt held (W5) ×10 (0–9) | W5 | pass |
| `shortcuts.test.ts` | returns null for an unbound code (KeyA) | sanity | pass |
| `shortcuts.test.ts` | returns null for NumpadDigit1 even with bound modifiers (edge case 11) | edge case 11 | pass |
| `shortcuts.test.ts` | returns null for a bare modifier keydown (MetaLeft) | Matching note | pass |
| `shortcuts.test.ts` | returns null for every binding's code with no modifiers held | sanity | pass |
| `shortcuts.test.ts` | INV-2 loop: 12 bound chords × 16 modifier signatures (192 cases) | W6/INV-2 | pass |
| `shortcuts.test.ts` | matches Opt+Cmd+N/1/0 with dead-key `key` glyphs (˜/¡/º) | W16 | pass |
| `shortcuts.test.ts` | matches even when `key` is empty | W16 (robustness) | pass |
| `shortcuts.test.ts` | SHORTCUT_HELP is a non-empty array of {label, chord} strings | REQ-12 | pass |
| `sort.test.ts` | pickNeediest returns longest-blocked needs_input session | W7 | pass |
| `sort.test.ts` | pickNeediest falls through full state-priority order when nothing needs input | W7 (extra) | pass |
| `sort.test.ts` | pickNeediest returns null for empty store (edge case 3) | W8 | pass |
| `sort.test.ts` | pickNeediest returns null when none alive, doesn't fall through to most-recently-ended (edge case 4) | REQ-7/W8 | pass |
| `sort.test.ts` | pickNeediest ignores ended sessions when picking among alive ones | REQ-7 | pass |
| `sort.test.ts` | pickNeediest beats a session pinned to railPos 1 | W9/INV-4 | pass |
| `sort.test.ts` | pickNeediest picks target when a different session is pinned above it | INV-4 | pass |
| `sort.test.ts` | pickNeediest picks the same session whether or not the target itself is pinned | INV-4 | pass |
| `sort.test.ts` | pickNeediest does not mutate its input | hygiene | pass |

## W6/INV-2 loop detail

The bound-chord table (`BOUND_CHORDS` in `shortcuts.test.ts`) is an independent
transcription of the plan's Binding Table — it does not import or reuse `shortcuts.ts`'s
internal `BINDINGS` constant, since the point of the invariant test is to catch that table
drifting from the plan, not to restate the implementation. For each of the 12 bound chords
(⌥⌘N, ⌘\\, ⌘↑, ⌥⌘0, ⌥⌘1–9) the test iterates all 16 `{meta,alt,shift,ctrl}` boolean
combinations and asserts the action only fires on the exact bound signature, `null`
everywhere else — 192 generated cases.

## W16 detail

`shortcuts.test.ts`'s dead-key tests construct `KeyboardEvent`-shaped objects with the
bound `code` (`KeyN`, `Digit1`, `Digit0`) but `key` set to the actual macOS ⌥ dead-key
glyph (`"˜"`, `"¡"`, `"º"`) rather than the plausible ASCII character every other test in
the file uses. Since Playwright cannot emulate this transform (per the plan's
Implementation Notes), this is the only place in the whole pipeline that proves
`matchShortcut` is reading `event.code` and not incidentally passing because tests always
send a friendly `key`.

## Declined coverage (per plan's routing, not this agent's to cover)

- **INV-1** (no browser-reserved chord) — plan and e2e-specs.md both mark this
  Reviewer-Verified against `spikes/S5-key-probe.md`; not machine-verifiable by either
  suite. No unit test claims to cover it.
- **W10** (no `any` types in new web code) — Reviewer-Verified per plan; `npx tsc --noEmit`
  (run above, clean) is consistent with it but the plan doesn't route this to web-tests.
- **W11** (neither global matcher reads `event.key`) — this is also W11/W12's automated
  negative-grep check (`plan.md`'s `checks` block), re-verified directly above (`rg`
  exits 1 for both patterns against `web/src/`). Read `web/src/shortcuts.ts`,
  `web/src/main.ts`, and `web/src/render/launch.ts` in full: the only `event.key` reads
  left are `render/launch.ts`'s listing arrow-key navigation
  (`event.key === "ArrowDown"`/`"ArrowUp"`/`"Home"`/`"End"`), which the plan explicitly
  scopes out ("element-scoped handlers for unmodified keys ... no part of this plan's
  binding table"). No unit test needed beyond the grep.
- **Dispatch/DOM logic in `main.ts`** (`focusSession`, `focusNth`, `focusNeediest`,
  `isBlockingDialogOpen`, `promoteSession`) and `render/launch.ts`'s dialog-guard —
  these call `store`, `render()`, `document.querySelectorAll`, and are neither exported
  nor pure; per `docs/conventions.md` this is rendering/interaction, Playwright's job
  (and indeed `web/e2e/shortcuts.spec.ts` + the repointed existing specs cover E1–E10,
  edge cases 2–8, INV-3/INV-5). Not a violation to leave uncovered here — REQ-5/REQ-6's
  actual selection logic (`orderRail`, `pickNeediest`) is pure and is covered above; only
  the DOM glue around them is E2E's.
- **Edge case 8** (session shortcuts no-op under a non-launch modal) — Reviewer-Verified
  per plan; also DOM-tangled (`isBlockingDialogOpen` reads `document.querySelectorAll`),
  consistent with the previous bullet.

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  27 passed (27)
      Tests  996 passed (996)
   Duration  1.42s

$ npm run build
> tsc --noEmit && vite build
✓ 41 modules transformed.
✓ built in 188ms

$ rg -n 'event\.key\.toLowerCase\(\)' web/src/   -> exit 1 (no match)
$ rg -n 'Number\(event\.key\)' web/src/          -> exit 1 (no match)
$ rg -n 'press\("Meta\+n"\)' web/e2e/            -> exit 1 (no match)
$ rg -n 'press\("Meta\+[0-9]"\)' web/e2e/        -> exit 1 (no match)
```
