# Review: New Session Dialog

**Plan**: new-session-dialog
**Cycle**: 3
**Verdict**: approved

Cycle 2's one Critical and one Minor are both genuinely closed, and I re-measured the
Critical the same way I found it — against a **really killed** daemon, not a routed HTTP
error or a `route.abort()`. The dialog now renders exactly what the plan's States section
specifies with musterd gone: `No recent directories` in the sidebar, an honest **empty**
browse region (never `No subdirectories`), `Launch in —`, `#launch-error` visible with
`Could not reach musterd.`, and **zero** page errors where cycle 2 measured
`pageerror: Failed to fetch`. Numbers below.

The fix is also broader than the finding: `web/src/api.ts` gained a single `safeFetch()`
choke point and all **11** exported functions route through it, not just the three
`browse`/`fetchRepos`/`launchSession` the finding named — which is the right response to a
finding described as a category. `grep` confirms no unguarded `await fetch(` remains in
`web/src` outside `safeFetch` itself.

Both fixes came with real coverage that did not exist before: 13 unit tests table-driven
over every exported function's rejected-fetch path, and three E2E tests (`route.abort()`
on `/api/repos`, `route.abort()` on `/api/browse` mid-navigation with a full INV-3
before/after snapshot, and a node-identity assertion that ArrowLeft at `/` leaves the
*same DOM node* focused). Nothing was deleted, skipped or weakened anywhere — `test-specs.md`'s
Repairs section correctly reports "no spec edits to any pre-existing test", which I verified
by diffing the whole delta.

Full-suite regression sweep is green: **157/157** E2E, **571/571** web unit, daemon
build/test/lint clean, all six authored acceptance checks pass.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 720px fixed-height modal, panes scroll internally | Yes | Yes (`launch.spec.ts` incl. the overflow poll) | pass |
| REQ-2 two panes, no Browse…/Up/Use-this-folder | Yes | Yes (W3) | pass |
| REQ-3 listed directory *is* the selection | Yes | Yes — INV-1 composed, not basename-only | pass |
| REQ-4 child click navigates | Yes | Yes | pass |
| REQ-5 full ancestor breadcrumb, last is current | Yes | Yes | pass |
| REQ-6 ⌘↑ to parent, no-op at root | Yes | Yes | pass |
| REQ-7 recent click navigates + restores model/mode | Yes | Yes | pass |
| REQ-8 open → first recent, else browse root | Yes | Yes | pass |
| REQ-9 Model segmented + `fable` + `other…` | Yes | Yes (+ argv oracle for `--model fable`) | pass |
| REQ-10 Start in segmented | Yes | Yes | pass |
| REQ-11 stacked form order | Yes | Yes | pass |
| REQ-12 non-preset lastModel → `other…` + custom | Yes | Yes | pass |
| REQ-13 browse/repos failure surfaces in `#launch-error` (404/400/**network**) | **Yes — network mode closed this cycle** | Yes — HTTP 404/500 **and** two `route.abort()` specs, plus 13 unit tests | **pass** |
| REQ-14 existing launch behaviour unchanged | Yes | Yes | pass |
| REQ-15 listing keyboard traversal | Yes (continuity + no-op ascend both fixed) | Yes (two round trips, real keys; node-identity at `/`) | pass |
| REQ-16 `loading…` / `No subdirectories` / sidebar empty | Yes | Yes (+ "not left on `loading…`" after a network abort) | pass |
| REQ-17 footer ` · <branch>` | Yes | Yes — asserted against `git rev-parse` | pass |
| REQ-18 recent `title` = full path | Yes | Yes | pass |

## Build & Tests

E2E tests: **pass** (157/157, `npm run e2e`, full-suite regression sweep, 39.5s)
Daemon tests: **pass** (`make test`, all 9 packages ok)
Web tests: **pass** (571/571, 20 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`make web-build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

No daemon code changed in this plan (work type: web); daemon build/test/lint run as
regression only. `web/package.json` / `package-lock.json` are byte-identical since cycle 2 —
no dependency was smuggled in with the fix.

## Acceptance Checks

| ID | Command | Result |
|----|---------|--------|
| W1 | `make web-build` | pass (exit 0) |
| W2 | `make web-test` | pass (571 tests, 20 files) |
| W3 | `! rg -n 'id="(browse-button\|browse-panel\|browse-up\|use-this-folder\|selected-directory)"' web/index.html` | pass (exit 0) |
| W4 | `rg -n 'MODEL_PRESETS = \["sonnet", "opus", "haiku", "fable"\] as const' web/src/render/launch.ts` | pass (`launch.ts:17`) |
| W6 | `! rg -n 'role="radio"' web/index.html web/src` | pass (exit 0) |
| E1 | `make e2e` | pass (157 passed) |

Every check was run as the exact line in the plan's ```checks block, from the repo root.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W5 | no new hex colour in `style.css` for the dialog | pass | `git diff f92ce3f..HEAD -- web/src/style.css web/index.html` is **empty** — this cycle touched no CSS and no markup; cycle 1/2's token-only verdict stands unchanged |
| W7 | no `any` in new/changed web code | pass | `rg '\bany\b'` over `api.ts`, `launch.ts`, `api.test.ts`, `launch.spec.ts` → 3 hits, all the English word "any" in comments. The new unit-test table types its cases as `Array<[string, () => Promise<{ ok: boolean; error?: unknown }>]>` — `unknown`, not `any`. `safeFetch` returns `Promise<Response \| null>` |
| W8 | stale-browse-response guard present and correct | pass | `launch.ts:256-259` unchanged (`const requestId = ++browseRequestId; … if (requestId !== browseRequestId) return false;`). `navigateUp()`'s new `null` return short-circuits *before* `navigate()` is called, so it cannot bump the counter on a no-op — the guard is strictly narrowed, not weakened |
| R1 | rendered dialog matches `mockup.html` at 720px | pass | measured live this cycle: dialog width **720.0**, `.picker` height **300.0**, sidebar 200px; screenshot re-compared against the mockup (stacked Title/Model/Start-in rows, segmented tracks, footer readout) |
| R2 | `--amber` only on Launch, pressed-recent stripe, focus ring | pass | no colour rule touched since cycle 1; screenshot confirms exactly one filled-amber control (Launch) on the surface |
| R3 | all metadata/paths/labels `--mono` at 9.5–11.5px | pass | unchanged from cycle 1 (no CSS delta) |
| R4 | E2E locators derived from Testable UI Elements | pass | all three new tests reuse the existing `helpers/picker.ts` locators (`crumbButton`, `crumbsNav`, `currentCrumb`, `childEntry`, `recentButton`, `launchError`, `composedCrumbPath`, `launchTargetPath`); `helpers/picker.ts` needed no change |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary (`internal/claudecode/`) | pass — no Go changed; `fable` is only a `model` string passed verbatim per §3.1. Delta greps clean for `hook_event_name`/`rate_limits`/`permission_mode` outside the package |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in the delta |
| 3 | Non-blocking hook handler | pass — N/A (no daemon change) |
| 4 | tmux always `-L muster`/private socket; no `resize-pane` | pass — no tmux invocation anywhere in the delta |
| 5 | No payload logging | pass — N/A |
| 6 | No empty-gauge dishonesty | **pass, and improved** — with the daemon killed the browse region is `""` (an honest empty region, never `No subdirectories`), the footer is `Launch in —`, the sidebar states `No recent directories`, and the usage bar reads `unknown`. Cycle 2's failing case (listing stuck on `loading…`, an active claim that data is coming) is gone — measured, see below |
| 7 | Session identity on tmux target | pass — N/A |
| 8 | No `~/.claude/settings.json` trespass, no `CLAUDE_CONFIG_DIR` | pass — delta greps clean |
| 9 | No real `claude` outside canary/probes | pass — E2E drives the `-claude-bin` stub only |

Design-system extras re-checked against the delta: no web fonts; tokens only (no CSS delta
at all); no new `[hidden]` toggle site this cycle (`.hidden =` count in `web/src` is
unchanged); no `innerHTML` anywhere in `web/src`; no new dependency; state colour still
carries meaning only alongside the state word.

## Manual Verification

Wrote one throwaway Playwright driver against a real scratch `musterd` (stub `claude`,
private tmux socket path, scratch `-browse-root`), headless Chromium at 1280×720, then
deleted it — `git status` is clean apart from the pre-existing untracked `masthead.png`,
which I left alone.

**Alive baseline** (dialog open, no recents): dialog width **720**, height **522**,
`.picker` height exactly **300** — unchanged from cycle 2's measurement, so the fix moved
nothing geometric.

**Cycle 2's Critical, re-measured against a really killed daemon** (`daemon.kill()`, then
⌘N) — this is the exact probe that found the bug, and every one of its five failing
observations is now correct:

| Observable | Cycle 2 (broken) | Cycle 3 (measured now) |
|---|---|---|
| `#mru-list` | empty — the *no-data-yet* state, forever | `No recent directories` ✔ |
| `#browse-dirs` | left on `loading…` (browse-refused case) | `""` — honest empty region ✔ |
| `#launch-error` | hidden and empty | visible, `role="alert"`, `Could not reach musterd.` ✔ |
| `#launch-target` | `Launch in —` | `Launch in —` ✔ (unchanged, correct) |
| console | `pageerror: Failed to fetch` | **zero page errors** ✔ |

Also driven by hand with the daemon down: pressing **Launch** replaces the network message
with the submit guard `Choose a directory to launch into.` and the dialog stays open — the
more recent event wins, which is right. The daemon-down banner ("musterd unreachable — hook
output in open panes is Muster's absence, not session failure.") is visible above the dialog
throughout, so daemon-down is surfaced prominently at the same time, per design-system §6.

Screenshot of the down state compared against `plans/new-session-dialog/mockup.html`:
sidebar 200px with its empty state, empty browse pane, stacked `Title` / `Model` /
`Start in` rows, the Model track reading `sonnet · opus · haiku · fable · other…`, `Start in`
reading `default · plan · auto-accept`, and exactly one filled-amber `Launch` in the footer
beside `Cancel`. Matches (R1, R2).

**Minor 1 (no-op ascend)** — the fix is verified by the new E2E test's node-identity
assertion (it tags the focused element with `data-e2e-kept-focus` before the keypress and
asserts *that node* is still focused after, which the pre-fix behaviour could not satisfy).
I read the assertion rather than re-driving it by hand; it is stronger than the manual probe
I used in cycle 2.

Not verified by hand: launching a real `claude` (the harness stub covers it, per the
subscription rule).

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** The `safeFetch` sweep has one out-of-plan behavioural consequence worth
   remembering: `render/dead.ts`'s `loadPane()` maps *any* non-ok `ApiResult` to
   `{ status: "missing" }`, so with musterd unreachable a dead session's surface will now
   say "no snapshot captured" where before the rejected `fetch` propagated and left the
   surface alone. That is not a regression this plan should fix — the mapping is a
   deliberate, documented pre-existing decision (`dead.ts:100-103`: "`no_snapshot` (and,
   defensively, any other error) both read as missing"), a 500 already produced the same
   text before this plan, `dead.ts` is outside this plan's Affected Files, and the
   daemon-down banner renders simultaneously and prominently. **No change requested.** If
   Damian later wants the dead surface to distinguish *unreachable* from *no capture yet*,
   that is its own small item, not this plan's.
2. **[note]** `api.test.ts`'s new describe block says "all 11 exported functions" and lists
   12 cases — because `browse` appears twice (with and without a `path`, two different URL
   shapes). The coverage is correct and complete; only the prose count reads oddly. Not
   worth a change.
3. **[note]** `safeFetch`'s bare `catch` cannot distinguish a genuine network failure from a
   `TypeError` thrown while constructing the request. In practice every `init` in `api.ts` is
   a static literal, so no such throw is reachable today; noting it only so a future caller
   passing a computed `init` knows a construction bug would surface as
   "Could not reach musterd."
4. **[note]** `test-specs.md`'s Repairs section is honest: no pre-existing spec was edited
   this cycle, and all three new tests passed on their first live run. I diffed the entire
   delta to confirm — every change is an *addition*. `rg 'test\.(skip|fixme|only)'` over
   `web/e2e` and `web/src` returns nothing, and no assertion anywhere was replaced by a
   container-level `toBeVisible()`.
5. **[note]** Carried forward, unchanged and still accepted: edge case 2 (first recent's
   directory has vanished → open-time fallback to the browse root) has no automated
   coverage in any cycle. It is implemented and was reasoned through in the plan; it is
   simply awkward to fixture. Worth a TODO line if it ever misbehaves.
6. **[note]** Doc upkeep from cycle 1's Major 6 remains done and accurate (`TODO.md`,
   `docs/protocol.md` §3.1 + §9, `docs/design/ux-flows.md` §1.1–1.2, `docs/design/design-system.md`
   §5, `SPEC.md` §11, `spikes/canary-fields.md`'s `fable` alias with version and method).
   Nothing in this cycle's delta changed the protocol, so no further reconciliation is owed.
