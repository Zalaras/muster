# Web Implementation: Effort

**Plan**: effort
**Mode**: initial
**Pack**: kb: pack 41185 words (budget 30000) — WARN pack exceeds budget of 30000 words

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol/session.ts` | modified | `EFFORT_LEVELS` / `EffortLevel` / `isEffortLevel` beside `PERMISSION_MODES`; `SessionEffort`, `EffortWarning`; `Session.effort` and `Session.effortWarning` decoded as required nullable keys, a malformed shape rejects the session (REQ-5, REQ-7) |
| `web/src/sessions/effort.ts` | created | pure: `effortBrackets` (`(…)` / `(<level>)` / none), `effortStripParts` (the strip sentence as bold/plain runs, `the model` when null), `effortReadout` (the three bundled), `effortToCheck` (stored `lastEffort` to Effort radio value) (REQ-4, REQ-6, REQ-8) |
| `web/src/sessions/card.ts` | modified | `MainheadMeta.effort: EffortReadout` filled by `effortReadout(session)` |
| `web/src/render/mainhead.ts` | modified | `renderModel` writes the `.eff` child (class `warn` while the warning is set) and drops it when there are no brackets; `renderEffortStrip` called each pass; `MainheadElements.effortStrip` (REQ-6, REQ-8) |
| `web/src/render/effortstrip.ts` | created | shows/hides the strip and words its sentence with `<b>` runs, writing only when the sentence changed |
| `web/src/features/effort.ts` | created | `initEffort(app, {actions})`: Dismiss click, `DELETE`, failure into `#action-error` via `actions.showError` (REQ-9) |
| `web/src/features/focus.ts`, `web/src/main.ts` | modified | focus passes `#effort-strip` to the mainhead; `main.ts` registers `initEffort` in one line |
| `web/src/api/sessions.ts` | modified | `dismissEffortWarning(id)` |
| `web/src/api/launch.ts` | modified | `Repo.lastEffort` (required nullable), `LaunchRequest.effort?: EffortLevel`; `isNullableString` keeps `parseRepo` under the complexity ceiling (REQ-3, REQ-4) |
| `web/src/features/launch.ts`, `web/src/features/launchrestore.ts` | modified | Effort radios: select/restore, `touched.effort` (a pick before the repos arrive is kept), Recent click always restores, request carries `effort` only for a level (REQ-1, REQ-2, REQ-4) |
| `web/index.html` | modified | Effort `fieldset.seg` between the custom-model input and Start in; `#effort-strip` (`role="status"`, glyph, sentence, `Dismiss`) between `#mainhead` and `#main-terminal-slot` |
| `web/src/style.css` | modified | `--warn`, `--warn-bg`, `--warn-line`, `--warn-fg` in all three theme blocks; `.eff.warn`, `.holds-eff`, `.effort-strip` rules incl. `[hidden]` companion (REQ-8, REQ-12) |
| `web/scripts/contrast-pairs.json` | modified | four warn pairs and a `--warn` hue band 46-65 deg, disjoint from amber's 25-45 (REQ-12) |

REQ-13 (refit) and REQ-14 (canary) : REQ-13 needs no code of its own, see Decisions; REQ-14 is the daemon side's. `web/scripts/contrast.mjs` needed no change (it already reads `hueBands` from the JSON).

## Decisions

- Testable UI Elements: every row is implemented as written — `radiogroup` "Effort" with six radios named `effort` in order (`default` has value `""`), `.model` textContent `Opus 5.5 (high)` with the space inside `.eff`, `.eff` absent (not hidden) when there are no brackets, `role="status"` strip with a `Dismiss` button. None unimplementable.
- The clamped-warning sentence is the plan's reworded one (`Asked for max — Opus 4.5 started at high.`), not the mockup's "runs at most".
- Focusable controls in the tick: the strip's Dismiss button is static markup in `index.html` and keeps its node across passes; only `.sentence` is rewritten, and only when its signature changes. The memo key (`dataset.signature`) is every run's text plus its bold flag, which covers every input that shapes the strip's content (requested, actual, model, and which wording applies). `.model`/`.eff` is a read-only readout and is rebuilt each pass, as the old `textContent` write was.
- REQ-13: no refit code in `features/effort.ts`. `renderMainhead` shows/hides the strip, then `features/focus.ts`'s `mountTerminalSurface` calls `surface.refit()` and `renderSizenote` in the same pass, so the pane is measured after the strip's height exists. Observed: `effort-header.spec.ts` "the size note's row count drops when the strip appears and returns when it is dismissed" passes, rows cross-checked against tmux `#{window_height}` on both sides.
- INV-6 (Stop/Resume never moves the Focus header, `kb:adr/actions-mainhead-one-stop-resume-button`): the plan's "dead and never reported reads no brackets" would shrink the model by ` (…)` on Stop and move the header. Before the fix, `focus-header.spec.ts` failed 6 tests, e.g. `INV-6: header moved from x 300.0-600.0 y 46.0-152.4 to x 300.0-600.0 y 46.0-177.4` at 600px. Fix: `.model.holds-eff::after { content: " (…)"; visibility: hidden }` while `effort` is null and the session is dead, so the width is held without a `.eff` node (textContent stays `Haiku 4.5`-style bare). After: `effort-launch`, `effort-header`, `card-location`, `focus-header` run `174 passed`, with only the six failures listed in Handoff.
- The strip wraps (`flex-wrap`, sentence basis `16ch`) so Dismiss drops to its own line when the pane is narrow; Dismiss is never disabled, so a daemon-down dismiss can fail visibly into `#action-error`.
- `deviation:` none. The plan's Affected Files names `card.ts` for the strip sentence; it lives in `sessions/effort.ts` (called from `card.ts`) because `card.ts` was at 495 lines and crossing 500 was the alternative.
- design: `sessions/effort.ts` takes `sessions/permission.ts`'s shape (a pure sibling holding a wire enum's UI logic, `effortToCheck` beside `permissionModeToCheck`; the enum itself sits in `protocol/session.ts` beside `PERMISSION_MODES`). Searched `rg -n "effort" web/src --glob '!*.test.ts'` before writing: nothing existed.
- design: `render/effortstrip.ts` follows `reader.ts`'s signature-in-`dataset` memo (render/CLAUDE.md: "rebuilds only when their flattened signature changes") rather than a module-level cache; it owns no state, the `<div>` carries it. The strip is rendered inside `renderMainhead`, not by a separate render phase, because Focus's refit must see it (REQ-13 line above).
- design: `features/effort.ts` takes `usage.ts`/`rename.ts`'s shape (`init<Name>(app, deps)`, structural `deps: {actions: {showError}}`, wired in one line in `main.ts`, after `focus` and before `surfaces`). The failure path reuses `actions.showError`, the same `#action-error` writer `features/groups.ts`'s `settle` uses; no second error element. Precedent for restore-keeps-touched-picks: `launchrestore.ts`'s `Touched`/`initialRestore`, extended with `effort`, not copied.
- design: `MainheadMeta.effort` is one `EffortReadout {brackets, reservesBrackets, warn, strip}` object rather than four flat fields, to keep `card.ts` under 500 lines and the effort derivation in one place.
- design: size warning kept on purpose: `features/launch.ts` 796 to 824 lines (it was already over 500). The additions are the Effort row's select/restore/touched wiring (`setEffort`, `selectedEffort`, one change loop, two restore lines, the request key), each parallel to Model and Start in in this controller; moving them out would split one form's state across two modules for no clearer result.
- A keyboard user who presses Dismiss loses focus to `body` when the strip hides; the plan names no focus target, so none is chosen.
- REQs: REQ-1, 2, 3, 4 (launch.ts, launchrestore.ts, api/launch.ts, index.html); REQ-5, 7 (protocol/session.ts decode only: the daemon owns the rule); REQ-6, 8 (sessions/effort.ts, render/mainhead.ts, effortstrip.ts); REQ-9 (features/effort.ts, api/sessions.ts); REQ-12 (style.css, contrast-pairs.json; `node scripts/contrast.mjs`: `instrument: 50 pairs, 0 failures / dark: 50 pairs, 0 failures / light: 50 pairs, 0 failures`); REQ-13 (above); REQ-10, REQ-11, REQ-14 are daemon-side, nothing to do here.

doc-delta: `docs/design/design-system.md` §3 / §5: the strip's Dismiss is a ghost `.btn.sm` in `--warn-fg` on `--warn-line`, never disabled; and the Focus header holds ` (…)` of width on a dead, never-reported session so Stop/Resume never move it.
doc-delta: `web/src/features/CLAUDE.md` and `web/src/render/CLAUDE.md` list their features by name: `effort` is a new controller name (`features/effort.ts`, `render/effortstrip.ts`), matching the server handler `internal/server/effort.go` and the E2E prefix `effort-`.
doc-delta: the plan's Doc Delta for **focus** says the meta line ends with the model's effort in brackets with no brackets for "a dead session never reported one"; shipped: the width of ` (…)` stays reserved invisibly there.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` fail on sanctioned test files only: every `Session` literal and `Repo` literal in them lacks the two new required keys / `lastEffort`, `Touched` lacks `effort`, and `MainheadElements` lacks `effortStrip`. Non-test files type-check clean (`npx tsc --noEmit | grep -v test.ts` empty); `npx vite build` and `npm run -s lint` pass; `node scripts/contrast.mjs` passes. Files and what to change:
- add `effort: null, effortWarning: null` (or the case's own values) to the raw Session: `web/src/sessions/testfixtures.ts`, `web/src/api/launch.test.ts`, `web/src/api/sessions.test.ts`, `web/src/sessions/live.test.ts`, `web/src/ws.test.ts`, and the `session(...)` builders in `web/src/features/actionscopy.test.ts`, `web/src/render/dead.test.ts`, `web/src/render/mainhead.test.ts`, `web/src/render/sessions.test.ts`, `web/src/render/tiles.test.ts`, `web/src/sessions/card.test.ts`, `web/src/sessions/sort.test.ts`, `web/src/sessions/store.test.ts`
- `web/src/features/launchrestore.test.ts`: `lastEffort` on the Repo literal; `effort: false`/`true` on every `Touched`; new cases for `initialRestore`/`repoRestore` effort
- `web/src/render/mainhead.test.ts`: the elements fixture needs an `effortStrip` element; its fake `.model` must host a `.eff` child (`createElement`), `mainheadMeta` now returns `effort: {brackets, reservesBrackets, warn, strip}`
- new unit tests: `sessions/effort.ts` (W5, W6), `parseSession` effort shapes (W7), `parseRepo` `lastEffort`, `renderEffortStrip`

**E2E smoke** (`make web-build`'s `tsc` step fails on the test files above, so the dashboard was built with `npx vite build` then `make build`; `npx playwright test e2e/effort-launch.spec.ts e2e/effort-header.spec.ts e2e/card-location.spec.ts e2e/focus-header.spec.ts`): `6 failed, 174 passed (6.2m)`. The two effort specs alone: 51 of 57 passed on the first run, the same six still fail.

The six, none caused by the markup, for validate mode:
1. `effort-header.spec.ts:249` (`launch with max whose first post reports high`) expects `opus (…)` after `launchBound`; `launchBound`'s bind `SessionStart` carries `claude-haiku-4-5-20251001`, so the header reads `claude-haiku-4-5-20251001 (…)` (the same bind rule `card-location.spec.ts` E8 encodes as `claude-sonnet-5-5 (…)`). Observed received value: `"claude-haiku-4-5-20251001 (…)"`. Spec locator/expectation defect.
2. `effort-header.spec.ts:215` (survives Stop, /clear, restart) and 3. `:610` (a /clear rebind leaves a set warning): the `/clear` `SessionStart` (`envelopedSessionStart`) carries the haiku model id, so after it the header reads `claude-haiku-4-5-20251001 (xhigh)` / `(high)` where the spec expects `Opus 4.5 (...)`. Received: `"claude-haiku-4-5-20251001 (xhigh)"`. Spec expectation defect (the model is rebound by the hook, not the effort path).
4. `effort-header.spec.ts:469` (DELETE contract): the 404 body is `{"error":{"code":"unknown_session","message":"unknown session id"}}` but the contract (and the spec) say `"no session with that id"`. Daemon-impl's message (`internal/server/effort.go`); implementation-bug to route to daemon-impl, not web.
5. and 6. `effort-header.spec.ts:824` at 400px and 316px: the rail is a fixed 300px, so a 400px window leaves `.main` 100px and a 316px window 16px (measured: `"main":[300,46,100,754]`, `"main":[300,46,16,754]`); the existing `.model` and header already sit past the window edge there (`"model":[314,110,102,13]` at 316), so no strip layout can put Dismiss and `.eff` inside the window. The plan's "316px" is the header's own width (the `@container (width < 316px)` rule), which is a 616px window; 1280, 800 and 600 pass, and at 400px the strip does wrap with Dismiss on its own line at x 325-386, inside the window (the model assertion is what still fails there). Existing sweeps stop at 700px. Spec width list is the defect.

Gate lock note: the first two attempts waited on a gate held by another worktree (`muster-claude-version-watch`); nothing was bypassed.

Daemon-impl files in the tree (`internal/...`) were left alone and are not in this commit.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: browser Major 1 (`.eff` rebuilt every pass; `effort-header.spec.ts:893` flake), maintainability Minor 1 (`isNullableString` local to `api/launch.ts`), maintainability Minor 2 (Dismiss wired outside `features/focus.ts`).

**Changes made**:
- `web/src/render/mainhead.ts`: `renderModel` split into `writeModelText` (keeps `.model`'s first text node, writes `nodeValue` only when the name differs) and `writeEffort` (reuses the `.eff` span; creates it only when absent, removes it only when brackets go to null, writes `className`/`textContent` only on a difference). Every path: no brackets -> none/removed; brackets appear -> created once; text change -> that node's text only; `warn` flip -> `className` only; unchanged pass -> no DOM write.
- `web/src/protocol/decode.ts`: `isNullableString` exported beside `isString`. `web/src/api/launch.ts`: local copy deleted, imported; the four inline `x !== null && typeof x !== "string"` checks (`title`, `lastPrompt`, `permissionMode`, `parent`) now use it. `rg -n 'function (is\w*Nullable\w*|isStringOrNull)' web/src` finds one definition. Lint passes (cognitive complexity ceiling held).
- `web/src/features/effort.ts`: `initEffort(deps)` now returns `{dismiss(id)}` and attaches nothing; `web/src/features/focus.ts` takes `deps.effort` and attaches the `.dismiss` listener beside Stop/Resume/Remove/group; `web/src/main.ts` constructs `effort` before `focus` and passes it. `web/src/features/CLAUDE.md` line for `effort.ts` updated.

**Repro re-run**: node-identity check (temporary spec, deleted) on a warned session over 3.5 s of render ticks with a MutationObserver on `.model` (childList, subtree, characterData, attributes): `{"sameEff":true,"sameText":true,"connected":true,"mutations":0,"html":"Opus 4.5<span class=\"eff warn\"> (high)</span>"}` (before: 6 child removals in 3 s). `make e2e-soak SPEC=effort-header.spec.ts N=10`: `390 passed`, 10 failed, all ten the one test `DELETE /api/sessions/{id}/effort-warning ... 404 unknown_session` (`effort-header.spec.ts:503`, expects the old message `no session with that id`; daemon-side, covered by the proposed ADR `focus-effort-dismiss-404-uses-shared-body`, not a web matter). Every themed `getComputedStyle(.eff).color` test passed 10/10 in all three themes.

**Decisions**:
- design: `features/effort.ts` is the exception no longer: it follows `features/rename.ts` (constructed before `focus`, returns a structural handle, focus attaches the listener). The previous line citing `usage.ts`/`rename.ts` for attaching in the feature module is withdrawn.
- design: `writeModelText`/`writeEffort` reuse `render/effortstrip.ts`'s principle (write only on change) but compare against the live DOM rather than a `dataset` signature, because two nodes' attributes and text are the whole state; the node is the owner, no module cache. Memo inputs: model name text, brackets text, `warn` flag.
- No doc-delta change.

**Handoff addendum**: `npx tsc --noEmit` and `npm run build` exit 0; `npm run -s lint` clean. Sanctioned test breakage: `web/src/render/mainhead.test.ts`, 3 cases in "the effort readout in `.model`" (`a level reads in brackets after the model`, `a set warning marks the readout warn`, `an alive session with no report yet reads ...`) fail on `s.model.textContent` (`Opus 4.5` vs `Opus 4.5 (high)`): `FakeNode.append` does not update `textContent` the way real `appendChild`/`append` does (only `replaceChildren` does), and the fake has no `firstChild`, so the real-DOM path (keep text node, append the `.eff` span) cannot be hosted. Fix the fixture: make `FakeNode.append` recompute `textContent` from its kids (and, ideally, give it `firstChild`/`nodeValue` so a test can assert node identity across two passes). Shipped markup is not to be bent to the double.

## Post-review refactor (at /land)

Requested by the developer from review.maintainability.md cycle 2 Note 6: one spelling for the null-or-string decode check. Every inline `x !== null && typeof x !== "string"` outside tests became `!isNullableString(x)`, imported from `protocol/decode` (`./decode` inside `protocol/`). Same accept/reject set at each site (the guard is `value === null || typeof value === "string"`, negated where the site rejects). `rg -n '!== null && typeof \w+(\.\w+)* !== "string"' web/src --glob '!*.test.ts'`: 22 sites before (plus the 4 already done in `api/launch.ts`), 0 after. No other spelling of the string check exists (`=== null || typeof`, reversed operand order: none found); `api/launch.ts:156` is the number form (`openSessionId`) and was left.

Sites: `api/update.ts` (title); `api/reader.ts` (writtenAt x2); `protocol/hello.ts` (installed); `protocol/update.ts` (version, error, remedy, available, checkedAt, installed); `protocol/usage.ts` (sampledAt, rawModelScopedAt); `protocol/session.ts` (branch, level, actual, model, title, endedAt, lastActivity, claudeSessionId, titleOverride, lastPrompt).

design: no new helper; reuses `isNullableString` from `protocol/decode.ts`. No test file edited.
