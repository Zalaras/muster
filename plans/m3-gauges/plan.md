# Plan: M3 — Gauges

**Created**: 2026-08-23
**Status**: completed
**Work Type**: full-stack
**Description**: Status-line ingestion becomes live data — per-session context gauges, account 5h/7d usage bars, title/model refresh, and persisted `usage_sample` history.

## Overview

M0–M2 already persist and route status-line posts (`type: "status_line"` events, enveloped,
routed by `musterSession`) but interpret them as inert. M3 makes them mean something, in two
independent streams:

1. **Per-session**: the status payload refreshes the session's `title`, `model`
   (`{id, displayName}`), and `context` (`usedPct` / `totalInputTokens` / `windowSize`) —
   surfaced as the card/tile context row (mini gauge + % + absolute tokens + `⟳n`) in both
   Focus and Tiles. Status posts remain **never a state source** (protocol §7.3): they touch
   nothing the state machine owns.
2. **Account-level**: the payload's rate-limit buckets become a neutral, source-tagged
   `Sample` fed to a new `internal/usage` aggregator, which de-duplicates by value, persists
   `usage_sample` rows (history only — no history UI in v1), and broadcasts the `usage` WS
   message. The masthead upgrades from text-only readouts to the design-system gauge bars,
   plus a model readout (freshest sample's model).

Decisions settled in this planning session (2026-08-23, with Damian):
- **Usage-source seam (SPEC §9.6)**: a neutral `Sample` type + one aggregator in
  `internal/usage` — no Go interface type until a second source exists. The seam is the
  `Sample` shape plus the wire's `usage.source` field.
- **No hydration across daemon restart**: account usage starts unknown (null buckets) until
  the next status post. (Per-session context *does* survive restart — it lives on the
  session row like title/state, and is last-known per-session data.)
- **Masthead model readout ships**: the Usage object gains a nullable `model` — whichever
  session posted the freshest sample. Flicker under mixed-model sessions is accepted.
- **Persist-only history**: `usage_sample` rows are written; no history rendering in v1.
- **Warning thresholds**: ≥ 60% turns the context track `hot` and a usage bar `warn`
  (mockup shows 61% warn / 23% plain; no threshold existed in the design system — this
  plan sets it, and `docs/design/design-system.md` §6 gets a line recording it on approval).

## Requirements

### Must Have
- [ ] REQ-1: `internal/claudecode` gains a status-line interpreter producing a neutral
      `StatusUpdate` (no Claude Code field names outside the package): optional title,
      optional model `{id, displayName}`, optional context `{usedPct, totalInputTokens,
      windowSize}`, optional account `usage.Sample`. Field sources and quirks are exactly
      `spikes/canary-fields.md` § "Status-line payload".
- [ ] REQ-2: The context block is adopted **only when the payload's used-percentage is
      non-null**. Before a session's first API response the payload carries null
      percentages with a zero token count (measured) — that must surface as *unknown*
      (all-null context), never as "0%" or "0 tokens".
- [ ] REQ-3: The account sample is produced **only when the rate-limits key is present**
      (it is absent, not empty, before the session's first API response and on API-key
      auth). Epoch-integer reset times convert to `time.Time` inside `internal/claudecode`.
- [ ] REQ-4: `session.Manager` gains `ApplyStatus`: updates title (only when the payload
      carried a name — early posts don't), model id + display name (only when present),
      and context; persists and broadcasts `sessionUpsert` **only when a surfaced field
      actually changed** (status posts fire on every tool use). It never touches `state`,
      `stateSince`, `attention`, `failure`, `alive`, `compactions`, or the permission-mode
      latch (INV-1).
- [ ] REQ-5: New `internal/usage` package: `Sample` (nullable five-hour/seven-day buckets
      `{usedPct float64, resetsAt time.Time}`, model `{id, displayName}`, `sampledAt`,
      `source` — `"subscription"` in v1) and an `Aggregator` with `Record(ctx, Sample)`
      and `Current()`. `Record` updates in-memory state, persists a `usage_sample` row and
      broadcasts the `usage` message **only when bucket values or model changed** since
      the last recorded sample; `sampledAt` alone changing is not a change. This is the
      value-level de-dup that collapses the measured ~435 ms pair posts.
- [ ] REQ-6: Only **routed** status posts (valid envelope naming a known Muster session)
      feed `ApplyStatus` and the aggregator. Unrouted posts persist as events, nothing
      more (trust boundary — same rule as state routing).
- [ ] REQ-7: The aggregator starts unknown at daemon boot — no hydration from persisted
      samples. Snapshot/`usage` carry null buckets, null model, null `sampledAt` until the
      first post-boot sample.
- [ ] REQ-8: Migration `0003`: `usage_sample` table (SPEC §7 columns) + new nullable
      `session` columns for context (used pct, total input tokens, window size) and the
      model display name. Forward-only.
- [ ] REQ-9: `/clear` (clear-rebind) resets the session's context to all-null alongside
      the existing compactions/lastActivity reset — a fresh conversation has no context
      data yet.
- [ ] REQ-10: `event.received_at` is stamped `time.RFC3339Nano` (UTC) from now on
      (M0 review minor; existing second-granularity rows stay as they are — `seq` remains
      the only ordering authority).
- [ ] REQ-11: Masthead usage upgrades to the design-system gauge bars (`a-instrument.html`
      masthead): label + track/fill + rounded % + reset time per bucket, `warn` class at
      ≥ 60%. A null bucket renders the word "unknown" and **no track markup at all**
      (design-system §6.1 rule 1).
- [ ] REQ-12: Masthead gains the model readout: the Usage object's `model.displayName`
      verbatim; rendered as an em-dash–free empty/hidden element while null.
- [ ] REQ-13: Card (Focus rail) and tile (Tiles) context rows render mini track + rounded
      % + compact absolute tokens (`84k` formatting) + existing `⟳n`; `hot` class at
      ≥ 60%. All-null context renders "ctx unknown" with no track; `⟳n` still shows when
      compactions > 0 (it comes from hooks, not the status line).
- [ ] REQ-14: Reset times render compactly: same local day → `resets 14:20`, else
      `resets Fri` (short weekday). Client-side formatting of the RFC3339 wire value.

### Should Have
- [ ] REQ-15: `internal/claudecode/claudecodetest` gains an enveloped full status-line
      builder (post-first-response shape: context values + rate-limit buckets + model +
      session name, all parameterized) so Go tests never hand-write wire bodies (D6's
      legal path); `web/e2e/helpers/payloads.ts` gains the equivalent TS builders for the
      E2E suite.
- [ ] REQ-16: The model display name persists on the session row, so a restarted daemon
      still shows "Haiku 4.5" instead of re-deriving the display name from the id.

### Nice to Have
- [ ] REQ-17: `GET /api/state` (same snapshot object) reflects all of the above with no
      extra work — the E2E oracle reads gauges without a socket.

## Protocol Contract

Delta against `docs/protocol.md` (merged there on approval). Everything is additive; no
version bump.

### WS: daemon→UI `usage` — §5.4 gains `model` and boot/dedup semantics

```jsonc
{ "type": "usage", "usage": {
    "fiveHour": { "usedPct": 61.2, "resetsAt": "2026-08-23T11:00:00Z" },  // null until first post-boot sample
    "sevenDay": { "usedPct": 23.0, "resetsAt": "2026-08-25T06:00:00Z" },  // null as above
    "model": { "id": "claude-opus-5", "displayName": "Opus 5" },  // NEW — freshest sample's model; null iff buckets null
    "sampledAt": "2026-08-23T09:15:31Z",   // null iff buckets null
    "source": "subscription" } }
```

Semantics clarified (replacing §5.4's forwarding note): the daemon broadcasts `usage` only
when bucket values or model **changed** — the ~435 ms pair posts carry identical values and
produce one broadcast and one `usage_sample` row, not two. `sampledAt` advancing alone is
not a change. **No hydration**: after a daemon restart the buckets are null until the next
status post (decided 2026-08-23); `snapshot.usage` follows the same shape.

### §5.3 Session object — M3 value semantics (supersedes the "M1 value semantics" notes)

No shape change. `context.usedPct` / `totalInputTokens` / `windowSize` are non-null from
the session's first status post carrying real context data, all-null before it and again
after `/clear`. `title` refreshes from the status line's session name whenever present
(launch `--name` value until then). `model.id` and `model.displayName` refresh from the
status line's model object whenever present; until then the M1 rules stand. Status posts
change **only** these fields — never `state`/`stateSince`/`attention`/`failure`/`alive`/
`permissionMode`/`compactions` (INV-1).

### §7.3 status-line row

The row's "Implemented in M3" note resolves to: title / model / context refresh via
`ApplyStatus`, account usage via `internal/usage` — **never a state source** (unchanged).

### HTTP

No endpoint changes.

## Schema Changes

Migration `internal/store/migrations/0003_gauges.sql`, forward-only:

```sql
CREATE TABLE usage_sample (
  id                   INTEGER PRIMARY KEY,
  at                   TEXT    NOT NULL,  -- RFC3339Nano UTC, daemon receipt time
  model_id             TEXT    NOT NULL,
  model_display_name   TEXT    NOT NULL,
  five_hour_pct        REAL    NOT NULL,
  five_hour_resets_at  TEXT    NOT NULL,  -- RFC3339 UTC (converted from wire epoch)
  seven_day_pct        REAL    NOT NULL,
  seven_day_resets_at  TEXT    NOT NULL,
  source               TEXT    NOT NULL   -- "subscription" in v1 (the §9.6 seam)
);

ALTER TABLE session ADD COLUMN context_used_pct REAL;             -- NULL = unknown
ALTER TABLE session ADD COLUMN context_total_input_tokens INTEGER;
ALTER TABLE session ADD COLUMN context_window_size INTEGER;
ALTER TABLE session ADD COLUMN model_display_name TEXT;           -- NULL = derive from model id
```

`usage_sample` columns are NOT NULL because a row is only written when the buckets are
present (REQ-3/REQ-5) — a partial sample is never persisted. Column *naming* follows the
wire buckets per SPEC §7; the values stored are the daemon's converted forms (RFC3339
strings, floats). No index needed at this write rate (samples only on value change).

`event.received_at` gains nanosecond precision by stamping format change only (REQ-10) —
no DDL, old rows unchanged, readers parse with `time.RFC3339Nano` (which accepts both).

## UI Specifications

### Views
- **Masthead** (both views, identical — design-system §4): the two usage readouts become
  gauges per `mockups/a-instrument.html` (line 199): `5h` label, 52px-class track with
  fill width = rounded pct, `NN%` number, `· resets …` suffix. New model readout element
  beside them. Daemon-down banner behaviour unchanged (masthead content is stale under
  the banner exactly like the rest of the page — the banner is the signal, M0 rules).
- **Focus rail cards** (`web/src/render/sessions.ts`): the `.r3` context row becomes
  track + `NN%` + `NNk` tokens + `⟳n`, per mockup lines 236–298.
- **Tiles** (`web/src/render/tiles.ts`): the tile header's `.ctxinfo` gets the same
  treatment — same view-model, same formatting helpers (one derivation, two renderers).

### User Flows
1. Launch a session → card shows `ctx unknown`, masthead unchanged.
2. Session's first API response → next status post fills the context row (track + % +
   tokens) and the masthead bars + model readout in one broadcast each.
3. Work proceeds → context row climbs; at ≥ 60% the track goes `hot` (amber); masthead
   bar goes `warn` at ≥ 60%.
4. `/compact` → gauge drops toward 0%, `⟳n` increments (existing behaviour) — the pair is
   the honest signal (SPEC §2.2).
5. `/clear` → context row returns to `ctx unknown`, `⟳n` resets (REQ-9).
6. Daemon restart → masthead bars read unknown until the next status post; session cards
   keep their last-known context (session-row data).

### States
- **No data yet**: masthead — `5h unknown` / `7d unknown`, no track markup, model readout
  empty; cards — `ctx unknown`, no track markup, `⟳n` only when > 0.
- **Data**: as above.
- **Daemon down**: existing full-width banner; no gauge-specific behaviour (values behind
  the banner are visibly stale by design).

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| 5h usage readout | — | `/^5h (\d+%|unknown)/` | existing element upgraded; text keeps the `5h ` prefix so M2-era assertions survive |
| 7d usage readout | — | `/^7d (\d+%|unknown)/` | as above |
| Usage reset suffix | — | `/resets /` | inside each known bucket's readout |
| Masthead model readout | — | model displayName verbatim (e.g. `Haiku 4.5`) | empty/hidden while usage.model is null; e2e-specs picks the locator against the real DOM |
| Card context row | — | `/(\d+% · \d+(\.\d+)?[kM])|ctx unknown/` | `.r3` row in rail cards; `⟳n` appends when compactions > 0 (existing E14 pattern `⟳1` must keep matching) |
| Tile context info | — | same pattern as the card row | Tiles header `.ctxinfo` |
| Context track fill | — | — | presence/absence is the honesty assertion: no track element when unknown; e2e-specs asserts via the track's class/element, not a role |

### Invariants

- **INV-1 (status is never a state source)**: applying a status-line event leaves
  `state`, `stateSince`, `attention`, `failure`, `alive`, `permissionMode`, and
  `compactions` bit-identical — asserted from **every** state (`started`, `planning`,
  `working`, `needs_input`, `failed`, `idle`) and for a dead (`alive:false`) session,
  not just the convenient one. Table-driven in the machine/manager tests.
- **INV-2 (context all-or-nothing)**: on the wire, `context.usedPct`,
  `totalInputTokens`, and `windowSize` are all null or all non-null — guaranteed by
  REQ-2's adoption rule, asserted wherever context crosses a boundary (interpreter out,
  wire out, client parse).
- **INV-3 (no empty gauges)**: a null bucket or null context renders zero track markup —
  asserted in the three surfaces (masthead, rail card, tile) and from both directions
  (fresh load with no data; data present after restart-to-unknown for the masthead).
- **INV-4 (bystanders)**: a status post routed to session B changes nothing on session
  A's wire object and triggers no `sessionUpsert` for A — asserted with ≥ 2 sessions
  live (m2 retro rule: shared-substrate invariants need multi-instance source states).
- **INV-5 (no-change silence)**: a status post whose surfaced values equal current state
  produces no `sessionUpsert` and no `usage` broadcast and no `usage_sample` row.

### Carried-over measurements — re-validation (m2-terminal retro rule)

All status-line facts below were measured against 2.1.233 (spike) / 2.1.237 (probes) in
both headless and tmux-interactive configurations. M3 changes no topology, lifecycle, or
ownership model around them — Claude Code still runs in per-session tmux sessions with the
same `settings.local.json`-registered status-line script — so their configurations are
unchanged and each remains valid as-is:

- Pair posts ~435 ms apart → still the dedup driver (REQ-5); re-checked: valid, ingest
  path unchanged since measurement.
- Rate-limits key absent (not null) pre-first-response; context percentages null with a
  zero token count over the same window → REQ-2/REQ-3; valid, same launch config.
- Session name absent from earliest posts; reflects `--name`/`/rename`/auto-generation
  live thereafter → REQ-4's only-when-present rule; valid.
- `refreshInterval` is seconds and an idle session posts nothing → usage goes stale
  between turns; M3 deliberately does not rely on idle refresh (no requirement reads it).
- Model object `{id, display_name}` shape belongs to the status line only → REQ-1; valid.

## Affected Files

### Daemon
- `internal/claudecode/status.go` (new) — `StatusUpdate` type + `InterpretStatus(payload)`
  (REQ-1/2/3); the only place status-line payload keys are read.
- `internal/claudecode/claudecodetest/` — enveloped full-status builder (REQ-15).
- `internal/usage/` (new package) — `Sample`, `Aggregator` (REQ-5/6/7): dedup, persist,
  broadcast callback; consumed by `internal/server`.
- `internal/session/session.go`, `manager.go`, `machine.go` — context + model-display-name
  fields, `ApplyStatus` (REQ-4), `/clear` context reset (REQ-9), row mapping.
- `internal/store/migrations/0003_gauges.sql` (new) — REQ-8.
- `internal/store/store.go` — RFC3339Nano stamp (REQ-10); `InsertUsageSample` +
  latest-sample read if the aggregator wants one for tests.
- `internal/store/session.go` — new columns in the row round-trip.
- `internal/server/ingest.go` — the worker's status_line branch: `InterpretStatus` →
  `manager.ApplyStatus` + `aggregator.Record` for routed posts (REQ-6).
- `internal/server/server.go`, `state.go`, `ws.go` — aggregator wiring, `usage` broadcast,
  snapshot/`/api/state` carrying real usage.
- `internal/server/sessionwire.go` — context/model fields populated from the session.
- `cmd/musterd/` — wiring only if server construction signature changes.

### Web
- `web/src/protocol.ts` — `Usage` gains nullable `model`; parser updated (context parsing
  exists).
- `web/src/render/masthead.ts` — gauge-bar rendering, warn threshold, reset formatting,
  model readout (REQ-11/12/14).
- `web/src/sessions/` (view-model) + `web/src/render/sessions.ts`, `tiles.ts` — context
  row derivation + rendering (REQ-13); shared formatting helpers (`formatTokens`,
  `formatResets`, threshold constant 60).
- `web/src/style.css` — gauge/track/warn/hot styles per design-system tokens.
- `web/index.html` — masthead template additions (tracks, model readout element).

### E2E
- `web/e2e/gauges.spec.ts` (new) — the E-criteria below.
- `web/e2e/helpers/payloads.ts` — TS status-line builders (REQ-15; e2e-specs owns this
  helper as before).
- No `web/playwright.config.ts` change anticipated; if one becomes necessary it belongs
  to **web-impl** (standing ownership rule).

## Edge Cases

1. **Pre-first-response post** (nulls + zero tokens): context stays unknown; no account
   sample produced (REQ-2/3). A zero token count with null percentage must never render.
2. **Pair posts** (~435 ms, identical values): one broadcast, one `usage_sample` row
   (REQ-5, INV-5).
3. **`/clear`**: context → all-null, compactions reset (REQ-9, existing machine path);
   the next status post of the new conversation refills it.
4. **Daemon restart mid-session**: masthead unknown (REQ-7); session context retained
   from the row; no stale `usage` broadcast fabricated at boot.
5. **Unrouted status post** (missing/unknown envelope): persists as an event, feeds
   nothing (REQ-6) — account data from an untrusted envelope is still untrusted.
6. **Status post for a dead session** (drained queue after pane death): `ApplyStatus`
   applies normally but never resurrects `alive` (INV-1 covers alive; liveness is
   pane-based only).
7. **Hook loss/reordering**: status posts are independent snapshots — loss loses freshness
   only; a straggler applying after newer posts can regress values by design tolerance
   (arrival order is the only order; `seq` processing makes this deterministic).
8. **Multi-session accounts**: sessions on different models interleave samples; the
   masthead model readout follows the freshest sample (accepted flicker); bars are
   account-global regardless of source session (INV-4 protects per-session objects).
9. **Missing model object in a status post** (unobserved but cheap): treat like missing
   name — leave last-known; skip the account sample only if buckets are also absent,
   else record with last-known model… **no**: keep it simple and honest — a sample is
   recorded only when buckets *and* model are present in the same payload (model has been
   present in every capture; if it's ever absent the sample is skipped and logged).
10. **`resets_at` in the past** (clock skew/boundary): render verbatim via the same
    formatting — no special casing; it self-corrects on the next sample.

## Acceptance Criteria

IDs unique across the section — `D*` daemon, `W*` web, `E*` e2e. One clause per criterion.

### Daemon
- **D1**: `make test` passes.
- **D2**: `go build ./...` succeeds.
- **D3**: `make lint` passes.
- **D4**: no Claude Code hook vocabulary outside `internal/claudecode` (standing check).
- **D6**: no status-line payload vocabulary outside `internal/claudecode` (new standing
  check; quoted-key patterns so `usage_sample`'s SPEC-mandated column names don't trip it).
  Test files are **in scope**: Go tests obtain wire bodies from `claudecodetest` builders
  only (REQ-15).
- **D7**: `InterpretStatus` yields all-null context for a pre-first-response payload
  (INV-2's adoption rule).
- **D8**: `InterpretStatus` yields no account sample when the rate-limits key is absent.
- **D9**: the aggregator writes exactly one `usage_sample` row for two identical
  back-to-back samples (INV-5).
- **D10**: the aggregator's boot state is null buckets (REQ-7 — no hydration).
- **D11**: INV-1's table test passes — a status event from every session state (all six,
  plus dead) leaves every state-machine-owned field unchanged.
- **D12**: `/clear` resets context to all-null (REQ-9), asserted alongside the existing
  compactions reset.
- **D13**: `event.received_at` for two immediate inserts differ (nanosecond stamp,
  REQ-10).

### Web
- **W1**: `make web-build` passes.
- **W2**: `make web-test` passes.
- **W3**: no Claude Code snake_case wire vocabulary in `web/src` (the UI speaks only the
  camelCase daemon protocol; `web/e2e/helpers` is deliberately out of scope — it fakes
  Claude Code by design).
- **W4**: no `any` types in new web code.
- **W5**: token formatting: `< 1000` verbatim, `< 1M` as `NNk`, `≥ 1M` as `N.NM`
  (unit-tested pure function).
- **W6**: reset formatting: same local day `resets HH:MM`, else `resets <short weekday>`
  (unit-tested pure function).
- **W7**: a null bucket renders the word "unknown" and no track element (INV-3,
  unit-tested at the render function).
- **W8**: all-null context renders "ctx unknown" and no track element, in both card and
  tile renderers (INV-3).
- **W9**: `warn`/`hot` classes appear at exactly ≥ 60 (threshold unit test at 59/60).

### E2E
- **E1**: a fresh launched session shows `ctx unknown` with no track markup, and the
  masthead shows `5h unknown` / `7d unknown` with no track markup.
- **E2**: a pre-first-response status post (nulls + zero tokens) leaves E1's rendering
  unchanged (null is not 0%).
- **E3**: a full status post renders the card context row (track fill, rounded %, compact
  tokens) in the Focus rail.
- **E4**: the same data renders in the Tiles view's tile header (both hosting views
  asserted — m2 retro rule).
- **E5**: the masthead bars fill with rounded percentages and reset suffixes, and the
  model readout shows the sample's display name.
- **E6**: two identical rapid status posts produce exactly one `usage_sample` row
  (sqlite oracle), and a third with changed values produces a second row.
- **E7**: a status post with a session name updates the card title; one with a model
  object updates the card's model readout.
- **E8**: a status post sent while a session is `needs_input` leaves its state badge and
  timer untouched (INV-1 end-to-end).
- **E9**: with two live sessions, a status post routed to B leaves A's card unchanged
  while the masthead updates (INV-4).
- **E10**: `/clear` (SessionEnd reason clear → SessionStart source clear, synthesized)
  returns the context row to `ctx unknown` and resets `⟳n`.
- **E11**: after `restart()`, the masthead reads unknown until a fresh status post
  arrives, while the session card keeps its last-known context row.
- **E12**: a status post ≥ 60% renders the `hot` context track and, when a bucket is
  ≥ 60%, the `warn` masthead bar.

### Automated Checks

Every line is `<ID> <single-line shell command>` from the project root; pass = exit 0.

```checks
D1 make test
D2 go build ./...
D3 make lint
D4 ! rg -n "hook_event_name" cmd/ internal/ --glob '!internal/claudecode/**'
D6 ! rg -n '"rate_limits"|"used_percentage"|"context_window"|"session_name"|"total_input_tokens"' cmd/ internal/ --glob '!internal/claudecode/**'
W1 make web-build
W2 make web-test
W3 ! rg -n "rate_limits|used_percentage|context_window|total_input_tokens|session_name" web/src
E1 make e2e
```

Scope notes (the negative-grep authoring rules):
- **D6** patterns are the *quoted JSON keys*, so `usage_sample`'s unquoted SQL column
  names (`five_hour_pct`, `seven_day_resets_at` — SPEC §7 naming) never trip it. Go test
  files are in scope; the legal path to wire bodies is `claudecodetest` (REQ-15).
- **W3** is unquoted (TS code has no reason to contain these tokens at all); `web/src`
  includes its unit tests — Vitest tests speak the camelCase daemon protocol, never
  Claude Code's format. `web/e2e` is out of scope because faking Claude Code is its job.
- Dry-run performed 2026-08-23. D6's quoted patterns: clean (only this checks block
  matches, and `plans/` is outside every grep's net). W3's unquoted patterns match only
  the Schema Changes DDL — column identifiers that are copied verbatim **only** into the
  migration file, which lives in D6's scope where the quoted patterns don't match SQL
  identifiers, and never into `web/src`. All prose is worded without the literal tokens,
  so no plan text an agent would echo into a comment trips either check.

### Reviewer-Verified

- **W4**: no `any` types in new web code (read the diff).
- **R1**: INV-3 honesty — no surface anywhere renders a 0%-filled track for unknown data
  (design-system §6.1 rule 1 is a Critical on violation; check the three surfaces).
- **R2**: status-line knowledge stays inside `internal/claudecode` beyond what D6 can
  grep (e.g. structural assumptions like "pairs arrive twice" leaking into server code).
- **R3**: `ApplyStatus` broadcast-on-change actually compares all surfaced fields (title,
  model id, display name, context triple) — a missed field silently spams upserts.
- **R4**: the `usage` broadcast and `usage_sample` write happen on the ingest worker
  goroutine in seq order (no new concurrency introduced around the aggregator).
- **R5**: REQ-14/W6 formatting uses the client's local timezone (the daemon ships UTC).
- **R6**: design-system §6 gains the 60% threshold note; SPEC §11 changelog + TODO ticks
  land (doc-upkeep backstop).

## Implementation Notes

- **The interpreter split**: `Interpret` (state machine's neutral `StateInput`) keeps
  returning inert for `status_line` — the new `InterpretStatus` is a *separate* function
  with a separate output type, so the state machine's vocabulary never grows non-state
  fields. The ingest worker calls both paths for a routed status event: `ApplyStatus`
  then `Record`, sequentially (R4).
- **Payload facts**: field shapes, nullability windows, pair-post cadence, and the title
  behaviours are all in `spikes/canary-fields.md` § "Status-line payload" — implement
  against that inventory, not Claude Code docs.
- **Wire naming discipline**: snake_case stops at `internal/claudecode` (D6); the store's
  column names merely *echo* the bucket naming per SPEC §7 and are written as plain SQL
  identifiers.
- **Masthead markup**: follow `mockups/a-instrument.html` lines 199–202 structurally
  (`.gauge` → `.lbl`/`.bar > i`/`.num`/`.resets`, `.model`), with design-system §1 tokens.
  The card row follows lines 236–298 (`.ctx > i`, `%`, `.tok`, `.compact`).
- **Existing tests to keep green**: masthead unit tests assert the `5h unknown` text
  shape — the upgraded renderer keeps the text content while adding track markup around
  it (the Testable UI Elements table's patterns are chosen to keep M2-era E2E assertions,
  including E14's `⟳n`, matching).
- **The aggregator's broadcast callback** mirrors the manager's `OnUpsert` pattern (nil
  in unit tests).
- **Percentages**: floats end-to-end on the wire; rounding is display-only (protocol §5.4).
