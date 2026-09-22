# Plan: Rail Card Improvements 2

**Created**: 2026-09-22
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: rail-layout.spec.ts daemon (`railDensity` is daemon-global prefs and one test opens a second window); update.spec.ts startDaemon (release base URL and a staged versioned binary are computed per test); shell-activity.spec.ts daemon (indicator assertions depend on which session is auto-focused)
**Features**: rail, surfaces, update, settings
**Description**: Correct the rail card's density ramp and row order, reshape the shell done indicator into an actual tick, and add a user-initiated update check.

## Overview

Four reported issues, three of them style-only and one a small protocol addition. #49 and #50
both amend `kb:adr/rail-card-state-row-then-wrapping-title`, four commits old; #51 is a
geometry bug in a CSS-drawn glyph; #48 adds the one update affordance that never shipped.

Every CSS claim below was measured in the built dashboard rather than read off the
stylesheet, per `kb:lesson/mockup-vindicates-markup-not-cascade`. With one long activity
line at a 1400px viewport: a comfortable card is **248.5px** with the activity line running
to 8 unclamped lines, an expanded card is **169.8px** with it clamped to 3. Expanded is 79px
shorter than comfortable — the reported inversion, and the ADR and `docs/features/rail/spec.md`
both describe it in prose, so the accepted design is what is wrong rather than the
implementation drifting from it. In compact, `.r3` measures 13px and the card 81.7px whether
`.r3 .ctx` is `display: none` or forced visible at its full 52px width, so restoring the
gauge track there costs no vertical space at all. The done indicator computes to a 9×9 box
showing only `border-bottom` and `border-left` under `rotate(-45deg)`, giving two equal arms
— a symmetric chevron. Rendering the three candidate boxes at 5× settles the fix: the arm
drawn by `border-bottom` becomes the **up-right** stroke and the one drawn by `border-left`
the **up-left** stroke, so a tick needs the box **wider than tall** (9×5), not taller than
wide. The backlog entry for #51 has this inverted; do not follow it.

#48's daemon work is nearly all present. `updateManager.checkAvailability` already performs
the whole check and `selfupdate.LatestTag` already bounds itself with a 10 s
`selfupdate.CheckTimeout`, so a synchronous endpoint needs no new timeout and no new
concurrency. What it needs is an error return, so that one code path serves both the tick
loop (which logs and stays silent, as today) and a button press (which must say what went
wrong). The pref that governs checking is re-scoped to govern only the *automatic*
schedule.

## Requirements

### Must Have

- [ ] REQ-1: Comfortable clamps the activity line to three lines; expanded leaves it
  uncapped. The two existing density blocks swap behaviour; compact continues to drop the
  line entirely, so the ramp compact ≤ comfortable ≤ expanded is monotonic in card height.
- [ ] REQ-2: Every activity line carries its full text as a hover `title`, the way `.name`
  and `.r2` already do. REQ-1 introduces clamping at the default density, where text is
  fully visible today; without this the swap hides text with no way to read it.
- [ ] REQ-3: Compact renders the context gauge track. The rule that hides it is removed.
- [ ] REQ-4: The card's title row precedes its state row. `.r1` (title) and `.r0` (badge,
  timer, pin) swap position in the template; the pin travels with the badge and timer
  rather than lifting above the title.
- [ ] REQ-5: The density margin rhythm keys on row *position*, not row class — whichever
  row leads `.card-in` takes no top margin and the row below it takes the 4px (comfortable)
  or 2px (compact) step.
- [ ] REQ-6: `.shellact[data-act="done"]` is wider than it is tall, so its two arms are
  unequal and the glyph reads as a tick. `.shellact[data-act="busy"]` stays square on every
  surface, since a spinner is a circle.
- [ ] REQ-7: `POST /api/update/check` performs one release check synchronously and returns
  the resulting update object, or an error naming why the check could not be completed.
- [ ] REQ-8: `prefs.updateCheck` governs the daemon's automatic checking only. A
  user-initiated check runs regardless of it, and its result is kept and broadcast rather
  than discarded.
- [ ] REQ-9: The update object carries `canCheck`, true iff the daemon can perform a check
  at all — updates enabled by flag and the install kind is not `dev`.
- [ ] REQ-10: The Settings dialog's Updates section carries a `Check now` button, enabled
  whenever `canCheck` is true and no check of its own is in flight.
- [ ] REQ-11: The Available readout carries the age of the last successful check when
  `checkedAt` is non-null, and the readout's disabled-check branch is removed entirely.
- [ ] REQ-12: A failed user-initiated check renders its reason in the Updates status line
  and leaves the previous readout intact.

### Should Have

- [ ] REQ-13: `Check now` is disabled for the duration of its own request, so a double
  click cannot open two checks from one window.

### Nice to Have

- None.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval; `docs/features/<f>/contract.md`
regenerates).

### HTTP: POST /api/update/check

**Auth**: UI cookie (401 `unauthorized`). No request body; any body sent is ignored.

Performs one check against the `/releases/latest` redirect of `-update-base-url`
synchronously — the same path the periodic tick takes, bounded by the existing
`selfupdate.CheckTimeout` (10 s). On success it updates `available` and `checkedAt`,
broadcasts `update` (`kb:anchor/ws.update`) and returns the new object. It runs regardless
of `prefs.updateCheck`, which governs only the daemon's own schedule, and its result is
never discarded on account of that pref.

**Response 200:** the `update` object, identical in shape to `kb:anchor/ws.update`'s
`update` field:

```jsonc
{ "running": "0.13.0", "install": "installer", "remedy": null,
  "canCheck": true,                      // boolean — see ws.update
  "available": "0.14.0",                 // string|null — as ws.update
  "checkedAt": "2026-09-22T10:04:00Z",   // RFC3339 — non-null on every 200
  "installed": null,
  "apply": { "phase": "idle", "version": null, "error": null } }
```

**Errors:**

- 404 `not_found` — updates are disabled (`musterd -update-base-url ""`) or the install is
  `dev`; i.e. exactly when `canCheck` is false.
  `{ "error": { "code": "not_found", "message": "update checking is not available for this install" } }`
- 409 `shutting_down` — the daemon is already shutting down.
  `{ "error": { "code": "shutting_down", "message": "musterd is shutting down" } }`
- 502 `check_failed` — the release host could not be reached, or the latest tag is not a
  release version. The message names the reason; it never includes the response body.
  `{ "error": { "code": "check_failed", "message": "requesting https://example.test/releases/latest: connection refused" } }`

### WS: daemon→UI `update` — one field added

`kb:anchor/ws.update`'s `update` object gains one field, between `remedy` and `available`:

```jsonc
{ "canCheck": true }   // boolean — true iff a release check is possible at all: -update-base-url is non-empty AND install is not "dev". Constant for the daemon's life (both inputs are fixed at startup) and independent of prefs.updateCheck, which governs only the automatic schedule. False means POST /api/update/check returns 404.
```

Two existing sentences in the same anchor change with it:

- `available`'s comment loses `when prefs.updateCheck is false` as a reason for null, and
  gains that a check may be automatic or user-initiated. It becomes:
  `// string|null — a strictly newer release from the last successful check, automatic or user-initiated; null when none, when install is "dev", when checking is disabled by flag, or after prefs.updateCheck was turned off, which clears it`
- The closing paragraph's `with updateCheck false the daemon makes no update-related
  request at all` becomes `with updateCheck false the daemon starts no check of its own;
  kb:anchor/update.check still performs one on request`.

And in the prefs section, `updateCheck`: `governs **checking only**` becomes `governs the
daemon's **automatic checking only**`. Its documented side effects are unchanged — `false`
still clears `available`/`checkedAt` and broadcasts, `true` still triggers an immediate
check.

`snapshot.update` carries `canCheck` like every other field; no separate delta.

## Schema Changes

No schema changes required.

## UI Specifications

Binding design authority: `docs/design/design-system.md` § 5 Components ("Rail card", which
this plan rewrites), § 3 State colour is meaning, never decoration, and § 6 Honesty rules.
No mockup governs this plan — the reference render for the card is the shipped comfortable
card, measured above.

### Views

- **Rail card** (`#sessions`, and the Tiles strip, which shares the template) — row order
  and density behaviour change; no content is added or removed.
- **Surface segment** (`.surfseg`, in the Focus mainhead and in each tile footer) — the
  done indicator's shape changes; nothing else.
- **Settings dialog → Updates** (`#settings-update`) — gains a `Check now` button and an
  age suffix on the Available readout.

### Card anatomy, after REQ-4

Down the left edge, outside the rows, `.stripe` keeps its full-height state colour. Inside
`.card-in`, in order:

1. `.r1` — the title, wrapping (one line with an ellipsis in compact). The unread dot
   stays as `.name::before`.
2. `.r0` — badge, timer (pushed right by `margin-left: auto`), pin.
3. `.r2` — repo · branch, single line, ellipsised.
4. `.r3` — gauge track, percent, tokens, compaction count. The track now renders in all
   three densities.
5. `.activity.you`, 6. `.activity.claude` — clamped to three lines in comfortable,
   uncapped in expanded, absent in compact; each carries its full text as `title`.
7. `.note` — the reason line. 8. `.acts-row` — hover-revealed actions.

Rows 3–8 are untouched by the reorder.

### User Flows

1. The user opens Settings and presses `Check now`. The button disables, the daemon
   performs one check, and on success the Available readout and the Settings badge update
   from the broadcast. The button re-enables.
2. The check fails. The status line under the buttons names the reason; the Available
   readout keeps whatever it showed before, so a transient network failure never erases a
   known version.
3. The user turns "Check for updates daily" off, then presses `Check now`. The check runs
   and reports. Turning the toggle off in the first place still cleared `available` and
   `checkedAt`, as it does today.

### States

- **No data yet**: `checkedAt` null → the Available readout reads `not checked yet` with no
  age suffix. Unknown context in a card renders `ctx unknown` as plain text with no `.ctx`
  element at all (`kb:adr/usage-unknown-renders-word-not-track`), so REQ-3 can never
  produce an empty track.
- **Data**: the Available readout reads `up to date · checked 2m ago`, or
  `v0.14.0 · checked now`.
- **Daemon down**: the Settings dialog and the restart confirm close on a `status` change,
  as they do today. `Check now` needs no separate treatment; it is unreachable once the
  dialog is closed.
- **Check not possible** (`canCheck` false): `Check now` is disabled. This is the state
  every E2E daemon that sets an empty base URL is in, and a dev build is in it too, since
  `selfupdate.ParseRelease` cannot parse a dev version string and the comparison that
  produces `available` would never run.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Check-now button | `button` | `Check now` | `#update-check-button`, in `.update-actions` inside `#settings-update`, before the two apply buttons |
| Available readout | — | `up to date · checked 2m ago` | `#update-available`, a `<dd>`; one element's own `textContent`, so no sibling concatenation. Separator is a space-padded `·`, matching `.r2`'s `repo · branch`. With `checkedAt` null the value is the bare `not checked yet` — no separator, no suffix |
| Updates status line | `status` | — | `#update-status` already carries an explicit `role="status"` |
| Shell done indicator | — | — | `span.shellact[data-act="done"]`, `aria-hidden`. Presence and `data-act` stay the contract; REQ-6 adds a computed-geometry assertion. No role — it is a bare `<span>` |
| Shell busy indicator | — | — | `span.shellact[data-act="busy"]`, as above |
| Card title row | — | — | `.r1`, now the first child of `.card-in` |
| Card state row | — | — | `.r0`, now the second child |
| Context gauge track | — | — | `.r3 .ctx`, present in all three densities |

### Invariants

- **INV-1 (density ramp is monotonic).** For any one session at any one moment, card height
  in compact ≤ comfortable ≤ expanded. Assert from all three densities against both a short
  activity line and one long enough to exceed three lines — the short case is the one where
  a naive clamp swap still passes and the long case is the reported bug.
- **INV-2 (the pref still governs the schedule).** While `prefs.updateCheck` is false the
  daemon issues no `/latest` request of its own, on a tick or at startup. This is the half
  of `kb:adr/update-check-pref-governs-checking-only` that survives, and it is what makes
  "off" verifiable; only the user-initiated path is carved out.
- **INV-3 (indicator shape, on every hosting view).** `[data-act="busy"]` computes equal
  width and height, and `[data-act="done"]` computes width strictly greater than height —
  asserted in **both** views that host a surface segment, the Focus mainhead and the tile
  footer, because `.tfoot .surfseg .shellact` overrides the size and would otherwise
  silently keep the 7×7 square.
- **INV-4 (row order, on every surface).** The title row precedes the state row on a rail
  card **and** on a Tiles strip card; the two share one template, so a fix applied to only
  one is a fix applied to neither.
- **INV-5 (a check never leaves the browser).** No dashboard code path reaches the release
  host; every check is a daemon request. `kb:adr/update-check-runs-in-daemon-daily`.

### Carried-over measurements

Every measurement in the Overview was taken in this session against the current `main`
build at a 1400px viewport, so nothing is carried over from a different configuration.
`selfupdate.CheckTimeout` (10 s) was measured for the periodic path and is re-used here for
a request-bound path — re-checked against decision REQ-7: still valid, because the timeout
bounds `LatestTag`'s own HTTP round trip and is independent of who called it; what changes
is only that a client is now waiting on it, and 10 s is inside Playwright's 15 s expect
timeout with margin.

## Affected Files

### Daemon

- `internal/server/update.go` — `checkAvailability` gains an `error` return and a `manual
  bool` parameter (the mid-flight "pref was turned off" discard applies only to the
  automatic path); `tick` logs the error at debug exactly as today; a new
  `handleCheckUpdate` maps the error to 404/409/502; `mount` registers `POST
  /api/update/check`; `UpdateInfo` gains `CanCheck bool \`json:"canCheck"\``; `Current` and
  `updateFeature.current` populate it.
- `internal/server/update.go` — a new sentinel `errCheckFailed` beside the three existing
  ones.

### Web

- `web/index.html` — swap `.r1` above `.r0` in `#session-card-template`; add
  `<button type="button" id="update-check-button" class="btn">Check now</button>` as the
  first child of `.update-actions`.
- `web/src/style.css` — swap the `-webkit-line-clamp` block between the comfortable base
  and `body[data-rail-density="expanded"]`, keeping expanded's companion
  `.activity[hidden]` rule wherever the `display` override ends up
  (`kb:lesson/display-rule-overrides-hidden-attribute`); delete
  `body[data-rail-density="compact"] .r3 .ctx { display: none }`; move the `.r1`/`.r0` top
  margins so they follow position (REQ-5), in the base block and in the compact block;
  reshape `.shellact[data-act="done"]` to 9×5 and re-tune its `margin-top` optical nudge;
  split the `.tfoot .surfseg .shellact` override so `[data-act="done"]` is 7×4 and
  `[data-act="busy"]` stays 7×7.
- `web/src/render/sessions.ts` — set `title` on each activity line alongside `textContent`
  (REQ-2), clearing it when the line is hidden.
- `web/src/protocol.ts` — `UpdateInfo` gains `canCheck: boolean`, with its wire validator.
- `web/src/api.ts` — a `checkForUpdate()` call posting to `/api/update/check`.
- `web/src/render/update.ts` — `UpdateViewModel` gains `checkEnabled` and `checkBusy`;
  `availableText` drops its `!updateCheck` branch and appends the age via
  `agoSuffix(formatAge(...))` from `web/src/sessions/format.ts`; `statusText` renders a
  failed manual check; `UpdateSectionElements` gains `checkBtn`; `renderUpdateSection`
  writes its disabled state.
- `web/src/features/update.ts` — owns the in-flight flag and the `check()` handler, and
  exposes `checkBtn` on `UpdateHandle` for `settings.ts` to wire, matching how `toggle`,
  `applyBtn` and `restartBtn` are already shared.
- `web/src/features/settings.ts` — one listener registration for the new button.

### Tests (owned by the test agents, listed for routing only)

- `internal/server/update_test.go` — daemon-tests.
- `web/src/render/update.test.ts` — web-tests. Its disabled-check readout case (line 115)
  is deleted with the branch.
- `web/src/render/sessions.test.ts` — web-tests. Its `FakeDomNode` card fixture comment at
  line 307 describes the old row order and must follow REQ-4.
- `web/e2e/rail-layout.spec.ts`, `web/e2e/shell-activity.spec.ts`,
  `web/e2e/update.spec.ts`, `web/e2e/helpers/releases.ts` — e2e-specs. The helper needs a
  way to make `/latest` fail for E11; stopping the fake server is sufficient and needs no
  new tamper kind.

## Edge Cases

1. A comfortable card whose activity line exceeds three lines — the text beyond line three
   is unreachable without REQ-2's hover title, which is a regression the swap introduces
   rather than one it inherits. → E1, W11
2. An activity line short enough to fit in one line — the clamp is inert and comfortable
   and expanded render identically. INV-1 must still hold (equal, not inverted). → E2
3. A card in compact with unknown context: `render/context.ts` sets `.r3.unk` with plain
   text and builds no `.ctx` element, so REQ-3 cannot produce an empty track. → E6
4. A hidden activity line in expanded, where `display: -webkit-box` outranks
   `.activity[hidden]` — the companion higher-specificity rule must move with whichever
   block ends up owning the `display` override. → E4
5. A wrapping, multi-line title with REQ-4's order: the pin stays in `.r0` below it, so no
   baseline-alignment question arises between a control and a growing block. → E5
6. A Tiles strip card, which shares the template — the reorder and the densities must
   follow there too. → E5 (shared with edge case 5)
7. A dead card (`.card.ended`, struck-through name, greyed) under REQ-4 — the strike is on
   `.name`, which moves with its row. → E5 (shared with edge case 5)
8. A manual check while `prefs.updateCheck` is false: it runs, and its result must survive
   the discard guard that exists for the automatic path. → D10
9. A manual check that arrives while the pref is turned off mid-flight: unlike the
   automatic case, the result is kept. → D10 (shared with edge case 8)
10. A manual check on a daemon with an empty `-update-base-url` (`f.um == nil`) → 404, and
    `canCheck` false disables the button before the user can reach that. → D5, E12
11. A manual check on a `dev` install → 404, for the same reason; `canCheck` false. → D6
12. A manual check on a `homebrew` or `unmanaged` install → succeeds. Checking is allowed
    for every install kind but `dev`; only *applying* is restricted
    (`kb:adr/update-install-kinds-decide-who-may-apply`). → D1
13. The release host is reachable but its latest tag is not a release version (e.g. a
    `nightly` tag) → 502, where the periodic path logs and stays silent. → D4
14. A manual check racing a periodic tick: both call the same method, the field writes are
    under the existing mutex, and the worst case is two `/latest` requests and two
    broadcasts. No serialisation is added. → D9
15. A manual check while an apply is in flight: permitted — a check writes only
    `available`/`checkedAt` and touches no apply state. → D1 (shared with edge case 12)
16. A double click on `Check now` → the button is disabled for its own request's duration,
    so one window opens one check. → W4
17. A second window open during a manual check: it never enters the in-flight state and
    learns the result from the broadcast, like any other update change. → D9 (shared with edge case 14)
18. The daemon is shutting down when the check arrives → 409. → D7
19. `checkedAt` null (never checked, or just cleared by toggling the pref off) → the
    Available readout carries no age suffix rather than an empty separator. → W6, E10
20. A check that completes in under a second → `agoSuffix` yields the literal `now`, so the
    readout reads `checked now`, never `now ago`. → W5
21. A pre-plan daemon that sends no `canCheck` at all → `parseSnapshot` tolerates it and
    the button is disabled, the same shape `update === null` already produces. → W2
22. The busy spinner in the tile footer, where a shared 7×7 override would keep it square
    only by accident once `done` changes shape. → E8

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon

- **D1**: `POST /api/update/check` returns 200 carrying the update object after a
  successful check against the release host.
- **D2**: A successful `POST /api/update/check` sets `checkedAt` to the time of that check.
- **D3**: `POST /api/update/check` returns 502 `check_failed` when the release host is
  unreachable.
- **D4**: `POST /api/update/check` returns 502 `check_failed` when the latest tag is not a
  release version.
- **D5**: `POST /api/update/check` returns 404 `not_found` on a daemon started with an
  empty `-update-base-url`.
- **D6**: `POST /api/update/check` returns 404 `not_found` when the install kind is `dev`.
- **D7**: `POST /api/update/check` returns 409 `shutting_down` once the daemon is shutting
  down.
- **D8**: `POST /api/update/check` returns 401 for a request without the UI cookie.
- **D9**: A successful `POST /api/update/check` broadcasts exactly one `update` message.
- **D10**: `POST /api/update/check` performs its check and keeps the result while
  `prefs.updateCheck` is false.
- **D11**: With `prefs.updateCheck` false, the daemon issues no `/latest` request of its
  own across two check intervals.
- **D12**: `canCheck` is true iff `-update-base-url` is non-empty and the install kind is
  not `dev`.
- **D13**: A failed periodic check leaves `available` and `checkedAt` unchanged and
  broadcasts nothing.

### Web

- **W1**: The Updates section renders a button named `Check now`.
- **W2**: `Check now` is disabled while `canCheck` is false.
- **W3**: `Check now` is enabled while `prefs.updateCheck` is false and `canCheck` is true.
- **W4**: `Check now` is disabled for the duration of its own request.
- **W5**: The Available readout appends ` · checked <age>` when `checkedAt` is non-null.
- **W6**: The Available readout carries no age suffix when `checkedAt` is null.
- **W7**: No web source or spec renders the disabled-check readout string that
  `availableText`'s `!updateCheck` branch produces today.
- **W8**: A failed check renders its reason in the Updates status line.
- **W9**: New web code introduces no `any` types.
- **W10**: `#session-card-template` places `.r1` before `.r0` inside `.card-in`.
- **W11**: Each activity line carries its full text as a `title` attribute, cleared when
  the line is hidden.
- **W12**: The density top-margin rules key on the leading and following row's position
  rather than being copied verbatim onto the swapped class names.
- **W13**: Exactly one code path performs a release check, shared by the tick loop and the
  request handler.

### E2E

- **E1**: A long activity line clamps to three lines in comfortable and runs past three in
  expanded.
- **E2**: For one session, card height is never greater in comfortable than in expanded,
  for both a short and a long activity line.
- **E3**: A compact card renders a visible context gauge track.
- **E4**: A compact card renders no activity line, and a card with no activity text renders
  none in expanded either.
- **E5**: The title renders above the state row on a rail card and on a Tiles strip card.
- **E6**: A compact card with unknown context renders the word and no gauge track.
- **E7**: The done indicator computes a width greater than its height in the Focus mainhead
  and in a tile footer.
- **E8**: The busy indicator computes equal width and height in the Focus mainhead and in a
  tile footer.
- **E9**: Pressing `Check now` with a newer release published shows that version in the
  Available readout and badges the Settings button.
- **E10**: With daily checking off from startup, the Available readout reads `not checked
  yet` and pressing `Check now` replaces it with a readout carrying a checked age.
- **E11**: Pressing `Check now` against a stopped release host shows a reason in the status
  line while the Available readout keeps its previous value.
- **E12**: `Check now` is disabled on a daemon started with an empty update base URL.

### Automated Checks

```checks
D20 make test
D21 make lint
W7 ! rg -n "checking disabled" web/src web/e2e
W20 make web-build
W21 make web-test
W22 make web-lint
W23 make contrast
E20 make e2e
```

W7's grep deliberately includes test and spec files. Its literal lives today at
`web/src/render/update.ts:49` (the `!updateCheck` branch of `availableText`),
`web/src/render/update.test.ts:115-120` and `web/e2e/update.spec.ts:166,190`; REQ-11 deletes
the behaviour, so no file has a legitimate need for it and each of the three owners is named
under Affected Files. There is no boundary-test exemption to arrange — nothing needs the
literal to exercise a wire shape.

### Reviewer-Verified

- **W9**: no `any` types in new web code.
- **W10**: `#session-card-template` places `.r1` before `.r0` — a markup read; E5 covers
  the rendered consequence.
- **W12**: the density margins follow row position, not the old class-to-margin pairing.
- **W13**: `checkAvailability` is the single check path, called by both `tick` and the
  handler, with the error returned rather than swallowed.
- **INV-5**: no dashboard code path requests anything from the release host.

## Doc Delta

**rail** — becomes true:
- `docs/features/rail/spec.md` says a card is a title that wraps, above a state row of
  badge, time in the current state and pin.
- `docs/features/rail/spec.md` says compact clamps the title to one line and drops the
  activity line, comfortable clamps the activity line to three lines, and expanded lets it
  run to whatever it needs.
- `docs/features/rail/spec.md` says the activity line carries its full text as a hover
  title, alongside the repo line and the title.

**rail** — stops being true:
- "A card is a state row (badge, time in the current state, pin) above a title that wraps".
- "compact clamps the title to one line and drops the gauge track and the activity line,
  expanded lets the activity line run to three lines".

**update** — becomes true:
- `docs/features/update/spec.md` says the `updateCheck` preference governs automatic
  checking only, and that a user-initiated check runs regardless of it.
- `docs/features/update/spec.md` says the Updates section carries a Check now button and
  shows how long ago the last successful check ran.
- `docs/protocol.md` carries `kb:anchor/update.check` and documents `canCheck` under
  `kb:anchor/ws.update`.

**update** — stops being true:
- "turning it off clears the available version and stops every update-related request" —
  the second half only; the clearing still happens.
- `ws.update`'s "null when ... `prefs.updateCheck` is false" as a reason `available` is
  null.
- the prefs section's "`updateCheck`: governs **checking only**".

**settings** — becomes true:
- `docs/features/settings/spec.md` says Updates shows a Check now button beside a "Check
  for updates daily" toggle that governs automatic checking only.

**settings** — stops being true:
- "a \"Check for updates daily\" toggle that governs checking only".

**surfaces** — no doc change. `docs/features/surfaces/spec.md` already says the segment
"shows a spinner while busy and a tick once work finishes"; REQ-6 makes the code match the
sentence rather than the sentence match the code.

## Out of scope

- **The `usage.sampledAt` staleness cue.** REQ-11 surfaces `update.checkedAt`, not the
  masthead gauges' sample age. Different field, different surface; the `TODO.md` note about
  it stays open and untouched.
- **Making a check work on a dev build.** `selfupdate.ParseRelease` cannot parse
  `v0.13.0-4-ge5102b8`, so the comparison that produces `available` would never run and the
  answer would always be "up to date" regardless of what is published. `canCheck` is false
  there deliberately.
- **Letting the browser reach the release host.** The daemon checks; the dashboard asks the
  daemon. INV-5.
- **A density pass over `.note` and the snapshot line.** #49 names the activity line and
  the gauge track only.
- **Anything about `#17`'s session-summary line**, which needs a model call and its own
  `/spec` pass.

No new backlog entry.

## Implementation Notes

**Do not follow the #51 entry in `TODO.md`.** It prescribes "a box roughly half as wide as
it is tall", which produces a *reversed* tick (long stroke down-left). The correct shape is
half as tall as it is wide. Derivation, confirmed by rendering all three candidates at 5×:
`border-bottom` draws the box's bottom edge, length = width; `border-left` draws its left
edge, length = height; they meet at the bottom-left corner. Under `rotate(-45deg)` the
bottom edge maps to the **up-right** stroke and the left edge to the **up-left** stroke. A
tick has a short up-left arm and a long up-right one, so `height < width`. `box-sizing:
border-box` is global, so the declared width and height *are* the arm lengths.

**Density blocks, cascade discipline.** The comfortable clamp is the base `.activity` rule
and expanded's override is removed, or the two swap — either way, whichever block declares
`display` must keep a companion `.activity[hidden] { display: none }` at matching-or-higher
specificity, per `kb:lesson/display-rule-overrides-hidden-attribute`. Compact's existing
unconditional `display: none` already collapses both cases and needs no companion; do not
"tidy" it into a `:not([hidden])` form.

**Measure the effect, not the diff.** Every REQ-1/REQ-3/REQ-6 claim is a computed property:
the clamp is `display` plus `-webkit-line-clamp` plus rendered box height against one line
height; the restored track is `getComputedStyle(.ctx).display` plus a non-zero width; the
tick is computed `width` against computed `height`. Read them in the built app before
claiming them (`kb:lesson/mockup-vindicates-markup-not-cascade`). The numbers in the
Overview are the current-state baseline to compare against.

**The synchronous check is one path, not two.** `checkAvailability` keeps ownership of
fetch → parse → compare → write → `emit()`. Give it an `error` return and a `manual bool`;
`tick` passes false and logs at debug (preserving D13), the handler passes true and maps
the error. Resist adding a second fetch in the handler — that is how the two paths drift.
`selfupdate.LatestTag` already applies `selfupdate.CheckTimeout`, so no timeout is added at
the handler.

**Go doc comments must not contain paired backticks or `''`** — `gofmt` rewrites them to
curly quotes silently (`docs/conventions.md` § Go). The new `canCheck` field's comment and
`handleCheckUpdate`'s doc comment are both places this bites.

**Decisions this plan makes** — three `status: proposed` ADRs in `docs/adr/`, each
`refs: [plan:rail-card-improvements-2]`:

1. `rail-card-title-leads-and-density-ramp-corrected` — **supersedes**
   `kb:adr/rail-card-state-row-then-wrapping-title`. It must restate what survives from
   that decision (the three-step `railDensity` pref chosen from an icon control in the rail
   head; the New session button living in the masthead; density applied from the prefs echo
   and never from the click; cards varying in height so nothing is positioned by row count)
   and change only the row order and the density ramp. The old ADR's rejected option B is
   the nearest neighbour to what is now chosen and should be named as such.
2. `update-check-pref-governs-automatic-checking-only` — **supersedes**
   `kb:adr/update-check-pref-governs-checking-only`. Restates that applying is never
   automatic and that "off" is verifiable for the daemon's own schedule (INV-2); carves out
   the user-initiated check; records `canCheck` as its consequence.
3. `update-manual-check-is-a-synchronous-post` — why the endpoint blocks and returns the
   result rather than returning 202 and reporting through a `check.phase` on
   `ws.update`: one code path instead of two, failure carried by a status code instead of a
   new wire field, and no reason to broadcast an in-flight spinner to windows that did not
   ask for one. Also records POST over PUT — the client supplies no representation and the
   outcome comes from GitHub, so it is an action, not an idempotent replacement.

**Doc upkeep — the orchestrator's, not an impl agent's** (`kb:lesson/plan-gave-no-single-owner`):

- `docs/design/design-system.md` § 5 "Rail card" describes both the old row order ("then a
  mono state row (badge, timer, pin), then the title") and the old ramp ("compact ... hides
  the gauge track and activity line, expanded lets the activity line run to three lines").
  Both sentences are wrong after this plan. `doc-reconcile` does not cover
  `docs/design/`, so this is the Doc-Upkeep Backstop's, in the same commit as the CSS.
- `TODO.md`: tick and move the #48, #49, #50 and #51 entries to
  `docs/history/todo-done.md` under their existing headings. The "Together — rail card
  layout, second pass (#49, #50)" heading goes with them.
- `docs/features/*/spec.md` and `docs/protocol.md`: the Doc Delta above, via
  `/doc-reconcile`.
- Then `make gen-kb && make check-kb`.

**No diagram.** This plan changes no state machine, hook sequence, schema or component
boundary; the card anatomy is prose in the feature spec and the design system, and
`kb:diagram/web-components` is unaffected by adding one call to an existing feature module.
