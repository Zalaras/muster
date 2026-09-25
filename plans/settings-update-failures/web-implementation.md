# Web Implementation: Settings Update Failures

**Plan**: settings-update-failures
**Mode**: initial
**Pack**: `kb: pack 13179 words (budget 8000)` — WARN exceeds budget; sections rules 1117 · features 5124 · diagrams 0 · decisions 3642 · proposed 0 · facts 71 · lessons 2575 · runbooks 644

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/features/updaterestart.ts` | created | REQ-13–19: the in-memory restart record, the pure `computeBannerOverride(record, status, now, confirmation)` decision (REQ-14/15/17/19), the `sessionStorage` reload handoff via `storage.ts`'s existing `readJson`/`writeJson`/`removeItem` (REQ-16), and the first-snapshot-only confirmation arm (REQ-17). |
| `web/src/features/connection.ts` | modified | `initConnection` takes a new `ConnectionDeps` (`restartBanner`); banner rendering moves out of the status-change callback into its own `app.onRender` phase so REQ-15's 30 s fallback and REQ-17's 3 s hide re-evaluate every tick, not only on connect/disconnect. Falls through to the unchanged ordinary daemon-down text/tokens when the override is `null`. |
| `web/src/render/banner.ts` | modified | New `renderBannerContent(el, text, neutral)` writes the composed text and toggles the REQ-19 `.neutral` modifier; the existing `renderBanner(el, visible)` (visibility only) is untouched — its own test (`render/banner.test.ts`) still calls it exactly as before. |
| `web/src/ws.ts` | modified | New optional `WsClientHandlers.onHelloArrived`, fired unconditionally at the top of the `hello` branch in `dispatch`, before the `isSupportedProtocolVersion` gate — so a subscriber sees every hello, matched or mismatched (REQ-16). |
| `web/src/wsapp.ts` | modified | `dashboardWsHandlers` relays `onHelloArrived` onto `app.emit("helloReceived")` — the pop-out (`coreWsHandlers`, `doc.ts`) never wires it, matching the module's existing "dashboard-only messages" boundary. |
| `web/src/app.ts` | modified | New `AppEvents.helloReceived` member — the app-event-bus hop between `wsapp.ts` and `features/updaterestart.ts`, matching every other WS signal's plumbing (`update`, `usage`, …). |
| `web/src/main.ts` | modified | Registers `initUpdateRestart(app)`; passes its `bannerOverride` into `initConnection`'s new deps; documents the new banner render phase (11) in the existing numbered-phase comment. |
| `web/index.html` | modified | `#banner`'s static daemon-down text removed — `connection.ts` now writes all three texts (ordinary/restarting/confirmed) itself; `role="alert"` and `hidden` stay static markup. |
| `web/src/style.css` | modified | `.banner.neutral` — REQ-19's informational style (`--bg-raised`/`--line-control`/`--fg-muted`), reusing tokens already gated by `make contrast` (no new pair needed — `--fg-muted`/`--bg-raised` was already in `contrast-pairs.json`). |

REQ-1–REQ-12 are daemon-side only; the web side renders `update.apply.error`/the 502 message as-is per the plan ("The web side renders the daemon's text as it does today") — confirmed unchanged by running E1–E4 live (see Handoff).

## Decisions

- design: `computeBannerOverride`'s signature is exactly the plan's own
  `(record, connection, now, confirmation) → banner view` (Affected Files note on
  `updaterestart.ts`), returning `BannerOverride | null` with the text fully composed —
  `render/banner.ts`'s own invariant ("every displayed string comes from a pure
  view-model... a builder never composes a second copy") pushed composition into the
  feature layer, mirroring `updateview.ts` → `render/update.ts`'s existing split. `null`
  means "no override"; `connection.ts` owns the ordinary daemon-down fallback text itself,
  so REQ-13-19's pure function only needs to express the two *new* cases (restarting,
  confirmed) rather than re-deriving the unchanged case too.
- design: hello arrival crosses `ws.ts` → `wsapp.ts` → `app.emit("helloReceived")` →
  `features/updaterestart.ts`'s own `app.on`, not a direct `dashboardWsHandlers(...,
  updateRestart)` method call. Grepped the existing shape first (`rg -n "app\.emit\(\"update" web/src/wsapp.ts` and the `onUsage`/`onShellActivity` handlers beside
  it) — every other WS signal a feature needs already funnels through the event bus this
  same way, so hello-arrival follows it rather than inventing a second wiring style.
- design: `ConnectionDeps.restartBanner`'s return type is a locally-defined anonymous
  shape (`{ text: string; neutral: boolean } | null`), not an imported `BannerOverride`
  from `features/updaterestart.ts`. Grepped for the "no controller imports a sibling"
  precedent (`features/tiles.ts:18` and `features/focus.ts:7`'s own comments: "never by
  importing `ActionsHandle`/... from their owning sibling modules") — connection.ts's own
  deps interface follows the same structural-typing discipline rather than a type import
  that would compile fine (TS is structural) but violate the stated rule.
- design: `renderBanner(el, visible)` keeps its exact pre-plan 2-arg contract; a new
  `renderBannerContent(el, text, neutral)` was added alongside it rather than folding text
  into `renderBanner` itself, specifically so `render/banner.test.ts` (owned by
  web-tests, not editable by me) keeps compiling and passing unmodified — confirmed via
  `npx vitest run`: 73 files / 1770 tests passed, including that file's two existing
  cases, with no changes to it.
- Every REQ this plan lists for the web side (REQ-13 through REQ-19) is implemented above;
  REQ-1–REQ-12 are daemon-only and out of this log's scope by the plan's own Affected
  Files split.

## Handoff

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0 — both clean, no web test files needed changes.

- `npm run -s lint` (Biome check+format): clean, "Checked 250 files ... No fixes applied."
- `npx vitest run`: 73 files / 1770 tests passed (no test file touched).
- `make contrast`: 43 pairs × 3 themes, 0 failures (reused existing gated tokens, no new pair).
- `make size-warn`: 67 pre-existing hits, none in any file this plan touched.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py`: 693 references checked, 0 missing.
- `make check-kb`: 435 records, 0 problems.
- Smoke run of the plan's own E2E specs (`make web-build build` from the project root,
  then from `web/`): `npx playwright test e2e/update.spec.ts` — **25/25 passed**, including
  all 5 new tests (E1 git-tree remedy, E2 unwritable-dir remedy, E3 check-failure sentence,
  E4 apply-failure sentence, E5/E6 combined restart-reload/confirm/Running-readout flow) and
  all 20 pre-existing tests in the file — this exercised daemon-impl's parallel changes too
  (already present in this shared worktree: `internal/selfupdate/*`,
  `internal/server/update*.go`, `internal/server/updatereclassify.go`), so it's real
  end-to-end confirmation, not just a web-side unit check. Also ran
  `e2e/resilience.spec.ts` (3/3 passed — ordinary daemon-down banner text/visibility intact)
  and `e2e/terminal.spec.ts`'s "daemon down while a terminal is attached" test (1/1 passed —
  the `/musterd unreachable/` regex pin still matches).
- No test file needed a change; the one place I was tempted (`render/banner.test.ts`) was
  avoided by design (see Decisions).

No `docs/` edits made (not my job); no doc-delta beyond what the plan's own Doc Delta
already stages — what shipped matches it (banner reads "updating" during an update
restart, falls back to unreachable at 30 s, reloads on first reconnect, confirms
`Updated to v…` for 3 s).

## Fix Attempt 1 (review cycle 1)

**Failures addressed**: browser Major 1 (Settings dialog horizontal overflow with a long
unmanaged remedy), browser Major 2 (dashboard fails to boot when the `sessionStorage`
accessor throws), browser Minor 1 (confirmation stays up ~4 s not 3 s), browser Minor 3
(`role="alert"` banner rewritten every tick with unchanged text), maintainability Major 1
web half (plan-ID comments back in production code), maintainability Major 2 (`updaterestart.ts`'s
controller/helper naming mismatch), maintainability Minor 5 (`onHelloArrived` vs
`"helloReceived"` — one signal, two names), maintainability Minor 6 (the daemon-absence
clause written out twice).

### Changes

| File | What and why |
|------|---------------|
| `web/src/style.css` | `#settings-form .hint` gets `min-width: 0; overflow-wrap: anywhere;` — the grid item's min-content width (driven by the unbreakable install-URL/path tokens in an unmanaged remedy) was widening the whole `#settings-form.fields` grid past the dialog's 406 px content column, clipping the Theme/Rail-card controls beside it (Major 1). REQ-19 comment reworded (Maint. Major 1). |
| `web/src/storage.ts` | _(Superseded by the features-scope send-back below: `storage.ts` is byte-identical to main and `safeSessionStorage()` lives in `features/updaterestart.ts`.)_ New `safeSessionStorage()`: wraps the `sessionStorage` *global accessor* itself in a try (not just its methods) — a browser with site data blocked throws on the getter before any method call is reachable, which `readJson`/`writeJson`/`removeItem`'s existing try/catch never gets a chance to run for (Major 2). Header comment now names sessionStorage too. |
| `web/src/features/updaterestart.ts` | `initUpdateRestart`'s default param is now `storage = safeSessionStorage()` instead of the bare `= sessionStorage` global (Major 2). The confirmation-arming branch now also schedules `setTimeout(() => app.render(), CONFIRMATION_MS + 50)` so the hide happens within ~100 ms of the 3 s mark regardless of the 1 s tick's phase (Minor 1). `restartingText` splices in `render/banner.ts`'s new `DAEMON_ABSENCE_CLAUSE` instead of a second copy of the same sentence fragment (Minor 6). `app.on("helloReceived", …)` → `app.on("helloArrived", …)` (Minor 5). Every `REQ-N`/`W-N`/plan-name comment reworded to state the why directly or cite `kb:adr/update-restart-reloads-dashboard` / `kb:adr/process-composition-roots-registration-only` (Maint. Major 1). Header comment gains the second-controller rationale (Maint. Major 2, see Decisions). |
| `web/src/features/connection.ts` | `DAEMON_DOWN_TEXT` now composed from `render/banner.ts`'s `DAEMON_ABSENCE_CLAUSE` (Minor 6). The render phase now holds `lastBannerText`/`lastBannerNeutral`/`lastBannerVisible` closure state and only calls `renderBannerContent`/`renderBanner` when one of those actually changed, instead of unconditionally every tick (Minor 3). Comment reworded (Maint. Major 1). |
| `web/src/render/banner.ts` | New exported `DAEMON_ABSENCE_CLAUSE` constant — the one home for "hook output in open panes is Muster's absence, not session failure.", read by both `connection.ts` and `updaterestart.ts` (Minor 6). Comments reworded (Maint. Major 1). |
| `web/src/app.ts` | `AppEvents.helloReceived` → `helloArrived`, matching `WsClientHandlers.onHelloArrived` end to end like every other `wsapp.ts` relay (Minor 5). Comment reworded (Maint. Major 1). |
| `web/src/ws.ts` | Comment on `onHelloArrived` reworded, no behaviour change (Maint. Major 1). |
| `web/src/wsapp.ts` | `onHelloArrived: () => app.emit("helloArrived")` (was `"helloReceived"`) (Minor 5). Comment reworded (Maint. Major 1). |

### Measured (re-running the reviewer's own repros)

All four measured against a real `musterd` built from this tree (`make build` off the
already-current `internal/webui/assets`, since `npm run build`'s `tsc` step is red only for
the sanctioned `updaterestart.test.ts` breakage below — `npx vite build` alone, and the Go
build, are unaffected) and driven with Playwright, scratch data dir, dedicated tmux socket,
`-update-base-url ""`. Scripts were ad hoc and deleted after use (not committed).

- **Major 1** (dialog overflow). Static repro page: real `#settings-dialog` markup, the
  built `wsapp-*.css`, `#update-status` set to a `can't update <path>: <path> is not
  writable (permission denied) — install with: curl -fsSL
  https://raw.githubusercontent.com/…/install.sh | sh` string (same shape as
  `unwritableRemedy` in `internal/selfupdate/install.go`, using a macOS-style
  space-bearing temp path as the reviewer's S1/S2 did).
  - 1280×720: `scrollWidth 438 == clientWidth 438`; `#update-status` box `left 437, right
    843` — inside the dialog's `right 860`.
  - 800×600: `scrollWidth 438 == clientWidth 438`; `#update-status` box `right 603` —
    inside the dialog's `right 620`.
  - Both match the reviewer's own acceptance bar (`scrollWidth == clientWidth`, status
    line right edge ≤ dialog content edge).
- **Major 2** (throwing `sessionStorage` accessor). `Object.defineProperty(window,
  "sessionStorage", { get() { throw new DOMException(...) } })` via `addInitScript`,
  against the real daemon:
  - Before fix (reviewer's X8): 0 `/ws` opens, banner stays hidden with empty text after
    the daemon is killed.
  - After fix: `{"wsCount":2,"status":"connected","bannerHidden":true,"pageerrors":[]}` —
    identical to the non-throwing baseline. After killing the daemon:
    `{"status":"reconnecting…","bannerHidden":false,"bannerText":"musterd unreachable —
    hook output in open panes is Muster's absence, not session failure."}` — the ordinary
    daemon-down banner now surfaces correctly in this configuration.
- **Minor 1** (confirmation duration). Seeded `sessionStorage["muster.update-restart"]`
  with the dev daemon's own running version before load, so the first real snapshot arms
  the confirmation; a `MutationObserver` on `#banner` attached via `addInitScript` (before
  any page script runs) recorded exact timestamps:
  - Confirmation shown at `t=34.1ms`, hidden (reverted to the ordinary fallback text,
    `hidden=true`) at `t=3085.4ms` — elapsed **3051.3 ms**, i.e. ~51 ms past the 3 s mark,
    well within the reviewer's "~100 ms of 3 s" bar (previously measured 3.96–3.99 s,
    960–990 ms late).
- **Minor 3** (banner mutations during steady daemon-down). Same `MutationObserver`
  approach; daemon killed, observer reset once the down-transition settled, then watched
  for 5 s: **0 mutation records** (previously 11 in 5 s).

### Decisions

- design: `features/updaterestart.ts` stays a second controller for "update" (own module
  state — `record`/`confirmation`/`reloaded`/`handoffChecked` — three `app.on`
  subscriptions, and the `location.reload()` side effect) with a name shaped like the
  `<owner><concern>.ts` pure-helper pattern (`updateview.ts`, `connectionrestore.ts`, …)
  rather than a single-word Features-list controller name. The plan's own Affected Files
  section names this exact path — `web/src/features/updaterestart.ts` (new, update
  feature) — so the file didn't drift there on its own; I did not rename or relocate it
  this cycle. Two restructurings were considered and rejected:
  - **Fold its controller body into `update.ts`**, keeping `computeBannerOverride` as a
    pure decision beside it (matching `updateview.ts`'s shape exactly). Rejected because
    `updaterestart.test.ts` calls `initUpdateRestart(app, storage)` directly across all 21
    of its cases (record lifecycle, reload handoff, confirmation arming) — moving the
    controller body out from under that name isn't an import-path fix, it guts most of
    the file's assertions, a far larger and unreviewed rewrite than this fix wave's
    mandate ("fix only what's needed").
  - **Rename the file** (e.g. `restart.ts`) to shed the `<owner><concern>` shape.
    Rejected because a new single-word controller name implies a 17th entry in
    `features/CLAUDE.md`'s generated Features trailer and a `docs/features/restart/`
    registry (`make gen-kb`'s territory), which isn't mine to invent unilaterally in a fix
    wave, and `updaterestart.test.ts`'s own describe-block titles and doc comment are
    written against the `updaterestart` name throughout.
  - What's actually true about the module: it earns controller status (state +
    subscriptions + a reload side effect) but never looks up a DOM element and has no
    render phase of its own — every render-facing output crosses into `connection.ts`'s
    existing render phase through `ConnectionDeps.restartBanner`, and its state is driven
    entirely by connection/WS lifecycle events `update.ts` never otherwise touches. From
    `main.ts`'s perspective it is a second controller for one feature, which
    `features/CLAUDE.md`'s current "one controller per feature" model has no name for.
    This is the missing rationale the review asked for, not a plan change — if the
    convention itself should grow a "two controllers, one feature" clause (or this module
    should become its own registered feature), that's `docs/features/` territory for the
    orchestrator, not this fix wave.
- design: the shared daemon-absence clause (Minor 6) lives in `render/banner.ts` as an
  exported string constant, not in either controller. `render/CLAUDE.md`'s own rule is
  that a DOM-free decision "only one controller calls" belongs in `features/`; this
  clause is read by *two* controllers, which is exactly the render/-vs-features/ split
  that rule implies — and both `connection.ts` and `updaterestart.ts` already import this
  file for the banner element, so neither gains a new cross-controller import to get it.
- design: Minor 1's fix is a single extra `setTimeout(() => app.render(), CONFIRMATION_MS
  + 50)` scheduled once, when the confirmation arms, rather than switching `main.ts`'s 1 s
  tick to a finer interval (which would cost every other render phase, not just this one)
  or introducing a second render-scheduling mechanism. It's a harmless no-op if a reload
  or a later confirmation has already superseded the one it was scheduled for by the time
  it fires — `computeBannerOverride` stays the single source of truth for what's actually
  shown; the timer only ever asks for one more render pass.

### Handoff

**Build status**: NOT fully green — `npx tsc --noEmit` (and therefore `npm run build`)
fails with exactly 5 errors, all in `web/src/features/updaterestart.test.ts` (lines 205,
216, 228, 229, 239), all `TS2345: Argument of type '"helloReceived"' is not assignable to
parameter of type 'keyof AppEvents'`. This is sanctioned breakage from the Minor 5 rename
(`AppEvents.helloReceived` → `helloArrived`, matching `wsapp.ts`'s on-prefix-stripped
convention for every other relay — `onUpdate`→`"update"`, `onUsage`→`"usage"`, …): the
event name is pinned on both ends by test bodies I can't edit (`ws.test.ts` pins
`onHelloArrived` as a literal property key; `updaterestart.test.ts` pins
`app.emit("helloReceived")`), so satisfying "the handler and event share one name" (Minor
5) necessarily breaks one side's test body. I chose to break `updaterestart.test.ts`'s
side, leaving `ws.test.ts` fully green.

- **Standalone `npx vite build` (no `tsc`, so no type errors from the untouched test
  file)**: exits 0, production bundle built successfully (confirmed above; also used to
  build the real `musterd` binary all of the "Measured" repros above ran against).
- `npx vitest run`: 73 files / 1798 tests passed, 1 file / 3 tests failed — all 3 in
  `updaterestart.test.ts`'s "reload handoff (REQ-16, W6/W7)" describe block (`W6`, `W7`,
  and "still reloads when the handoff write throws"), all failing because
  `app.emit("helloReceived")` is now a no-op (no listener registered under that name) so
  `reload` is never called. The block's 4th case ("a hello with no record held never
  reloads") still passes by coincidence — it asserts `reload` was *not* called, which
  stays true either way.
- `npm run -s lint`: clean, "Checked 251 files ... No fixes applied."
- `make contrast`: 43 pairs × 3 themes, 0 failures (no new token, reused `--bg-raised`/
  `--fg-muted`/`--line-control` already in `contrast-pairs.json`).
- `make size-warn`: 67 hits, none in any file this fix touched.
- `python3 .claude/skills/orchestrate/scripts/dead-refs.py`: 751 references checked, 0
  missing.
- `make check-kb`: 435 records, 23 features, 0 problems — no registry fallout (no file
  renamed or moved).

**Test file needing a change I'm not allowed to make**: `web/src/features/updaterestart.test.ts`
— the 3 failing cases in the "reload handoff (REQ-16, W6/W7)" describe block need their
`app.emit("helloReceived")` calls (lines 205, 216, 228, 229, 239) changed to
`app.emit("helloArrived")`. This is a plain rename, not a logic change — the test
behaviour and its assertions are otherwise unaffected once the string matches the
production event name again.

No `docs/` edits made. No new `doc-delta:` — the shipped behaviour for every REQ this
plan covers is unchanged by this fix wave; only wording, timing precision and internal
naming moved.

### Addendum: wave-1 gate send-back (features-scope.sh)

Send-back: `features-scope.sh` flagged `web/src/storage.ts` as owned by the `reader` and
`theme` features, not `update`/`connection`; the plan's Implementation Notes say
`storage.ts` "is imported, not edited"; widening **Features** isn't ours to decide.

**Fix**: reverted `web/src/storage.ts` to byte-identical with `main` (confirmed —
`git diff main -- web/src/storage.ts` empty) and moved `safeSessionStorage()` into
`web/src/features/updaterestart.ts` as a module-local function (its one caller), still
built on `storage.ts`'s unmodified `StorageLike`/`readJson`/`writeJson`/`removeItem`
exports via the same unchanged import. `docs/diagrams/web-components.md` (which names
`safeSessionStorage`) is left for the orchestrator to reword, per instruction.

- `.claude/skills/orchestrate/scripts/features-scope.sh settings-update-failures`:
  ```
  features-scope: every changed source file's feature is in **Features** (update  connection)
  ```
- Standalone `npx vite build` (web/, no `tsc`): exits 0, same sanctioned-breakage caveat
  as above (test-body-only, doesn't affect the production bundle).
- `npx tsc --noEmit`: unchanged — still exactly the same 5 `updaterestart.test.ts` errors
  as before this addendum (lines 205/216/228/229/239), nothing new introduced by the move.
- `npx vitest run`: unchanged — 73 files / 1798 passed, 1 file / 3 failed, same three
  cases as before.

**Re-measured Major 2** (throwing `sessionStorage` accessor) against a freshly rebuilt
`musterd` (`cd web && npx vite build`, then `make build` from the root) with
`safeSessionStorage` now living in `updaterestart.ts`:
```
before-kill { status: 'connected', bannerHidden: true }
after-kill {
  status: 'reconnecting…',
  bannerHidden: false,
  bannerText: "musterd unreachable — hook output in open panes is Muster's absence, not session failure."
}
```
Identical to the outcome measured before the move — the accessor guard's relocation
didn't change behaviour, only which file owns it.

Committed separately (`git add`/`git commit` by pathspec on
`web/src/storage.ts` and `web/src/features/updaterestart.ts` only) so the revert and the
move land as one self-contained, reviewable unit distinct from the rest of wave 1.

## Fix Attempt 2 (review cycle 2)

**Failures addressed**: correctness Major 3, correctness Major 4, browser Minor 1 (all `[web-impl]`).

**Changes made**:

| File | What and why |
|------|--------------|
| `web/src/features/updaterestart.ts` | Correctness Major 3: replaced the false "~2x CONFIRMATION_MS" comment with the true bound ("up to one extra 1 s tick past CONFIRMATION_MS", matching `setInterval(app.render, 1000)` in `main.ts`). Browser Minor 1: added `UpdateRestartHandle.reloading()`, returning the existing `reloaded` closure flag (true once this window has kicked off its one update-restart `location.reload()` for a held record); reworded the `helloArrived` handler's own comment, which previously (and wrongly) claimed the reload itself pre-empted the mismatch screen. |
| `web/src/wsapp.ts` | Browser Minor 1: `dashboardWsHandlers` takes a fourth param, `updateRestart: Pick<UpdateRestartHandle, "reloading">`; `onProtocolMismatch` now returns without calling `connection.showProtocolMismatch()` when `updateRestart.reloading()` is true. |
| `web/src/main.ts` | Passes the already-constructed `updateRestart` handle into `dashboardWsHandlers(app, connection, actions, updateRestart)`. |
| `web/src/features/CLAUDE.md` | Correctness Major 4: heading and **Owns** line now state the true shape — one controller per feature except `update` (two: `update.ts`'s `initUpdate`, `updaterestart.ts`'s `initUpdateRestart`), naming why they're split and that `updaterestart.ts` registers no render phase of its own. The `<owner><concern>.ts` sentence now carries its one exception (`updaterestart.ts` is that file shape but is a controller, not a pure decision), so it no longer claims every `<owner><concern>.ts` file is a pure helper. |

**Correctness Major 3 — category sweep**: the plan's own repo-wide comment sweep
(`rg -n "CONFIRMATION_MS" web/src`) shows the false claim had exactly one occurrence
(`updaterestart.ts`, fixed above); no other comment states a bound for this timer.

**Correctness Major 4 — category sweep**: `rg -n "one controller per feature|<owner><concern>" web/src/features/CLAUDE.md`
showed both sentences live in the same Owns paragraph (the only hand-written place either
claim is made); both are corrected in the same edit above. `rg -n "one controller per
feature" web/src docs` outside that file: no other hit.

**Browser Minor 1 — re-measured, not theorized**: built a throwaway Playwright spec
(`web/e2e/zz-mismatch-probe.spec.ts`, deleted before this handoff — never committed) that
proxies `/ws` through `page.routeWebSocket` to a real scratch daemon, injects a synthetic
`update` broadcast (`apply.phase: "restarting"`) to arm a held record, closes the routed
server connection to force a real disconnect/reconnect (mirroring a daemon bounce), arms
a hello-protocolVersion rewrite (→ 99) for the reconnect, and records every `#protocol-mismatch`
`hidden`-attribute mutation via a `page.exposeFunction` binding reinstalled on every
document (`page.addInitScript`) so the log survives the reload itself, alongside `page.on("load")`
timestamps.
- **Before the fix** (`onProtocolMismatch` temporarily reverted to call
  `connection.showProtocolMismatch()` unconditionally, rebuilt with `make web-build build`):
  reproduced the defect on the first run —
  `mismatch-log entries: [{"hidden":true,"t":1790353926979},{"hidden":false,"t":1790353927547},{"hidden":true,"t":1790353927566}]`,
  `load` at `1790353927567` — a 20 ms gap with the screen unhidden; the probe's own
  assertion (`unhiddenEntries` must have length 0) failed with exactly that one entry.
- **After restoring the fix**, rebuilt (`make web-build build` from root) and re-ran 4
  times straight: every run's `unhiddenEntries` array was empty (`[]`), e.g.
  `mismatch-log entries: [{"hidden":true,...946137},{"hidden":true,...946724}]`, `load`
  at `...946725` — `#protocol-mismatch` never left `hidden=true` across the reconnect,
  the rewritten hello, and the reload.
- Confirms `updateRestart.reloading()` is both necessary (the pre-fix run reproduces the
  reviewer's flash) and sufficient (4/4 post-fix runs show no unhide) for this scenario.

**Full verification after the fix (tree includes only the four production files above;
the probe spec was deleted before this run)**:
- `npx tsc --noEmit`: exit 0.
- `npm run build` (`web/`): exit 0 (only the pre-existing chunk-size warning).
- `npm run -s lint`: `Checked 251 files in 199ms. No fixes applied.`
- `npx vitest run`: 74 files / 1803 tests passed (no test file touched by this fix wave).
- `make size-warn` (root): 69 hits, none in `updaterestart.ts`, `wsapp.ts`, `main.ts` or
  `features/CLAUDE.md`.
- `make web-build build` (root) then `npx playwright test update.spec.ts resilience.spec.ts`
  (`web/`): **30 passed** (45.2s) — includes E5/E6 (real restart + reload + confirmation),
  the `sessionStorage`-accessor-throws case, and every REQ-1/2/8/9/10 remedy/status-line
  case this plan added.
- No stray `musterd`/`tmux -L muster` process after the run (`ps aux` checked); `git
  status --porcelain` shows only the four production files plus the pre-existing
  `orchestration-state.json` change from the parallel daemon-impl wave, which I left
  untouched.

**Unit-testable seam for web-tests / e2e-specs**: `UpdateRestartHandle.reloading()`
(`web/src/features/updaterestart.ts`) is now directly unit-testable with the existing
`app.emit("update", …)` / `app.emit("helloArrived")` harness already in
`updaterestart.test.ts` — e.g. arm a restarting record, emit `helloArrived` once, assert
`handle.reloading()` is `true`; assert it's `false` before any record is held. At the
`wsapp.ts` level, `dashboardWsHandlers`'s new `onProtocolMismatch` gating is unit-testable
by constructing it with a stub `{ reloading: () => true }` and asserting
`connection.showProtocolMismatch` is never called when `dispatch` reaches a mismatched
hello — there's no `wsapp.test.ts` today (confirmed: `find web/src -iname "*wsapp*"` shows
only `wsapp.ts`), so this would be that file's first test if web-tests wants unit
coverage beyond the E2E probe above.

**Decisions**:
- design: `reloading()` reuses the existing `reloaded` closure flag rather than adding new
  state — it already has exactly the semantics needed ("this window has committed to
  reloading for the held record") and is read-only from the new call site, so no new
  invariant to maintain.
- design: the gate lives in `wsapp.ts`'s `onProtocolMismatch`, not in `ws.ts`'s `dispatch`
  — `ws.ts` owns socket lifecycle only ("Message parsing lives in protocol/messages.ts
  ... this module just wires the socket lifecycle", `ws.ts` header) and has no knowledge
  of `updaterestart.ts`; `wsapp.ts` is precedented as the WS-to-app-effect composition
  layer that already imports a feature's handle type structurally (`ActionsHandle` via
  `Pick<ActionsHandle, "handleRemoved">`), so `Pick<UpdateRestartHandle, "reloading">`
  follows the same shape (`rg -n "Pick<.*Handle" web/src/wsapp.ts` — one prior match,
  now two).
- No `doc-delta:` — REQ-16/edge 17's stated behaviour ("reloads rather than showing the
  mismatch screen") is unchanged; this fix makes the code match what was already
  promised, not a new promise.

**Build status**: `npx tsc --noEmit` and `npm run build` exit 0.
**Test files needing changes I was not allowed to make**: None — this wave touched no
test file, and none of the three issues required one.

**Addendum (wave-1 gate send-back, `web/src/features/CLAUDE.md` word budget)**: tightened the Owns paragraph (kept both Major 4 facts — update has two controllers; `updaterestart.ts` is the one `<owner><concern>.ts` file that's a controller, not a pure helper) without touching the generated trailer or adding words elsewhere — `make check-kb`: `kb: 435 records, 23 features, 0 problem(s)` / `kb: all checks pass`.

## Fix Attempt 3 (review cycle 3)

**Failures addressed**: Maintainability [web-impl] issue 1 — the mismatch-suppression
decision ("does a mismatched hello show `#protocol-mismatch`") had two homes:
`wsapp.ts`'s `onProtocolMismatch` (checked `updateRestart.reloading()` before calling
`connection.showProtocolMismatch()`) and `connection.ts:160-164`'s `showProtocolMismatch`
itself, which the module headers described as unconditional. The review named the
concrete rule broken (`docs/conventions.md` § Design, "one owner per concept") and the
precedent it should have followed but didn't (`ConnectionDeps`, the documented
cross-feature contact point `updaterestart.ts`'s own header already names, plus the plain
one-line-delegation shape of every other `dashboardWsHandlers` entry, e.g.
`onSessionRemoved: (id) => actions.handleRemoved(id)`).

**Changes made** (chose the review's first option — behind `ConnectionDeps`, `wsapp.ts`
stays a relay — over documenting a second contact point, since the first needed no new
seam: `ConnectionDeps` already crosses exactly this kind of update-restart state):
- `web/src/features/connection.ts`: added `reloading(): boolean` to `ConnectionDeps`
  (doc comment explains why it lives beside `restartBanner`). `showProtocolMismatch()`
  now checks `deps.reloading()` first and no-ops if true — same `shellEl`/`mismatchEl`
  hide-and-focus code as before, just gated. Updated the module header, the
  `ConnectionDeps` doc comment and `ConnectionHandle.showProtocolMismatch`'s doc comment
  to say this module now also decides mismatch suppression.
- `web/src/wsapp.ts`: removed the `updateRestart` parameter (and its `UpdateRestartHandle`
  import) from `dashboardWsHandlers` entirely — nothing else in the file used it.
  `onProtocolMismatch` is now `() => connection.showProtocolMismatch()`, the same
  one-line-delegation shape as `onSessionRemoved` immediately above it. Removed the
  now-stale comment explaining the reload race (the race and its explanation moved to
  `connection.ts`'s `ConnectionDeps.reloading` doc comment and `updaterestart.ts`'s
  `reloading()` doc comment, both updated below).
- `web/src/features/updaterestart.ts`: updated three comments that named `wsapp.ts` as
  the reader of `reloading()` (module header, `UpdateRestartHandle.reloading()`'s doc
  comment, the `helloArrived` handler's comment) to instead name `connection.ts`'s
  `showProtocolMismatch`, reached through `ConnectionDeps` — no behavioural change in
  this file, comments only.
- `web/src/main.ts`: `initConnection`'s deps object now also passes
  `reloading: updateRestart.reloading` (construction order already had `updateRestart`
  built before `connection`, so no reordering needed). The `dashboardWsHandlers(...)` call
  drops its fourth argument.

**Blast radius measured before editing** (`ConnectionDeps` and `dashboardWsHandlers` are
both shared seams):
- `rg -n "initConnection\(" web/src` → only `web/src/main.ts:85` and the
  `connection.ts` definition itself — one construction site, no test constructs
  `ConnectionDeps` directly.
- `rg -n "dashboardWsHandlers|UpdateRestartHandle" web/src` → `main.ts` (the one call
  site), `wsapp.ts` itself, and `updaterestart.ts`'s own type definition — no
  `wsapp.test.ts` exists (`find web/src -iname "wsapp*"` → only `wsapp.ts`), so no unit
  test held an assertion on the old four-argument signature.
- `grep -rn "reloading\|onProtocolMismatch\|ConnectionDeps\|showProtocolMismatch" web/src
  web/e2e` → the only test-file hits are `ws.test.ts` (asserts `WsClientHandlers.
  onProtocolMismatch` routing at the `ws.ts` dispatch layer, unaffected — it never
  touches `wsapp.ts` or `connection.ts`) and `updaterestart.test.ts` (tests
  `computeBannerOverride`/`initUpdateRestart` directly, never through `wsapp.ts` or
  `connection.ts`, and never calls `handle.reloading()` itself). `e2e/update.spec.ts:1395`
  has a comment naming "`updaterestart.ts`'s `reloading()` plus `wsapp.ts`'s
  `onProtocolMismatch` gate" — this is a black-box mechanism description in a test I may
  not edit; the DOM behaviour it asserts (see repro re-run below) is unchanged by moving
  where the check runs, and `wsapp.ts`'s `onProtocolMismatch` is still the entry point the
  gate is reached through (it now just delegates one level further into `connection.ts`
  rather than checking inline), so the comment is not made false by this change.

**Reviewer's repro re-run** (E2E, not the reviewer's own probe script — this plan's
committed guard test, per the fix-mode brief): `make web-build build` from root, then
`npx playwright test e2e/update.spec.ts` from `web/` (foreground, no backgrounding) —
**27 passed (45.8s)**, including
`e2e/update.spec.ts:1386 "a window holding a restart record reloads on a
mismatched-protocol reconnect without ever showing the mismatch screen (REQ-16, edge case
17)"` (856ms) — the test that instruments every `#protocol-mismatch`/`#app` `hidden`
mutation across the reconnect/reload and asserts none ever unhid the mismatch screen.

**Decisions**:
- design: kept the suppression check as the single `if (deps.reloading()) return;` guard
  clause at the top of `showProtocolMismatch()`, not a wrapping branch around the whole
  body — matches the file's existing early-return style elsewhere (e.g.
  `shouldRestoreFocus` call site) and keeps the diff to one added line inside the
  function.
- No `doc-delta:` — REQ-16/edge 17's promised behaviour is unchanged (still "reloads
  rather than showing the mismatch screen"); only which module decides it moved, which
  the plan's Doc Delta never named at the module level.

**Build status**: `npx tsc --noEmit` exit 0; `npm run build` exit 0 (only the pre-existing
chunk-size-warning, no error); `npm run -s lint`: `Checked 251 files in 205ms. No fixes
applied.`; `npx vitest run` (`npm test`): 74 files / 1803 tests passed — no test file
touched by this wave. `python3 .claude/skills/orchestrate/scripts/dead-refs.py`: `854
references checked, 0 missing`.
**Test files needing changes I was not allowed to make**: None.
