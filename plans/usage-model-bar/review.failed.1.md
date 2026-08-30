# Review: usage-model-bar

**Plan**: usage-model-bar
**Verdict**: needs-changes

One Critical, found only by driving the browser: the model `<select>` is destroyed and
rebuilt by the 1 s render tick, so it cannot be operated by keyboard and its dropdown
cannot stay open. Everything else — daemon, protocol, tests, honesty rules, hard rules —
is clean, and all seven authored acceptance checks pass.

## Requirements

| Req | Implemented | Tested | Status |
|-----|-------------|--------|--------|
| REQ-1 poll every `-usage-poll`, immediate fetch on Start | Yes — `internal/server/usagepoll.go:88` (`tick` before the ticker) | Yes — D7 unit + E1/E2 | pass |
| REQ-2 Keychain read-only, token never logged/persisted/wired | Yes — `internal/claudecode/credentials.go:52` | Yes — D8/D9 + E7 | pass |
| REQ-3 GET `<base>/api/oauth/usage`, 3 headers, 5 s timeout | Yes — `internal/claudecode/usageapi.go:68-83` | Yes — `TestFetchUsage_Success_SendsMeasuredHeadersAndPath` | pass |
| REQ-4 decode `weekly_scoped` + dual `resets_at` format | Yes — `usageapi.go:105-149` | Yes — 13 `InterpretUsageReport` tests | pass |
| REQ-5 dedup on sorted list, persist-before-commit | Yes — `internal/usage/modelscoped.go:53-98` | Yes — D6 + dedup tests | pass |
| REQ-6 error kinds, last-good kept, Warn-once | Yes — `usagepoll.go:137-148`, `modelscoped.go:104-122` | Yes — D7 + E5 | pass |
| REQ-7 `POST /api/usage/refresh` 202 / 404, coalesced | Yes — `internal/server/usage.go`, `usagepoll.go:84` | Yes — `usage_test.go` + E4/E6 | pass |
| REQ-8 `prefs.usageModel` accepted/persisted/echoed | Yes — `internal/server/prefs.go` | Yes — D10 + E3/INV-6 | pass |
| REQ-9 third readout after the 7-day bar | Yes — `web/index.html:20`, `masthead.ts:142` | Yes — W4 + E1 | pass |
| REQ-10 "unknown" with zero track markup | Yes — verified in browser (0 `.bar` nodes) | Yes — W4 + E2 | pass |
| REQ-11 `.stale` + `title` on error, bar kept | Yes — `masthead.ts:173-180` | Yes — W4 + E5 | pass |
| REQ-12 select PUTs; ↻ POSTs with `aria-busy` | Partly — wiring correct, but the select is unusable by keyboard (Critical 1) | Yes — W4 + E3/E4 | **fail** |
| REQ-13 no real Keychain / api.anthropic.com in tests | Yes — `-usage-token-file` unconditional in `helpers/daemon.ts:248`; `onexit_test.go:154` | Yes | pass |
| REQ-14 `modelScopedAt` null iff `modelScoped` null | Yes — `usagewire.go:56-73`, nil-vs-empty preserved | Yes — INV-1 table tests | pass |

## Build & Tests

E2E tests: **pass** (112/112, full suite, 27.9 s — regression sweep, all 12 spec files)
Daemon tests: **pass** (`make test`, all 10 packages)
Web tests: **pass** (488/488, 18 files)
Daemon build: **pass** (`go build ./...`)
Web build: **pass** (`tsc --noEmit && vite build`)
Lint: **pass** (`golangci-lint run` — 0 issues)

## Acceptance Checks

Every line of the plan's ```checks block, run verbatim from the repo root.

| ID | Command | Result |
|----|---------|--------|
| D1 | `make test` | pass |
| D2 | `make lint` | pass (0 issues) |
| D3 | `! rg -n "claudeAiOauth\|Claude Code-credentials\|weekly_scoped\|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'` | pass (no matches) |
| D4 | `! go list -deps ./internal/usage ./internal/store \| rg -q 'muster/internal/claudecode'` | pass (no match) |
| W1 | `make web-build` | pass |
| W2 | `make web-test` | pass |
| E8 | `make e2e` | pass (112 passed) |

## Reviewer-Verified Criteria

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| D5 | `InterpretUsageReport` covers RFC3339-with-offset, epoch, missing `limits`, other kinds, null `display_name`, unknown top-level keys | pass | All six named cases exist as separate tests in `internal/claudecode/usageapi_test.go:37-165`, plus empty-`display_name`, null-`scope`, unparseable-`resets_at`-skips-one, and multi-window |
| D6 | persist-failure test mirrors `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged` | pass | `modelscoped_test.go:157-177` — closes the store, asserts error returned, 0 broadcasts, `Current()` unchanged, **and** that the dedup state did not advance (retry errors again) |
| D7 | poller tests: success, 401, 5xx/refused, coalescing, INV-1/INV-3 from every state | pass | `internal/server/usagepoll_test.go` — 9 tests; coalescing tested twice (channel level and full-loop with a gated in-flight request, not a timing race) |
| D8 | `KeychainTokenReader` tested only via an injected exec func | pass | Every test passes its own closure; the only `"security"` literal is an *assertion* on the recorded arg (`credentials_test.go:32`). `RunCommand` is exercised once, against `echo` |
| D9 | token never appears in any log line | pass | Read every log call: `usagepoll.go` has exactly 2 (`:74` shutdown deadline, `:132` persist failure — neither carries the token); `credentials.go` and `usageapi.go` have **zero**. `SetError` logs only the fixed error-kind vocabulary |
| D10 | `PUT /api/prefs` accepts/validates/echoes `usageModel` | pass | `prefs.go:79-105` (at-least-one-field, 1–32 after trim, trim before persist, per-field fallback); 10 new tests incl. empty/whitespace/33-char table, exactly-32, restart persistence, broadcast echo |
| W3 | no `any` in new web code | pass | Grepped `protocol.ts`, `api.ts`, `main.ts`, `masthead.ts`, `style.css`, `e2e/helpers/usageapi.ts`, `e2e/usage-model.spec.ts` for `: any`, `as any`, `<any>` — none |
| W4 | Vitest null/absent/child-order/warn-60/stale/options/disabled | pass | `masthead.test.ts:476-640` — 11 tests; assertions are specific (exact `childClasses()` arrays, exact `.num` text), no container-level `toBeVisible()` |
| W5 | `parseUsage` rejects a malformed element; absent → null | pass | 6 rejection tests (missing `displayName`, non-numeric `usedPct`, non-string `resetsAt`, non-array, bad error enum, non-string `modelScopedAt`/`Source`) plus the absent-keys test |
| E1–E7 | each spec asserts the stated DOM, not a weaker proxy | pass | Read all 8 bodies. E5 asserts `.stale` **and** `title="unauthorized"` **and** the unchanged `61%` **and** track count 1; E6 asserts 404 + `error.code` + `requestCount === 0`; E7 greps the captured log. No proxies |
| INV-1 | `modelScopedAt` null iff `modelScoped` null, from all 5 states | pass | `TestModelScoped_INV1_AtNullIffWindowsNull` (table over boot / first success / failure-after-success / success-after-failure / `[]`) plus `_FailureBeforeAnySuccessKeepsBothNil` for the state the table skips |
| INV-2 | no `.bar`/`i`/`.resets` whenever `.num` reads `unknown` | pass | W4 asserts exact child arrays from boot, empty list, and absent-pref. **Browser-verified**: pref → `"Sonnet"` against a `[Fable]` list gave `.num="unknown"`, `.bar` count 0 |
| INV-3 | a failed poll never changes `modelScoped`/`modelScopedAt` | pass | Asserted from never-fetched (`_NoCredentialsSetsErrorKeepsListNil`) and from after-a-good-list (`_UnauthorizedKeepsLastGoodListAndAt`), plus E5 |
| INV-4 | token never in logs | pass | E7 greps the daemon's captured output after both a success and a 401. Stronger check done by hand under D9 (the tail buffer is 16 KB, so the grep alone is not exhaustive — the source read is) |
| INV-5 | the poller never calls `Aggregator.Record` | pass | `usagepoll.go` references only `p.modelScoped`; `server.go:159/170` construct two holders with two independent `OnChange` closures |
| INV-6 | a `usageModel` change in one window re-renders the other, in both views | pass | Dedicated E2E with two browser contexts, asserted with B in Focus then in Tiles |
| — | Design-system §5/§6 conformance (mono, 9–11.5 px, `warn` token, "unknown" honesty) | pass | `.usage-model-select` uses `var(--mono)`/`var(--dim)`/`var(--paper)`, 11 px (inside 9–11.5; matches the existing `.model` rule's own hard-coded 11 px — this codebase tokenises colour and family, not size). No hex. `.stale` uses its own dim+dotted signal, never `--rose`/`--amber`. Browser-measured `font-variant-numeric: tabular-nums` on both the readout and its `.num` |

## Hard-Rule Checklist

| # | Rule | Result |
|---|------|--------|
| 1 | Adapter boundary | pass — D3 clean. The endpoint path, headers, Keychain item name and credential JSON shape all live in `internal/claudecode/`. The bare host `https://api.anthropic.com` appears in `cmd/musterd/main.go:78` (the plan's own Affected Files sanctions this flag default) and is duplicated in `internal/server/server.go:22` (Minor 1) |
| 2 | No terminal-output state parsing | pass — no `capture-pane` anywhere in the new code |
| 3 | Non-blocking hook handler | pass — not touched; no hook path changed |
| 4 | tmux always `-L muster` | pass — no tmux invocation added |
| 5 | No payload logging | pass — see D9; the only new log calls carry a fixed error kind and a persist error |
| 6 | No empty-gauge dishonesty | pass — browser-verified: no data → the word `unknown` and **zero** track nodes, never a 0 % bar |
| 7 | Session identity on the tmux target | pass — not touched |
| 8 | No settings trespass | pass — nothing new reads/writes `~/.claude/settings*.json`; no `CLAUDE_CONFIG_DIR` |
| 9 | No real `claude` outside canary/probes | pass — and the near-miss was closed: `cmd/musterd/onexit_test.go:154` now spawns with `-usage-poll 0` + a scratch `-usage-token-file`, and `helpers/daemon.ts:248` passes `-usage-token-file` **unconditionally** for every scratch daemon, so no test can reach the real Keychain or api.anthropic.com |

## E2E Repairs Audit

Both entries in `test-specs.md`'s Repairs table verified against the diff. Both are
strictly additive `toEqual()` literal updates to pre-existing frozen-shape assertions
(`shell.spec.ts` `/api/state`, `views.spec.ts` prefs). Nothing deleted, skipped or
weakened: `shell.spec.ts` still asserts the entire body shape and is now **stricter** —
`modelScopedError` is pinned to its actual `"no-credentials"` value rather than left
loose. No `test.skip`/`test.fixme` introduced anywhere (the only `t.Skip`s in the tree
are pre-existing `curl`/`sh`-on-PATH guards in `settings_shell_test.go`). Fixture
payloads trace to `spikes/canary-fields.md`'s measured capture — no invented field.

## Manual Verification

Drove the built dashboard in Chromium against a real scratch `musterd` and the fake
usage endpoint (the plan's own harness), reading values by hand rather than trusting a
green assertion.

**Confirmed by hand, two-model list (Fable 61 %, Opus 20 %):**
- Child order is exactly `select.lbl usage-model-select`, `span.bar warn`, `span.num`,
  `span.resets` — the `lbl, bar, num, resets` order the plan pins, bar before number.
- `.num` = `61%`; the fill's inline width = `61%`; the bar carries `warn` at 61 (≥ 60).
- Resets suffix rendered `· resets Tue`.
- `font-variant-numeric` computed as `tabular-nums` on the readout **and** its `.num`.
- Pref pointed at an absent model (`"Sonnet"` against a `[Fable]` list): `.num` = `unknown`,
  `.bar` count **0** — INV-2 holds in the real DOM.

**The defect (Critical 1), measured three ways:**
- Tagged the live `<select>` with a `data-` attribute, waited 1.6 s: the attribute was
  gone — `selectNode=REPLACED`. The node is destroyed by the tick.
- Focused the select, waited 1.6 s: `document.activeElement` went `SELECT` → `BODY`.
- Functional control: focus + typeahead `"O"` **within** one tick → value `Opus`, `.num`
  `20%` (works). Focus, wait 1.3 s, same keypress → value still `Fable`, `.num` still
  `61%`, `activeElement` `BODY` (does nothing).

**Not verified:** that the native dropdown popup closes on the tick — Playwright cannot
observe a native `<select>` popup. The popup is anchored to the element, and the element
is provably detached every second, so it follows; but I am recording it as inference,
not measurement. The focus and typeahead results above stand on their own.

## Issues

### Critical

1. **[web-impl]** The model `<select>` is destroyed and rebuilt on every 1 s render tick,
   so it cannot be operated by keyboard and its dropdown cannot stay open —
   `web/src/render/masthead.ts:172` (`el.replaceChildren(select, num)`), reached from
   `web/src/main.ts:193` → `main.ts:594` → `setInterval(render, 1000)` at `main.ts:736`.

   `renderModelWeek` builds a brand-new `<select>` element unconditionally on every pass.
   That is correct and desirable for the two sibling readouts (`renderBucket`'s
   self-healing `replaceChildren` shape), but this readout's label is the first
   **interactive** element inside the per-second re-render path, and rebuilding it throws
   away browser state that only lives on the node: focus, and the open popup.

   Measured (see Manual Verification): after one tick the tagged node is gone, focus has
   moved to `BODY`, and a keypress that changes the value inside one tick does nothing
   after one. A keyboard user cannot select a model at all; a mouse user has under one
   second to open the list and click. E3 passes only because Playwright's `selectOption`
   sets the value programmatically, which never exercises focus or the popup.

   The repo already treats this class as Critical — `views.spec.ts:355` "a live tile stays
   typable across the 1s render tick (REQ-8, Critical 2 regression)" and commit ccac7f1's
   focus preservation across Tiles reorders.

   Fix: reuse the existing `<select>` node when its option list and value are unchanged,
   rebuilding only the `.num` and track (which have no interactive state). Restoring focus
   after the rebuild is the weaker alternative — it fixes the focus symptom but not the
   dropdown, since the popup dies with the node. `pendingTileFocus` in `main.ts` is the
   in-repo precedent for the weaker pattern if it is preferred for consistency.

### Major

1. **[e2e-specs]** No regression test pins the fix for Critical 1 — every existing spec
   drives the select through `selectOption`, which cannot see the defect. Add a spec that
   focuses `#usage-model-week select`, waits past one render tick (> 1 s), and asserts the
   element still holds focus (and, ideally, that the same node instance survives). Author
   it after Critical 1 is fixed. Flagging per the m4-hook-quoting lesson: this is a wave-2
   fix, not a backlog line.
2. **[orchestrator]** `docs/design/design-system.md` masthead order is stale in two places
   — `:110-111` (§4, "identical across both views") and `:146-147` (§5 Components) both
   still read "5-hour bar, 7-day bar, model, daemon health". Per the plan's Doc-upkeep
   note both become "5-hour bar, 7-day bar, model-week (selectable), refresh, model,
   daemon health". (§5's "Gauge thresholds" sentence already generalises to "a masthead
   usage bar", so it needs no edit.) This file is review-work's checklist authority —
   orchestrator edits it, never web-impl.
3. **[orchestrator]** `SPEC.md` carries no entry for this work: §2.3 (second source,
   per-model bar, user-selectable, 5-min poll, refresh), §2.6 (read-only Keychain access;
   threat model unchanged), §9.6 changelog (a second source now exists — still no Go
   interface, two concrete holders), §11. Grepping `SPEC.md` for `modelScoped`/`per-model`/
   `usage-model` returns nothing; §422 and §700 still read "until a second source exists".
4. **[orchestrator]** `TODO.md:398-407`'s Pre-v1 Fable item is not ticked. Decision (b) is
   taken and the third-bar half has shipped; the "add Fable to the launch model select"
   half stays open with the new-session-dialog item.

*(`docs/protocol.md` is already merged — §3.3, new §3.9, §5.4, §5.5 and the 2026-08-30
changelog entry are all present and match the plan's contract. No action.)*

### Minor

1. **[daemon-impl]** `defaultUsageAPIURL` at `internal/server/server.go:22` duplicates the
   flag default in `cmd/musterd/main.go:78`, giving the host two sources of truth; in
   production it is unreachable, since `main` always passes the flag value. It also makes
   `internal/server`'s zero-value config fail *toward* production: a
   `server.Config{UsagePoll: >0}` with neither `UsageAPIURL` nor `UsageTokenFile` set will
   reach the real api.anthropic.com and the real Keychain. No current test does this (all
   poller tests construct `newUsagePoller` directly with an `httptest.Server` and a fake
   reader), and both real-binary spawn paths are now defended — but this is the same shape
   as the `onexit_test.go` near-miss that daemon-tests had to close.
2. **[daemon-impl]** The underlying poll error is discarded entirely —
   `usagepoll.go:112`/`:118` pass only `usageErrorKind(err)` to `SetError`, so an
   `"unreachable"` gives an operator no way to tell a DNS failure from a 500 from a decode
   error. Logging the error at Debug in `tick` would be safe: the token travels in a
   header, so a `url.Error` cannot contain it (and
   `TestFetchUsage_ErrorMessagesNeverContainTheToken` already pins that).
3. **[web-impl]** When the pref names a model absent from a non-null list,
   `masthead.ts:167` sets `select.value = selectedModel`, which finds no matching option
   and leaves `selectedIndex = -1` — the select renders **blank** rather than showing the
   pref name. Browser-measured: `{value:"", selectedIndex:-1, visibleLabel:"(blank)"}`.
   The honest part is correct (`.num` = `unknown`, zero track nodes) and the plan's States
   entry does not pin the label, so this is cosmetic — but a blank control beside the word
   "unknown" reads as broken. Consider prepending a disabled option for the absent pref
   name, as the null/empty-list branch already does.
