# Browser review: Masthead indicators

**Plan**: masthead-indicators
**Verdict**: approved
**Cycle**: 2
**Pack**: kb: pack 8317 words (budget 30000)
**Rig**: `make web-build build` at 2c3efbd3 (`bin/musterd` v0.20.2-48-g2c3efbd3, clean tree). The scratch daemon came from the committed `daemon` fixture (`helpers/fixtures.ts`), with a space-bearing data dir `$TMPDIR/muster e2e-*`, a private `-tmux-socket` inside it, and the shared stub `claude` from `helpers/daemon.ts`. The run was one throwaway test in headless Chromium, in the foreground (passed in 31.6 s, run twice). The spec is deleted and fixture teardown killed the daemon and its tmux server. `git status --porcelain` shows nothing of mine; the two untracked files are the other reviewers' parts.

Gates log (cycle 2): 0 failed lines. `16-e2e`: 737 passed. `04-web-build` is green. `07-contrast`: 46 pairs, 0 failures in each theme. So the app I drove is the one that ships.

**What changed since cycle 1.** `git diff --stat 2e678971..HEAD` outside `plans/` and `docs/` touches only `web/src/features/CLAUDE.md` (it adds `connectionhealth.ts` to a list), `.claude/rules/connection.md` (generated) and `internal/server/usagebroadcast_test.go`. No shipped source changed, so the dashboard and daemon are the cycle-1 artifact. I re-drove the core cells against a fresh build anyway. The cells I did not re-drive are listed under Notes with the cycle-1 evidence they rest on.

## Matrix

Hosts: the masthead is page chrome shared by **Focus** and **Tiles**. The pop-out (`/doc.html`) has no masthead and no `#connection-status`, so every pop-out cell is `N/A — no masthead in /doc.html`. I list that once here instead of on each row.

States: **pending** (WebSocket held by `routeWebSocket` so no hello arrives; measured 2.5 s after load), **no data** (connected, no status post), **data** (a real `statusLineFull` POST to `/ingest/<token>/status`), **down** (scratch daemon SIGTERMed via `daemon.kill()`), **reconnect** (`daemon.restart()`).

Every value is a computed style or a `getBoundingClientRect()` read at least 1.2 s after the event (2.5 s after a kill), which is at least one render tick past it.

| Req | Host | State | Claim | Result | Evidence |
|-----|------|-------|-------|--------|----------|
| REQ-1 / INV-2 | focus | pending / no data / data / down / reconnect | `#usage-model` absent | pass | `querySelectorAll('#usage-model').length` = 0 in all 8 Focus snapshots |
| REQ-1 / INV-2 | tiles | no data / data / down / reconnect | `#usage-model` absent | pass | count 0 in all 5 Tiles snapshots |
| REQ-2 / INV-2 | — | data | wire `usage` has no `model` | pass | `GET /api/state` `usage` keys: fiveHour, sevenDay, sampledAt, source, modelScoped, modelScopedAt, modelScopedError, modelScopedSource |
| REQ-3 | — | — | history unchanged | N/A — not visible in the UI. This is daemon history (review-work) | |
| REQ-4 | focus | data | same-day `(HH:MM)` | pass | 5h `.resets` = `(19:05)`; oracle `new Date(resetsAt)` = Mon Oct 12 19:05:12 local (today) |
| REQ-4 | focus | data | other-day `(HH:MM Ddd)` | pass | 7d `.resets` = `(15:59 Wed)`; oracle Wed Oct 14 15:59 local |
| REQ-4 | tiles | data | same / other day | pass | identical texts in Tiles at 1512 and 1440 |
| REQ-4 | focus, tiles | data | no `resets` word or `·` | pass | readout texts `5h61%(19:05)`, `7d23%(15:59Wed)` |
| REQ-4 | focus, tiles | data | visible | pass | `.resets` display block, visibility visible, opacity 1 |
| REQ-4 | focus, tiles | data (model-week) | model-week bracketed | not re-driven (note 1) | cycle 1: `(20:08 Wed)` against the fake API's `resetsAt` |
| REQ-4 | tiles | down | gauges keep values and resets | pass | down-tiles at 1440 and 1512: `61%(19:05)`, `23%(15:59 Wed)`, bars 1 each |
| REQ-5 / §6.1 | focus, tiles | pending / no data | unknown shown as a word, with no track and no reset | pass | `5hunknown`, `7dunknown`, `Fableunknown`; `.bar` count 0; `.resets` absent |
| REQ-5 / edge 1 | focus, tiles | reconnect (daemon restart) | buckets back to unknown | pass | after `daemon.restart()`: all three `unknown`, bars 0, no `.resets` |
| REQ-6 / REQ-9 | focus | pending (first connect) | `data-health=pending`, yellow | pass | `pending`, `::before` bg rgb(227,198,74), banner `display:none` with `hidden` set |
| REQ-6 / REQ-9 | focus, tiles | no data / data | `ok`, green | pass | `ok`, rgb(123,196,127) (Instrument theme) |
| REQ-6 / REQ-9 / §6.7 | focus | down | `down`, red-orange, banner showing | pass | `down`, rgb(238,106,50); `role=alert` banner `display:block`, `hidden=false`, box 0,46–1512,78 (full width under the 46 px masthead), text `musterd unreachable — …` |
| REQ-6 / REQ-9 / §6.7 | tiles | down | `down` plus banner | pass | `down`, rgb(238,106,50); banner block 0,46–1440,78 at 1440 and 0,46–1512,78 at 1512 |
| REQ-6 | focus, tiles | reconnect | back to `ok` | pass | `ok`, title `Connected to musterd`, banner `display:none` |
| Hidden | focus, tiles | pending / no data / data / reconnect | hidden banner not drawn | pass | banner `[hidden]`, computed `display:none`, box 0×0 |
| INV-1 | focus, tiles | pending / ok / down / reconnect | dot agrees with banner | pass | `down` iff the banner is shown with the unreachable text, in all 13 snapshots |
| INV-1 / edges 7, 9, 10 / E6 | focus | update (restart in window, past the 30 s fallback, confirmation) | pending, then down; ok beside the confirmation | not re-driven (note 1) | cycle 1: per-mutation recorder, no INV-1 violation |
| REQ-7 | focus, tiles | all | `role=status`, word visually hidden | pass | `role="status"`; text `connecting…` / `connected` / `reconnecting…` per state; host 14×14 |
| REQ-7 | tiles | data | no re-announcement on every tick | pass | MutationObserver on `#connection-status` over 3.2 s while connected: 0 mutations |
| REQ-8 | focus, tiles | pending / ok / down | titles exactly as in the table | pass | `Connecting to musterd…`, `Connected to musterd`, `musterd unreachable — reconnecting…` |
| REQ-8 | focus | update | `Restarting musterd for an update…` | not re-driven (note 1) | cycle 1 |
| REQ-10 / W11 | focus, tiles | all × theme | `--health-*` tokens, ≥ 3:1 contrast | pass | computed colours above match cycle 1's token values. Gate `07-contrast`: 0 failures in each theme. Hue question settled by kb:adr/connection-health-dot-hues-kept (Option A) |
| W12 | focus, tiles | all | 6 px round dot | pass | `::before` 6px × 6px, `border-radius: 50%`; host box 1482,16–1496,30 at 1512 |
| REQ-11 | focus, tiles | data (both buckets known, other-day 7d reset, model-week selector showing) | one row, no wrap at 1512 | pass | masthead 0,0–1512,46; `.masthead-right` 739,10–1496,35 (r ≤ 1512 − 16); scrollWidth 757 = clientWidth 757; document scrollWidth 1512 = viewport |
| REQ-11 | focus, tiles | data | one row, no wrap at 1440 | pass | masthead h 46; right 667–1424; sw = cw = 757; doc 1440 = viewport |
| REQ-11 | focus | data | (beyond the plan) 1280 | pass | masthead h 46; right 507–1264; sw = cw = 757 |
| REQ-11 | tiles | down @1440 | row holds with the banner | pass | masthead h 46; banner is a separate row at 46–78 |
| REQ-11 | focus, tiles | data, all three gauges known | one row with model-week known | not re-driven (note 1) | cycle 1: h 46 at 1512 / 1440 / 1366 / 1280 |
| REQ-12 | focus, tiles | data | reset `title` with the full date and the `HH:MM` shown | pass | `Resets Mon, Oct 12, 19:05` / `Resets Wed, Oct 14, 15:59` |
| Edge 2 | — | — | a model-only change leaves the masthead unchanged | N/A — the masthead has no model left to change; daemon-side D2 is review-work's | |
| Edge 8 | — | — | protocol-mismatch screen | N/A — plan: the mismatch screen covers the masthead, not asserted | |
| Edge 11 | — | — | old tab without `model` | N/A — plan: a version-skewed client is the reload banner's job | |
| §7 terminal rules | focus, tiles | data | one live client, scrollback 0 | N/A — this plan touches no terminal surface; e2e 737/737 green, including the surfaces specs | |

## Issues

### Critical

None.

### Major

None.

### Minor

None.

### Notes

1. **[note]** Not re-driven this cycle: the model-week readout with data (it needs `startDaemon` with a fake usage API), the real update and restart path (inside the window, past the 30 s fallback, and the post-restart confirmation), and the stale model-week readout. The shipped source is byte-identical to the cycle-1 artifact: the only changes outside `plans/`/`docs/` are a `CLAUDE.md` list entry, a generated rule file and a Go test. So those cycle-1 measurements still describe this build. They are also covered by the cycle-2 gate's green `masthead-update-dot`, `masthead-layout` and `usage-model` specs. The amended INV-1 (the dot is `down` while `reconnecting` during the ≤ 3 s confirmation, kb:adr/connection-dot-red-during-update-confirmation) is a change to the plan, not to the code, so it is not a regression cell.
2. **[note]** Cycle-1 decision 1 (dot hues) is settled as Option A, keep as shipped (kb:adr/connection-health-dot-hues-kept). I measured the same colours (ok rgb(123,196,127), pending rgb(227,198,74), down rgb(238,106,50) in Instrument) and do not raise it again.
3. **[note]** Carried from cycle 1 with no change requested: the reset `title` shadows a stale model-week readout's error `title` on the suffix only; the health `title` is reachable by pointer only (`#connection-status` is not focusable); native tooltips do not render headless, so the hover claims are measured on the `title` attribute.
