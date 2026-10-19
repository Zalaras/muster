# E2E sweep time — where it goes, 2026-10-19

Follows `test-audit-2026-10-06.md` § "Where the time goes". The question this time: of a
full `make e2e`, how much is the harness floor every test pays (daemon, browser page,
session launches) and how much is the tests' own work — so that "fewer daemons", "fewer
tests", "more workers" and "shorter tests" can be compared by the seconds each returns.

## Method

- One full sweep at `0e547a30`, nothing else running (exclusive gate lock), Playwright's
  JSON reporter for per-test durations, `/usr/bin/time -l` for the process tree's CPU, a
  2 s `ps` sampler for machine-wide load. Duration per test includes its fixtures.
- A throwaway benchmark spec (not committed) run 12× per test at the same 4 workers under
  the lock, each test adding one cost on top of the previous: the `daemon` fixture alone;
  plus `page.goto` to a rendered rail; plus 1, 2 and 4 session launches until the last
  card is visible. `ScratchDaemon.startupMs` and `Date.now()` around the launch POST were
  attached as annotations.

## The sweep

| Measure | Value |
|---|---|
| Tests | 1,001, all passed |
| Wall | 523 s (8.7 min) at 4 workers |
| Worker-seconds | 2,010 — workers 96% busy, so wall ≈ worker-seconds ÷ 4 |
| CPU | 1,372 s user + 654 s sys ≈ 3.9 cores average over the process tree; peak ~6.3 of 12 |
| Per test | median 1.34 s, mean 2.01 s, p90 3.5 s, p99 13 s, max 19.7 s |

| Duration bucket | Tests | Worker-seconds | Share |
|---|---|---|---|
| under 1 s | 264 | 180 | 9% |
| 1–2 s | 479 | 670 | 33% |
| 2–3 s | 135 | 317 | 16% |
| 3–5 s | 50 | 191 | 10% |
| 5–10 s | 44 | 275 | 14% |
| 10 s and over | 29 | 377 | 19% |

The slowest 100 tests are 38% of the time, the slowest 200 are 52%: the same flat shape as
on 2026-10-06, now with a heavier tail.

| File | Tests | Total s | Median s |
|---|---|---|---|
| `focus-header.spec.ts` | 35 | 246 | 3.9 |
| `update.spec.ts` | 28 | 186 | 5.1 |
| `card-location.spec.ts` | 88 | 162 | 1.4 |
| `reader-search.spec.ts` | 50 | 148 | 1.9 |
| `reader.spec.ts` | 60 | 93 | 1.3 |
| `shell-activity.spec.ts` | 12 | 80 | 5.7 |
| `groups.spec.ts` | 46 | 77 | 1.4 |
| `added-dirs.spec.ts` | 26 | 65 | 2.1 |
| `cache-warmth.spec.ts` | 18 | 56 | 2.6 |
| `effort-header.spec.ts` | 41 | 54 | 1.1 |

The tail is deliberate test design, not slow code: six `focus-header` window sweeps in
16 px steps from 2000 px to 600 px at 12–17 s each; seven `update` restart flows at 13–20 s
(a real daemon restart and page reload each); one 18 s reduced-motion spinner wait in
`shell-activity`; one 17 s restart in `masthead-update-dot`.

## The floor a test pays before it asserts anything

Benchmark medians, 12 repeats each, 4 workers:

| Step | Median | Added by the step |
|---|---|---|
| `daemon` fixture alone (start to `/healthz` 0.17 s + teardown) | 0.26 s | 0.26 s |
| plus browser page and `goto` until `#sessions` is attached (`goto` itself 0.22 s) | 0.74 s | 0.48 s |
| plus one launch, card visible | 1.26 s | 0.52 s |
| plus two launches | 1.34 s | 0.08 s |
| plus four launches | 1.73 s | 0.39 s |

A launch POST on a fresh daemon returns in 0.47 s; later launches on the same daemon in
0.16–0.32 s; the rail card appears 15–60 ms after the POST returns. The first-launch premium
is consistent with the per-socket tmux server starting on first use, but that is not
measured — one more benchmark with the server pre-started would settle it.

**The suite's median test (1.34 s) is the floor for "daemon + page + one or two launches".**
The median test is about nine parts harness to one part assertion. The 743 tests under 2 s
are 42% of all worker-seconds and are almost entirely this floor.

## What each lever returns

Wall ≈ worker-seconds ÷ 4 at today's utilisation, so 4 worker-seconds saved is 1 s of wall.

| Lever | Worker-seconds | Wall | Cost |
|---|---|---|---|
| Move the floor-bound files to Vitest: `card-location`, `reader-search`, `reader`, `effort-header` (their bodies are small; the time is the floor) | ~457 | ~115 s | test rewrites per file; reopens the testing bar (kb:adr/process-testing-bar-e2e-always-unit-for-logic) |
| More workers: 3.9 cores busy of 6 physical, headroom to the 6.3 peak | — | 20–33% | an ADR superseding kb:adr/process-e2e-one-load-policy, proven by soaked green runs — the September flakes were at 6 workers on 5 s expect timeouts, now 15 s |
| Pre-start the tmux server in the fixture (if the first-launch premium is the server start) | ~175 | ~45 s | one harness change; one benchmark to confirm the cause first |
| Coarser `focus-header` sweep steps (64 px for 16 px) | ~70 | ~18 s | six tests edited; weaker invariant resolution |
| One daemon per file everywhere (saves the 0.26 s fixture, never the page or launches) | ≤ 260 | ≤ 65 s | ~50 files whose assertions need an empty daemon (kb:adr/process-e2e-explicit-fixtures) |

Sharing daemons is the smallest return for the largest rewrite. Removing a test removes its
whole floor; sharing its daemon removes a quarter of it. The gate scoping landed the same
day (kb:adr/process-e2e-gates-scoped-full-sweep-once-at-completion) changes how often the
sweep runs, not any number above.

## Caveats

- The `ps` sampler read 2.9 cores mean against the process tree's 3.9: `ps %cpu` undercounts
  processes that live about a second (each scratch daemon). The rusage figure is the one to use.
- The benchmark's five tests also ran once inside the sweep (a title filter that did not
  match), about 5 s of the 2,010.
- Durations include fixture setup and teardown; that is the point, since the fixture is
  the floor being measured.
