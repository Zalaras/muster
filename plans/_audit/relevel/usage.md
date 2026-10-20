# Re-levelling batch: usage (cache-warmth, gauges, masthead-indicators, masthead-layout, usage-model)

Render spec `web/render/usage.spec.ts`, helper `web/render/helpers/usage.ts`; scenarios in
`internal/server/renderfix_scenarios_usage.go`. The DOM locators, the suffix and colour
oracles and the hover wording moved out of `web/e2e/helpers/{gauges,masthead,cache-warmth}.ts`
into the render helper, which those E2E helpers re-export (`gauges.ts` is now a re-export
alone). Counts are Playwright `--list` counts; 61 tests → 33 E2E, 28 render, 0 vitest.

**Time in a fixture.** The normaliser renumbers every wire timestamp — a cache's `expiresAt`
and a bucket's `resetsAt` among them — to the fixture epoch plus one minute per distinct
instant, in walk order (sessions by id, keys sorted), while `ttlSeconds` is kept. So a cache's
remaining lifetime at the epoch is its position in that walk, in minutes, and every reset
falls within the hour after the epoch. The render spec reads the remaining lifetime off the
fixture (`remainingAtEpoch`) and fixes the page clock (`pinClock`, the render-tier twin of the
E2E `useWarmthClock`: `page.clock.setFixedTime` over the harness's installed clock, since that
clock ticks in real time and a boundary claim is about one exact second) at the instants the
plan names — 586 and 585 s left, 60 and 59 s, past expiry — or a day away from the resets
for the other-day suffix. The scenarios place cache-less sessions first so the warm caches sit
far enough along the walk to be warm, not cooling, at load, and make a cache cold by giving
it the first-walked instant as its `expires_at` (`coldExpiresAt`, which the normaliser maps
onto the epoch itself).

## `cache-warmth.spec.ts` — 18 tests → 7 E2E, 11 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| an idle session's timer is tinted and hovers as warm, turns cooling with a dotted underline in the last 15% of its lifetime and plain cold past expiry as the page clock advances with no new post | REQ-24/25/27/28, E14 | **property** | the display for one cache as the pinned clock moves — `cache-warmth` (`bound-hour`) |
| the tint is a straight line from the bright foreground to the timer's usual grey over the lifetime, and an unknown or cold timer is that usual grey | REQ-24/26/28 | **property** | computed colours for a warm, an unknown and a cold cache — `cache-warmth` |
| the underline starts at exactly 15% of the lifetime remaining, a 5m-ttl post carrying requests (a 3900 s lifetime) at 585 s, and the hover counts whole minutes up while a minute or more remains and seconds below it | REQ-25/27 | **property** | boundaries of the display against a 3900 s and a 3600 s lifetime — `cache-warmth` (`bound-short`, `bound-hour`) |
| a session with no prompt_cache shows an unknown plain timer, a later post without one changes nothing, and /clear returns a warm session to unknown | REQ-21/22/26, E16 | journey | status posts and a /clear rebind change what the daemon holds |
| every state shows an unknown plain timer before a first reply and a tinted one once the cache is known, an ended card included | INV-2, REQ-24/26, E17 | **property** | a never-replied and a known-cache twin per state, ended included — `cache-warmth` |
| a Tiles strip card's timer carries the same warmth as its rail card | REQ-24 | **property** | the strip card's timer under the Tiles pref — `cache-warmth-strip` |
| the cache is kept by Stop and Resume, by liveness death and by a compaction, and the ended card keeps its tinted timer | REQ-22, INV-5 | journey | end, resume, pane kill, compaction hooks |
| a live session's warmth is the same after a daemon restart and after a dashboard reload, and the restarted daemon still reports the cache on the wire | REQ-22/32, E15 | journey | restart, reload |
| a changed cache is broadcast as exactly one session upsert and an unchanged or absent one as none | REQ-21/23 | journey | broadcast count |
| the timer keeps fading from the last-known expiry while the daemon is down | REQ-28 | journey | the daemon is killed |
| a card timer's cache hover opens within the popover delay and stays open, counting down, while a card above it changes height | REQ-1/2/3 | journey | hook posts change the upper card's height under the pointer |
| a group header shows one extra timer for the waiting member that entered its state last, hovering over the warm ones, and none for a section with no waiting member, collapsed or expanded | REQ-29/30, E18 | **property** | the header for given members; the collapsed half from the sibling fixture's snapshot — `cache-warmth-groups{,-collapsed}` |
| a header's hover reads every warm, all cold or unknown by the known warmth of its waiting members, and the timer is tinted as the card's is | REQ-30 | **property** | three groups' headers, then the clock moved — `cache-warmth-hover` |
| the header popover shows a state timer beside every session's title, carrying its warmth and the underline where it is known and no hover text of its own | REQ-31, E19 | **property** | the popover's rows for given members — `cache-warmth-hover` |
| a pointer that leaves a card timer inside the popover delay opens no panel, even though it stays on the card | REQ-1, edge 1 | **property** | pointer moves over a rendered card — `cache-warmth` |
| pressing on the card closes the open cache panel and it stays closed with the pointer still on the timer | REQ-2 | **property** | pointer down over a rendered card — `cache-warmth` |
| a Tiles strip card's timer opens the same cache panel on hover and closes it when the pointer leaves the card | REQ-1 | **property** | the strip card's panel under the Tiles pref — `cache-warmth-strip` |
| a cache panel opened while the daemon is down stays open, counting down, across reconnect attempts while the pointer stays on the card | REQ-2 | journey | the daemon is killed and the page reconnects |

Ported with these deliberate differences, noted so they are not mistaken for drift:

- The literal remaining times (`cold in 60m`, `65m`, `30m`, `15m`, `40m`) became the fixture's
  own (`warmHover(remaining)`); every boundary the plan names — 480 s left (13.3%, cooling,
  `cold in 8m`), 586 vs 585 s on 3900, 61/60/59 s on both lifetimes, 1 s, 0 s — is reached by
  pinning the clock exactly that far from the fixture's expiry, with the same literal text.
- The straight-line test read the tint at f = 1, 0.5 and 0.25 after a post that expired a
  whole hour out; a fixture cannot hold a cache with its full lifetime ahead (that would need
  sixty earlier instants in the walk), so the three points are the fixture's fraction, half of
  it and a quarter of it — still three colinear points on the `--fg-dim` → `--fg` line, plus
  the grey of the unknown and cold timers.
- E17 posted the caches mid-test and ended two sessions through `POST …/end`; the fixture
  holds the twin per state (the ended ones through the rig's `markDead`), so the test asserts
  both displays with no transition. The working card's tint is read at the fixture's fraction.
- The header hover test read `1 of 2 warm · next cold in 9m` 2500 s on; the fixture's warm
  pair is 13 and 16 minutes out, so the clock is moved to the first one's expiry and the
  wording is derived (`headerHover`) — the same `n of m warm · next cold in …` composition,
  `all 2 cold`, `cache unknown`.
- `pop-cooling` was a 300 s cache; the fixture gives it a day-long ttl (`24h`, carried as
  reported since it is over an hour) so it is inside its last 15% at load whatever minute the
  walk gives it.
- The pointer-leaves test scrolls its card into view first: it is the seventeenth card of the
  fixture, below the fold, and raw pointer moves do not scroll as a hover would.

## `gauges.spec.ts` — 14 tests → 9 E2E, 5 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a fresh session and a fresh daemon render every gauge as unknown with no track markup | E1 | **property** | the unknown display of a launched-only session and a null usage — `unbound-sessions` |
| a pre-first-response status post leaves the unknown rendering unchanged — null is not 0% | E2 | journey | the daemon's handling of a null percentage post |
| a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens | E3 | **property** | the row for a known context — `usage-known` |
| the same status data renders in the Tiles view's tile header | E4 | **property** | the tile header under the Tiles pref — `usage-known-tiles` |
| a full status post fills both masthead gauge bars with rounded percentages and bracketed reset suffixes, and shows no model readout | E5 | **property** | the masthead for known buckets — `usage-known` |
| two identical rapid status posts persist exactly one usage_sample row; a changed third posts a second | E6, INV-5 | journey | `usage_sample` rows |
| a status post's session name updates the card title and its model leaves the masthead without a model readout | E7 | journey | a status post changes the title |
| a status post sent while a session is needs_input leaves its state, stateSince, and attention untouched | E8, INV-1 | journey | daemon state invariants under a post |
| with two live sessions, a status post routed to one leaves the other's card and wire object unchanged while the masthead updates | E9, INV-4 | journey | routing of a post |
| /clear returns the context row to ctx unknown and resets the compaction counter | E10 | journey | the /clear rebind |
| after a daemon restart the masthead reads unknown until a fresh post, while the session card keeps its last-known context | E11 | journey | restart |
| a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket | E12 | **property** | the threshold classes for given values — `usage-hot` |
| a status line that changes a tile's context percent updates the header context info in place, so its track is the same element | focus-lands REQ-1 | journey | node identity across a post |
| a compaction counter appearing on a later render keeps the row correct on the rail card and the tile header, and a /clear then a fresh status line shows none | focus-lands REQ-1, edge 2 | journey | PreCompact, /clear and posts in sequence |

E3 and E4 read 42% / 84k after a post; the ported tests read the fixture's 38% (37.5 rounded)
and 75k. E5 read 45% / 10%; the fixture's buckets are 61% / 23%. E1 reads the masthead of
`unbound-sessions`, whose usage object is null as a fresh daemon's is.

## `masthead-indicators.spec.ts` — 14 tests → 9 E2E, 5 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| a same-day reset renders as (HH:MM) on both status-line buckets, with no resets word or separator | E1, REQ-4 | **property** | the suffix for resets within the hour of the pinned clock — `usage-known` |
| an other-day reset renders as (HH:MM Ddd), including just after local midnight and a week out on today's weekday | E1, REQ-4, edges 3–4 | **property** | the suffix with the clock pinned a week before the resets, in the UTC zone where the fixture's resets are minutes past midnight — `usage-known` |
| a stale resetsAt already in the past renders verbatim in the other-day form | REQ-4, edge 5 | **property** | the suffix with the clock pinned three days after the resets — `usage-known` |
| each reset suffix carries a title with the weekday, date and the HH:MM it shows | E8, REQ-12 | **property** | the suffix's hover for given resets — `usage-known` |
| a fresh daemon shows unknown buckets with no reset text, and a status post then brings the suffixes in | E3, REQ-5 | journey | the post brings the suffixes in (borderline, see below) |
| the masthead has no model readout before or after a status post carrying a model | E4, REQ-1, INV-2 | journey | a post carrying a model (borderline, see below) |
| the usage object carries no model key in the snapshot, in GET /api/state and in every usage message, with null and with known buckets | D1, REQ-2, INV-2 | journey | wire frames and the state endpoint |
| a status post changing only the model still records a usage_sample row with that model | D2, REQ-3 | journey | `usage_sample` rows |
| a status post changing only the model broadcasts a usage whose wire content equals the previous one | edge 2, REQ-2 | journey | broadcast content |
| connected, the dot reads ok with the connected word and title; a killed daemon turns it down with the banner; a restart turns it ok again | E5, REQ-6 to 9, INV-1 | journey | kill and restart |
| before the first hello the dot is pending with the connecting word and title and no banner, then ok once the hello lands | E5, REQ-6, INV-1 | journey | the hello is withheld; the render harness sends it at once |
| an update restart that outlasts the banner's 30 s window turns the dot from pending to red with the banner, and a reconnect returns it to ok | INV-1, edge 7 | journey | kill, restart, a hand-fed update frame |
| the dot's pending, ok and down colours are three distinct colours, none of them a state token | E5, REQ-10 | journey | pending needs the hello withheld and down a closed socket, neither of which the render harness can do |
| the connection readout is a status whose word is visually hidden, leaving only a dot-sized box | REQ-7 | **property** | the connected dot's box and title — `usage-known` |

Deliberate differences: the other-day test's "just after local midnight" instant was
tomorrow 00:01 posted from the runner's clock; the fixture's resets are 00:03 and 00:05 UTC,
so the test runs in the UTC zone (`test.use({ timezoneId: "UTC" })`) with the clock pinned a
week earlier and asserts `(00:0d Ddd)` with the reset's weekday, and the 7d suffix with the
pinned clock's own weekday. The title test read a same-day 5h and an other-day 7d; both
fixture resets are same-day under the default clock, and the title assertions (the clock,
the weekday, a date digit) are made on both.

## `masthead-layout.spec.ts` — 4 tests → 0 E2E, 4 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| at {1512,1440,1280}px with every gauge known, the model-week selector showing and other-day resets on all three bars, the masthead is one row with no wrapped text and no model readout (×3) | E7, REQ-11, #52 | **property** | layout at a width for a given usage object; the other-day suffix comes from pinning the clock a day before the resets — `usage-model` |
| at and below the 1840px tier the masthead gauge bars shrink to 40px, and above it they render at their full 96px width | #52 | **property** | the bar's computed width per tier — `usage-known` |

The file is deleted (every test moved); `docs/features/usage/spec.md`'s `e2e:` list and the
`tests:` pointer of kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model follow it
to the render spec. The width tests read the verified Claude Code version off the fixture's
hello (`claude 2.1.300`) where the E2E asked `observedVersionRange()`.

## `usage-model.spec.ts` — 11 tests → 8 E2E, 3 render

| Test | Criteria | Level | Reason |
|---|---|---|---|
| with the fake endpoint returning a Fable 61% window, the readout shows the select, percent, warn bar and resets suffix | E1 | journey | the poller's immediate on-Start fetch is the claim |
| before the first fetch completes, the readout reads unknown with a disabled single-option select and no track markup | E2 | **property** | the readout for a null `modelScoped` — `usage-known` |
| choosing a second model in the select re-renders to that model's percent and survives a reload | E3 | journey | the pref PUT and a reload |
| clicking Refresh usage causes a second request at the fake endpoint within 1s, and the button is aria-busy until the usage message lands | E4 | journey | the refresh request |
| the fake endpoint switched to 401 marks the readout stale while keeping the last-good percent, and a later 200 clears it | E5 | journey | poll failure and recovery |
| a daemon started with -usage-poll 0 shows unknown and 404s the refresh endpoint, never calling the fake endpoint | E6 | journey | daemon option |
| the daemon's captured log output never contains the usage token string, across a success and a failure poll | E7, INV-4 | journey | daemon log |
| a usageModel change in one window re-renders another window's readout via the prefs echo, seen from both Focus and Tiles | INV-6 | journey | two windows, the prefs broadcast |
| the model select keeps focus and the same node instance across a render tick | cycle 1 Critical 1 | **property** | focus and node identity across a tick for a given list — `usage-model` |
| a usageModel pref naming a model absent from a non-null list shows a disabled placeholder option instead of going blank | Minor 3 | **property** | the select for a pref the list lacks — `usage-model-absent` |
| a model dropped from the list and later restored becomes selectable again via real keyboard input | cycle 2 Major 1 | journey | the list changes through a refresh |

The Minor 3 test reached its state through `PUT /api/prefs` mid-test; the fixture holds the
pref (`withPrefs`, the real PUT at generation). The Critical 1 test read 61% for Fable; the
fixture's window is 15%.

## Scenarios added

| Scenario | Holds | Used by |
|---|---|---|
| `cache-warmth` | seven never-replied sessions, one per state (started, planning, working, needs input, failed, idle, ended), then their known-cache twins, then `fade-cold` (a one-hour cache expiring at the first-walked instant), `bound-short` (a 5m-ttl post with requests, so a 3900 s lifetime) and `bound-hour` (one hour) | the card-timer lifetime tests, E17, the two hover-panel pointer tests |
| `cache-warmth-strip` | five idle one-hour caches under `view: tiles` at 2×2, so one is a strip card | the strip card's warmth and its hover panel |
| `cache-warmth-groups`, `cache-warmth-groups-collapsed` | an ungrouped anchor; group `alpha` = n1 (needs input, unknown), i2 (idle, warm), i1 (idle, cold, entered its state last), w1 (working, warm), e1 (ended, warm); group `lonely` = one working session; the variant collapses both through the real PUT | the header's extra timer (E18) |
| `cache-warmth-hover` | groups `unknown` (three waiting members, no cache), `cold` (two cold), `warm` (two warm, the later-entered one picked), `Popover` (warm, cooling via a 24h ttl, working and started unknown) | the header hover wording and the popover's row timers |
| `usage-known-tiles` | `usage-known` under `view: tiles` | the tile header's context info |
| `usage-hot` | one session with a 61% context, a 61% five-hour bucket and a 23% seven-day bucket | E12 |
| `usage-model`, `usage-model-absent` | two weekly-scoped windows (Fable 15%, Opus 20%) recorded by one real poller tick against a local server serving `claudecodetest.UsageAPIBody`, the token read through the file seam; the five-hour bucket at 100%; the variant sets `usageModel: Sonnet` | the select's node identity, the placeholder option, the three masthead width tiers |

Rig helpers added in the scenario file: `postCache` (a full status line carrying a
`prompt_cache`), `coldExpiresAt` (the anchor session's created-at second), `bindPlanning`,
`bindWarm`, `driveStateTwins`. No existing scenario, fixture or rig file changed.

## Deleted Tests

| File | Test | Covered | Now lives in |
|---|---|---|---|
| `cache-warmth.spec.ts` | an idle session's timer is tinted and hovers as warm, turns cooling … (REQ-24, REQ-25, REQ-27, REQ-28, E14) | warm → cooling at 13.3% → cold, tint, underline, hover, no `title` | `web/render/usage.spec.ts`, same title |
| `cache-warmth.spec.ts` | the tint is a straight line … (REQ-24, REQ-26, REQ-28) | three tint points, unknown and cold at `--fg-dim` | same title |
| `cache-warmth.spec.ts` | the underline starts at exactly 15% … (REQ-25, REQ-27) | 586/585 s, 60/59/1/0 s on 3900; 61/60/59/0 s on 3600 | same title |
| `cache-warmth.spec.ts` | every state shows an unknown plain timer before a first reply and a tinted one once the cache is known, an ended card included (INV-2, REQ-24, REQ-26, E17) | unknown and warm per state, ended tinted, ended-unknown plain | same title |
| `cache-warmth.spec.ts` | a Tiles strip card's timer carries the same warmth as its rail card (REQ-24) | strip timer warm, hover, tint, cold later | same title |
| `cache-warmth.spec.ts` | a group header shows one extra timer … collapsed or expanded (REQ-29, REQ-30, E18) | the picked member, hover wording, grey, collapsed keeps it, no waiting member none | same title |
| `cache-warmth.spec.ts` | a header's hover reads every warm, all cold or unknown … (REQ-30) | the three wordings, tint, cooling after the clock moves | same title |
| `cache-warmth.spec.ts` | the header popover shows a state timer beside every session's title … (REQ-31, E19) | row timers' warmth, underline, no title, same text as the card | same title |
| `cache-warmth.spec.ts` | a pointer that leaves a card timer inside the popover delay opens no panel … (REQ-1, edge case 1) | no panel after the delay | same title |
| `cache-warmth.spec.ts` | pressing on the card closes the open cache panel … (REQ-2) | panel closes on pointerdown, stays closed | same title |
| `cache-warmth.spec.ts` | a Tiles strip card's timer opens the same cache panel on hover and closes it when the pointer leaves the card (REQ-1) | strip panel text, countdown, closes on leave | same title |
| `gauges.spec.ts` | a fresh session and a fresh daemon render every gauge as unknown with no track markup (E1) | `ctx unknown`, unknown buckets, no tracks | same title |
| `gauges.spec.ts` | a full status post renders the Focus rail card's context row with track, rounded percent, and compact tokens (E3) | percent, tokens, one track | same title |
| `gauges.spec.ts` | the same status data renders in the Tiles view's tile header (E4) | tile `.ctxinfo` percent, tokens, track | same title |
| `gauges.spec.ts` | a full status post fills both masthead gauge bars … no model readout (E5) | both buckets, suffix form, tracks, no `#usage-model` | same title |
| `gauges.spec.ts` | a status post at or above 60% renders the hot context track and the warn masthead bar, but not the untouched bucket (E12) | `.hot`, `.warn`, 7d unmarked | same title |
| `masthead-indicators.spec.ts` | a same-day reset renders as (HH:MM) on both status-line buckets, with no resets word or separator (E1, REQ-4) | `(HH:MM)` both buckets, no `resets`/`·` | same title |
| `masthead-indicators.spec.ts` | an other-day reset renders as (HH:MM Ddd), including just after local midnight and a week out on today's weekday (E1, REQ-4, edge cases 3-4) | `(HH:MM Ddd)`, minutes past midnight, a week out on today's weekday | same title (UTC describe block) |
| `masthead-indicators.spec.ts` | a stale resetsAt already in the past renders verbatim in the other-day form (REQ-4, edge case 5) | past reset, other-day form | same title |
| `masthead-indicators.spec.ts` | each reset suffix carries a title with the weekday, date and the HH:MM it shows (E8, REQ-12) | title has clock, weekday, date | same title |
| `masthead-indicators.spec.ts` | the connection readout is a status whose word is visually hidden, leaving only a dot-sized box (REQ-7) | role, ≤ 24 px box, title | same title |
| `masthead-layout.spec.ts` | at {1512,1440,1280}px with every gauge known … one row with no wrapped text and no model readout (E7, REQ-11, issue #52) ×3 | no overflow, dot on-screen and inside the padding box, eight single-line readouts, height equals the 2400 px height | same titles |
| `masthead-layout.spec.ts` | at and below the 1840px tier the masthead gauge bars shrink to 40px, and above it they render at their full 96px width (issue #52) | 40 px / 96 px | same title |
| `usage-model.spec.ts` | before the first fetch completes, the readout reads unknown with a disabled single-option select and no track markup (E2) | unknown, no track or suffix, disabled one-option select at the pref | same title |
| `usage-model.spec.ts` | the model select keeps focus and the same node instance across a render tick (Critical 1 regression) | focus and the tagged node survive 1.6 s of ticks, value intact | same title |
| `usage-model.spec.ts` | a usageModel pref naming a model absent from a non-null list shows a disabled placeholder option instead of going blank (Minor 3 fix) | unknown with no track, the disabled placeholder first, the list after | same title |

## Borderline, left in place

- `masthead-indicators.spec.ts` "a fresh daemon shows unknown buckets with no reset text, and a
  status post then brings the suffixes in" (E3): the first half is the `empty` fixture's
  masthead; the second half is the post. Kept whole as a journey.
- `masthead-indicators.spec.ts` "the masthead has no model readout before or after a status
  post carrying a model" (E4): both halves are properties (`empty`, `usage-known`), but the
  claim is that a post carrying a model changes nothing, which the daemon decides. Kept as a
  journey; gauges E5's render port already asserts the readout's absence with known buckets.
- `usage-model.spec.ts` E1: the readout's display for a known list is a property the
  `usage-model` fixture shows, but the test's claim is the poller's immediate on-Start fetch.
  Kept as a journey.

## Notes

- `pinClock` is `page.clock.setFixedTime` over the harness's installed clock. The harness
  pins the clock's start, not its flow: after `clock.install({ time })` the page clock ticks in
  real time, which is fine for elapsed text but not for a claim about one exact second. The
  E2E tier made the same choice (`useWarmthClock`); `settleFor` is still what advances timers
  for the stays-closed and render-tick checks.
- The dot's three colours (REQ-10) and the pending dot before the first hello cannot be
  rendered from a fixture: the harness sends `hello` on connect and exposes no way to withhold
  it or to close the socket. They stay E2E with a comment in the spec header.
- The other-day suffix is not a fixture property on its own — every normalised reset falls
  within the hour after the epoch — but it is a property of the page clock, which the render
  tier controls; pinning the clock a day away from the resets reproduces it in any zone (seven
  days for the same-weekday edge, and the UTC zone for the minutes-past-midnight edge).
- A fixture cannot hold a cache at the very start of its lifetime (f = 1): the remaining
  lifetime is the cache's position in the walk, in minutes, and the lifetime is at least an
  hour. The straight-line test's three points are therefore the fixture's fraction and its
  halves, as recorded above.
- `usage-known`'s own cache (`ttlSeconds: 3900`, expiring at the epoch) is cold at load; no
  test here reads it, and the fixture is unchanged.
- The `tests:` pointer of kb:adr/usage-masthead-narrow-width-shrinks-bars-truncates-model now
  names `web/render/usage.spec.ts`; its decision is untouched.
