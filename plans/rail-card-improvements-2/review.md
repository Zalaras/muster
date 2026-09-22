# Review: Rail Card Improvements 2

**Plan**: rail-card-improvements-2
**Verdict**: approved
**Pack**: `kb: pack 24952 words (budget 8000)` — WARN over budget; sections rules 3167 · features 4969 · diagrams 3807 · decisions 7668 · proposed 1021 · facts 99 · lessons 3571 · runbooks 644

Cycle 2, a full re-review (cycle 1 carried an agent-tagged Major, so §9's Delta mode does not
apply). Both agent-tagged issues from cycle 1 are fixed and verified. No agent-tagged issue of any
severity remains, so the verdict is `approved`.

One correction to cycle 1 that changes what the orchestrator must do: **cycle 1's Major 3 (the
`TODO.md` ticks) was wrong to imply the tick should already have landed.** The Doc-Upkeep Backstop
says outright — "Never write the verdict before it exists: no 'approved', no 'review cycle N', no
✅ tick until `review.md` says `approved`" (`.claude/skills/orchestrate/SKILL.md:437-438`). Ticking
#48/#49/#50/#51 and moving them under a heading naming the approved review cycle *is* writing the
verdict. Deferring it to Completion step 1, where the skill re-verifies the whole backstop, is the
correct reading and the only one the skill permits. It stays listed below as an `[orchestrator]`
item so the backstop still acts on it; an `[orchestrator]` item has never blocked approval, so it
costs no third cycle.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 clamp swap (comfortable 3 lines, expanded uncapped) | Yes — `style.css` base `.activity` + expanded override | Yes — E1, E2 | pass |
| REQ-2 activity line hover `title` | Yes — `render/sessions.ts:141,148` | Yes — E1, W11 | pass |
| REQ-3 gauge track in compact | Yes — compact `.r3 .ctx` rule deleted | Yes — E3, E6 | pass |
| REQ-4 title row precedes state row | Yes — `web/index.html:297-305` | Yes — E5, W10 | pass |
| REQ-5 margin rhythm keys on position | Yes — margin moved `.r1` → `.r0`, base and compact | Yes — W12 | pass |
| REQ-6 done indicator wider than tall | Yes — 9×5 mainhead, 7×4 tile footer, busy square on both | Yes — E7, E8, INV-3 | pass |
| REQ-7 `POST /api/update/check` synchronous | Yes — `update.go:641` `handleCheckUpdate` | Yes — D1–D8 | pass |
| REQ-8 pref governs automatic checking only | Yes — `update.go:288` `!manual && !m.checkEnabled` | Yes — D10, D11 | pass |
| REQ-9 `canCheck` on the update object | Yes — `UpdateInfo.CanCheck`, `Current():513` + `current():606` nil-`um` fallback | Yes — D12 | pass |
| REQ-10 `Check now` button | Yes — `#update-check-button` | Yes — W1, W2, W3 | pass |
| REQ-11 age suffix, disabled branch removed | Yes — `render/update.ts` `availableText` | Yes — W5, W6, W7, E9, E10 | pass |
| REQ-12 failed check renders its reason, readout intact | Yes — `statusText(update, checkError)` | Yes — W8, E11 | pass |
| REQ-13 button disabled for its own request | Yes — `checkState.inFlight` guard + `checkEnabled` | Yes — W4 | pass |
| DIAG | `kb:diagram/daemon-components`, `kb:diagram/web-components` | — | pass |

`DIAG`: both are directory/package-level. No module, package or import edge is added that the
diagrams do not already draw — `render/update.ts`'s new import of `sessions/format.ts` is
`web-components.md:82`'s existing `Rel(render, sessions, "view-models")`; `api.ts` → `protocol.ts`
is the "imported by every layer" note at `:48`; `update.go` gains only `fmt`. The plan's "No
diagram" note is correct.

## Build & Tests

E2E tests: pass (`make e2e`, full regression sweep over every spec)
Daemon tests: pass (`make test`)
Web tests: pass (`make web-test`, 1789)
Daemon build: pass
Web build: pass
Lint: pass (`make lint`, `make web-lint`, `make e2e-lint`)

## Acceptance Checks

One `gates.sh` invocation from the project root, 21 lines, 0 failed; logs in `/tmp/review-gates`.

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
| DOC | doc upkeep + Doc Delta vs what shipped | pass — with the `TODO.md` tick correctly outstanding until Completion (see below) |

**DOC detail.** Everything the backstop *may* do before an approving verdict has landed:

- `docs/design/design-system.md` § 5 "Rail card" corrected for both the row order and the ramp,
  citing `kb:adr/rail-card-title-leads-and-density-ramp-corrected`. Verified against the shipped
  CSS sentence by sentence — including "The gauge track renders in all three", which my own
  browser measurement confirms.
- All three `proposed` ADRs exist with `refs: [plan:rail-card-improvements-2]` and the two
  `supersedes` links the plan specified (`kb ls --feature rail|update|settings --status proposed`).
- No `deviation:` or `doc-delta:` line appears in any implementation log, so there is no
  unrecorded decision and no unamended delta line to chase.
- **Cycle 1's Major 2 is resolved.** `plans/rail-card-improvements-2/doc-delta.md` now exists and
  carries the missing **rail** "stops being true" line for `docs/protocol.md:199-201`'s
  `railDensity` prose, with the replacement text spelled out. I confirmed rather than assumed that
  this reaches the right reader: `.claude/agents/doc-reconcile.md:23` names `doc-delta.md` as
  doc-reconcile's **input contract**, and `SKILL.md:286-287` is what seeds and amends it. The false
  sentence is still in `docs/protocol.md` — correctly so; that file is doc-reconcile's, not mine
  and not the orchestrator's.
- `docs/protocol.md`'s `update.check` anchor, `canCheck` and the three amended `updateCheck`
  sentences were merged at plan approval by the developer's own planning session (`87d510e`), which
  is what the plan's Protocol Contract header prescribes. I checked the shipped daemon against that
  text: the 404/409 messages match byte for byte, `canCheck` sits between `remedy` and `available`
  in both the Go struct and the TS interface, and `canCheck` is true iff base URL non-empty and
  install ≠ `dev`.

Every assertion in the Doc Delta is supported by code I read. **surfaces** correctly takes no
change — the shipped glyph now matches the existing sentence "a tick once work finishes" rather
than the sentence being bent to the code.

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W9 | no `any` in new web code | pass | `git grep -nE ': any\|<any>\|as any'` across all seven changed `web/src` files plus `web/index.html` — no matches |
| W10 | `#session-card-template` places `.r1` before `.r0` | pass | `web/index.html:297-305`; and measured rendered as `r1 \| r0 \| r2 \| r3 \| activity you \| activity claude \| note \| acts-row` in all three densities |
| W12 | density margins follow row position | pass | browser-measured computed `marginTop`: `.r1` `0px` in every density; `.r0` `2px` compact, `4px` comfortable and expanded — the leader takes none, the follower takes the step |
| W13 | one check path, error returned not swallowed | pass | `selfupdate.LatestTag` has exactly one caller in `internal/server` (`update.go:269`, inside `checkAvailability`); `checkAvailability`'s only callers are `tick` (`:245`, `manual=false`) and `handleCheckUpdate` (`:647`, `manual=true`) |
| INV-5 | no dashboard path reaches the release host | pass | grep of `web/src` for `github.com`, `releases/latest`, `update-base` returns one hit, a doc comment in `protocol.ts`. Every check is `POST /api/update/check` |

## Hard-Rule Checklist

Run over the nine changed non-test files under `internal/`, `web/src` and `web/index.html`.

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — no `hook_event_name`/`rate_limits`/`permission_mode`/`transcript_path`/`session_id` anywhere in the changed files |
| 2 | Terminal-output state parsing | pass — the one `capture-pane` hit is a pre-existing `api.ts` doc comment naming it a display source |
| 3 | Blocking hook handler | pass — no hook handler touched |
| 4 | Bare tmux / `resize-pane` | pass — neither appears in the diff |
| 5 | Payload logging | pass — the one new log line is `log.Debug().Err(err)` on a check failure; no payload |
| 6 | Empty-gauge dishonesty | pass — verified by hand: unknown context renders `ctx unknown` with no `.ctx` element at all, so REQ-3's restored track can never draw an empty one |
| 7 | Session identity on `session_id` | pass — untouched |
| 8 | Settings trespass | pass — no `~/.claude/settings*.json`, no `CLAUDE_CONFIG_DIR` |
| 9 | Real `claude` outside canary | pass — no new spec or fixture invokes the real binary |

Design system: no colour literal outside the three `[data-theme]` blocks (`style.css:34-154`); the
new glyph rules use `var(--fg)`; `make contrast` green. `#update-available`'s new age suffix is
already covered for tabular numerics by `.update-versions dd`'s `font-variant-numeric:
tabular-nums` (`style.css:2657`). The `[hidden]` companion analysis in the CSS comments is correct
as written: base `.activity` is (0,1,0) and loses to `.activity[hidden]` (0,2,0), so it needs no
companion; expanded's (0,2,1) override wins, so its (0,3,1) companion is what keeps a hidden line
hidden — and it is present. One filled amber primary per surface: `Update and restart` only.

## Manual Verification

Drove the built dashboard in a real Chromium against scratch daemons, with three throwaway specs
deleted after the run (`git status --short` clean apart from the orchestrator's own
`orchestration-state.json`). Values read by hand, not asserted.

**Rail card**, one session with a long Claude reply and `contextUsedPct: 42`, 1400px viewport:

| | compact | comfortable | expanded |
|---|---|---|---|
| card height | **108.67px** | **174.00px** | **221.25px** |
| `.card-in` child order | `r1 \| r0 \| r2 \| r3 \| activity you \| activity claude \| note \| acts-row` | same | same |
| `.r1` / `.r0` margin-top | 0px / 2px | 0px / 4px | 0px / 4px |
| `.activity` display | `none` | `flow-root` (clamp active) | `block` |
| `.activity` client / scroll height | 0 / 0 | **47 / 95** | **95 / 95** |
| `.activity` `title` | present | present | present |
| `.r3 .ctx` | `display: block`, 52px | same | same |

INV-1 holds and is strictly monotonic (108.67 ≤ 174.00 ≤ 221.25) — the reported inversion is gone.
The clamp is real rather than declarative: comfortable renders 47px of a 95px line, expanded all
95. The hover `title` carries the full text in every density, including compact where the line is
hidden. I looked at the rendered comfortable card: the title leads, the `IDLE` badge and `00:01`
timer sit beneath it, the gauge track and `42% 84k` render, and the activity line ends in an
ellipsis at line three.

**Done/busy glyph**: computed 9×9 busy / 9×5 done (`margin-top: -1.5px`, `rotate(-45deg)`) in the
Focus mainhead. I screenshotted the segment and upscaled it rather than trusting the numbers — the
done glyph reads as an unambiguous tick, short up-left arm and long up-right arm, not the symmetric
chevron it was.

**Check now**, against a fake release server (`0.1.0` running, `v0.2.0` published mid-test):

- Before any check: `Available` = `not checked yet`, button enabled, and `#update-check-button` is
  confirmed the first element child of `.update-actions`.
- After pressing it: `Available` = `v0.2.0 · checked now`, Settings badge visible. The button read
  `disabled` at the instant the readout updated (the broadcast lands before the fetch resolves),
  then re-enabled with `aria-busy` removed — I polled for both, so REQ-13 is confirmed to
  *complete*, not just to fire.
- Stopped the release host and pressed again: `Available` stayed `v0.2.0 · checked now` — REQ-12's
  "never erases a known version" holds — and the status line named the reason.

The `## Repairs` table's three rows all survive scrutiny, as in cycle 1: repair 1 reaches a real
Tiles strip card where the pre-fix spec reached none, repair 2 appends REQ-11's required suffix to
exact-match strings while leaving every version and up-to-date assertion intact, repair 3 adds one
field to a whole-object `toEqual`. The one deleted web unit test (the `!updateCheck` "checking
disabled" readout) tested behaviour REQ-11 deletes, and the plan named it at line 299. Nothing was
skipped or weakened, and no fixture payload drifted from a measured capture. Cycle 1's wave 3 added
no assertion at all — a comment-only reword — and its `## Repairs` correctly records none.

## Delta

Not a §9 Delta re-review (cycle 1 carried a Major), but for the record, both cycle-1 agent-tagged
issues were verified against the diff:

| Prior issue | Fix commit | Verified how |
|-------------|-----------|--------------|
| cycle 1 Major 1 `[e2e-specs]` — `railcards.ts` header described the pre-REQ-4 row order | `71adf17` | read `web/e2e/helpers/railcards.ts:1-7`: now "a wrapping title first, then a state row … reordered by rail-card-improvements-2 REQ-4, title ahead of state row". Leads with the title, cites this plan, and no longer contradicts `cardTitleRow`'s own comment at `:55`. Comment-only — confirmed by diffing the file's non-comment lines |
| cycle 1 Minor 1 `[daemon-impl]` — `checkAvailability`'s doc comment collided two plans' ID namespaces | `2040cca` | read `internal/server/update.go:248-257`: the inherited `REQ-1..7` span is gone and "plan rail-card-improvements-2" is named once at first use. `REQ-7`/`REQ-8`/`D13` now resolve unambiguously. Confirmed comment-only: `git diff 4481da5..HEAD -- internal/server/update.go` has no non-comment line |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** **The three sibling doc-comment sites daemon-impl flagged (`internal/server/update.go:114`, `:233-234`, `:300`) should be left as they are — that is my ruling, asked for by the orchestrator.** daemon-impl was right to leave them out of the fix wave, and right again to disclose them. They are not the defect cycle 1 named. Cycle 1's Minor was about a *collision inside one sentence*: `REQ-1..7` (auto-update's) sitting beside `REQ-7` (this plan's), so one token meant two things. These three carry only auto-update's own IDs (`REQ-1..7`, `REQ-26`) with nothing of this plan's near them, they are pre-existing text this plan never touched, and they are internally consistent. Naming the owning plan in every such comment repo-wide is a convention question, not this plan's defect, and it is the developer's to file if wanted.

2. **[note]** A residual of the same cycle-1 Minor, deliberately not re-raised: `update.go:253` still says "(D16)" for the discard guard, and `D16` is the **auto-update** plan's ID — this plan's D range stops at D13. Because the rewritten comment now names "plan rail-card-improvements-2" two lines above it, a reader chasing `D16` in that plan finds nothing, where before the fix nothing was scoped at all. The prose around it describes the behaviour correctly and completely, so the ID is a breadcrumb rather than the explanation, and `dead-refs` does not and cannot check plan IDs. Recording it rather than spending a third cycle and a fix wave on one parenthetical. No change requested.

3. **[note]** I have now *seen* the 502 message land in the Settings status line, and it is worse-looking than cycle 1's quoted string suggests: it wraps to **four lines**, names the URL twice, and pushes the action row down. Screenshotted. Verbatim: `update check failed: requesting http://127.0.0.1:57907/latest: Head "http://127.0.0.1:57907/latest": dial tcp 127.0.0.1:57907: connect: connection refused`. This still satisfies the contract ("the message names the reason; it never includes the response body") and REQ-12, and the plan left the wording unpinned; the `update check failed: ` prefix ahead of `LatestTag`'s own text is daemon-impl's documented call and the contract's example is illustrative. Recording the rendered result so how much of Go's transport chain to surface can be decided later on evidence, rather than inside a fix wave. No change requested.

4. **[note]** `statusText` gives a failed manual check priority over an in-flight apply phase, so a check that fails during a download replaces "Downloading v…" until the next check starts. The plan specifies no precedence between them; web-impl documented the choice in the function's doc comment and web-tests pinned it with two tests. Edge case 15 permits the overlap but says nothing about which line wins. Reachable only when a check fails while an apply is in flight — and an unreachable release host generally breaks both. No change requested.

5. **[note]** `Check now`'s disabled state and the failure reason both appear on the next render frame, bounded at ~1s by `main.ts`'s `setInterval(app.render, 1000)`. The double-fire guard lives in `check()` itself (`features/update.ts:85`), not in the `disabled` attribute, so REQ-13's substance holds regardless of repaint lag — and this matches how the existing apply/restart buttons already behave. Confirmed by hand that the button does re-enable and drops `aria-busy`.

6. **[note]** The data race daemon-tests found under `go test -race` in
   `TestHandleShellTerminal_ScrollThatDoesNotEnterCopyModeNeverCancelsOnNextInput`
   (`shellscroll_test.go:261` vs `terminal.go:472`) is out of this plan's scope, and I agree with
   that call — the branch touches four Go files and none of them is `terminal.go`,
   `shellscroll_test.go` or `fakes_test.go`. `make test` does not pass `-race`, so it gates nothing
   here. Worth a backlog entry on its own merits, which is the developer's call to file.

7. **[note]** The `kb pack` for this role is 24952 words against an 8000 budget — a three-fold
   overrun, and daemon-impl's log records the same for its own pack. Not this plan's doing and
   nothing here depends on it.

### Outstanding for the orchestrator (does not block approval)

1. **[orchestrator]** `TODO.md`'s #48/#49/#50/#51 entries are still unticked and not moved to
   `docs/history/todo-done.md` (with the "Together — rail card layout, second pass (#49, #50)"
   heading travelling with them). **This is correct so far, not a defect** — the Doc-Upkeep
   Backstop forbids the tick until `review.md` says `approved`, which it now does. Do it at
   Completion step 1, along with recording #48/#49/#50/#51 under step 5.
