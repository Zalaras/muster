# Review: usage-model-bar

**Plan**: usage-model-bar
**Verdict**: needs-changes

Cycle 1's Critical is genuinely fixed — I reproduced the reviewer's own three measurements
in a real browser and the select now survives ticks, keeps focus, and is fully operable by
keyboard (typeahead after 3+ ticks changes the model end-to-end). Both daemon Minors, the
web Minor, the new E2E regression spec and all three orchestrator doc items are done and
verified. All seven acceptance checks pass; the full E2E suite is green (114/114).

One new Major, found by driving the fix's own new code path: the node-reuse cache keys on
the option-*name* sequence only, so a placeholder-state flip that leaves the names
identical never re-syncs per-option `disabled` — a live model can end up permanently
unselectable in the dropdown. Measured in the browser, not inferred.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 poll every `-usage-poll`, immediate fetch on Start | Yes — `internal/server/usagepoll.go:92` | Yes — D7 unit + E1/E2 | pass |
| REQ-2 Keychain read-only, token never logged/persisted/wired | Yes — `internal/claudecode/credentials.go:51-61` | Yes — D8/D9 + E7 | pass |
| REQ-3 GET `<base>/api/oauth/usage`, 3 headers, 5 s timeout | Yes — `internal/claudecode/usageapi.go:69-83` | Yes — header/path test | pass |
| REQ-4 decode `weekly_scoped` + dual `resets_at` format | Yes — `usageapi.go:108-152` | Yes — 13 `InterpretUsageReport` tests | pass |
| REQ-5 dedup on sorted list, persist-before-commit | Yes — `internal/usage/modelscoped.go` | Yes — D6 + dedup/sort tests | pass |
| REQ-6 error kinds, last-good kept, Warn-once | Yes — `usagepoll.go:110-142` | Yes — D7 + E5; browser-measured (one `WRN error_kind=unauthorized` across many failing polls) | pass |
| REQ-7 `POST /api/usage/refresh` 202 / 404, coalesced | Yes — `internal/server/usage.go`, `usagepoll.go:84` | Yes — `usage_test.go` + E4/E6 | pass |
| REQ-8 `prefs.usageModel` accepted/persisted/echoed | Yes — `internal/server/prefs.go` | Yes — 10 D10 tests + E3/INV-6 | pass |
| REQ-9 third readout after the 7-day bar | Yes — `web/index.html`, `masthead.ts:267` | Yes — W4 + E1 | pass |
| REQ-10 "unknown" with zero track markup | Yes — browser-measured 0 track nodes from two distinct states | Yes — W4 + E2 | pass |
| REQ-11 `.stale` + `title` on error, bar kept | Yes — `masthead.ts:299-305` | Yes — W4 + E5 | pass |
| REQ-12 select PUTs; ↻ POSTs with `aria-busy` | Mostly — keyboard operation now works end-to-end; a live model can become unselectable after a specific list transition (Major 1) | Yes — W4 + E3/E4 + new focus/node-identity spec | **fail** |
| REQ-13 no real Keychain / api.anthropic.com in tests | Yes — `-usage-token-file` unconditional in `helpers/daemon.ts:248`; `onexit_test.go` | Yes | pass |
| REQ-14 `modelScopedAt` null iff `modelScoped` null | Yes — browser-measured null/null at boot and unchanged-across-401 | Yes — INV-1 table tests | pass |

## Build & Tests

E2E tests: **pass** (114/114, full suite, 27.2 s — regression sweep over all 12 spec files)
Daemon tests: **pass** (`make test`, all 10 packages)
Web tests: **pass** (493/493, 18 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root this cycle.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `make lint` | pass (0 issues) |
| D3 | `! rg -n "claudeAiOauth\|Claude Code-credentials\|weekly_scoped\|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (no matches) |
| D4 | `! go list -deps ./internal/usage ./internal/store \| rg -q 'muster/internal/claudecode'` | pass (no match) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (493) |
| E8 | `make e2e` | pass (114 passed) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5 | `InterpretUsageReport` covers RFC3339-with-offset, epoch, missing `limits`, other kinds, null `display_name`, unknown top-level keys | pass | Re-enumerated by name this cycle: 13 tests at `internal/claudecode/usageapi_test.go:37-160`, all six named cases plus empty-`display_name`, null-`scope`, one-bad-entry-skips-only-that-entry, no-fractional-seconds, multi-window |
| D6 | persist-failure test mirrors `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged` | pass | `modelscoped_test.go:157` — asserts error returned, memory unchanged, **and** dedup state not advanced |
| D7 | poller tests: success, 401, 5xx/refused, coalescing, INV-1/INV-3 from every state | pass | `usagepoll_test.go` — 9 tests; coalescing covered twice (channel-level and full-loop with a gated in-flight request, not a timing race) |
| D8 | `KeychainTokenReader` tested only via an injected exec func | pass | 16 tests, every one passing its own closure; the single `"security"` literal (`credentials_test.go:32`) is an *assertion* on the recorded arg |
| D9 | token never appears in any log line | pass | **Re-read this cycle** — the fix added two `Debug().Err(err)` calls (`usagepoll.go:117`, `:127`). Traced every error they can carry: the token-read branch fires before the token is read, and every reader path returns the bare `ErrNoCredentials` sentinel (`credentials.go` never wraps the data); `FetchUsage` puts the token only in a header and returns build/transport/status/decode wraps, never a request re-encoding. Browser-measured: 0 occurrences of the fake token in the whole daemon log across success and 401 runs |
| D10 | `PUT /api/prefs` accepts/validates/echoes `usageModel` | pass | 10 tests, `prefs_test.go:303-450` — validation table, exactly-32, trim, alone-satisfies-at-least-one-field, KV persistence, restart, broadcast echo, independent fallback |
| W3 | no `any` in new web code | pass | Grepped `: any`, `as any`, `<any>`, `any[]` across `protocol.ts`, `api.ts`, `main.ts`, `masthead.ts`, `masthead.test.ts`, `e2e/helpers/usageapi.ts`, `e2e/usage-model.spec.ts` — none |
| W4 | Vitest null/absent/child-order/warn-60/stale/options/disabled | pass | `masthead.test.ts` — 45 cases, incl. the 5 new node-reuse tests asserting node **identity** (`toBe`), not just equality |
| W5 | `parseUsage` rejects a malformed element; absent → null | pass | 6 rejection tests plus the absent-keys test (unchanged this cycle) |
| E1–E7 | each spec asserts the stated DOM, not a weaker proxy | pass | Read the two new bodies in full. The Critical-1 regression spec tags the live node (`__e2eTag`) so a refocused *replacement* cannot pass it — the strongest available form. The Minor-3 spec asserts value, option count, per-option text and `disabled` on option 0, plus INV-2 track counts |
| INV-1 | `modelScopedAt` null iff `modelScoped` null, from all 5 states | pass | Table test + the failure-before-any-success case; browser-confirmed at boot (both null) and across a 401 (both unchanged) |
| INV-2 | no `.bar`/`i`/`.resets` whenever `.num` reads `unknown` | pass | Browser-measured from two states: boot-with-failing-endpoint (`childOrder` exactly `[select, num]`, 0 track nodes) and pref-absent-from-a-non-null-list (0 track nodes) |
| INV-3 | a failed poll never changes `modelScoped`/`modelScopedAt` | pass | Unit tests from both source states; browser-confirmed — after the 401 the wire still carried the full two-window list and the pre-failure `modelScopedAt` |
| INV-4 | token never in logs | pass | Browser run: `grep -c FAKE-REVIEW-TOKEN-XYZ` over the whole daemon log = 0, across success, 401 and no-credentials polls. Source-level argument under D9 is the exhaustive half |
| INV-5 | the poller never calls `Aggregator.Record` | pass | `usagepoll.go` touches only `p.modelScoped`; `server.go:159-195` builds two holders with two independent `OnChange` closures |
| INV-6 | a `usageModel` change in one window re-renders the other, in both views | pass | Dedicated E2E with two browser contexts, asserted from Focus and Tiles |
| — | Design-system §5/§6 conformance | pass | New CSS uses `var(--mono)`/`var(--dim)`/`var(--paper)` only — no hex, no web font. `.stale` has its own dim+dotted signal, never `--rose`/`--amber`. Browser-measured `font-variant-numeric: tabular-nums` on the readout and its `.num`; `font-size` 11 px matches the sibling `.model` rule (this codebase tokenises colour and family, not size) |

## E2E Repairs Audit

Both entries in `test-specs.md`'s Validate-attempt Repairs table re-verified against the
diff this cycle: `shell.spec.ts` and `views.spec.ts` are strictly additive `toEqual()`
literal updates to pre-existing frozen-shape assertions. Nothing deleted or loosened —
`shell.spec.ts` is now **stricter** (`modelScopedError` pinned to its actual
`"no-credentials"` value). Fix-attempt-1's Repairs section correctly records "no repairs
needed"; both new specs passed on their first live run. `rg 'test\.skip|test\.fixme|\.only\('`
over `web/e2e` and `web/src` returns nothing. Fixture payloads still trace to
`spikes/canary-fields.md`'s measured capture (`weeklyScopedUsageResponse` carries the full
measured field set plus the `amber_ladder` noise key) — no invented field.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D3 clean; the endpoint path, headers, Keychain item name and credential JSON shape are all inside `internal/claudecode/`. The cycle-1 duplicate host constant in `internal/server` is gone (Minor 1 fix) |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in any new code |
| 3 | Non-blocking hook handler | pass — no hook path touched |
| 4 | tmux always `-L muster` | pass — no tmux invocation added |
| 5 | No payload logging | pass — see D9; the two new Debug calls carry only sentinel/transport errors |
| 6 | No empty-gauge dishonesty | pass — browser-measured: no data renders the word `unknown` with **zero** track nodes, never a 0 % bar; daemon-down keeps the last render behind a prominent banner |
| 7 | Session identity on the tmux target | pass — not touched |
| 8 | No settings trespass | pass — nothing reads/writes `~/.claude/settings*.json`; no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — `-usage-token-file` is passed unconditionally by `helpers/daemon.ts` for every scratch daemon, and `internal/server` now *disables* polling on an empty `UsageAPIURL` rather than defaulting to the real host, so the zero-value config fails away from production |

## Manual Verification

Drove the built dashboard in Chromium against a real scratch `musterd` (`-usage-poll 2s`,
`-usage-token-file`, `-usage-api-url` pointed at a fake endpoint whose body I mutated
between polls) and read values by hand.

**Cycle-1 Critical, re-measured the same three ways it was found — all now clean:**
- Tagged the live `<select>` node and waited 3.5 s (3+ render ticks, with the readout
  re-rendering throughout): `activeIsSameNode: true`, `sameNodeStillInDom: true`,
  `tagSurvived: true`. Cycle 1 measured `BODY` / node replaced within 1.6 s.
- Real keyboard operation end-to-end: focused the select, waited past several ticks, sent a
  genuine `O` keypress (typeahead, not `selectOption`) → value `Opus`, `PUT /api/prefs`
  fired, server `prefs.usageModel` became `"Opus"`, readout re-rendered to `20%` and
  correctly dropped `warn`, select still focused. This is the exact interaction that did
  nothing before the fix.
- Steady state: child order exactly `select.lbl usage-model-select`, `span.bar warn`,
  `span.num`, `span.resets`; `.num` `61%`; fill width `61%`; `· resets Tue`;
  `tabular-nums` on readout and `.num`; masthead order `usage-5h, usage-7d,
  usage-model-week, usage-refresh, usage-model, claude-version, connection-status` —
  matching the design-system edit.

**Cycle-1 Minor 3, confirmed fixed:** pref `Fable` against a `[Opus]` list → options
`[Fable(disabled), Opus]`, `value: "Fable"`, `selectedIndex: 0` (was blank at `-1`), with
`.num` `unknown` and 0 track nodes — the honest state is untouched by the cosmetic fix.

**The new defect (Major 1), measured, not inferred** — driving the list transition the
reuse cache cannot see:
1. pref `Fable`, list `[Opus]` → placeholder path, options `[Fable(disabled), Opus]`.
2. Endpoint switched to `[Fable, Opus]`; after the poll landed, the option-name sequence is
   still `["Fable","Opus"]`, so the reuse branch runs and the node is preserved
   (`sameNodeAsPhase1: true`) — but the options still read `[Fable(disabled), Opus]` while
   `.num` renders Fable's live `61%`.
3. Switched to Opus through the control (value `Opus`, `.num` `20%`): Fable is now a live,
   listed 61 % window that the user **cannot select** — `fableSelectable: false`, and it
   stays that way indefinitely, because the name sequence never changes again. I could only
   restore the pref with a direct `PUT /api/prefs`.

**Other states confirmed:** 401 → `.stale` + `title="unauthorized"` with the last-good
`20%`/fill/resets intact and the wire's list and `modelScopedAt` unchanged (INV-3);
back to 200 → `.stale` cleared. Refresh button → `aria-busy="true"` on click, cleared on
the next `usage` broadcast, and cleared by the 5 s fallback when a refresh produces no
change (the documented path). Boot against a failing endpoint → `unknown`, 0 track nodes,
disabled single-option select reading the pref, `modelScoped`/`modelScopedAt` both null.
Daemon killed → banner "musterd unreachable", `connecting` → `reconnecting…`, readout keeps
its last render. Warn-once: one `WRN ... error_kind=unauthorized` across many failing polls.

**Not verified:** that the native `<select>` popup stays open across a tick — Playwright
cannot observe a native popup. Node identity and focus (above) are the measurable proxies
and both hold.

## Issues

### Critical

None.

### Major

1. **[web-impl]** The node-reuse cache keys on the option-*name* sequence alone, so a
   change in **placeholder state** that leaves the names identical takes the reuse path and
   never re-syncs per-option `disabled` — a live, listed model can become permanently
   unselectable — `web/src/render/masthead.ts:277-295`.

   `names` is `[selectedModel, ...rawNames]` when a placeholder is needed and `rawNames`
   otherwise, so the two states collide whenever `rawNames` loses exactly the pref name:
   pref `Fable` with list `[Fable, Opus]` and pref `Fable` with list `[Opus]` both produce
   `["Fable","Opus"]`. `namesEqual` therefore reports "unchanged", and the reuse branch
   updates only `select.disabled` and `select.value` — never the individual options'
   `disabled` flags, which are set once in `buildModelWeek:181`.

   Measured in the browser (see Manual Verification): after `[Opus]` → `[Fable, Opus]` with
   pref `Fable`, the `Fable` option stays `disabled: true` while `.num` renders its live
   `61%`; selecting `Opus` then leaves the user unable to select `Fable` at all
   (`fableSelectable: false`), permanently, since the name sequence never changes again.
   Reachable whenever the endpoint drops a model that is the current pref and later returns
   it — the plan's own Edge Cases 5 and 6 are this transition.

   No existing test can see it: `masthead.test.ts:656-769` covers names-changed → rebuild
   and names-unchanged → reuse, but never a placeholder flip with equal names, and the
   E2E specs never move a model out of and back into the list.

   Fix (either is small): include `placeholderNeeded` in the cached state and treat a
   change in it as a rebuild — the list genuinely changed there, so forfeiting an open
   dropdown is correct and matches the existing "option set changed" rule; or re-sync each
   option's `disabled` in the reuse branch. The first is the smaller diff and keeps one
   rule.

2. **[web-tests]** No unit coverage pins Major 1. Add a `masthead.test.ts` case to the
   node-reuse describe block for the placeholder flip: render pref `"Fable"` with
   `modelScoped: [opus]`, then with `[fable, opus]`, and assert the `Fable` option is
   **not** disabled in the second pass (and `optionTexts()` still `["Fable","Opus"]`).
   Author it after Major 1 is fixed. Flagging as a wave-2 fix, not a backlog line, per the
   m4-hook-quoting lesson.

### Minor

1. **[web-impl]** `web/src/style.css:229-231` still describes the select as "rebuilt fresh
   every render pass by renderModelWeek" — that is exactly what the Critical-1 fix stopped
   doing. Update the comment so the next reader is not told the opposite of the code.
2. **[orchestrator]** `TODO.md`'s Fable item is correctly ticked, but the sub-bullet under
   it still reads "**Decision needed:** (a) wait for the status line … or (b) musterd calls
   `/api/oauth/usage` …" while the parent line records that (b) was taken and shipped. Fold
   or mark the sub-bullet as resolved history so the file does not state an open decision
   that is closed.
3. **[daemon-impl]** `internal/claudecode/usageapi.go:111` wraps the JSON decode error,
   which for a type mismatch can carry a short snippet of the endpoint's response body into
   the poller's new Debug log. Not a token leak (the token travels only in the request
   header, never the response) and Debug-only, so this is purely a note: if the endpoint
   ever starts echoing anything sensitive in a body, that wrap is the one place it could
   surface.
