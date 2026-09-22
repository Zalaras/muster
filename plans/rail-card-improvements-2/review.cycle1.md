# Review: Rail Card Improvements 2

**Plan**: rail-card-improvements-2
**Verdict**: needs-changes
**Pack**: `kb: pack 24952 words (budget 8000)` — WARN over budget; sections rules 3167 · features 4969 · diagrams 3807 · decisions 7668 · proposed 1021 · facts 99 · lessons 3571 · runbooks 644

Two issues, neither in shipped behaviour: a stale file-header comment in an E2E helper that
describes the row order this plan reversed, and a doc-comment ID collision in `update.go`.
Everything the plan asked for is implemented, tested, and — verified by hand in a browser —
actually true of the rendered app.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 clamp swap (comfortable 3 lines, expanded uncapped) | Yes — `style.css` base `.activity` + expanded override | Yes — E1, E2 | pass |
| REQ-2 activity line hover `title` | Yes — `render/sessions.ts:139,146` | Yes — E1, W11 | pass |
| REQ-3 gauge track in compact | Yes — compact `.r3 .ctx` rule deleted | Yes — E3, E6 | pass |
| REQ-4 title row precedes state row | Yes — `web/index.html:297` | Yes — E5, W10 | pass |
| REQ-5 margin rhythm keys on position | Yes — margin moved `.r1` → `.r0`, base and compact | Yes — W12 | pass |
| REQ-6 done indicator wider than tall | Yes — 9×5 mainhead, 7×4 tile footer, busy square on both | Yes — E7, E8, INV-3 | pass |
| REQ-7 `POST /api/update/check` synchronous | Yes — `update.go:641` `handleCheckUpdate` | Yes — D1–D7 | pass |
| REQ-8 pref governs automatic checking only | Yes — `!manual && !m.checkEnabled` guard | Yes — D10, D11 | pass |
| REQ-9 `canCheck` on the update object | Yes — `UpdateInfo.CanCheck`, `Current()` + nil-`um` fallback | Yes — D12 | pass |
| REQ-10 `Check now` button | Yes — `#update-check-button` | Yes — W1, W2, W3 | pass |
| REQ-11 age suffix, disabled branch removed | Yes — `availableText` | Yes — W5, W6, W7, E9, E10 | pass |
| REQ-12 failed check renders its reason, readout intact | Yes — `statusText(update, checkError)` | Yes — W8, E11 | pass |
| REQ-13 button disabled for its own request | Yes — `checkState.inFlight` guard + `checkEnabled` | Yes — W4 | pass |
| DIAG | `kb:diagram/daemon-components`, `kb:diagram/web-components` | — | pass |

`DIAG`: both diagrams are package/directory-level. This plan adds no module, no package and
no import edge the diagrams do not already draw (`render/` → `sessions/` at
`web-components.md:82`; `protocol.ts` documented as imported by every layer). The plan's
"No diagram" note is correct.

## Build & Tests

E2E tests: pass (`make e2e`, full regression sweep over every spec)
Daemon tests: pass (`make test`)
Web tests: pass (`make web-test`, 1789)
Daemon build: pass
Web build: pass
Lint: pass (`make lint`, `make web-lint`, `make e2e-lint`)

## Acceptance Checks

One `gates.sh` invocation, 21 lines, 0 failed; logs in `/tmp/review-gates`.

| ID | Command | Result |
|----|---------|--------|
| — | `go build ./...` | pass |
| — | `make test` | pass |
| — | `make lint` | pass |
| — | `make web-build` | pass |
| — | `make web-test` | pass |
| — | `make web-lint` | pass |
| — | `make contrast` | pass |
| — | `make check-versions` | pass |
| — | `! rg -n 'test\.(skip\|fixme\|only)\(' web/e2e` | pass |
| — | `make check-kb` | pass |
| — | `dead-refs.py --all` | pass |
| — | `make e2e-lint` | pass |
| — | `make e2e` | pass |
| D20 | `make test` | pass (deduped — same command as a baseline gate, proven against this tree) |
| D21 | `make lint` | pass (deduped) |
| W7 | `! rg -n "checking disabled" web/src web/e2e` | pass |
| W20 | `make web-build` | pass (deduped) |
| W21 | `make web-test` | pass (deduped) |
| W22 | `make web-lint` | pass (deduped) |
| W23 | `make contrast` | pass (deduped) |
| E20 | `make e2e` | pass (deduped) |
| DOC | doc upkeep + Doc Delta vs what shipped | **FAIL** — `TODO.md`'s #48/#49/#50/#51 entries are still unticked and not moved to `docs/history/todo-done.md`; and the Doc Delta omits `docs/protocol.md`'s `railDensity` prose, which REQ-1/REQ-3 falsify (Major 2, Major 3) |

`docs/design/design-system.md` § 5 "Rail card" *was* corrected (row order and the density
ramp, citing the new ADR) — that half of the Doc-Upkeep Backstop landed. All three
`proposed` ADRs exist with `refs: [plan:rail-card-improvements-2, …]` and the two
`supersedes` links the plan specified. No `deviation:` or `doc-delta:` line appears in any
implementation log, so there is no unrecorded decision to chase.

Every assertion **in** the Doc Delta is supported by the code: the rail spec's three
"becomes true" lines, the update spec's two, the settings spec's one, and the protocol's
`kb:anchor/update.check` + `canCheck`. Surfaces correctly takes no change — the shipped
glyph now matches the sentence "a tick once work finishes" rather than the reverse.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | no `any` in new web code | pass | grepped `: any`, `<any>`, `as any` across all seven changed `web/src` files and `web/index.html` — no matches |
| W10 | `#session-card-template` places `.r1` before `.r0` | pass | `web/index.html:297-305`; confirmed rendered as `r1 \| r0 \| r2 \| r3 \| activity you \| activity claude \| note \| acts-row` in all three densities |
| W12 | density margins follow row position | pass | browser-measured computed `marginTop`: `.r1` `0px` and `.r0` `4px`/`2px`/`4px` in comfortable/compact/expanded — the leader takes none, the follower takes the step |
| W13 | one check path, error returned not swallowed | pass | `selfupdate.LatestTag` has exactly one caller in `internal/server` (`update.go:269`, inside `checkAvailability`); `checkAvailability`'s only callers are `tick` (`:246`, `manual=false`) and `handleCheckUpdate` (`:647`, `manual=true`) |
| INV-5 | no dashboard path reaches the release host | pass | grep of `web/src` for `github.com`, `releases/latest`, `update-base` returns one hit: a doc comment in `protocol.ts:249`. Every check is `POST /api/update/check` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no `hook_event_name`/`rate_limits`/`permission_mode`/`transcript_path`/`session_id` in any changed file outside `internal/claudecode/` |
| 2 | Terminal-output state parsing | pass — no `capture-pane` in the diff |
| 3 | Blocking hook handler | pass — no hook handler touched |
| 4 | Bare tmux / `resize-pane` | pass — no tmux invocation and no `resize-pane` in the diff |
| 5 | Payload logging | pass — the one new log line is `log.Debug().Err(err)` on a check failure, no payload |
| 6 | Empty-gauge dishonesty | pass — verified by hand: unknown context renders `ctx unknown` with **no** `.ctx` element at all in compact, so REQ-3's restored track can never draw an empty one |
| 7 | Session identity on `session_id` | pass — untouched |
| 8 | Settings trespass | pass — no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | Real `claude` outside canary | pass — no new spec or fixture invokes the real binary |

## Manual Verification

Drove the built dashboard in a real Chromium against a scratch daemon (a throwaway spec,
deleted after the run; tree is clean). Values read by hand, not asserted:

**Rail card**, one session with a long Claude reply and `contextUsedPct: 42`, 1400px:

| | compact | comfortable | expanded |
|---|---|---|---|
| card height | 108.7px | 174.0px | 221.3px |
| row order | `r1 \| r0 \| r2 \| r3 \| activity you \| activity claude \| note \| acts-row` | same | same |
| `.r1` / `.r0` margin-top | 0px / 2px | 0px / 4px | 0px / 4px |
| `.activity` display | `none` | `flow-root` (clamped) | `block` |
| `.activity` client/scroll height | 0 / 0 | **47 / 95** | **95 / 95** |
| `.r3 .ctx` | `display: block`, 52px wide | same | same |

INV-1 holds and is now strictly monotonic (108.7 ≤ 174.0 ≤ 221.3) — the reported inversion
is gone. The clamp is real, not declarative: comfortable renders 47px of a 95px line;
expanded renders all 95. The hover `title` carries the full text in every density,
including compact where the line is hidden. Restoring the compact gauge track cost **no**
height — the compact card measured 108.7px both with the track absent (unknown context)
and present (known context), matching the plan's own measurement. I looked at the rendered
cards: the title leads, the `IDLE` badge and `00:00` timer sit below it, and the
comfortable activity line ends in an ellipsis at line three.

**Done/busy glyph**: computed `9×9` busy / `9×5` done in the Focus mainhead, `7×7` busy /
`7×4` done in the tile footer, done rotated −45°. Rendered both at 8× and looked at them:
the done glyph reads as a genuine tick — short up-left arm, long up-right arm — not the
symmetric chevron it was, and the busy glyph is still a circle.

**Check now**, against a fake release server:

- Before any check: `Available` = `not checked yet`, button enabled, and it is the first
  child of `.update-actions`.
- After publishing v0.2.0 and pressing it: `Available` = `v0.2.0 · checked now`. Observed
  the button `disabled` with `aria-busy="true"` mid-request (the broadcast lands before the
  response resolves), then re-enabled — REQ-13 confirmed in the real app, not only in the
  view model.
- Stopped the release host and pressed again: `Available` stayed `v0.2.0 · checked now`
  (REQ-12's "never erases a known version" holds) and the status line named the reason.

Edge case 21 — I sanity-checked web-tests' call and agree with it. `parseSnapshot` treats
a **missing** `update` key as `update: null` (which does disable the button, the shape the
edge case describes) but rejects the whole snapshot for a **present-but-malformed** one,
which is what a genuinely pre-plan daemon would send. The scenario is unreachable in
practice — the daemon serves the bundle, so a `canCheck`-less daemon never pairs with this
build — and W2, the only criterion the edge case cites, holds either way. web-tests pinned
the actual behaviour with two protocol-level tests rather than leaving it unstated, which
is the right resolution.

The `## Repairs` table's three rows all survive scrutiny: repair 1 reaches a real Tiles
strip card where the pre-fix spec reached none, repair 2 appends REQ-11's required suffix
to exact-match strings while leaving every version/up-to-date assertion intact, and repair
3 adds one field to a whole-object `toEqual`. Nothing was deleted, skipped or weakened, and
no fixture payload drifted from a measured capture.

## Issues

### Critical

None.

### Major

1. **[e2e-specs]** `web/e2e/helpers/railcards.ts:1-4` — the file header still describes the
   row order this plan reversed: *"the restructured card template (REQ-1, a state row
   first, then a wrapping title, repo line, context row and two activity lines)"*. After
   REQ-4 the title is first and the state row second — which this same file's own
   `cardTitleRow` doc comment (`:55`) states correctly, so the header now contradicts the
   helper below it. A false comment about behaviour this plan shipped. Fix: reword the
   header to lead with the title row and cite `rail-card-improvements-2` REQ-4 alongside
   the original plan.

2. **[orchestrator]** `docs/protocol.md:199-201` — the `railDensity` prose asserts
   *"`compact` clamps the title to one line and drops the gauge track and the activity
   line, `expanded` lets the activity line run to three lines"* and cites
   `kb:adr/rail-card-state-row-then-wrapping-title`, which this plan supersedes. REQ-3
   falsifies the gauge-track half and REQ-1 the expanded half. The plan's `## Doc Delta`
   names `docs/protocol.md` only for `kb:anchor/update.check` and `canCheck`, so
   `doc-reconcile` — which promotes the delta — has nothing telling it to touch this
   sentence, and `make gen-kb` regenerates the same false text into
   `docs/features/views/contract.md:51` and `docs/features/settings/contract.md:51`. Plan
   defect: the Doc Delta is incomplete. Amend it with a **rail** "stops being true" line
   for this sentence before `doc-reconcile` runs.

3. **[orchestrator]** Doc upkeep incomplete — `TODO.md` still carries all four entries
   unticked (`:311` #49, `:331` #50, `:352` #48, `:369` #51) and
   `docs/history/todo-done.md` is untouched. The plan's Implementation Notes assign this to
   the Doc-Upkeep Backstop, including moving the "Together — rail card layout, second pass
   (#49, #50)" heading with them.

### Minor

1. **[daemon-impl]** `internal/server/update.go:249-258` — `checkAvailability`'s doc
   comment collides two plans' ID namespaces in one sentence: *"checkAvailability is one
   REQ-1..7 poll attempt, run by both the tick loop (manual false, D13's silent-on-failure
   path) and POST /api/update/check (manual true, REQ-7)"*. `REQ-1..7` is the auto-update
   plan's requirement span (inherited), `REQ-7`/`REQ-8` and `D13` are this plan's, and
   `D16` two lines down is auto-update's again — so `REQ-7` means two different things in
   one sentence and nothing names either plan. Fix: name the plan once where this plan's
   IDs are first used, as `web/src/style.css` and `protocol.ts` already do
   ("plan rail-card-improvements-2"), or drop the inherited `REQ-1..7` span.

### Notes

1. **[note]** The 502 message reaches the Settings status line verbatim, so a dead release
   host renders four wrapped lines of Go's error chain with the URL twice:
   `update check failed: requesting http://127.0.0.1:58263/latest: Head
   "http://127.0.0.1:58263/latest": dial tcp 127.0.0.1:58263: connect: connection refused`.
   This satisfies the contract ("the message names the reason; it never includes the
   response body") and REQ-12, and the plan deliberately left the wording unpinned — the
   `update check failed: ` prefix ahead of `LatestTag`'s own text is daemon-impl's
   documented call, and the contract's example message is illustrative, not byte-for-byte.
   Recording the rendered string so how much of the transport chain to surface can be
   decided later, on evidence, rather than inside a fix wave. No change requested.

2. **[note]** The data race daemon-tests found under `go test -race` in
   `TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput`
   (`shellscroll_test.go:261` vs `terminal.go:472`) is out of this plan's scope, and I
   agree with that call: the branch changes four Go files (`update.go`, `update_test.go`,
   `update_check_test.go`, `state_test.go`) and none of them is `terminal.go`,
   `shellscroll_test.go` or `fakes_test.go`. `make test` does not pass `-race`, so it gates
   nothing here. Worth a `TODO.md` entry on its own merits, which is the developer's call
   to file, not mine.

3. **[note]** `Check now`'s disabled state and the failure reason both appear on the next
   render frame, which `main.ts:95`'s `setInterval(app.render, 1000)` bounds at ~1s. The
   double-fire guard is in `check()` itself (`features/update.ts:85`), not in the
   `disabled` attribute, so REQ-13's substance holds regardless of the repaint lag, and
   this matches how the existing apply/restart buttons already behave. No change requested.

4. **[note]** The `kb pack` for this role is 24952 words against an 8000 budget — a
   three-fold overrun, and daemon-impl's log records the same overrun for its own pack.
   Not this plan's doing and nothing here depends on it.
