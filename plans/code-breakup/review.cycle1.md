# Review: Code Breakup — dismantle the two composition-root hotspots

**Plan**: code-breakup
**Verdict**: needs-changes

Every gate is green and the refactor itself is well executed on both sides. The two blocking
issues are documentation defects the refactor introduced: 51 code comments across the web tree
still name `main.ts` as the owner of logic this plan moved into `web/src/features/`, and one Go
comment cites a web path that no longer exists. Both are Major under review-work §8 (a code
comment false about behaviour this plan shipped), both are mechanical, and both ride one fix wave.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `main.ts` composition root only, ≤ 250 lines | Yes — 127 lines, no lookup/listener/mutable binding | W3–W7/W13 checks + E2E | pass |
| REQ-2 one controller per feature under `features/` with `init<Feature>` | Yes — 15 controllers, all 15 vocabulary rows | E2E | pass |
| REQ-3 `web/src/app.ts` cross-feature seam | Yes — store, `AppState`, typed bus, ordered phases, `render`, `focus` | `app.test.ts` (22 tests) | pass |
| REQ-4 no controller imports a sibling | Yes — every `Deps` typed structurally, incl. `import type` | W6 check, verified strictly | pass |
| REQ-5 `server.go` composition root only, ≤ 300 lines | Yes — exactly 300; only core routes remain | D4/D5 checks | pass |
| REQ-6 each Go feature a type with deps, `mount`, optional lifecycle/snapshot | Yes — 12 features, 4 lifecycle, 4 contributors | daemon unit tests | pass |
| REQ-7 `Config` groups feature fields into sub-structs in their own files | Yes — Launch/Usage/Theme/Issue/Update | compile + tests | pass |
| REQ-8 behaviour unchanged, same test count | Yes — 302/302, 299 `test(` call sites | full E2E sweep | pass |
| REQ-9 grab-bags split per the mapping table | Yes — 13/5/17/5, no test deleted, weakened or retitled | E5/E6 verified | pass |
| REQ-10 zero-value safety per sub-struct | Yes — nil poller/manager when disabled, no network/Keychain/`gh` reach | existing + new zero-value tests | pass |
| REQ-11 Start/Stop order is today's, with a comment naming why | Yes — ingest, usage, theme, update; forward, unreversed | two order tests (registration + `Shutdown`) | pass |
| REQ-12 Vitest coverage for extracted pure logic | Yes — `app.test.ts` | — | pass |
| REQ-13 Go test helper signatures preserved | Yes — `newTestServer` unchanged; breakage matched the plan's list exactly | package compiles | pass |
| REQ-14 `render/` holds only pure builders; `sessions/`/`terminal/` untouched | Yes — no `init<Feature>` in `render/`; zero diff in the two dirs | W9 verified | pass |

## Build & Tests

E2E tests: pass (302 passed, 1.6m, full suite, zero skipped)
Daemon tests: pass (all packages, uncached)
Web tests: pass (1446)
Daemon build: pass
Web build: pass
Lint: pass (`golangci-lint run` — 0 issues)
Dead refs: pass (`make refs` — 1327 references checked, 0 missing)

## Acceptance Checks

Run via `.claude/skills/orchestrate/scripts/gates.sh code-breakup --checks-only` — 17 lines, 0 failed.

| ID | Command | Result |
|----|---------|--------|
| D1 | `go build ./...` | pass |
| D2 | `make test` | pass |
| D3 | `make lint` | pass |
| D4 | `server.go` ≤ 300 lines | pass (exactly 300) |
| D5 | no `*Server`-receiver handler outside auth/state/ws | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `main.ts` ≤ 250 lines | pass (127) |
| W4 | no `addEventListener` in `main.ts` | pass |
| W5 | no DOM lookup in `main.ts` | pass |
| W13 | `main.ts` does not import `dom.ts` | pass |
| W6 | no sibling import under `features/` | pass |
| W7 | no module-level mutable binding in `main.ts` | pass |
| E1 | `make e2e` | pass |
| E2 | `make e2e-lint` | pass |
| E3 | 299 `test(` call sites | pass |
| E4 | `tiles.spec.ts` and `rail-cards.spec.ts` exist | pass |
| DOC | doc upkeep (items 2–7 in `c5d306a`) | pass — conventions § Composition roots, plan-work, review-work, web-impl/daemon-impl, e2e-specs, spec-changelog all landed; item 1 (the `TODO.md` tick) correctly still pending on this verdict |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D6 | `Config` core fields + one field per sub-struct, sub-structs in feature files | pass | `server.go:24-49` carries exactly the 13 core fields the plan lists plus `Launch`/`Usage`/`Theme`/`Issue`/`Update`; each sub-struct declared in `sessions.go`, `usage.go`, `themepoll.go`, `issue.go`, `update.go` |
| D7 | `New` registers in one line; `routes`/`Start`/`Shutdown`/`currentSnapshot` loop | pass | `server.go:180-201` one `register(...)` line per feature; `routes`, `Start`, `Shutdown` and `state.go:114` all iterate `s.features` with a type assertion, naming no feature (see Note 1 on the one plan-mandated exception) |
| D8 | every flag maps to the same-named sub-struct field, none renamed | pass | diffed `cmd/musterd/main.go` — the literal regroups only; every flag variable lands on its namesake field, no default touched |
| D9 | no feature constructor takes `*Server` | pass | all 12 `new*Feature` signatures take concrete collaborators or narrow interfaces |
| W8 | every vocabulary controller exists with its `init<Feature>` export | pass | all 15 present under `web/src/features/`; `drop` is the pre-existing `render/dropguard.ts` per the table |
| W9 | no `init*` controller left under `render/` | pass | only `initConfirmDialogs`/`initRestartConfirm` remain — elements-in/handlers-in builders, explicitly permitted by REQ-2 |
| W10 | render-phase order comment matches the plan | pass | `main.ts:57-69` lists phases 1–10 in the plan's order; registration order (actions, usage, update, issue, tiles, focus, surfaces, rail, views, then main's dispatch) produces exactly that, and no controller constructed after phase 10 registers one |
| W11 | no `any` in new or moved web code | pass | `rg ': any\|<any>\|as any\|any\[\]\|Array<any>'` over `web/src` (non-test) returns nothing; `tsconfig.json` strictness flags intact |
| W12 | `web/index.html` and `web/src/style.css` unchanged from `main` | pass | `git diff main...HEAD` on both paths is empty |
| E5 | split table honoured, titles unchanged | pass | checked all 40 titles against the table: `actions.spec.ts` 13, `rail-cards.spec.ts` 5, `tiles.spec.ts` 17, `views.spec.ts` 5; fixtures match the Fixture plan (`fileDaemon`, `fileDaemon`, `daemon`, `daemon`) |
| E6 | no `test.skip`/`fixme`/`only` introduced | pass | `rg` over `web/e2e/` returns nothing; both Repairs tables read "None", so no assertion was deleted or weakened |
| INV-5 | Start/Stop order comment present and matches today's | pass | `server.go:191-194` states the order and why it is not reversed; `TestNew_RegistersLifecycleFeaturesInStartOrder` pins registration and `TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed` pins `Shutdown`'s own loop with recording doubles |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass — no new leak; `ingestFeature` still delegates to `claudecode.InterpretStatus` |
| 2 | No terminal-output state parsing | pass — `CapturePane` remains snapshot/display only, unchanged by this plan |
| 3 | Non-blocking hook handler | pass — `ingest.go:235` checks the token, enqueues the raw body, returns 200; no DB work on the path |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — socket flag unchanged; `rg resize-pane` over `internal`, `cmd`, `web/src` returns nothing |
| 5 | No payload logging | pass — the ingest path logs only kind and outcome, never the body |
| 6 | No empty-gauge dishonesty | pass — verified live: all three gauges read "unknown" with no track before the first response and while the daemon is down |
| 7 | Session identity on the tmux target | pass — untouched |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json` or `CLAUDE_CONFIG_DIR` reference in non-test code |
| 9 | No real `claude` outside canary/probes | pass — the E2E harness's stub binary is unchanged; my own manual run used a stub too |

## Manual Verification

Drove the real dashboard in headless Chromium against a scratch daemon (own port, own data dir,
own tmux socket path, stub `claude` binary — no real Claude Code process, no real subscription
use). Confirmed by hand, not by trusting a test:

- **No data yet.** Fresh daemon, no sessions: both usage gauges and the model-week readout render
  the word *unknown* with no track drawn, `data-theme=instrument`, Focus shows its empty state.
  This is the design-system §6.1 honesty rule holding through the refactor.
- **Data.** Created one session through `POST /api/sessions`. The rail card, count and mainhead
  all pick up the title; the xterm surface mounts in `#main-terminal-slot` and streams the stub's
  output; the sizenote reads `130×25 · one live client · geometry owned by this pane`.
- **Tiles.** Switching to Tiles hides the Focus subtree, builds one tile, shows the density
  toolbar, and the same stub output appears in the tile — the surface moved rather than a second
  live client opening (terminal rule §7).
- **Theme.** Opened Settings, chose Dark: `data-theme` flipped to `dark` without a reload, the
  dialog closed on Escape.
- **Daemon down.** SIGKILLed the daemon. The banner appears with its full text, status reads
  "reconnecting…", the mainhead End/Resume/Remove buttons are all disabled, the terminal overlay
  reads "disconnected — daemon down", and the gauges still read unknown rather than 0%.
- **Zero console errors and zero page errors** across the whole drive.

Screenshots of the three states were captured and inspected. The scratch daemon, its tmux server
and its data dir were removed afterwards.

One thing to note about my own harness rather than the code: I omitted `-usage-token-file`, so
that scratch daemon's usage poller read the real Keychain entry once for a read-only usage query.
Nothing was written anywhere outside the scratch directory, which is now deleted.

## Issues

### Critical

None.

### Major

1. **[web-impl]** 51 code comments still name `main.ts` as the owner of logic this plan moved
   into `web/src/features/`, so the plan's headline change is contradicted by the comments a
   reader meets first. Several cite functions that no longer exist anywhere: `render/update.ts:23`
   points at "main.ts's `applyPrefsFromSnapshot`", `terminal/surfaceswitch.ts:118` at "main.ts's
   `handleSurfaceSelect`", `render/sessions.ts:281` at "`main.ts`'s `reconcileTilesGrid`",
   `terminal/surfaceswitch.ts:11` calls the surface-switch state "a small pure Map held by
   main.ts", and `render/sessions.ts:417` calls the pane lifecycle "main.ts's surface manager's
   job" — all now `features/tiles.ts`, `features/surfaces.ts` and `features/views.ts`. Fix: point
   each at the controller that actually owns it now. The exact site list is
   `rg -n 'main\.ts' web/src --glob '!*.test.ts'` minus `main.ts` itself and minus the citations
   that are still true (`app.ts`, `dom.ts`, and the init-order comments in `features/theme.ts`,
   `surfaces.ts`, `rail.ts`, `actions.ts`, `tiles.ts`, `focus.ts`). By file:
   `render/sessions.ts` (9), `render/mainhead.ts` (7), `terminal/surfaceswitch.ts` (5),
   `terminal/pane.ts` (5), `render/tiles.ts` (5), `features/settings.ts` (3), `render/update.ts`
   (2), `render/tiledrag.ts` (2), and one each in `theme.ts`, `api.ts`, `protocol.ts`,
   `sessions/store.ts`, `sessions/sort.ts`, `sessions/railorder.ts`, `sessions/live.ts`,
   `render/rename.ts`, `render/masthead.ts`, `render/dragreorder.ts`, `render/dead.ts`,
   `render/confirm.ts`, `features/launch.ts`, `features/issue.ts`. Editing a comment in
   `sessions/` or `terminal/` does not breach REQ-14, which forbids restructuring those
   directories, not correcting a sentence in them.

2. **[web-impl]** `web/src/features/issue.ts:93` and `:146` cite `render/launch.ts`, a path this
   plan deleted (the module is now `web/src/features/launch.ts`). This is the Edge Case 17 sweep
   that `web-implementation.md` records as done; these two sites in a file the same agent moved
   were missed. `make refs` does not catch them because the citations are bare relative words, not
   repo-rooted paths — so the gate passing is not evidence the sweep was complete.

3. **[daemon-impl]** `internal/server/issue.go:366` cites `render/issue.ts`, also now
   `web/src/features/issue.ts`. Same class as Major 2 but in a Go file, which web-impl may not
   edit — hence the separate tag.

### Minor

None.

### Notes

1. **[note]** `Shutdown` names `s.terminal.closeAll()` before the feature loop, which reads against
   D7's "no feature names". This is the plan's own instruction: REQ-11 fixes the shutdown order as
   "hub, terminals, then the same order", and Affected Files says `closeAll` is "exposed for
   Shutdown". No change wanted.
2. **[note]** `(*Server).loadPrefs` and `(*Server).buildIssueSnapshot` survive purely as
   test-facing delegators — 23 and 7 direct call sites respectively that REQ-13 requires keep
   compiling. Both are one-line delegates with a comment saying exactly that, and `make lint` is
   clean. The trade-off (production code whose only callers are tests, versus a 30-site test edit
   outside the plan's sanctioned-breakage list) was taken deliberately and recorded. No change
   wanted, but it is the one place the Go root did not fully empty out.
3. **[note]** `main.ts` wires `onConnecting` to `connection.disconnected()`. It reads oddly at the
   call site but is correct and documented on the handle method: `connection` owns `everConnected`,
   so the `connecting`/`reconnecting` ternary cannot live in the root. No change wanted.
4. **[note]** `initShortcuts(_app, deps)` takes an unused `app` to keep the uniform
   `init<Feature>(app, deps)` shape REQ-2 specifies. Deliberate. No change wanted.
5. **[note]** `TODO.md:161-162` still describes the controller shape using the pre-move paths
   `render/launch.ts`/`settings.ts`/`issue.ts`. That block is about to move to
   `docs/history/todo-done.md`, which records how things got here rather than current state, so it
   is correct as a historical record. No change wanted.
6. **[note]** web-impl departed from the plan's "`initViews` runs before `initTiles`" instruction,
   because the required render-phase order forces the opposite construction order. Its resolution —
   both `prefs` subscribers read `prefs.view`/`prefs.density` off the incoming message and compare
   against their own closure-held last values, never against `app.state` — makes subscriber order
   irrelevant to correctness rather than depending on it. That is a better answer than the plan's,
   it is documented in both modules' header comments, and Edge Cases 2 and 7 are covered live by
   `tiles.spec.ts` and `views.spec.ts`. Judged against REQ-1/REQ-2/REQ-4: compliant.
7. **[note]** Render phase 10 being registered by `main.ts` rather than self-registered is likewise
   sound. It is a dispatch between two controllers keyed on shared state; registering it inside
   either would place it at that controller's construction position (5 or 6) instead of last.
   `main.ts` holds no logic beyond the one-line `app.state.view` branch, so REQ-1 holds.
8. **[note]** The two lazy thunks (`actions`' two deps, `tiles`' two deps) are safe: nothing
   dereferences them during construction, and every other controller takes an
   already-constructed value. This is the web analogue of the daemon's Edge Case 13 and is
   documented in `main.ts`'s header. Judged against REQ-4: compliant, since the thunks come from
   the root, not from a sibling import.
</content>
</invoke>
