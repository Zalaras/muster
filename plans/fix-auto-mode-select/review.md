# Review: fix-auto-mode-select

**Plan**: fix-auto-mode-select
**Cycle**: 2
**Verdict**: approved

All three of cycle 1's Majors are resolved, and nothing regressed. The full Playwright
suite is 221/221 green on my first sweep (no flake this time), all seven authored checks
pass, and the hard-rule checklist is clean. REQ-6 — cycle 1's one blocking gap — now has a
pure, exported decision point with seven Vitest cases, and I proved those cases
change-sensitive by mutation rather than taking the log's word for it. I also re-measured
the whole of INV-2 in a real browser across eight stored values, including the two the
daemon can never emit.

Two Minors remain, both misleading internal comments in the new code. Neither blocks
approval; they should ride along in a later wave or become `TODO.md` lines.

## Delta since cycle 1

| Cycle 1 issue | Commit | Resolved | Evidence |
|---------------|--------|----------|----------|
| Major 1 `[web-impl]` — REQ-6 fallback trapped in an unexported DOM closure | 90a0fc0 | Yes | `permissionModeToCheck` is exported and pure in `web/src/api.ts:58-60`; `setPermissionMode` (`render/launch.ts:104-106`) and `selectedPermissionMode` (`render/launch.ts:115-117`) are both one-liners through it; the `if (!matched)` two-pass branch and both `?? "default"` call-site coercions are gone |
| Major 2 `[web-tests]` — REQ-6 had zero automated coverage | 92cc8ae | Yes | 7 cases in `web/src/api.test.ts:64-87`; mutation-proved change-sensitive (below) |
| Major 3 `[orchestrator]` — missing `SPEC.md` changelog entry | db50360 | Yes | `SPEC.md:1208-1231`; names §4.1/§4.5 explicitly, states that their "auto-accept" means `acceptEdits`, records the 2.1.259 measurements, and states why `bypassPermissions`/`dontAsk` stay unoffered — matching the plan's Implementation Notes clause by clause |
| Minor 1 `[e2e-specs]` — wrong Repairs-section label | dfd1df9 | Yes | `test-specs.md:50-54` now names validate mode and states zero repairs; cycle 1's Note 1 recorded on `TODO.md:501-506` |

The daemon diff is byte-identical to cycle 1 (`git diff 8535df1..HEAD` touches no `.go`
file), so the daemon findings below are re-derived on this branch rather than carried over
on trust — see Reviewer-Verified.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 (four radios, renamed labels, wire values; no "auto-accept" under `web/`) | Yes — `web/index.html:150-153` | Yes — E2E regression pin, the 4-item visibility loop (`launch.spec.ts:99`), `PERMISSION_MODES` tuple pin, W5 grep | pass |
| REQ-2 (`POST /api/sessions` accepts `auto`, seeds `{auto, seed}`; rejects others naming all four) | Yes — `internal/server/sessions.go:101-105` | Yes — `TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault`, `TestHandleCreateSession_UnknownPermissionModeMessageNamesAllFour`, E1 | pass |
| REQ-3 (`auto` emits the flag; `default` emits none) | Yes — `internal/claudecode/launch.go:31-34` | Yes — `TestBuildArgv` auto row (D5) and default row (D6) | pass |
| REQ-4 (per-directory default round-trips `auto`; the three old values still map) | Yes — `web/src/render/launch.ts:159,324` | Yes — D7 assertion, E2, the 4-case E4 loop; re-measured in-browser | pass |
| REQ-5 (seeded `auto` corrected by the first hook carrying the field; lands `working`) | Yes — existing latch, no new code (correct per plan) | Yes — `machine_test.go` REQ-5/D8 subtest, the 36-case INV-1 table, E3 | pass |
| REQ-6 (unrecognised / `null` stored mode pre-selects `manual`) — *Should Have* | Yes — `web/src/api.ts:58-60` | Yes — 7 Vitest cases, mutation-proved; DOM wiring measured in-browser | pass |

INV-1 is covered exhaustively (4 seeds × 2 input kinds × 4 hook values, plus 4 nil-hook
cases). INV-2 is now fully covered: the four recognised stored values by the E4 loop and by
my browser probe, the unrecognised/`null`/empty arm by the new unit cases plus the same
browser probe.

## Build & Tests

E2E tests: pass (221/221, `npm run e2e`, first sweep, zero failures)
Daemon tests: pass (all 12 packages `ok`)
Web tests: pass (24 files / 723 tests)
Daemon build: pass
Web build: pass
Lint: pass (0 issues)
Contrast gate: pass (43 pairs × 3 themes, 0 failures)

Unlike cycle 1, my full sweep showed no `terminal.spec.ts` flake — 221 passed on the first
run. The flake is still real and still recorded on `TODO.md`; it simply did not fire here.

## Acceptance Checks

Run verbatim via `.claude/skills/orchestrate/scripts/gates.sh fix-auto-mode-select --checks-only`.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `make lint` | pass |
| D9 | `! rg -n -e "--permission-mode" cmd/ internal/ test/ --glob '!internal/claudecode/**'` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W5 | `! rg -n -e "auto-accept" web/ --glob '!web/node_modules/**'` | pass |
| E6 | `make e2e` | pass |

Summary line: `7 lines, 0 failed`.

## Reviewer-Verified Criteria

Every daemon criterion below was re-proved change-sensitive **on this branch** by mutating
the implementation, running the tests, and restoring the file — stronger evidence than
cycle 1's worktree copy, and necessary because a carried-forward claim is not a measurement.
`git status --short` was empty before and after each mutation.

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D3 | launch with `auto` returns `{auto, seed}` | pass | dropped `"auto"` from `sessions.go`'s validation switch: `Expected nil, but got: &server.launchError{status:400, ... "permissionMode must be one of default, plan, acceptEdits"}` |
| D4 | 400 message names all four | pass | same mutation: `expected: "…acceptEdits, auto"` / `actual: "…acceptEdits"` |
| D5 | `BuildArgv("auto")` emits the flag | pass | dropped `"auto"` from `BuildArgv`'s switch: `expected: []string{"claude","--model","sonnet","--permission-mode","auto"}` / `actual: []string{"claude","--model","sonnet"}` |
| D6 | `BuildArgv("default")` emits no flag | pass | `launch_test.go:18-22` asserts the exact argv `{"claude","--model","sonnet"}`, so an added flag fails on equality |
| D7 | repos default records `auto` | pass | same mutation as D3; the launch 400s, so `TestLauncher_AutoPermissionModeSeedsLatchAndRepoDefault` fails before reaching the repo assertion |
| D8 | seeded `auto` + `UserPromptSubmit{default}` → `{default, hook}` and `working` | pass, with the same honest caveat as cycle 1 | the subtest pins pre-existing latch behaviour once `PermissionAuto` exists, exactly as the plan frames REQ-5. Not a defect |
| D9 | `--permission-mode` in no Go package but `internal/claudecode` | pass | gate check, exit 0 |
| W3 | exactly four radios named `manual`, `accept edits`, `plan`, `auto` in DOM order | pass | browser accessibility snapshot, names verbatim; boxes left-to-right at x=342/401/498/544 |
| W4 | values `default`, `acceptEdits`, `plan`, `auto` respectively | pass | read off the live DOM in that order |
| W6 | `manual` checked with no recents | pass | stubbed `GET /api/repos` → `[]`: exactly one radio checked, value `default` |
| W7 | no `any` in new web code | pass | `git diff main...HEAD -- web/src web/e2e \| grep '^+' \| grep -w any` → no hits |
| REQ-6 unit cases | the 7 new cases fail without the fallback | pass | replaced the function body with `return (stored ?? "default") as PermissionMode`: `2 failed \| 105 passed`, failing on `"someFutureMode"` and `""` |
| E1–E5 | each has a spec | pass | E1+E2 one test, E3 one test, E4 a 4-case loop (`permission-mode.spec.ts`), E5 the four renamed locators plus the widened visibility loop in `launch.spec.ts` |
| — | `.seg-track` fits four labels on one line at dialog width | pass | measured: track 249.4px in a 720px dialog, `scrollWidth == clientWidth == 247` (no overflow), all four labels at y=625 height 22, and no horizontal document scroll |

**Repairs table verification.** `test-specs.md`'s Repairs section now correctly reports
validate mode with zero repairs, and the claim holds: no `test.skip`, `test.fixme`,
`t.Skip` or `.only` appears in any changed test file, and every removed E2E assertion is a
renamed replacement of the same strength (`auto-accept`→`accept edits` twice,
`default`→`manual` twice), each still `toBeChecked()`. No assertion was weakened to a
container-level `toBeVisible()`. No fixture payload drifted from the measured captures:
both widened unions add `"auto"` to a plain string field that `spikes/canary-fields.md`
records as carrying exactly that value on 2.1.259. The new `api.test.ts` block is not
self-referential despite iterating `PERMISSION_MODES` — a separate case pins that tuple to
the literal `["default","acceptEdits","plan","auto"]`.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code-format knowledge outside `internal/claudecode/` | pass — D9 grep clean; the only `permission_mode` mentions elsewhere are pre-existing DB column names and test prose |
| 2 | No terminal-output state parsing | pass — nothing in the diff reads pane text |
| 3 | No blocking hook handler / >2 s timeouts | pass — no ingest or hook-registration code touched |
| 4 | tmux always on a private socket; no `resize-pane` | pass — the one new tmux-using test builds its own socket via `newTestTmuxClient` (`sessions_test.go:226-236`, `tmux -S <tempdir>/tmux.sock`); `resize-pane` appears nowhere in the tree |
| 5 | No payload logging | pass — the only logger additions are `zerolog.Nop()` in a test |
| 6 | No empty-gauge dishonesty | pass — the dialog is a form; no gauge added |
| 7 | Session identity on the tmux target | pass — untouched |
| 8 | No settings.json trespass / `CLAUDE_CONFIG_DIR` | pass — no hits in the diff |
| 9 | No real `claude` outside canary/probes | pass — the launcher test uses `newStubClaudeBin(t)` |

## Design System Compliance

The plan adds no CSS, no colour and no new surface: three label texts changed and a fourth
radio joined the existing `.seg-track`.

- **Tokens**: no colour literal, font stack or spacing value added anywhere under `web/`.
  `make contrast` passes on all three themes (43 pairs each, 0 failures).
- **No web fonts**: no CDN link, `@import` or vendored binary added.
- **State colour is meaning**: no state colour used. Launch remains the surface's single
  filled amber primary action, pre-existing.
- **Tabular numerics**: no time-varying value added.
- **`[hidden]` companions**: no new `hidden` toggling. `setPermissionMode` only writes
  `.checked`. The delta actually removes a transient — the old two-pass
  uncheck-then-recheck is gone, so the group never passes through a zero-checked frame.
- **Honesty rules (§6)**: the dialog still makes no claim about whether `auto` will take
  effect, which is right — Muster cannot know Claude Code's model gate. `docs/protocol.md`
  §7.2 records the correction path, and the `SPEC.md` entry records the measurement.
- **Terminal rules (§7)**: untouched.

## Documentation

Checked the user-facing docs against the criteria I verified, since a doc that contradicts
a verified criterion is a defect in the deliverable:

- `docs/protocol.md` §3.1/§3.2/§5.3/§7.2 and its changelog match the plan's Protocol
  Contract, including the exact 400 message string I proved by mutation.
- `docs/design/ux-flows.md` §1.2's mockup line and new "Start in" bullet match the shipped
  markup, including that `manual` is the wire's `default`.
- `SPEC.md`'s new entry names §4.1/§4.5 and defines their "auto-accept" as `acceptEdits`.
  Their prose is deliberately left as-is per the plan's Implementation Notes, and the entry
  is what disambiguates it. No user-facing doc asserts anything false about this plan.
- `README.md` says nothing about permission modes, so there was nothing to update.

## Manual Verification

Drove the dashboard in a real browser (Playwright against a Vite dev server on port 5211),
stubbing `GET /api/repos` and `GET /api/browse` in the page so the client sees stored
values the daemon can never emit.

**INV-2 across eight stored values.** In every case exactly one radio was checked — never
zero, which is the failure mode cycle 1 measured on `main`:

| stored `lastPermissionMode` | radio checked | value sent |
|---|---|---|
| `"default"` | manual | `default` |
| `"acceptEdits"` | accept edits | `acceptEdits` |
| `"plan"` | plan | `plan` |
| `"auto"` | auto | `auto` |
| `"someFutureMode"` | manual | `default` |
| `"bypassPermissions"` | manual | `default` |
| `""` | manual | `default` |
| `null` | manual | `default` |

An early probe of mine returned `manual` for all eight, which would have looked like a
regression. It was my harness: I wrapped the repos payload in `{repos: […]}` when the
endpoint returns a bare array, so the decoder rejected it and the dialog fell back to the
browse root. Corrected, the four recognised values each pre-select their own radio. Noting
it because the two readings are indistinguishable without checking the error element.

Also confirmed by hand on this branch: the group is still `role=radiogroup` with
`aria-label="Start in"` and a matching `<legend>`; the four accessible names are `manual`,
`accept edits`, `plan`, `auto`, verbatim and in DOM order, so `getByRole("radio", {name})`
resolves; with no recents exactly one radio is checked and it is `default`; and the four
labels share one line (single distinct y of 625) with no track overflow and no horizontal
document scroll.

Not verified in the browser: a real `auto` launch reaching a live `claude` process. That is
deliberate — it would burn Damian's subscription, and it is model-gated besides. The live
E2E suite covers the launch end-to-end against the stub (E1/E2/E3 green in my sweep).

## Issues

### Critical

None.

### Major

None.

### Minor

1. **[web-impl]** Two comments on the new REQ-6 code describe a world the fix removed —
   `web/src/api.ts:52-57` and `web/src/render/launch.ts:99-103`. `api.ts` says
   "`setPermissionMode` is the only caller", but `selectedPermissionMode`
   (`render/launch.ts:116`) is a second caller, and that shared use is the point of the
   extraction — the comment talks a maintainer out of the invariant the code actually holds.
   `launch.ts` says the fallback handles "`null` coerced to the empty string by callers",
   but the same fix dropped both `?? "default"` coercions and widened the parameter to
   `string | null`, so no caller coerces anything now; `permissionModeToCheck` does it
   internally. Reword both to name both callers and to say the function takes `null`
   directly.

### Notes

1. **[note]** REQ-6's DOM wiring — that `setPermissionMode` actually feeds
   `permissionModeToCheck`'s result to `checkRadio` — has no automated test for the
   unrecognised/`null` arm; it rests on the pure-function unit cases plus my browser
   measurement above. This is by construction, not an oversight: `POST /api/sessions`
   validates the enum and `repos.last_permission_mode` is written only from that validated
   field, so no honest E2E path can put an unrecognised value in front of the browser
   without teaching the read-only `helpers/db.ts` to write. Both e2e-specs and web-tests
   reached that conclusion independently, and it is correct. Worth remembering if the API
   ever grows a path that stores an unvalidated mode.
2. **[note]** Cycle 1's Note 2 still stands: the plan suggested `exact: true` on the `auto`
   radio locator to survive a future `auto…`-prefixed label, and it was not applied. No
   ambiguity exists today — I read the four accessible names off the live DOM and none
   contains another as a substring, and Playwright's strict mode would throw if one did.
   No change requested.
3. **[note]** `web-tests.md`'s original REQ-6 section still asserts that E4 covers the
   `null`/unrecognised case, which is false; the appended Fix Attempt 1 section corrects the
   record explicitly and owns the miss. That is the right handling of a log — history
   annotated, not silently rewritten — and it is why I am recording it as a note rather than
   asking for an edit. A reader who stops at the first section would be misled, so the
   correction's placement matters.
4. **[note]** The `terminal.spec.ts` flake cycle 1 measured did not fire in my sweep
   (221/221 first try). It is recorded on `TODO.md`'s test-strategy entry with three measured
   instances. Absence here is not evidence it is fixed.
5. **[note]** `PERMISSION_MODES` is ordered `default, acceptEdits, plan, auto` (dialog
   order) while the 400 message names them `default, plan, acceptEdits, auto` (the plan's
   contract text). Both are as specified and both are pinned by tests; the mismatch is
   intentional and only reads oddly side by side.
