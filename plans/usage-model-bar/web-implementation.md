# Web Implementation: usage-model-bar

**Plan**: usage-model-bar
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/index.html` | edited | Added `#usage-model-week` (`.usage-readout`) and `#usage-refresh` (`.btn.sm`, `aria-label`/`title="Refresh usage"`) between `#usage-7d` and `#usage-model`, per the plan's masthead order and Testable UI Elements table. |
| `web/src/protocol.ts` | edited | `ModelWindow`, `ModelScopedError` types; `Usage` gains optional `modelScoped`/`modelScopedAt`/`modelScopedError`/`modelScopedSource` (present-only pattern matching the existing `model` field, so a pre-plan payload round-trips unchanged); `Prefs` gains required `usageModel: string`; `parseUsage` validates the four new fields (malformed `modelScoped` element or unrecognized `modelScopedError` string rejects the message — W5); `parsePrefs` defaults a missing `usageModel` key to `"Fable"`. |
| `web/src/api.ts` | edited | `PrefsRequest.usageModel?: string`; new `refreshUsage()` wrapping `POST /api/usage/refresh` (202 → `ok`, else decodes the error body — same shape as `putPrefs`/`removeSession`). |
| `web/src/render/masthead.ts` | edited | New `renderModelWeek(el, usage, selectedModel, now, onSelectModel)`: rebuilds `[select.lbl.usage-model-select, .num]` every pass (mirrors `renderBucket`'s self-healing `replaceChildren` shape), builds the `<select>` (`aria-label="Usage model"`, one `<option>` per `modelScoped[].displayName`, or a single disabled option reading the pref when the list is null/empty), looks up the selected model's window and delegates to the existing `renderUsageTrack` for the bar/percent/resets (REQ-9, honesty rule REQ-10/INV-2), and toggles `.stale` + `title` from `modelScopedError` (REQ-11/INV-3). |
| `web/src/main.ts` | edited | Element handles for `#usage-model-week`/`#usage-refresh`; `usageModel` state variable (mirrors `view`/`density`, driven only by the `prefs` echo — INV-6); `applyPrefsFromSnapshot` now also assigns `usageModel`; `renderUsageBlock` calls `renderModelWeek`; `requestUsageModel` (fire-and-forget `putPrefs({usageModel})`, same pattern as `requestView`/`requestDensity`); refresh-button click handler sets `aria-busy="true"`, calls `refreshUsage()`, and clears busy on failure or a 5s fallback timer; `onUsage` now also calls `clearUsageRefreshBusy()` (REQ-12: cleared on the next `usage` message or 5s, whichever first). |
| `web/src/style.css` | edited | `.usage-model-select` (mono, chrome stripped, `--dim`/`--paper` on hover — inherits the `.lbl` slot's look), `.usage-readout.stale .num` (dimmed + dotted underline, its own signal per design-system §6, never `--rose`/`--amber`), `#usage-refresh { line-height: 1 }` for icon-button sizing. All values resolve to existing tokens (`--dim`, `--paper`, `--mono`) — no new tokens needed. |

## Decisions

- `UsageElements` (masthead.ts) was **not** extended with a `modelWeek` field as the plan's Affected Files bullet phrased it. `renderUsage`'s `UsageElements` groups the two status-line buckets because they share an identical render call (`renderUsage` + `renderUsageTrack` in a loop); the model-week readout needs extra per-call inputs (`selectedModel`, `onSelectModel`) that don't fit that shape, so it got its own function signature (`renderModelWeek(el, usage, selectedModel, now, onSelectModel)`) instead. Behavior-equivalent — flagging per the "say so, don't silently substitute" rule.
- `Prefs.usageModel` was made a **required** field (not `usageModel?: string`), matching the exact precedent already set for `density` in this file ("density is always present... so both fields are required here" — protocol.ts comment near the `Prefs` interface). `parsePrefs` still defaults a missing wire key to `"Fable"`, so a pre-plan daemon's payload still parses; only the *TypeScript* shape is now always-fully-formed, consistent with `Snapshot`/`PrefsMessage`.
- `modelScopedError`'s TS type is the literal union `"no-credentials" | "unauthorized" | "unreachable"` (validated in `parseUsage`) rather than a bare `string`, since REQ-6 enumerates exactly these three values and nothing in the plan calls for forward-compatible unknown-value tolerance on this particular field (unlike `source`, which stays a bare `string`).
- Testable UI Elements table: all six rows implemented as specified — native `<select>` naturally carries the `combobox` role via `aria-label`, `<button>` carries `button` via `aria-label`/visible text; no row required unimplementable markup.

## Handoff

**Build status**: NOT BUILDING — `npx tsc --noEmit` (and therefore `npm run build`, which runs it first) fails with exactly two pre-existing errors, both in a file I am not permitted to edit beyond import lines:

```
src/ws.test.ts(16,3): error TS2741: Property 'usageModel' is missing in type '{ view: "focus"; density: "2x2"; }' but required in type 'Prefs'.
src/ws.test.ts(19,53): error TS2741: Property 'usageModel' is missing in type '{ view: "tiles"; density: "3x2"; }' but required in type 'Prefs'.
```

This is sanctioned breakage from the plan's approved contract delta (REQ-8: `Prefs.usageModel`, default `"Fable"`), the same category as the `density` precedent already in the codebase. `npx vite build` alone (no type-check) succeeds and produces `dist/` correctly — the actual application code is sound; only the pre-existing test fixtures' TS literal types are stale.

**Test files needing changes** (web-tests agent — I did not touch these beyond confirming the exact diffs needed):

- `web/src/ws.test.ts`:
  - Line 16: `prefs: { view: "focus", density: "2x2" }` → add `usageModel: "Fable"` (or whatever value the surrounding test cares about).
  - Line 19: `const prefsMessage: PrefsMessage = { type: "prefs", prefs: { view: "tiles", density: "3x2" } };` → add `usageModel: "..."` .
  - Line 234: `expect(handlers.onPrefs).toHaveBeenCalledWith(prefsMessage.prefs);` — will pass once line 19's literal includes `usageModel`, since it compares against the same object.
- `web/src/protocol.test.ts` (these are runtime assertion failures, not compile errors, because the literals here are untyped `unknown` snapshot inputs — full list from `npx vitest run`):
  - Line 15 `validSnapshot.prefs` and its dependents (lines 130–131, 141, 467–469): expected objects need `usageModel: "Fable"` (or an explicit value when the input snapshot sets one) added so `.toEqual()` matches `parsePrefs`'s now-always-present field.
  - Line 146 `validPrefsMessage` and line 149's assertion: same — add `usageModel: "Fable"` to both the input and the expected value (or just assert equality against the input, since `parsePrefs` will echo an explicit `usageModel` unchanged).
  - Line 165–166 ("ignores unknown fields inside prefs"): expected object needs `usageModel: "Fable"` added (the input has no `usageModel` key, so the parsed default applies).
  - Full failing-test list from `npx vitest run` (9 failures, 2 files): `parseMessage — snapshot > parses prefs.density '3x2'`, `parseMessage — snapshot > ignores unknown fields inside usage and prefs`, `parseMessage — prefs > parses a fully-populated prefs message`, `parseMessage — prefs > ignores unknown fields inside prefs`, `parseMessage — snapshot with sessions > parses a snapshot with multiple valid sessions`, plus the two `ws.test.ts` compile errors above and their one runtime counterpart (`dispatches a prefs frame to onPrefs`).

No other test files are affected — `npx vitest run` reports `2 failed | 16 passed` files, `9 failed | 441 passed` tests, and every failure is one of the above `usageModel`-shape mismatches.

## Fix Attempt 1

**Mode**: fix (attempt 1) — review cycle 1

**Failures addressed**:
- Critical 1: model `<select>` destroyed and rebuilt every 1s render tick (`masthead.ts:172`), so it could never be operated by keyboard and its dropdown could never stay open.
- Minor 3: a pref naming a model absent from a non-null `modelScoped` list left `select.value` set to a non-matching string (`selectedIndex = -1`), rendering blank.

**Changes made** (`web/src/render/masthead.ts`):

- Added a module-level `modelWeekCache: WeakMap<HTMLElement, ModelWeekState>` keyed by the container element (`#usage-model-week`), holding the live `select`/`num`/`bar`/`fill`/`resets` node references and the option-name sequence (`names`) they were built for.
- Split `renderModelWeek` into `buildModelWeek` (fresh-build path: creates a brand-new `select`+`num`, wired via `el.replaceChildren` — safe only because neither node has been attached before) and `applyModelTrack` (mutates the cached `.num`/`.bar`/`.resets` nodes in place: text/width/class updates, `insertBefore`/`appendChild` only when a node needs to newly appear, `.remove()` only when a bucket disappears).
- `renderModelWeek` now computes `names` (the option list, including the Minor-3 placeholder — see below) and compares it against the cached state's `names` (`namesEqual`). Every code path that reaches the select is covered by this single branch:
  - **Same `el`, same `names` (steady state — the common case, since `modelScoped` only changes on a ~5-min poll while render runs every 1s)**: the cached `select` node is reused untouched — never passed through `replaceChildren`/`insertBefore`/`appendChild` again. Only `select.disabled` (kept in sync with `hasWindows`) and `select.value` (only assigned when it actually differs from `selectedModel`, so a no-op tick never touches the node at all) are updated in place. This is the path that was previously rebuilding the node every tick; it's now the only path, and it never detaches the node.
  - **Same `el`, `names` changed (list contents actually changed, or a user's own selection moves the value out of/into "absent from list")**: falls through to `buildModelWeek`, a genuine full rebuild — acceptable per the reviewer's own framing ("reuse ... when its option list and value are unchanged"); an option-set change forfeiting an open dropdown is expected, not a regression.
  - **First-ever render for a given `el` (cache miss)**: `buildModelWeek`, same as before — no prior node exists to preserve.
  - Root cause of the original defect (`el.replaceChildren(select, num)` unconditionally on every call, reached via `main.ts:193` → `renderUsageBlock` → `setInterval(render, 1000)`) is closed at the source: that call now only executes in `buildModelWeek`, which only runs when `names` changed or on first build — never on a plain per-second re-render with unchanged data.
  - Also verified: even the *reuse* path used to end by calling `renderUsageTrack(el, bucket, now)`, which unconditionally builds new bar/fill/resets nodes; if the select were kept but that call re-ran unchanged, it would have inserted duplicate bar/resets nodes every tick. `applyModelTrack` replaces that call entirely for this readout (the two sibling buckets still use `renderUsageTrack` — unaffected, they have no interactive state to preserve) and only creates a new bar/resets node the first time one is needed, mutating it thereafter.

- Minor 3 fix: `renderModelWeek` now computes `placeholderNeeded = hasWindows && !rawNames.includes(selectedModel)` and, when true, prepends a disabled `<option>` for `selectedModel` ahead of the real list (`names = [selectedModel, ...rawNames]`), then sets `select.value = selectedModel` — which now matches an existing (disabled) option instead of leaving `selectedIndex = -1`. Mirrors the existing null/empty-list branch's single-disabled-option pattern, per the review's own suggestion.

**Manual Verification** (real Chromium via Playwright MCP, not just the unit-test double — built a throwaway harness page importing `renderModelWeek` directly, driven by `vite` dev server on port 5199, deleted after use; not part of the shipped tree):

1. Rendered `renderModelWeek` on a 1s `setInterval` (matching production cadence) with a randomized `usedPct` each pass, to prove real re-renders were happening.
2. Focused the `<select>`, tagged the live node (`select.__tag = 'the-original-node'`), waited 3.5s (3+ render ticks, confirmed by `.num` text changing each time).
3. Result: `{ activeIsSelect: true, activeTag: "SELECT", stillTaggedNode: true, numText: "16%" }` — the exact same node instance was still `document.activeElement` after multiple render ticks. Before the fix this would read `activeTag: "BODY"` and `stillTaggedNode: false` (the reviewer's measured pre-fix numbers).
4. Simulated a keyboard/mouse-driven selection (`select.value = 'Opus'; select.dispatchEvent(new Event('change', {bubbles:true}))`), waited 2.2s more: `{ value: "Opus", stillTaggedNode: true, activeIsSelect: true }` — the new selection survived a render tick without the node being replaced or the value reverting.

**Gate**:
- `npx tsc --noEmit` — exits 0, no output.
- `npm run build` — exits 0 (`tsc --noEmit && vite build`), `dist/` produced.
- `npx vitest run` — `487 passed, 1 failed` (18 files, 1 file with 1 failure). The single failure is the predicted, sanctioned breakage below — every other test, including all 39 other `masthead.test.ts` cases (steady-state reuse, `.stale`/title toggling across two calls on the same `el`, the rebuild-from-scratch known→unknown transition, the `onSelectModel` callback), passes unchanged.

**Sanctioned test breakage (for web-tests)**:

`web/src/render/masthead.test.ts:569` — "renders unknown with zero track markup when the selected pref names a model absent from a non-null list (REQ-10/INV-2)" asserts `select!.optionTexts()).toEqual(["Fable", "Opus"])`. With the Minor 3 fix this is now `["Sonnet", "Fable", "Opus"]` (the placeholder for the absent pref "Sonnet", prepended and disabled). This is a direct, unavoidable consequence of implementing the review's requested fix — there is no way to show the pref name instead of a blank control without adding a rendered option for it. Needed change: update the expectation to `["Sonnet", "Fable", "Opus"]` and add an assertion that the first option (`el.nodes()[0]` inside the select, or however the fixture exposes it) is disabled, e.g. via a new/extended `FakeDomNodeRich` accessor if one doesn't already exist for per-option `disabled`. I did not make this edit (test-file assertions are outside my remit) — flagging per the sanctioned-breakage rule (plan's approved review delta contradicts a frozen expected value).

## Fix Attempt 2

**Mode**: fix (attempt 2) — review cycle 2

**Failures addressed**:
- Major 1: the node-reuse cache in `renderModelWeek` keyed on the option-*name* sequence alone (`namesEqual(cached.names, names)`), so a placeholder-state flip that leaves the name sequence identical (pref `Fable` with list `[Fable, Opus]` vs. pref `Fable` with list `[Opus]` both produce `["Fable","Opus"]`) took the reuse path and never re-synced per-option `disabled` — set once in `buildModelWeek` — leaving a live, listed model permanently unselectable.
- Minor 1: `web/src/style.css:229` (pre-fix line numbers) described the select as "rebuilt fresh every render pass by renderModelWeek", which Fix Attempt 1's Critical-1 fix had already made false.

**Changes made** (`web/src/render/masthead.ts`):

- Added `placeholderNeeded: boolean` to `ModelWeekState`, recorded at build time (`buildModelWeek` now returns `placeholderNeeded` alongside `names`).
- Changed the reuse condition (`renderModelWeek`) from `namesEqual(cached.names, names)` alone to `namesEqual(cached.names, names) && cached.placeholderNeeded === placeholderNeeded`. A placeholder-need flip now forces the rebuild path even when the name sequence is unchanged — the same "option set genuinely changed, forfeiting an open dropdown is correct" rule the plan already applies to a names change, per the review's recommended (smaller-diff) fix.
- Updated the doc comments on `ModelWeekState.placeholderNeeded`, `renderModelWeek`, and the stale `style.css` comment (Minor 1) to describe the actual rebuild trigger.

**Category sweep — every path that can reach the defect**:

The bug's root cause is that an option's `disabled` attribute is a pure function of `(placeholderNeeded, index)` (`buildModelWeek`: `if (placeholderNeeded && i === 0) option.disabled = true`), but the old reuse guard only compared `names`. I enumerated every way `(hasWindows, rawNames, selectedModel)` can vary to check for other pairs of states producing an identical `names` array while producing different per-option `disabled` flags:

1. **`placeholderNeeded` true → false or false → true with the same resulting `names` array** (the reviewer's example: `[Opus]`/`Fable` → `[Fable, Opus]`/`Fable`). Closed by the new `placeholderNeeded` comparison.
2. **`hasWindows` flips (true ↔ false) while `names` happens to stay identical** — e.g. `hasWindows=false` (`names=[selectedModel]`, `placeholderNeeded=false` since `placeholderNeeded = hasWindows && ...`) transitioning to `hasWindows=true` with a singleton list equal to `selectedModel` (`rawNames=[selectedModel]`, `placeholderNeeded = true && !true = false`, `names=[selectedModel]`). Same `names`, same `placeholderNeeded` (`false` in both) — so this pair does *not* collide on `disabled` (neither ever sets an option's `disabled`; the whole select's `disabled` attribute is what differs, and that's already re-synced unconditionally in the reuse branch via `state.select.disabled = !hasWindows`, not gated by the reuse/rebuild choice). No fix needed here — verified by inspection, not just assertion: `option.disabled` is only ever set inside the `placeholderNeeded && i === 0` branch, so `placeholderNeeded` being false in both states means neither run ever touches an option's `disabled` flag.
3. **`rawNames` order changes without changing the set** (e.g. daemon reorders the two `ModelWindow`s) — already caught by `namesEqual`'s index-wise comparison (a reordering changes `names` at the position that matters), independent of this fix.
4. **Two different `selectedModel` values both producing `placeholderNeeded=true` with the same synthesized `names`** — impossible: `names[0]` is `selectedModel` itself when `placeholderNeeded` is true, so a different `selectedModel` necessarily changes `names[0]`, which `namesEqual` already catches.

Since `option.disabled` is set exactly once, only inside `buildModelWeek`, and is wholly determined by `(placeholderNeeded, index)`, comparing `placeholderNeeded` alongside `names` in the reuse guard is exhaustive — there is no third piece of hidden state that feeds into an option's `disabled` flag. `select.disabled` (the whole-control disable, distinct from per-option `disabled`) was already correctly re-synced every reuse pass before this fix and needed no change.

**Manual Verification** (real Chromium via Playwright, `playwright` npm package driving `vite` dev server on port 5183; harness page (`web/verify-fix.html`) built, exercised, then deleted — not part of the shipped tree):

Reproduced the exact review scenario end-to-end by calling `renderModelWeek` on the same `el` across three passes:

1. `usage.modelScoped=[{Opus,10%}]`, `selectedModel="Fable"` → measured options: `Fable: disabled=true, Opus: disabled=false` (correct placeholder state).
2. `usage.modelScoped=[{Fable,61%},{Opus,10%}]`, `selectedModel="Fable"` (the collision transition — same `["Fable","Opus"]` name sequence as a difference-only-in-placeholder state) → measured options: **`Fable: disabled=false, Opus: disabled=false`**, and `.num` read `"61%"` (the live value, not stuck/stale). This is the fixed behavior — pre-fix this would have kept `Fable: disabled=true` per the review's own reproduction.
3. `selectedModel="Opus"` on the same list → measured options: `Fable: disabled=false, Opus: disabled=false`, confirming `Fable` stays permanently selectable going forward (not a one-tick fluke).

Full JSON output pasted into the fix session; re-confirmed identical on a second run after restoring the working tree from an accidental `git stash` (see below) to rule out a stale build.

**Note on verification process**: a `git stash push -- web/src/render/masthead.ts web/src/style.css` run to diff pre/post behavior reverted much further than intended (the entire usage-model-bar web feature is uncommitted in this tree, not just this fix — `git status` at the time showed only `SPEC.md`/`TODO.md`/daemon files/etc. as modified because the whole plan's work sits uncommitted). Popped immediately (`git stash pop`) with no data loss; confirmed via `grep -n "cached.placeholderNeeded" web/src/render/masthead.ts` that the fix was restored, then re-ran the manual verification above to confirm the browser measurement still held post-restore.

**Gate**:
- `npx tsc --noEmit` — exits 0, no output.
- `npm run build` — exits 0 (`tsc --noEmit && vite build`), `dist/` produced (375.36 kB JS, 19.98 kB CSS).
- `npm test -- --run` (`vitest run`) — **493 passed, 0 failed** (18 files). No test breakage: the Fix Attempt 1 sanctioned breakage (`masthead.test.ts:569`, `optionTexts` expectation) was already fixed by web-tests before this cycle, and this fix's reuse-guard change didn't touch any other assertion (the only existing coverage of the reuse/rebuild boundary, per the review, tests names-changed→rebuild and names-unchanged→reuse — neither exercises a placeholder flip with equal names, so nothing pre-existing could regress from tightening the guard).

**Sanctioned test breakage**: none.
