# Review: M3 — Gauges

**Plan**: m3-gauges
**Verdict**: approved

**Review cycle 2.** Cycle 1's two Criticals (both `[e2e-specs]` — pre-existing specs
contradicting this plan's own approved protocol delta) are fixed, and I confirmed both
repairs strengthened rather than weakened their assertions. Both Majors (`[web-impl]`)
are genuinely fixed in the shipped DOM, not just in the diff: I re-drove the app in a
real browser and read the live markup and element geometry. All 9 authored acceptance
checks pass, the full 71-test E2E suite is green via `make e2e`, the hard-rule sweep is
clean, and every Reviewer-Verified criterion holds. What remains is R6 doc upkeep
(TODO ticks and two follow-up records) plus three new/carried Minors — none blocking.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 `InterpretStatus` → neutral `StatusUpdate` | Yes — `internal/claudecode/status.go` | Yes — `status_test.go` (8 tests) | pass |
| REQ-2 context adopted only on non-null pct | Yes — `status.go:94` | Yes — D7, E2, live check | pass |
| REQ-3 sample only when rate-limits key present; epoch→`time.Time` in adapter | Yes — `status.go:105`, `time.Unix(...).UTC()` | Yes — D8, `ResetsAtConvertsEpochToUTC` | pass |
| REQ-4 `Manager.ApplyStatus`, broadcast only on change | Yes — `manager.go:264`, `session/status.go` | Yes — 5 manager tests + 6 `applyStatusUpdate` tables, E7 | pass |
| REQ-5 `internal/usage` `Sample`/`Aggregator`, value-level dedup | Yes — `usage.go`, `aggregator.go` | Yes — 12 aggregator tests, D9, E6 | pass |
| REQ-6 only routed posts feed `ApplyStatus`/aggregator | Yes — `ingest.go:127` returns before `processStatus` | Yes — `TestIngestStatusLine_UnroutedPostFeedsNothing` | pass |
| REQ-7 no hydration at boot | Yes — `snapshotLocked` returns zero `Snapshot` | Yes — D10, E11, live restart check (cycle 1) | pass |
| REQ-8 migration `0003_gauges.sql` | Yes | Yes — migrate/session/usage store tests | pass |
| REQ-9 `/clear` resets context | Yes — `machine.go` clear-rebind branch | Yes — D12 (3 subtests), E10 | pass |
| REQ-10 `received_at` RFC3339Nano | Yes — `store.go` `InsertEvent` | Yes — D13 + live DB read (cycle 1) | pass |
| REQ-11 masthead gauge bars, `warn` at ≥60, "unknown" + no track | Yes — `renderBucket` + `renderUsageTrack` | Yes — E5, E12, W7, live check | pass |
| REQ-12 masthead model readout | Yes — `renderUsageModel`, `#usage-model` | Yes — E5, E7, 4 masthead tests | pass |
| REQ-13 card + tile context rows, `hot` at ≥60 | Yes — `sessions/context.ts` (one derivation) → `render/context.ts` (two renderers) | Yes — E3, E4, E12, W8, W9 | pass — Major 1's duplicate derivation is gone |
| REQ-14 compact reset formatting, client-local | Yes — `formatResets` | Yes — W6 (4 cases), live "resets Thu" checked against the epoch by hand | pass |
| REQ-15 `claudecodetest` + TS status builders | Yes — `EnvelopedStatusLineFull` (`UsedPct *float64` after Minor 6), `envelopedStatusLineFull` | Yes — used throughout both suites, no hand-written wire bodies left | pass |
| REQ-16 model display name persists | Yes — `model_display_name` column + `rowToSession` fallback | Yes — 2 manager tests, E11 | pass |
| REQ-17 `/api/state` reflects everything | Yes — `toWireUsage(s.usage.Current())` | Yes — E2E oracles + live `curl`/browser read | pass |

## Build & Tests

E2E tests: **pass — 71/71** (full suite, `make e2e`, 23.1s; also confirmed via a bare
`npm run e2e` run at 71/71 before it)
Daemon tests: pass (all packages, `internal/usage` included, `go clean -testcache` first)
Web tests: pass (322)
Daemon build: pass
Web build: pass
Lint: pass (`golangci-lint run` → 0 issues)

## Acceptance Checks

Every line run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `go build ./...` | pass |
| D3 | `make lint` | pass |
| D4 | `! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| D6 | `! rg -n '"rate_limits"\|"used_percentage"\|"context_window"\|"session_name"\|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'` | pass |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| W3 | `! rg -n "rate_limits\|used_percentage\|context_window\|total_input_tokens\|session_name" web/src` | pass |
| E1 | `make e2e` | pass — 71 passed (23.1s) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| W4 | no `any` in new web code | pass | swept `: any` / `as any` / `<any>` / `any[]` across all 12 changed+new `web/src` files and all 4 new/changed `web/e2e` files — zero matches |
| R1 | INV-3 honesty: no 0%-filled track for unknown data, all three surfaces | pass | driven by hand in Chromium against a scratch daemon with two live sessions. Fresh load: `#usage-5h` `innerHTML` was exactly `<span class="lbl">5h</span><span class="num">unknown</span>` with `querySelectorAll("i").length === 0` (same for 7d), `#usage-model` `hidden === true`; both cards' `.r3` was `class="r3 unk"`, text `ctx unknown`, 0 fills. After data, the bystander card and its tile stayed `unk` / `ctx unknown` / 0 fills. Known→unknown direction was verified in cycle 1's restart check and is structurally guaranteed by `renderBucket`'s `replaceChildren` every pass |
| R2 | status-line knowledge stays inside `internal/claudecode` beyond D6's grep | pass | no code outside the adapter branches on status-line structure. The dedup is a value-equality policy (`unchanged(prev, next)`, `aggregator.go:106`), not a "pairs arrive twice" assumption; `ingest.go:130` and `aggregator.go:41` mention the cadence only in explanatory comments with no code depending on it |
| R3 | `ApplyStatus` change-detection covers every surfaced field | pass | `session/status.go:20-41` compares title, `Model.ID`, `Model.DisplayName`, and the whole `Context` struct (`*sess.Context != next`, a value compare over all three numerics). All four surfaced fields covered |
| R4 | `usage` broadcast + `usage_sample` write on the ingest worker goroutine, in seq order | pass | one worker goroutine over `q.ch`; `process` → `processStatus` (`ingest.go:150`) calls `ApplyStatus` then `Record` sequentially, no goroutine/channel/timer introduced. `OnChange` (`server.go:124`) fires on that same goroutine |
| R5 | reset formatting uses the client's local timezone | pass | `formatResets` uses local getters against a UTC wire value. Checked one case by hand end-to-end: the fixture's epoch `4070908800` is `Thursday 2099-01-01 02:00 SAST`, a different local day from today, and the browser rendered `· resets Thu` — the weekday branch, on the local calendar day |
| R6 | design-system §6 threshold note + SPEC §11 changelog + TODO ticks | **partial** | design-system §5 carries the "Gauge thresholds" ≥60% note; SPEC §11 has the 2026-08-23 m3-gauges entry and §9 Q6 is resolved; `docs/protocol.md` §5.3/§5.4/§7.3/§9 all merged; TODO.md's §9.6 open question is ticked. **Still outstanding**: TODO.md's five M3 work items remain unticked, and the two rulings that were to be recorded there are not — see Minors 1–3 |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary — no Claude-Code format knowledge outside `internal/claudecode` | pass — D4 and D6 both clean with test files in scope; `status.go` is the only reader of the status-line keys, and every downstream type (`StatusUpdate`, `usage.Sample`, `session.Context`) is neutral |
| 2 | No terminal-output state parsing | pass — no `capture-pane` anywhere in `internal/`, `cmd/`, or `web/src`; M3 adds no pane reads |
| 3 | Non-blocking hook handler, 1–2 s timeouts | pass — `processStatus` runs on the async worker after the 200; the registered hook timeout is unchanged at 2 s |
| 4 | tmux always on a dedicated socket; `pty.Setsize` + `resize-window`, never `resize-pane` | pass — no `resize-pane` anywhere; the single `exec.CommandContext(ctx, "tmux", …)` site (`internal/tmux/tmux.go:211`) always prepends `c.socketFlag()`. M3 changes no tmux code |
| 5 | Never log hook/status payloads | pass — `processStatus`'s two log lines carry only an error; the aggregator's new Minor-4 lines are static messages (`"usage sample unchanged, skipping persist and broadcast"`, `"persisting usage sample failed"` + `.Err`) with no field values; `internal/session/status.go` logs nothing |
| 6 | No empty-gauge dishonesty | pass — verified by hand in the browser on all three surfaces (see R1) |
| 7 | Session identity on the tmux target, never `session_id` | pass — `ApplyStatus` keys on `musterSessionID int64`; routing still goes through `resolveSessionID`, untouched |
| 8 | No settings trespass | pass — no `~/.claude/settings.json`, no `CLAUDE_CONFIG_DIR`; the only settings writes are project-scoped `<dir>/.claude/settings.local.json`. `os.UserHomeDir` appears only for the data dir and the browse-root default |
| 9 | No real `claude` outside canary/probes | pass — the E2E harness still spawns only its stub shell script; every `claude-haiku-4-5-20251001` occurrence is a fixture string, never an invocation |

### Design-system compliance (§6.1 honesty, §5 anatomy, §7 terminal)

- **Tokens** — every new colour resolves to a `:root` custom property (`--line`, `--teal`,
  `--amber`, `--muted`, `--dim`, `--paper`); no hex literal in any new rule.
- **No web fonts** — no CDN link, `@import`, or font binary added.
- **State colour is meaning** — the amber `warn`/`hot` fill is the reference render's own
  choice (`mockups/a-instrument.html:45` `.bar.warn i{background:var(--amber)}` and
  `:107` `.ctx.hot i{background:var(--amber)}`), and the plan's new design-system §5
  "Gauge thresholds" note records the ≥60% rule. Colour is never the sole carrier — the
  percentage and reset text sit beside it. No new amber primary action.
- **Tabular numerics** — confirmed from computed style in the browser, not just the CSS:
  `#usage-5h .num` and `.bar` both report `font-variant-numeric: tabular-nums` (inherited
  from `.usage-readout`); `.r3`/`.ctxinfo`/`.tok` set it explicitly.
- **`[hidden]` companion** — the one new `hidden`-toggled element (`#usage-model`, class
  `model`) has `.model[hidden] { display: none; }` at `style.css:209`, and I confirmed
  live that it is invisible on a fresh load.
- **Terminal rules** — untouched by M3: `scrollback: 0` still set (`terminal/pane.ts:80`),
  no `resize-pane`, no second live client, no pane-content styling.

## Manual Verification

Drove the real built dashboard in Chromium against a per-run scratch `musterd` (own port,
own data dir, own tmux socket path, stub `claude`) with **two** live sessions, reading the
live DOM, computed styles, element geometry and `/api/state` rather than trusting the
specs. Cycle 2's focus was the two Majors, since both changed shipped markup.

- **Major 2 (masthead element order) — fixed, and fixed visually, not just in the DOM.**
  After a full status post, `#usage-5h`'s children were
  `["lbl", "bar warn", "num", "resets"]` and its `innerHTML` was
  `<span class="lbl">5h</span><span class="bar warn"><i style="width: 61%;"></i></span><span class="num">61%</span><span class="resets">· resets Thu</span>`
  — the reference order from `mockups/a-instrument.html:199`. Because DOM order alone
  can be defeated by CSS, I also read bounding boxes: `lbl` at x=352, `bar` at x=371,
  `num` at x=473, `resets` at x=497 — the bar genuinely *reads* before the number. The 7d
  bucket rendered the same shape with a plain (non-`warn`) bar. Screenshot confirms it
  reads as one instrument row.
- **Major 1 (one derivation) — fixed.** `CardViewModel.contextText` and `contextText()`
  are gone from `web/src/sessions/card.ts`; `sessions/context.ts`'s
  `buildContextRowViewModel` is now the only derivation and `render/context.ts` the only
  renderer, shared by `render/sessions.ts` and `render/tiles.ts`. Live, the card `.r3` and
  the tile `.ctxinfo` produced identical structure (`<span class="ctx hot"><i style="width: 61%"></i></span><span>61%</span><span class="tok">123k</span>`),
  so the two surfaces can no longer disagree.
- **Minor 1 (`.bar` overflow) — fixed.** `getComputedStyle(#usage-5h .bar).overflow`
  reported `hidden`.
- **Numbers checked by hand for one realistic case.** Posted `used_percentage: 61.4`,
  `total_input_tokens: 122800`, `five_hour 61.2`, `seven_day 23`. Rendered: card `61%`
  with `class="ctx hot"` (raw 61.4 ≥ 60, not the rounded value), fill `width: 61%`, tokens
  `123k` (`round(122.8)`), masthead `5h 61%` with `bar warn` and `7d 23%` with a plain
  `bar`, model readout `Haiku 4.5`. `/api/state` returned
  `fiveHour.usedPct 61.2`, `sevenDay.usedPct 23`, `model {claude-haiku-4-5-20251001, Haiku 4.5}`,
  `sampledAt 2026-08-23T18:46:26Z`, `source "subscription"` — the §5.4 shape.
- **INV-4 (bystanders), two sessions live.** The post routed to session 1 left session 2's
  card at `r3 unk` / `ctx unknown` / 0 fills, its title at the launch value, and its wire
  `context` all-null; its tile stayed `ctxinfo unk`.
- **Both hosting views.** In Tiles (⌘\\), the focused session's `.ctxinfo` rendered
  `61% 123k ⟳1` (the `⟳1` from a synthesized `PreCompact`, proving the hook-sourced
  counter still composes with status-sourced context), the bystander's stayed
  `ctx unknown`.
- **Fresh state.** Before any post: masthead both buckets `unknown` with 0 fills, model
  readout `hidden`, both cards `ctx unknown` with 0 fills.
- **Console** — zero errors during the run.

Scratch daemon, its tmux server, and the temp data dir were torn down afterwards; I
confirmed no `tmux -L muster` server exists. The temporary reviewer spec I used to drive
the browser was deleted, and `npx playwright test --list` is back to `Total: 71 tests in
9 files` with no collection errors.

### Repairs-table verification

`test-specs.md`'s `## Repairs (fix wave 3)` claims two pure expectation updates. I read
both diffs and confirm the claim in the last column:

1. `sessions.spec.ts` — the assertion changed from `title === "walk-status-line"` to
   `title === "a status-line-derived title"`, i.e. it now asserts the *positive* REQ-4
   behaviour instead of the M1 non-mutation rule. This is a **stronger** assertion, not a
   weaker one, and the routing + `queryEvents` persistence assertions above it are
   untouched. The test title no longer claims an M1 scope note the plan supersedes.
2. `shell.spec.ts` — `model: null` added to the frozen `/api/state` object. Every other
   key/value is unchanged and still asserted by the same `toEqual`, so the exact-shape
   guarantee (nothing extra, nothing missing) is intact.

Independently: no `test.skip`, `test.fixme`, `.skip(`, `.fixme(`, `it.skip` or
`describe.skip` anywhere in `web/e2e` or `web/src`, and no `t.Skip` in `internal/`/`cmd/`.
No assertion was replaced by a container-level `toBeVisible()` — `gauges.spec.ts` asserts
exact percentages, exact `toHaveCount(0)`/`(1)` track counts, a `SELECT COUNT(*)` SQLite
oracle for dedup, and a full wire-object comparison for INV-4. The two status-line
fixtures still match `spikes/canary-fields.md` § "Status-line payload" field-for-field
(epoch-integer `resets_at`, float `used_percentage`, `seven_day` weekly bucket) — nothing
synthesized that the real Claude Code never sends.

Also checked the cycle-2 test-side fix that carried the most risk: `web-tests`'
`FakeDomNode` in `render/masthead.test.ts`. It is a genuine minimal `Element`/`Document`
stand-in (`createElement`, `appendChild`, `insertBefore` with real index semantics,
`replaceChildren`, `querySelector`, a children-reflecting `textContent`), scoped to two
`describe` blocks via `vi.stubGlobal`/`vi.unstubAllGlobals`, with no new dependency. Its
order assertion (`["lbl", "bar warn", "num", "resets"]`) matches what I read out of the
real browser, so the fake is not certifying a shape the real DOM doesn't produce — and
the real-DOM shape stays covered by `gauges.spec.ts` regardless.

## Issues

### Critical

None.

### Major

None.

### Minor

1. R6 doc upkeep, carried from cycle 1's Minor 7 and still outstanding: `TODO.md:158-168`'s
   five M3 work items (status-line ingestion with dedup, per-session context gauge with
   absolute tokens, account usage bars, "unknown not empty gauge", `usage_sample`
   persistence) are all implemented and still unticked. Everything else under R6 landed —
   the design-system §5 threshold note, the SPEC §11 changelog entry, the §9 Q6
   resolution, the §9.6 open-question tick, and the whole `docs/protocol.md` delta.

2. Cycle 1's Minor 3 was ruled a TODO.md follow-up rather than a fix, but that record
   never landed — nothing in `TODO.md`, `SPEC.md`, or `docs/conventions.md` mentions it.
   The finding still holds: `go list -deps ./internal/claudecode` returns both
   `internal/usage` and `internal/store`, because `InterpretStatus` needs only the neutral
   `usage.Sample` value type while that type shares a package with `Aggregator`, which
   holds a `*store.Store`. Splitting the value types out (or having `InterpretStatus`
   return its own bucket triple that `internal/server` maps into a `Sample`) keeps the
   adapter boundary free of the storage layer. No rule is broken; it needs to be *written
   down* so the ruling isn't lost.

3. Same for cycle 1's Minor 8 (honesty rule 8, "stale is labelled, not hidden"):
   `usage.sampledAt` is on the wire and rendered nowhere, while `canary-fields.md`
   measures that an idle session emits no status posts at all, so the masthead bars can
   silently be minutes stale. This plan deliberately scoped it out and the reference
   render shows no sample age either, so it is not a violation of this work — but it is
   the follow-up that rule points at, and it should be recorded rather than re-derived
   next cycle.

4. **[daemon-impl]** `usage.Aggregator.Record` commits the new sample to memory before it
   persists — `internal/usage/aggregator.go:59` sets `a.current = &s` and releases the
   lock, then calls `InsertUsageSample`. If that write fails, three things follow: no
   `usage_sample` row, no `OnChange` broadcast, but `Current()` (and therefore
   `/api/state` and every new snapshot) already reports the new values — and because
   `a.current` advanced, the *next* identical post is deduped away, so that sample never
   gets a second chance at persistence. Sockets and snapshots then disagree until a
   genuinely changed sample arrives. For local-SQLite history this is a small window, and
   the error is both logged and returned, so it isn't worth a fix wave on its own —
   persisting before the in-memory commit (or rolling `a.current` back on error) would
   close it whenever this file is next touched.

5. Carried from cycle 1 (no owner, recorded so the table isn't later cited as though it
   matched): the plan's Testable UI Elements pattern for the card/tile context row
   (`/(\d+% · \d+(\.\d+)?[kM])|ctx unknown/`) does not literally match the shipped DOM.
   The rendered text is `61%123k`, with layout supplying the separation (`gap: 7px`) and
   no middot — which is what `mockups/a-instrument.html:256` shows, so the implementation
   followed the design authority and the plan's pattern is the imprecise one. No test
   depends on the middot form; E14's `⟳n` assertion still passes.
