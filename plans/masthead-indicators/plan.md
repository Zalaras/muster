# Plan: masthead-indicators

**Created**: 2026-10-12
**Status**: completed
**Work Type**: full-stack
**E2E Scope**: new-specs
**Fixture plan**: masthead-indicators.spec.ts daemon (asserts account usage, which is daemon-global, and kills the daemon for the down dot); masthead-update-dot.spec.ts startDaemon (the update-restart dot needs the fake release server and updater options computed in the test, as `update.spec.ts` does)
**Features**: usage, connection
**Touches**: rail, surfaces
**Description**: The masthead drops its model readout, shows every usage window's reset as a bracketed time (with a weekday when not today), and turns the connection text into a coloured health dot with the detail on hover.

## Overview

Three masthead issues (#79, #80, #85), all in the `### Together — masthead indicators` group in `TODO.md`.

**#85, the model readout.** `#usage-model` shows the model from the freshest status-line sample
(kb:adr/usage-masthead-model-from-freshest-sample). It labels the account-wide bars with "the
model that last used the account". Since the per-model weekly bar got its own model selector
(kb:adr/usage-masthead-one-selectable-model-window) the label does almost nothing, and it reads as
a launch model that never changes. The developer chose the ADR's option A instead: no model in the
masthead, only per session. The readout goes, and so does the `usage.model` field on the wire. The
daemon still records the model in `usage_sample` history and still dedups on it
(kb:adr/usage-sample-dedup-by-value, kb:adr/usage-history-persisted-not-rendered); only the wire
and the UI drop it.

**#80, reset times.** All three bars already show a reset, but as a dot-separated `resets 14:00` (same day) or
`resets Fri` (another day), so the 7-day and model-week bars never show a time. The suffix
becomes `(14:00)` for the same local day and `(15:59 Tue)` for any other day. No wire change:
`resetsAt` is already on every bucket and window.

**#79, connection.** The `connected` / `connecting…` / `reconnecting…` text becomes a dot: green
when connected, yellow while connecting for the first time or while musterd restarts for an update
the dashboard started, red once the connection is lost. Hover gives the detail. The dashboard can
only tell a restart is coming when it applied the update itself; a manual restart or a crash looks
the same as a lost connection, so it is red. The existing word stays in the element as
screen-reader-only text, so `role="status"` keeps announcing it and every spec that waits for
`connected` keeps working. The dot gets its own colour tokens, not the reserved state colours
(design-system §1, §3; kb:adr/theme-banner-tokens-not-rose).

## Requirements

### Must Have
- [ ] REQ-1: The masthead shows no model readout: `#usage-model` is gone from the page.
- [ ] REQ-2: The `usage` object on the wire (`kb:anchor/ws.usage`, in both the `usage` message and the snapshot / `GET /api/state`) has no `model` key.
- [ ] REQ-3: Account usage history is unchanged: a sample is still recorded only from a routed status post carrying both buckets and the model, with the model persisted in `usage_sample`, and still deduplicated on bucket values and model.
- [ ] REQ-4: Each known usage readout (`#usage-5h`, `#usage-7d`, `#usage-model-week`) shows its reset as `(HH:MM)` when `resetsAt` falls on the same local calendar day as now, and as `(HH:MM Ddd)` otherwise. The time is 24-hour, zero-padded, local time; `Ddd` is the short weekday from `toLocaleDateString(undefined, { weekday: "short" })`. No `resets` word and no `·` separator.
- [ ] REQ-5: An unknown bucket still shows no reset text and no track (kb:adr/usage-unknown-renders-word-not-track); unchanged.
- [ ] REQ-6: `#connection-status` shows a dot whose colour follows the health state: `ok` (connected), `pending` (connecting before the first hello, or the dashboard's own update restart while its restart banner shows the updating text), `down` (reconnecting after a hello, outside that update window).
- [ ] REQ-7: `#connection-status` keeps `role="status"`. Its text content is the screen-reader word, visually hidden: `connected`, `connecting…` or `reconnecting…` (the present `ConnectionStatus` words, unchanged).
- [ ] REQ-8: `#connection-status` has a `title` with the hover detail for its health state (texts in Testable UI Elements).
- [ ] REQ-9: `#connection-status` has a `data-health` attribute of `ok`, `pending` or `down` (the E2E handle for the colour).
- [ ] REQ-10: The dot's three colours are three new semantic tokens defined in every theme block; no state token (`--amber`, `--rose`, `--teal`, `--violet`, `--idle`) and no raw colour in the component rule.
- [ ] REQ-11: The masthead stays one row with no wrapped text at 1512px and 1440px viewports, every gauge known, the model-week selector showing and other-day resets on all three bars.

### Should Have
- [ ] REQ-12: Each reset suffix has a `title` giving the full local reset date and time (e.g. `Resets Tue 13 Oct, 15:59`, any `toLocaleString` rendering that includes weekday, date and time).

### Nice to Have
- none

## Protocol Contract

Delta against `docs/protocol.md`, anchor `kb:anchor/ws.usage` (the Usage object & `usage`
message). Removing a field an old open tab already treats as optional does not change any existing
field's shape, so **no protocol version bump** (kb:adr/connection-protocol-bumps-only-on-shape-change).

### WS: daemon→UI `usage` (and the `usage` object in `snapshot` / `GET /api/state`)

The `model` line is removed. The object becomes:

```jsonc
{ "type": "usage", "usage": {
    "fiveHour": { "usedPct": 61.2, "resetsAt": "2026-08-20T11:00:00Z" },  // null until the first post-boot sample → masthead "unknown"
    "sevenDay": { "usedPct": 23.0, "resetsAt": "2026-08-22T06:00:00Z" },  // wire name seven_day; null as above
    "sampledAt": "2026-08-20T09:15:31Z",   // null iff buckets null
    "source": "subscription",
    "modelScoped": [ { "displayName": "Fable", "usedPct": 61.0, "resetsAt": "2026-09-01T13:59:59Z" } ],
    "modelScopedAt": "2026-08-30T10:00:00Z",
    "modelScopedError": null,
    "modelScopedSource": "subscription-api" } }
```

Prose changes under the same anchor:
- "The daemon records a sample only when bucket values or model **changed**" stays true. A change
  in the model alone still records a `usage_sample` row and still sends a `usage` broadcast, whose
  wire content equals the previous one apart from `sampledAt` (re-stamped per recorded sample; *Amended*, review cycle 1 correctness Major 1). Clients replace the object whole, so the repeat is
  harmless.
- "A sample is recorded only from a routed status post … carrying both buckets and the model in
  the same payload" stays true (the model is still read for history).

No other message or endpoint changes. `docs/features/connection/contract.md` and
`docs/features/usage/contract.md` regenerate from this.

## Schema Changes

No schema changes required. `usage_sample.model_id` / `model_display_name` keep being written.

## UI Specifications

Governing docs: `docs/design/design-system.md` §1 (tokens; the `--green` health-dot note), §3
(state colour is meaning), §5 Masthead, §6 Honesty rules (§6.1 unknown, §6.7 daemon-down);
`docs/design/ux-flows.md` "Degraded and honest states"; reference render
`docs/design/mockups/a-instrument.html` (`.health .dot`, lines 180–190, 347: a 6px round dot).

### Views
- Masthead right group, both views. Order after this plan: 5h, 7d, model-week, refresh, Issue,
  Settings, Claude Code version, health dot. `#usage-model` is gone.
- Reset suffix: still the `.resets` element appended after the bar of each known readout, still
  `--fg-dim`. Only its text changes (REQ-4), plus a `title` (REQ-12).
- Health dot: `#connection-status` holds a round dot (the mockup's 6px `.health .dot`), coloured
  by `data-health`, plus the visually hidden word (`.sr-only`, which exists in `style.css`).
  No visible text.

### User Flows
1. The developer hovers the dot → the native tooltip shows the detail for the current health.
2. The developer clicks Update and restart in Settings → the dot turns yellow while the update
   banner reads updating → green on the new daemon's hello. If the restart misses the banner's
   30 s window, the banner falls back to the unreachable text and the dot turns red with it.
3. musterd dies or is restarted by hand → the dot turns red with the daemon-down banner → green
   on reconnect.

### States
- No data yet: unknown buckets show `unknown`, no track, no reset text (unchanged). The dot is
  yellow (`pending`, `connecting…`) until the first hello, with no banner (kb:adr/connection-banner-only-after-first-hello).
- Daemon down: the dot is red (`down`) and agrees with the daemon-down banner; gauges keep their
  last values (unchanged).
- Data: green dot; every known readout shows `NN%`, its bar and `(HH:MM)` / `(HH:MM Ddd)`.

### Testable UI Elements

| Element | Role | Name / Text Pattern | Notes |
|---------|------|---------------------|-------|
| Connection health | `status` | text content exactly `connected`, `connecting…` or `reconnecting…` | `#connection-status`; the word is visually hidden, the dot is the visible part |
| Connection health colour | — | `data-health` = `ok` \| `pending` \| `down` | on `#connection-status` |
| Connection health hover | — | `title` = `Connected to musterd` (ok, connected) · `Connecting to musterd…` (pending, connecting) · `Restarting musterd for an update…` (pending, update) · `musterd unreachable — reconnecting…` (down) | on `#connection-status` |
| Reset suffix | — | `^\(\d{2}:\d{2}\)$` same local day; `^\(\d{2}:\d{2} [A-Za-z]{2,}\.?\)$` other day | `.resets` inside `#usage-5h`, `#usage-7d`, `#usage-model-week`; absent when the bucket is unknown |
| Reset suffix hover | — | `title` non-empty and containing the `HH:MM` shown | REQ-12 |
| Masthead model readout | — | `#usage-model` has count 0 | REQ-1 |

### Invariants

- **INV-1 (dot agrees with banner):** at every render, `data-health` is `down` iff the connection
  is `reconnecting` and the banner shows the daemon-down (unreachable) text; `pending` iff the
  connection is `connecting`, or it is `reconnecting` while the update-restart override shows its
  updating text; `ok` iff `connected` (the post-update confirmation banner showing included).
  *Amended (decisions/connection-dot-red-during-update-confirmation, user decision, review cycle 1):*
  `reconnecting` while the neutral post-update confirmation still shows (≤ 3 s) is `down`; for
  that window the dot and the banner disagree (kb:adr/connection-dot-red-during-update-confirmation).
  Asserted from every source state: first load, connected, connected→down, update restart inside
  its window, update restart past the 30 s fallback, reconnect after each.
- **INV-2 (no model on the masthead or the wire):** in every usage state (null buckets, known
  buckets, modelScoped present / null / errored), `#usage-model` is absent and the `usage` object
  has no `model` key.

## Affected Files

### Daemon (daemon-impl)
- `internal/server/usagewire.go` — REQ-2: the wire usage object stops carrying the model.

### Web (web-impl)
- `web/index.html` — REQ-1: the masthead model readout goes. REQ-6/7: the health element's markup if it needs it.
- `web/src/protocol/usage.ts` — REQ-2: the usage decoder stops reading `model`.
- `web/src/features/usage.ts` — REQ-1: no model readout rendered.
- `web/src/render/masthead.ts` — REQ-1: model readout renderer gone; REQ-6–9: the health dot render; REQ-12: reset title.
- `web/src/sessions/format.ts` (rail-owned, touched only for the shared reset formatter) — REQ-4: the reset text format.
- `web/src/sessions/usage.ts` — REQ-4: the readout's reset text drops its `· ` prefix.
- `web/src/features/connection.ts` — REQ-6/INV-1: the health state follows the update-restart override as well as the connection status, re-evaluated per render tick.
- `web/src/style.css` — REQ-10: three health tokens in every theme block plus the dot rule; REQ-1: the `.model` masthead rule and its narrow-width elasticity go; REQ-11: the row still fits.
- `web/e2e/helpers/gauges.ts` — REQ-1: `mastheadModelReadout` is removed or repointed (helper code is e2e-specs' to edit; listed so ownership is clear: **e2e-specs**).

### Existing tests this breaks
- daemon-tests: `internal/server/state_test.go:32` and `:63` — the empty snapshot's `"model": null` key and `snap.Usage.Model`.
- daemon-tests: `internal/server/usagewire_test.go:36-41` — a model mapped onto the wire usage object.
- web-tests: `web/src/protocol/usage.test.ts:33-58` — `usage.model` parsing and rejection cases.
- web-tests: `web/src/render/masthead.test.ts:134` (`renderConnectionStatus` text) and `:491+` (`renderUsageModel`).
- web-tests: `web/src/sessions/format.test.ts:179-206` — `resets HH:MM` / `resets <weekday>`.
- web-tests: `web/src/sessions/usage.test.ts:36` — the `· ` prefix.
- e2e-specs: `web/e2e/gauges.spec.ts:185` (E5: model readout, `/resets/`) and `:274` (E7: masthead model readout).
- e2e-specs: `web/e2e/masthead-layout.spec.ts:15-24, 144-148, 149-208` — the dot-separated `resets HH:MM` suffix, `#usage-model` truncation.
- e2e-specs: `web/e2e/usage-model.spec.ts:64` — the dot-separated `resets` prefix.

## Edge Cases

1. Daemon restart: buckets null until the next status post → no reset text, `unknown` (unchanged) → E3.
2. A model-only change in the status line (same buckets, different model) records a history row and broadcasts a `usage` identical on the wire to the previous one apart from `sampledAt`; the masthead does not change → D2.
3. A 7-day window resetting on the same weekday next week renders `(HH:MM Ddd)` with today's weekday; only a same-calendar-day reset drops the weekday, so it is unambiguous → W2.
4. `resetsAt` just after local midnight with now just before it is another day and carries the weekday → W2 (shared with edge case 3).
5. `resetsAt` in the past (a stale sample) renders verbatim, self-correcting on the next sample (unchanged rule) → W2 (shared with edge case 3).
6. Model-week window stale or errored keeps its last-good bar and its reset text in the new format → E2.
7. Update restart that takes longer than the banner's 30 s window: the banner falls back to unreachable and the dot turns red → W4.
8. A protocol-mismatch hello: the fatal reload screen replaces the dashboard; the dot's state there is not asserted → untested: the mismatch screen covers the masthead.
9. The post-update `Updated to v…` confirmation (neutral banner) shows while connected → the dot is green → W4 (shared with edge case 7).
10. A hand restart or crash looks like a lost connection → red, never yellow → E5.
11. An older open tab across a daemon upgrade receives `usage` without `model`: its decoder treats the key as optional, so it renders nothing in `#usage-model`, with no mismatch screen → untested: a skewed client is the reload banner's job, and the field was already optional in the decoder.

## Acceptance Criteria

### Daemon
- **D1**: The `usage` object in `GET /api/state` and in every `usage` broadcast has no `model` key, with null buckets and with known buckets.
- **D2**: A status post that changes only the model still writes a `usage_sample` row carrying that model.
- **D3**: A sample is still not recorded from a status post lacking the model.

### Web
- **W1**: The usage decoder accepts a `usage` object with no `model` key and with a stray `model` key alike, and exposes no model.
- **W2**: The reset formatter returns `(HH:MM)` for the same local day and `(HH:MM Ddd)` otherwise, across midnight, next-week-same-weekday and past `resetsAt` inputs.
- **W3**: A known bucket's view model carries the bracketed reset with no `· ` prefix; an unknown one carries none.
- **W4**: The health derivation returns `ok`/`pending`/`down` per INV-1 for every combination of connection status (`connecting`, `connected`, `reconnecting`) and update-restart override (none, updating, fallback-unreachable, neutral confirmation).
- **W5**: The health title and screen-reader word for each health state match the Testable UI Elements table.
- **W6**: The three health tokens are declared in each of the three theme blocks of `web/src/style.css` (instrument, dark, light).

### E2E
- **E1**: With a status post carrying both buckets, `#usage-5h` and `#usage-7d` each show a `.resets` matching the same-day or other-day pattern.
- **E2**: With a model-scoped window, `#usage-model-week` shows a `.resets` in the bracketed format, still present while the window is marked stale.
- **E3**: After a fresh daemon start (no status post), no `.resets` exists in the masthead and the buckets read `unknown`.
- **E4**: `#usage-model` is absent before and after a status post carrying a model.
- **E5**: Connected, `#connection-status` has `data-health="ok"`, text `connected` and title `Connected to musterd`; after the daemon is killed it has `data-health="down"` with the daemon-down banner visible; after restart it returns to `ok`.
- **E6**: During an Update and restart, `#connection-status` has `data-health="pending"` and title `Restarting musterd for an update…` while the updating banner shows, then `ok` after the new hello.
- **E7**: At 1512px and 1440px viewports, all three readouts known with other-day resets and the model-week selector showing, the masthead is one row and no masthead readout's text wraps.
- **E8**: Each `.resets` has a non-empty `title` containing the `HH:MM` it shows.

### Automated Checks

```checks
D4 make build
D5 make lint
D6 make test
W7 make web-build
W8 make web-lint
W9 make web-test
E9 make e2e
X1 ! rg -n "usage-model\"|#usage-model([^-[:alnum:]_]|$)|renderUsageModel\b|mastheadModelReadout" web/src web/index.html web/e2e
X2 ! rg -n -F "· resets" web/src web/e2e
X4 ! rg -n -F 'resets ${' web/src
X3 make check-kb
```

X1, X2 and X4 include test files on purpose: no test should still reach for the removed readout or the old wording. X1's pattern does not match `#usage-model-week`, `renderUsageModelWeek` or `.usage-model-select`. *Amended (orchestrator, Step 1):* the approved pattern's `#usage-model\b` and bare `renderUsageModel` matched `#usage-model-week` and `renderUsageModelWeek` (measured: `echo '#usage-model-week' | rg -o '#usage-model\b'` prints `#usage-model`), so X1 could never pass; the corrected pattern restores the check's stated intent. *Amended (orchestrator, Step 2):* X4's double-quoted `"resets ${"` is a shell syntax error under the gate runner's `eval` (measured: `unexpected EOF while looking for matching`), so it is single-quoted.

### Reviewer-Verified

- **W10**: No `any` types in new or changed web code.
- **W11**: The dot's tokens sit outside the state hue families (§1 table) and the down colour reads as the same alarm as the daemon-down banner in each theme; the dot has ≥ 3:1 contrast against `--bg-raised` (non-text graphic). *Amended (decisions/connection-health-dot-hues-kept, user decision, review cycle 1):* the shipped hues stay; "same alarm" holds through the banner shown beside the dot (kb:adr/connection-health-dot-hues-kept).
- **W12**: The dot matches the mockup's `.health .dot` (6px, round) in all three themes, measured in the browser.
- **D7**: The Go aggregator and store keep reading and persisting the model (no history regression from the wire change).

## Doc Delta

**usage** (`docs/features/usage/spec.md`) — becomes true:
- The masthead shows a five-hour bar and a seven-day bar, each with a used percentage and its reset time: `(HH:MM)` when it falls today, `(HH:MM Ddd)` otherwise, with the full date on hover.
- The masthead shows no model; the model shows per session only (kb:adr/usage-masthead-shows-no-model). The status line's model is still recorded in usage history.
- The masthead holds one row at a 14" laptop width: nothing in it wraps and the bars narrow below 1840px (kb:adr/usage-masthead-narrow-width-shrinks-bars).

**usage** — stops being true:
- "The masthead shows the current model, a five-hour bar and a seven-day bar…" (the "current model" part).
- "The model shown is the freshest sample's (kb:adr/usage-masthead-model-from-freshest-sample)."
- "…and the model name truncates with its full name on hover (kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model)."

**connection** (`docs/features/connection/spec.md`) — becomes true:
- The status readout is a health dot with the state's word for screen readers and its detail on hover: yellow while connecting before the first hello and during the dashboard's own update restart, green when connected, red once the connection is lost; its colour agrees with the banner, except that a socket lost during the ≤ 3 s post-update confirmation is red beside the neutral banner (kb:adr/connection-health-dot, kb:adr/connection-dot-red-during-update-confirmation).

**connection** — stops being true:
- "A status readout reads connecting until the first hello, then connected; a socket lost after a hello reads reconnecting…" as visible text (reworded to the dot; the banner clause stays).

**protocol** (`docs/protocol.md`, `kb:anchor/ws.usage`) — merged at approval from the Protocol Contract above.

## Out of scope

- Nothing.

## Implementation Notes

**Hints (non-binding):**
- `formatResets` (`web/src/sessions/format.ts:81`) already does the same-day test; only its output changes. `buildUsageBucketViewModel` (`web/src/sessions/usage.ts:38`) adds the `· ` prefix.
- `renderUsageBucket` (`web/src/render/masthead.ts:61`) is the one renderer for all three readouts, so the model-week bar gets the new format for free.
- `deps.restartBanner(frame.now, frame.connection)` in `web/src/features/connection.ts:151` already gives, per render tick, whether the update override is showing and whether it is neutral or the updating text; the dot can follow the same per-tick phase so INV-1 holds by construction.
- `--green` values for the three themes are in the mockups (`a-instrument.html:64,103,142`); design-system §1 says `--green` is added with its first consumer. The developer chose dedicated health tokens, so those values are a starting point for the `ok` token.
- `.sr-only` exists at `web/src/style.css:1987`.
- Removing `.model` (the one elastic readout) leaves no truncating element. The row gets narrower overall (dot instead of `reconnecting…`, no model, brackets about as wide as the old `resets Tue` suffix), but E7 measures it rather than assuming so.

**Decisions** (written as `proposed` ADRs at approval):
- kb:adr/usage-masthead-shows-no-model — supersedes kb:adr/usage-masthead-model-from-freshest-sample (option A: model per session only; field dropped from the wire, history keeps it).
- kb:adr/usage-masthead-narrow-width-shrinks-bars — supersedes kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model (same no-wrap, 1840px, 40px-bar rule; no readout truncates now the model is gone).
- kb:adr/usage-reset-time-bracketed — reset suffix `(HH:MM)` today, `(HH:MM Ddd)` otherwise; full date on hover.
- kb:adr/connection-health-dot — the status readout is a dot with dedicated tokens; yellow covers first connect and the dashboard's own update restart only, because a manual restart is indistinguishable from a crash; the word stays as screen-reader text and the detail on hover.

**Doc upkeep (orchestrator):** design-system §1 (the `--green` note becomes the three health tokens), §5 Masthead (drop `model`, the truncation sentence, "daemon health" is the dot); tick #79, #80, #85 in `TODO.md` and move the group to `docs/history/todo-done.md`; `kb:diagram` none affected.
