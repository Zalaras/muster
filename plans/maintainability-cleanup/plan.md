# Plan: Maintainability Cleanup

**Created**: 2026-09-23
**Status**: Approved (the developer, 2026-09-23) — run by the main session with agents, not `/orchestrate`
**Work Type**: full-stack refactor
**Features**: actions, canary, connection, drop, focus, ingest, issue, knowledge, launch, lifecycle, rail, reader, release, rename, settings, shortcuts, surfaces, theme, tiles, triage, update, usage, views
**E2E Scope**: none — the existing suite (445 tests in 42 files at baseline) is the oracle; no new specs
**Protocol Contract**: no delta. `docs/protocol.md` is unchanged; no wire field, route, status or error code moves.
**Description**: A newcomer's read of every package and `web/src` directory against `docs/conventions.md` § Design, then the fixes and hotspot splits it names — behaviour unchanged except the session write-ordering fix (D1).

## Rules for every agent in this run

- **Do exactly the unit your spawn prompt names.** Units are listed below; other units are other
  agents' and may be in flight in the same tree (daemon and web tracks run in parallel).
- **Do not commit, do not `git add`.** The main session gates and commits each unit. Leave your
  log (`plans/maintainability-cleanup/<role>-<unit>.md`, e.g. `daemon-implementation-D4.md`) in
  the working tree.
- **Behaviour is unchanged** unless the unit says otherwise: no user-visible string, status code,
  wire field or timing changes. When a refactor seems to need one, stop and report it.
- Impl agents never edit tests; test agents never edit implementation. A refactor that breaks an
  in-package test (a moved symbol, a changed constructor signature) is sanctioned: list each
  broken test in your log for the test agent.
- Every new helper, file or seam gets a `design:` line in your log's `## Decisions`
  (conventions § Design) with the `rg` that showed nothing already does it.
- Leave the tree compiling. Paste gate output, don't assert it.

## Units

Finding IDs refer to the Wave 1 reports in this directory. `a-C1` means
`review.maintainability.a-session.md`, Critical 1, and `b-M3` means `b-server.md`, Major 3. The
prefixes are: `a` session+store, `b` server, `c` cmd+adapters, `d` web core, `e` web UI. The
`S`/`V`/`M`/`B`/`G`/`T` IDs are the seeds in `findings.md`. **Read the cited finding in full**,
because each one states what a fix must make true. Units run in the order listed within a track.

### Daemon track: correctness fixes first (`fix` commits, each with a test from daemon-tests)

- **F1 session writes** — a-seed-S1 (widened), S2/b-M1, a-C1, a-M2, a-M3, a-note-3 (`truncate` UTF-8).
  - Persist and broadcast order both follow mutation order, and every persist site (including
    `storeSnapshot`) takes one writer path with one persist-failure policy.
  - `observeWrite`'s exists-flip becomes a compare-and-set under `Manager.mu`.
  - No field of a `Model`/`Context`/`Attention`/`Failure` reachable from a clone is mutated;
    `applyBind` replaces the pointer.
  - `CreateSession` decides `railPos` in the critical section that registers the session.
  - The id watermark has one reader, and a bump can never lower it.
  - `truncate` never splits a rune.
- **F2 server concurrency** — b-C1 (prefs lost update), b-M2 (lock order), b-M3 (shell spawned after Remove), b-m10 (`wsHub.closeAll` under lock), b-m11 (untracked apply goroutine).
  - `Watched` never waits on a takeover's close or attach, and the lock order is written where
    both mutexes are declared.
  - One keyed-lock implementation serves the manager and the shell registry. For b-m11, Stop
    cancels an in-flight apply and waits for it, bounded.

### Daemon track: refactors (`refactor` commits; behaviour unchanged)

- **D2 session shape.**
  - Split `manager.go` into sibling files. This is a pure-move commit first, so it can be
    blame-ignored. The mapping: `reconcile.go`, `liveness.go`, `actions.go`, `apply.go`,
    `title.go`, `reader.go`, `manager_rail.go`, `row.go`.
  - Then: a-m1 (row mapping), a-m3 (the always-nil error on `Reconcile`), a-m5 (the guard
    doc on `Manager.mu`).
- **D3 session and store duplicates.**
  - a-seed S4–S7.
  - a-m4: one removal routine owns the row delete, the memory drop, reclaiming the lock and
    `OnRemoved`.
  - a-M1: tmux ports are required, reconcile has one classification path, target resolution
    is part of a declared port, and the port name says what it does. daemon-tests pairs this
    with a-m8.
  - a-m7 (`GetRepo`), a-m2 (the store's time helpers), a-m6 (duplicate migration version),
    a-note-6 (one transaction idiom).
- **D4 server transport.**
  - b-M8/V1: a transport file holds the envelope once, success encoding, id-to-session-or-404,
    and directory-missing.
  - b-m1: every 5xx is logged with fixed phrases, and the logger comes last in every
    constructor.
  - b-m13: one wire time format.
- **D5 terminal-socket lifecycle.** b-M5/V4: one attach-and-pump lifecycle parameterised by
  surface, with each surface's frame code beside its handler.
- **D6 composition root and wire homes.**
  - b-M9/V5: no line in `New` writes a field of another feature, and wire mapping lives in
    `*wire.go`.
  - b-m5: no test-only production surface.
  - b-m6: each feature owns its wire type and default.
  - b-m1's V8 half: core handlers and the package invariant agree.
- **D7 feature files.**
  - b-m2: `sessions.go` separates into launcher, launch errors and feature. Spawn-under-timeout
    and kill-after-record-failure exist once.
  - b-m4: `issue.go`'s disabled state has the nil shape, the reserve/post/consume lifecycle is
    delegated, and one eviction loop remains.
  - b-m3: `update.go` has one builder and one client default.
  - c-M3 + b-m3: `internal/selfupdate` owns the newer-than-running check, the may-apply rule
    and the tag⇄version mapping; the server and cmd both call it.
  - b-M4/G3: one background-loop lifecycle; the pollers keep only `tick`.
  - b-M6 + c-m11: one permission-mode set, owned by `session`, which `claudecode` and `server`
    consult.
  - b-m7: no `"status_line"` literal in server.
  - b-m8: restart-impact asks the manager for its shells.
  - b-m9: shell-pane checks go through the registry.
  - b-m12: the dead `walkErr` branch is gone.
  - b-m14: part of it only. `handleBrowse` and `handleRestartImpact` each delegate to one call.
    Extracting the reader's domain into its own package is **proposed**, not done here.
- **D8 cmd/musterd.**
  - c-m13/M1: each startup step with its own test file gets its own source file, as its
    siblings have.
  - c-m14/M2: no `-help` string names a plan ID.
  - c-m9: the `-version` format is declared once.
  - The `main.go:768` comment names the developer by first name; rewrite it.
- **D10 adapters.**
  - c-M1: one subprocess-seam convention. The shape is **decided in `docs/conventions.md` §
    Testing first**; the main session will say which.
  - c-M2: the ingest route and `MUSTER_SESSION` each have one declaration.
  - c-m1 + b-M7/V3: gitutil owns every git query behind a seam, and the server spells no git
    argv.
  - c-m2: `InstalledVersion` gets a seam.
  - c-m3: `runCapture` goes through the Client seam.
  - c-m4: the `"muster-"` prefix is declared once.
  - c-m5: one "absent versus could-not-ask" decision.
  - c-m6: one kill primitive.
  - c-m7: `filepath.IsLocal`.
  - c-m8: `cmp.Compare`.
  - c-m10: internal/usage owns the source label.
  - c-m12: the dead `claudecode.Classify` goes.
  - c-m15: `Aggregator` names its writer.
- **D9 test tidy** (daemon-tests):
  - T1: the dupl pairs become table rows.
  - c-M4 + c-m16: each claudecodetest wire skeleton is built once, the dead builders go, and the
    byte output is unchanged.
  - a-m8: one test constructor for `Manager`.

### Web track (parallel to the daemon track)

- **WF1 `fix(web)`** — e-m8: a spawn response no longer overrides a newer surface choice. Also
  e-note-4: `check()` renders when it settles.
- **W1 decoders and enums (before the split).**
  - d-M3: one module holds the record, list-of and nullable-of decoders, used by protocol,
    api, `theme.ts` and `reader/memory.ts`.
  - d-M1: each wire enum lists its members once, and its type and guard are derived from that
    list.
  - d-m1: pref defaults are stated once.
  - d-m2: `PrefsRequest` is derived from `Prefs`.
- **W2 `api.ts`.**
  - Dedupe first. B1: `decodeEmpty`, the request helpers, and `requestPrefs`. e-m5: a failed
    `ApiResult` is logged by one helper that knows its route, and no controller spells an API
    path.
  - B2: permission modes leave the HTTP layer.
  - Then split into `web/src/api/` (`http.ts` plus one file per endpoint family, **no barrel**).
- **W3 `protocol.ts` → `web/src/protocol/`**, split per concept with **no barrel**, and the
  importers re-pointed. Each `biome-ignore` stays directly above its validator; drop it if W1
  made it unnecessary.
- **W4 composition roots.** d-C1/B6:
  - The WS-to-app mapping and the socket URL are defined once. That also covers the third copy
    of the URL at `terminal/pane.ts:218`.
  - Each entry wires the client in one line.
  - The view render phase and `doc.ts`'s query and notice move into feature or render modules.
- **W5 one owner per helper.**
  - B4 + e-B4 `requireEl`, and B5 plus `SessionAction`.
  - d-M4: one age function and one "age ago" function.
  - d-M2: one reorder rule.
  - e-M1: one resumable predicate in `sessions/`.
  - e-m9: one visible-ids definition.
  - d-m5: one storage seam and one safe JSON read.
  - d-m3 + e-m2: dead exports and pass-through wrappers go.
  - d-note-6, d-note-7, d-note-8.
- **W6 render layer.**
  - Placement:
    - B7: `focusrestore`/`launchrestore` and the other pure functions e-B7 lists move out of
      `render/`.
    - B8: `render/dead.ts` stops fetching.
    - B9: the dialog builders in `features/` move to `render/`.
    - B10 and B11.
    - e-m17: the segment DOM builder moves out of `terminal/`.
    - d-m4: the frontmatter builders move to `render/`.
  - Then:
    - e-M5: card and rail options travel as one object.
    - e-M2: one bucket view-model and one renderer.
    - e-M4: one keyed-reorder routine in `render/`, used by rail, strip and grid.
    - e-m12: one template-lookup rule.
    - e-m13: one focus-preserve helper, named for what it does.
    - e-m14: one attribute helper each for `aria-current` and the dirty dot.
    - e-m15: the diagrams functions take one options type.
    - e-m3: the rename editor exposes its state through its controller and knows nothing of
      tiles.
    - e-m1: the render state rule is written down, and the model-week nodes are refs the caller
      holds.
- **W7 controllers.**
  - e-M3: one body-kind decision and one slot mount.
  - e-M7: update wires its own buttons.
  - e-M8: one theme-change signal reaches both surfaces and readers.
  - e-M9: the view that renders a dead surface shows its notice.
  - e-m4: one `init` shape.
  - e-m7: one keydown listener.
  - e-m10: reader memory is owned by the reader.
  - e-m11: one tile teardown.
  - e-m6: one message region and one radio-check helper.
  - e-m16: drop wiring attaches through a small interface, and one theme builder remains.
- **W8 web tests** (web-tests):
  - Re-point tests at moved modules.
  - e-M6: fixtures supply every field real callers supply, so production optionality that
    exists only for fixtures goes (the web-impl half removes the `?`s, `tiledrag.ts` and
    `toggleChecked`).
  - Delete tests that pinned only removed dead exports.

### Cross-cutting, after both tracks

- **X1 plan-ID sweep** over **non-test** code, one commit per package or directory. Each comment
  is rewritten to state the current why, or to cite a `kb:` record, or it is deleted. Test-file
  comments and `describe()` strings are **proposed** for later, not swept here.
- **X2 docs.**
  - Feature-registry globs, ADR `files:`, and the directory `CLAUDE.md`s.
  - `kb:diagram/web-components`: the edges and cycles d-note-2 and e-note-3 list.
  - `kb:diagram/daemon-components`, if a package edge changed.
  - The conventions sentences.
  - Then `make gen-kb check-kb refs`.

## Defaults that bind the units

- `protocol.ts` / `api.ts` become directories **without a barrel**; importers are re-pointed
  (`web/src` has no barrels — match the siblings).
- The `exec.CommandContext` + `WaitDelay` repetition across packages is **not** a duplicate:
  conventions § Go asks for it inline, next to the command's timeout. Leave it.
- A DOM-free decision owned by one controller lives beside it in `features/` (conventions
  sentence lands in W4).
- Code comments cite no plan IDs (`REQ-n`, `Dn`, `Edge Case n`, review cycles, plan or milestone
  names): conventions § Comments and § Knowledge records already forbid it. X1 applies it.
