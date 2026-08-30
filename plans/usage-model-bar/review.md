# Review: usage-model-bar

**Plan**: usage-model-bar
**Verdict**: approved

Cycle 2's Major 1 is genuinely fixed, and I reproduced the exact transition that found it
in a real browser: after `[Opus]` → `[Fable, Opus]` with pref `Fable` — the name-sequence
collision the old cache could not see — the `Fable` option now measures `disabled: false`
while `.num` renders its live `61%`, the previously tagged `<select>` node is gone (the
rebuild path ran), and Fable is reachable by genuine keyboard typeahead in both
directions. Cycle-2 Minor 1 (`style.css` comment) and Minor 2 (`TODO.md` sub-bullet) are
done. Cycle-1's Critical (select node identity + focus across ticks) still holds under
re-measurement — the tightened guard did not reintroduce per-tick rebuilds.

All seven authored acceptance checks pass. The full E2E suite is green at **115/115**
(regression sweep over all 12 spec files, +1 vs. cycle 2 — the new drop-and-restore
keyboard spec). No Critical, no Major, no agent-tagged issue.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 poll every `-usage-poll`, immediate fetch on Start | Yes — `internal/server/usagepoll.go:92` | Yes — D7 unit + E1/E2 | pass |
| REQ-2 Keychain read-only, token never logged/persisted/wired | Yes — `internal/claudecode/credentials.go:51-61` | Yes — D8/D9 + E7; browser-measured 0 occurrences | pass |
| REQ-3 GET `<base>/api/oauth/usage`, 3 headers, 5 s timeout | Yes — `internal/claudecode/usageapi.go:69-83` | Yes — header/path test | pass |
| REQ-4 decode `weekly_scoped` + dual `resets_at` format | Yes — `usageapi.go:108-152` | Yes — 13 `InterpretUsageReport` tests | pass |
| REQ-5 dedup on sorted list, persist-before-commit | Yes — `internal/usage/modelscoped.go` | Yes — D6 + dedup/sort tests | pass |
| REQ-6 error kinds, last-good kept, Warn-once | Yes — `usagepoll.go:110-142` | Yes — D7 + E5; browser-measured (one `WRN error_kind=unauthorized` across repeated failing polls) | pass |
| REQ-7 `POST /api/usage/refresh` 202 / 404, coalesced | Yes — `internal/server/usage.go`, `usagepoll.go:84` | Yes — `usage_test.go` + E4/E6 | pass |
| REQ-8 `prefs.usageModel` accepted/persisted/echoed | Yes — `internal/server/prefs.go` | Yes — 10 D10 tests + E3/INV-6; browser-measured persistence after a keyboard-driven change | pass |
| REQ-9 third readout after the 7-day bar | Yes — `web/index.html:20`, `masthead.ts:267` | Yes — W4 + E1 | pass |
| REQ-10 "unknown" with zero track markup | Yes — browser-measured `trackNodes: 0` from the placeholder state | Yes — W4 + E2 | pass |
| REQ-11 `.stale` + `title` on error, bar kept | Yes — `masthead.ts:299-305` | Yes — W4 + E5; browser-measured | pass |
| REQ-12 select PUTs; ↻ POSTs with `aria-busy` | **Yes** — the cycle-2 defect is gone; a dropped-and-restored model is selectable again by real keyboard input | Yes — W4 + E3/E4 + 2 new Vitest placeholder-flip cases + the new E2E drop-and-restore spec | **pass** |
| REQ-13 no real Keychain / api.anthropic.com in tests | Yes — `-usage-token-file` unconditional in `helpers/daemon.ts:176/194`; `onexit_test.go` | Yes | pass |
| REQ-14 `modelScopedAt` null iff `modelScoped` null | Yes — browser-measured unchanged across a 401 | Yes — INV-1 table tests | pass |

## Build & Tests

E2E tests: **pass** (115/115, full suite, 30.9 s — all 12 spec files)
Daemon tests: **pass** (`make test`, all 10 packages)
Web tests: **pass** (495/495, 18 files — 493 prior + 2 new placeholder-flip cases)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root this cycle.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `make lint` | pass (0 issues) |
| D3 | `! rg -n "claudeAiOauth\|Claude Code-credentials\|weekly_scoped\|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (no matches, exit 0) |
| D4 | `! go list -deps ./internal/usage ./internal/store \| rg -q 'muster/internal/claudecode'` | pass (exit 0) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass (495) |
| E8 | `make e2e` | pass (115 passed) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5 | `InterpretUsageReport` covers RFC3339-with-offset, epoch, missing `limits`, other kinds, null `display_name`, unknown top-level keys | pass | Re-enumerated by name: `internal/claudecode/usageapi_test.go` — `MeasuredLiveShape`, `EpochSecondsResetsAt`, `MissingLimitsKeyIsNilNotError`, `EmptyLimitsArrayIsNil`, `NonWeeklyScopedKindsAreIgnored`, `NullScopeIsIgnored`, `NullDisplayNameIsIgnored`, `EmptyDisplayNameIsIgnored`, `UnparseableResetsAtOnOneEntrySkipsOnlyThatEntry`, `UnknownTopLevelKeysAreIgnored`, `MultipleWeeklyScopedEntries`, `MalformedJSONReturnsError`, `ResetsAtWithoutFractionalSecondsStillParses` |
| D6 | persist-failure test mirrors `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged` | pass | `modelscoped_test.go:157` `..._PersistFailureLeavesMemoryAndDedupStateUnchanged` — asserts error returned, memory unchanged, and dedup state not advanced |
| D7 | poller tests: success, 401, 5xx/refused, coalescing, INV-1/INV-3 from every state | pass | `usagepoll_test.go` — 9 tests; both coalescing forms (channel-level and full-loop with a gated in-flight request, not a timing race); 401 case asserts the last-good list *and* `At` survive |
| D8 | `KeychainTokenReader` tested only via an injected exec func | pass | 16 tests, each passing its own closure; `RunCommand` is exercised exactly once against `echo`, never `security` (`credentials_test.go:200`, documented as the D8 tripwire) |
| D9 | token never appears in any log line | pass | **Re-read every log call this cycle.** `usagepoll.go` has exactly four: `:74` (shutdown Warn, no error), `:117` Debug — fires *before* the token is read, and every `credentials.go` path returns the bare `ErrNoCredentials` sentinel (it never wraps the read data); `:127` Debug — `FetchUsage` puts the token only in the `Authorization` header and returns build/transport/status/decode wraps, never a request re-encoding; `:141` Warn — a store error. Browser-measured: 0 occurrences of the fake token across success, 401 and no-credentials polls |
| D10 | `PUT /api/prefs` accepts/validates/echoes `usageModel` | pass | `prefs_test.go:303-450` — 10 tests: default, validation table, exactly-32, trim, alone-satisfies-at-least-one-field, view/density untouched, KV persistence, restart, broadcast echo, independent fallback |
| W3 | no `any` in new web code | pass | Grepped `: any`, `as any`, `<any>`, `any[]` across `protocol.ts`, `api.ts`, `main.ts`, `masthead.ts`, `masthead.test.ts`, `protocol.test.ts`, `api.test.ts`, `e2e/helpers/usageapi.ts`, `e2e/helpers/gauges.ts`, `e2e/helpers/daemon.ts`, `e2e/usage-model.spec.ts` — zero hits |
| W4 | Vitest null/absent/child-order/warn-60/stale/options/disabled | pass | `masthead.test.ts` — 47 cases, incl. the node-reuse block's 7 identity-asserting tests (`toBe`/`not.toBe`), now covering both placeholder-flip directions |
| W5 | `parseUsage` rejects a malformed element; absent → null | pass | `protocol.test.ts:238-330` — rejects missing `displayName`, non-numeric `usedPct`, non-string `resetsAt`, non-array `modelScoped`, unrecognized `modelScopedError`, non-string `modelScopedAt`; absent-keys test asserts the keys are absent *and* read as null |
| E1–E7 | each spec asserts the stated DOM, not a weaker proxy | pass | Read the new spec body in full. E4 holds the fake response so the `aria-busy` window is genuinely observable rather than raced. The new drop-and-restore spec asserts option 0's `toBeDisabled()` → `toBeEnabled()` across the collision, then proves selectability with native single-character typeahead (not `selectOption`, which bypasses the browser's own `disabled` gate) in both directions, then confirms server-side persistence via `GET /api/state` |
| INV-1 | `modelScopedAt` null iff `modelScoped` null, from all 5 states | pass | Table test + failure-before-any-success; browser-confirmed both null at boot-with-placeholder and both unchanged across a 401 |
| INV-2 | no `.bar`/`i`/`.resets` whenever `.num` reads `unknown` | pass | Browser-measured `trackNodes: 0` with `childOrder` exactly `[select.lbl usage-model-select, span.num]` in the pref-absent-from-a-non-null-list state |
| INV-3 | a failed poll never changes `modelScoped`/`modelScopedAt` | pass | Unit tests from both source states; browser-confirmed — across the 401 the wire kept the identical two-window list and the pre-failure `modelScopedAt` (`2026-08-30T14:54:52Z` before and after) |
| INV-4 | token never in logs | pass | Browser run: 0 occurrences of `REVIEW3-FAKE-OAUTH-TOKEN-9c1e` in the whole daemon log across success, 401 and refresh polls. Source-level argument under D9 is the exhaustive half |
| INV-5 | the poller never calls `Aggregator.Record` | pass | `rg '\.Record\(' internal/server/*.go` returns exactly two sites: `usagepoll.go:140` (`p.modelScoped`) and `ingest.go:176` (`q.usage`) — one writer each |
| INV-6 | a `usageModel` change in one window re-renders the other, in both views | pass | Dedicated E2E with two browser contexts, asserted from Focus and Tiles |
| — | Design-system §5/§6 conformance | pass | New CSS block resolves to `var(--mono)`/`var(--dim)`/`var(--paper)` only — no hex, no web font. `.stale` carries its own dim + dotted-underline signal, never `--rose`/`--amber`. Browser-measured `font-variant-numeric: tabular-nums` on both the readout and its `.num`; masthead order `usage-5h, usage-7d, usage-model-week, usage-refresh, usage-model, claude-version, connection-status` matches design-system §5's edited sentence (lines 111/147); the §5 threshold sentence ("a masthead usage bar takes `warn` at ≥ 60%") is generic and covers the third bar |

## E2E Repairs Audit

Three Repairs entries across the three attempts, all re-verified against the working tree:

- **Validate attempt 1, #1–2** (`shell.spec.ts`, `views.spec.ts`): still strictly additive
  `toEqual()` literal updates to pre-existing frozen-shape assertions. `shell.spec.ts:70`
  is still a whole-body `toEqual()` and is now *stricter* — `modelScopedError` is pinned
  to its actual `"no-credentials"` value rather than loosened.
- **Fix attempt 2, #1** (the new drop-and-restore spec): a `waitForTimeout(1100)` inserted
  *between* two keystrokes. I accept the diagnosis — the HTML `<select>` typeahead
  search-string concatenation window is a real browser behaviour, and the agent isolated
  it against a bare two-option `<select>` outside the app before changing anything. No
  assertion was touched; the wait is a prerequisite for the second keystroke to mean `F`
  rather than `OF`. Independently corroborated: my own browser run reproduced the same
  need and, with the pause, the second keystroke moved the selection back to Fable.

`rg 'test\.skip|test\.fixme|\.only\(' web/e2e web/src` returns nothing. Fixture payloads
still trace to `spikes/canary-fields.md`'s measured capture (`weeklyScopedUsageResponse`
carries the full measured field set plus the real `amber_ladder` noise key) — no invented
field. Nothing deleted, skipped, or weakened in any cycle.

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D3 clean; endpoint path, headers, Keychain item name and credential JSON shape all live inside `internal/claudecode/`. The `permission_mode` hits elsewhere are pre-existing and unrelated to this plan |
| 2 | No terminal-output state parsing | pass — no `capture-pane` in any new code |
| 3 | Non-blocking hook handler | pass — no hook path touched |
| 4 | tmux always `-L muster`; no `resize-pane` | pass — no tmux invocation added; `rg resize-pane` over `internal/`/`cmd/` returns nothing |
| 5 | No payload logging | pass — see D9; the two Debug calls carry only sentinel/transport errors |
| 6 | No empty-gauge dishonesty | pass — browser-measured: no data renders the word `unknown` with **zero** track nodes, never a 0% bar; stale keeps the last-good bar and labels it; daemon-down keeps the last render behind the prominent banner |
| 7 | Session identity on the tmux target | pass — not touched |
| 8 | No settings trespass | pass — nothing reads/writes `~/.claude/settings*.json`; no `CLAUDE_CONFIG_DIR`. The `settings.local.json` hits are the sanctioned project-scoped scratch-repo path, pre-existing |
| 9 | No real `claude` outside canary/probes | pass — `-usage-token-file` is passed unconditionally by `helpers/daemon.ts` for every scratch daemon, and `internal/server` disables polling on an empty `UsageAPIURL` rather than defaulting to the real host, so the zero-value config fails away from production |

## Manual Verification

Drove the built dashboard in real Chromium against a scratch `musterd` (`-usage-token-file`,
`-usage-api-url` pointed at a fake endpoint whose body I mutated between refreshes) and read
values out of the live DOM and the wire by hand. Temporary harness spec was deleted after the
run (`git status web/e2e/` confirms only the plan's own files remain).

**Cycle-2 Major 1, reproduced along the exact transition that found it — fixed:**
1. Pref `Fable`, endpoint list `[Opus 20%]` → placeholder state measured as
   `options: [{Fable, disabled:true}, {Opus, disabled:false}]`, `.num` `unknown`,
   `trackNodes: 0`, `childOrder: [select.lbl usage-model-select, span.num]`,
   `selectedIndex: 0` (not the blank `-1` of cycle 1's Minor 3). Tagged the live select node.
2. Endpoint switched to `[Fable 61%, Opus 20%]` and refreshed — the collision, since the
   option-name sequence is still exactly `["Fable","Opus"]`. Measured
   `options: [{Fable, disabled:false}, {Opus, disabled:false}]`, tag **gone** (the rebuild
   path ran, as designed), `.num` `61%`, `barClass: "bar warn"`, `fillWidth: "61%"`,
   `resets: "· resets Tue"`. Cycle 2 measured `Fable: disabled:true` here.
3. Real keyboard, not `selectOption`: `O` → value `Opus`, `.num` `20%`, `barClass: "bar"`
   (warn correctly dropped); after the typeahead buffer cleared, `F` → value `Fable`,
   `.num` `61%`, one track node, focus still on the select, and `GET /api/state` reported
   `prefs.usageModel: "Fable"`. Fable is permanently selectable — the state cycle 2 could
   not escape without a direct `PUT`.

**Cycle-1 Critical, re-measured (the tightened guard did not reintroduce rebuilds):** tagged
the live select, focused it, waited 3.5 s (3+ render ticks) → tag `P5` still present and
`document.activeElement` still the select.

**Other states confirmed:** 401 → `.stale` + `title="unauthorized"` with the last-good
`61%`/`bar warn`/`fillWidth 61%`/`· resets Tue` intact, and the wire's `modelScoped` list
and `modelScopedAt` byte-identical before and after (INV-3); back to 200 → `.stale` cleared,
`title` removed. Warn-once: exactly one `WRN usage model-scoped poll failed error_kind=unauthorized`
across repeated failing polls. `aria-label="Usage model"` present. `font-variant-numeric:
tabular-nums` on the readout and `.num`; `font-family` resolves to the `--mono` stack.
`#usage-model-week` and `#usage-refresh` are never toggled via `.hidden`, so no `[hidden]`
companion rule is owed for them (`.model[hidden]` already covers the one element that is).

**Not verified:** that the native `<select>` popup stays open across a render tick —
Playwright cannot observe a native popup. Node identity and retained focus are the
measurable proxies and both hold. Also unmeasured: `aria-busy` at the instant of my own
refresh click (the fake endpoint answered faster than the read) — E4 covers this properly
by holding the response, and I read that spec body to confirm it.

## Cycle-2 disposition accepted

**[daemon-impl] Minor 3** (no fix made, none requested): `internal/claudecode/usageapi.go:111`
wraps the JSON decode error, which for a type mismatch can carry a short snippet of the
endpoint's *response* body into the poller's Debug log. I accept leaving this as-is. The
token travels only in the request `Authorization` header and is never present in a
response, the call site is Debug-only, and the body in question is the account's own usage
figures — not a credential. It remains worth remembering as the one place a future
response-body change could surface something unexpected, but it is a note, not a defect,
and no code change is warranted.

## Issues

### Critical

None.

### Major

None.

### Minor

None.
