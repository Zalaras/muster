# Web Implementation: m1-sessions

**Plan**: m1-sessions
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | modified | Full §5.3 `Session` validation (`parseSession`, exported), `firstLaunchHere`, `sessionUpsert` message type + parser. Replaces the M0 "trust the array" stopgap. |
| `web/src/ws.ts` | modified | `onSessionUpsert` handler; `dispatch()` routes `type:"sessionUpsert"` before falling through to snapshot. |
| `web/src/api.ts` | created | Cookie-authed fetch wrappers + pure parsers for `POST /api/sessions`, `GET /api/repos`, `GET /api/browse`; `ApiResult<T>` discriminated union so the modal never throws on a 4xx/5xx. |
| `web/src/sessions/store.ts` | created | `SessionStore`: snapshot replace + upsert merge, keyed by `id`. |
| `web/src/sessions/sort.ts` | created | `sortSessions` — REQ-16's pure sort (needs_input longest-blocked → failed most-recent → planning/working/started `stateSince` asc → idle longest-idle), tiebreak by `id`. |
| `web/src/sessions/format.ts` | created | `elapsedSeconds`, `formatTimer` (MM:SS/Nh/Nd), `formatAge` (MRU list ages) — pure, Vitest-ready. |
| `web/src/sessions/card.ts` | created | `buildCardViewModel` — pure per-card view-model (title/badge/timer/repo-line/context text/activity/note), including the honesty rules (unknown context, raw failure token, REQ-17 trust/no-signal notes) and REQ-15's "untitled" fallback. |
| `web/src/render/sessions.ts` | modified | Real rail cards, built from `#session-card-template` + `buildCardViewModel`; kept the same `(el, sessions)` signature (with an optional `now` param) so the empty-state branch stays byte-identical to M0. Replaces the "N sessions" stub in the non-empty branch. |
| `web/src/render/launch.ts` | created | Launch modal wiring: MRU list, folder browser (Browse…/Up/subdirectory/Use this folder), form (title/model radios+custom/start-in radios), submit → `api.launchSession`, inline error display. No session-store access — hands the parsed `Session` back via `onLaunched`. |
| `web/src/render/masthead.ts` | modified | Added `renderViewSwitcherSlot` (no-op render, documents that M1 keeps the slot empty). |
| `web/src/main.ts` | modified | Wires `SessionStore`, `sortSessions`, the 1s rail tick, `onSessionUpsert`, and `initLaunchModal`. |
| `web/index.html` | modified | Full M1 layout: masthead view-switcher slot, rail (`New session` button + cards container), main placeholder panel, launch `<dialog>` with MRU/browse/form markup, and `<template>`s for session cards / MRU entries / subdirectory entries. Preserves every M0 id/role (`#connection-status[role=status]`, `#banner[role=alert]`, `<h1>Muster</h1>`, "No sessions yet") that `auth.spec.ts`/`shell.spec.ts`/`resilience.spec.ts` depend on. |
| `web/src/style.css` | modified | Full design-system §1 token set (added `--panel2`, `--term`, `--line2`, `--violet`, `--teal`, `--idle`, `--green`, plus new `--border-*`/`--note-fg-*` tokens for shades the official list didn't carry); rail/card/badge/stripe/note/activity styles; button/modal/picker/browse-panel/radio styles; `.card.ended{opacity:.55}` for the degraded-session visual cue. |

## Decisions

- **`render/sessions.ts` keeps its original `(el, sessions)` arity** (adding only an optional third `now` param) specifically so the existing `render/sessions.test.ts` stays type-compatible — it still compiles, but its two "pre-M1 fallback" assertions (which pinned the M0 "N sessions" placeholder text) now fail at runtime with `ReferenceError: document is not defined` (jsdom has no `#session-card-template` and the fake `HTMLElement` stub has no `querySelector`). Confirmed via `npm test`: `Test Files  1 failed | 4 passed (5)`, `Tests  2 failed | 60 passed (62)`, both failures in exactly those two cases. This is expected — the plan explicitly calls for real cards to replace the stub — and is web-tests' fix, not mine (see Handoff).
- **Testable UI Elements table honoured exactly**, with one implementation note: the model/start-in radios are implemented as real native `<input type="radio">` elements (per the table's explicit "native radio inputs" note), not the mockup's fake `<i>`-circle spans in `a-instrument.html`. This is a deliberate divergence from the mockup's markup (not from the table, which mandates the native `role="radio"` semantics) — flagging because native radio buttons render with browser-native rounded chrome, which is outside the app's own "no border-radius above 2px" CSS rule (that rule targets app-drawn boxes/buttons, not OS form-control chrome). No table row was left unimplemented.
- **`data-testid="session-card"` added to the card root**, matching what `web/e2e/helpers/session.ts`'s `sessionCard()` already looks for (it was authored before I wrote the markup, per the plan's "locator strategy is e2e-specs' call"). Verified by reading that helper rather than assuming.
- **Card note slot is single (`.note`)**, mutually exclusive by construction: attention only exists in `needs_input`, failure only in `failed`, and the trust/no-signal note only in `started` with no `claudeSessionId` — so one slot never needs to arbitrate between two simultaneous notes.
- **Worktree marker rendered as a plain `" (worktree)"` suffix** on the repo/branch line — the plan requires a marker but doesn't pin its text (no Testable UI Elements row), so this is a free choice.
- Kept `web/playwright.config.ts` untouched — no config change was needed or requested by the plan or by e2e-specs' log.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` (`web/`) both exit 0.

**Test files needing changes I was not allowed to make**:
- `web/src/render/sessions.test.ts` — its two non-empty-list cases (`"renders a count placeholder for a non-empty list (pre-M1 fallback)"`, `"renders the singular count for exactly one session"`) assert the superseded M0 stub text (`"3 sessions"`, `"1 sessions"`). They now throw (`document is not defined`, since the non-empty branch needs a real DOM `<template>` and `document.getElementById`) rather than failing an assertion, but either way they need rewriting to build a real `Session` fixture (not `{} as Session`) and either drive real `#session-card-template` DOM (jsdom test environment) or assert against `buildCardViewModel` directly. This is exactly the kind of M0→M1 test rewrite the plan anticipated for `render/sessions.ts`.
- No other existing test file's assertions were invalidated — `protocol.test.ts`, `masthead.test.ts`, `banner.test.ts`, `ws.test.ts` all still pass unchanged (60/62 total), confirming the additive changes to `protocol.ts`/`ws.ts`/`masthead.ts` didn't touch any behavior those tests pin down.

**New logic needing Vitest coverage** (for web-tests to add, not a build blocker): `sessions/sort.ts` (`sortSessions`), `sessions/format.ts` (`formatTimer`/`formatAge`/`elapsedSeconds`), `sessions/card.ts` (`buildCardViewModel` — especially the honesty-rule branches: unknown context, raw failure token, trust-prompt vs. no-signal timing), `sessions/store.ts` (`SessionStore`), and `protocol.ts`'s new `parseSession`/`sessionUpsert` parsing (mirroring the existing `hello`/`snapshot` test style).

## Fix Attempt 1

**Failures addressed**: `launch.spec.ts:24:1` — "New session opens a modal exposing every Testable UI Element (REQ-14, W4)" — bug row "Custom model input is visible even when 'other' is not selected" (route `[web-impl]`).

**Changes made**: `web/src/style.css` — added a compensating `.field-row[hidden] { display: none; }` rule directly after the existing `.field-row { display: grid; ... }` rule (around line 520-528). The `#custom-model-row` element (`<div id="custom-model-row" class="field-row" hidden>` in `web/index.html:77`) carries both classes, and the author-origin `.field-row` rule's `display: grid` was overriding the UA default `[hidden] { display: none }` regardless of the `hidden` attribute, since every other conditionally-hidden element in the stylesheet (`.banner`, `.activity`, `.note`, `.browse-panel`, `.launch-error`, `#protocol-mismatch`) already has this exact compensating pattern and `.field-row` was the one omission. Verified the JS side (`web/src/render/launch.ts`'s `updateCustomModelVisibility()`, called on `openButton` click via `resetForm()` → `setModel("sonnet")` and on every model-radio `change` event) was already correct — it toggles `elements.customModelRow.hidden` correctly; this was purely a CSS specificity gap. No TypeScript changes were needed.

**Verification**: `npx tsc --noEmit` exits 0; `npm run build` exits 0 (`vite build` succeeds, emits `dist/`).

## Fix Attempt 2 (review cycle 1, wave 1)

**Failures addressed**: all `[web-impl]` findings in `plans/m1-sessions/review.md` — Majors 1–7, Minors 1, 4–10.

**Changes made**:

| # | File | Change |
|---|------|--------|
| Major 1 | `web/src/style.css` | `.launch-error` now uses `color: var(--banner-fg)` instead of `var(--rose)` — an HTTP error from `POST /api/sessions` isn't the Failed session state; reused the banner's tone rather than adding a near-duplicate token, per the review's explicit "add a token (or reuse `--banner-fg`)". |
| Major 2 | `web/src/style.css` | Added `--scrim: rgba(8, 9, 13, 0.72)` to `:root`; `dialog#launch-dialog::backdrop` now reads `background: var(--scrim)`. |
| Major 3 | `web/src/style.css` | Added `font-variant-numeric: tabular-nums` to `.r3` (the context row). |
| Major 4 | `web/src/sessions/card.ts` | `attentionNote(session, now)` now appends `` — ${formatTimer(session.attention.since, now)}`` to the reason text, driven by `attention.since` (not `stateSince`) per the plan and the design-system §3 escalating-timer requirement. `buildCardViewModel` passes `now` through. |
| Major 5 | `web/index.html`, `web/src/render/launch.ts`, `web/src/style.css` | Added a `.dir-path` span to `#mru-entry-template` (ordered name/path/branch/age per the plan); `renderMruList` populates it with `repo.path`. New `.dir-name` (flex:none, `--paper`) and `.dir-path` (flex:1, min-width:0, ellipsis, `--dim`) rules. |
| Major 6 | `web/src/render/launch.ts` | `renderBrowse` now sets `button.textContent = dir.isGit ? \`${dir.name} (git)\` : dir.name` — additive marker text, button name still contains the directory's own name per the Testable UI Elements table. |
| Major 7 | `web/src/render/launch.ts` | `loadBrowse`/`loadRepos` now call `showError(result.error.message)` on the `!result.ok` branch (previously silent); success branches call `clearError()` so a stale error doesn't linger once a retry succeeds. |
| Minor 1 | `web/src/render/launch.ts` | Implemented REQ-22: factored the open-button click handler into `openModal()` (guarded against double-`showModal()` via `dialog.open`), and added a `window` `keydown` listener firing on `metaKey + "n"` (no shift/alt) that calls it — per the instruction to prefer implementing over dropping. |
| Minor 4 | `web/src/style.css` | `.card .stripe`'s un-overridden default now reads `var(--dim)` instead of `var(--idle)` — every state class still overrides it, so this only changes the (currently unreachable) inert default. |
| Minor 5 | `web/src/style.css` | Removed the unused `--green` declaration, replaced with a comment explaining it has no M1 consumer (no health dot, no tool-success surface in scope) and should be reintroduced with its first real consumer rather than guessed now. Chose removal over porting the health dot because no REQ in this plan calls for one and grafting a new masthead element risked touching `#connection-status`, which `auth.spec.ts`/`shell.spec.ts` already pin. |
| Minor 6 | `web/index.html` | Added `role="alert"` to `#launch-error`, mirroring `#banner`'s existing pattern. |
| Minor 7 | `web/index.html`, `web/src/main.ts` | Added `role="alert" tabindex="-1"` to `#protocol-mismatch`; `showProtocolMismatch()` now calls `mismatchEl.focus()` after un-hiding it. |
| Minor 8 | `web/src/style.css` | Removed `.view-switcher`'s `border: 1px solid var(--line2)` — the 104×22 box is still reserved (design-system §8), just no longer drawn as a phantom control. |
| Minor 9 | `web/src/render/sessions.ts` | `buildCardElement` now sets `card.setAttribute("aria-label", vm.title)`, giving the card root an accessible name; `web/index.html`'s `.timer` span in `#session-card-template` gained `aria-label="time in state"`. |
| Minor 10 | `web/src/sessions/card.ts` | Added a `TODO(M3)` comment on `contextText` citing design-system §6.2 (never a bare percentage — pair with absolute tokens and compaction count) for when `usedPct`/`totalInputTokens`/`windowSize` get populated. |

**Decisions**:
- Minor 5: removed `--green` rather than porting a health dot — see table above. This is a token-declaration choice only; no visible UI changed.
- Minor 9 fix is intentionally minimal (an `aria-label` on the existing `<article>`, an `aria-label` on the existing `<span class="timer">`) rather than restructuring the card into a semantic heading, since the review itself calls this "harmless in M1" and the plan's Testable UI Elements table imposes no role/name requirement on the card root beyond "contains the title."
- Major 6's `(git)` suffix and Major 5's path span are additive text only — no existing Testable UI Elements table row's required name/role changed, per this fix cycle's explicit instruction that additive text (path spans, git markers, timers) is fine.

**Test files left red by this fix cycle (not mine to edit under the fix-mode boundary)**:
- `web/src/sessions/card.test.ts` — the three tests under "note precedence: attention > failure > first-launch" that assert exact `noteText` values (`"needs your permission"`, `"waiting for your input"`) now fail: `buildCardViewModel` appends the since-timer (Major 4), e.g. `"needs your permission — 00:00"` for a session whose `attention.since` equals the fixture's fixed `now`. These need updating to either use `toContain`/a regex, or to assert the full string with the timer included, for the two note texts and the "prefers attention over failure" case.
- No other test file's behavior was invalidated by this fix cycle. `render/launch.ts` has no existing unit test file (`render/launch.test.ts` does not exist), so the browse/repos error-handling and ⌘N changes there have no test to go red.

**Verification**: `npx tsc --noEmit` exits 0. `make web-build` (`cd web && npm run build`, i.e. `tsc --noEmit && vite build`) exits 0, emitting `dist/`. Per the fix-mode boundary, `make web-test` / `npm test` was not run as a gate (it is expected to show the `card.test.ts` regressions above, which are web-tests' fix, not mine).

## Fix Attempt 3 (review cycle 2, wave 1)

**Failures addressed**: `[web-impl]` Minor 3 and Minor 4 from `plans/m1-sessions/review.md` cycle 2.

**Changes made**:

| # | File | Change |
|---|------|--------|
| Minor 3 | `web/src/render/sessions.ts` | `buildCardElement`'s note-rendering block now sets `note.dataset.noteKind = vm.noteKind` in addition to the existing `note.className` toggle, so the full `NoteKind` (including `"trust"` and `"no-signal"`, previously computed in `card.ts` and then discarded) reaches the DOM as `data-note-kind`. Kept the visual `className` logic exactly as-is (`"note fail"` only for `noteKind === "failure"`), since the design-system review note on this plan already sanctions "trust"/"no-signal" rendering with the plain amber `.note` styling, identical to "attention" — the visual collapsing is intentional and correct, only the total discarding of the typed distinction at the DOM boundary was the finding. |
| Minor 4 | `web/src/render/launch.ts` | Moved the `elements.dialog.open` guard into the `keydown` handler itself, ahead of `event.preventDefault()`: `if (elements.dialog.open) return;` now sits directly before the `preventDefault()`/`openModal()` calls, with a comment explaining why the guard lives here rather than only inside `openModal()`. `openModal()` keeps its own `if (elements.dialog.open) return;` early return unchanged (still needed for the `openButton` click path), so this is additive defense-in-depth, not a removal. |

**Decisions**:
- Minor 3: chose "consume the distinction via a `data-note-kind` attribute" over simplifying `NoteKind` down to what rendering visually consumes, because collapsing the type would erase the honesty-rule provenance comments in `card.ts` (`firstLaunchNote`'s REQ-17 trust-vs-no-signal branches) and because the review's own note on this plan already treats "trust"/"no-signal" rendering identically to "attention" as sanctioned design, not a bug — so the fix is to stop discarding the value at the boundary, not to stop computing it. No accessible name, role, or visible text changed; `data-note-kind` is a new, additive DOM attribute with no test-facing contract in the plan's Testable UI Elements table.
- Minor 4: `openModal()`'s existing `if (elements.dialog.open) return;` (added in Fix Attempt 2 for Minor 1) is left untouched — removing it would drop the click-handler's own idempotency guard. The keydown handler now has its own equivalent guard positioned where the review asked for it, so the check is now visible at both call sites rather than only at the shared one.

**Verification**: `npx tsc --noEmit` exits 0. `make web-build` exits 0 (`tsc --noEmit && vite build`, emits `dist/`). Also ran `make web-test` (not required by the fix-mode gate, but no test files were touched and none were expected to be affected by these two changes): `Test Files 10 passed (10)`, `Tests 186 passed (186)` — confirms no regression from either change.
