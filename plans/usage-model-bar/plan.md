# Plan: usage-model-bar

**Created**: 2026-08-30
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Description**: Third masthead usage bar — the per-model weekly limit ("Fable") fetched by musterd from Claude Code's `/api/oauth/usage` endpoint, user-selectable model, refresh button.

## Overview

The masthead shows the 5-hour and 7-day bars from the status line's `rate_limits`. Claude Code's
`/usage` shows a third bar — the per-model weekly limit, labelled "Fable 5 limit" today. The
2026-08-30 probe (`spikes/FINDINGS.md` "per-model usage bucket probe") settled that this window is
**explicitly filtered out of the status-line JSON** on 2.1.251, and that `/usage` gets it from
`GET https://api.anthropic.com/api/oauth/usage` with the subscription OAuth token
(`spikes/canary-fields.md` `rate_limits` section has the measured request/response). So musterd
fetches it itself: a **second usage source**, the seam SPEC §9.6 reserved.

Decisions taken with Damian 2026-08-30 (don't re-derive): the wire carries a **dynamic list** of
model-scoped windows; the masthead shows **one**, chosen by a `<select>` and persisted as a pref,
default `"Fable"`; polling every **5 min** plus a **refresh button**; musterd reads the Claude Code
OAuth token from the macOS Keychain item `Claude Code-credentials`, **read-only** (never logged,
persisted or refreshed). A failed fetch keeps the last-good bar and labels it stale
(design-system honesty rule "stale is labelled, not hidden"); no data yet renders "unknown" with
no track (rule 1).

Architecture: Claude-Code-format knowledge (Keychain item, endpoint, response shape) lives in
`internal/claudecode` and returns a neutral `UsageReport`; `internal/usage` gains a second holder
`ModelScoped` (own mutex/dedup/persist-first ordering) rather than widening `Sample`, so
`Aggregator.Record`'s single-writer assumption (`aggregator.go:62-67`) stays true; the poller in
`internal/server` maps at the seam exactly as `processStatus` does for the status line.

## Requirements

### Must Have
- [ ] REQ-1: musterd polls the usage endpoint every `-usage-poll` (default `5m`; `0` disables) starting with an immediate fetch on `Start`, and records the `weekly_scoped` windows as `ModelScoped`.
- [ ] REQ-2: the OAuth token is obtained by running `security find-generic-password -a "<user>" -w -s "Claude Code-credentials"` and reading `claudeAiOauth.accessToken`; the token value is never written to the log, the DB or the wire, and musterd never writes to the Keychain or refreshes the token.
- [ ] REQ-3: the request is `GET <base>/api/oauth/usage` with `Authorization: Bearer <token>`, `anthropic-beta: oauth-2025-04-20`, `Content-Type: application/json`, 5 s timeout; `<base>` is `-usage-api-url` (default `https://api.anthropic.com`).
- [ ] REQ-4: decode reads `limits[]` entries with `kind == "weekly_scoped"` and a non-empty `scope.model.display_name` into `{displayName, usedPct: percent, resetsAt}`; `resets_at` accepts RFC3339 (with fractional seconds and any offset — the measured form) **or** integer epoch seconds; unknown keys ignored; other `kind`s ignored.
- [ ] REQ-5: `ModelScoped` dedups on the full list (sorted by displayName) — an identical list produces no broadcast and no rows; a changed list persists one `usage_model_sample` row per window **before** committing to memory and broadcasting `usage`.
- [ ] REQ-6: a failed poll (no credentials / 401-403 / network / bad body) leaves the last-good list in place and sets `usage.modelScopedError` to `"no-credentials" | "unauthorized" | "unreachable"`; the next successful poll clears it to null. Logged at Warn once per distinct error kind, Debug for repeats.
- [ ] REQ-7: `POST /api/usage/refresh` wakes the poller immediately (coalesced: at most one in-flight fetch); `202` no body; `404 not_found` when polling is disabled.
- [ ] REQ-8: `prefs.usageModel` (string, default `"Fable"`, 1–32 chars) is accepted by `PUT /api/prefs`, persisted with view/density, present in `snapshot.prefs` and the `prefs` echo.
- [ ] REQ-9: the masthead renders a third readout after the 7-day bar: a `<select>` label listing every `modelScoped[].displayName`, then the selected model's bar/percent/resets using the existing `renderUsageTrack` shape and the ≥ 60% `warn` rule.
- [ ] REQ-10: "unknown" with **zero track markup** when `modelScoped` is null, or when the selected model is not in the list.
- [ ] REQ-11: when `modelScopedError` is non-null the readout keeps the last-good bar and gains class `stale` with `title` = the error word.
- [ ] REQ-12: changing the `<select>` PUTs `{usageModel}` and re-renders; a `↻` refresh button beside the readout POSTs `/api/usage/refresh` and is `aria-busy="true"` until the next `usage` message or 5 s.
- [ ] REQ-13: E2E and Go tests never touch the real Keychain or api.anthropic.com — `-usage-token-file <path>` (empty = Keychain) and `-usage-api-url` are the seams; the E2E harness runs a fake usage endpoint.
- [ ] REQ-14: `usage.modelScopedAt` (RFC3339, last successful fetch) is on the wire; null iff `modelScoped` null (INV-1 depends on it).

### Should Have
- none

### Nice to Have
- none

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). Additive; no version bump.

### WS: daemon→UI `usage` (§5.4 — four new fields)
```jsonc
{ "type": "usage", "usage": {
    "fiveHour": { /* unchanged */ }, "sevenDay": { /* unchanged */ }, "model": { /* unchanged */ },
    "sampledAt": "…", "source": "subscription",
    "modelScoped": [                                    // null until the first successful fetch; then the full list, sorted by displayName
      { "displayName": "Fable", "usedPct": 61.0, "resetsAt": "2026-09-01T13:59:59Z" } ],   // usedPct float 0–100; resetsAt RFC3339 UTC
    "modelScopedAt": "2026-08-30T10:00:00Z",           // null iff modelScoped null; last successful fetch
    "modelScopedError": null,                           // null after a successful fetch; "no-credentials" | "unauthorized" | "unreachable" after a failed one — modelScoped keeps the last-good list
    "modelScopedSource": "subscription-api" } }         // constant in v1
```
Sent (full object, like today) whenever either source changes: a status-line sample change **or**
a `modelScoped` list change **or** a change of `modelScopedError`. `snapshot.usage` carries the same
fields. No hydration after restart (both halves null until their source next delivers). An empty
list `[]` is a valid successful fetch (account has no scoped windows) and is distinct from null.

### WS: daemon→UI `prefs` (§5.5) and `snapshot.prefs`
```jsonc
{ "type": "prefs", "prefs": { "view": "tiles", "density": "3x2", "usageModel": "Fable" } }
```
Default before any PUT: `{"view":"focus","density":"2x2","usageModel":"Fable"}`.

### HTTP: PUT /api/prefs (§3.3 — new optional field)
**Request:** adds `"usageModel": "Fable"` — optional string, 1–32 chars after trim.
**Errors:** 400 `invalid_request` when present and empty or > 32 chars. Otherwise unchanged.

### HTTP: POST /api/usage/refresh (new §3.9)
**Auth**: UI cookie (401 `unauthorized`).
**Request:** no body.
**Response 202:** no body. The fetch runs asynchronously; the result arrives as a `usage` message.
**Errors:** 404 `not_found` — polling disabled (`-usage-poll 0`).

## Schema Changes

Migration `internal/store/migrations/0005_usage_model.sql` (forward-only):
```sql
CREATE TABLE usage_model_sample (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL,   -- RFC3339Nano UTC, daemon fetch time
  display_name  TEXT NOT NULL,
  pct           REAL NOT NULL,
  resets_at     TEXT NOT NULL,   -- RFC3339 UTC
  source        TEXT NOT NULL    -- "subscription-api"
) STRICT;
```
Rows are written only on list change (REQ-5), one per window, same `at`. No history UI (as for
`usage_sample`). Prefs stay in the kv JSON blob — no schema change for `usageModel`.

## UI Specifications

### Views
- Masthead (both views): `…, #usage-5h, #usage-7d, #usage-model-week, #usage-refresh, #usage-model, #claude-version, #connection-status`.
  Markup added to `web/index.html` right after `#usage-7d`:
  ```html
  <span id="usage-model-week" class="usage-readout"></span>
  <button id="usage-refresh" class="btn sm" type="button" aria-label="Refresh usage" title="Refresh usage">↻</button>
  ```
  `#usage-model-week` is rebuilt every render pass as `[select.lbl.usage-model-select, .num]`, then
  `renderUsageTrack` inserts `.bar` before `.num` and appends `.resets` when a bucket is known —
  identical child order to the two existing readouts (`lbl, bar, num, resets`).
  The `<select>` has `aria-label="Usage model"`; one `<option>` per `modelScoped[].displayName`
  (value = displayName). When `modelScoped` is null or empty the select still exists with a single
  option for the current pref (so the label reads e.g. "Fable") and is `disabled`.

### User Flows
1. Load dashboard → readout shows `Fable` `unknown` until the poller's first fetch lands (≤ a few seconds) → bar + `61%` + `· resets Tue`.
2. Choose another model in the select → `PUT /api/prefs {usageModel}` → `prefs` echo → readout re-renders for that model (and a second window follows).
3. Click ↻ → `POST /api/usage/refresh` → button `aria-busy` → `usage` message → button idle, bar updated.
4. Fetch fails (token missing, 401, offline) → bar stays, readout gains `.stale` + `title="unauthorized"` (etc.); next success clears it.

### States
- No data yet: label select (disabled, single option = pref) + `unknown`; no `.bar`, no `<i>`, no `.resets`.
- Data: as flow 1. `warn` at ≥ 60%.
- Selected model absent from a non-null list: `unknown` (no track), select enabled listing what exists.
- Stale: last-good bar + `.stale` on `#usage-model-week`.
- Daemon down: existing banner; readout keeps its last render (as the other two do).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Model-week readout container | — | `#usage-model-week` | `.usage-readout`; `.stale` class when `modelScopedError` non-null |
| Model select | `combobox` | `Usage model` | `aria-label`; options' text = displayName; `disabled` when list null/empty |
| Percent | — | `#usage-model-week .num` → `61%` or `unknown` | rounded like the other bars |
| Track fill | — | `#usage-model-week .bar > i` | absent when unknown; `.bar.warn` at ≥ 60 |
| Resets | — | `#usage-model-week .resets` → `· resets …` | `formatResets` output, leading middot + space as in existing bars |
| Refresh button | `button` | `Refresh usage` | `aria-busy="true"` while a refresh is pending |

### Invariants
- **INV-1**: `modelScopedAt` is null iff `modelScoped` is null — assert after: boot, first success, failure-after-success, success-after-failure, `[]` result.
- **INV-2**: `#usage-model-week` contains no `.bar`/`i`/`.resets` node whenever `.num` reads `unknown` — assert from: boot, known→unknown (selected model removed from list), known→unknown via pref change to an absent model.
- **INV-3**: a failed poll never changes `modelScoped`/`modelScopedAt` — assert from: never-fetched (stays null), and after a good list (stays that list).
- **INV-4**: the token never appears in logs — assert by grepping the daemon's captured stderr in the E2E run for the fake token string.
- **INV-5**: the poller never calls the status-line `Aggregator.Record` — both holders keep one writer each.
- **INV-6**: with two dashboard windows open, a `usageModel` change in one re-renders the other's readout via the `prefs` echo — assert from both views (Focus and Tiles), since the masthead hosts the readout in both.

## Affected Files

### Daemon
- `internal/claudecode/credentials.go` — `TokenReader` func type; `KeychainTokenReader(user string, run execFunc) TokenReader` shelling out to `security`; `FileTokenReader(path)`; parses `claudeAiOauth.accessToken`; `ErrNoCredentials`.
- `internal/claudecode/usageapi.go` — `FetchUsage(ctx, *http.Client, baseURL, token) (UsageReport, error)`, `ErrUnauthorized`; pure `InterpretUsageReport([]byte) (UsageReport, error)`; `UsageReport{ModelScoped []UsageWindow}`, `UsageWindow{DisplayName, UsedPct, ResetsAt time.Time}`.
- `internal/usage/modelscoped.go` — `ModelWindow`, `ModelScoped` holder (`Record(ctx, []ModelWindow) error`, `SetError(kind string)`, `Current() ModelSnapshot`), dedup, persist-before-commit, `OnChange`.
- `internal/usage/usage.go` — `Snapshot` unchanged for the status-line half; new `ModelSnapshot{Windows []ModelWindow; At *time.Time; Error *string; Source string}`.
- `internal/store/migrations/0005_usage_model.sql`; `internal/store/usage.go` — `UsageModelSampleRow`, `InsertUsageModelSamples(ctx, []UsageModelSampleRow)` in one tx.
- `internal/server/usagepoll.go` — poller (`Start`/`Stop(ctx)`/`Refresh()`), maps `UsageWindow` → `usage.ModelWindow`, error-kind mapping, once-per-kind Warn.
- `internal/server/usage.go` — `handleUsageRefresh`; route registration where the other `/api` routes live.
- `internal/server/usagewire.go`, `internal/server/state.go` — `UsageInfo` gains `ModelScoped []UsageModelWindow` (nil→`null`), `ModelScopedAt *string`, `ModelScopedError *string`, `ModelScopedSource string`; `toWireUsage(snap, model)` remains the single mapping point; `currentSnapshot` passes both holders.
- `internal/server/server.go` — `Config` gains `UsagePoll time.Duration`, `UsageAPIURL string`, `UsageTokenFile string`, `HTTPClient *http.Client`; constructs `ModelScoped` with an `OnChange` that broadcasts the merged `usage` message; starts/stops the poller.
- `internal/server/prefs.go` — `PrefsInfo.UsageModel`, default `"Fable"`, validation, merge.
- `cmd/musterd/main.go` — flags `-usage-poll` (duration, default 5m, 0 disables), `-usage-api-url` (default `https://api.anthropic.com`; help text marks it a test seam like `-claude-bin`), `-usage-token-file` (empty = macOS Keychain; help text marks it a test seam).

### Web
- `web/index.html` — the two new elements (UI spec).
- `web/src/protocol.ts` — `ModelWindow`, `Usage.{modelScoped, modelScopedAt, modelScopedError, modelScopedSource}`, `UNKNOWN_USAGE` extension, strict `parseUsage` (malformed element rejects the message; absent keys → null for pre-plan daemons), `Prefs.usageModel` + `parsePrefs` (missing → `"Fable"`).
- `web/src/api.ts` — `PrefsRequest.usageModel`, `refreshUsage(): Promise<ApiResult<null>>`.
- `web/src/render/masthead.ts` — `renderModelWeek(el, usage, selectedModel, now)`; `UsageElements.modelWeek`; reuse `renderUsageTrack`.
- `web/src/main.ts` — element handles, `renderUsageBlock` calls `renderModelWeek` with `currentPrefs.usageModel`; select `change` → `putPrefs`; ↻ click → `refreshUsage` + `aria-busy` timer cleared on next `onUsage`.
- `web/src/style.css` — `.usage-model-select` (mono, no chrome, inherits `.lbl` colour), `.usage-readout.stale` (dimmed number + dotted underline), `#usage-refresh` sizing.

### E2E (e2e-specs)
- `web/e2e/helpers/daemon.ts` — spawns with `-usage-poll <short>`, `-usage-api-url http://127.0.0.1:<fake>`, `-usage-token-file <scratch>/token`; new `web/e2e/helpers/usageapi.ts` fake endpoint (Node `http`) with a settable response/status and a request counter.
- `web/e2e/gauges.spec.ts` (or a new `usage-model.spec.ts`) — E1–E6 below; `helpers/gauges.ts` gains `mastheadModelWeek*` locators.

## Edge Cases

The standing hook cases (loss, duplication, reordering, `/clear` rebind, pane death without
`SessionEnd`) do not apply — nothing here consumes hooks or session state; the two usage
sources are independent holders merged at broadcast time (case 10).

1. Keychain item absent (fresh Mac, logged out) → `ErrNoCredentials` on every tick → `modelScopedError:"no-credentials"`, list null, one Warn total; feature is effectively off, UI honest.
2. `security` prompts for access (first run on a new binary build could trigger a macOS dialog) → treated as exec failure/timeout (2 s exec timeout) → `no-credentials`; note in Implementation Notes for Damian to click Always Allow once.
3. Token expired → 401 → `unauthorized`; Claude Code refreshes the Keychain item itself on its next run — musterd re-reads the file/Keychain on **every** tick, never caches beyond one tick.
4. Endpoint returns 200 with no `limits` key or `[]` → success with empty list → `modelScoped: []`, select disabled, `unknown`.
5. Server adds a second `weekly_scoped` model → list grows → select gains an option; the pref keeps pointing at Fable.
6. Selected pref names a model no longer returned → `unknown`, no track (INV-2); select lists the current models so the user can re-pick.
7. Two refresh clicks in quick succession → one fetch (coalesced); second `202` still returned.
8. Refresh during an in-flight tick → no second fetch; the pending result satisfies both.
9. Daemon restart → `modelScoped` null until the immediate first tick (seconds), unlike the status-line half which waits for a post. No hydration from `usage_model_sample`.
10. Status-line `usage` broadcast and `modelScoped` broadcast interleave → each broadcast carries the merged full object built from both holders' `Current()` at send time, so ordering cannot lose either half.
11. Endpoint slow → 5 s timeout → `unreachable`; the ticker is not blocked (fetch runs inside the loop goroutine but a tick's work is bounded by the timeout).
12. `resets_at` arrives with `+00:00` and microseconds (measured) → `time.Parse(time.RFC3339Nano)` handles it; emitted to the wire as UTC `RFC3339`.
13. Pre-plan client (older tab) receives new fields → ignored by its `parseUsage`; new client on an old daemon (fields absent) → nulls, `unknown`.
14. `-usage-poll 0` → poller not constructed; `POST /api/usage/refresh` 404; wire fields present but null/`"subscription-api"`.

## Acceptance Criteria

### Daemon
- **D1**: `make test` passes.
- **D2**: `make lint` passes.
- **D3**: no rate-limit or credential vocabulary (`claudeAiOauth`, `Claude Code-credentials`, `weekly_scoped`, `oauth/usage`) appears outside `internal/claudecode/` (tests included — Go tests in other packages use the neutral types).
- **D4**: `internal/usage` and `internal/store` do not depend on `internal/claudecode` (`go list -deps`).
- **D5**: `InterpretUsageReport` unit tests cover RFC3339-with-offset and epoch `resets_at`, missing `limits`, non-`weekly_scoped` kinds, null `display_name`, unknown top-level keys.
- **D6**: `ModelScoped.Record` persist-failure test mirrors `TestAggregator_Record_PersistFailureLeavesMemoryUnchanged`.
- **D7**: poller tests (fake token reader + `httptest.Server`) cover success, 401 → `unauthorized` with list kept, 5xx/connection refused → `unreachable`, refresh coalescing, and INV-1/INV-3 from every listed source state.
- **D8**: `KeychainTokenReader` is tested only via an injected exec func; no test executes `security`.
- **D9**: the token string never appears in any log line (reviewer reads every log call in `usagepoll.go`/`credentials.go`/`usageapi.go`).
- **D10**: `PUT /api/prefs` accepts/validates `usageModel` and echoes it (handler test).

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: no `any` types in new web code.
- **W4**: Vitest: null list → `unknown` with zero track nodes; selected model absent → same; bar child order `lbl(select), bar, num, resets`; `warn` at 60; `.stale` + `title` on error; select options equal displayNames; select disabled when null/empty.
- **W5**: `parseUsage` rejects a malformed `modelScoped` element and treats absent fields as null (unit test).

### E2E
- **E1**: with the fake endpoint returning a Fable 61% window, the readout shows the select reading `Fable`, `.num` `61%`, a `.bar.warn > i`, and `.resets` starting `· resets`.
- **E2**: before the first fetch completes (fake endpoint held), the readout reads `unknown` with no `.bar`/`i`/`.resets`.
- **E3**: choosing a second model in the select re-renders to that model's percent and survives a reload (pref persisted; `prefs` message carries `usageModel`).
- **E4**: clicking `Refresh usage` causes a second request at the fake endpoint within 1 s and the button is `aria-busy` until the `usage` message lands.
- **E5**: fake endpoint switched to 401 then refreshed → `.num` keeps the last percent, container gains `.stale` with `title="unauthorized"`; switched back to 200 → `.stale` gone.
- **E6**: daemon started with `-usage-poll 0` → readout `unknown`, `POST /api/usage/refresh` returns 404.
- **E7**: the daemon's captured stderr for the whole run never contains the fake token string (INV-4).
- **E8**: `make e2e` passes.

### Automated Checks

```checks
D1 make test
D2 make lint
D3 ! rg -n "claudeAiOauth|Claude Code-credentials|weekly_scoped|oauth/usage" cmd/ internal/ --glob '!internal/claudecode/**'
D4 ! go list -deps ./internal/usage ./internal/store | rg -q 'muster/internal/claudecode'
W1 make web-build
W2 make web-test
E8 make e2e
```

D3 scope: test files **are** in the net; tests outside `internal/claudecode` must build fixtures
from the neutral `UsageReport`/`ModelWindow` types. E2E fixtures (`web/e2e/**`) are outside the
grep's paths and may contain the wire keys. Dry run against this plan: the plan document itself is
not under `cmd/` or `internal/`, so it cannot trip D3.

### Reviewer-Verified

- **D5**, **D6**, **D7**, **D8**: read the named tests and confirm each listed case exists.
- **D9**: read every log call in `usagepoll.go`, `credentials.go`, `usageapi.go`.
- **D10**: read the prefs handler test.
- **W3**, **W4**, **W5**.
- **E1**–**E7**: run by `make e2e` (E8), but the reviewer confirms each spec body asserts exactly the stated DOM, not a weaker proxy.
- **INV-1**–**INV-6**: confirm each is asserted from every listed source state.
- Design-system §5/§6 conformance of the new readout (mono, 9–11.5px, `warn` token, "unknown" honesty).

## Implementation Notes

- **Measured facts to code against** (`spikes/canary-fields.md`, 2026-08-30 live call): `resets_at` is `"2026-09-01T13:59:59.522599+00:00"` — RFC3339Nano with offset; `percent` is an integer; `scope.model.id` is null (use `display_name` as the identity); many unrelated top-level keys exist — decode into a struct with only the fields needed.
- **Re-checked carried-over measurement**: the status-line `rate_limits` facts are unchanged by this plan — the new source is additive and the status-line holder is untouched.
- Poller pattern: copy `internal/session/manager.go:126-151` (`Start`/`Stop(ctx)` with `wg` + deadline Warn) and `:715-726` (ticker loop). Add a `refresh chan struct{}` (cap 1) selected alongside the ticker; `Refresh()` does a non-blocking send.
- Persist-first ordering: copy `internal/usage/aggregator.go:47-90` including the comment explaining why the write precedes the commit.
- Keychain read: `exec.CommandContext(ctx, "security", "find-generic-password", "-a", user, "-w", "-s", "Claude Code-credentials")`, 2 s ctx timeout, stderr discarded; output trimmed then JSON-decoded into `struct{ ClaudeAiOauth struct{ AccessToken string } }`. `user` from `os/user.Current()` in `main`, passed in.
- If macOS prompts for Keychain access on first run, Damian clicks **Always Allow** once for `musterd`; document in `docs/dev-loop` notes / `README` if one exists.
- Error kinds: `ErrNoCredentials` → `no-credentials`; `ErrUnauthorized` (401/403) → `unauthorized`; anything else (timeout, DNS, 5xx, decode error) → `unreachable`.
- Web: `renderModelWeek` must `replaceChildren(select, num)` first and then call `renderUsageTrack` — that is what makes the known→unknown transition self-healing (see `renderBucket`'s doc comment).
- `aria-busy` timer: clear on the next `onUsage` callback or after 5 s, whichever first.
- **Doc upkeep (orchestrator)**: `docs/protocol.md` delta merged on approval (§3.3, new §3.9, §5.4, §5.5, §9 changelog); `docs/design/design-system.md` §5 masthead order becomes “5-hour, 7-day, model-week (selectable), refresh, model, health” and the threshold sentence covers the third bar — orchestrator edits it, never web-impl (it is review-work's checklist authority); SPEC §2.3 (second source, per-model bar, user-selectable, 5-min poll, refresh), §2.6 (read-only Keychain access; threat model unchanged — a local process could already read the item), §9.6 changelog (second source exists; still no Go interface — two concrete holders), §11 entry; `TODO.md` Pre-v1 Fable item: decision (b) taken, tick when shipped (the "add Fable to the launch model select" half stays with the new-session-dialog item); `spikes/canary-fields.md` already carries the endpoint facts.
- Subscription cost: none — `/api/oauth/usage` is not a model call.
