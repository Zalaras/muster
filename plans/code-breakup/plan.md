# Plan: Code Breakup — dismantle the two composition-root hotspots

**Created**: 2026-09-11
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: tiles.spec.ts daemon (grid membership/order and socket counts are daemon-global); rail-cards.spec.ts fileDaemon (every test it receives is title-scoped today); actions.spec.ts fileDaemon (unchanged); views.spec.ts daemon (unchanged)
**Description**: `web/src/main.ts` and `internal/server/server.go` become composition roots only; every feature moves into a controller (web) or a handler type (Go) with a one-line registration; the two E2E grab-bags are split along the same feature seams; the pipeline docs learn the rule so it does not regrow.

## Overview

`web/src/main.ts` is 1,425 lines and has been edited by 21 commits: 40 element lookups, ~20
module-level `let` state variables, and every feature's event wiring. `internal/server` is 45
files, but every feature adds a field to the 25-field `Server` struct, a twin field in `Config`,
and a line in the route table — so any two plans collide on the same three files. The cause is
structural: plans list "`main.ts` — wire X" under Affected Files, agents comply, and review judges
against the plan. This plan is the settled response (TODO.md, Damian 2026-09-11: one plan, both
sides, files not sub-packages).

**Behaviour is unchanged throughout.** No protocol delta, no schema change, no new user-visible
behaviour, no new E2E tests. The full E2E suite is the oracle, and the count of tests in it is an
acceptance check so nothing is dropped in the split. The deliverable is shape: (1) two composition
roots that build dependencies and call each feature's init/mount, a couple of hundred lines each;
(2) web: one controller module per feature with an `init(deps)` entry, following the shape
`render/launch.ts`, `render/settings.ts` and `render/issue.ts` already use; (3) Go: each feature
owns a small handler type with explicit dependencies and a `mount`, and `Server` keeps mux, auth,
hub and lifecycle; (4) E2E: the grab-bags `actions.spec.ts` (23 tests) and `views.spec.ts` (17)
split into files named for the feature seams; (5) rules in `docs/conventions.md`, `plan-work` and
`review-work` so a composition root is never again a place to land logic.

The two sides are independent (no shared contract changes), so daemon-impl and web-impl run in
parallel as usual. Both are refactors that necessarily break in-package tests (a field that moves
off `Server`; a module that moves to `features/`); that breakage is *sanctioned* per the impl
agents' Handoff rules, and the test agents repair it in wave 2. The plan enumerates the expected
breakage under Affected Files so it is not a surprise.

## Feature vocabulary (shared by web, Go and E2E)

One name per feature, used for the web controller file, the Go handler type's file, and the E2E
spec-file prefix. Existing spec files are **not** renamed by this plan (only the two grab-bags are
split); new specs from this plan on follow the naming rule.

| Feature | Web controller (`web/src/features/`) | Go feature (`internal/server/`) | E2E specs (`web/e2e/`) |
|---|---|---|---|
| connection | `connection.ts` — status readout, banner, protocol mismatch, Claude version readout | core: `ws.go`, `state.go`, `auth.go` | `resilience.spec.ts`, `auth.spec.ts`, `claude-version.spec.ts` |
| usage | `usage.ts` — gauges, model-week select, refresh button + busy timer | `usage.go` + `usagewire.go` + `usagepoll.go` → `usageFeature` | `gauges.spec.ts`, `usage-model.spec.ts` |
| theme | `theme.ts` — `themeChoice`/`claudeFamily`, `<html>` attributes, first-paint hint | `themepoll.go` → `themeFeature` | `theme.spec.ts` |
| update | `update.ts` — Updates section, restart confirm, Settings badge, apply handlers | `update.go` → `updateFeature` | `update.spec.ts` |
| settings | `settings.ts` (moved from `render/`) — Settings dialog | `prefs.go` → `prefsFeature` | (covered by theme/update/views) |
| issue | `issue.ts` (moved from `render/`) — Issue button + dialog | `issue.go` → `issueFeature` | `issue-capture.spec.ts` |
| launch | `launch.ts` (moved from `render/`) — launch dialog, `onLaunched` | `sessions.go` (create) + `browse.go` + `repos.go` | `launch.spec.ts`, `tiles-launch.spec.ts`, `permission-mode.spec.ts` |
| rail | `rail.ts` — rail cards, count, sort select, drag reorder | `sessions.go` (pin, order) | `rail-order.spec.ts`, **`rail-cards.spec.ts` (new, from the split)** |
| views | `views.ts` — Focus/Tiles switcher, density buttons, view containers' `hidden` | `prefs.go` | `views.spec.ts` (trimmed) |
| focus | `focus.ts` — Focus view: mainhead, main slot, dead surface, sizenote, default focus | — | `focus-marker.spec.ts`, `sessions.spec.ts` |
| tiles | `tiles.ts` — grid reconcile, strip, tile drag, density application, promote | — | **`tiles.spec.ts` (new, from the split)** |
| surfaces | `surfaces.ts` — `TerminalSurface` manager, surface switch, shell select/ended, reattach | `terminal.go` → `terminalFeature`; `shells.go` → `shellFeature` | `terminal.spec.ts`, `shell.spec.ts`, `plain-shell.spec.ts` |
| actions | `actions.ts` — End/Resume/Remove/Pin dispatcher, confirm dialogs, dead-pane cache | `sessions.go` (end, resume, remove, pane) | `actions.spec.ts` (trimmed) |
| rename | `rename.ts` — mainhead editor, tile rename handlers, cancel-open-renames | `sessions.go` (title) | `rename.spec.ts` |
| shortcuts | `shortcuts.ts` — window keydown → views/focus/tiles | — | `shortcuts.spec.ts` |
| drop | (existing `render/dropguard.ts`, `terminal/drop.ts`) | `locate.go` → `locateFeature` | `drop.spec.ts` |
| ingest | — | `ingest.go` → `ingestFeature` | `ingest.spec.ts`, `subagent-status.spec.ts`, `reconcile.spec.ts` |

## Requirements

### Must Have
- [ ] REQ-1: `web/src/main.ts` is a composition root only: it creates the app, initialises each
  feature controller in a stated order, wires the one `WsClient` to store/state updates and app
  events, starts the 1 s tick, and nothing else — no DOM lookups, no DOM event listeners, no
  module-level mutable state, no rendering logic. Budget: 250 lines including comments.
- [ ] REQ-2: Every web feature in the vocabulary table has one controller module under
  `web/src/features/` exporting a single `init<Feature>(app, deps?)` entry that locates its own DOM,
  registers its own listeners, owns its own state, and registers its render phase and event
  subscriptions on the app. The three existing controllers (`launch`, `settings`, `issue`) move
  there and gain that entry (their inner `init*(elements, handlers)` functions may stay as-is
  underneath).
- [ ] REQ-3: A small `web/src/app.ts` module owns the cross-feature seam: the `SessionStore`, the
  shared `AppState` (only the fields more than one feature reads — see UI Specifications), a typed
  event bus (`on`/`emit`), an ordered list of render phases (`onRender`), and `render()`. It is
  pure enough to unit-test.
- [ ] REQ-4: A controller never imports another controller module; cross-feature needs are met
  through `init` dependencies (a controller handle passed by `main.ts`) or through app events.
- [ ] REQ-5: `internal/server/server.go` is a composition root only: `Config`, `Server`, `New`,
  `Handler`, `Start`, `Shutdown`, the exported lifecycle accessors, and the core route table
  (healthz, auth, state, ws, static). Budget: 300 lines including comments. Every other HTTP handler
  is a method on a feature type, not on `*Server`.
- [ ] REQ-6: Each Go feature in the vocabulary table is a small type with explicit constructor
  dependencies (interfaces or concrete collaborators — never `*Server`), a `mount(mux, guard)` that
  registers its own routes, and, where applicable, `Start()/Stop(ctx)` and a snapshot contribution.
  `New` registers each feature in one line; `routes`, `Start`, `Shutdown` and `currentSnapshot`
  iterate the registered features instead of naming them.
- [ ] REQ-7: `Config` groups each feature's fields into one sub-struct (`Launch`, `Usage`, `Theme`,
  `Issue`, `Update`) declared in the feature's own file; `Config` itself keeps only the core fields
  and one field per sub-struct. `cmd/musterd/main.go` is updated to match. Flag names and defaults
  are unchanged.
- [ ] REQ-8: Behaviour is unchanged: every existing E2E test passes, unmodified except for file
  location and (for `tiles.spec.ts`) fixture shape; the total count of E2E tests is exactly what it
  is today (299 `test(` calls).
- [ ] REQ-9: `actions.spec.ts` and `views.spec.ts` are split along the feature seams per the
  mapping table in UI Specifications → E2E split; no test is deleted, weakened, skipped or
  retitled beyond its file move.
- [ ] REQ-10: Zero-value safety is preserved: a `Config` with zero-value feature sub-structs never
  reaches the network, the Keychain, `gh`, or Claude Code's config file (today's guarantees, now
  per sub-struct).
- [ ] REQ-11: Start and Stop order is exactly today's (manager load + reconcile + start, ingest,
  usage poller, theme poller, updates; shutdown: hub, terminals, then the same order) — expressed as
  the registration order, with a comment naming why it is not reversed.

### Should Have
- [ ] REQ-12: Any logic extracted from `main.ts` that is pure (prefs adoption decisions, the
  render-phase ordering, the event bus) gets Vitest coverage; controllers themselves are DOM-bound
  and covered by E2E only.
- [ ] REQ-13: Go test helpers (`helpers_test.go`, `fakes_test.go`) keep their signatures so the
  ~30 test files that call `newTestServer`/`New(Config{…})` with only core fields compile without
  edits; only tests that reach a moved field or set a feature Config field change.

### Nice to Have
- [ ] REQ-14: `web/src/render/` holds only pure DOM builders after the move (no `init*` controller
  left there); `web/src/sessions/` and `web/src/terminal/` are untouched.

## Protocol Contract

No protocol changes. Every WS message and HTTP endpoint in `docs/protocol.md` keeps its shape,
status codes and error envelopes byte-for-byte; the E2E suite pins this.

## Schema Changes

No schema changes required.

## UI Specifications

No view changes. This section specifies the *module* structure the web agent builds, since that is
the deliverable.

### `web/src/app.ts` — the cross-feature seam

```ts
export type View = "focus" | "tiles";
export interface AppState {
  view: View;                // written only by features/views.ts (from prefs)
  density: Density;          // written only by features/views.ts (from prefs)
  railSort: RailSort;        // written only by features/rail.ts (from prefs)
  focusedId: number | null;  // written only via app.focus(id)
  connection: ConnectionStatus; // written only by features/connection.ts
}
export interface RenderFrame { sessions: readonly Session[]; now: Date; connected: boolean }
export interface AppEvents {
  status: (status: ConnectionStatus) => void;   // after state.connection changed
  snapshot: (snapshot: Snapshot) => void;       // after store.replaceAll
  prefs: (prefs: Prefs) => void;                // snapshot.prefs and every prefs broadcast
  claudeTheme: (family: ClaudeFamily) => void;
  usage: (usage: Usage) => void;
  update: (update: UpdateInfo) => void;
  sessionRemoved: (id: number) => void;         // WS sessionRemoved, and a successful DELETE
  focusChanged: (id: number | null) => void;    // before the render that follows app.focus
  cancelRenames: () => void;                    // any trigger that must not let a blur-commit through
}
export interface App {
  readonly store: SessionStore;
  readonly state: AppState;
  on<E extends keyof AppEvents>(event: E, fn: AppEvents[E]): void;
  emit<E extends keyof AppEvents>(event: E, ...args: Parameters<AppEvents[E]>): void;
  onRender(phase: (frame: RenderFrame) => void): void;  // called in registration order
  render(): void;   // synchronous: builds the frame, runs every phase
  focus(id: number | null): void; // sets state.focusedId, emits focusChanged (no render)
}
export function createApp(): App;
```

Everything else a feature needs (API calls, render functions, pure helpers) it imports directly
from `../api`, `../render/*`, `../sessions/*`, `../terminal/*`, `../protocol`, `../shortcuts`,
`../theme`, `../ws` — those are not controllers. The element-lookup helpers (`requireElement`,
`requireElements`) move to `web/src/dom.ts`.

### Controller contract

Each `web/src/features/<feature>.ts` exports `init<Feature>(app: App, deps?: <Feature>Deps)` and
may return a small handle (functions other controllers need — e.g. `surfaces.stateFor(id)`,
`tiles.promote(id)`, `views.toggle()`, `focus.nth(n)`). It:

- locates its own elements (`requireElement` from `dom.ts`) — `main.ts` does none;
- registers its own DOM listeners;
- keeps its state in closure variables (today's module-level `let`s move with it);
- registers `app.onRender(...)` for what it redraws each pass, and `app.on(...)` for the events it
  reacts to;
- calls `app.render()` after a local state change, exactly where `main.ts` calls `render()` today.

Cross-controller needs are met **only** through `deps` (a handle `main.ts` obtained from an earlier
`init`) or app events. A controller importing a sibling from `./` is a defect (W6).

### Render phase order (registered by `main.ts` in this order — it is behaviour-bearing)

1. **actions** — `updateDeadPaneTracking(sessions)` (prune + alive→dead invalidation).
2. **usage** — gauges/model week/model readout.
3. **update** — Updates section + Settings badge.
4. **issue** — Issue button disabled state.
5. **tiles (membership)** — in Tiles: `tilesLive = applyDensity(...)`.
6. **focus (default)** — in Focus: default `focusedId` to top of rail order when unset/vanished.
7. **surfaces** — open/close diff over `(id, kind)` keys against `visibleIds` (Focus: `[focusedId]`;
   Tiles: `tilesLive`), constructing/disposing `TerminalSurface`s — the **only** place one is ever
   constructed or disposed (W7/W8 of m2-terminal still hold).
8. **rail** — `renderSessions(...)`, count, sort select value.
9. **views** — switcher, density control, view containers' `hidden`.
10. **focus (view)** in Focus, else **tiles (view)** in Tiles — mainhead/dead surface/slot, or
    grid reconcile + strip.

Phases 5–7 must run before 10 (a surface must exist before a slot mounts it; a fit on a detached
node is a silent no-op). The plan pins the order; `main.ts` states it as a numbered comment.

### Event subscription order that matters

- `prefs`: **views** adopts `view`/`density` before **tiles** recomputes `tilesLive`
  (`initialLive` on a view change, `applyDensity` on a density change) — so `initViews` runs
  before `initTiles` in `main.ts`. A `view` change also emits `cancelRenames` (today's
  `cancelOpenRenames()` in `applyPrefsFromSnapshot`).
- `status` (non-connected): **actions** closes confirm dialogs, **issue** closes its dialog,
  **settings** closes, **update** closes the restart confirm, **rename** and **tiles** cancel open
  renames, then `main.ts`'s `render()` runs (today's `setStatus` tail).
- `sessionRemoved`: **surfaces** disposes both `(id, claude)`/`(id, shell)` and forgets switch
  state; **tiles** cancels/disposes the tile's rename editor, removes its root, drops it from
  `tilesLive`; **actions** drops the dead-pane cache/previous-alive entries; **focus** clears
  `focusedId` if it was `id` (via `app.focus(null)`). Then render.
- `snapshot`: **theme** adopts `claudeTheme.family` and applies; **usage**/**update** adopt their
  fields; **surfaces** reattaches disconnected surfaces.
- `focusChanged`: **rename** cancels the mainhead editor (today's `setFocusedId`).

### The `WsClient` wiring `main.ts` keeps

| WS callback | `main.ts` does |
|---|---|
| `onConnecting` / `onDisconnected` | `connection.set(everConnected ? "reconnecting" : "connecting")` — `connection` owns `everConnected` |
| `onHello` | `connection.set("connected")`; `connection.setClaudeCode(hello.claudeCode)` |
| `onSnapshot` | `store.replaceAll`; `emit("prefs")`; `emit("snapshot")`; `render()` |
| `onSessionUpsert` | `store.upsert`; `render()` |
| `onSessionRemoved` | `emit("sessionRemoved", id)`; `render()` |
| `onPrefs` | `emit("prefs", prefs)`; `render()` |
| `onUsage` | `emit("usage", usage)`; `render()` |
| `onClaudeTheme` | `emit("claudeTheme", family)` |
| `onUpdate` | `emit("update", update)`; `render()` |
| `onProtocolMismatch` | `connection.showProtocolMismatch()` |

### Views / User Flows / States

Unchanged — every existing view keeps its three states exactly as today; nothing new renders.

### Testable UI Elements

No new or changed elements. Every accessible name and text pattern in the existing specs is a
frozen contract this plan must not disturb.

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| (none added) | — | — | existing names are pinned by the unchanged E2E assertions |

### E2E split

Destination files and the fixture each declares. Tests are moved verbatim (title, body, helpers);
a test moving from `actions.spec.ts` (`fileDaemon`) into `tiles.spec.ts` changes only its fixture
plumbing to the `daemon` fixture — no assertion changes. Line numbers are today's.

**`actions.spec.ts` (keeps `fileDaemon`) keeps:** L45 End from the mainhead ends only the focused
session; L228 Cancel and Escape close both dialogs; L287 focused ended session shows the dead
surface + Resume; L352 Ending a focused session closes its terminal socket; L401 Resume relaunches
with the same claude id; L455 resume SessionStart lands idle; L512 no captured snapshot copy; L539
Removing a live session ends it first; L859 action buttons disabled while down; L909 disabled for a
dead focused session, re-enable on reconnect; L1330 ended copy never reads "ended now ago"; L1389
"loading last screen…" interim; L1452 late resume SessionStart after End. (13 tests)

**`rail-cards.spec.ts` (new, `fileDaemon`) receives from `actions.spec.ts`:** L135 ended sessions
sort after every live session; L1012 card End activates via Enter and Space; L1068 card End
survives a render tick; L1521 action row opacity 0 until hover/focus-within; L1566 focused card
action button survives a rail re-sort. (5 tests)

**`tiles.spec.ts` (new, `daemon`) receives from `actions.spec.ts`:** L628 Tiles End keeps the
tile in its slot; L742 Removing a dead tile backfills from the strip; L1114 tile footer End
survives a render tick; L1173 priority change never moves a live tile; L1250 focused tile-footer
button survives a drag-drop reorder. **And from `views.spec.ts`:** L116 density 2x2→3x2 promotes;
L172 strip click promotes and demotes lowest; L227 density change leaves stripped geometry
untouched; L297 socket count equals live-surface count; L351 live tile stays typable across the
tick; L382 killing one of several tiles ends only that tile; L525 drag reorders forward; L607 drag
reorders backward; L636 strip click at capacity places into the demoted index; L679 drag released
over the strip leaves order unchanged; L717 drag still reorders while down; L750 tile state dot
title tracks the state word. (17 tests)

**`views.spec.ts` (keeps `daemon`) keeps:** L30 switcher persists across reload; L42 view survives
daemon restart; L55 Cmd+\ toggles and Opt+Cmd+1 focuses top; L450 every accepted PUT /api/prefs
re-broadcasts; L474 GET /api/state prefs carries view and density. (5 tests)

Totals: 13 + 5 + 17 + 5 = 40 = 23 + 17. Shared helpers the moved tests use stay in
`web/e2e/helpers/` (already per-feature: `session`, `terminal`, `railorder`, `theme`, …); a helper
that exists only inside one of the two grab-bags moves to `web/e2e/helpers/<feature>.ts`.

## Affected Files

### Daemon
- `internal/server/server.go` — becomes the composition root: core `Config` (Store, Logger,
  UIToken, IngestToken, WebDist, DaemonVersion, ClaudeCode, IngestQueueSize, TmuxSocket,
  HTTPClient, TmuxClient, Attach, Locator) plus one field per feature sub-struct; `Server` keeps
  mux, log, tokens, webDist, tmuxSocket, daemonVersion, hub, store, manager, tmux client/lister,
  the registered features slice, and one typed field per feature (so tests and the snapshot reach
  them); `New` builds core collaborators then registers each feature in one line;
  `routes` mounts core routes and loops `mount`; `Start`/`Shutdown` loop the lifecycle features in
  registration order (REQ-11); `currentSnapshot` loops the snapshot contributors;
  `RestartRequests` delegates to the update feature. ≤ 300 lines (D4).
- `internal/server/sessions.go` — `sessionsFeature` (launcher, create/end/resume/remove/pin/order/
  title/pane handlers) with deps manager, shells, terminals, logger.
- `internal/server/terminal.go` — `terminalFeature` (registry, `GET /ws/terminal/{id}`) with deps
  manager, attach, tmux client, logger; `closeAll` exposed for Shutdown.
- `internal/server/shells.go` — `shellFeature` (registry, `POST /api/sessions/{id}/shell`,
  `GET /ws/shell/{id}`) — move those two handlers here from wherever they live today.
- `internal/server/ingest.go` — `ingestFeature` (queue + the two `/ingest/{token}/…` routes).
- `internal/server/prefs.go` — `prefsFeature` (`PUT /api/prefs`, `loadPrefs`, snapshot
  contributor) with deps store, hub, and a narrow interface for `SetCheckEnabled` on the update
  feature.
- `internal/server/usage.go`, `usagewire.go`, `usagepoll.go` — `usageFeature` (aggregator,
  model-scoped holder, optional poller, `POST /api/usage/refresh`, snapshot contributor,
  `UsageConfig{Poll, APIURL, TokenFile, KeychainUser}` declared here).
- `internal/server/themepoll.go` — `themeFeature` (`ThemeConfig{Poll, ConfigFile}`).
- `internal/server/issue.go` — `issueFeature` (`IssueConfig{Repo, APIURL, TokenFile}`, capture
  store, client, both routes).
- `internal/server/update.go` — `updateFeature` (`UpdateConfig{BaseURL, CheckInterval, PublicKey,
  Install, ExePath, ExeRun}`, manager-or-static snapshot contribution, both routes,
  `restartRequests`).
- `internal/server/locate.go`, `browse.go`, `repos.go` — `locateFeature`, `browseFeature`,
  `reposFeature` (`LaunchConfig{ClaudeBin, HookScript, StatusLineScript, LegacyScripts,
  BrowseRoot}` declared in `sessions.go`).
- `internal/server/auth.go`, `state.go`, `ws.go` — stay core; `state.go`'s `currentSnapshot`
  becomes the contributor loop; the only files where a `*Server`-receiver handler may remain (D5).
- `cmd/musterd/main.go` — build the nested `Config`. Flags unchanged.
- **Sanctioned test breakage daemon-impl must list in `## Handoff`** (daemon-tests repairs in
  wave 2): tests that read a moved field — `srv.updates` (14 sites, `update_test.go`),
  `srv.issueCaptures` (9, `issue_test.go`), `srv.locator` (8, `locate_test.go`),
  `srv.themePoller` (4, `themepoll_test.go`), `srv.usage` (4, `usage_test.go`/`gauges_test.go`) —
  and tests that set a grouped Config field — `fakes_test.go`, `issue_test.go`, `state_test.go`,
  `themepoll_test.go`, `usage_test.go`, `update_test.go` (7 sites). `srv.store`, `srv.manager`,
  `srv.tmuxClient` stay on `Server` (85 sites) and do not break. `newTestServer` is unchanged.

### Web
- `web/src/main.ts` — rewritten as the composition root (REQ-1, ≤ 250 lines): `createApp()`,
  the ordered `init*` calls (views before tiles; the render-phase order above), `installDropGuard(document)`,
  `WsClient` wiring per the table, `setInterval(app.render, 1000)`, `client.start()`.
- `web/src/app.ts` — new (REQ-3).
- `web/src/dom.ts` — new: `requireElement`, `requireElements`.
- `web/src/features/connection.ts`, `usage.ts`, `theme.ts`, `update.ts`, `rail.ts`, `views.ts`,
  `focus.ts`, `tiles.ts`, `surfaces.ts`, `actions.ts`, `rename.ts`, `shortcuts.ts` — new
  controllers, each owning the state and wiring `main.ts` holds for that feature today.
- `web/src/features/launch.ts`, `settings.ts`, `issue.ts` — moved from `web/src/render/` (`git mv`),
  each gaining an `init<Feature>(app, deps)` that locates its elements and calls the existing
  inner init.
- `web/src/render/masthead.ts` — `ConnectionStatus` type stays here or moves to `protocol.ts`;
  either way it is imported, not redeclared.
- `web/src/render/issue.test.ts` — import path fix only (the one edit web-impl may make to a test).
  web-tests may relocate it beside the moved module.
- `web/index.html`, `web/src/style.css` — **unchanged** (no id/class renames; E2E locators pin them).

### E2E (e2e-specs)
- `web/e2e/actions.spec.ts`, `web/e2e/views.spec.ts` — trimmed per the E2E split table.
- `web/e2e/tiles.spec.ts`, `web/e2e/rail-cards.spec.ts` — new, receiving the moved tests.
- `web/e2e/helpers/<feature>.ts` — only if a grab-bag-local helper has to move.

### Web unit tests (web-tests)
- `web/src/app.test.ts` — new (REQ-12): event bus fan-out and order, render-phase order,
  `focus()` emits before render, frame derivation.
- Any pure function web-impl extracts (named in `web-implementation.md`) — a test beside it.

### Daemon unit tests (daemon-tests)
- Repair the sanctioned breakage listed above; add `TestNew_RegistersFeaturesInStartOrder` (or
  equivalent) pinning REQ-11's order and a zero-value-`Config` test per feature sub-struct for
  REQ-10 where one does not already exist.

## Edge Cases

1. A render phase registered out of order mounts a surface before it exists (Focus slot empty,
   or a tile's fit no-ops on a detached node) → E1 (terminal.spec.ts / tiles.spec.ts pin geometry
   and socket counts).
2. `prefs` handled by tiles before views: `tilesLive` recomputed against the old `view`/`density`
   → E1 (tiles.spec.ts density/promotion tests).
3. `sessionRemoved` fan-out misses one owner: a disposed session leaves a surface, a tile root, a
   `tilesLive` id, or a dead-pane cache entry → E1 (tiles.spec.ts "Removing a dead tile backfills",
   actions.spec.ts "Removing a live session ends it first").
4. Daemon down: a dialog controller not subscribed to `status` stays open → E1 (actions.spec.ts
   "action buttons are disabled while down", update.spec.ts, issue-capture.spec.ts).
5. Theme change no longer reaches mounted surfaces (`surface.applyTheme()`) after the theme
   controller loses direct access to the surfaces map → E1 (theme.spec.ts).
6. Rename cancel on view-button `mousedown` (the second guard, pre-empting the native blur) is
   lost in the move → E1 (rename.spec.ts).
7. A reconnect echoing identical prefs reshuffles a customised grid (adoption must still compare
   before resetting `tilesLive`) → E1 (views.spec.ts / tiles.spec.ts).
8. `main.ts` keeps a stray `let`, listener or lookup "just for now" → W3, W4, W5, W7, W13.
9. A controller imports a sibling (`./surfaces`) instead of taking a handle → W6.
10. Go: a feature's handler is left on `*Server` → D5.
11. Go: Stop order silently reversed by an "idiomatic" loop → D2 (new order test) and INV-5.
12. Go: a zero-value feature sub-struct constructs a poller/client that reaches the network →
    D2 (existing zero-value tests plus REQ-10's per-sub-struct tests).
13. Go: `prefsFeature` needs the update feature's `SetCheckEnabled` while the update feature needs
    `loadPrefs().UpdateCheck` at construction — a construction cycle → D1 (resolve by constructing
    prefs first and passing the update feature a prefs reader; prefs receives a setter interface
    the update feature satisfies after construction; documented in daemon-implementation.md).
14. Hook loss/duplication/reordering, `/clear` minting a new `session_id`, daemon restart
    mid-session, no-data-yet nulls, pane death without `SessionEnd` — all untouched by this plan;
    the ingest and reconcile code moves as a unit → E1 (ingest.spec.ts, reconcile.spec.ts,
    subagent-status.spec.ts) and D2.
15. A moved E2E test's `fileDaemon` → `daemon` conversion changes a timing assumption (a title-scoped
    test previously sharing a warm daemon) → E1, and if it flakes, `make e2e-soak SPEC=tiles.spec.ts
    N=10` per conventions.
16. The split drops or duplicates a test → E3 (exact count 299).
17. `make refs` (dead-refs) fails on a doc or comment citing `web/src/render/launch.ts` after the
    move → D3 / baseline `dead-refs`; web-impl sweeps citations of the three moved paths
    (`rg -n 'render/(launch|settings|issue)\.ts'`).

## Invariants

- **INV-1 (behaviour)**: every E2E test that exists today passes after the plan with no change to
  its assertions; only file location and fixture plumbing may differ.
- **INV-2 (Go root)**: no HTTP handler method has a `*Server` receiver outside `auth.go`,
  `state.go`, `ws.go` — asserted from every feature file (D5).
- **INV-3 (web root)**: `main.ts` contains no DOM lookup, no DOM listener registration, and no
  module-level mutable binding — asserted by W4/W5/W7/W13 over the whole file, not a sample.
- **INV-4 (controller isolation)**: no module under `web/src/features/` imports a sibling
  controller (W6; test files excluded from the grep — they may import the module under test).
- **INV-5 (lifecycle)**: Start order and Stop order are today's, for every feature, including the
  nil-when-disabled ones (a disabled poller is simply not registered, or registers a no-op).

Multi-instance source states: the surfaces phase's open/close diff is asserted with several live
sessions present (tiles.spec.ts "killing one of several live tiles ends only that tile"; "socket
count equals live-surface count in Focus, Tiles, and after a promotion") — those tests move but
are not rewritten.

## Acceptance Criteria

IDs are unique across the whole section — `D*` daemon, `W*` web, `E*` e2e. One clause per
criterion.

### Daemon
- **D1**: the daemon builds.
- **D2**: daemon unit tests pass, including the repaired sanctioned breakage and the new order and
  zero-value tests.
- **D3**: lint passes.
- **D4**: `internal/server/server.go` is at most 300 lines.
- **D5**: no `*Server`-receiver HTTP handler exists outside `auth.go`, `state.go`, `ws.go`
  (negative grep; test files are in scope and today contain no such method, so nothing to exempt).
- **D6**: `Config` has exactly the core fields listed under Affected Files plus one field per
  feature sub-struct, and each sub-struct is declared in its feature's file (reviewer reads
  `server.go`).
- **D7**: `New` registers each feature in one line and `routes`/`Start`/`Shutdown`/`currentSnapshot`
  contain no feature names — they loop (reviewer reads `server.go`).
- **D8**: `cmd/musterd/main.go` passes every flag value into the same-named sub-struct field; no
  flag name or default changed (reviewer diffs `main.go`).
- **D9**: no feature constructor takes `*Server` (reviewer greps `func new.*Feature`).

### Web
- **W1**: the dashboard builds.
- **W2**: web unit tests pass, including the new `app.test.ts`.
- **W3**: `web/src/main.ts` is at most 250 lines.
- **W4**: `web/src/main.ts` registers no DOM event listener.
- **W5**: `web/src/main.ts` performs no direct DOM element lookup.
- **W13**: `web/src/main.ts` does not import the element-lookup helpers (`dom.ts`).
- **W6**: no controller under `web/src/features/` imports a sibling controller (test files excluded).
- **W7**: `web/src/main.ts` declares no module-level mutable binding.
- **W8**: every controller in the vocabulary table exists under `web/src/features/` with an
  `init<Feature>` export (reviewer lists the directory).
- **W9**: `web/src/render/` contains no `init*` controller export after the move (reviewer greps).
- **W10**: `main.ts` states the render-phase order as a numbered comment matching UI Specifications
  (reviewer reads).
- **W11**: no `any` types in new or moved web code (reviewer greps).
- **W12**: `web/index.html` and `web/src/style.css` are byte-identical to `main` (reviewer diffs).

### E2E
- **E1**: the full E2E suite passes.
- **E2**: the E2E lint passes.
- **E3**: the suite contains exactly 299 `test(` calls across `web/e2e/*.spec.ts`.
- **E4**: `web/e2e/tiles.spec.ts` and `web/e2e/rail-cards.spec.ts` exist.
- **E5**: every test in the E2E split table is in the file the table names, with its title
  unchanged (reviewer checks the table against `grep -n '^test('`).
- **E6**: no `test.skip`/`test.fixme`/`test.only` was introduced (baseline `e2e-honest` gate; listed
  so the reviewer records it).

### Automated Checks

Every line below is `<ID> <single-line shell command>`, run from the project root. A check passes
iff its command exits 0. Test-file scope for the negative greps: D5 includes `_test.go` (no
pre-existing hits there); W6 excludes `*.test.ts` because a controller's own test legitimately
imports it.

```checks
D1 go build ./...
D2 make test
D3 make lint
D4 test "$(wc -l < internal/server/server.go)" -le 300
D5 ! rg -n 'func \(s \*Server\) handle' internal/server --glob '!internal/server/auth.go' --glob '!internal/server/state.go' --glob '!internal/server/ws.go'
W1 make web-build
W2 make web-test
W3 test "$(wc -l < web/src/main.ts)" -le 250
W4 ! rg -n 'addEventListener\(' web/src/main.ts
W5 ! rg -n 'querySelector[(<]|getElementById[(<]' web/src/main.ts
W13 ! rg -n 'from "\./dom"' web/src/main.ts
W6 ! rg -n 'from "\./[a-z]+"' web/src/features --glob '!*.test.ts'
W7 ! rg -n '^(let|var) ' web/src/main.ts
E1 make e2e
E2 make e2e-lint
E3 test "$(cat web/e2e/*.spec.ts | grep -cE '^\s*test\(')" -eq 299
E4 test -f web/e2e/tiles.spec.ts && test -f web/e2e/rail-cards.spec.ts
```

### Reviewer-Verified

- **D6**: `Config` core fields + one field per sub-struct; sub-structs declared in feature files.
- **D7**: `New` one-line registration; `routes`/`Start`/`Shutdown`/`currentSnapshot` loop.
- **D8**: `main.go` flag → sub-struct mapping complete; no flag renamed.
- **D9**: no feature constructor takes `*Server`.
- **W8**: every vocabulary controller exists with its `init<Feature>` export.
- **W9**: no `init*` controller left under `web/src/render/`.
- **W10**: render-phase order comment in `main.ts` matches the plan.
- **W11**: no `any` in new or moved web code.
- **W12**: `web/index.html` and `web/src/style.css` unchanged from `main`.
- **E5**: split table honoured, titles unchanged.
- **E6**: `e2e-honest` baseline recorded.
- **INV-5**: Start/Stop order comment present and matches today's order (`git show main:internal/server/server.go`).

## Implementation Notes

**Pipeline shape.** e2e-specs runs first and performs the split against the *unchanged* implementation
(behaviour is the same before and after, so the split must be green before any impl lands — a red
split is a split defect, not an impl defect). daemon-impl and web-impl then run in parallel with no
shared contract to coordinate. Both will break in-package tests by construction; both list the
breakage in `## Handoff` as sanctioned (their agent docs already allow exactly this), run
`golangci-lint run --tests=false ./...` (Go) / confine `tsc` failures to the named test files (web),
and the wave-2 test agents repair. The wave-1 gates are `go build ./...` and `make web-build` with
the documented test-file exception.

**Web: what moves where** (from today's `main.ts`, by today's line ranges, so the agent can move
rather than rewrite):

- connection: L340–390 (`everConnected`, `connectionStatus`, `isConnected`, `setStatus` minus the
  dialog-closing lines which become `status` subscribers, `showProtocolMismatch`), `renderClaudeVersion`.
- usage: L355–361, L424–429, L463–472, the refresh button listener L1259–1271, `currentUsage`.
- theme: L241–242, L438–462, the `onClaudeTheme`/snapshot family adoption; needs a `surfaces`
  handle (`forEachSurface(fn)` or `applyTheme()`) via deps.
- update: L268–269, L750–848 (section elements, apply/restart handlers, `restartConfirm`,
  `renderUpdateBlock`), `currentUpdate`/`currentPrefs`.
- settings: L790–807 plus the `setChecked` call from prefs adoption; `requestTheme` → `putPrefs`.
- issue: L724–747.
- launch: L1324–1361; `onLaunched` needs `tiles.promote` and `state.view` via deps.
- rail: `renderSessions` call L1190–1215, count/sort L1216–1217, sort listener L1253–1257,
  `installDragReorder` L1298–1314, `pendingRailFocus`, `railSort` adoption; the card-select
  callback calls `app.focus(id)`, `app.render()`, and (pointer only) `surfaces.focusSelected(id)`.
- views: L223–224, L413–422, L1219–1248 (switcher, density, mousedown guards → emit
  `cancelRenames`), view containers' `hidden`; `requestView`/`requestDensity`; `toggle()` for shortcuts.
- focus: L153–168 (mainhead elements + surface segment), L169–171 (dead surface refs), L897–967
  (`renderFocusView`), default-focus L1113–1120, mainhead/dead-surface button listeners L836–848;
  exposes `nth(n)`/`neediest()` (L498–514) for shortcuts.
- tiles: L244, L251, L279–284 (`tileElements`), L474–480 (`promoteSession`), L969–1099
  (`reconcileTilesGrid`, `renderTilesView`), `installTileDrag` L1279–1287, `pendingTileFocus`;
  tile rename handlers come from `rename` via deps.
- surfaces: L274–279, L594–634 (`handleSurfaceSelect`, `handleShellEnded`), L887–895
  (`reattachDisconnectedSurfaces`), the diff L1140–1188; exposes `stateFor(id)`, `get(id, kind)`,
  `applyTheme()`, `focusSelected(id)`.
- actions: L307–338 (dead-pane cache), L516–572 (`isBlockingDialogOpen` → shortcuts, `dispatchAction`),
  L574–592 (`findDeadSurfaceRefs` — needs `tiles` handle for the tile's dead surface), L636–721
  (`doPin`/`doEnd`/`doResume`/`handleRemoved` → `emit("sessionRemoved")`/`doRemove`, confirm
  dialogs); exposes `dispatch(action, id)` for rail/tiles/focus.
- rename: L181–221 (`handleRenameCommit`, mainhead editor, `tileRenameHandlers`), L295–299
  (`cancelOpenRenames` → subscribes `cancelRenames` and `status`; tiles cancels its own editors on
  the same event), `focusChanged` subscriber.
- shortcuts: L1316–1340; deps `views.toggle`, `focus.nth`, `focus.neediest`, `actions.isBlockingDialogOpen`.

Doc comments in `main.ts` that explain a *why* (the NBSP sizenote reservation, the mousedown
pre-emption, the insertBefore blur) move with their code; narration of plan names/dates is dropped
per `docs/conventions.md` §Comments.

**Go: the feature interfaces** (names are the agent's; shapes are the plan's):

```go
type feature interface{ mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) }
type lifecycle interface{ Start(); Stop(ctx context.Context) }       // optional
type snapshotContributor interface{ contribute(ctx context.Context, snap *Snapshot) } // optional
```

`guard` is `requireCookie(s.uiToken, writeJSONUnauthorized, …)` pre-bound by the root; ingest
mounts its token-path routes unguarded exactly as today. `Server.register(f feature)` appends and
returns `f` so `s.usage = register(s, newUsageFeature(cfg.Usage, deps))` is one line (a small
generic helper is fine). Disabled-by-config features (usage poller, theme poller, update manager)
stay *inside* their feature: the feature is always registered; internally it holds a nil poller and
answers exactly as today (404 on refresh, "unknown" family, the static update shape).

**Go: cross-feature dependencies to satisfy** (measured from today's `s.*` reads): sessions →
manager, launcher, shells, terminals; terminal → manager, attach, tmux client; prefs → store, hub,
update.SetCheckEnabled; update → manager, tmux lister, prefs reader (Edge Case 13); issue → store,
manager, ClaudeCodeInfo, daemonVersion; locate → manager, locator; repos → store; ws/state (core) →
hub, manager, contributors. Pass them as constructor parameters; where only one method is used,
declare a one-method interface at the consumer.

**Carried-over measurements**: none re-applied under a different configuration — no measured value
changes meaning here; tmux topology, hook timeouts and socket rules are untouched.

**Doc upkeep (orchestrator, Doc-Upkeep Backstop / Completion — not an impl agent's):**

1. `TODO.md` — tick and move the "Dismantle the two composition-root hotspots" block to
   `docs/history/todo-done.md` § Pre-v1 Cleanup.
2. `docs/conventions.md` — add a short **Composition roots** section after "TypeScript / web":
   names `web/src/main.ts` and `internal/server/server.go` as the two composition roots; "a new
   feature is a new module with an init (`web/src/features/<name>.ts`, exemplar
   `web/src/features/usage.ts`) or a new handler type with a `mount` (`internal/server/<name>.go`,
   exemplar `internal/server/usage.go`), registered in one line in the root"; `web/src/render/`
   holds pure DOM builders, `web/src/features/` controllers, `sessions/`/`terminal/` pure logic;
   E2E spec files and `web/e2e/helpers/<feature>.ts` are named for the same seam. ≤ 12 lines.
3. `.claude/skills/plan-work/SKILL.md` §4 Affected Files — one sentence after the SPEC/TODO
   paragraph: "A composition root (`web/src/main.ts`, `internal/server/server.go`) may appear under
   Affected Files only for a one-line registration; anything more is a new feature module
   (docs/conventions.md § Composition roots)."
4. `.claude/agents/review-work.md` §5 and §6 — one bullet each: "Logic landing in a composition
   root (`server.go` / `main.ts`) beyond a one-line registration is Major, tagged to the impl agent."
5. `.claude/agents/web-impl.md` and `daemon-impl.md` — one line each in their layout/patterns
   section pointing at the conventions section (no rule text duplicated).
6. `.claude/agents/e2e-specs.md` L215 — extend "Place new test files in
   `web/e2e/<feature-name>.spec.ts`" with "where `<feature-name>` is the web controller / Go feature
   the plan's vocabulary names; helpers go in `web/e2e/helpers/<feature-name>.ts`."
7. `docs/history/spec-changelog.md` — one entry: composition-root rule settled 2026-09-11 (no SPEC
   section changes; SPEC §5/§7 already describe the stack, not the file layout).

These land on the plan branch after impl so the paths they cite exist (`make refs` would otherwise
fail on `web/src/features/usage.ts`).
