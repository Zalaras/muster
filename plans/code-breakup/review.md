# Review: Code Breakup — dismantle the two composition-root hotspots

**Plan**: code-breakup
**Verdict**: approved

Cycle 2. The cycle-1 fix wave closed all three Majors and touched nothing but comments —
I re-ran each of cycle 1's own `rg` repros and diffed every changed line, and the entire
diff since `aa3b46b` outside `plans/` is comment text. Every repointed citation names the
module that actually owns the thing now; I checked the named symbols exist where the new
comments claim (`features/actions.ts`'s `pinSession`/`handleRemoved`/`ensurePaneFetch`,
`features/focus.ts`'s mainhead button wiring and `buildSurfaceSegment`,
`features/rename.ts`'s `TileRenameHandlers`, `features/settings.ts`'s own `onChooseTheme`
implementation, `features/surfaces.ts`'s `select`/`applyTheme`/`focusSelected`,
`features/rail.ts`'s `focusSelected` call). Nothing regressed: the full suite is
302/302, all 17 authored checks pass, and the composition roots sit at 127 and 300 lines
with no logic in either.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `main.ts` composition root only, ≤ 250 lines | Yes — 127 lines; read in full, zero DOM lookups, listeners or `let` | W3–W7/W13 + E2E | pass |
| REQ-2 one controller per feature under `features/` with `init<Feature>` | Yes — 15 controllers, all 15 vocabulary rows | E2E | pass |
| REQ-3 `web/src/app.ts` cross-feature seam | Yes — store, `AppState`, typed bus, ordered phases, `render`, `focus` | `app.test.ts` | pass |
| REQ-4 no controller imports a sibling | Yes | W6 re-run clean | pass |
| REQ-5 `server.go` composition root only, ≤ 300 lines | Yes — exactly 300; read in full, only core routes remain | D4/D5 | pass |
| REQ-6 each Go feature a type with deps, `mount`, optional lifecycle/snapshot | Yes — `register` generic, `routes`/`Start`/`Shutdown` all loop `s.features` | daemon unit tests | pass |
| REQ-7 `Config` groups feature fields into sub-structs in their own files | Yes — Launch/Usage/Theme/Issue/Update | compile + tests | pass |
| REQ-8 behaviour unchanged, same test count | Yes — 302/302, 299 `test(` call sites | full E2E sweep | pass |
| REQ-9 grab-bags split per the mapping table | Yes — 13/5/17/5, nothing deleted, skipped or weakened | E5/E6 re-verified | pass |
| REQ-10 zero-value safety per sub-struct | Yes | zero-value tests incl. `ClaudeBin` default | pass |
| REQ-11 Start/Stop order is today's, with a comment naming why | Yes — `server.go:186-189` states it; both order tests assert real invocation | two order tests | pass |
| REQ-12 Vitest coverage for extracted pure logic | Yes — `app.test.ts` | — | pass |
| REQ-13 Go test helper signatures preserved | Yes — `newTestServer` unchanged; edits are field-path repairs only | package compiles | pass |
| REQ-14 `render/` pure builders; `sessions/`/`terminal/` untouched | Yes — branch diff in those two dirs is comment-only, verified line by line | W9 | pass |

## Build & Tests

E2E tests: pass (302 passed, 1.6m, full suite, zero skipped)
Daemon tests: pass (all packages)
Web tests: pass (1446)
Daemon build: pass
Web build: pass
Lint: pass (`golangci-lint run` — 0 issues)
Dead refs: pass (`make refs` — 1313 references, 0 missing)
Contrast: pass (`make contrast` — instrument/dark/light, 43 pairs each, 0 failures)
E2E lint: pass (`make e2e-lint` — clean)

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
| DOC | doc upkeep | pass — `docs/conventions.md` § Composition roots, `plan-work`, `review-work`, `web-impl`/`daemon-impl`, `e2e-specs` and the spec-changelog all landed; the `TODO.md` entry at line 251 was repointed to the moved settings path. The plan's own `TODO.md` tick / move to `docs/history/todo-done.md` correctly remains pending on this verdict (orchestrator Completion step). |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D6 | `Config` core fields + one field per sub-struct, sub-structs in feature files | pass | read `server.go` in full: core fields plus exactly `Launch`/`Usage`/`Theme`/`Issue`/`Update`, each declared in its feature's own file |
| D7 | `New` registers in one line; `routes`/`Start`/`Shutdown`/`currentSnapshot` loop | pass | one `register(s, new*Feature(...))` line per feature; `routes`, `Start` and `Shutdown` each iterate `s.features` with a type assertion and name no feature (one plan-mandated exception, Note 1) |
| D8 | every flag maps to the same-named sub-struct field, none renamed | pass | the branch diff of `cmd/musterd/main.go` changes **zero** `flag.*` declaration lines — every name and default is literally untouched; only the struct literal regrouped |
| D9 | no feature constructor takes `*Server` | pass | every `new*Feature` signature takes concrete collaborators or narrow interfaces |
| W8 | every vocabulary controller exists with its `init<Feature>` export | pass | all 15 present under `web/src/features/`; `drop` is the pre-existing `render/dropguard.ts` per the table |
| W9 | no `init*` controller left under `render/` | pass | only the elements-in/handlers-in builders REQ-2 permits |
| W10 | render-phase order comment matches the plan | pass | `main.ts:56-69` lists phases 1–10 in the plan's order; the registration sequence produces exactly that, with phase 10 the documented root-level dispatch |
| W11 | no `any` in new or moved web code | pass | `rg ': any\|<any>\|as any\|any\[\]\|Array<any>'` over non-test `web/src` returns only two prose uses of the English word in comments |
| W12 | `web/index.html` and `web/src/style.css` unchanged from `main` | pass | `git diff main...HEAD` on both paths is empty |
| E5 | split table honoured, titles unchanged | pass | 13/5/17/5 across `actions`/`rail-cards`/`tiles`/`views`; fixture shapes match the plan's Fixture plan exactly (`fileDaemon`, `fileDaemon`, per-test `daemon`, per-test `daemon`) |
| E6 | `e2e-honest` baseline recorded | pass | the gate's own line (`! rg 'test\.(skip\|fixme\|only)\(' web/e2e`) returns nothing; both Repairs tables in `test-specs.md` read "None", so no assertion was deleted or weakened |
| INV-5 | Start/Stop order comment present and matches today's | pass | `server.go:186-189` states the order and why it is not reversed; `TestNew_RegistersLifecycleFeaturesInStartOrder` pins registration and `TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed` pins `Shutdown`'s own loop with recording doubles that assert real invocation order |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode/` | pass — `internal/session` and `internal/store` are untouched by this branch; no new leak in `internal/server` |
| 2 | No terminal-output state parsing | pass — `CapturePane` remains snapshot/display only; `internal/tmux` untouched |
| 3 | Non-blocking hook handler | pass — `ingestFeature` checks the token, enqueues the raw body, returns 200 |
| 4 | tmux always on a dedicated socket; no `resize-pane` | pass — `rg resize-pane` over `internal`, `cmd`, `web/src` returns nothing; `pty.Setsize` then `resize-window`, in that order, in untouched `internal/termbridge` |
| 5 | No payload logging | pass — the ingest path logs kind and outcome only |
| 6 | No empty-gauge dishonesty | pass — verified live in a browser (below): each readout renders label plus the word *unknown* with **no `.track` element in the DOM at all** |
| 7 | Session identity on the tmux target | pass — untouched |
| 8 | No settings trespass | pass — no `~/.claude/settings*.json` or `CLAUDE_CONFIG_DIR` in non-test code outside `internal/claudecode/` |
| 9 | No real `claude` outside canary/probes | pass — the harness's stub binary is unchanged, and my own drive used it |

Design system: this plan changes neither `web/index.html` nor `web/src/style.css` (W12),
so tokens, fonts, state colours and tabular numerics are unchanged by construction. The
set of elements toggled via the `hidden` attribute is byte-identical to `main`'s — I
diffed the sorted toggle-target lists across the two revisions — so no `[hidden]`
companion rule can have been orphaned by the move. `make contrast` passes in all three
themes. Terminal rules §7: xterm `scrollback: 0` intact, and I confirmed live that
switching Focus→Tiles *moves* the surface rather than opening a second live client.

## Manual Verification

Drove the real dashboard in headless Chromium against a scratch daemon started through
the harness's own `startScratchDaemon`, so isolation was the suite's rather than mine:
scratch data dir, private tmux socket, stub `claude`, and — unlike cycle 1's drive — a
scratch `-usage-token-file`, `-claude-config-file`, `-issue-token-file` and empty
`-update-base-url`, all passed unconditionally by that helper. No real Keychain read, no
real GitHub call, no real Claude Code process. Screenshots of all five states captured
and inspected; the daemon, its tmux server and its data dir were torn down afterwards,
and the temporary driver files were removed (`git status` clean).

- **No data yet.** Fresh daemon, no sessions: `data-theme=instrument`, and the masthead
  markup for all three usage readouts is label plus `<span class="num">unknown</span>` —
  no track element exists in the DOM to be drawn empty. This is design-system §6.1
  holding through the refactor, confirmed from the markup rather than from a passing test.
- **Data.** Launched one session. The rail card, the mainhead heading, the repo/model
  meta line and the `claude | shell` segment all populate; the xterm surface mounts and
  the sizenote reads `130×25 · one live client · geometry owned by this pane`.
- **Tiles.** `Cmd+\` switches: `#view-focus` gains `hidden`, one tile builds, and the
  count of xterm instances in the document stays at exactly **1** across the switch — the
  surface moved, no second live client opened.
- **Theme.** Settings → Dark flipped `data-theme` to `dark` with no reload; Escape closed
  the dialog.
- **Daemon down.** SIGKILLed the daemon. The banner reads "musterd unreachable — hook
  output in open panes is Muster's absence, not session failure.", the status line reads
  "reconnecting…", End/Resume/Remove are all `disabled=true`, `data-theme` stays `dark`
  (E12/INV-4), and the gauges still read *unknown* rather than 0%.
- **Zero console errors and zero page errors** across the whole drive.

## Issues

### Critical

None.

### Major

None. All three cycle-1 Majors are closed:

- Major 1 (51 stale `main.ts` ownership comments): `rg -n 'main\.ts' web/src --glob '!*.test.ts'`
  now returns only the eleven citations cycle 1 explicitly listed as *still true* — `app.ts`,
  `dom.ts`, and the init-order comments in `features/theme.ts`, `surfaces.ts`, `rail.ts`,
  `actions.ts` (×2), `tiles.ts` and `focus.ts` (×3). Every repointed target verified against
  the code.
- Major 2 (`render/launch.ts` in `features/issue.ts`): no `render/launch.ts` citation
  remains anywhere under `web/src`.
- Major 3 (`render/issue.ts` in `internal/server/issue.go`): now cites `features/issue.ts`.

### Minor

None.

### Notes

1. **[note]** `Shutdown` names `s.terminal.closeAll()` before the feature loop, which reads
   against D7's "no feature names". This is the plan's own instruction: REQ-11 fixes the
   shutdown order as "hub, terminals, then the same order". Carried forward from cycle 1;
   no change wanted.
2. **[note]** `(*Server).loadPrefs` (`internal/server/prefs.go:160`) and
   `(*Server).buildIssueSnapshot` (`internal/server/issue.go:541`) survive purely as
   one-line test-facing delegators — I confirmed neither has a non-test caller. The
   trade-off (production code whose only callers are tests, versus a ~30-site test edit
   outside the plan's sanctioned-breakage list) was taken deliberately and is documented
   at both sites. It remains the one place the Go root did not fully empty out. No change
   wanted.
3. **[note]** `docs/design/worktree-conflicts.md:17` still lists `web/src/main.ts` among
   "a few code chokepoints", which this plan has just stopped being true. The file is a
   dated, explicitly-undecided research note ("Research/discussion session 2026-09-01"),
   so the sentence is an accurate record of what that session observed and rewriting it
   would falsify the record. Same class as cycle 1's Note 5. No change wanted — flagged
   only so the doc-upkeep backstop knows it was seen and judged.
4. **[note]** `main.ts` wires `onConnecting` to `connection.disconnected()`. It reads
   oddly at the call site but is correct and documented on the handle method:
   `connection` owns `everConnected`, so the `connecting`/`reconnecting` ternary cannot
   live in the root. Carried forward; no change wanted.
5. **[note]** `initShortcuts(_app, deps)` takes an unused `app` to keep the uniform
   `init<Feature>(app, deps)` shape REQ-2 specifies. Deliberate. No change wanted.
6. **[note]** web-impl departed from the plan's "`initViews` runs before `initTiles`"
   instruction because the required render-phase order forces the opposite construction
   order. Its resolution — both `prefs` subscribers compare the incoming message against
   their own closure-held last values rather than against `app.state` — makes subscriber
   order irrelevant to correctness instead of depending on it. Better than the plan's
   answer, documented in both modules, and covered live. Compliant with REQ-1/REQ-2/REQ-4.
7. **[note]** Render phase 10 being registered by `main.ts` rather than self-registered is
   sound: it is a dispatch between two controllers keyed on shared state, and registering
   it inside either would place it at that controller's construction position instead of
   last. The root holds no logic beyond the one-line `app.state.view` branch.
8. **[note]** The lazy thunks in `initActions` and `initTiles` are safe — nothing
   dereferences them during construction, and they come from the root rather than from a
   sibling import. This is the web analogue of the daemon's Edge Case 13. Compliant with
   REQ-4.
