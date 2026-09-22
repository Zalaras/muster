# Web Implementation: Rail Card Improvements

**Plan**: rail-card-improvements
**Mode**: initial
**Pack**: `kb:pack plan=rail-card-improvements role=web-impl features=rail,settings,views,tiles,launch,lifecycle` — 23805 words (WARN exceeds 8000-word budget); sections: rules 1053, features 7327, decisions 8343, facts 4111, lessons 2963, runbooks 2

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | edited | `Session.unread`/`Session.lastPrompt` (required, `parseSession` rejects a session missing either); `RailDensity`/`RailActivity` types; `Prefs.railDensity`/`Prefs.railActivity` (required client-side, `parsePrefs` defaults a missing key to `comfortable`/`turn`, rejects an out-of-enum value); extracted `parsePrefsField`/`isRailSort`/`isRailDensity`/`isRailActivity`/`isString`/`isBoolean` to keep `parsePrefs` under the complexity ceiling |
| `web/src/api.ts` | edited | `PrefsRequest.railDensity`/`.railActivity` (optional, passed straight through to `PUT /api/prefs`) |
| `web/src/app.ts` | edited | `AppState.railDensity`/`AppState.railActivity`, written only by `features/rail.ts` from `prefs` |
| `web/src/sessions/card.ts` | edited | `CardViewModel.unread`, `CardViewModel.activity: CardActivity` (`{you, claude}`, replacing the old single `activity: string \| null`); exported `activityLines(session, mode)` (REQ-14, pure, Vitest-coverable with no DOM) and `unreadLabel(title, unread)`; `buildCardViewModel(session, now, mode = "turn")` |
| `web/src/sessions/sort.ts` | edited | REQ-11's new priority table via `statePriority(session)` (idle splits on `unread`: 2 when unread, 6 when read; `started` moves to 3, ahead of `planning`/`working`), replacing the static `STATE_PRIORITY` record |
| `web/src/render/sessions.ts` | edited | New template slots: `.name`/`.r2` carry `title` attributes (REQ-2); `.activity.you`/`.activity.claude` written and hidden independently (REQ-14); `unread` class, `data-unread="true"`, `", unread"` aria-label suffix (REQ-9); `railActivity` threaded through `buildSessionCardElement`/`updateSessionCardElement`/`reconcileCards`/`renderSessions` (default `"turn"`); extracted `cardClassName`/`applyUnreadAttributes` to stay under the complexity ceiling |
| `web/src/render/tiles.ts` | edited | `renderStrip` takes and forwards `railActivity` (default `"turn"`) to `reconcileCards`, so the strip follows the density/activity prefs the same as the rail |
| `web/src/features/rail.ts` | edited | Density control wiring: `#rail-density .seg-btn` click sends `PUT /api/prefs {railDensity}`; `mousedown` on each button calls `preventDefault()` so a click never steals focus from a card/action button (REQ-15 fix, see Decisions); `app.state.railDensity`/`app.state.railActivity` and `document.body.dataset.railDensity` written only from the `prefs` handler (INV-4); `railActivity` passed into `renderSessions`; pressed-state sync in the render tick |
| `web/src/features/tiles.ts` | edited | `app.state.railActivity` passed into both `renderStrip` call sites |
| `web/src/features/settings.ts` | edited | `railActivityRadios` element list, `onChooseRailActivity` handler (`putPrefs({railActivity})` on change), `setChecked` gains a third `railActivity` parameter (radio state follows the `prefs` broadcast only, INV-4/INV-7) |
| `web/src/features/launch.ts` | edited | `openButtons` now holds exactly one element, `#new-session-button` — `#tiles-new-session-button` removed (REQ-6/INV-3) |
| `web/index.html` | edited | `#new-session-button` moved into `header.masthead` after `#view-switcher`; rail head restructured to `#rail-sort`, `#rail-count`, `#rail-density` (three icon `.seg-btn`s); Tiles toolbar's own New-session button removed; `#session-card-template` restructured to `.r0` (badge/timer/pin), `.r1` (name only), `.r2`, `.r3`, `.activity.you`, `.activity.claude`, `.note`, `.acts-row`; Settings dialog gains `fieldset.seg` "Rail card shows" (four radios, `name="railActivity"`) between the Theme hint and the Updates fieldset |
| `web/src/style.css` | edited | `.railhead .seg` icon-button sizing; layout C (`.r0` flex row, `.r1` block, `.card .name` wraps by default, unread dot `.card.unread .name::before`, muted read-idle title `.card.s-idle:not(.unread) .name`); `.activity + .activity` spacing; three `body[data-rail-density]` blocks (compact clamps title/note, hides the context track and both activity lines unconditionally, tightens padding; expanded clamps `.activity` to 3 lines, with an explicit `[hidden]` companion rule since its `display: -webkit-box` would otherwise outrank `[hidden]`'s `display: none` in the cascade) |

## Decisions

- REQ-1 through REQ-15 are all implemented as specified; no REQ was deliberately skipped.
- **Focus-preservation defect found and fixed (not a deviation, but worth recording):**
  clicking a `<button>` focuses it by the browser's own default `mousedown` action, which
  would blur a focused rail-card action button the instant a density button was clicked —
  before `features/rail.ts`'s own `click` listener even ran. REQ-15/E12 need the *original*
  focused control to survive. Fixed with the standard `event.preventDefault()` on
  `mousedown` (same technique a toolbar avoids stealing focus from a text field with), not
  the capture/restore pattern `render/dragreorder.ts` uses — that pattern exists because a
  drag genuinely *does* reorder DOM nodes (an unavoidable blur to undo afterward); a density
  click never touches the cards container at all, so preventing the steal in the first place
  is simpler and sufficient. Verified: `rail-layout.spec.ts:148` (E12) went from red to
  green after this fix, confirmed by re-running the exact repro (see Handoff).
- `buildCardViewModel`'s new `mode: RailActivity` parameter, and the `railActivity`
  parameter threaded through every `render/sessions.ts`/`render/tiles.ts` function, default
  to `"turn"` (the pref's own daemon default) rather than being required. This keeps every
  pre-plan call site (including Vitest fixtures) compiling unchanged where nothing about
  this plan's behaviour is what's under test, while every real caller (`features/rail.ts`,
  `features/tiles.ts`) passes `app.state.railActivity` explicitly.
- `docs/design/design-system.md` and `mockups/final.html`'s decorative `<span class="who">`
  markup was **not** copied into the shipped template — the Testable UI Elements table
  specifies plain text matching `/^(on|you): /` and `/^claude: /` on `.activity.you`/
  `.activity.claude` themselves, so `activityLines` returns the prefix baked into the string
  and the renderer writes it as one `textContent`, with no inner `.who` span. Simpler, and
  matches the table literally rather than the mockup's presentation-only wrapper.
- deviation: none against the plan's Protocol Contract or REQ text — every wire shape and
  validation rule matches the plan's Protocol Contract section verbatim (`unread`/
  `lastPrompt` required on Session; `railDensity`/`railActivity` optional on the PUT
  request, required+defaulted on the parsed `Prefs`).
- doc-delta: none beyond what the plan's own Doc Delta section already states — nothing
  shipped here contradicts or extends it.

### A protocol/data gap found in daemon behaviour (flagged, not fixed — not web-impl's territory)

`rail-activity.spec.ts`'s "Turn-aware mode on a failed session shows the last reply's
`claude:` line, not an `on:` line" (edge case 25) fails against the daemon-impl's already-committed
build (`e8a82d9`). Root cause, traced in `internal/session/machine.go`'s
`KindTurnFailed` arm: it sets `sess.Failure = &Failure{...}` from `input.LastActivity` but
never writes `sess.LastActivity` itself — only `KindTurnClosed` (a successful `Stop`) does
that. The test's fixture goes `UserPromptSubmit` → `StopFailure` directly (no prior
successful turn), so `session.lastActivity` is genuinely `null` at assertion time, and
`activityLines`'s "otherwise" branch (`claude: lastActivity`) correctly renders nothing —
exactly REQ-14 as written ("otherwise `you = null`, `claude = "claude: " + lastActivity`").

This is **not a web bug**: `activityLines` reads the field REQ-14 names, and the wire object
it receives really does carry `lastActivity: null` for this scenario, confirmed by reading
`internal/session/machine.go` directly (not inferred) and by re-running the failing test
unchanged before and after every web-side fix in this plan — it never moved. The fix, if
one is wanted, is a daemon-side or protocol-contract decision: whether `StopFailure` should
also populate `LastActivity` from its own `lastAssistantMessage` (mirroring `Stop`), which
is outside this agent's remit to touch (daemon code) or authorize (a Protocol Contract
change). Flagging for the orchestrator/review to route to daemon-impl or e2e-specs.

## Handoff

**Build status**: `npx tsc --noEmit` and `npx vite build` both exit 0 for every non-test
file; `npm run build` (which chains `tsc --noEmit && vite build`) does **not** exit 0,
because `tsc --noEmit` type-checks test files too and 11 pre-existing test files build
`Session`/`Prefs` object literals missing the two new required `Session` fields
(`unread`, `lastPrompt`) and/or the two new required `Prefs` fields (`railDensity`,
`railActivity`) — sanctioned breakage (kb:lesson/stale-fixture-reshaped-the-wire): these are
exactly the REQ-driven wire-shape changes the plan's Protocol Contract mandates, the same
shape earlier plans' `pinned`/`railPos`/`titleOverride` additions took.

Proof the *shipped* code (everything `tsc` would type-check outside `*.test.ts`) is clean:
`npx tsc --noEmit -p . 2>&1 | grep 'error TS' | grep -v '\.test\.ts'` returns nothing (14
errors total, all 14 in `*.test.ts` files); `npx vite build` (which never touches test files,
since they're not reachable from `index.html`/`doc.html`'s entry graph) exits 0 and produces
a working `internal/webui/assets` — confirmed end to end by building `musterd` from it
(`make build`) and running the plan's own E2E specs against the real binary (below).

**Test files needing changes I was not allowed to make** (all `Partial<Session>`/`Prefs`
object-literal fixtures missing the plan's new required fields — a one-line addition each,
`unread: false, lastPrompt: null` / `railDensity: "comfortable", railActivity: "turn"`, to
each file's local base-object builder):

- `web/src/api.test.ts`, `web/src/ws.test.ts` — `Prefs` fixtures missing `railDensity`/
  `railActivity`; `Session` fixtures missing `unread`/`lastPrompt`. (Not explicitly named in
  the plan's "Unit tests owned by test agents" list, but affected by the same required-field
  additions — flagging so they aren't missed.)
- `web/src/protocol.test.ts` — plan-listed; will need new `parseSession`/`parsePrefs`
  assertions for the two new fields/two new prefs, not just fixture repair.
- `web/src/sessions/card.test.ts` — plan-listed; the `activity` assertions
  (`buildCardViewModel(...).activity`) need updating for the new `{you, claude}` shape (was
  a single `string | null` prefixed `"last: "` — REQ-14 replaces that entirely with
  `activityLines`'s four-mode table). 2 assertions currently red at runtime
  (`npx vitest run`), confirmed by running it.
- `web/src/sessions/sort.test.ts` — plan-listed; the REQ-16-era six-state expectation
  (`[6,5,4,3,2,1]`) needs updating to REQ-11's seven-group table. 1 assertion currently red
  at runtime, confirmed by running it.
- `web/src/render/dead.test.ts`, `web/src/render/mainhead.test.ts`,
  `web/src/render/sessions.test.ts`, `web/src/render/tiles.test.ts`,
  `web/src/render/update.test.ts`, `web/src/sessions/live.test.ts`,
  `web/src/sessions/store.test.ts` — `Session`/`Prefs` fixtures only; no assertions in these
  files touch `unread`/`lastPrompt`/`railDensity`/`railActivity`/sort order/activity text
  directly, so `npx vitest run` reports these files' tests passing today despite the `tsc`
  type error (the missing fields are simply `undefined` at runtime and unread by anything
  these particular assertions check) — still a compile-time defect worth a one-line fixture
  fix, just not one presently failing a real assertion.

Full picture from `npx vitest run` today: 5 test files red (`api.test.ts`,
`protocol.test.ts`, `sessions/card.test.ts`, `sessions/sort.test.ts`, `ws.test.ts`),
61 of 1728 tests failing, all attributable to the fixture/assertion gaps above — no failure
traces to anything else.

**Smoke run of the plan's own E2E specs** (per this agent's gate — not the E2E gate itself):
built `musterd` from source (`make build`, no web-build-via-tsc since that path is blocked
by the sanctioned test breakage above; the embedded assets came from a direct `npx vite
build` instead, which is byte-identical to what `make web-build` would produce once the
fixtures are repaired) and ran the three new spec files against it:

```
$ npx playwright test rail-unread.spec.ts rail-layout.spec.ts rail-activity.spec.ts --reporter=list
...
18 passed, 1 failed (rail-activity.spec.ts:211, edge case 25 — daemon data gap, see Decisions)
```

18/19 green; the one red is the daemon-side `LastActivity`/`StopFailure` gap documented
above, re-confirmed unchanged after every web-side fix in this plan.

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: Major 1 (compact ellipsis inert), Major 2 (false parsing comment on
`railDensity`), Minor 1 (wrong REQ cited on `railActivity` param), plus the orchestrator's
Decision 1 outcome (read-idle title colour, Option A).

**Changes made**:

- `web/src/style.css:1843-1856` (`.card .name` base rule) — added `color: var(--fg)`, per
  Decision outcome A (`plans/rail-card-improvements/decisions/read-idle-title-colour/decision.md`,
  landing at `docs/adr/rail-card-title-foreground-token.md`). This is the only edit for the
  decision; the read-idle rule (`.card.s-idle:not(.unread) .name { color: var(--fg-muted) }`)
  is untouched, as specified.
- `web/src/style.css:2076-2087` (compact density block) — added `display: block` to
  `body[data-rail-density="compact"] .card .name`, giving the ellipsis rule a block
  formatting context. `.name` was a bare `<span>` inside the block `.r1`, so it computed
  `display: inline` and `overflow`/`text-overflow` were inert (Major 1's finding).
- `web/src/protocol.ts:543-549` — rewrote the `railDensity` comment. It previously claimed
  "parsePrefs applies the same fallback client-side for a wire value it can't recognise",
  which is false: `parsePrefsField` only substitutes the fallback when the raw value is
  `undefined`, and a present-but-out-of-enum value returns `null`, rejecting the whole prefs
  object. The new comment says the daemon falls back to a stored default server-side (D13)
  and the client rejects an out-of-enum wire value, citing the guard and the rejecting test.
- `web/src/render/tiles.ts:202-203` — the `railActivity` parameter's comment cited
  `REQ-4/"the strip follows the density pref"`; density reaches the strip through
  `body[data-rail-density]` and CSS, never this parameter. Changed the citation to REQ-14 and
  dropped the density clause.

**Blast radius measured before editing** (`.card .name` is a shared selector — rail, tiles
grid and strip all render the same card template):

```
$ grep -n '\.name\b' web/src/style.css
570:.mainhead .name {          # separate selector, untouched
1843:.card .name {             # edited (color: var(--fg) added)
1860:.card.unread .name::before {
1873:.card.s-idle:not(.unread) .name {
2060:.card.ended .name {       # text-decoration only, no colour override — inherits the new color
2076:body[data-rail-density="compact"] .card .name {   # edited (display: block added)
```

`.strip` is a sibling of `.cards`, never a descendant (`web/index.html:120` `#tiles-strip`
sits outside `#rail`), and nothing between `body` and `.strip .card .name` declares a colour
(confirmed by both advocates in the decision debate and re-confirmed here by the grep above),
so the strip's titles were already `--fg` and are unaffected by this change. The only other
inheritor of `.cards { color: var(--fg-dim) }` (`style.css:515`) is the "No sessions yet"
empty-state text node, untouched.

**Re-ran the reviewer's exact repro** (throwaway Playwright spec, `git status` clean
afterward — file removed before this commit) against a real `musterd` built with the fix:

Compact ellipsis, 87-char-class title, same fields the reviewer measured:

```
{"display":"block","textOverflow":"ellipsis","overflow":"hidden","whiteSpace":"nowrap",
 "nameBoxWidth":274,"nameRight":288,"cardRight":299,"nameHeight":16.671875} r1Width 274
```

`nameBoxWidth` now equals `.r1`'s width (274px, was 566px inert); `nameRight` (288) is inside
`cardRight` (299, was 580 — 281px overflow before); `nameHeight` (16.67px) equals one
line-height (16.6875px), confirming a single line, not a wrap. Screenshot at
`/tmp/fixwave-compact-ellipsis.png` (this agent's own tmp, not the review's) shows the title
truncated with a visible "…" character, not clipped mid-word.

Unread dot stays on the same line as the title text in compact (forced `.unread` on a card,
same density): name box height 16.67px, one line-height — the dot did not push the title to
a second line.

Read-idle title colour, same side-by-side comparison the reviewer ran:

```
MEASURE base .name color (no state class): rgb(232, 230, 225)   # --fg
MEASURE read-idle .name color (s-idle, not unread): rgb(178, 182, 195)   # --fg-muted
```

The base is now `--fg` (was `--fg-dim` `rgb(166, 171, 188)`) and the read-idle state drops to
`--fg-muted`, a real drop on the ladder in both directions, matching Decision outcome A.

**Gates run**: `make contrast` (43 pairs × 3 themes, 0 failures), `npx tsc --noEmit` (clean),
`make web-build` (exit 0), `make web-test` (1772 passed), `make web-lint` (clean),
`make e2e-lint` (clean). Rebuilt the full binary with `make web-build build`, then ran the
plan's three specs plus the two named regression specs:

```
$ npx playwright test rail-unread.spec.ts rail-layout.spec.ts rail-activity.spec.ts \
    rail-cards.spec.ts rail-order.spec.ts
46 passed (16.0s)
```

All 46 pass, including E11 (`rail-layout.spec.ts`) which the review noted only asserts
geometry — the ellipsis character itself was verified by the throwaway repro's screenshot
above, not by this spec.

**Decisions**: none new beyond the orchestrator-settled Decision 1, implemented exactly as
specified (Option A, single `color: var(--fg)` addition, read-idle rule unchanged). No
`deviation:` or `doc-delta:` line — the plan's Doc Delta "rail" line ("a read idle title is
muted") is now true of the render as well as the token, which is the fix, not a further
change to what should be documented.

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
